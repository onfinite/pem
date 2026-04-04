import {
  Archive,
  Bell,
  CheckCircle2,
  Dumbbell,
  FileText,
  Gift,
  Loader2,
  Mail,
  Scale,
  Search,
  type LucideIcon,
} from "lucide-react-native";
import type { DraftCardPayload, ShoppingCardPayload } from "@/lib/adaptivePrep";
import type { PrepResultBlock } from "@/lib/prepBlocks";

/**
 * Flip to `false` to preview the empty hub (no prep cards yet). Static demo only.
 */
export const SHOW_SAMPLE_PREPS = true;

/** Drives detail layout: options list, paste-ready draft, long research, etc. */
export type PrepKind =
  | "options"
  | "draft"
  | "deep_research"
  | "web"
  | "decide"
  | "follow_up"
  | "mixed";

/** Buckets for subtle tag tint (options vs draft vs research) — scanning, not loud brand amber. */
export type PrepKindTagBucket = "options" | "draft" | "research";

export function prepKindBucket(kind: PrepKind): PrepKindTagBucket {
  if (kind === "options" || kind === "decide" || kind === "follow_up") return "options";
  if (kind === "draft" || kind === "web") return "draft";
  return "research";
}

/** Muted tints per prep family — light/dark tuned for contrast on cream/charcoal. */
export function prepKindTagColor(kind: PrepKind, resolved: "light" | "dark"): string {
  const b = prepKindBucket(kind);
  if (resolved === "dark") {
    const dark = {
      options: "#9bb5a8",
      draft: "#b4a8d6",
      research: "#c9a882",
    } as const;
    return dark[b];
  }
  const light = {
    options: "#4d6b5f",
    draft: "#5c5278",
    research: "#725a44",
  } as const;
  return light[b];
}

export type Prep = {
  id: string;
  Icon: LucideIcon;
  tag: string;
  title: string;
  /** Short line on the hub card — what Pem did. */
  summary: string;
  /** Primary action (card + detail). */
  viewLabel: string;
  kind: PrepKind;
  /** Optional context shown at top of detail. */
  detailIntro?: string;
  options?: {
    label: string;
    price: string;
    url?: string;
    why?: string;
    store?: string;
    imageUrl?: string;
  }[];
  /** Long findings / summary / comparison text. */
  body?: string;
  /** Paste-ready text for draft preps. */
  draftText?: string;
  /** Email subject from API when render type is draft. */
  draftSubject?: string | null;
  /** Set when preps are loaded from the API (not demo seeds). */
  status?: "prepping" | "ready" | "archived" | "failed";
  /** Present for API-backed preps; used to scope the post-dump “Pem’s got it” list. */
  dumpId?: string;
  /** Fine-grained classifier intent when present (API). */
  intent?: string;
  /** Ready prep not yet opened in detail (inbox-style). */
  unread?: boolean;
  /** Composable sections (new API). When set, detail renders blocks in order. */
  blocks?: PrepResultBlock[];
  /** Adaptive layout — `SHOPPING_CARD` from API `result.schema`. */
  shoppingCard?: ShoppingCardPayload;
  /** Adaptive layout — `DRAFT_CARD` from API `result.schema`. */
  draftCard?: DraftCardPayload;
};

export const SAMPLE_READY_PREPS: Prep[] = [
  {
    id: "1",
    Icon: Gift,
    tag: "Options found",
    title: "Gift ideas for mom",
    summary: "Three real picks with prices — gardening angle, $60 budget.",
    viewLabel: "View options",
    kind: "options",
    detailIntro:
      "Pem narrowed gifts to things that ship well and match what you said about her gardening hobby.",
    options: [
      { label: "Seed subscription box", price: "$48" },
      { label: "Herb garden kit", price: "$55" },
      { label: "Cooking class for two", price: "$60" },
    ],
  },
  {
    id: "2",
    Icon: Search,
    tag: "Research done",
    title: "Gym cancellation",
    summary: "Policy checked — notice period and a firm-but-polite draft.",
    viewLabel: "Review draft",
    kind: "draft",
    detailIntro: "Based on common gym contract patterns; confirm against your actual agreement.",
    body: "30-day notice is required. Email the address on your membership portal and keep a screenshot of the sent message.",
    draftText: `Subject: Membership cancellation

Hi — I'm writing to cancel my membership, effective 30 days from this email as required by the agreement. Please confirm receipt and the final billing date.

Thank you,
[Your name]`,
  },
  {
    id: "3",
    Icon: FileText,
    tag: "Deep research",
    title: "Your app idea",
    summary: "Landscape scan: competitors, gap, and what to validate next.",
    viewLabel: "Read research",
    kind: "deep_research",
    detailIntro: "Sources cross-checked; this is a synthesis, not a single blog take.",
    body: `No direct competitor combines quick text capture with parallel “prep” agents the way you described. Closest tools are generic AI chats (no prep cards) or task apps (no research fan-out).

What looks real: onboarding busy professionals who already jot thoughts in notes apps — acquisition is the risk, not the idea.

Next validation: 5 interviews on “where do thoughts go today?” and willingness to pay for prep cards vs. another subscription.`,
  },
  {
    id: "4",
    Icon: Mail,
    tag: "Draft ready",
    title: "Email to landlord (leak)",
    summary: "Polite, specific email citing your lease — ready to paste.",
    viewLabel: "View draft",
    kind: "draft",
    detailIntro: "Adjust unit number and dates to match your thread.",
    body: "Send from the email on your lease if possible; attach photos if you have them.",
    draftText: `Subject: Request for repair — water leak in unit [___]

Hello,

I'm writing to report a leak in [location]. Per our lease (Section [__]), I'm requesting a timely repair and follow-up on any water damage.

Please let me know a timeframe. I'm happy to provide access.

Best,
[Your name]
[Phone]`,
  },
  {
    id: "5",
    Icon: Search,
    tag: "Web search",
    title: "Is this neighborhood okay for kids?",
    summary: "Schools, safety stats, and walkability — short answer up top.",
    viewLabel: "View summary",
    kind: "web",
    detailIntro: "Pulled from recent public sources; verify before a big decision.",
    body: `Short answer: schools in the catchment are rated above average for the metro; crime stats for the zip are lower than city median for property crime; walkability is moderate — errands need a short drive.

See linked sources in a full product; this card is the snapshot.`,
  },
  {
    id: "6",
    Icon: Scale,
    tag: "Decide",
    title: "Take this job offer?",
    summary: "Comp, commute, and risk in one place — you choose.",
    viewLabel: "Open comparison",
    kind: "decide",
    detailIntro: "No “right” answer — Pem lays out tradeoffs you named.",
    body: `Comp: offer is ~12% above your current base; equity is clearer than your last role.

Commute: +15 minutes each way unless you relocate in year two.

Risk: smaller company — runway 18–24 months per public signals; role scope is wider than your title suggests.`,
  },
  {
    id: "7",
    Icon: Bell,
    tag: "Follow up",
    title: "Mom’s birthday — next week",
    summary: "You asked for options earlier — here’s a nudge with the same three picks.",
    viewLabel: "View reminder",
    kind: "follow_up",
    detailIntro: "When you pick one, Pem can draft a message or set a calendar block — your call.",
    body: `Still pending: choose from the three gift options above, or tell Pem to refresh the list if plans changed.`,
  },
];

export const ARCHIVED_SEED_PREPS: Prep[] = [
  {
    id: "a1",
    Icon: Gift,
    tag: "Archived",
    title: "Gift ideas for mom",
    summary: "You chose the seed subscription — marked done last week.",
    viewLabel: "View",
    kind: "options",
    detailIntro: "Archived reference.",
    options: [{ label: "Seed subscription box", price: "$48" }],
    body: "You confirmed the seed subscription. Receipt and tracking were in your email.",
  },
  {
    id: "a2",
    Icon: Mail,
    tag: "Archived",
    title: "Email to landlord (leak)",
    summary: "Draft sent — thread closed on your side.",
    viewLabel: "View",
    kind: "draft",
    detailIntro: "Archived reference.",
    body: "You sent the message; no further action from Pem.",
    draftText: `(Sent copy on file in your archive.)`,
  },
];

const ALL_PREPS: Prep[] = [...SAMPLE_READY_PREPS, ...ARCHIVED_SEED_PREPS];

export function getPrepById(id: string): Prep | undefined {
  return ALL_PREPS.find((p) => p.id === id);
}

export type PrepTab = "ready" | "prepping" | "archived";

export const TABS: { id: PrepTab; label: string; Icon: LucideIcon }[] = [
  { id: "ready", label: "Ready", Icon: CheckCircle2 },
  { id: "prepping", label: "Prepping", Icon: Loader2 },
  { id: "archived", label: "Archived", Icon: Archive },
];

/** In-flight preps on the Prepping tab — set `SHOW_PREPPING_HUB_ROWS` false to preview empty state. */
export const SHOW_PREPPING_HUB_ROWS = true;

export const PREPPING_ROWS: {
  id: string;
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  kind: PrepKind;
}[] = [
  { id: "p1", Icon: Gift, title: "Gift ideas for mom", subtitle: "Finding options", kind: "options" },
  { id: "p2", Icon: Dumbbell, title: "Gym cancellation", subtitle: "Researching policy", kind: "draft" },
  { id: "p3", Icon: Search, title: "Your app idea", subtitle: "Deep research", kind: "deep_research" },
];
