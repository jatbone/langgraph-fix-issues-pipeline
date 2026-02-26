/**
 * Shared graph types used across client and server.
 * TSerializedMessage is the wire format for LangChain messages sent over NDJSON.
 */

export type TSerializedMessage = {
  id: string;
  type:
    | "human"
    | "ai"
    | "generic"
    | "developer"
    | "system"
    | "function"
    | "tool"
    | "remove";
  content: string;
  name?: string;
  tool_calls?: {
    id?: string;
    name: string;
    type: string;
    args: Record<string, any>;
  }[];
  tool_call_id?: string;
  timestamp: string;
  additional_kwargs?: { [key: string]: any };
};
