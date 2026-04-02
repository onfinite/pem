import type { Prep, PrepKind } from "@/components/sections/home-sections/homePrepData";
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
  error_message: string | null;
  created_at: string;
  ready_at: string | null;
  archived_at: string | null;
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

function extractBodyAndDraft(row: ApiPrep): {
  body?: string;
  draftText?: string;
  detailIntro?: string;
  draftSubject?: string | null;
} {
  const r = row.result;
  if (!r || row.status === "prepping") {
    return {};
  }

  const renderOrPrep = row.render_type ?? row.prep_type;

  if (renderOrPrep === "draft") {
    const body = typeof r.body === "string" ? r.body : "";
    const subject = r.subject === null || typeof r.subject === "string" ? r.subject : null;
    const tone = typeof r.tone === "string" ? r.tone : "";
    const detailIntro =
      [subject ? `Subject: ${subject}` : null, tone ? `Tone: ${tone}` : null].filter(Boolean).join("\n") ||
      undefined;
    return {
      draftText: body,
      draftSubject: subject,
      detailIntro,
    };
  }

  if (renderOrPrep === "options") {
    // Structured options (+ why/url) render in the detail UI; avoid duplicating as a flat body.
    return {};
  }

  const summary = typeof r.summary === "string" ? r.summary : "";
  const keyPoints = Array.isArray(r.keyPoints)
    ? r.keyPoints.filter((x): x is string => typeof x === "string")
    : [];
  const sources = Array.isArray(r.sources)
    ? r.sources.filter((x): x is string => typeof x === "string")
    : [];
  const parts = [summary];
  if (keyPoints.length) {
    parts.push("\n\nKey points:\n" + keyPoints.map((k) => `• ${k}`).join("\n"));
  }
  if (sources.length) {
    parts.push("\n\nSources:\n" + sources.map((s) => `• ${s}`).join("\n"));
  }
  return { body: parts.join("") };
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
      return {
        label: name,
        price,
        url: url.length > 0 ? url : undefined,
        why: why.length > 0 ? why : undefined,
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
      ? row.error_message?.trim() || "Pem's on it…"
      : row.status === "failed"
        ? row.error_message?.trim() || "Something went wrong"
        : row.error_message?.trim() || "—");

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

export type ApiPrepLog = {
  id: string;
  step: string;
  message: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export async function getPrepLogs(
  getToken: () => Promise<string | null>,
  id: string,
): Promise<ApiPrepLog[]> {
  return apiFetch(`/preps/${encodeURIComponent(id)}/logs`, { method: "GET", getToken });
}

export type ApiProfileFact = {
  id: string;
  key: string;
  value: string;
  source: string | null;
  updated_at: string;
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
  opts: { limit: number; cursor?: string | null },
): Promise<ApiUserProfileFactsPage> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit));
  if (opts.cursor) {
    params.set("cursor", opts.cursor);
  }
  const qs = params.toString();
  return apiFetch(`/users/me/profile?${qs}`, { method: "GET", getToken });
}

export async function createProfileFact(
  getToken: () => Promise<string | null>,
  key: string,
  value: string,
): Promise<ApiProfileFact> {
  const { fact } = await apiFetch<{ fact: ApiProfileFact }>("/users/me/profile", {
    method: "POST",
    getToken,
    body: JSON.stringify({ key, value }),
  });
  return fact;
}

export async function updateProfileFact(
  getToken: () => Promise<string | null>,
  id: string,
  patch: { key?: string; value?: string },
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
