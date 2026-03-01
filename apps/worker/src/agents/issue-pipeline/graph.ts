/**
 * Issue Pipeline graph definition and container lifecycle helpers.
 * Container setup/teardown happens outside the graph; the graph only contains pipeline logic.
 */

import { StateGraph, END, START } from "@langchain/langgraph";
import { IssuePipelineState } from "@langgraph-fix-issues-pipeline/shared/server";
import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";
import type Docker from "dockerode";
import type { TDatabase } from "@langgraph-fix-issues-pipeline/shared/db";
import {
  createDockerClient,
  buildImage,
  getImageName,
  getContainer,
  execInContainer,
} from "../../docker/index.js";
import { createFormatInputNode } from "./format-input-node.js";
import { createIssueIntakeNode } from "./issue-intake-node.js";
import { createPlanNode } from "./plan-node.js";
import { createCoderNode } from "./coder-node.js";
import { createReviewNode } from "./review-node.js";
import { createIntegratorNode } from "./integrator-node.js";
import { createLogAndNotifyNode } from "./log-and-notify-node.js";
import {
  REVIEW_MAX_ATTEMPTS,
  COTAINER_CREATION_MAX_ATTEMPTS,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_BASE_BRANCH,
  ISSUE_INTAKE_MAX_ATTEMPTS,
  ISSUE_NODES,
} from "./constants.js";
import { logger } from "./logger.js";

/**
 * Creates a Docker container, starts it, and clones a repo into it.
 * Retries up to COTAINER_CREATION_MAX_ATTEMPTS times on failure.
 */
export const prepareContainer = async () => {
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const anthropicModel = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  const baseBranch = process.env.BASE_BRANCH || DEFAULT_BASE_BRANCH;

  if (!anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set in the environment variables",
    );
  }

  if (!githubToken) {
    throw new Error("GITHUB_TOKEN is not set in the environment variables");
  }

  if (!githubRepo) {
    throw new Error("GITHUB_REPO is not set in the environment variables");
  }

  const PROTECTED_BRANCHES = ["main", "master"];
  if (PROTECTED_BRANCHES.includes(baseBranch)) {
    throw new Error(
      `BASE_BRANCH="${baseBranch}" is prohibited — the pipeline must not operate on production branches (main/master). Set BASE_BRANCH to a development branch (e.g. "devel").`,
    );
  }

  const docker = createDockerClient();
  await buildImage(docker);

  for (let attempt = 1; attempt <= COTAINER_CREATION_MAX_ATTEMPTS; attempt++) {
    let containerId = "";
    try {
      const name = `claude-runner-${Date.now()}`;

      const env = [
        `ANTHROPIC_API_KEY=${anthropicApiKey}`,
        `ANTHROPIC_MODEL=${anthropicModel}`,
      ];

      const container = await docker.createContainer({
        name,
        Image: getImageName(),
        Cmd: ["sleep", "infinity"],
        Env: env,
      });
      await container.start();
      containerId = container.id;
      logger.log("container", `Started: ${containerId}`);

      const lsRemoteOutput = await execInContainer(docker, containerId, [
        "git",
        "ls-remote",
        "--heads",
        `https://x-access-token:${githubToken}@github.com/${githubRepo}.git`,
        baseBranch,
      ]);
      if (!lsRemoteOutput.trim()) {
        throw new Error(
          `BASE_BRANCH="${baseBranch}" does not exist on remote "${githubRepo}". Verify the branch name and try again.`,
        );
      }

      await execInContainer(docker, containerId, [
        "git",
        "clone",
        "--single-branch",
        "-b",
        baseBranch,
        `https://x-access-token:${githubToken}@github.com/${githubRepo}.git`,
        "/workspace/repo",
      ]);
      logger.log("container", `Repository cloned (branch: ${baseBranch})`);

      const info = await container.inspect();
      if (!info.State.Running) {
        throw new Error("Container not running after clone");
      }
      await execInContainer(docker, containerId, [
        "test",
        "-d",
        "/workspace/repo/.git",
      ]);

      // Write .mcp.json for GitHub MCP server
      const mcpConfig = JSON.stringify({
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
              GITHUB_PERSONAL_ACCESS_TOKEN: githubToken,
            },
          },
        },
      });
      const escapedMcpConfig = mcpConfig.replace(/'/g, "'\\''");
      await execInContainer(docker, containerId, [
        "sh",
        "-c",
        `echo '${escapedMcpConfig}' > /workspace/.mcp.json`,
      ]);

      return { docker, containerId, baseBranch };
    } catch (error) {
      logger.error("container", `Preparation failed (attempt ${attempt}/${COTAINER_CREATION_MAX_ATTEMPTS})`, error);
      if (containerId) {
        await cleanupContainer(docker, containerId);
      }
      if (attempt === COTAINER_CREATION_MAX_ATTEMPTS) {
        throw new Error(
          `Failed to prepare container after ${COTAINER_CREATION_MAX_ATTEMPTS} attempts`,
        );
      }
    }
  }

  throw new Error("Failed to prepare container");
};

/**
 * Stops and removes a Docker container.
 */
export const cleanupContainer = async (docker: Docker, containerId: string) => {
  const container = getContainer(docker, containerId);
  try {
    await container.stop();
  } catch {
    // Container may already be stopped
    logger.log("container", `Already stopped: ${containerId}`);
  }
  try {
    await container.remove();
  } catch {
    // Container may already be removed
    logger.log("container", `Already removed: ${containerId}`);
  }
  logger.log("container", `Cleaned up: ${containerId}`);
};

const routeAfterFormatInput = (state: TIssuePipelineGraphState) => {
  if (state.result.errors.length > 0) {
    return ISSUE_NODES.LOG_AND_NOTIFY;
  }
  return ISSUE_NODES.ISSUE_INTAKE;
};

const routeAfterIssueIntake = (state: TIssuePipelineGraphState) => {
  if (state.issue?.title !== undefined) {
    return ISSUE_NODES.PLAN_GENERATION;
  }
  if (state.issueIntakeAttempts < ISSUE_INTAKE_MAX_ATTEMPTS) {
    return ISSUE_NODES.ISSUE_INTAKE;
  }
  return ISSUE_NODES.LOG_AND_NOTIFY;
};

const routeAfterPlanGeneration = (state: TIssuePipelineGraphState) => {
  if (state.result.errors.length > 0) {
    return ISSUE_NODES.LOG_AND_NOTIFY;
  }
  return ISSUE_NODES.CODE_IMPLEMENTATION;
};

const routeAfterCodeImplementation = (state: TIssuePipelineGraphState) => {
  if (state.result.errors.length > 0) {
    return ISSUE_NODES.LOG_AND_NOTIFY;
  }
  return ISSUE_NODES.CODE_REVIEW;
};

const routeAfterCodeReview = (state: TIssuePipelineGraphState) => {
  if (state.result.errors.length > 0) {
    return ISSUE_NODES.LOG_AND_NOTIFY;
  }
  if (state.reviewResult?.approved) {
    return ISSUE_NODES.INTEGRATE;
  }
  if (state.reviewAttempts < REVIEW_MAX_ATTEMPTS) {
    return ISSUE_NODES.CODE_IMPLEMENTATION;
  }
  return ISSUE_NODES.LOG_AND_NOTIFY;
};

/**
 * Prepares the container, builds the issue pipeline graph, and returns
 * the compiled runner along with cleanup handles.
 */
export const setupIssuePipelineGraph = async (db: TDatabase | null = null) => {
  const { docker, containerId, baseBranch } = await prepareContainer();

  const graph = new StateGraph(IssuePipelineState)
    .addNode(ISSUE_NODES.FORMAT_INPUT, createFormatInputNode())
    .addNode(ISSUE_NODES.ISSUE_INTAKE, createIssueIntakeNode(docker, containerId))
    .addNode(ISSUE_NODES.PLAN_GENERATION, createPlanNode(docker, containerId))
    .addNode(ISSUE_NODES.CODE_IMPLEMENTATION, createCoderNode(docker, containerId))
    .addNode(ISSUE_NODES.CODE_REVIEW, createReviewNode(docker, containerId))
    .addNode(ISSUE_NODES.INTEGRATE, createIntegratorNode(docker, containerId))
    .addNode(ISSUE_NODES.LOG_AND_NOTIFY, createLogAndNotifyNode(db))
    .addEdge(START, ISSUE_NODES.FORMAT_INPUT)
    .addConditionalEdges(ISSUE_NODES.FORMAT_INPUT, routeAfterFormatInput)
    .addConditionalEdges(ISSUE_NODES.ISSUE_INTAKE, routeAfterIssueIntake)
    .addConditionalEdges(ISSUE_NODES.PLAN_GENERATION, routeAfterPlanGeneration)
    .addConditionalEdges(ISSUE_NODES.CODE_IMPLEMENTATION, routeAfterCodeImplementation)
    .addConditionalEdges(ISSUE_NODES.CODE_REVIEW, routeAfterCodeReview)
    .addEdge(ISSUE_NODES.INTEGRATE, ISSUE_NODES.LOG_AND_NOTIFY)
    .addEdge(ISSUE_NODES.LOG_AND_NOTIFY, END);

  const compiled = graph.compile();

  const runCompiledGraph = (input: { inputText: string; issueId?: number | null }) =>
    compiled.invoke({ ...input, baseBranch });

  return { runCompiledGraph, docker, containerId };
};
