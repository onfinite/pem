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
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Check,
  ClipboardList,
  FileEdit,
  FileText,
  LayoutList,
  ListTree,
  MapPin,
  Plane,
  ShoppingBag,
  StickyNote,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
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

/** Structured icons — do not use LLM emoji for section chrome. */
function iconForCardSchema(schema: CompositeSection["card_schema"]): LucideIcon | null {
  switch (schema) {
    case "SHOPPING_CARD":
      return ShoppingBag;
    case "PLACE_CARD":
      return MapPin;
    case "BUSINESS_CARD":
      return Building2;
    case "FLIGHTS_CARD":
      return Plane;
    case "EVENTS_CARD":
      return Calendar;
    case "JOBS_CARD":
      return Briefcase;
    case "DRAFT_CARD":
      return FileEdit;
    default:
      return null;
  }
}

function iconForSectionType(type: string): LucideIcon {
  switch (type) {
    case "OVERVIEW":
      return LayoutList;
    case "PEM_RECOMMENDATION":
      return BadgeCheck;
    case "KEY_FACTS":
      return ListTree;
    case "WARNINGS":
      return AlertTriangle;
    case "CHECKLIST":
    case "TIMELINE":
      return ClipboardList;
    case "RESOURCES":
      return BookOpen;
    case "COSTS":
      return StickyNote;
    default:
      return FileText;
  }
}

/**
 * Icon + title row for composite sections — matches `PrepPickSectionHeader` scale (display semibold, amber icon).
 */
function CompositeSectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.compositeTitleRow}>
      <Icon size={22} stroke={colors.pemAmber} strokeWidth={2.25} />
      <View style={styles.compositeTitleTextBlock}>
        <PemText style={[styles.compositeTitleText, { color: colors.textPrimary }]} numberOfLines={3}>
          {title.trim()}
        </PemText>
        {subtitle?.trim() ? (
          <PemText variant="caption" style={[styles.compositeTitleSub, { color: colors.textTertiary }]}>
            {subtitle.trim()}
          </PemText>
        ) : null}
      </View>
    </View>
  );
}

function iconForCompositeSection(s: CompositeSection): LucideIcon {
  const fromSchema = s.card_schema ? iconForCardSchema(s.card_schema) : null;
  if (fromSchema) return fromSchema;
  return iconForSectionType(s.type);
}

function PemRecommendationBlock({
  data,
  showChromeLabel = true,
}: {
  data: Record<string, unknown>;
  /** When false, outer `CompositeSectionTitle` already labeled the block. */
  showChromeLabel?: boolean;
}) {
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
    <View
      style={
        showChromeLabel
          ? [styles.pemRecCard, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]
          : styles.pemRecFlat
      }
    >
      <View style={[styles.pemRecInner, !showChromeLabel && styles.pemRecInnerTight]}>
        {showChromeLabel ? (
          <PemText style={[styles.pemRecLabel, { color: colors.textSecondary }]}>Pem&apos;s recommendation</PemText>
        ) : null}
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
      lat: num(r.lat), lng: num(r.lng),
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
      return <PemRecommendationBlock data={section.data} showChromeLabel={false} />;
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
  const teaser = brief.overview_teaser.trim();
  const overviewSection = brief.sections.find((s) => s.type === "OVERVIEW");
  const showOverviewBlock = teaser.length > 0 || Boolean(overviewSection);
  /** When the overview is its own block, skip duplicate OVERVIEW rows in the list below. */
  const bodySections = brief.sections.filter(
    (s) => !showOverviewBlock || s.type !== "OVERVIEW",
  );

  const sectionRefs = useRef<(View | null)[]>([]);

  const scrollToSection = useCallback(
    (blockIndex: number) => {
      const scroll = scrollParentRef?.current;
      const target = sectionRefs.current[blockIndex];
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

  type PillItem = { key: string; icon: LucideIcon; title: string; blockIndex: number };
  const pills: PillItem[] = [];
  if (showOverviewBlock) {
    pills.push({ key: "overview", icon: LayoutList, title: "Overview", blockIndex: 0 });
  }
  bodySections.forEach((s, i) => {
    pills.push({
      key: `${s.type}-${i}`,
      icon: iconForCompositeSection(s),
      title: s.title,
      blockIndex: (showOverviewBlock ? 1 : 0) + i,
    });
  });

  return (
    <View style={styles.wrapper}>
      {pills.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroll}
          contentContainerStyle={styles.pillRow}
        >
          {pills.map((p) => {
            const PillIcon = p.icon;
            return (
              <Pressable
                key={p.key}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${p.title}`}
                onPress={() => scrollToSection(p.blockIndex)}
                style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
              >
                <View
                  style={[styles.pill, { borderColor: colors.borderMuted, backgroundColor: colors.secondarySurface }]}
                >
                  <PillIcon size={15} stroke={colors.textSecondary} strokeWidth={2.25} />
                  <PemText style={[styles.pillLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                    {p.title}
                  </PemText>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {showOverviewBlock ? (
        <View
          ref={(el) => {
            sectionRefs.current[0] = el;
          }}
          collapsable={false}
          style={[
            styles.sectionShell,
            { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted },
          ]}
        >
          <CompositeSectionTitle icon={LayoutList} title="Overview" />
          {teaser ? (
            <PemMarkdown variant="body" selectable>
              {teaser}
            </PemMarkdown>
          ) : null}
          {!teaser && overviewSection ? <OverviewSection data={overviewSection.data} /> : null}
        </View>
      ) : null}

      {bodySections.map((section, index) => {
        const blockIndex = (showOverviewBlock ? 1 : 0) + index;
        const cardNode = tryCardExperience(section);
        const pemTitle = section.type === "PEM_RECOMMENDATION";
        return (
          <View
            key={`${section.type}-${index}-block`}
            ref={(el) => {
              sectionRefs.current[blockIndex] = el;
            }}
            collapsable={false}
            style={[
              styles.sectionShell,
              { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted },
            ]}
          >
            {cardNode ? (
              cardNode
            ) : (
              <>
                <CompositeSectionTitle
                  icon={pemTitle ? BadgeCheck : iconForCompositeSection(section)}
                  title={pemTitle ? "Pem's recommendation" : section.title.trim() || "Section"}
                />
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
    gap: space[5],
  },
  /** Bordered surface — each composite block is visually distinct. */
  sectionShell: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[3],
  },
  compositeTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2],
  },
  compositeTitleTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: space[1],
  },
  compositeTitleText: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
  },
  compositeTitleSub: {
    fontSize: fontSize.xs,
    lineHeight: lh(fontSize.xs, lineHeight.relaxed),
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
  pillLabel: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans.medium,
    flexShrink: 1,
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
  /** Nested under `CompositeSectionTitle` — no second card chrome. */
  pemRecFlat: {
    overflow: "hidden",
  },
  pemRecInner: {
    padding: space[4],
    gap: space[3],
  },
  pemRecInnerTight: {
    padding: 0,
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
