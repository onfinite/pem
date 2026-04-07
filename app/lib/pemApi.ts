import { getApiBaseUrl } from "@/lib/apiBaseUrl";

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { getToken: () => Promise<string | null> },
): Promise<T> {
  const { getToken, ...rest } = init;
  const token = await getToken();
  const headers = new Headers(rest.headers);
  headers.set("Accept", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
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
    if (res.status === 429) {
      throw new Error("Too many requests. Try again in a moment.");
    }
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
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

export type ApiActionable = {
  id: string;
  dump_id: string;
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
  draft_text: string | null;
  created_at: string;
  updated_at: string;
};

export async function getInboxToday(getToken: () => Promise<string | null>) {
  return apiFetch<{ today: ApiActionable[] }>("/inbox", {
    method: "GET",
    getToken,
  });
}

export async function getInboxAll(getToken: () => Promise<string | null>) {
  return apiFetch<{
    this_week: ApiActionable[];
    someday: ApiActionable[];
    ideas: ApiActionable[];
    dismissed: ApiActionable[];
    batch_groups: { batch_key: string; items: ApiActionable[] }[];
  }>("/inbox/all", { method: "GET", getToken });
}

export async function getDonePage(
  getToken: () => Promise<string | null>,
  opts?: { limit?: number; cursor?: string | null },
) {
  const q = new URLSearchParams();
  if (opts?.limit) q.set("limit", String(opts.limit));
  if (opts?.cursor) q.set("cursor", opts.cursor);
  const qs = q.toString();
  return apiFetch<{ items: ApiActionable[]; next_cursor: string | null }>(
    `/actionables/done${qs ? `?${qs}` : ""}`,
    { method: "GET", getToken },
  );
}

/** Inbox + snoozed — everything not done or dismissed. */
export async function getActionablesOpen(
  getToken: () => Promise<string | null>,
  opts?: { limit?: number; cursor?: string | null },
) {
  const q = new URLSearchParams();
  if (opts?.limit) q.set("limit", String(opts.limit));
  if (opts?.cursor) q.set("cursor", opts.cursor);
  const qs = q.toString();
  return apiFetch<{ items: ApiActionable[]; next_cursor: string | null }>(
    `/actionables/open${qs ? `?${qs}` : ""}`,
    { method: "GET", getToken },
  );
}

export async function getThoughtsPage(
  getToken: () => Promise<string | null>,
  opts?: { limit?: number; cursor?: string | null },
) {
  const q = new URLSearchParams();
  if (opts?.limit) q.set("limit", String(opts.limit));
  if (opts?.cursor) q.set("cursor", opts.cursor ?? "");
  const qs = q.toString();
  return apiFetch<{
    thoughts: {
      id: string;
      dump_id: string;
      text: string;
      status: "processing" | "processed" | "failed";
      created_at: string;
      actionable_count: number;
    }[];
    next_cursor: string | null;
  }>(`/thoughts${qs ? `?${qs}` : ""}`, { method: "GET", getToken });
}

export async function getThoughtDetail(
  getToken: () => Promise<string | null>,
  thoughtId: string,
) {
  return apiFetch<{
    thought: {
      id: string;
      dump_id: string;
      text: string;
      status: "processing" | "processed" | "failed";
      raw_text?: string;
      polished_text?: string | null;
      created_at: string;
    };
    actionables: ApiActionable[];
  }>(`/thoughts/${thoughtId}`, { method: "GET", getToken });
}

export async function patchActionableDone(
  getToken: () => Promise<string | null>,
  id: string,
) {
  return apiFetch<{ item: ApiActionable }>(`/actionables/${id}/done`, {
    method: "PATCH",
    getToken,
    body: "{}",
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
    timezone?: string | null;
  }>("/users/me", { method: "GET", getToken });
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

export type ApiProfileFact = {
  id: string;
  memory_key: string;
  note: string;
  status: string;
  learned_at: string;
  source_dump_id: string | null;
  provenance: string | null;
};

export async function getUserProfileFactsPage(
  getToken: () => Promise<string | null>,
  opts: { limit: number; cursor?: string | null; status?: string },
) {
  const q = new URLSearchParams();
  q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  if (opts.status) q.set("status", opts.status);
  return apiFetch<{ facts: ApiProfileFact[]; next_cursor: string | null }>(
    `/users/me/profile?${q.toString()}`,
    { method: "GET", getToken },
  );
}

export async function createProfileFact(
  getToken: () => Promise<string | null>,
  key: string,
  note: string,
) {
  return apiFetch<{ fact: ApiProfileFact }>("/users/me/profile", {
    method: "POST",
    getToken,
    body: JSON.stringify({ key, note }),
  });
}

export async function updateProfileFact(
  getToken: () => Promise<string | null>,
  id: string,
  patch: { key?: string; note?: string },
) {
  return apiFetch<{ fact: ApiProfileFact }>(`/users/me/profile/${id}`, {
    method: "PATCH",
    getToken,
    body: JSON.stringify(patch),
  });
}

export async function deleteProfileFact(
  getToken: () => Promise<string | null>,
  id: string,
) {
  await apiFetch<void>(`/users/me/profile/${id}`, {
    method: "DELETE",
    getToken,
  });
}
