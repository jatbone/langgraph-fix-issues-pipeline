/**
 * Worker entry point.
 * Compiles the issue pipeline graph, invokes it, and logs the result.
 */

import "dotenv/config";
import { setupIssuePipelineGraph } from "./agents/issue-pipeline/index.js";

const main = async () => {
  const graph = setupIssuePipelineGraph();
  const runner = graph.compile();

  const result = await runner.invoke({
    inputText: "Hello, tell me a fun fact about graphs.",
  });

  console.log(result.outputText);
};

main().catch(console.error);
