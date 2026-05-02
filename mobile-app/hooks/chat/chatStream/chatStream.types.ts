import type { ApiMessage } from "@/services/api/pemApi";

export type ChatIntegrationNoticePayload = {
  kind: string;
  title?: string;
  body?: string;
  connection_id?: string;
};

export type ChatStreamCallbacks = {
  onPemMessage?: (message: ApiMessage) => void;
  onUserMessage?: (message: ApiMessage) => void;
  onIntegrationNotice?: (payload: ChatIntegrationNoticePayload) => void;
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
  | "user_message"
  | "integration_notice"
  | "status"
  | "message_updated"
  | "pem_token"
  | "pem_stream_done"
  | "tasks_updated";
