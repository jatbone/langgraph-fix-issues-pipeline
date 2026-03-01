/**
 * Worker entry point — polling loop that claims issues from SQLite,
 * runs the pipeline per issue, and updates DB status on completion.
 */

import "dotenv/config";
import {
  setupIssuePipelineGraph,
  cleanupContainer,
} from "./agents/issue-pipeline/index.js";
import { openDatabase, verifyDatabase, claimNextIssue, markFailed } from "./db/index.js";
import type Dockerode from "dockerode";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 10_000;
const PIPELINE_TIMEOUT_MS = Number(process.env.PIPELINE_TIMEOUT_MS) || 600_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO;

  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in the environment variables");
  }
  if (!githubRepo) {
    throw new Error("GITHUB_REPO is not set in the environment variables");
  }
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN is not set in the environment variables");
  }

  const db = openDatabase();
  verifyDatabase(db);

  let shutdownRequested = false;

  const onSignal = () => {
    console.log("\nShutdown requested — finishing current iteration…");
    shutdownRequested = true;
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  console.log("Worker started — polling for issues…");

  while (!shutdownRequested) {
    const issue = claimNextIssue(db);

    if (!issue) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    console.log(`Claimed issue #${issue.id}: ${issue.title}`);

    let docker: Dockerode | undefined;
    let containerId: string | undefined;

    try {
      const {
        runCompiledGraph,
        docker: newDocker,
        containerId: newContainerId,
      } = await setupIssuePipelineGraph(db);
      docker = newDocker;
      containerId = newContainerId;

      const pipelinePromise = runCompiledGraph({
        inputText: `${issue.title}\n\n${issue.body}`,
        issueId: issue.id,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Pipeline timed out")),
          PIPELINE_TIMEOUT_MS,
        );
      });

      await Promise.race([pipelinePromise, timeoutPromise]);

      console.log(`Pipeline completed for issue #${issue.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Pipeline failed for issue #${issue.id}: ${message}`);
      markFailed(db, issue.id, message);
    } finally {
      if (docker && containerId) {
        await cleanupContainer(docker, containerId);
      }
    }

    if (!shutdownRequested) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  db.close();
  console.log("Worker shut down gracefully.");
};

main().catch(console.error);
