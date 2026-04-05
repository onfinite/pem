import { z } from 'zod';

/** Extended adaptive cards — see `pem-adaptive-prep-cards.mdc` + adaptive visual prep spec. */

const comparisonOptionSchema = z.object({
  name: z.string(),
  logo: z.string(),
  price: z.string(),
  scores: z.record(z.string(), z.number()),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  bestFor: z.string(),
});

export const comparisonCardModelSchema = z.object({
  summary: z.string(),
  query: z.string(),
  criteria: z.array(z.string()),
  options: z.array(comparisonOptionSchema).min(2).max(4),
  winner: z.string(),
  winnerReason: z.string(),
});

export type ComparisonCardModelOutput = z.infer<
  typeof comparisonCardModelSchema
>;

export type ComparisonCardPayload = ComparisonCardModelOutput & {
  schema: 'COMPARISON_CARD';
};

export function normalizeComparisonCard(
  raw: ComparisonCardModelOutput,
): ComparisonCardPayload {
  return {
    schema: 'COMPARISON_CARD',
    summary: raw.summary.trim(),
    query: raw.query.trim(),
    criteria: raw.criteria
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 8),
    options: raw.options.slice(0, 4).map((o) => ({
      ...o,
      name: o.name.trim(),
      logo: o.logo.trim(),
      price: o.price.trim(),
      bestFor: o.bestFor.trim(),
      pros: o.pros.map((s) => s.trim()).filter(Boolean),
      cons: o.cons.map((s) => s.trim()).filter(Boolean),
      scores: Object.fromEntries(
        Object.entries(o.scores).map(([k, v]) => [
          k.trim(),
          Math.min(5, Math.max(0, v)),
        ]),
      ),
    })),
    winner: raw.winner.trim(),
    winnerReason: raw.winnerReason.trim(),
  };
}

const sourcePairSchema = z.object({
  title: z.string(),
  url: z.string(),
});

const researchSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
});

export const researchCardModelSchema = z.object({
  summary: z.string(),
  topic: z.string(),
  executiveSummary: z.string(),
  keyFacts: z.array(z.string()).min(1).max(12),
  sections: z.array(researchSectionSchema),
  sources: z.array(sourcePairSchema),
  lastUpdated: z.string(),
});

export type ResearchCardModelOutput = z.infer<typeof researchCardModelSchema>;

export type ResearchCardPayload = ResearchCardModelOutput & {
  schema: 'RESEARCH_CARD';
};

export function normalizeResearchCard(
  raw: ResearchCardModelOutput,
): ResearchCardPayload {
  let summary = raw.summary.trim();
  if (!summary || summary.length < 12 || /^[0-9]+$/.test(summary)) {
    summary =
      raw.executiveSummary.trim().slice(0, 280) ||
      raw.topic.trim().slice(0, 280) ||
      'Research results ready.';
  }
  return {
    schema: 'RESEARCH_CARD',
    summary,
    topic: raw.topic.trim(),
    executiveSummary: raw.executiveSummary.trim(),
    keyFacts: raw.keyFacts
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12),
    sections: raw.sections
      .map((s) => ({
        title: s.title.trim(),
        content: s.content.trim(),
      }))
      .filter((s) => s.title.length > 0 || s.content.length > 0),
    sources: raw.sources
      .map((s) => ({
        title: s.title.trim(),
        url: s.url.trim(),
      }))
      .filter((s) => s.url.length > 0),
    lastUpdated: raw.lastUpdated.trim(),
  };
}

export const personCardModelSchema = z.object({
  summary: z.string(),
  name: z.string(),
  photo: z.string(),
  title: z.string(),
  company: z.string(),
  companyLogo: z.string(),
  location: z.string(),
  linkedin: z.string(),
  twitter: z.string(),
  website: z.string(),
  bio: z.string(),
  recentActivity: z.array(z.string()),
  pemNote: z.string(),
});

export type PersonCardModelOutput = z.infer<typeof personCardModelSchema>;

export type PersonCardPayload = PersonCardModelOutput & {
  schema: 'PERSON_CARD';
};

export function normalizePersonCard(
  raw: PersonCardModelOutput,
): PersonCardPayload {
  return {
    schema: 'PERSON_CARD',
    summary: raw.summary.trim(),
    name: raw.name.trim(),
    photo: raw.photo.trim(),
    title: raw.title.trim(),
    company: raw.company.trim(),
    companyLogo: raw.companyLogo.trim(),
    location: raw.location.trim(),
    linkedin: raw.linkedin.trim(),
    twitter: raw.twitter.trim(),
    website: raw.website.trim(),
    bio: raw.bio.trim(),
    recentActivity: raw.recentActivity
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8),
    pemNote: raw.pemNote.trim(),
  };
}

export const meetingBriefModelSchema = z.object({
  summary: z.string(),
  meetingWith: z.string(),
  photo: z.string(),
  company: z.string(),
  companyLogo: z.string(),
  about: z.string(),
  personBackground: z.string(),
  recentNews: z.array(z.string()),
  suggestedTalkingPoints: z.array(z.string()),
  thingsToAvoid: z.array(z.string()),
  pemNote: z.string(),
});

export type MeetingBriefModelOutput = z.infer<typeof meetingBriefModelSchema>;

export type MeetingBriefPayload = MeetingBriefModelOutput & {
  schema: 'MEETING_BRIEF';
};

export function normalizeMeetingBrief(
  raw: MeetingBriefModelOutput,
): MeetingBriefPayload {
  return {
    schema: 'MEETING_BRIEF',
    summary: raw.summary.trim(),
    meetingWith: raw.meetingWith.trim(),
    photo: raw.photo.trim(),
    company: raw.company.trim(),
    companyLogo: raw.companyLogo.trim(),
    about: raw.about.trim(),
    personBackground: raw.personBackground.trim(),
    recentNews: raw.recentNews
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8),
    suggestedTalkingPoints: raw.suggestedTalkingPoints
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12),
    thingsToAvoid: raw.thingsToAvoid
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8),
    pemNote: raw.pemNote.trim(),
  };
}

const decisionOptionSchema = z.object({
  name: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});

export const decisionCardModelSchema = z.object({
  summary: z.string(),
  question: z.string(),
  verdict: z.string(),
  verdictReason: z.string(),
  options: z.array(decisionOptionSchema).min(2).max(5),
  keyData: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type DecisionCardModelOutput = z.infer<typeof decisionCardModelSchema>;

export type DecisionCardPayload = DecisionCardModelOutput & {
  schema: 'DECISION_CARD';
};

export function normalizeDecisionCard(
  raw: DecisionCardModelOutput,
): DecisionCardPayload {
  return {
    schema: 'DECISION_CARD',
    summary: raw.summary.trim(),
    question: raw.question.trim(),
    verdict: raw.verdict.trim(),
    verdictReason: raw.verdictReason.trim(),
    options: raw.options.slice(0, 5).map((o) => ({
      name: o.name.trim(),
      pros: o.pros.map((s) => s.trim()).filter(Boolean),
      cons: o.cons.map((s) => s.trim()).filter(Boolean),
    })),
    keyData: raw.keyData
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12),
    confidence: raw.confidence,
  };
}

const legalClauseSchema = z.object({
  title: z.string(),
  text: z.string(),
});

export const legalFinancialCardModelSchema = z.object({
  summary: z.string(),
  topic: z.string(),
  plainEnglish: z.string(),
  clauses: z.array(legalClauseSchema),
  caveats: z.array(z.string()),
  sources: z.array(sourcePairSchema),
});

export type LegalFinancialCardModelOutput = z.infer<
  typeof legalFinancialCardModelSchema
>;

export type LegalFinancialCardPayload = LegalFinancialCardModelOutput & {
  schema: 'LEGAL_FINANCIAL_CARD';
};

export function normalizeLegalFinancialCard(
  raw: LegalFinancialCardModelOutput,
): LegalFinancialCardPayload {
  return {
    schema: 'LEGAL_FINANCIAL_CARD',
    summary: raw.summary.trim(),
    topic: raw.topic.trim(),
    plainEnglish: raw.plainEnglish.trim(),
    clauses: raw.clauses
      .map((c) => ({
        title: c.title.trim(),
        text: c.text.trim(),
      }))
      .filter((c) => c.title.length > 0 || c.text.length > 0),
    caveats: raw.caveats.map((s) => s.trim()).filter(Boolean),
    sources: raw.sources
      .map((s) => ({
        title: s.title.trim(),
        url: s.url.trim(),
      }))
      .filter((s) => s.url.length > 0),
  };
}

export const explainCardModelSchema = z.object({
  summary: z.string(),
  concept: z.string(),
  tldr: z.string(),
  explanation: z.string(),
  steps: z.array(z.string()),
  analogy: z.string(),
  commonMistakes: z.array(z.string()),
});

export type ExplainCardModelOutput = z.infer<typeof explainCardModelSchema>;

export type ExplainCardPayload = ExplainCardModelOutput & {
  schema: 'EXPLAIN_CARD';
};

export function normalizeExplainCard(
  raw: ExplainCardModelOutput,
): ExplainCardPayload {
  return {
    schema: 'EXPLAIN_CARD',
    summary: raw.summary.trim(),
    concept: raw.concept.trim(),
    tldr: raw.tldr.trim(),
    explanation: raw.explanation.trim(),
    steps: raw.steps.map((s) => s.trim()).filter(Boolean),
    analogy: raw.analogy.trim(),
    commonMistakes: raw.commonMistakes.map((s) => s.trim()).filter(Boolean),
  };
}

export const summaryCardModelSchema = z.object({
  summary: z.string(),
  sourceUrl: z.string(),
  sourceTitle: z.string(),
  readingTime: z.string(),
  tldr: z.string(),
  keyPoints: z.array(z.string()),
  pullQuote: z.string(),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
});

export type SummaryCardModelOutput = z.infer<typeof summaryCardModelSchema>;

export type SummaryCardPayload = SummaryCardModelOutput & {
  schema: 'SUMMARY_CARD';
};

export function normalizeSummaryCard(
  raw: SummaryCardModelOutput,
): SummaryCardPayload {
  return {
    schema: 'SUMMARY_CARD',
    summary: raw.summary.trim(),
    sourceUrl: raw.sourceUrl.trim(),
    sourceTitle: raw.sourceTitle.trim(),
    readingTime: raw.readingTime.trim(),
    tldr: raw.tldr.trim(),
    keyPoints: raw.keyPoints.map((s) => s.trim()).filter(Boolean),
    pullQuote: raw.pullQuote.trim(),
    sentiment: raw.sentiment,
  };
}

const ideaRowSchema = z.object({
  title: z.string(),
  hook: z.string(),
  angle: z.string(),
  format: z.string(),
});

export const ideaCardsModelSchema = z.object({
  summary: z.string(),
  context: z.string(),
  ideas: z.array(ideaRowSchema).min(1).max(12),
});

export type IdeaCardsModelOutput = z.infer<typeof ideaCardsModelSchema>;

export type IdeaCardsPayload = IdeaCardsModelOutput & {
  schema: 'IDEA_CARDS';
};

export function normalizeIdeaCards(
  raw: IdeaCardsModelOutput,
): IdeaCardsPayload {
  return {
    schema: 'IDEA_CARDS',
    summary: raw.summary.trim(),
    context: raw.context.trim(),
    ideas: raw.ideas.slice(0, 12).map((i) => ({
      title: i.title.trim(),
      hook: i.hook.trim(),
      angle: i.angle.trim(),
      format: i.format.trim(),
    })),
  };
}
