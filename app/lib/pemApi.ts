import type { Prep, PrepKind } from "@/components/sections/home-sections/homePrepData";
import { extractPrepResultBody } from "@/lib/extractPrepResultBody";
import { getApiBaseUrl } from "@/lib/apiBaseUrl";
import { FileText, Gift, Mail, Scale, Search, type LucideIcon } from "lucide-react-native";

export type ApiPrep = {
  id: string;
  dump_id: string;
  title: string;
  thought?: string;
  prep_type: string;
  render_type?: string | null;
  context?: Record<string, unknown> | null;
  status: "prepping" | "ready" | "archived" | "failed";
  summary: string | null;
  result: Record<string, unknown> | null;
  /** Omitted in API responses for failed preps (details are not shown in UI). */
  error_message: string | null;
  created_at: string;
  ready_at: string | null;
  archived_at: string | null;
  /** Set when user opened detail; omitted/null = unread (ready tab). */
  opened_at?: string | null;
};

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
        ? ` Check API is running and reachable at ${base} (simulator vs device: see README).`
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

function prepTypeToKind(prepType: string): PrepKind {
  switch (prepType) {
    case "search":
      return "web";
    case "research":
      return "deep_research";
    case "options":
      return "options";
    case "draft":
      return "draft";
    case "compound":
      return "deep_research";
    default:
      return "web";
  }
}

function iconForKind(kind: PrepKind): LucideIcon {
  if (kind === "options" || kind === "decide" || kind === "follow_up") return Gift;
  if (kind === "draft") return Mail;
  if (kind === "web") return Search;
  if (kind === "deep_research") return Scale;
  return FileText;
}

function tagForPrepType(prepType: string): string {
  switch (prepType) {
    case "search":
      return "Search";
    case "research":
      return "Research";
    case "options":
      return "Options";
    case "draft":
      return "Draft";
    case "compound":
      return "Prep";
    default:
      return "Prep";
  }
}

function viewLabelForKind(kind: PrepKind): string {
  switch (kind) {
    case "options":
    case "decide":
    case "follow_up":
      return "View options";
    case "draft":
      return "View draft";
    case "deep_research":
      return "Read research";
    case "web":
      return "View summary";
    default:
      return "Open";
  }
}

function extractBodyAndDraft(row: ApiPrep): ReturnType<typeof extractPrepResultBody> {
  const renderOrPrep = row.render_type ?? row.prep_type;
  return extractPrepResultBody(row.result, renderOrPrep, row.status);
}

function extractOptions(row: ApiPrep): Prep["options"] {
  const pt = row.render_type ?? row.prep_type;
  if (pt !== "options" || !row.result || !Array.isArray(row.result.options)) {
    return undefined;
  }
  return row.result.options
    .slice(0, 3)
    .map((o) => {
      if (!o || typeof o !== "object") return { label: "", price: "" };
      const name = "name" in o && typeof o.name === "string" ? o.name : "";
      const price = "price" in o && typeof o.price === "string" ? o.price : "";
      const url = "url" in o && typeof o.url === "string" ? o.url.trim() : "";
      const why = "why" in o && typeof o.why === "string" ? o.why : "";
      const store = "store" in o && typeof o.store === "string" ? o.store : "";
      const imageUrl =
        "imageUrl" in o && typeof o.imageUrl === "string" ? o.imageUrl.trim() : "";
      return {
        label: name,
        price,
        url: url.length > 0 ? url : undefined,
        why: why.length > 0 ? why : undefined,
        store: store.length > 0 ? store : undefined,
        imageUrl: imageUrl.length > 0 ? imageUrl : undefined,
      };
    })
    .filter((o) => o.label.length > 0);
}

/** Maps API prep row to hub `Prep` for lists and detail. */
export function apiPrepToPrep(row: ApiPrep): Prep {
  const pt = row.render_type ?? row.prep_type;
  const kind = prepTypeToKind(pt);
  const Icon = iconForKind(kind);
  const { body, draftText, detailIntro, draftSubject } = extractBodyAndDraft(row);
  const options = extractOptions(row);

  const summary =
    row.summary?.trim() ||
    (row.status === "prepping"
      ? "Pem is working on this."
      : row.status === "failed"
        ? "Something went wrong. Tap to retry."
        : "—");

  const title = row.thought?.trim() || row.title;

  return {
    id: row.id,
    dumpId: row.dump_id,
    Icon,
    tag:
      row.status === "prepping"
        ? "Prepping"
        : row.status === "failed"
          ? "Failed"
          : tagForPrepType(pt),
    title,
    summary,
    viewLabel: viewLabelForKind(kind),
    kind,
    detailIntro,
    options,
    body: body || undefined,
    draftText,
    draftSubject,
    status: row.status,
    unread:
      row.status === "ready" && (row.opened_at === null || row.opened_at === undefined),
  };
}

export type CreateDumpResponse = {
  status: string;
  dumpId: string;
  prepIds: string[];
};

export async function createDump(
  getToken: () => Promise<string | null>,
  transcript: string,
): Promise<CreateDumpResponse> {
  return apiFetch("/dumps", {
    method: "POST",
    getToken,
    body: JSON.stringify({ transcript }),
  });
}

export async function listPreps(
  getToken: () => Promise<string | null>,
  status?: string,
): Promise<ApiPrep[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch(`/preps${q}`, { method: "GET", getToken });
}

export type ListPrepsPageResponse = {
  items: ApiPrep[];
  next_cursor: string | null;
};

export type ListPrepsPageParams = {
  status?: "ready" | "prepping" | "archived" | "failed";
  limit: number;
  cursor?: string | null;
  /** Scope to one dump (post-dump screen); use with limit. */
  dumpId?: string;
};

export async function listPrepsPage(
  getToken: () => Promise<string | null>,
  params: ListPrepsPageParams,
): Promise<ListPrepsPageResponse> {
  const q = new URLSearchParams();
  q.set("limit", String(params.limit));
  if (params.status) q.set("status", params.status);
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.dumpId) q.set("dumpId", params.dumpId);
  return apiFetch(`/preps?${q.toString()}`, { method: "GET", getToken });
}

export async function getPrepById(
  getToken: () => Promise<string | null>,
  id: string,
): Promise<ApiPrep> {
  return apiFetch(`/preps/${encodeURIComponent(id)}`, { method: "GET", getToken });
}

export async function archivePrepApi(
  getToken: () => Promise<string | null>,
  id: string,
): Promise<ApiPrep> {
  return apiFetch(`/preps/${encodeURIComponent(id)}/archive`, { method: "PATCH", getToken });
}

export async function retryPrepApi(
  getToken: () => Promise<string | null>,
  id: string,
): Promise<ApiPrep> {
  return apiFetch(`/preps/${encodeURIComponent(id)}/retry`, { method: "POST", getToken });
}

export type ApiProfileFact = {
  id: string;
  memory_key: string;
  note: string;
  status: "active" | "historical";
  learned_at: string;
  source_prep_id: string | null;
  source_dump_id: string | null;
  provenance: string | null;
};

export type ApiUserProfileFacts = {
  facts: ApiProfileFact[];
};

export async function getUserProfileFacts(
  getToken: () => Promise<string | null>,
): Promise<ApiUserProfileFacts> {
  return apiFetch("/users/me/profile", { method: "GET", getToken });
}

export type ApiUserProfileFactsPage = {
  facts: ApiProfileFact[];
  next_cursor: string | null;
};

export async function getUserProfileFactsPage(
  getToken: () => Promise<string | null>,
  opts: { limit: number; cursor?: string | null; status?: "active" | "historical" | "all" },
): Promise<ApiUserProfileFactsPage> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit));
  if (opts.cursor) {
    params.set("cursor", opts.cursor);
  }
  if (opts.status && opts.status !== "all") {
    params.set("status", opts.status);
  }
  const qs = params.toString();
  return apiFetch(`/users/me/profile?${qs}`, { method: "GET", getToken });
}

export async function createProfileFact(
  getToken: () => Promise<string | null>,
  key: string,
  note: string,
): Promise<ApiProfileFact> {
  const { fact } = await apiFetch<{ fact: ApiProfileFact }>("/users/me/profile", {
    method: "POST",
    getToken,
    body: JSON.stringify({ key, note }),
  });
  return fact;
}

export async function markPrepOpened(
  getToken: () => Promise<string | null>,
  id: string,
): Promise<ApiPrep> {
  return apiFetch(`/preps/${encodeURIComponent(id)}/opened`, {
    method: "PATCH",
    getToken,
  });
}

export async function updateProfileFact(
  getToken: () => Promise<string | null>,
  id: string,
  patch: { key?: string; note?: string },
): Promise<ApiProfileFact> {
  const { fact } = await apiFetch<{ fact: ApiProfileFact }>(
    `/users/me/profile/${encodeURIComponent(id)}`,
    { method: "PATCH", getToken, body: JSON.stringify(patch) },
  );
  return fact;
}

export async function deleteProfileFact(
  getToken: () => Promise<string | null>,
  id: string,
): Promise<void> {
  await apiFetch(`/users/me/profile/${encodeURIComponent(id)}`, {
    method: "DELETE",
    getToken,
  });
}
