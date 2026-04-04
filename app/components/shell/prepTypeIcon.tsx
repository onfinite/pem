import type { LucideIcon } from "lucide-react-native";
import {
  AlignLeft,
  BookOpen,
  Calendar,
  ClipboardList,
  Columns2,
  FileText,
  Layers,
  Lightbulb,
  MapPin,
  Scale,
  Search,
  ShoppingBag,
  User,
} from "lucide-react-native";

import type { PrepKind } from "@/components/sections/home-sections/homePrepData";

/** Maps classifier intent (API) + hub kind (demo) to a small list icon. */
const INTENT_ICONS: Record<string, LucideIcon> = {
  SHOPPING: ShoppingBag,
  COMPARISON: Columns2,
  RESEARCH: BookOpen,
  DRAFT: FileText,
  DECISION: Scale,
  LEGAL_FINANCIAL: Scale,
  LIFE_ADMIN: ClipboardList,
  TASK_UNCLEAR: Lightbulb,
  SUMMARIZE: AlignLeft,
  EXPLAIN: Lightbulb,
  FIND_PERSON: User,
  FIND_PLACE: MapPin,
  SCHEDULE_PREP: Calendar,
  CONTENT_IDEA: Lightbulb,
  TRANSLATE_SIMPLIFY: FileText,
  TRACK_MONITOR: Search,
};

const KIND_ICONS: Record<PrepKind, LucideIcon> = {
  options: ShoppingBag,
  draft: FileText,
  deep_research: BookOpen,
  web: Search,
  decide: Scale,
  follow_up: Calendar,
  mixed: Layers,
};

export function prepListIconFromIntent(
  intent: string | null | undefined,
  kind: PrepKind,
): LucideIcon {
  if (intent) {
    const direct = INTENT_ICONS[intent];
    if (direct) return direct;
  }
  return KIND_ICONS[kind] ?? Search;
}

/** Tinted icon well + stroke for hub rows — warm, scannable, theme-aware. */
export type PrepListAccent = { well: string; icon: string };

const ACCENT_LIGHT: Record<string, PrepListAccent> = {
  shopping: { well: "#fdf2ea", icon: "#c45e22" },
  research: { well: "#e0f2fe", icon: "#0369a1" },
  draft: { well: "#f3e8ff", icon: "#6d28d9" },
  decide: { well: "#d1fae5", icon: "#047857" },
  web: { well: "#f0f9ff", icon: "#0284c7" },
  mixed: { well: "#ffedd5", icon: "#ea580c" },
  follow: { well: "#fef9c3", icon: "#b45309" },
  places: { well: "#dcfce7", icon: "#15803d" },
  person: { well: "#fce7f3", icon: "#be185d" },
  admin: { well: "#fef3c7", icon: "#b45309" },
  default: { well: "#fdf2ea", icon: "#e8763a" },
};

const ACCENT_DARK: Record<string, PrepListAccent> = {
  shopping: { well: "#3d2a1a", icon: "#fbbf24" },
  research: { well: "#0c2840", icon: "#38bdf8" },
  draft: { well: "#2d1f4a", icon: "#a78bfa" },
  decide: { well: "#142923", icon: "#34d399" },
  web: { well: "#0c2840", icon: "#38bdf8" },
  mixed: { well: "#3d2a1a", icon: "#fb923c" },
  follow: { well: "#3d3510", icon: "#facc15" },
  places: { well: "#142923", icon: "#4ade80" },
  person: { well: "#3d1f2e", icon: "#f472b6" },
  admin: { well: "#3d3510", icon: "#fcd34d" },
  default: { well: "#332a22", icon: "#e8763a" },
};

function accentKey(intent: string | null | undefined, kind: PrepKind): string {
  if (intent) {
    const byIntent: Record<string, string> = {
      SHOPPING: "shopping",
      COMPARISON: "decide",
      RESEARCH: "research",
      DRAFT: "draft",
      DECISION: "decide",
      LEGAL_FINANCIAL: "decide",
      LIFE_ADMIN: "admin",
      TASK_UNCLEAR: "mixed",
      SUMMARIZE: "research",
      EXPLAIN: "research",
      FIND_PERSON: "person",
      FIND_PLACE: "places",
      SCHEDULE_PREP: "follow",
      CONTENT_IDEA: "mixed",
      TRANSLATE_SIMPLIFY: "draft",
      TRACK_MONITOR: "web",
    };
    const k = byIntent[intent];
    if (k) return k;
  }
  const byKind: Record<PrepKind, string> = {
    options: "shopping",
    draft: "draft",
    deep_research: "research",
    web: "web",
    decide: "decide",
    follow_up: "follow",
    mixed: "mixed",
  };
  return byKind[kind] ?? "default";
}

export function prepListAccentFromIntent(
  intent: string | null | undefined,
  kind: PrepKind,
  resolved: "light" | "dark",
): PrepListAccent {
  const key = accentKey(intent, kind);
  const table = resolved === "dark" ? ACCENT_DARK : ACCENT_LIGHT;
  return table[key] ?? table.default;
}
