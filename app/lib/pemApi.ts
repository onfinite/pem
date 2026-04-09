import { getApiBaseUrl } from "@/lib/apiBaseUrl";

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { getToken: () => Promise<string | null> },
): Promise<T> {
  const { getToken, ...rest } = init;
  const token = await getToken();
  if (!token) throw new Error("No auth token available");
  const headers = new Headers(rest.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  if (rest.body && !headers.has("Content-Type") && !(rest.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, { ...rest, headers });
  } catch (e) {
    const base = getApiBaseUrl();
    const hint =
      __DEV__ && (e instanceof TypeError || String(e).includes("Network request failed"))
        ? ` Check API is running at ${base}.`
        : "";
    throw new Error((e instanceof Error ? e.message : String(e)) + hint);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Too many requests. Try again in a moment.");
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function createDump(
  getToken: () => Promise<string | null>,
  text: string,
): Promise<{ dumpId: string }> {
  return apiFetch<{ dumpId: string }>("/dumps", {
    method: "POST",
    getToken,
    body: JSON.stringify({ text }),
  });
}

// ── Chat API ──

export type ApiMessage = {
  id: string;
  role: "user" | "pem";
  kind: "text" | "voice" | "brief";
  content: string | null;
  voice_url: string | null;
  transcript: string | null;
  triage_category: string | null;
  processing_status: string | null;
  polished_text: string | null;
  parent_message_id: string | null;
  created_at: string;
  metadata?: {
    tasks_created?: number;
    tasks_updated?: number;
    tasks_completed?: number;
    calendar_written?: number;
    calendar_updated?: number;
    calendar_deleted?: number;
  } | null;
};

export async function sendChatMessage(
  getToken: () => Promise<string | null>,
  params: { kind: "text" | "voice"; content?: string; voice_url?: string; audio_key?: string },
): Promise<{ message: ApiMessage; status: string }> {
  return apiFetch("/chat/messages", {
    method: "POST",
    getToken,
    body: JSON.stringify(params),
  });
}

export async function sendVoiceMessage(
  getToken: () => Promise<string | null>,
  audioUri: string,
  mimeType = "audio/m4a",
): Promise<{ message: ApiMessage; status: string }> {
  const token = await getToken();
  const formData = new FormData();
  formData.append("audio", {
    uri: audioUri,
    name: "recording.m4a",
    type: mimeType,
  } as any);
  const res = await fetch(`${getApiBaseUrl()}/chat/voice`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Voice upload failed (${res.status})`);
  }
  return res.json();
}

export async function getChatMessages(
  getToken: () => Promise<string | null>,
  opts?: { before?: string; limit?: number },
): Promise<{ messages: ApiMessage[]; has_more: boolean }> {
  const params = new URLSearchParams();
  if (opts?.before) params.set("before", opts.before);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiFetch(`/chat/messages${qs ? `?${qs}` : ""}`, {
    method: "GET",
    getToken,
  });
}

export type TaskCounts = {
  today: number;
  overdue: number;
  total_open: number;
  this_week: number;
  someday: number;
};

export async function getTaskCounts(
  getToken: () => Promise<string | null>,
): Promise<TaskCounts> {
  return apiFetch<TaskCounts>("/extracts/counts", { method: "GET", getToken });
}

export type CalendarViewResponse = {
  items: ApiExtract[];
  undated: ApiExtract[];
  overdue: ApiExtract[];
  dot_map: Record<string, { tasks: number; events: number }>;
};

export async function getExtractsCalendar(
  getToken: () => Promise<string | null>,
  month?: string,
): Promise<CalendarViewResponse> {
  const q = month ? `?month=${month}` : "";
  return apiFetch<CalendarViewResponse>(`/extracts/calendar${q}`, {
    method: "GET",
    getToken,
  });
}

export async function triggerCalendarSync(
  getToken: () => Promise<string | null>,
): Promise<{ synced: boolean }> {
  return apiFetch<{ synced: boolean }>("/calendar/sync-all", {
    method: "POST",
    getToken,
  });
}

export type ApiExtract = {
  id: string;
  message_id: string | null;
  source: "dump" | "calendar";
  text: string;
  original_text: string;
  status: string;
  tone: string;
  urgency: string;
  batch_key: string | null;
  due_at: string | null;
  period_start: string | null;
  period_end: string | null;
  period_label: string | null;
  timezone_pending: boolean;
  snoozed_until: string | null;
  done_at: string | null;
  dismissed_at: string | null;
  pem_note: string | null;
  recommended_at: string | null;
  draft_text: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  event_location: string | null;
  external_event_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function getInboxToday(getToken: () => Promise<string | null>) {
  return apiFetch<{ today: ApiExtract[] }>("/inbox", { method: "GET", getToken });
}

export type BatchSlot = {
  batch_key: string;
  count: number;
  items: ApiExtract[];
};

export async function getInboxAll(getToken: () => Promise<string | null>) {
  return apiFetch<{
    this_week: ApiExtract[];
    someday: ApiExtract[];
    ideas: ApiExtract[];
    dismissed: ApiExtract[];
    batch_groups: { batch_key: string; items: ApiExtract[] }[];
    batch_slots: BatchSlot[];
  }>("/inbox/all", { method: "GET", getToken });
}

export type ExtractsQueryParams = {
  status?: "open" | "inbox" | "snoozed" | "dismissed" | "done";
  batch_key?: "shopping" | "errands" | "follow_ups";
  tone?: "confident" | "tentative" | "idea" | "someday";
  exclude_tone?: "confident" | "tentative" | "idea" | "someday";
  urgency?: "today" | "this_week" | "someday" | "none";
  limit?: number;
  cursor?: string | null;
};

export async function getExtractsQuery(
  getToken: () => Promise<string | null>,
  params: ExtractsQueryParams,
) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.batch_key) q.set("batch_key", params.batch_key);
  if (params.tone) q.set("tone", params.tone);
  if (params.exclude_tone) q.set("exclude_tone", params.exclude_tone);
  if (params.urgency) q.set("urgency", params.urgency);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  const qs = q.toString();
  return apiFetch<{ items: ApiExtract[]; next_cursor: string | null }>(
    `/extracts/query${qs ? `?${qs}` : ""}`,
    { method: "GET", getToken },
  );
}

export async function getExtractsOpen(
  getToken: () => Promise<string | null>,
  opts?: { limit?: number; cursor?: string | null },
) {
  const q = new URLSearchParams();
  if (opts?.limit) q.set("limit", String(opts.limit));
  if (opts?.cursor) q.set("cursor", opts.cursor);
  const qs = q.toString();
  return apiFetch<{ items: ApiExtract[]; next_cursor: string | null }>(
    `/extracts/open${qs ? `?${qs}` : ""}`,
    { method: "GET", getToken },
  );
}

export async function getDumpsPage(
  getToken: () => Promise<string | null>,
  opts?: { limit?: number; cursor?: string | null },
) {
  const q = new URLSearchParams();
  if (opts?.limit) q.set("limit", String(opts.limit));
  if (opts?.cursor) q.set("cursor", opts.cursor ?? "");
  const qs = q.toString();
  return apiFetch<{
    dumps: {
      id: string;
      text: string;
      status: "processing" | "processed" | "failed";
      /** Always null from API — internal errors are not exposed. */
      last_error: string | null;
      created_at: string;
      extract_count: number;
    }[];
    next_cursor: string | null;
  }>(`/dumps${qs ? `?${qs}` : ""}`, { method: "GET", getToken });
}

export async function getDumpDetail(
  getToken: () => Promise<string | null>,
  dumpId: string,
) {
  return apiFetch<{
    dump: {
      id: string;
      text: string;
      status: "processing" | "processed" | "failed";
      /** Always null from API — internal errors are not exposed. */
      last_error?: string | null;
      raw_text?: string;
      polished_text?: string | null;
      additional_context?: unknown | null;
      agent_assumptions?: unknown | null;
      has_audio?: boolean;
      created_at: string;
    };
    extracts: ApiExtract[];
    logs: LogEntry[];
  }>(`/dumps/${dumpId}`, { method: "GET", getToken });
}

export async function getDumpAudioUrl(
  getToken: () => Promise<string | null>,
  dumpId: string,
) {
  return apiFetch<{ url: string }>(`/dumps/${dumpId}/audio`, {
    method: "GET",
    getToken,
  });
}

export async function retryDumpExtraction(
  getToken: () => Promise<string | null>,
  dumpId: string,
) {
  return apiFetch<{ ok: true }>(`/dumps/${dumpId}/retry`, {
    method: "POST",
    getToken,
    body: "{}",
  });
}

export async function patchExtractDone(
  getToken: () => Promise<string | null>,
  id: string,
) {
  return apiFetch<{ item: ApiExtract }>(`/extracts/${id}/done`, {
    method: "PATCH",
    getToken,
    body: "{}",
  });
}

export async function patchExtractDismiss(
  getToken: () => Promise<string | null>,
  id: string,
) {
  return apiFetch<{ item: ApiExtract }>(`/extracts/${id}/dismiss`, {
    method: "PATCH",
    getToken,
    body: "{}",
  });
}

// ── Brief ────────────────────────────────────────────────

export type BriefResponse = {
  /** LLM prose; omit on older servers — client falls back. */
  statement?: string;
  overdue: ApiExtract[];
  today: ApiExtract[];
  tomorrow: ApiExtract[];
  this_week: ApiExtract[];
  next_week: ApiExtract[];
  later: ApiExtract[];
  batch_counts: { batch_key: string; count: number }[];
};

export async function getBrief(getToken: () => Promise<string | null>) {
  return apiFetch<BriefResponse>("/inbox/brief", { method: "GET", getToken });
}

// ── Draft ────────────────────────────────────────────────

export async function generateExtractDraft(
  getToken: () => Promise<string | null>,
  extractId: string,
) {
  return apiFetch<{ draft: string; item: ApiExtract }>(
    `/extracts/${extractId}/draft`,
    { method: "POST", getToken },
  );
}

// ── History ──────────────────────────────────────────────

export type LogEntry = {
  id: string;
  type: string;
  is_agent: boolean;
  pem_note: string | null;
  payload: Record<string, unknown> | null;
  error: { message: string } | null;
  created_at: string;
};

export async function getExtractHistory(
  getToken: () => Promise<string | null>,
  extractId: string,
) {
  return apiFetch<{ logs: LogEntry[] }>(
    `/extracts/${extractId}/history`,
    { method: "GET", getToken },
  );
}

// ── Undo / Snooze ────────────────────────────────────────

export async function patchExtractUndone(
  getToken: () => Promise<string | null>,
  id: string,
) {
  return apiFetch<{ item: ApiExtract }>(`/extracts/${id}/undone`, {
    method: "PATCH",
    getToken,
    body: "{}",
  });
}

export async function patchExtractUndismiss(
  getToken: () => Promise<string | null>,
  id: string,
) {
  return apiFetch<{ item: ApiExtract }>(`/extracts/${id}/undismiss`, {
    method: "PATCH",
    getToken,
    body: "{}",
  });
}

export async function patchExtractSnooze(
  getToken: () => Promise<string | null>,
  id: string,
  until: string,
  iso?: string,
) {
  return apiFetch<{ item: ApiExtract }>(`/extracts/${id}/snooze`, {
    method: "PATCH",
    getToken,
    body: JSON.stringify({ until, ...(iso ? { iso } : {}) }),
  });
}

export type RescheduleTarget =
  | "today"
  | "tomorrow"
  | "this_week"
  | "next_week"
  | "someday";

export async function patchExtractReschedule(
  getToken: () => Promise<string | null>,
  id: string,
  target: RescheduleTarget,
) {
  return apiFetch<{ item: ApiExtract }>(`/extracts/${id}/reschedule`, {
    method: "PATCH",
    getToken,
    body: JSON.stringify({ target }),
  });
}

export async function reportExtract(
  getToken: () => Promise<string | null>,
  id: string,
  reason: string,
) {
  return apiFetch<{ ok: boolean }>(`/extracts/${id}/report`, {
    method: "POST",
    getToken,
    body: JSON.stringify({ reason }),
  });
}

export async function patchTimezone(
  getToken: () => Promise<string | null>,
  timezone: string,
) {
  return apiFetch<{ ok: true; timezone: string }>("/users/me/timezone", {
    method: "PATCH",
    getToken,
    body: JSON.stringify({ timezone }),
  });
}

export async function getMe(getToken: () => Promise<string | null>) {
  return apiFetch<{
    id: string;
    name?: string | null;
    timezone?: string | null;
    notification_time?: string | null;
    summary?: string | null;
    onboarding_completed?: boolean;
  }>("/users/me", {
    method: "GET",
    getToken,
  });
}

export async function setUserPushToken(
  getToken: () => Promise<string | null>,
  token: string,
) {
  return apiFetch<{ ok: true }>("/users/me/push-token", {
    method: "PATCH",
    getToken,
    body: JSON.stringify({ token }),
  });
}

export async function getUserSummary(
  getToken: () => Promise<string | null>,
) {
  return apiFetch<{ summary: string | null }>("/users/me/summary", {
    method: "GET",
    getToken,
  });
}

export async function updateUserSummary(
  getToken: () => Promise<string | null>,
  summary: string,
) {
  return apiFetch<{ ok: true }>("/users/me/summary", {
    method: "PATCH",
    getToken,
    body: JSON.stringify({ summary }),
  });
}

export async function setNotificationTime(
  getToken: () => Promise<string | null>,
  time: string,
) {
  return apiFetch<{ ok: true; notification_time: string }>(
    "/users/me/notification-time",
    {
      method: "PATCH",
      getToken,
      body: JSON.stringify({ time }),
    },
  );
}

export async function completeOnboarding(
  getToken: () => Promise<string | null>,
) {
  return apiFetch<{ ok: true }>("/users/me/onboarding-complete", {
    method: "POST",
    getToken,
  });
}

export async function getExtractsDone(
  getToken: () => Promise<string | null>,
  opts?: { limit?: number; cursor?: string | null },
) {
  const q = new URLSearchParams();
  if (opts?.limit) q.set("limit", String(opts.limit));
  if (opts?.cursor) q.set("cursor", opts.cursor);
  const qs = q.toString();
  return apiFetch<{ items: ApiExtract[]; next_cursor: string | null }>(
    `/extracts/done${qs ? `?${qs}` : ""}`,
    { method: "GET", getToken },
  );
}

/** Voice dump — upload audio for transcription and dump creation. */
export async function createVoiceDump(
  getToken: () => Promise<string | null>,
  audioUri: string,
  mimeType = "audio/m4a",
): Promise<{ dumpId: string; text: string }> {
  const token = await getToken();
  const formData = new FormData();
  formData.append("audio", {
    uri: audioUri,
    name: "recording.m4a",
    type: mimeType,
  } as any);
  const res = await fetch(`${getApiBaseUrl()}/dumps/voice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as { dumpId: string; text: string };
}

// ── Ask Pem (separate from dumps — never creates a dump) ──

export type AskPemResponse = {
  answer: string;
  sources: { id: string; text: string }[];
};

export async function askPem(
  getToken: () => Promise<string | null>,
  question: string,
): Promise<AskPemResponse> {
  return apiFetch<AskPemResponse>("/ask", {
    method: "POST",
    getToken,
    body: JSON.stringify({ question }),
  });
}

export type VoiceAskResponse = AskPemResponse & { text: string };

export type AskHistoryTurn = {
  id: string;
  question_text: string;
  answer_text: string | null;
  sources: { id: string; text: string }[];
  input_kind: "text" | "voice";
  error: { message: string; stack?: string } | null;
  created_at: string;
};

export async function getAskHistory(
  getToken: () => Promise<string | null>,
  limit?: number,
) {
  const q =
    limit !== undefined && Number.isFinite(limit)
      ? `?limit=${encodeURIComponent(String(limit))}`
      : "";
  return apiFetch<{ turns: AskHistoryTurn[] }>(`/ask/history${q}`, {
    getToken,
  });
}

export async function createVoiceAsk(
  getToken: () => Promise<string | null>,
  audioUri: string,
  mimeType = "audio/m4a",
): Promise<VoiceAskResponse> {
  const token = await getToken();
  const formData = new FormData();
  formData.append("audio", {
    uri: audioUri,
    name: "recording.m4a",
    type: mimeType,
  } as any);
  const res = await fetch(`${getApiBaseUrl()}/ask/voice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as VoiceAskResponse;
}

// ── Calendar ──────────────────────────────────────────────

export type CalendarConnection = {
  id: string;
  provider: "google" | "apple";
  is_primary: boolean;
  google_email: string | null;
  apple_calendar_ids: string[] | null;
  last_synced_at: string | null;
};

export async function getCalendarConnections(
  getToken: () => Promise<string | null>,
) {
  return apiFetch<{ connections: CalendarConnection[] }>(
    "/calendar/connections",
    { getToken },
  );
}

export async function getGoogleAuthUrl(
  getToken: () => Promise<string | null>,
  appRedirect?: string,
) {
  const qs = appRedirect
    ? `?appRedirect=${encodeURIComponent(appRedirect)}`
    : "";
  return apiFetch<{ url: string }>(`/calendar/google/auth-url${qs}`, {
    getToken,
  });
}

export async function connectAppleCalendar(
  getToken: () => Promise<string | null>,
  calendarIds: string[],
) {
  return apiFetch<{ id: string; provider: string; is_primary: boolean }>(
    "/calendar/apple/connect",
    { method: "POST", getToken, body: JSON.stringify({ calendarIds }) },
  );
}

export async function syncAppleCalendar(
  getToken: () => Promise<string | null>,
  connectionId: string,
  events: {
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    location?: string;
  }[],
) {
  return apiFetch<{ synced: number }>("/calendar/apple/sync", {
    method: "POST",
    getToken,
    body: JSON.stringify({ connectionId, events }),
  });
}

export async function setCalendarPrimary(
  getToken: () => Promise<string | null>,
  connectionId: string,
) {
  return apiFetch<{ ok: boolean }>(
    `/calendar/connections/${connectionId}/primary`,
    { method: "PATCH", getToken },
  );
}

export async function disconnectCalendar(
  getToken: () => Promise<string | null>,
  provider: "google" | "apple",
) {
  return apiFetch<{ ok: boolean }>(`/calendar/connections/${provider}`, {
    method: "DELETE",
    getToken,
  });
}

export async function disconnectCalendarById(
  getToken: () => Promise<string | null>,
  connectionId: string,
) {
  return apiFetch<{ ok: boolean }>(`/calendar/connections/${connectionId}`, {
    method: "DELETE",
    getToken,
  });
}
