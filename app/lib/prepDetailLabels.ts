import type { PrepKind } from "@/components/sections/home-sections/homePrepData";

/** Short label for the prep detail “companion” header (sentence case, not ALL CAPS). */
export function prepKindCompanionLabel(kind: PrepKind): string {
  switch (kind) {
    case "deep_research":
      return "Research";
    case "web":
      return "Search";
    case "options":
      return "Options";
    case "draft":
      return "Draft";
    case "composite":
      return "Brief";
    case "decide":
    case "follow_up":
      return "Options";
    default:
      return "Prep";
  }
}
