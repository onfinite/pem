import type { Prep } from "@/components/sections/home-sections/homePrepData";
import type {
  BusinessCardPayload,
  ComparisonCardPayload,
  DecisionCardPayload,
  DraftCardPayload,
  EventsCardPayload,
  ExplainCardPayload,
  FlightsCardPayload,
  IdeaCardsPayload,
  JobsCardPayload,
  LegalFinancialCardPayload,
  MarketCardPayload,
  MeetingBriefPayload,
  PersonCardPayload,
  PlaceCardPayload,
  ResearchCardPayload,
  ShoppingCardPayload,
  SummaryCardPayload,
  TrendsCardPayload,
} from "@/lib/adaptivePrep";
import type { PrepResultBlock } from "@/lib/prepBlocks";

export type PrepOption = NonNullable<Prep["options"]>[number];

/** Plain text for one option (detail pick share). */
export function buildPrepOptionShareText(o: PrepOption): string {
  const lines: string[] = [o.label];
  if (o.store?.trim()) lines.push(o.store.trim());
  if (o.price?.trim()) lines.push(o.price.trim());
  if (o.why?.trim()) lines.push(o.why.trim());
  if (o.url?.trim()) lines.push(o.url.trim());
  return lines.join("\n");
}

/** Plain text for one composable draft block (subject/tone + body). */
export function buildDraftBlockShareText(block: Extract<PrepResultBlock, { type: "draft" }>): string {
  const head = [block.subject ? `Subject: ${block.subject}` : null, block.tone ? `Tone: ${block.tone}` : null]
    .filter(Boolean)
    .join("\n");
  const body = block.body.trim();
  return head && body ? `${head}\n\n${body}` : head || body;
}

/** Legacy API draft fields (matches full-prep share formatting). */
export function buildLegacyDraftShareText(
  draftText: string,
  draftSubject: string | null | undefined,
): string {
  const body = draftText.trim();
  if (!body) return "";
  const sub = draftSubject?.trim();
  return sub ? `${sub}\n\n${body}` : body;
}

/** Plain text for a single composable block (Send/share for that section). */
export function buildBlockShareText(block: PrepResultBlock): string {
  return buildPrepBlockShareLines([block]).join("\n\n");
}

function buildPrepBlockShareLines(blocks: PrepResultBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "search":
        if (b.answer.trim()) out.push(b.answer.trim());
        for (const u of b.sources) {
          if (u.trim()) out.push(u.trim());
        }
        break;
      case "research":
        if (b.summary.trim()) out.push(b.summary.trim());
        for (const k of b.keyPoints) {
          if (k.trim()) out.push(`- ${k.trim()}`);
        }
        for (const u of b.sources) {
          if (u.trim()) out.push(u.trim());
        }
        break;
      case "options":
        for (const o of b.options) {
          out.push(buildPrepOptionShareTextFromRow(o));
        }
        break;
      case "draft":
        out.push(buildDraftBlockShareText(b));
        break;
      case "guidance": {
        const t = b.title?.trim();
        const body = b.body.trim();
        out.push(t ? `${t}\n\n${body}` : body);
        break;
      }
      case "limitation": {
        const t = b.title?.trim();
        const body = b.body.trim();
        out.push(t ? `${t}\n\n${body}` : body);
        break;
      }
      case "summary":
        if (b.text.trim()) out.push(b.text.trim());
        break;
      case "pros_cons": {
        for (const p of b.pros) if (p.trim()) out.push(`+ ${p.trim()}`);
        for (const c of b.cons) if (c.trim()) out.push(`– ${c.trim()}`);
        if (b.verdict?.trim()) out.push(b.verdict.trim());
        break;
      }
      case "action_steps":
        for (const s of b.steps) {
          out.push(`${s.number}. ${s.title}${s.detail?.trim() ? ` — ${s.detail.trim()}` : ""}`);
        }
        break;
      case "tips":
        for (const t of b.tips) if (t.text.trim()) out.push(t.text.trim());
        break;
      case "comparison":
        out.push(b.headers.join(" | "));
        for (const r of b.rows) {
          out.push([r.label, ...r.values].join(" | "));
        }
        break;
      case "limitations":
        out.push(b.cannotDo.trim());
        for (const c of b.canDo) if (c.trim()) out.push(`• ${c.trim()}`);
        break;
      case "sources":
        for (const s of b.sources) out.push(s.url);
        break;
      case "follow_up":
        if (b.question.trim()) out.push(b.question.trim());
        break;
      default:
        break;
    }
  }
  return out.filter(Boolean);
}

function buildPrepOptionShareTextFromRow(o: {
  name: string;
  price: string;
  url: string;
  store: string;
  why: string;
}): string {
  const lines: string[] = [o.name];
  if (o.store?.trim()) lines.push(o.store.trim());
  if (o.price?.trim()) lines.push(o.price.trim());
  if (o.why?.trim()) lines.push(o.why.trim());
  if (o.url?.trim()) lines.push(o.url.trim());
  return lines.join("\n");
}

function buildShoppingCardShareText(c: ShoppingCardPayload): string {
  const lines: string[] = [c.recommendation];
  if (c.query.trim()) lines.push(c.query);
  for (const p of c.products) {
    const bits = [
      p.name,
      p.store,
      p.price,
      ratingLine(p.rating),
      p.reviewCount > 0 ? `${p.reviewCount.toLocaleString()} reviews` : null,
      p.reviewSnippet.trim() ? `“${p.reviewSnippet.trim()}”` : null,
      p.customerSentiment.trim() || null,
      p.why,
      p.url,
    ].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    lines.push(bits.join("\n"));
  }
  if (c.buyingGuide.trim()) lines.push(c.buyingGuide.trim());
  return lines.join("\n\n");
}

function ratingLine(r: number): string | null {
  if (r <= 0) return null;
  return `${r.toFixed(1)} ★`;
}

function buildDraftCardShareText(d: DraftCardPayload): string {
  const head = [d.subject.trim() ? `Subject: ${d.subject.trim()}` : null, `Tone: ${d.tone}`].filter(Boolean);
  const body = d.body.trim();
  const tail = d.assumptions.trim() ? `\n\nAssumed: ${d.assumptions.trim()}` : "";
  return [...head, body].filter(Boolean).join("\n") + tail;
}

function ratingLinePlace(r: number, reviews: number): string | null {
  if (r <= 0 && reviews <= 0) return null;
  const stars = r > 0 ? `${r.toFixed(1)} ★` : null;
  const rc = reviews > 0 ? `${reviews} reviews` : null;
  return [stars, rc].filter(Boolean).join(" · ");
}

function buildComparisonCardShareText(c: ComparisonCardPayload): string {
  const lines: string[] = [c.winnerReason, `Winner: ${c.winner}`];
  for (const o of c.options) {
    lines.push([o.name, o.price, o.bestFor, ...o.pros.map((p) => `+ ${p}`)].filter(Boolean).join("\n"));
  }
  return lines.join("\n\n");
}

function buildResearchCardShareText(c: ResearchCardPayload): string {
  const lines: string[] = [c.executiveSummary, ...c.keyFacts];
  for (const s of c.sources) {
    if (s.url.trim()) lines.push(s.url);
  }
  return lines.join("\n\n");
}

function buildPersonCardShareText(c: PersonCardPayload): string {
  return [c.name, c.title, c.company, c.bio, c.linkedin, c.website, c.pemNote].filter((x) => x.trim().length > 0).join("\n\n");
}

function buildMeetingBriefShareText(c: MeetingBriefPayload): string {
  return [
    c.meetingWith,
    c.about,
    c.personBackground,
    ...c.recentNews,
    ...c.suggestedTalkingPoints,
    c.pemNote,
  ]
    .filter((x) => x.trim().length > 0)
    .join("\n\n");
}

function buildDecisionCardShareText(c: DecisionCardPayload): string {
  const lines: string[] = [c.verdict, c.verdictReason, ...c.keyData];
  for (const o of c.options) {
    lines.push(o.name);
    lines.push(...o.pros.map((p) => `+ ${p}`));
    lines.push(...o.cons.map((p) => `– ${p}`));
  }
  return lines.join("\n\n");
}

function buildLegalFinancialShareText(c: LegalFinancialCardPayload): string {
  const lines: string[] = [c.plainEnglish, ...c.caveats, ...c.sources.map((s) => s.url)];
  return lines.join("\n\n");
}

function buildExplainCardShareText(c: ExplainCardPayload): string {
  return [c.tldr, c.explanation, ...c.steps, c.analogy, ...c.commonMistakes].filter((x) => x.trim().length > 0).join("\n\n");
}

function buildSummaryCardShareText(c: SummaryCardPayload): string {
  return [c.tldr, ...c.keyPoints, c.pullQuote, c.sourceUrl].filter((x) => x.trim().length > 0).join("\n\n");
}

function buildIdeaCardsShareText(c: IdeaCardsPayload): string {
  const lines: string[] = [c.context];
  for (const i of c.ideas) {
    lines.push([i.title, i.hook, i.angle].filter(Boolean).join("\n"));
  }
  return lines.join("\n\n");
}

function buildPlaceCardShareText(c: PlaceCardPayload): string {
  const lines: string[] = [c.recommendation];
  if (c.query.trim()) lines.push(c.query);
  for (const p of c.places) {
    const bits = [
      p.name,
      p.address,
      ratingLinePlace(p.rating, p.reviewCount),
      p.reviewSnippet.trim() ? `Review: ${p.reviewSnippet.trim()}` : null,
      p.customerSatisfaction.trim() || null,
      p.priceRange,
      p.hours,
      p.phone,
      p.website,
      p.email,
      p.pemNote,
      p.url,
    ].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    lines.push(bits.join("\n"));
  }
  return lines.join("\n\n");
}

function buildEventsCardShareText(c: EventsCardPayload): string {
  const lines: string[] = [c.recommendation, c.query].filter((x) => x.trim().length > 0);
  for (const e of c.events) {
    lines.push(
      [e.title, e.when, e.venue, e.address, e.ticketHint, e.reviewSnippet, e.link, e.pemNote]
        .filter((x) => x.trim().length > 0)
        .join("\n"),
    );
  }
  return lines.join("\n\n");
}

function buildFlightsCardShareText(c: FlightsCardPayload): string {
  const lines: string[] = [c.recommendation, c.routeLabel, c.query].filter((x) => x.trim().length > 0);
  for (const o of c.offers) {
    lines.push(
      [o.label, o.price, o.airline, o.duration, o.stops, o.notes, o.bookingUrl]
        .filter((x) => x.trim().length > 0)
        .join("\n"),
    );
  }
  return lines.join("\n\n");
}

function buildBusinessCardShareText(c: BusinessCardPayload): string {
  const lines: string[] = [c.recommendation, c.query].filter((x) => x.trim().length > 0);
  for (const b of c.businesses) {
    lines.push(
      [
        b.name,
        ratingLinePlace(b.rating, b.reviewCount),
        b.reviewSnippet.trim() ? `Review: ${b.reviewSnippet.trim()}` : null,
        b.customerSatisfaction.trim() || null,
        b.address,
        b.hours,
        b.phone,
        b.website,
        b.mapsUrl,
        b.pemNote,
      ]
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .join("\n"),
    );
  }
  return lines.join("\n\n");
}

function buildTrendsCardShareText(c: TrendsCardPayload): string {
  const lines: string[] = [
    c.recommendation,
    c.keyword,
    c.trendReadout,
    c.timeframe,
    ...c.relatedQueries,
  ].filter((x) => x.trim().length > 0);
  for (const s of c.sources) {
    if (s.url.trim()) lines.push(s.title.trim() ? `${s.title}\n${s.url}` : s.url);
  }
  return lines.join("\n\n");
}

function buildMarketCardShareText(c: MarketCardPayload): string {
  const lines: string[] = [
    c.recommendation,
    [c.symbol, c.name, c.price, c.change, c.currency].filter((x) => x.trim().length > 0).join(" · "),
    c.sentiment,
    ...c.keyPoints,
  ].filter((x) => x.trim().length > 0);
  for (const s of c.sources) {
    if (s.url.trim()) lines.push(s.title.trim() ? `${s.title}\n${s.url}` : s.url);
  }
  return lines.join("\n\n");
}

function buildJobsCardShareText(c: JobsCardPayload): string {
  const lines: string[] = [c.recommendation, c.query].filter((x) => x.trim().length > 0);
  for (const j of c.jobs) {
    lines.push(
      [
        j.title,
        j.company,
        j.location,
        j.salaryHint,
        j.employerRating > 0 ? `${j.employerRating.toFixed(1)} ★ employer` : null,
        j.reviewSnippet.trim() ? `Glassdoor / reviews: ${j.reviewSnippet.trim()}` : null,
        j.snippet,
        j.link,
        j.pemNote,
      ]
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .join("\n"),
    );
  }
  return lines.join("\n\n");
}

/** Full prep content for detail share (markdown-ish body kept as-is). */
export function buildPrepShareablePlainText(prep: Prep): string {
  const parts: string[] = [];
  if (prep.tag?.trim()) parts.push(prep.tag.trim());
  if (prep.title?.trim()) parts.push(prep.title.trim());
  if (prep.summary?.trim()) parts.push(prep.summary.trim());
  if (prep.detailIntro?.trim()) parts.push(prep.detailIntro.trim());
  if (prep.shoppingCard) {
    parts.push(buildShoppingCardShareText(prep.shoppingCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.placeCard) {
    parts.push(buildPlaceCardShareText(prep.placeCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.eventsCard) {
    parts.push(buildEventsCardShareText(prep.eventsCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.flightsCard) {
    parts.push(buildFlightsCardShareText(prep.flightsCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.businessCard) {
    parts.push(buildBusinessCardShareText(prep.businessCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.trendsCard) {
    parts.push(buildTrendsCardShareText(prep.trendsCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.marketCard) {
    parts.push(buildMarketCardShareText(prep.marketCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.jobsCard) {
    parts.push(buildJobsCardShareText(prep.jobsCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.draftCard) {
    parts.push(buildDraftCardShareText(prep.draftCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.comparisonCard) {
    parts.push(buildComparisonCardShareText(prep.comparisonCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.researchCard) {
    parts.push(buildResearchCardShareText(prep.researchCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.personCard) {
    parts.push(buildPersonCardShareText(prep.personCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.meetingBrief) {
    parts.push(buildMeetingBriefShareText(prep.meetingBrief));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.decisionCard) {
    parts.push(buildDecisionCardShareText(prep.decisionCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.legalFinancialCard) {
    parts.push(buildLegalFinancialShareText(prep.legalFinancialCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.explainCard) {
    parts.push(buildExplainCardShareText(prep.explainCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.summaryCard) {
    parts.push(buildSummaryCardShareText(prep.summaryCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.ideaCards) {
    parts.push(buildIdeaCardsShareText(prep.ideaCards));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.blocks?.length) {
   parts.push(...buildPrepBlockShareLines(prep.blocks));
  } else {
    if (prep.options?.length) {
      for (const o of prep.options) {
        parts.push(buildPrepOptionShareText(o));
      }
    }
    if (prep.body?.trim()) parts.push(prep.body.trim());
    if (prep.draftText?.trim()) {
      parts.push(buildLegacyDraftShareText(prep.draftText, prep.draftSubject));
    }
  }
  return parts.filter(Boolean).join("\n\n");
}
