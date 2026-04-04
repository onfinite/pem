import type { Prep, PrepKind } from "@/components/sections/home-sections/homePrepData";
import { extractPrepResultBody } from "@/lib/extractPrepResultBody";
import { getApiBaseUrl } from "@/lib/apiBaseUrl";
import { hasAnyAdaptiveCard, parseAdaptiveFromResult } from "@/lib/adaptivePrep";
import { cardLayoutFromResult, type CardLayoutId } from "@/lib/prepCardLayout";
import {
  primaryKindFromResult,
  parsePrepBlocksFromResult,
  type PrepResultBlock,
} from "@/lib/prepBlocks";
import {
  BookOpen,
  Calendar,
  FileText,
  Gavel,
  Gift,
  GitCompare,
  Layers,
  Lightbulb,
  Mail,
  MapPin,
  Scale,
  Search,
  ShoppingBag,
  StickyNote,
  User,
  type LucideIcon,
} from "lucide-react-native";

export type ApiPrep = {
  id: string;
  dump_id: string;
  title: string;
  thought?: string;
  /** Classifier intent; hub bucket is `prep_type` (and `result.schema` when adaptive). */
  intent?: string | null;
  prep_type: string;
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
  /** User starred; null/omitted = not starred. */
  starred_at?: string | null;
  bundle_type?: string | null;
  display_emoji?: string | null;
  bundle_detection_reason?: string | null;
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

/** Hub bucket from API (`prep_type` + optional `result.primaryKind`). Adaptive UX uses `layout`. */
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
    case "mixed":
      return "mixed";
    default:
      return "web";
  }
}

function prepKindForHub(
  blocks: PrepResultBlock[] | undefined,
  layout: CardLayoutId | null,
  prepType: string,
): PrepKind {
  if (blocks?.some((b) => b.type === "follow_up")) return "follow_up";
  if (layout === "decision_card") return "decide";
  return prepTypeToKind(prepType);
}

function iconForLayout(layout: CardLayoutId): LucideIcon {
  switch (layout) {
    case "shopping_card":
      return ShoppingBag;
    case "place_card":
      return MapPin;
    case "comparison_card":
      return GitCompare;
    case "research_card":
      return BookOpen;
    case "person_card":
      return User;
    case "meeting_brief_card":
      return Calendar;
    case "decision_card":
      return Scale;
    case "legal_financial_card":
      return Gavel;
    case "explain_card":
      return Lightbulb;
    case "summary_card":
      return FileText;
    case "idea_cards_card":
      return StickyNote;
    case "draft_card":
      return Mail;
  }
}

function iconForKind(kind: PrepKind): LucideIcon {
  if (kind === "mixed") return Layers;
  if (kind === "options" || kind === "decide" || kind === "follow_up") return Gift;
  if (kind === "draft") return Mail;
  if (kind === "web") return Search;
  if (kind === "deep_research") return Scale;
  return FileText;
}

function tagForPrimaryKind(prepType: string): string {
  switch (prepType) {
    case "search":
      return "Search";
    case "research":
      return "Research";
    case "options":
      return "Options";
    case "draft":
      return "Draft";
    case "mixed":
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
    case "mixed":
      return "Open";
    default:
      return "Open";
  }
}

function extractBodyAndDraft(row: ApiPrep): ReturnType<typeof extractPrepResultBody> {
  return extractPrepResultBody(row.result, row.prep_type, row.status);
}

function extractOptions(row: ApiPrep): Prep["options"] {
  const pt = row.prep_type;
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

function optionsFromBlocks(blocks: PrepResultBlock[]): Prep["options"] | undefined {
  const block = blocks.find((b) => b.type === "options");
  if (!block || !block.options.length) return undefined;
  return block.options
    .map((o) => {
      const url = o.url.trim();
      const why = o.why.trim();
      const store = o.store.trim();
      const imageUrl = o.imageUrl.trim();
      return {
        label: o.name,
        price: o.price,
        url: url.length > 0 ? url : undefined,
        why: why.length > 0 ? why : undefined,
        store: store.length > 0 ? store : undefined,
        imageUrl: imageUrl.length > 0 ? imageUrl : undefined,
      };
    })
    .filter((o) => o.label.length > 0);
}

function optionsFromShoppingCard(
  row: ApiPrep,
): Prep["options"] | undefined {
  const r = row.result;
  if (!r || typeof r !== "object" || r.schema !== "SHOPPING_CARD" || !Array.isArray(r.products)) {
    return undefined;
  }
  return r.products
    .slice(0, 3)
    .map((o) => {
      if (!o || typeof o !== "object") return { label: "", price: "" };
      const name = "name" in o && typeof o.name === "string" ? o.name : "";
      const price = "price" in o && typeof o.price === "string" ? o.price : "";
      const url = "url" in o && typeof o.url === "string" ? o.url.trim() : "";
      const why = "why" in o && typeof o.why === "string" ? o.why : "";
      const store = "store" in o && typeof o.store === "string" ? o.store : "";
      const image = "image" in o && typeof o.image === "string" ? o.image.trim() : "";
      return {
        label: name,
        price,
        url: url.length > 0 ? url : undefined,
        why: why.length > 0 ? why : undefined,
        store: store.length > 0 ? store : undefined,
        imageUrl: image.length > 0 ? image : undefined,
      };
    })
    .filter((o) => o.label.length > 0);
}

/** Maps API prep row to hub `Prep` for lists and detail. */
export function apiPrepToPrep(row: ApiPrep): Prep {
  const adaptive = parseAdaptiveFromResult(row.result);
  const blocks = hasAnyAdaptiveCard(adaptive)
    ? undefined
    : parsePrepBlocksFromResult(row.result);
  const layout = cardLayoutFromResult(row.result);
  const pk = primaryKindFromResult(row.result) ?? row.prep_type;
  const kind = prepKindForHub(blocks, layout, pk);
  const useAdaptive = hasAnyAdaptiveCard(adaptive);
  const Icon: LucideIcon = layout ? iconForLayout(layout) : iconForKind(kind);
  const { body, draftText, detailIntro, draftSubject } =
    blocks?.length || useAdaptive ? {} : extractBodyAndDraft(row);
  const options = blocks?.length
    ? optionsFromBlocks(blocks)
    : optionsFromShoppingCard(row) ?? extractOptions(row);

  const summary =
    row.summary?.trim() ||
    (row.status === "prepping"
      ? "Pem is working on this."
      : row.status === "failed"
        ? "Something went wrong. Tap to retry."
        : "—");

  const title = row.thought?.trim() || row.title;

  let tag =
    row.status === "prepping"
      ? "Prepping"
      : row.status === "failed"
        ? "Failed"
        : tagForPrimaryKind(pk);
  if (row.status === "ready" && layout) {
    if (layout === "shopping_card") tag = "Shop picks";
    else if (layout === "draft_card") tag = "Draft ready";
    else if (layout === "place_card") tag = "Places";
    else if (layout === "comparison_card") tag = "Compare";
    else if (layout === "research_card") tag = "Research";
    else if (layout === "person_card") tag = "Profile";
    else if (layout === "meeting_brief_card") tag = "Brief";
    else if (layout === "decision_card") tag = "Verdict";
    else if (layout === "legal_financial_card") tag = "Legal & money";
    else if (layout === "explain_card") tag = "Explained";
    else if (layout === "summary_card") tag = "Summary";
    else if (layout === "idea_cards_card") tag = "Ideas";
  }

  let viewLabel = viewLabelForKind(kind);
  if (layout === "shopping_card") viewLabel = "View picks";
  else if (layout === "place_card") viewLabel = "View places";
  else if (layout === "comparison_card") viewLabel = "Compare";
  else if (layout === "research_card") viewLabel = "Read";
  else if (layout === "person_card") viewLabel = "View profile";
  else if (layout === "meeting_brief_card") viewLabel = "Open brief";
  else if (layout === "decision_card") viewLabel = "See verdict";
  else if (layout === "legal_financial_card") viewLabel = "Read";
  else if (layout === "explain_card") viewLabel = "Read";
  else if (layout === "summary_card") viewLabel = "Read";
  else if (layout === "idea_cards_card") viewLabel = "Browse ideas";

  return {
    id: row.id,
    dumpId: row.dump_id,
    createdAt: row.created_at,
    intent: row.intent ?? undefined,
    Icon,
    tag,
    title,
    summary,
    viewLabel,
    kind,
    detailIntro,
    options,
    body: body || undefined,
    draftText: adaptive.draftCard?.body ?? draftText,
    draftSubject: adaptive.draftCard ? adaptive.draftCard.subject.trim() || null : draftSubject,
    status: row.status,
    unread:
      row.status === "ready" && (row.opened_at === null || row.opened_at === undefined),
    blocks: blocks ?? undefined,
    shoppingCard: adaptive.shoppingCard,
    draftCard: adaptive.draftCard,
    placeCard: adaptive.placeCard,
    comparisonCard: adaptive.comparisonCard,
    researchCard: adaptive.researchCard,
    personCard: adaptive.personCard,
    meetingBrief: adaptive.meetingBrief,
    decisionCard: adaptive.decisionCard,
    legalFinancialCard: adaptive.legalFinancialCard,
    explainCard: adaptive.explainCard,
    summaryCard: adaptive.summaryCard,
    ideaCards: adaptive.ideaCards,
    starred: Boolean(row.starred_at),
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
  /** Starred preps only (any status); omit `status` when true. */
  starredOnly?: boolean;
};

export async function listPrepsPage(
  getToken: () => Promise<string | null>,
  params: ListPrepsPageParams,
): Promise<ListPrepsPageResponse> {
  const q = new URLSearchParams();
  q.set("limit", String(params.limit));
  if (params.starredOnly) q.set("starred", "1");
  else if (params.status) q.set("status", params.status);
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.dumpId) q.set("dumpId", params.dumpId);
  return apiFetch(`/preps?${q.toString()}`, { method: "GET", getToken });
}

export type PrepCountsResponse = {
  ready: number;
  preparing: number;
  archived: number;
  starred: number;
};

/** Exact totals per hub tab (separate from paginated list). */
export async function fetchPrepCounts(
  getToken: () => Promise<string | null>,
): Promise<PrepCountsResponse> {
  return apiFetch("/preps/counts", { method: "GET", getToken });
}

export type SearchPrepsParams = {
  q: string;
  status: "ready" | "prepping" | "archived";
  limit: number;
  cursor?: string | null;
  starredOnly?: boolean;
};

export async function searchPrepsPage(
  getToken: () => Promise<string | null>,
  params: SearchPrepsParams,
): Promise<ListPrepsPageResponse> {
  const q = new URLSearchParams();
  q.set("q", params.q);
  q.set("status", params.status);
  q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.starredOnly) q.set("starred", "1");
  return apiFetch(`/preps/search?${q.toString()}`, { method: "GET", getToken });
}

export async function starPrepApi(
  getToken: () => Promise<string | null>,
  id: string,
  starred: boolean,
): Promise<ApiPrep> {
  return apiFetch(`/preps/${encodeURIComponent(id)}/star`, {
    method: "PATCH",
    getToken,
    body: JSON.stringify({ starred }),
  });
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

export async function unarchivePrepApi(
  getToken: () => Promise<string | null>,
  id: string,
): Promise<ApiPrep> {
  return apiFetch(`/preps/${encodeURIComponent(id)}/unarchive`, { method: "PATCH", getToken });
}

export async function retryPrepApi(
  getToken: () => Promise<string | null>,
  id: string,
): Promise<ApiPrep> {
  return apiFetch(`/preps/${encodeURIComponent(id)}/retry`, { method: "POST", getToken });
}

/** Ephemeral device location for one prep run (server Redis only — not stored on the prep row). */
export async function postPrepClientHints(
  getToken: () => Promise<string | null>,
  id: string,
  body:
    | { latitude: number; longitude: number }
    | { locationUnavailable: true },
): Promise<{ ok: true }> {
  return apiFetch(`/preps/${encodeURIComponent(id)}/client-hints`, {
    method: "POST",
    getToken,
    body: JSON.stringify(body),
  });
}

/** Permanently removes the prep (204). */
export async function deletePrepApi(
  getToken: () => Promise<string | null>,
  id: string,
): Promise<void> {
  await apiFetch(`/preps/${encodeURIComponent(id)}`, { method: "DELETE", getToken });
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
