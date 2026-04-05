import type { Prep } from "@/components/sections/home-sections/homePrepData";
import { buildCanonicalSectionsFromPrep } from "@/lib/prepSections";

function hasAdaptiveCard(prep: Prep): boolean {
  if (prep.compositeBrief) return false;
  return Boolean(
    prep.shoppingCard ||
      prep.placeCard ||
      prep.draftCard ||
      prep.comparisonCard ||
      prep.researchCard ||
      prep.personCard ||
      prep.meetingBrief ||
      prep.decisionCard ||
      prep.legalFinancialCard ||
      prep.explainCard ||
      prep.summaryCard ||
      prep.ideaCards ||
      prep.eventsCard ||
      prep.flightsCard ||
      prep.businessCard ||
      prep.trendsCard ||
      prep.marketCard ||
      prep.jobsCard,
  );
}

/**
 * Primary content descriptor below the prep title — what the user is about to scroll.
 */
export function getPrepDetailSectionHeader(
  prep: Prep,
): { title: string; subtitle?: string } | null {
  if (prep.status === "prepping" || prep.status === "failed") return null;

  if (prep.compositeBrief) {
    return {
      title: "Brief",
      subtitle: "Sections, recommendations, and sources",
    };
  }

  if (hasAdaptiveCard(prep)) {
    if (prep.shoppingCard) return { title: "Shop picks", subtitle: "Products and prices" };
    if (prep.placeCard) return { title: "Places", subtitle: "Map and details" };
    if (prep.eventsCard) return { title: "Events", subtitle: "Dates and links" };
    if (prep.flightsCard) return { title: "Flights", subtitle: "Route and recommendation" };
    if (prep.businessCard) return { title: "Businesses", subtitle: "Local picks" };
    if (prep.trendsCard) return { title: "Trends", subtitle: "Interest and related terms" };
    if (prep.marketCard) return { title: "Market", subtitle: "Quote and context" };
    if (prep.jobsCard) return { title: "Jobs", subtitle: "Listings" };
    if (prep.draftCard) return { title: "Draft", subtitle: "Copy and send" };
    if (prep.comparisonCard) return { title: "Compare", subtitle: "Side by side" };
    if (prep.researchCard) return { title: "Research", subtitle: "Summary and sources" };
    if (prep.personCard) return { title: "Profile", subtitle: "What to know" };
    if (prep.meetingBrief) return { title: "Meeting brief", subtitle: "Agenda and notes" };
    if (prep.decisionCard) return { title: "Decision", subtitle: "Verdict and tradeoffs" };
    if (prep.legalFinancialCard) return { title: "Legal & money", subtitle: "Key points" };
    if (prep.explainCard) return { title: "Explained", subtitle: "Plain-language overview" };
    if (prep.summaryCard) return { title: "Summary", subtitle: "Takes and highlights" };
    if (prep.ideaCards) return { title: "Ideas", subtitle: "Angles to try" };
    return null;
  }

  const hasBlocks = Boolean(prep.blocks?.length);
  const hasComposite = Boolean(prep.compositeBrief);
  const hasAdaptive = hasAdaptiveCard(prep);
  const canonical = hasBlocks
    ? buildCanonicalSectionsFromPrep({
        cardSummary: prep.summary,
        detailIntro: prep.detailIntro,
        blocks: prep.blocks,
      })
    : [];
  const useSectionStack = !hasComposite && !hasAdaptive && hasBlocks && canonical.length > 0;

  if (useSectionStack) {
    return { title: "Details", subtitle: "By section" };
  }

  if (hasBlocks) {
    return { title: "Details", subtitle: "What Pem found" };
  }

  if (prep.kind === "options" && prep.options && prep.options.length > 0) {
    return { title: "Options", subtitle: "Recommendations" };
  }

  if (prep.body) {
    if (prep.kind === "deep_research") return { title: "Research", subtitle: "Findings and sources" };
    if (prep.kind === "web") return { title: "Answer", subtitle: "Summary and links" };
    return { title: "Summary", subtitle: "Main takeaways" };
  }

  if (prep.kind === "draft" && prep.draftText) return null;

  return null;
}
