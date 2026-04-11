import type { ApiMessage } from "@/lib/pemApi";

export type ChatStreamCallbacks = {
  onPemMessage?: (message: ApiMessage) => void;
  onStatus?: (messageId: string, text: string) => void;
  onMessageUpdated?: (
    messageId: string,
    field: string,
    value: unknown,
  ) => void;
  onToken?: (token: string) => void;
  onStreamDone?: (messageId: string) => void;
  onTasksUpdated?: () => void;
};

export type ChatSseEvents =
  | "pem_message"
  | "status"
  | "message_updated"
  | "pem_token"
  | "pem_stream_done"
  | "tasks_updated";
