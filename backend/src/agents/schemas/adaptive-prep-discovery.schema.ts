import { z } from 'zod';

import { upgradeGoogleImageSize } from '../../integrations/serpapi-image-url';

/** First-class discovery cards — events, flights, business, trends, market, jobs. */

const sourcePairSchema = z.object({
  title: z.string(),
  url: z.string(),
});

export const eventsCardModelSchema = z.object({
  summary: z.string(),
  query: z.string(),
  recommendation: z.string(),
  events: z
    .array(
      z.object({
        title: z.string(),
        when: z.string(),
        venue: z.string(),
        address: z.string(),
        link: z.string(),
        photo: z.string(),
        ticketHint: z.string(),
        reviewSnippet: z.string(),
        pemNote: z.string(),
      }),
    )
    .min(1)
    .max(8),
});

export type EventsCardModelOutput = z.infer<typeof eventsCardModelSchema>;

export type EventsCardPayload = EventsCardModelOutput & {
  schema: 'EVENTS_CARD';
};

export function normalizeEventsCard(
  raw: EventsCardModelOutput,
): EventsCardPayload {
  return {
    schema: 'EVENTS_CARD',
    summary: raw.summary.trim(),
    query: raw.query.trim(),
    recommendation: raw.recommendation.trim(),
    events: raw.events.slice(0, 8).map((e) => ({
      ...e,
      title: e.title.trim(),
      when: e.when.trim(),
      venue: e.venue.trim(),
      address: e.address.trim(),
      link: e.link.trim(),
      photo: upgradeGoogleImageSize(e.photo.trim()),
      ticketHint: e.ticketHint.trim(),
      reviewSnippet: e.reviewSnippet.trim(),
      pemNote: e.pemNote.trim(),
    })),
  };
}

export const flightsCardModelSchema = z.object({
  summary: z.string(),
  query: z.string(),
  recommendation: z.string(),
  routeLabel: z.string(),
  offers: z
    .array(
      z.object({
        label: z.string(),
        price: z.string(),
        airline: z.string(),
        duration: z.string(),
        stops: z.string(),
        bookingUrl: z.string(),
        notes: z.string(),
      }),
    )
    .min(1)
    .max(8),
});

export type FlightsCardModelOutput = z.infer<typeof flightsCardModelSchema>;

export type FlightsCardPayload = FlightsCardModelOutput & {
  schema: 'FLIGHTS_CARD';
};

export function normalizeFlightsCard(
  raw: FlightsCardModelOutput,
): FlightsCardPayload {
  return {
    schema: 'FLIGHTS_CARD',
    summary: raw.summary.trim(),
    query: raw.query.trim(),
    recommendation: raw.recommendation.trim(),
    routeLabel: raw.routeLabel.trim(),
    offers: raw.offers.slice(0, 8).map((o) => ({
      ...o,
      label: o.label.trim(),
      price: o.price.trim(),
      airline: o.airline.trim(),
      duration: o.duration.trim(),
      stops: o.stops.trim(),
      bookingUrl: o.bookingUrl.trim(),
      notes: o.notes.trim(),
    })),
  };
}

export const businessCardModelSchema = z.object({
  summary: z.string(),
  query: z.string(),
  recommendation: z.string(),
  businesses: z
    .array(
      z.object({
        name: z.string(),
        rating: z.number(),
        reviewCount: z.number(),
        phone: z.string(),
        website: z.string(),
        address: z.string(),
        hours: z.string(),
        photo: z.string(),
        reviewSnippet: z.string(),
        customerSatisfaction: z.string(),
        mapsUrl: z.string(),
        pemNote: z.string(),
      }),
    )
    .min(1)
    .max(8),
});

export type BusinessCardModelOutput = z.infer<typeof businessCardModelSchema>;

export type BusinessCardPayload = BusinessCardModelOutput & {
  schema: 'BUSINESS_CARD';
};

export function normalizeBusinessCard(
  raw: BusinessCardModelOutput,
): BusinessCardPayload {
  return {
    schema: 'BUSINESS_CARD',
    summary: raw.summary.trim(),
    query: raw.query.trim(),
    recommendation: raw.recommendation.trim(),
    businesses: raw.businesses.slice(0, 8).map((b) => ({
      ...b,
      name: b.name.trim(),
      phone: b.phone.trim(),
      website: b.website.trim(),
      address: b.address.trim(),
      hours: b.hours.trim(),
      photo: upgradeGoogleImageSize(b.photo.trim()),
      reviewSnippet: b.reviewSnippet.trim(),
      customerSatisfaction: b.customerSatisfaction.trim(),
      mapsUrl: b.mapsUrl.trim(),
      pemNote: b.pemNote.trim(),
      rating: Math.min(5, Math.max(0, b.rating)),
      reviewCount: Math.max(0, Math.floor(b.reviewCount)),
    })),
  };
}

export const trendsCardModelSchema = z.object({
  summary: z.string(),
  query: z.string(),
  recommendation: z.string(),
  keyword: z.string(),
  trendReadout: z.string(),
  relatedQueries: z.array(z.string()),
  timeframe: z.string(),
  sources: z.array(sourcePairSchema),
});

export type TrendsCardModelOutput = z.infer<typeof trendsCardModelSchema>;

export type TrendsCardPayload = TrendsCardModelOutput & {
  schema: 'TRENDS_CARD';
};

export function normalizeTrendsCard(
  raw: TrendsCardModelOutput,
): TrendsCardPayload {
  return {
    schema: 'TRENDS_CARD',
    summary: raw.summary.trim(),
    query: raw.query.trim(),
    recommendation: raw.recommendation.trim(),
    keyword: raw.keyword.trim(),
    trendReadout: raw.trendReadout.trim(),
    relatedQueries: raw.relatedQueries
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12),
    timeframe: raw.timeframe.trim(),
    sources: raw.sources
      .map((s) => ({ title: s.title.trim(), url: s.url.trim() }))
      .filter((s) => s.url.length > 0),
  };
}

export const marketCardModelSchema = z.object({
  summary: z.string(),
  query: z.string(),
  recommendation: z.string(),
  symbol: z.string(),
  name: z.string(),
  price: z.string(),
  change: z.string(),
  currency: z.string(),
  sentiment: z.string(),
  keyPoints: z.array(z.string()),
  sources: z.array(sourcePairSchema),
});

export type MarketCardModelOutput = z.infer<typeof marketCardModelSchema>;

export type MarketCardPayload = MarketCardModelOutput & {
  schema: 'MARKET_CARD';
};

export function normalizeMarketCard(
  raw: MarketCardModelOutput,
): MarketCardPayload {
  return {
    schema: 'MARKET_CARD',
    summary: raw.summary.trim(),
    query: raw.query.trim(),
    recommendation: raw.recommendation.trim(),
    symbol: raw.symbol.trim(),
    name: raw.name.trim(),
    price: raw.price.trim(),
    change: raw.change.trim(),
    currency: raw.currency.trim(),
    sentiment: raw.sentiment.trim(),
    keyPoints: raw.keyPoints
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10),
    sources: raw.sources
      .map((s) => ({ title: s.title.trim(), url: s.url.trim() }))
      .filter((s) => s.url.length > 0),
  };
}

export const jobsCardModelSchema = z.object({
  summary: z.string(),
  query: z.string(),
  recommendation: z.string(),
  jobs: z
    .array(
      z.object({
        title: z.string(),
        company: z.string(),
        location: z.string(),
        link: z.string(),
        snippet: z.string(),
        salaryHint: z.string(),
        employerRating: z.number(),
        reviewSnippet: z.string(),
        pemNote: z.string(),
      }),
    )
    .min(1)
    .max(10),
});

export type JobsCardModelOutput = z.infer<typeof jobsCardModelSchema>;

export type JobsCardPayload = JobsCardModelOutput & {
  schema: 'JOBS_CARD';
};

export function normalizeJobsCard(raw: JobsCardModelOutput): JobsCardPayload {
  return {
    schema: 'JOBS_CARD',
    summary: raw.summary.trim(),
    query: raw.query.trim(),
    recommendation: raw.recommendation.trim(),
    jobs: raw.jobs.slice(0, 10).map((j) => ({
      ...j,
      title: j.title.trim(),
      company: j.company.trim(),
      location: j.location.trim(),
      link: j.link.trim(),
      snippet: j.snippet.trim(),
      salaryHint: j.salaryHint.trim(),
      reviewSnippet: j.reviewSnippet.trim(),
      pemNote: j.pemNote.trim(),
      employerRating: Math.min(5, Math.max(0, j.employerRating)),
    })),
  };
}
