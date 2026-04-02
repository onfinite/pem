import type { Prep, PrepKind } from "@/components/sections/home-sections/homePrepData";
import { getApiBaseUrl } from "@/lib/apiBaseUrl";
import { FileText, Gift, Mail, Scale, Search, type LucideIcon } from "lucide-react-native";

export type ApiPrep = {
  id: string;
  dump_id: string;
  title: string;
  prep_type: string;
  status: "prepping" | "ready" | "archived";
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

function extractBodyAndDraft(row: ApiPrep): { body?: string; draftText?: string; detailIntro?: string } {
  const r = row.result;
  if (!r || row.status === "prepping") {
    return {};
  }

  if (row.prep_type === "draft") {
    const body = typeof r.body === "string" ? r.body : "";
    const subject = r.subject === null || typeof r.subject === "string" ? r.subject : null;
    const tone = typeof r.tone === "string" ? r.tone : "";
    const detailIntro =
      [subject ? `Subject: ${subject}` : null, tone ? `Tone: ${tone}` : null].filter(Boolean).join("\n") ||
      undefined;
    return {
      draftText: body,
      detailIntro,
    };
  }

  if (row.prep_type === "options") {
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
  if (row.prep_type !== "options" || !row.result || !Array.isArray(row.result.options)) {
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
  const kind = prepTypeToKind(row.prep_type);
  const Icon = iconForKind(kind);
  const { body, draftText, detailIntro } = extractBodyAndDraft(row);
  const options = extractOptions(row);

  const summary =
    row.summary?.trim() ||
    (row.status === "prepping"
      ? row.error_message?.trim() || "Pem's on it…"
      : row.error_message?.trim() || "—");

  return {
    id: row.id,
    Icon,
    tag: row.status === "prepping" ? "Prepping" : tagForPrepType(row.prep_type),
    title: row.title,
    summary,
    viewLabel: viewLabelForKind(kind),
    kind,
    detailIntro,
    options,
    body: body || undefined,
    draftText,
    status: row.status,
  };
}

export async function createDump(
  getToken: () => Promise<string | null>,
  transcript: string,
): Promise<{ dumpId: string; prepIds: string[] }> {
  return apiFetch("/dumps", {
    method: "POST",
    getToken,
    body: JSON.stringify({ transcript }),
  });
}

/** Voice dump: multipart audio → server Whisper → same pipeline as text. */
export async function createDumpWithAudio(
  getToken: () => Promise<string | null>,
  localUri: string,
): Promise<{ dumpId: string; prepIds: string[] }> {
  const token = await getToken();
  const form = new FormData();
  form.append("audio", {
    uri: localUri,
    name: "dump.m4a",
    type: "audio/m4a",
  } as unknown as Blob);

  const headers = new Headers();
  headers.set("Accept", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}/dumps/audio`, {
      method: "POST",
      headers,
      body: form,
    });
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
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as { dumpId: string; prepIds: string[] };
}

export async function listPreps(
  getToken: () => Promise<string | null>,
  status?: string,
): Promise<ApiPrep[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch(`/preps${q}`, { method: "GET", getToken });
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
