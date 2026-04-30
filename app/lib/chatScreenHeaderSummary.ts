import type { BriefResponse } from "@/services/api/pemApi";

export function buildHeaderSummary(brief: BriefResponse | null): {
  text: string;
  isOverdue: boolean;
} {
  if (!brief) return { text: "", isOverdue: false };

  const overdueCount = brief.overdue.length;
  const todayCount = brief.today.length;

  if (overdueCount > 0) {
    return { text: `${overdueCount} overdue`, isOverdue: true };
  }
  if (todayCount > 0) {
    return { text: `${todayCount} open`, isOverdue: false };
  }
  return { text: "All clear today", isOverdue: false };
}
