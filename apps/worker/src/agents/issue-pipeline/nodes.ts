/**
 * Node factory functions for the issue pipeline.
 * Single node that sends input text to Claude and returns the response.
 */

import { ChatAnthropic } from "@langchain/anthropic";
import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";
import { buildImage, getImageName, getContainer, getDockerClient } from "../../docker/index.js";

/**
 * Creates a Docker container and starts it with sleep infinity.
 */
export const createCreateContainerNode = () => {
  return async (_state: TIssuePipelineGraphState) => {
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
  };
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

/**
 * Issue node — sends the input text to Claude Haiku and returns the response.
 */
export const createIssueNode = () => {
  return async (state: TIssuePipelineGraphState) => {
    const model = new ChatAnthropic({
      model: "claude-haiku-4-5-20251001",
      temperature: 0,
    });

    const response = await model.invoke(state.inputText);

    return {
      outputText: typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content),
    };
  };
};
