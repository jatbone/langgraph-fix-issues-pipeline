/**
 * Worker entry point.
 * Prepares a Docker container, runs the issue pipeline graph, and cleans up.
 */

import "dotenv/config";
import {
  setupIssuePipelineGraph,
  cleanupContainer,
} from "./agents/issue-pipeline/index.js";
import type Dockerode from "dockerode";

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

  let docker: Dockerode | undefined;
  let containerId: string | undefined;
  try {
    const {
      runner,
      docker: newDockerInstance,
      containerId: newContainerId,
    } = await setupIssuePipelineGraph();
    docker = newDockerInstance;
    containerId = newContainerId;

    const result = await runner.invoke({
      inputText: "Change the background color of the page to red.",
    });

    console.log("Issue Intake Result:");
    console.log("  Title:", result.issue?.title);
    console.log("  Requirements:", result.issue?.requirements);
    console.log("  Ambiguities:", result.issue?.ambiguities);
    console.log("  Complexity:", result.issue?.complexity);
  } catch (error) {
    console.error("Error running issue pipeline:", error);
  } finally {
    if (docker && containerId) {
      await cleanupContainer(docker, containerId);
    }
  }
};

main().catch(console.error);
