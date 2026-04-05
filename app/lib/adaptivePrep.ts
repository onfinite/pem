import { SHOPPING_CARD_PRODUCTS_MAX } from "@/constants/shopping";

/**
 * Adaptive card payloads from `result.schema` — mirrors backend adaptive prep schemas.
 */

export type ShoppingProduct = {
  name: string;
  price: string;
  rating: number;
  reviewCount: number;
  reviewSnippet: string;
  customerSentiment: string;
  image: string;
  url: string;
  store: string;
  why: string;
  badge: string;
  pros: string[];
  cons: string[];
};

export type ShoppingCardPayload = {
  schema: "SHOPPING_CARD";
  summary: string;
  query: string;
  recommendation: string;
  buyingGuide: string;
  products: ShoppingProduct[];
};

export type DraftCardPayload = {
  schema: "DRAFT_CARD";
  summary: string;
  draftType: "email" | "message" | "post" | "proposal" | "other";
  subject: string;
  body: string;
  tone: "professional" | "casual" | "friendly" | "firm";
  assumptions: string;
};

export type PlaceRow = {
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
  photo: string;
  lat: number;
  lng: number;
  priceRange: string;
  hours: string;
  phone: string;
  /** Business website (not the Maps URL). */
  website: string;
  /** When present in sources only. */
  email: string;
  url: string;
  reviewSnippet: string;
  customerSatisfaction: string;
  pemNote: string;
};

export type PlaceCardPayload = {
  schema: "PLACE_CARD";
  summary: string;
  query: string;
  recommendation: string;
  places: PlaceRow[];
  mapCenterLat: number;
  mapCenterLng: number;
};

export type ComparisonOption = {
  name: string;
  logo: string;
  price: string;
  scores: Record<string, number>;
  pros: string[];
  cons: string[];
  bestFor: string;
};

export type ComparisonCardPayload = {
  schema: "COMPARISON_CARD";
  summary: string;
  query: string;
  criteria: string[];
  options: ComparisonOption[];
  winner: string;
  winnerReason: string;
};

export type ResearchSource = { title: string; url: string };
export type ResearchSection = { title: string; content: string };

export type ResearchCardPayload = {
  schema: "RESEARCH_CARD";
  summary: string;
  topic: string;
  executiveSummary: string;
  keyFacts: string[];
  sections: ResearchSection[];
  sources: ResearchSource[];
  lastUpdated: string;
};

export type PersonCardPayload = {
  schema: "PERSON_CARD";
  summary: string;
  name: string;
  photo: string;
  title: string;
  company: string;
  companyLogo: string;
  location: string;
  linkedin: string;
  twitter: string;
  website: string;
  bio: string;
  recentActivity: string[];
  pemNote: string;
};

export type MeetingBriefPayload = {
  schema: "MEETING_BRIEF";
  summary: string;
  meetingWith: string;
  photo: string;
  company: string;
  companyLogo: string;
  about: string;
  personBackground: string;
  recentNews: string[];
  suggestedTalkingPoints: string[];
  thingsToAvoid: string[];
  pemNote: string;
};

export type DecisionOption = {
  name: string;
  pros: string[];
  cons: string[];
};

export type DecisionCardPayload = {
  schema: "DECISION_CARD";
  summary: string;
  question: string;
  verdict: string;
  verdictReason: string;
  options: DecisionOption[];
  keyData: string[];
  confidence: "high" | "medium" | "low";
};

export type LegalClause = { title: string; text: string };

export type LegalFinancialCardPayload = {
  schema: "LEGAL_FINANCIAL_CARD";
  summary: string;
  topic: string;
  plainEnglish: string;
  clauses: LegalClause[];
  caveats: string[];
  sources: ResearchSource[];
};

export type ExplainCardPayload = {
  schema: "EXPLAIN_CARD";
  summary: string;
  concept: string;
  tldr: string;
  explanation: string;
  steps: string[];
  analogy: string;
  commonMistakes: string[];
};

export type SummaryCardPayload = {
  schema: "SUMMARY_CARD";
  summary: string;
  sourceUrl: string;
  sourceTitle: string;
  readingTime: string;
  tldr: string;
  keyPoints: string[];
  pullQuote: string;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
};

export type IdeaRow = {
  title: string;
  hook: string;
  angle: string;
  format: string;
};

export type IdeaCardsPayload = {
  schema: "IDEA_CARDS";
  summary: string;
  context: string;
  ideas: IdeaRow[];
};

export type EventsCardPayload = {
  schema: "EVENTS_CARD";
  summary: string;
  query: string;
  recommendation: string;
  events: {
    title: string;
    when: string;
    venue: string;
    address: string;
    link: string;
    photo: string;
    ticketHint: string;
    reviewSnippet: string;
    pemNote: string;
  }[];
};

export type FlightsCardPayload = {
  schema: "FLIGHTS_CARD";
  summary: string;
  query: string;
  recommendation: string;
  routeLabel: string;
  offers: {
    label: string;
    price: string;
    airline: string;
    duration: string;
    stops: string;
    bookingUrl: string;
    notes: string;
  }[];
};

export type BusinessCardPayload = {
  schema: "BUSINESS_CARD";
  summary: string;
  query: string;
  recommendation: string;
  businesses: {
    name: string;
    rating: number;
    reviewCount: number;
    phone: string;
    website: string;
    address: string;
    hours: string;
    photo: string;
    reviewSnippet: string;
    customerSatisfaction: string;
    mapsUrl: string;
    pemNote: string;
  }[];
};

export type TrendsCardPayload = {
  schema: "TRENDS_CARD";
  summary: string;
  query: string;
  recommendation: string;
  keyword: string;
  trendReadout: string;
  relatedQueries: string[];
  timeframe: string;
  sources: ResearchSource[];
};

export type MarketCardPayload = {
  schema: "MARKET_CARD";
  summary: string;
  query: string;
  recommendation: string;
  symbol: string;
  name: string;
  price: string;
  change: string;
  currency: string;
  sentiment: string;
  keyPoints: string[];
  sources: ResearchSource[];
};

export type JobsCardPayload = {
  schema: "JOBS_CARD";
  summary: string;
  query: string;
  recommendation: string;
  jobs: {
    title: string;
    company: string;
    location: string;
    link: string;
    snippet: string;
    salaryHint: string;
    employerRating: number;
    reviewSnippet: string;
    pemNote: string;
  }[];
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function parsePlaceRow(o: unknown): PlaceRow | null {
  if (!isRecord(o)) return null;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return null;
  return {
    name,
    address: typeof o.address === "string" ? o.address : "",
    rating: typeof o.rating === "number" && !Number.isNaN(o.rating) ? o.rating : 0,
    reviewCount:
      typeof o.reviewCount === "number" && !Number.isNaN(o.reviewCount) ? Math.floor(o.reviewCount) : 0,
    photo: typeof o.photo === "string" ? o.photo : "",
    lat: typeof o.lat === "number" && !Number.isNaN(o.lat) ? o.lat : 0,
    lng: typeof o.lng === "number" && !Number.isNaN(o.lng) ? o.lng : 0,
    priceRange: typeof o.priceRange === "string" ? o.priceRange : "",
    hours: typeof o.hours === "string" ? o.hours : "",
    phone: typeof o.phone === "string" ? o.phone : "",
    website: typeof o.website === "string" ? o.website : "",
    email: typeof o.email === "string" ? o.email : "",
    url: typeof o.url === "string" ? o.url : "",
    reviewSnippet: typeof o.reviewSnippet === "string" ? o.reviewSnippet : "",
    customerSatisfaction: typeof o.customerSatisfaction === "string" ? o.customerSatisfaction : "",
    pemNote: typeof o.pemNote === "string" ? o.pemNote : "",
  };
}

function parseProduct(o: unknown): ShoppingProduct | null {
  if (!isRecord(o)) return null;
  const pros = Array.isArray(o.pros) ? o.pros.filter((x): x is string => typeof x === "string") : [];
  const cons = Array.isArray(o.cons) ? o.cons.filter((x): x is string => typeof x === "string") : [];
  return {
    name: typeof o.name === "string" ? o.name : "",
    price: typeof o.price === "string" ? o.price : "",
    rating: typeof o.rating === "number" && !Number.isNaN(o.rating) ? o.rating : 0,
    reviewCount:
      typeof o.reviewCount === "number" && !Number.isNaN(o.reviewCount) ? Math.floor(o.reviewCount) : 0,
    reviewSnippet: typeof o.reviewSnippet === "string" ? o.reviewSnippet : "",
    customerSentiment: typeof o.customerSentiment === "string" ? o.customerSentiment : "",
    image: typeof o.image === "string" ? o.image : "",
    url: typeof o.url === "string" ? o.url : "",
    store: typeof o.store === "string" ? o.store : "",
    why: typeof o.why === "string" ? o.why : "",
    badge: typeof o.badge === "string" ? o.badge : "",
    pros,
    cons,
  };
}

function parseStringArray(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((i): i is string => typeof i === "string");
}

export type AdaptiveParseResult = {
  shoppingCard?: ShoppingCardPayload;
  draftCard?: DraftCardPayload;
  placeCard?: PlaceCardPayload;
  comparisonCard?: ComparisonCardPayload;
  researchCard?: ResearchCardPayload;
  personCard?: PersonCardPayload;
  meetingBrief?: MeetingBriefPayload;
  decisionCard?: DecisionCardPayload;
  legalFinancialCard?: LegalFinancialCardPayload;
  explainCard?: ExplainCardPayload;
  summaryCard?: SummaryCardPayload;
  ideaCards?: IdeaCardsPayload;
  eventsCard?: EventsCardPayload;
  flightsCard?: FlightsCardPayload;
  businessCard?: BusinessCardPayload;
  trendsCard?: TrendsCardPayload;
  marketCard?: MarketCardPayload;
  jobsCard?: JobsCardPayload;
};

/** Parse adaptive payloads from API `result` (no blocks). */
export function parseAdaptiveFromResult(
  result: Record<string, unknown> | null | undefined,
): AdaptiveParseResult {
  if (!result || typeof result.schema !== "string") {
    return {};
  }
  const sch = result.schema;

  if (sch === "COMPOSITE_BRIEF") {
    return {};
  }

  if (sch === "SHOPPING_CARD") {
    const productsRaw = Array.isArray(result.products) ? result.products : [];
    const products = productsRaw.map(parseProduct).filter((p): p is ShoppingProduct => p !== null && p.name.length > 0);
    if (!products.length) return {};
    return {
      shoppingCard: {
        schema: "SHOPPING_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        query: typeof result.query === "string" ? result.query : "",
        recommendation: typeof result.recommendation === "string" ? result.recommendation : "",
        buyingGuide: typeof result.buyingGuide === "string" ? result.buyingGuide : "",
        products: products.slice(0, SHOPPING_CARD_PRODUCTS_MAX),
      },
    };
  }

  if (sch === "PLACE_CARD") {
    const placesRaw = Array.isArray(result.places) ? result.places : [];
    const places = placesRaw.map(parsePlaceRow).filter((p): p is PlaceRow => p !== null);
    if (!places.length) return {};
    const mapCenterLat =
      typeof result.mapCenterLat === "number" && !Number.isNaN(result.mapCenterLat) ? result.mapCenterLat : 0;
    const mapCenterLng =
      typeof result.mapCenterLng === "number" && !Number.isNaN(result.mapCenterLng) ? result.mapCenterLng : 0;
    return {
      placeCard: {
        schema: "PLACE_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        query: typeof result.query === "string" ? result.query : "",
        recommendation: typeof result.recommendation === "string" ? result.recommendation : "",
        places: places.slice(0, 5),
        mapCenterLat,
        mapCenterLng,
      },
    };
  }

  if (sch === "DRAFT_CARD") {
    const body = typeof result.body === "string" ? result.body : "";
    if (!body.trim()) return {};
    const draftType = result.draftType;
    const tone = result.tone;
    return {
      draftCard: {
        schema: "DRAFT_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        draftType:
          draftType === "email" ||
          draftType === "message" ||
          draftType === "post" ||
          draftType === "proposal" ||
          draftType === "other"
            ? draftType
            : "other",
        subject: typeof result.subject === "string" ? result.subject : "",
        body,
        tone:
          tone === "professional" || tone === "casual" || tone === "friendly" || tone === "firm"
            ? tone
            : "professional",
        assumptions: typeof result.assumptions === "string" ? result.assumptions : "",
      },
    };
  }

  if (sch === "COMPARISON_CARD") {
    const optsRaw = Array.isArray(result.options) ? result.options : [];
    const options: ComparisonOption[] = [];
    for (const o of optsRaw) {
      if (!isRecord(o)) continue;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (!name) continue;
      const scores: Record<string, number> = {};
      if (isRecord(o.scores)) {
        for (const [k, v] of Object.entries(o.scores)) {
          if (typeof v === "number" && !Number.isNaN(v)) scores[k] = Math.min(5, Math.max(0, v));
        }
      }
      options.push({
        name,
        logo: typeof o.logo === "string" ? o.logo : "",
        price: typeof o.price === "string" ? o.price : "",
        scores,
        pros: parseStringArray(o.pros),
        cons: parseStringArray(o.cons),
        bestFor: typeof o.bestFor === "string" ? o.bestFor : "",
      });
    }
    if (options.length < 2) return {};
    return {
      comparisonCard: {
        schema: "COMPARISON_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        query: typeof result.query === "string" ? result.query : "",
        criteria: parseStringArray(result.criteria),
        options: options.slice(0, 4),
        winner: typeof result.winner === "string" ? result.winner : "",
        winnerReason: typeof result.winnerReason === "string" ? result.winnerReason : "",
      },
    };
  }

  if (sch === "RESEARCH_CARD") {
    const keyFacts = parseStringArray(result.keyFacts).filter(Boolean);
    if (!keyFacts.length) return {};
    const sectionsRaw = Array.isArray(result.sections) ? result.sections : [];
    const sections: ResearchSection[] = [];
    for (const s of sectionsRaw) {
      if (!isRecord(s)) continue;
      sections.push({
        title: typeof s.title === "string" ? s.title : "",
        content: typeof s.content === "string" ? s.content : "",
      });
    }
    const sourcesRaw = Array.isArray(result.sources) ? result.sources : [];
    const sources: ResearchSource[] = [];
    for (const s of sourcesRaw) {
      if (!isRecord(s)) continue;
      const url = typeof s.url === "string" ? s.url.trim() : "";
      if (!url) continue;
      sources.push({
        title: typeof s.title === "string" ? s.title : "",
        url,
      });
    }
    return {
      researchCard: {
        schema: "RESEARCH_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        topic: typeof result.topic === "string" ? result.topic : "",
        executiveSummary: typeof result.executiveSummary === "string" ? result.executiveSummary : "",
        keyFacts,
        sections,
        sources,
        lastUpdated: typeof result.lastUpdated === "string" ? result.lastUpdated : "",
      },
    };
  }

  if (sch === "PERSON_CARD") {
    const name = typeof result.name === "string" ? result.name.trim() : "";
    if (!name) return {};
    return {
      personCard: {
        schema: "PERSON_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        name,
        photo: typeof result.photo === "string" ? result.photo : "",
        title: typeof result.title === "string" ? result.title : "",
        company: typeof result.company === "string" ? result.company : "",
        companyLogo: typeof result.companyLogo === "string" ? result.companyLogo : "",
        location: typeof result.location === "string" ? result.location : "",
        linkedin: typeof result.linkedin === "string" ? result.linkedin : "",
        twitter: typeof result.twitter === "string" ? result.twitter : "",
        website: typeof result.website === "string" ? result.website : "",
        bio: typeof result.bio === "string" ? result.bio : "",
        recentActivity: parseStringArray(result.recentActivity),
        pemNote: typeof result.pemNote === "string" ? result.pemNote : "",
      },
    };
  }

  if (sch === "MEETING_BRIEF") {
    const mw = typeof result.meetingWith === "string" ? result.meetingWith.trim() : "";
    if (!mw) return {};
    return {
      meetingBrief: {
        schema: "MEETING_BRIEF",
        summary: typeof result.summary === "string" ? result.summary : "",
        meetingWith: mw,
        photo: typeof result.photo === "string" ? result.photo : "",
        company: typeof result.company === "string" ? result.company : "",
        companyLogo: typeof result.companyLogo === "string" ? result.companyLogo : "",
        about: typeof result.about === "string" ? result.about : "",
        personBackground: typeof result.personBackground === "string" ? result.personBackground : "",
        recentNews: parseStringArray(result.recentNews),
        suggestedTalkingPoints: parseStringArray(result.suggestedTalkingPoints),
        thingsToAvoid: parseStringArray(result.thingsToAvoid),
        pemNote: typeof result.pemNote === "string" ? result.pemNote : "",
      },
    };
  }

  if (sch === "DECISION_CARD") {
    const verdict = typeof result.verdict === "string" ? result.verdict.trim() : "";
    if (!verdict) return {};
    const optsRaw = Array.isArray(result.options) ? result.options : [];
    const options: DecisionOption[] = [];
    for (const o of optsRaw) {
      if (!isRecord(o)) continue;
      const n = typeof o.name === "string" ? o.name.trim() : "";
      if (!n) continue;
      options.push({
        name: n,
        pros: parseStringArray(o.pros),
        cons: parseStringArray(o.cons),
      });
    }
    if (options.length < 2) return {};
    const conf = result.confidence;
    return {
      decisionCard: {
        schema: "DECISION_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        question: typeof result.question === "string" ? result.question : "",
        verdict,
        verdictReason: typeof result.verdictReason === "string" ? result.verdictReason : "",
        options,
        keyData: parseStringArray(result.keyData),
        confidence: conf === "high" || conf === "medium" || conf === "low" ? conf : "medium",
      },
    };
  }

  if (sch === "LEGAL_FINANCIAL_CARD") {
    const plain = typeof result.plainEnglish === "string" ? result.plainEnglish.trim() : "";
    if (!plain) return {};
    const clausesRaw = Array.isArray(result.clauses) ? result.clauses : [];
    const clauses: LegalClause[] = [];
    for (const c of clausesRaw) {
      if (!isRecord(c)) continue;
      clauses.push({
        title: typeof c.title === "string" ? c.title : "",
        text: typeof c.text === "string" ? c.text : "",
      });
    }
    const sourcesRaw = Array.isArray(result.sources) ? result.sources : [];
    const sources: ResearchSource[] = [];
    for (const s of sourcesRaw) {
      if (!isRecord(s)) continue;
      const url = typeof s.url === "string" ? s.url.trim() : "";
      if (!url) continue;
      sources.push({ title: typeof s.title === "string" ? s.title : "", url });
    }
    return {
      legalFinancialCard: {
        schema: "LEGAL_FINANCIAL_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        topic: typeof result.topic === "string" ? result.topic : "",
        plainEnglish: plain,
        clauses,
        caveats: parseStringArray(result.caveats),
        sources,
      },
    };
  }

  if (sch === "EXPLAIN_CARD") {
    const explanation = typeof result.explanation === "string" ? result.explanation.trim() : "";
    if (!explanation) return {};
    return {
      explainCard: {
        schema: "EXPLAIN_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        concept: typeof result.concept === "string" ? result.concept : "",
        tldr: typeof result.tldr === "string" ? result.tldr : "",
        explanation,
        steps: parseStringArray(result.steps),
        analogy: typeof result.analogy === "string" ? result.analogy : "",
        commonMistakes: parseStringArray(result.commonMistakes),
      },
    };
  }

  if (sch === "SUMMARY_CARD") {
    const tldr = typeof result.tldr === "string" ? result.tldr.trim() : "";
    if (!tldr) return {};
    const sent = result.sentiment;
    return {
      summaryCard: {
        schema: "SUMMARY_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        sourceUrl: typeof result.sourceUrl === "string" ? result.sourceUrl : "",
        sourceTitle: typeof result.sourceTitle === "string" ? result.sourceTitle : "",
        readingTime: typeof result.readingTime === "string" ? result.readingTime : "",
        tldr,
        keyPoints: parseStringArray(result.keyPoints),
        pullQuote: typeof result.pullQuote === "string" ? result.pullQuote : "",
        sentiment:
          sent === "positive" || sent === "negative" || sent === "neutral" || sent === "mixed"
            ? sent
            : "neutral",
      },
    };
  }

  if (sch === "IDEA_CARDS") {
    const ideasRaw = Array.isArray(result.ideas) ? result.ideas : [];
    const ideas: IdeaRow[] = [];
    for (const i of ideasRaw) {
      if (!isRecord(i)) continue;
      const title = typeof i.title === "string" ? i.title.trim() : "";
      if (!title) continue;
      ideas.push({
        title,
        hook: typeof i.hook === "string" ? i.hook : "",
        angle: typeof i.angle === "string" ? i.angle : "",
        format: typeof i.format === "string" ? i.format : "",
      });
    }
    if (!ideas.length) return {};
    return {
      ideaCards: {
        schema: "IDEA_CARDS",
        summary: typeof result.summary === "string" ? result.summary : "",
        context: typeof result.context === "string" ? result.context : "",
        ideas: ideas.slice(0, 12),
      },
    };
  }

  if (sch === "EVENTS_CARD") {
    const raw = Array.isArray(result.events) ? result.events : [];
    const events: EventsCardPayload["events"] = [];
    for (const e of raw) {
      if (!isRecord(e)) continue;
      const title = typeof e.title === "string" ? e.title.trim() : "";
      if (!title) continue;
      events.push({
        title,
        when: typeof e.when === "string" ? e.when : "",
        venue: typeof e.venue === "string" ? e.venue : "",
        address: typeof e.address === "string" ? e.address : "",
        link: typeof e.link === "string" ? e.link : "",
        photo: typeof e.photo === "string" ? e.photo : "",
        ticketHint: typeof e.ticketHint === "string" ? e.ticketHint : "",
        reviewSnippet: typeof e.reviewSnippet === "string" ? e.reviewSnippet : "",
        pemNote: typeof e.pemNote === "string" ? e.pemNote : "",
      });
    }
    if (!events.length) return {};
    return {
      eventsCard: {
        schema: "EVENTS_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        query: typeof result.query === "string" ? result.query : "",
        recommendation: typeof result.recommendation === "string" ? result.recommendation : "",
        events: events.slice(0, 8),
      },
    };
  }

  if (sch === "FLIGHTS_CARD") {
    const raw = Array.isArray(result.offers) ? result.offers : [];
    const offers: FlightsCardPayload["offers"] = [];
    for (const x of raw) {
      if (!isRecord(x)) continue;
      const label = typeof x.label === "string" ? x.label.trim() : "";
      const priceStr = typeof x.price === "string" ? x.price.trim() : "";
      if (!label && !priceStr) continue;
      offers.push({
        label,
        price: priceStr,
        airline: typeof x.airline === "string" ? x.airline : "",
        duration: typeof x.duration === "string" ? x.duration : "",
        stops: typeof x.stops === "string" ? x.stops : "",
        bookingUrl: typeof x.bookingUrl === "string" ? x.bookingUrl : "",
        notes: typeof x.notes === "string" ? x.notes : "",
      });
    }
    if (!offers.length) return {};
    return {
      flightsCard: {
        schema: "FLIGHTS_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        query: typeof result.query === "string" ? result.query : "",
        recommendation: typeof result.recommendation === "string" ? result.recommendation : "",
        routeLabel: typeof result.routeLabel === "string" ? result.routeLabel : "",
        offers: offers.slice(0, 8),
      },
    };
  }

  if (sch === "BUSINESS_CARD") {
    const raw = Array.isArray(result.businesses) ? result.businesses : [];
    const businesses: BusinessCardPayload["businesses"] = [];
    for (const b of raw) {
      if (!isRecord(b)) continue;
      const name = typeof b.name === "string" ? b.name.trim() : "";
      if (!name) continue;
      businesses.push({
        name,
        rating: typeof b.rating === "number" && !Number.isNaN(b.rating) ? b.rating : 0,
        reviewCount:
          typeof b.reviewCount === "number" && !Number.isNaN(b.reviewCount) ? Math.floor(b.reviewCount) : 0,
        phone: typeof b.phone === "string" ? b.phone : "",
        website: typeof b.website === "string" ? b.website : "",
        address: typeof b.address === "string" ? b.address : "",
        hours: typeof b.hours === "string" ? b.hours : "",
        photo: typeof b.photo === "string" ? b.photo : "",
        reviewSnippet: typeof b.reviewSnippet === "string" ? b.reviewSnippet : "",
        customerSatisfaction: typeof b.customerSatisfaction === "string" ? b.customerSatisfaction : "",
        mapsUrl: typeof b.mapsUrl === "string" ? b.mapsUrl : "",
        pemNote: typeof b.pemNote === "string" ? b.pemNote : "",
      });
    }
    if (!businesses.length) return {};
    return {
      businessCard: {
        schema: "BUSINESS_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        query: typeof result.query === "string" ? result.query : "",
        recommendation: typeof result.recommendation === "string" ? result.recommendation : "",
        businesses: businesses.slice(0, 8),
      },
    };
  }

  if (sch === "TRENDS_CARD") {
    const sourcesRaw = Array.isArray(result.sources) ? result.sources : [];
    const sources: ResearchSource[] = [];
    for (const s of sourcesRaw) {
      if (!isRecord(s)) continue;
      const url = typeof s.url === "string" ? s.url.trim() : "";
      if (!url) continue;
      sources.push({ title: typeof s.title === "string" ? s.title : "", url });
    }
    const kw = typeof result.keyword === "string" ? result.keyword.trim() : "";
    const readout = typeof result.trendReadout === "string" ? result.trendReadout.trim() : "";
    if (!kw && !readout) return {};
    return {
      trendsCard: {
        schema: "TRENDS_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        query: typeof result.query === "string" ? result.query : "",
        recommendation: typeof result.recommendation === "string" ? result.recommendation : "",
        keyword: kw,
        trendReadout: readout,
        relatedQueries: parseStringArray(result.relatedQueries).slice(0, 12),
        timeframe: typeof result.timeframe === "string" ? result.timeframe : "",
        sources,
      },
    };
  }

  if (sch === "MARKET_CARD") {
    const sourcesRaw = Array.isArray(result.sources) ? result.sources : [];
    const sources: ResearchSource[] = [];
    for (const s of sourcesRaw) {
      if (!isRecord(s)) continue;
      const url = typeof s.url === "string" ? s.url.trim() : "";
      if (!url) continue;
      sources.push({ title: typeof s.title === "string" ? s.title : "", url });
    }
    const sym = typeof result.symbol === "string" ? result.symbol.trim() : "";
    if (!sym) return {};
    return {
      marketCard: {
        schema: "MARKET_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        query: typeof result.query === "string" ? result.query : "",
        recommendation: typeof result.recommendation === "string" ? result.recommendation : "",
        symbol: sym,
        name: typeof result.name === "string" ? result.name : "",
        price: typeof result.price === "string" ? result.price : "",
        change: typeof result.change === "string" ? result.change : "",
        currency: typeof result.currency === "string" ? result.currency : "",
        sentiment: typeof result.sentiment === "string" ? result.sentiment : "",
        keyPoints: parseStringArray(result.keyPoints).slice(0, 10),
        sources,
      },
    };
  }

  if (sch === "JOBS_CARD") {
    const raw = Array.isArray(result.jobs) ? result.jobs : [];
    const jobs: JobsCardPayload["jobs"] = [];
    for (const j of raw) {
      if (!isRecord(j)) continue;
      const title = typeof j.title === "string" ? j.title.trim() : "";
      if (!title) continue;
      jobs.push({
        title,
        company: typeof j.company === "string" ? j.company : "",
        location: typeof j.location === "string" ? j.location : "",
        link: typeof j.link === "string" ? j.link : "",
        snippet: typeof j.snippet === "string" ? j.snippet : "",
        salaryHint: typeof j.salaryHint === "string" ? j.salaryHint : "",
        employerRating:
          typeof j.employerRating === "number" && !Number.isNaN(j.employerRating) ? j.employerRating : 0,
        reviewSnippet: typeof j.reviewSnippet === "string" ? j.reviewSnippet : "",
        pemNote: typeof j.pemNote === "string" ? j.pemNote : "",
      });
    }
    if (!jobs.length) return {};
    return {
      jobsCard: {
        schema: "JOBS_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        query: typeof result.query === "string" ? result.query : "",
        recommendation: typeof result.recommendation === "string" ? result.recommendation : "",
        jobs: jobs.slice(0, 10),
      },
    };
  }

  return {};
}

export function hasAnyAdaptiveCard(r: AdaptiveParseResult): boolean {
  return Object.values(r).some(Boolean);
}
