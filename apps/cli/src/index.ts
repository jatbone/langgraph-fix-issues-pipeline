/**
 * CLI entry point.
 * Compiles the dummy pipeline graph, invokes it, and logs the result.
 */

import "dotenv/config";
import { setupDummyPipelineGraph } from "./agents/dummy-pipeline/index.js";

const main = async () => {
  const graph = setupDummyPipelineGraph();
  const runner = graph.compile();

  const result = await runner.invoke({
    inputText: "Hello, tell me a fun fact about graphs.",
  });

  console.log(result.outputText);
};

main().catch(console.error);
