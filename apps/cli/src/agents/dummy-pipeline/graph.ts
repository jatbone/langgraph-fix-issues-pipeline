/**
 * Dummy Pipeline graph definition.
 * A single-node graph: START → dummy → END
 */

import { StateGraph, END, START } from "@langchain/langgraph";
import { DummyPipelineState } from "@langgraph-fix-issues-pipeline/shared/server";
import { createDummyNode } from "./nodes.js";
import { DUMMY_NODES } from "./constants.js";

export const setupDummyPipelineGraph = () => {
  const dummyNode = createDummyNode();

  return new StateGraph(DummyPipelineState)
    .addNode(DUMMY_NODES.DUMMY, dummyNode)
    .addEdge(START, DUMMY_NODES.DUMMY)
    .addEdge(DUMMY_NODES.DUMMY, END);
};
