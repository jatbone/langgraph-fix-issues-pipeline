/**
 * Node factory functions for the issue pipeline.
 */

import { ChatAnthropic } from "@langchain/anthropic";
import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";
import { z } from "zod";
import { buildImage, getImageName, getContainer, getDockerClient } from "../../docker/index.js";
import { ISSUE_NODES, MAX_CONTAINER_CREATE_RETRIES } from "./constants.js";

/**
 * Creates a Docker container and starts it with sleep infinity.
 */
export const createCreateContainerNode = () => {
  return async (state: TIssuePipelineGraphState) => {
    try {
      await buildImage();

      const docker = getDockerClient();
      const name = `claude-runner-${Date.now()}`;
      const container = await docker.createContainer({
        name,
        Image: getImageName(),
        Cmd: ["sleep", "infinity"],
      });

      await container.start();
      console.log(`Container started: ${container.id}`);

      return { containerId: container.id };
    } catch (error) {
      console.error(`Container creation failed (attempt ${state.containerCreateRetries + 1}):`, error);
      return { containerId: "", containerCreateRetries: state.containerCreateRetries + 1 };
    }
  };
};

/**
 * Routing function for conditional edge after create_container.
 * Routes to issue intake node on success, retries on failure, or skips to cleanup.
 */
export const verifyContainer = (state: TIssuePipelineGraphState): string => {
  if (state.containerId) {
    return ISSUE_NODES.ISSUE_INTAKE;
  }

  if (state.containerCreateRetries < MAX_CONTAINER_CREATE_RETRIES) {
    return ISSUE_NODES.CREATE_CONTAINER;
  }

  return ISSUE_NODES.CLEANUP_CONTAINER;
};

/**
 * Stops and removes the Docker container.
 */
export const createCleanupContainerNode = () => {
  return async (state: TIssuePipelineGraphState) => {
    const container = getContainer(state.containerId);

    try {
      await container.stop();
    } catch {
      // Container may already be stopped
    }

    try {
      await container.remove();
    } catch {
      // Container may already be removed
    }

    console.log(`Container cleaned up: ${state.containerId}`);

    return { containerId: "" };
  };
};

const issueIntakeSchema = z.object({
  title: z.string(),
  requirements: z.array(z.string()),
  ambiguities: z.array(z.string()),
  complexity: z.enum(["low", "medium", "high"]),
});

/**
 * Issue Intake node — analyzes an issue and returns structured intake data.
 */
export const createIssueIntakeNode = () => {
  return async (state: TIssuePipelineGraphState) => {
    const model = new ChatAnthropic({
      model: "claude-haiku-4-5-20251001",
      temperature: 0,
    });

    const structuredModel = model.withStructuredOutput(issueIntakeSchema);

    const response = await structuredModel.invoke([
      {
        role: "system",
        content: `You are an issue intake analyst. Given a raw issue description, analyze it and produce a structured intake report:
- title: a concise title summarizing the issue
- requirements: a list of concrete, actionable requirements extracted from the issue
- ambiguities: a list of unclear or underspecified aspects that need clarification
- complexity: classify as "low", "medium", or "high" based on scope, dependencies, and uncertainty`,
      },
      {
        role: "user",
        content: state.inputText,
      },
    ]);

    return { issue: response };
  };
};
