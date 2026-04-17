import { getApiBaseUrl } from "@/lib/apiBaseUrl";

const MAX_429_RETRIES = 3;
const RETRY_BASE_MS = 500;

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { getToken: () => Promise<string | null> },
): Promise<T> {
  const { getToken, ...rest } = init;

  const buildHeaders = async () => {
    const token = await getToken();
    if (!token) throw new Error("No auth token available");
    const h = new Headers(rest.headers);
    h.set("Accept", "application/json");
    h.set("Authorization", `Bearer ${token}`);
    if (rest.body && !h.has("Content-Type") && !(rest.body instanceof FormData)) {
      h.set("Content-Type", "application/json");
    }
    return h;
  };

  let headers = await buildHeaders();
  let didRetryAuth = false;

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
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

    if (res.status === 401 && !didRetryAuth) {
      didRetryAuth = true;
      headers = await buildHeaders();
      continue;
    }
    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * (attempt + 1)));
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Too many requests. Try again in a moment.");
      throw new Error(text || `HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  throw new Error("Too many requests. Try again in a moment.");
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

export type PhotoRecallItem = {
  message_id: string;
  image_key: string;
  signed_url: string;
  vision_summary: string | null;
};

export type ApiMessage = {
  id: string;
  role: "user" | "pem";
  kind: "text" | "voice" | "brief" | "image";
  content: string | null;
  voice_url: string | null;
  transcript: string | null;
  image_keys?: { key: string; mime?: string | null }[] | null;
  image_urls?: { key: string; url: string }[] | null;
  vision_summary?: string | null;
  triage_category: string | null;
  processing_status: string | null;
  polished_text: string | null;
  summary: string | null;
  parent_message_id: string | null;
  idempotency_key?: string | null;
  created_at: string;
  metadata?: {
    tasks_created?: number;
    tasks_updated?: number;
    tasks_completed?: number;
    calendar_written?: number;
    calendar_updated?: number;
    calendar_deleted?: number;
    photo_recall?: PhotoRecallItem[];
    type?: string;
    extract_id?: string;
    event_summary?: string;
    event_start?: string;
    event_end?: string;
    event_location?: string | null;
    organizer_name?: string | null;
    organizer_email?: string | null;
    self_rsvp_status?: string | null;
  } | null;
};

export type SendChatMessageParams =
  | { kind: "text"; content: string; idempotency_key?: string }
  | { kind: "voice"; voice_url?: string; audio_key?: string; idempotency_key?: string }
  | {
      kind: "image";
      image_key?: string;
      image_keys?: { key: string; mime?: string | null }[];
      content?: string;
      idempotency_key?: string;
    };

export async function sendChatMessage(
  getToken: () => Promise<string | null>,
  params: SendChatMessageParams,
): Promise<{
  message: ApiMessage;
  status: string;
  deduplicated?: boolean;
}> {
  return apiFetch("/chat/messages", {
    method: "POST",
    getToken,
    body: JSON.stringify(params),
  });
}

export async function requestPhotoUploadUrl(
  getToken: () => Promise<string | null>,
  body: { content_type: "image/jpeg" | "image/png" | "image/webp"; byte_size?: number },
): Promise<{
  upload_url: string;
  image_key: string;
  expires_in_seconds: number;
}> {
  return apiFetch("/chat/photos/upload-url", {
    method: "POST",
    getToken,
    body: JSON.stringify(body),
  });
}

export async function sendVoiceMessage(
  getToken: () => Promise<string | null>,
  audioUri: string,
  mimeType = "audio/m4a",
  opts?: {
    idempotency_key?: string;
    image_keys?: { key: string; mime?: string | null }[];
  },
): Promise<{ message: ApiMessage; status: string; deduplicated?: boolean }> {
  const token = await getToken();
  const formData = new FormData();
  formData.append("audio", {
    uri: audioUri,
    name: "recording.m4a",
    type: mimeType,
  } as any);
  if (opts?.image_keys?.length) {
    formData.append("image_keys", JSON.stringify(opts.image_keys));
  }
  const q = opts?.idempotency_key
    ? `?idempotency_key=${encodeURIComponent(opts.idempotency_key)}`
    : "";
  const res = await fetch(`${getApiBaseUrl()}/chat/voice${q}`, {
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

export async function searchMessages(
  getToken: () => Promise<string | null>,
  query: string,
  limit = 20,
) {
  return apiFetch<{ messages: ApiMessage[] }>(
    `/chat/messages/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    { method: "GET", getToken },
  );
}

export async function deleteMessage(
  getToken: () => Promise<string | null>,
  messageId: string,
) {
  return apiFetch<{ ok: boolean }>(`/chat/messages/${messageId}`, {
    method: "DELETE",
    getToken,
  });
}

export async function summarizeMessage(
  getToken: () => Promise<string | null>,
  messageId: string,
) {
  return apiFetch<{ summary: string }>(
    `/chat/messages/${messageId}/summarize`,
    { method: "POST", getToken },
  );
}

export type MessageExtract = {
  id: string;
  text: string;
  status: string;
  tone: string | null;
  batchKey: string | null;
  listId: string | null;
};

export async function getMessageExtracts(
  getToken: () => Promise<string | null>,
  messageId: string,
) {
  return apiFetch<{ extracts: MessageExtract[] }>(
    `/chat/messages/${messageId}/extracts`,
    { getToken },
  );
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

export type ExtractMeta = {
  energy_level?: "low" | "medium" | "high" | null;
  is_deadline?: boolean;
  auto_scheduled?: boolean;
  scheduling_reason?: string | null;
  recommended_at?: string | null;
  rsvp_status?: string | null;
};

export type ApiExtract = {
  id: string;
  message_id: string | null;
  source: "dump" | "calendar";
  text: string;
  original_text: string;
  status: string;
  tone: string;
  urgency: "someday" | "none";
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
  /** Block / focus time suggested by agent (ISO). */
  scheduled_at: string | null;
  event_location: string | null;
  external_event_id: string | null;
  duration_minutes: number | null;
  auto_scheduled: boolean;
  scheduling_reason: string | null;
  recurrence_rule: {
    freq: "daily" | "weekly" | "monthly" | "yearly";
    interval: number;
    by_day?: number[];
    by_month_day?: number;
    until?: string;
    count?: number;
  } | null;
  recurrence_parent_id: string | null;
  rsvp_status: string | null;
  is_all_day: boolean;
  is_deadline: boolean;
  is_organizer: boolean;
  energy_level: string | null;
  list_id: string | null;
  priority: "high" | "medium" | "low" | null;
  reminder_at: string | null;
  reminder_sent: boolean;
  meta: ExtractMeta;
  created_at: string;
  updated_at: string;
};

/** PATCH /extracts/:id — all keys optional; send `null` to clear nullable fields. */
export type UpdateExtractPayload = {
  text?: string;
  original_text?: string;
  tone?: "confident" | "tentative" | "someday";
  urgency?: "someday" | "none";
  batch_key?: "shopping" | "errands" | "follow_ups" | null;
  due_at?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  period_label?: string | null;
  duration_minutes?: number | null;
  pem_note?: string | null;
  is_deadline?: boolean;
  energy_level?: "low" | "medium" | "high" | null;
  priority?: "high" | "medium" | "low" | null;
  list_id?: string | null;
  reminder_at?: string | null;
};

export async function patchExtractUpdate(
  getToken: () => Promise<string | null>,
  id: string,
  body: UpdateExtractPayload,
) {
  return apiFetch<{ item: ApiExtract }>(`/extracts/${id}`, {
    method: "PATCH",
    getToken,
    body: JSON.stringify(body),
  });
}

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
    dated: ApiExtract[];
    someday: ApiExtract[];
    dismissed: ApiExtract[];
    batch_groups: { batch_key: string; items: ApiExtract[] }[];
    batch_slots: BatchSlot[];
  }>("/inbox/all", { method: "GET", getToken });
}

export type ExtractsQueryParams = {
  status?: "open" | "inbox" | "snoozed" | "dismissed" | "done";
  batch_key?: "shopping" | "errands" | "follow_ups";
  tone?: "confident" | "tentative" | "someday";
  exclude_tone?: "confident" | "tentative" | "someday";
  urgency?: "someday" | "none";
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

export async function patchExtractRsvp(
  getToken: () => Promise<string | null>,
  id: string,
  response: "accepted" | "declined" | "tentative",
) {
  return apiFetch<{ item: ApiExtract }>(`/extracts/${id}/rsvp`, {
    method: "PATCH",
    getToken,
    body: JSON.stringify({ response }),
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
  return apiFetch<BriefResponse>("/extracts/brief", { method: "GET", getToken });
}

export async function requestBrief(getToken: () => Promise<string | null>) {
  return apiFetch<{ generated: boolean; briefId?: string }>("/chat/brief", {
    method: "POST",
    getToken,
  });
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

export async function updateUserName(
  getToken: () => Promise<string | null>,
  name: string,
) {
  return apiFetch<{ ok: boolean; name: string }>("/users/me/name", {
    method: "PATCH",
    getToken,
    body: JSON.stringify({ name }),
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


// ── Lists ───────────────────────────────────────────────────

export type ApiList = {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  is_default: boolean;
  sort_order: number;
  open_count: number;
  created_at: string;
  updated_at: string;
};

export async function fetchLists(
  getToken: () => Promise<string | null>,
): Promise<{ items: ApiList[] }> {
  return apiFetch<{ items: ApiList[] }>("/lists", { method: "GET", getToken });
}

export async function createList(
  getToken: () => Promise<string | null>,
  data: { name: string; color?: string; icon?: string },
) {
  return apiFetch<{ item: ApiList }>("/lists", {
    method: "POST",
    getToken,
    body: JSON.stringify(data),
  });
}

export async function updateList(
  getToken: () => Promise<string | null>,
  id: string,
  data: { name?: string; color?: string; icon?: string; sortOrder?: number },
) {
  return apiFetch<{ item: ApiList }>(`/lists/${id}`, {
    method: "PATCH",
    getToken,
    body: JSON.stringify(data),
  });
}

export async function deleteList(
  getToken: () => Promise<string | null>,
  id: string,
) {
  return apiFetch<void>(`/lists/${id}`, { method: "DELETE", getToken });
}

// ── Scheduling Preferences ──────────────────────────────────

export async function setSchedulingPreferences(
  getToken: () => Promise<string | null>,
  prefs: {
    work_hours?: { start: string; end: string };
    work_days?: number[];
    work_type?: "office" | "remote" | "hybrid";
    personal_windows?: ("evenings" | "weekends" | "lunch" | "mornings")[];
    errand_window?: "weekend_morning" | "lunch" | "after_work";
  },
) {
  return apiFetch<{ ok: boolean }>("/users/me/preferences", {
    method: "PATCH",
    getToken,
    body: JSON.stringify(prefs),
  });
}

// ── Calendar ──────────────────────────────────────────────

export type CalendarConnection = {
  id: string;
  provider: "google";
  is_primary: boolean;
  google_email: string | null;
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

export async function setCalendarPrimary(
  getToken: () => Promise<string | null>,
  connectionId: string,
) {
  return apiFetch<{ ok: boolean }>(
    `/calendar/connections/${connectionId}/primary`,
    { method: "PATCH", getToken },
  );
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

export async function deleteAccount(
  getToken: () => Promise<string | null>,
) {
  return apiFetch<void>("/users/me", { method: "DELETE", getToken });
}
