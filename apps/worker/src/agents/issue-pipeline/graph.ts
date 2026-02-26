/**
 * Issue Pipeline graph definition.
 * START → create_container → [verify] → issue → cleanup_container → END
 *                              ↑ retry (up to 2×) ↓
 *                              └──────────────────┘
 */

import { StateGraph, END, START } from "@langchain/langgraph";
import { IssuePipelineState } from "@langgraph-fix-issues-pipeline/shared/server";
import { createCreateContainerNode, createIssueNode, createCleanupContainerNode, verifyContainer } from "./nodes.js";
import { ISSUE_NODES } from "./constants.js";

export const setupIssuePipelineGraph = () => {
  const createContainerNode = createCreateContainerNode();
  const issueNode = createIssueNode();
  const cleanupContainerNode = createCleanupContainerNode();

  return new StateGraph(IssuePipelineState)
    .addNode(ISSUE_NODES.CREATE_CONTAINER, createContainerNode)
    .addNode(ISSUE_NODES.ISSUE, issueNode)
    .addNode(ISSUE_NODES.CLEANUP_CONTAINER, cleanupContainerNode)
    .addEdge(START, ISSUE_NODES.CREATE_CONTAINER)
    .addConditionalEdges(ISSUE_NODES.CREATE_CONTAINER, verifyContainer, {
      [ISSUE_NODES.ISSUE]: ISSUE_NODES.ISSUE,
      [ISSUE_NODES.CREATE_CONTAINER]: ISSUE_NODES.CREATE_CONTAINER,
      [ISSUE_NODES.CLEANUP_CONTAINER]: ISSUE_NODES.CLEANUP_CONTAINER,
    })
    .addEdge(ISSUE_NODES.ISSUE, ISSUE_NODES.CLEANUP_CONTAINER)
    .addEdge(ISSUE_NODES.CLEANUP_CONTAINER, END);
};
