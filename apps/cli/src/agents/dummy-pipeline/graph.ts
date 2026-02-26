/**
 * Dummy Pipeline graph definition.
 * START → create_container → dummy → cleanup_container → END
 */

import { StateGraph, END, START } from "@langchain/langgraph";
import { DummyPipelineState } from "@langgraph-fix-issues-pipeline/shared/server";
import { createCreateContainerNode, createDummyNode, createCleanupContainerNode } from "./nodes.js";
import { DUMMY_NODES } from "./constants.js";

export const setupDummyPipelineGraph = () => {
  const createContainerNode = createCreateContainerNode();
  const dummyNode = createDummyNode();
  const cleanupContainerNode = createCleanupContainerNode();

  return new StateGraph(DummyPipelineState)
    .addNode(DUMMY_NODES.CREATE_CONTAINER, createContainerNode)
    .addNode(DUMMY_NODES.DUMMY, dummyNode)
    .addNode(DUMMY_NODES.CLEANUP_CONTAINER, cleanupContainerNode)
    .addEdge(START, DUMMY_NODES.CREATE_CONTAINER)
    .addEdge(DUMMY_NODES.CREATE_CONTAINER, DUMMY_NODES.DUMMY)
    .addEdge(DUMMY_NODES.DUMMY, DUMMY_NODES.CLEANUP_CONTAINER)
    .addEdge(DUMMY_NODES.CLEANUP_CONTAINER, END);
};
