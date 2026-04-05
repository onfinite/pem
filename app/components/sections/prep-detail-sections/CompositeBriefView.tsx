import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import {
  fontFamily,
  fontSize,
  lh,
  lineHeight,
  radii,
  space,
} from "@/constants/typography";
import type { CompositeBriefPayload, CompositeSection } from "@/lib/compositePrep";
import { parsePemRecommendationData } from "@/lib/compositePrep";
import type {
  BusinessCardPayload,
  DraftCardPayload,
  EventsCardPayload,
  FlightsCardPayload,
  JobsCardPayload,
  PlaceCardPayload,
  PlaceRow,
  ShoppingCardPayload,
} from "@/lib/adaptivePrep";
import { pemSelection } from "@/lib/pemHaptics";
import { AlertTriangle, Check } from "lucide-react-native";
import type { MutableRefObject, RefObject } from "react";
import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  PrepBusinessExperience,
  PrepEventsExperience,
  PrepFlightsExperience,
  PrepJobsExperience,
} from "./PrepDiscoveryCards";
import PrepDraftDocument from "./PrepDraftDocument";
import PrepPlaceExperience from "./PrepPlaceExperience";
import PrepShoppingExperience from "./PrepShoppingExperience";

type Props = {
  brief: CompositeBriefPayload;
  /** Prep detail outer `ScrollView` — enables section pills to scroll to each block. */
  scrollParentRef?: RefObject<ScrollView | null>;
  /** Latest vertical scroll offset of that `ScrollView` (`onScroll` → `contentOffset.y`). */
  scrollOffsetYRef?: MutableRefObject<number>;
};

function SectionHeader({ title, emoji }: { title: string; emoji: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeaderRow}>
      {emoji.trim() ? (
        <PemText style={[styles.sectionEmoji, { color: colors.textPrimary }]}>{emoji}</PemText>
      ) : null}
      <PemText style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</PemText>
    </View>
  );
}

function PemRecommendationBlock({ data }: { data: Record<string, unknown> }) {
  const { colors } = useTheme();
  const parsed = parsePemRecommendationData(data);
  if (!parsed) {
    return (
      <PemText style={{ color: colors.textSecondary }}>
        Recommendation data was incomplete — open other sections above.
      </PemText>
    );
  }
  return (
    <View style={[styles.pemRecCard, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}>
      <View style={styles.pemRecInner}>
        <PemText style={[styles.pemRecLabel, { color: colors.textSecondary }]}>Pem&apos;s recommendation</PemText>
        <PemText style={[styles.verdict, { color: colors.textPrimary }]}>{parsed.verdict}</PemText>
        <PemText style={[styles.subLabel, { color: colors.textSecondary }]}>Why this works</PemText>
        {parsed.reasons.map((r, i) => (
          <View key={i} style={styles.reasonRow}>
            <PemText style={[styles.bullet, { color: colors.textTertiary }]}>•</PemText>
            <PemText style={[styles.reasonText, { color: colors.textPrimary }]}>{r}</PemText>
          </View>
        ))}
        {parsed.caveat ? (
          <View style={[styles.caveatBox, { backgroundColor: colors.secondarySurface }]}>
            <AlertTriangle size={14} color={colors.textTertiary} />
            <PemText style={[styles.caveatText, { color: colors.textSecondary }]}>{parsed.caveat}</PemText>
          </View>
        ) : null}
        <View style={[styles.nextBox, { backgroundColor: colors.secondarySurface }]}>
          <PemText style={[styles.nextLabel, { color: colors.textSecondary }]}>Do this now</PemText>
          <PemText style={[styles.nextText, { color: colors.textPrimary }]}>{parsed.nextAction}</PemText>
        </View>
      </View>
    </View>
  );
}

function OverviewSection({ data }: { data: Record<string, unknown> }) {
  const { colors } = useTheme();
  const summary = typeof data.summary === "string" ? data.summary : "";
  const bullets = Array.isArray(data.bullets)
    ? data.bullets.filter((b): b is string => typeof b === "string")
    : [];
  return (
    <View style={styles.gapSm}>
      {summary.trim() ? (
        <PemMarkdown variant="body" selectable>
          {summary.trim()}
        </PemMarkdown>
      ) : null}
      {bullets.length > 0 ? (
        <View style={styles.gapSm}>
          {bullets.map((b, i) => (
            <PemText key={i} style={[styles.bulletLine, { color: colors.textPrimary }]}>
              • {b}
            </PemText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function KeyFactsSection({ data }: { data: Record<string, unknown> }) {
  const { colors } = useTheme();
  const facts = Array.isArray(data.facts)
    ? data.facts.filter((f): f is string => typeof f === "string")
    : [];
  return (
    <View style={styles.gapSm}>
      {facts.map((f, i) => (
        <PemText key={i} style={[styles.bulletLine, { color: colors.textPrimary }]}>
          • {f}
        </PemText>
      ))}
    </View>
  );
}

function WarningsSection({ data }: { data: Record<string, unknown> }) {
  const { colors } = useTheme();
  const items = Array.isArray(data.items)
    ? data.items.filter((f): f is string => typeof f === "string")
    : [];
  return (
    <View style={[styles.warnShell, { borderColor: colors.borderMuted, backgroundColor: colors.secondarySurface }]}>
      {items.map((f, i) => (
        <View key={i} style={styles.warnRow}>
          <AlertTriangle size={14} color={colors.textTertiary} />
          <PemText style={[styles.warnText, { color: colors.textPrimary }]}>{f}</PemText>
        </View>
      ))}
    </View>
  );
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function coerceBusinessCard(d: Record<string, unknown>): BusinessCardPayload | null {
  const raw = d.businesses ?? d.places;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return {
    schema: "BUSINESS_CARD",
    summary: str(d.summary),
    query: str(d.query),
    recommendation: str(d.recommendation),
    businesses: raw.map((r: Record<string, unknown>) => ({
      name: str(r.name), rating: num(r.rating), reviewCount: num(r.reviewCount),
      phone: str(r.phone), website: str(r.website), address: str(r.address),
      hours: str(r.hours), photo: str(r.photo), reviewSnippet: str(r.reviewSnippet),
      customerSatisfaction: str(r.customerSatisfaction), mapsUrl: str(r.mapsUrl ?? r.url),
      pemNote: str(r.pemNote ?? r.why),
    })),
  };
}

function coercePlaceCard(d: Record<string, unknown>): PlaceCardPayload | null {
  const raw = d.places;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const places: PlaceRow[] = raw.map((r: Record<string, unknown>) => ({
    name: str(r.name), address: str(r.address), rating: num(r.rating),
    reviewCount: num(r.reviewCount), photo: str(r.photo), lat: num(r.lat),
    lng: num(r.lng), priceRange: str(r.priceRange ?? r.price), hours: str(r.hours),
    phone: str(r.phone), website: str(r.website), email: str(r.email),
    url: str(r.url), reviewSnippet: str(r.reviewSnippet),
    customerSatisfaction: str(r.customerSatisfaction), pemNote: str(r.pemNote ?? r.why),
  }));
  return {
    schema: "PLACE_CARD", summary: str(d.summary), query: str(d.query),
    recommendation: str(d.recommendation), places,
    mapCenterLat: num(d.mapCenterLat), mapCenterLng: num(d.mapCenterLng),
  };
}

function coerceFlightsCard(d: Record<string, unknown>): FlightsCardPayload | null {
  const raw = d.offers ?? d.routes ?? d.flights;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return {
    schema: "FLIGHTS_CARD", summary: str(d.summary), query: str(d.query),
    recommendation: str(d.recommendation), routeLabel: str(d.routeLabel),
    offers: raw.map((r: Record<string, unknown>) => ({
      label: str(r.label), price: str(r.price), airline: str(r.airline),
      duration: str(r.duration), stops: str(r.stops),
      bookingUrl: str(r.bookingUrl ?? r.url), notes: str(r.notes ?? r.times),
    })),
  };
}

function coerceShoppingCard(d: Record<string, unknown>): ShoppingCardPayload | null {
  const raw = d.products;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return {
    schema: "SHOPPING_CARD", summary: str(d.summary), query: str(d.query),
    recommendation: str(d.recommendation), buyingGuide: str(d.buyingGuide),
    products: raw.map((r: Record<string, unknown>) => ({
      name: str(r.name), price: str(r.price), rating: num(r.rating),
      reviewCount: num(r.reviewCount), reviewSnippet: str(r.reviewSnippet),
      customerSentiment: str(r.customerSentiment), image: str(r.image ?? r.photo),
      url: str(r.url), store: str(r.store), why: str(r.why ?? r.pemNote),
      badge: str(r.badge), pros: strArr(r.pros), cons: strArr(r.cons),
    })),
  };
}

function coerceEventsCard(d: Record<string, unknown>): EventsCardPayload | null {
  const raw = d.events;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return {
    schema: "EVENTS_CARD", summary: str(d.summary), query: str(d.query),
    recommendation: str(d.recommendation),
    events: raw.map((r: Record<string, unknown>) => ({
      title: str(r.title ?? r.name), when: str(r.when ?? r.date),
      venue: str(r.venue), address: str(r.address), link: str(r.link ?? r.url),
      photo: str(r.photo), ticketHint: str(r.ticketHint),
      reviewSnippet: str(r.reviewSnippet), pemNote: str(r.pemNote),
    })),
  };
}

function coerceJobsCard(d: Record<string, unknown>): JobsCardPayload | null {
  const raw = d.jobs;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return {
    schema: "JOBS_CARD", summary: str(d.summary), query: str(d.query),
    recommendation: str(d.recommendation),
    jobs: raw.map((r: Record<string, unknown>) => ({
      title: str(r.title), company: str(r.company), location: str(r.location),
      link: str(r.link ?? r.url), snippet: str(r.snippet),
      salaryHint: str(r.salaryHint), employerRating: num(r.employerRating),
      reviewSnippet: str(r.reviewSnippet), pemNote: str(r.pemNote),
    })),
  };
}

function coerceDraftCard(d: Record<string, unknown>): DraftCardPayload | null {
  const body = str(d.body);
  if (!body.trim()) return null;
  const validTypes = ["email", "message", "post", "proposal", "other"] as const;
  const rawType = str(d.draftType, "other");
  const draftType = validTypes.includes(rawType as typeof validTypes[number])
    ? (rawType as typeof validTypes[number])
    : "other";
  const validTones = ["professional", "casual", "friendly", "firm"] as const;
  const rawTone = str(d.tone, "professional");
  const tone = validTones.includes(rawTone as typeof validTones[number])
    ? (rawTone as typeof validTones[number])
    : "professional";
  return {
    schema: "DRAFT_CARD", summary: str(d.summary), draftType,
    subject: str(d.subject), body, tone, assumptions: str(d.assumptions),
  };
}

function parseChecklist(data: Record<string, unknown>): string[] {
  const raw = data.items ?? data.steps ?? data.tasks;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function ChecklistInlineSection({ items }: { items: string[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.gapSm}>
      {items.map((item, i) => (
        <View key={i} style={cs.checkRow}>
          <View style={[cs.checkBox, { borderColor: colors.borderMuted }]}>
            <Check size={12} stroke={colors.textTertiary} strokeWidth={2.5} />
          </View>
          <PemText style={[styles.bulletLine, { color: colors.textPrimary, flex: 1 }]}>{item}</PemText>
        </View>
      ))}
    </View>
  );
}

function GenericSectionBody({ section }: { section: CompositeSection }) {
  const { colors } = useTheme();
  const summary =
    typeof section.data.summary === "string" ? section.data.summary : "";
  const body =
    typeof section.data.body === "string"
      ? section.data.body
      : typeof section.data.text === "string"
        ? section.data.text
        : "";
  const prose = summary.trim() || body.trim();
  if (prose) {
    return (
      <PemMarkdown variant="body" selectable>
        {prose}
      </PemMarkdown>
    );
  }
  return (
    <PemText style={[styles.mutedJson, { color: colors.textSecondary }]}>
      {JSON.stringify(section.data, null, 2).slice(0, 2_000)}
    </PemText>
  );
}

/**
 * Try to render a section using the actual adaptive card experience component.
 * Returns the component if section data matches a card schema, null otherwise.
 * When this returns a component, the outer loop should skip its own SectionHeader
 * since the card component includes its own Hero.
 */
function tryCardExperience(section: CompositeSection): React.ReactNode | null {
  const d = section.data;
  const title = section.title || "";
  const schema = section.card_schema;

  if (schema === "BUSINESS_CARD" || (!schema && (d.businesses || (d.places && !d.mapCenterLat)))) {
    const card = coerceBusinessCard(d);
    if (card) return <PrepBusinessExperience data={card} prepTitle={title} sharePlainText="" />;
  }

  if (schema === "PLACE_CARD" || (!schema && d.places && d.mapCenterLat)) {
    const card = coercePlaceCard(d);
    if (card) return <PrepPlaceExperience data={card} prepTitle={title} sharePlainText="" />;
  }

  if (schema === "FLIGHTS_CARD" || (!schema && (d.offers || d.routes))) {
    const card = coerceFlightsCard(d);
    if (card) return <PrepFlightsExperience data={card} prepTitle={title} sharePlainText="" />;
  }

  if (schema === "SHOPPING_CARD" || (!schema && d.products)) {
    const card = coerceShoppingCard(d);
    if (card) return <PrepShoppingExperience data={card} prepTitle={title} sharePlainText="" />;
  }

  if (schema === "EVENTS_CARD" || (!schema && d.events)) {
    const card = coerceEventsCard(d);
    if (card) return <PrepEventsExperience data={card} prepTitle={title} sharePlainText="" />;
  }

  if (schema === "JOBS_CARD" || (!schema && d.jobs)) {
    const card = coerceJobsCard(d);
    if (card) return <PrepJobsExperience data={card} prepTitle={title} sharePlainText="" />;
  }

  if (schema === "DRAFT_CARD" || (!schema && d.body && d.draftType)) {
    const card = coerceDraftCard(d);
    if (card) return <PrepDraftDocument data={card} prepTitle={title} sharePlainText="" />;
  }

  return null;
}

function SectionBody({ section }: { section: CompositeSection }) {
  switch (section.type) {
    case "OVERVIEW":
      return <OverviewSection data={section.data} />;
    case "PEM_RECOMMENDATION":
      return <PemRecommendationBlock data={section.data} />;
    case "KEY_FACTS":
      return <KeyFactsSection data={section.data} />;
    case "WARNINGS":
      return <WarningsSection data={section.data} />;
    default:
      break;
  }

  if (section.type === "CHECKLIST" || section.type === "TIMELINE") {
    const items = parseChecklist(section.data);
    if (items.length > 0) return <ChecklistInlineSection items={items} />;
  }

  return <GenericSectionBody section={section} />;
}

const SCROLL_TO_SECTION_TOP_PAD = 10;

type MeasureInWindowCallback = (
  x: number,
  y: number,
  width: number,
  height: number,
) => void;

/** `ScrollView` ref typings omit `measureInWindow`; native host still implements it. */
function measureScrollHostInWindow(
  scrollView: ScrollView,
  callback: MeasureInWindowCallback,
): void {
  const host = scrollView as unknown as {
    measureInWindow: (cb: MeasureInWindowCallback) => void;
  };
  host.measureInWindow(callback);
}

export default function CompositeBriefView({ brief, scrollParentRef, scrollOffsetYRef }: Props) {
  const { colors } = useTheme();
  const sections = brief.sections;
  const sectionRefs = useRef<(View | null)[]>([]);

  const scrollToSection = useCallback(
    (index: number) => {
      const scroll = scrollParentRef?.current;
      const target = sectionRefs.current[index];
      if (!scroll || !target) return;
      pemSelection();
      /** Fabric / RN: `measureLayout(findNodeHandle(scroll))` breaks; use window coords + tracked offset. */
      target.measureInWindow((_tx, ty, _tw, _th) => {
        measureScrollHostInWindow(scroll, (_sx, sy, _sw, _sh) => {
          const scrollY = scrollOffsetYRef?.current ?? 0;
          const contentY = scrollY + (ty - sy) - SCROLL_TO_SECTION_TOP_PAD;
          scroll.scrollTo({ y: Math.max(0, contentY), animated: true });
        });
      });
    },
    [scrollParentRef, scrollOffsetYRef],
  );

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillScroll}
        contentContainerStyle={styles.pillRow}
      >
        {sections.map((s, i) => (
          <Pressable
            key={`${s.type}-${i}-pill`}
            accessibilityRole="button"
            accessibilityLabel={`Go to ${s.title}`}
            onPress={() => scrollToSection(i)}
            style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
          >
            <View
              style={[styles.pill, { borderColor: colors.borderMuted, backgroundColor: colors.secondarySurface }]}
            >
              <PemText style={styles.pillEmoji}>{s.emoji}</PemText>
              <PemText style={[styles.pillLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                {s.title}
              </PemText>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {sections.map((section, index) => {
        const cardNode = tryCardExperience(section);
        return (
          <View
            key={`${section.type}-${index}`}
            ref={(el) => {
              sectionRefs.current[index] = el;
            }}
            collapsable={false}
            style={[
              styles.sectionBlock,
              { borderBottomColor: colors.borderMuted },
              index === sections.length - 1 && styles.lastSection,
            ]}
          >
            {cardNode ? (
              cardNode
            ) : (
              <>
                {section.type !== "PEM_RECOMMENDATION" ? (
                  <>
                    <SectionHeader title={section.title} emoji={section.emoji} />
                    {section.agent_note ? (
                      <PemText style={[styles.agentNote, { color: colors.textSecondary }]}>{section.agent_note}</PemText>
                    ) : null}
                    {section.evidence_snippets && section.evidence_snippets.length > 0 ? (
                      <View
                        style={[
                          styles.evidenceBox,
                          { borderColor: colors.borderMuted, backgroundColor: colors.secondarySurface },
                        ]}
                      >
                        <PemText style={[styles.evidenceLabel, { color: colors.textSecondary }]}>
                          From research
                        </PemText>
                        {section.evidence_snippets.map((line, li) => (
                          <PemText
                            key={li}
                            selectable
                            style={[styles.evidenceLine, { color: colors.textPrimary }]}
                          >
                            {line.trim()}
                          </PemText>
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : null}
                <SectionBody section={section} />
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Collapsible original dump — trust / verification. */
export function PrepOriginalDumpCollapsible({ text }: { text: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const preview = text.trim().slice(0, 120);
  const clipped = text.trim().length > 120;
  return (
    <View style={[styles.dumpBox, { borderColor: colors.borderMuted }]}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button">
        <PemText style={[styles.dumpHint, { color: colors.textSecondary }]}>
          Original dump {open ? "▼" : "▶"}
        </PemText>
      </Pressable>
      {open ? (
        <PemText
          selectable
          style={[styles.dumpBody, { color: colors.textSecondary, fontStyle: "italic" }]}
        >
          {text.trim()}
        </PemText>
      ) : (
        <PemText style={[styles.dumpPreview, { color: colors.textSecondary, fontStyle: "italic" }]}>
          {preview}
          {clipped ? "…" : ""}
        </PemText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: space[4],
  },
  pillScroll: {
    maxHeight: 44,
  },
  pillRow: {
    gap: space[2],
    paddingVertical: space[1],
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 220,
  },
  pillEmoji: {
    fontSize: fontSize.sm,
  },
  pillLabel: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans.medium,
    flexShrink: 1,
  },
  sectionBlock: {
    paddingVertical: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space[3],
  },
  lastSection: {
    borderBottomWidth: 0,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  sectionEmoji: {
    fontSize: fontSize.md,
  },
  sectionTitle: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
  },
  agentNote: {
    fontSize: fontSize.xs,
    fontStyle: "italic",
  },
  evidenceBox: {
    marginTop: space[2],
    padding: space[3],
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[2],
  },
  evidenceLabel: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans.medium,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  evidenceLine: {
    fontSize: fontSize.xs,
    lineHeight: lh(fontSize.xs, lineHeight.relaxed),
  },
  gapSm: {
    gap: space[2],
  },
  bulletLine: {
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  pemRecCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  pemRecInner: {
    padding: space[4],
    gap: space[3],
  },
  pemRecLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  verdict: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
  },
  subLabel: {
    fontSize: fontSize.xs,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: space[1],
  },
  reasonRow: {
    flexDirection: "row",
    gap: space[2],
    alignItems: "flex-start",
  },
  bullet: {
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  reasonText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  caveatBox: {
    flexDirection: "row",
    gap: space[2],
    padding: space[3],
    borderRadius: radii.md,
    alignItems: "flex-start",
  },
  caveatText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  nextBox: {
    padding: space[3],
    borderRadius: radii.md,
    gap: space[1],
  },
  nextLabel: {
    fontSize: fontSize.xs,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontFamily: fontFamily.sans.medium,
  },
  nextText: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans.medium,
  },
  warnShell: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[3],
    gap: space[2],
  },
  warnRow: {
    flexDirection: "row",
    gap: space[2],
    alignItems: "flex-start",
  },
  warnText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  mutedJson: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans.regular,
  },
  dumpBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space[4],
    gap: space[2],
  },
  dumpHint: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans.medium,
  },
  dumpBody: {
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  dumpPreview: {
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
});

const cs = StyleSheet.create({
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2],
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
});
