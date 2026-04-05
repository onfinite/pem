/**
 * First-class adaptive layouts for discovery intents (events, flights, business, trends, market, jobs).
 */
import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { RemoteImageOrPlaceholder } from "@/components/ui/SafeRemoteImage";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import type {
  BusinessCardPayload,
  EventsCardPayload,
  FlightsCardPayload,
  JobsCardPayload,
  MarketCardPayload,
  TrendsCardPayload,
} from "@/lib/adaptivePrep";
import { openExternalUrl } from "@/lib/openExternalUrl";
import * as Clipboard from "expo-clipboard";
import {
  Briefcase,
  Building2,
  Calendar,
  ExternalLink,
  LineChart,
  Plane,
  Star,
  TrendingUp,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { pemSelection } from "@/lib/pemHaptics";
import PrepContentSectionHeader from "./PrepContentSectionHeader";
import PrepShareRow from "./PrepShareRow";

function Hero({
  icon: Icon,
  kicker,
  title,
  sub,
}: {
  icon: LucideIcon;
  kicker: string;
  title: string;
  sub?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.borderMuted,
        },
      ]}
    >
      <View style={styles.heroIconRow}>
        <Icon size={18} stroke={colors.pemAmber} strokeWidth={2.25} />
        <PemText style={[styles.heroKicker, { color: colors.pemAmber }]}>{kicker}</PemText>
      </View>
      <PemText style={[styles.heroTitle, { color: colors.textPrimary }]}>{title}</PemText>
      {sub?.trim() ? (
        <PemText variant="caption" style={[styles.heroSub, { color: colors.textSecondary }]}>
          {sub}
        </PemText>
      ) : null}
    </View>
  );
}

async function copyLine(t: string): Promise<void> {
  const s = t.trim();
  if (!s) return;
  await Clipboard.setStringAsync(s);
  pemSelection();
}

export function PrepEventsExperience({
  data,
  prepTitle,
  sharePlainText,
}: {
  data: EventsCardPayload;
  prepTitle: string;
  sharePlainText: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Hero icon={Calendar} kicker="Events" title={data.recommendation} sub={data.query} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
        {data.events.map((e, i) => (
          <View
            key={`${e.title}-${i}`}
            style={[
              styles.tile,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.borderMuted,
                ...Platform.select({
                  ios: {
                    shadowColor: "#1c1a16",
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.08,
                    shadowRadius: 16,
                  },
                  android: { elevation: 2 },
                }),
              },
            ]}
          >
            <RemoteImageOrPlaceholder
              uri={e.photo.trim()}
              style={[styles.tileImage, { backgroundColor: colors.secondarySurface }]}
              placeholderStyle={{ backgroundColor: colors.secondarySurface }}
            />
            <View style={styles.tileBody}>
              <PemText style={[styles.tileName, { color: colors.textPrimary }]} numberOfLines={3}>
                {e.title}
              </PemText>
              {e.when.trim() ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }}>
                  {e.when}
                </PemText>
              ) : null}
              {e.venue.trim() ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }} numberOfLines={2}>
                  {e.venue}
                  {e.address.trim() ? ` · ${e.address}` : ""}
                </PemText>
              ) : null}
              {e.reviewSnippet.trim() ? (
                <View style={[styles.reviewBox, { borderColor: colors.borderMuted }]}>
                  <PemText variant="caption" style={{ color: colors.textTertiary }}>
                    What people say
                  </PemText>
                  <PemMarkdown variant="companion" selectable>
                    {e.reviewSnippet}
                  </PemMarkdown>
                </View>
              ) : null}
              {e.pemNote.trim() ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }} numberOfLines={3}>
                  {e.pemNote}
                </PemText>
              ) : null}
              {e.ticketHint.trim() ? (
                <PemText variant="caption" style={{ color: colors.pemAmber }} numberOfLines={2}>
                  {e.ticketHint}
                </PemText>
              ) : null}
              {e.link.trim() ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void openExternalUrl(e.link)}
                  style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.85 : 1, borderTopColor: colors.borderMuted }]}
                >
                  <ExternalLink size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                  <PemText style={[styles.linkText, { color: colors.pemAmber }]} numberOfLines={1}>
                    Details / tickets
                  </PemText>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
      {sharePlainText.trim() ? (
        <View style={[styles.shareFooter, { borderTopColor: colors.borderMuted }]}>
          <PrepShareRow variant="compact" text={sharePlainText.trim()} shareTitle={prepTitle} />
        </View>
      ) : null}
    </View>
  );
}

function splitRouteForBanner(routeLabel: string): { line1: string; line2?: string } {
  const s = routeLabel.trim();
  if (!s) return { line1: "" };
  const m = s.match(/^(.+?)\s*(?:→|➜|->|⇒)\s*(.+)$/u);
  if (m) {
    const left = m[1].trim();
    const right = m[2].trim();
    const bits = right
      .split(/\s*[·•]\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (bits.length >= 2) {
      return {
        line1: `${left} → ${bits[0]}`,
        line2: bits.slice(1).join(" · "),
      };
    }
    return { line1: `${left} → ${right}` };
  }
  return { line1: s };
}

function stopsTone(stops: string): "direct" | "stop" | "unknown" {
  const x = stops.toLowerCase();
  if (/\bnon-?stop|nonstop|direct\b/.test(x)) return "direct";
  if (/\b\d\s*stop|\bstop\b/.test(x)) return "stop";
  return "unknown";
}

export function PrepFlightsExperience({
  data,
  prepTitle,
  sharePlainText,
}: {
  data: FlightsCardPayload;
  prepTitle: string;
  sharePlainText: string;
}) {
  const { colors } = useTheme();
  const route = splitRouteForBanner(data.routeLabel || data.query);
  const titleLine = prepTitle.trim();
  const recLine = data.recommendation.trim();
  const titleMatchesRec =
    titleLine.length > 0 &&
    recLine.length > 0 &&
    titleLine.toLowerCase() === recLine.toLowerCase();
  /** Don’t repeat the screen title in the card. */
  const showRec = recLine.length > 0 && !titleMatchesRec;

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.flightHero,
          {
            backgroundColor: colors.cardBackground,
            borderColor: colors.borderMuted,
          },
        ]}
      >
        {showRec ? (
          <PemText
            style={[styles.flightRecommendation, { color: colors.textPrimary }]}
            selectable
            numberOfLines={8}
          >
            {recLine}
          </PemText>
        ) : null}

        {route.line1 ? (
          <View style={[styles.routeStrip, { backgroundColor: colors.secondarySurface, borderColor: colors.borderMuted }]}>
            <View style={styles.routeStripInner}>
              <PemText style={[styles.routePrimary, { color: colors.textPrimary }]} numberOfLines={2}>
                {route.line1}
              </PemText>
              {route.line2 ? (
                <PemText style={[styles.routeSecondary, { color: colors.textSecondary }]} numberOfLines={2}>
                  {route.line2}
                </PemText>
              ) : null}
            </View>
          </View>
        ) : null}
        {data.query.trim() && data.query !== data.routeLabel ? (
          <PemText variant="caption" style={{ color: colors.textTertiary, marginTop: space[1] }}>
            {data.query}
          </PemText>
        ) : null}
      </View>

      {data.offers.length > 0 ? (
        <PrepContentSectionHeader title="Options" subtitle="Best, cheaper, and more" />
      ) : null}

      <View style={styles.stack}>
        {data.offers.map((o, i) => {
          const st = stopsTone(o.stops);
          const chipBorder =
            st === "direct" ? colors.pemAmber : st === "stop" ? colors.borderMuted : colors.borderMuted;
          return (
            <View
              key={`${o.label}-${i}`}
              style={[
                styles.flightCard,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.borderMuted,
                },
              ]}
            >
              <View style={styles.flightCardHeader}>
                <View style={[styles.flightBadge, { backgroundColor: colors.secondarySurface }]}>
                  <PemText style={[styles.flightBadgeText, { color: colors.pemAmber }]}>
                    {o.label.trim() || (i === 0 ? "Top pick" : `Option ${i + 1}`)}
                  </PemText>
                </View>
                {o.price.trim() ? (
                  <View style={styles.flightPriceCol}>
                    <PemText style={[styles.flightPriceLabel, { color: colors.textTertiary }]}>From</PemText>
                    <PemText style={[styles.flightPriceHuge, { color: colors.textPrimary }]}>{o.price}</PemText>
                  </View>
                ) : null}
              </View>

              <View style={styles.flightMetaRow}>
                <Plane size={14} stroke={colors.textSecondary} strokeWidth={2} />
                <PemText style={[styles.flightAirline, { color: colors.textPrimary }]} numberOfLines={2}>
                  {o.airline.trim() || "Airline"}
                </PemText>
              </View>

              <View style={styles.flightChipsRow}>
                {o.duration.trim() ? (
                  <View style={[styles.flightChip, { borderColor: colors.borderMuted, backgroundColor: colors.secondarySurface }]}>
                    <PemText style={[styles.flightChipText, { color: colors.textSecondary }]}>{o.duration}</PemText>
                  </View>
                ) : null}
                {o.stops.trim() ? (
                  <View
                    style={[
                      styles.flightChip,
                      { borderColor: chipBorder, backgroundColor: colors.secondarySurface },
                    ]}
                  >
                    <PemText style={[styles.flightChipText, { color: colors.textPrimary }]}>{o.stops}</PemText>
                  </View>
                ) : null}
              </View>

              {o.notes.trim() ? (
                <PemText style={[styles.flightTimes, { color: colors.textSecondary }]}>{o.notes}</PemText>
              ) : null}

              {o.bookingUrl.trim() ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void openExternalUrl(o.bookingUrl)}
                  style={({ pressed }) => [
                    styles.linkRow,
                    styles.flightDealLink,
                    { borderTopColor: colors.borderMuted, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <ExternalLink size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                  <PemText style={[styles.linkText, { color: colors.pemAmber }]} numberOfLines={1}>
                    View deal
                  </PemText>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
      {sharePlainText.trim() ? (
        <View style={[styles.shareFooter, { borderTopColor: colors.borderMuted }]}>
          <PrepShareRow variant="compact" text={sharePlainText.trim()} shareTitle={prepTitle} />
        </View>
      ) : null}
    </View>
  );
}

function starsLine(r: number, count: number): string | null {
  if (r <= 0 && count <= 0) return null;
  const a = r > 0 ? `${r.toFixed(1)} ★` : null;
  const b = count > 0 ? `${count.toLocaleString()} reviews` : null;
  return [a, b].filter(Boolean).join(" · ");
}

export function PrepBusinessExperience({
  data,
  prepTitle,
  sharePlainText,
}: {
  data: BusinessCardPayload;
  prepTitle: string;
  sharePlainText: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Hero icon={Building2} kicker="Businesses" title={data.recommendation} sub={data.query} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
        {data.businesses.map((b, i) => (
          <View
            key={`${b.name}-${i}`}
            style={[
              styles.tile,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.borderMuted,
                ...Platform.select({
                  ios: {
                    shadowColor: "#1c1a16",
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.08,
                    shadowRadius: 16,
                  },
                  android: { elevation: 2 },
                }),
              },
            ]}
          >
            <RemoteImageOrPlaceholder
              uri={b.photo.trim()}
              style={[styles.tileImage, { backgroundColor: colors.secondarySurface }]}
              placeholderStyle={{ backgroundColor: colors.secondarySurface }}
            />
            <View style={styles.tileBody}>
              <PemText style={[styles.tileName, { color: colors.textPrimary }]} numberOfLines={3}>
                {b.name}
              </PemText>
              {starsLine(b.rating, b.reviewCount) ? (
                <View style={styles.starRow}>
                  <Star size={14} stroke={colors.pemAmber} strokeWidth={2} />
                  <PemText variant="caption" style={{ color: colors.textSecondary }}>
                    {starsLine(b.rating, b.reviewCount)}
                  </PemText>
                </View>
              ) : null}
              {(b.reviewSnippet.trim() || b.customerSatisfaction.trim()) ? (
                <View style={[styles.reviewBox, { borderColor: colors.borderMuted }]}>
                  <PemText variant="caption" style={{ color: colors.textTertiary }}>
                    Reviews & satisfaction
                  </PemText>
                  {b.customerSatisfaction.trim() ? (
                    <PemText variant="caption" style={{ color: colors.textPrimary }}>
                      {b.customerSatisfaction}
                    </PemText>
                  ) : null}
                  {b.reviewSnippet.trim() ? (
                    <PemMarkdown variant="companion" selectable>
                      {b.reviewSnippet}
                    </PemMarkdown>
                  ) : null}
                </View>
              ) : null}
              {b.address.trim() ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }} numberOfLines={3}>
                  {b.address}
                </PemText>
              ) : null}
              {b.pemNote.trim() ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }} numberOfLines={3}>
                  {b.pemNote}
                </PemText>
              ) : null}
              {b.mapsUrl.trim() ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void openExternalUrl(b.mapsUrl)}
                  style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.85 : 1, borderTopColor: colors.borderMuted }]}
                >
                  <ExternalLink size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                  <PemText style={[styles.linkText, { color: colors.pemAmber }]} numberOfLines={1}>
                    Maps & reviews
                  </PemText>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
      {sharePlainText.trim() ? (
        <View style={[styles.shareFooter, { borderTopColor: colors.borderMuted }]}>
          <PrepShareRow variant="compact" text={sharePlainText.trim()} shareTitle={prepTitle} />
        </View>
      ) : null}
    </View>
  );
}

export function PrepTrendsExperience({
  data,
  prepTitle,
  sharePlainText,
}: {
  data: TrendsCardPayload;
  prepTitle: string;
  sharePlainText: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Hero icon={TrendingUp} kicker="Trends" title={data.recommendation} sub={data.keyword || data.query} />
      <View style={[styles.article, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}>
        {data.timeframe.trim() ? (
          <PemText variant="caption" style={{ color: colors.textTertiary }}>
            {data.timeframe}
          </PemText>
        ) : null}
        <PemMarkdown variant="companion" selectable>
          {data.trendReadout}
        </PemMarkdown>
        {data.relatedQueries.length > 0 ? (
          <View style={{ marginTop: space[3] }}>
            <PemText variant="caption" style={{ color: colors.textTertiary }}>
              Related
            </PemText>
            {data.relatedQueries.map((q, i) => (
              <PemText key={`${q}-${i}`} variant="caption" style={{ color: colors.textSecondary }}>
                · {q}
              </PemText>
            ))}
          </View>
        ) : null}
        {data.sources.length > 0 ? (
          <View style={{ marginTop: space[3], gap: space[2] }}>
            {data.sources.map((s, i) => (
              <Pressable key={`${s.url}-${i}`} onPress={() => void openExternalUrl(s.url)}>
                <PemText style={[styles.sourceLink, { color: colors.pemAmber }]} numberOfLines={2}>
                  {s.title.trim() || s.url}
                </PemText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      {sharePlainText.trim() ? (
        <View style={[styles.shareFooter, { borderTopColor: colors.borderMuted }]}>
          <PrepShareRow variant="compact" text={sharePlainText.trim()} shareTitle={prepTitle} />
        </View>
      ) : null}
    </View>
  );
}

export function PrepMarketExperience({
  data,
  prepTitle,
  sharePlainText,
}: {
  data: MarketCardPayload;
  prepTitle: string;
  sharePlainText: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Hero icon={LineChart} kicker="Market" title={data.recommendation} sub={data.query} />
      <View style={[styles.marketHero, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}>
        <PemText style={[styles.sym, { color: colors.textPrimary }]}>{data.symbol}</PemText>
        <PemText variant="caption" style={{ color: colors.textSecondary }}>
          {data.name}
        </PemText>
        <View style={styles.priceRowBig}>
          <PemText style={[styles.priceHuge, { color: colors.textPrimary }]}>{data.price}</PemText>
          {data.change.trim() ? (
            <PemText variant="caption" style={{ color: colors.textSecondary }}>
              {data.change} · {data.currency}
            </PemText>
          ) : null}
        </View>
        {data.sentiment.trim() ? (
          <View style={[styles.reviewBox, { borderColor: colors.borderMuted, marginTop: space[3] }]}>
            <PemText variant="caption" style={{ color: colors.textTertiary }}>
              Sentiment
            </PemText>
            <PemText style={{ color: colors.textPrimary }}>{data.sentiment}</PemText>
          </View>
        ) : null}
        {data.keyPoints.length > 0 ? (
          <View style={{ marginTop: space[3] }}>
            {data.keyPoints.map((k, i) => (
              <PemText key={`${k}-${i}`} variant="caption" style={{ color: colors.textSecondary, marginBottom: space[1] }}>
                • {k}
              </PemText>
            ))}
          </View>
        ) : null}
        {data.sources.length > 0 ? (
          <View style={{ marginTop: space[3], gap: space[2] }}>
            {data.sources.map((s, i) => (
              <Pressable key={`${s.url}-${i}`} onPress={() => void openExternalUrl(s.url)}>
                <PemText style={[styles.sourceLink, { color: colors.pemAmber }]} numberOfLines={2}>
                  {s.title.trim() || s.url}
                </PemText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      {sharePlainText.trim() ? (
        <View style={[styles.shareFooter, { borderTopColor: colors.borderMuted }]}>
          <PrepShareRow variant="compact" text={sharePlainText.trim()} shareTitle={prepTitle} />
        </View>
      ) : null}
    </View>
  );
}

export function PrepJobsExperience({
  data,
  prepTitle,
  sharePlainText,
}: {
  data: JobsCardPayload;
  prepTitle: string;
  sharePlainText: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Hero icon={Briefcase} kicker="Jobs" title={data.recommendation} sub={data.query} />
      <View style={styles.stack}>
        {data.jobs.map((j, i) => (
          <View
            key={`${j.title}-${i}`}
            style={[
              styles.rowCard,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.borderMuted,
              },
            ]}
          >
            <PemText style={[styles.tileName, { color: colors.textPrimary }]}>{j.title}</PemText>
            <PemText variant="caption" style={{ color: colors.textSecondary }}>
              {j.company}
              {j.location.trim() ? ` · ${j.location}` : ""}
            </PemText>
            {j.salaryHint.trim() ? (
              <PemText variant="caption" style={{ color: colors.pemAmber, marginTop: space[1] }}>
                {j.salaryHint}
              </PemText>
            ) : null}
            {j.employerRating > 0 || j.reviewSnippet.trim() ? (
              <View style={[styles.reviewBox, { borderColor: colors.borderMuted, marginTop: space[2] }]}>
                <PemText variant="caption" style={{ color: colors.textTertiary }}>
                  Employer reputation
                </PemText>
                {j.employerRating > 0 ? (
                  <PemText variant="caption" style={{ color: colors.textSecondary }}>
                    {j.employerRating.toFixed(1)} ★
                  </PemText>
                ) : null}
                {j.reviewSnippet.trim() ? (
                  <PemMarkdown variant="companion" selectable>
                    {j.reviewSnippet}
                  </PemMarkdown>
                ) : null}
              </View>
            ) : null}
            {j.snippet.trim() ? (
              <PemText variant="caption" style={{ color: colors.textSecondary, marginTop: space[2] }} numberOfLines={4}>
                {j.snippet}
              </PemText>
            ) : null}
            {j.pemNote.trim() ? (
              <PemText variant="caption" style={{ color: colors.textSecondary, marginTop: space[1] }} numberOfLines={2}>
                {j.pemNote}
              </PemText>
            ) : null}
            {j.link.trim() ? (
              <View style={[styles.linkRow, { borderTopColor: colors.borderMuted, marginTop: space[2] }]}>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void openExternalUrl(j.link)}
                  style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.85 : 1, flexDirection: "row", alignItems: "center", gap: space[2] }]}
                >
                  <ExternalLink size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                  <PemText style={[styles.linkText, { color: colors.pemAmber }]} numberOfLines={1}>
                    Apply / details
                  </PemText>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Copy job link" onPress={() => void copyLine(j.link)}>
                  <PemText variant="caption" style={{ color: colors.textTertiary }}>
                    Copy link
                  </PemText>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
      </View>
      {sharePlainText.trim() ? (
        <View style={[styles.shareFooter, { borderTopColor: colors.borderMuted }]}>
          <PrepShareRow variant="compact" text={sharePlainText.trim()} shareTitle={prepTitle} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[5] },
  hero: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[2],
  },
  heroIconRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  heroKicker: {
    fontFamily: fontFamily.sans.semibold,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontSize: fontSize.xs,
  },
  heroTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xxl,
    lineHeight: lh(fontSize.xxl, lineHeight.snug),
  },
  heroSub: { marginTop: space[1] },
  hScroll: { gap: space[3], paddingVertical: space[1], paddingRight: space[2] },
  tile: {
    width: 280,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  tileImage: { width: "100%", height: 140 },
  tileBody: { padding: space[4], gap: space[2] },
  tileName: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
  },
  stack: { gap: space[3] },
  rowCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[1],
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  offerLabel: { fontFamily: fontFamily.sans.semibold, fontSize: fontSize.sm },
  priceBig: { fontFamily: fontFamily.display.semibold, fontSize: fontSize.xl },
  priceRowBig: { flexDirection: "row", alignItems: "baseline", gap: space[2], flexWrap: "wrap" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  linkText: { flex: 1, fontFamily: fontFamily.sans.medium, fontSize: fontSize.sm },
  shareFooter: {
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  reviewBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: space[3],
    gap: space[1],
  },
  starRow: { flexDirection: "row", alignItems: "center", gap: space[1] },
  article: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[2],
  },
  sourceLink: { fontFamily: fontFamily.sans.medium, fontSize: fontSize.sm },
  marketHero: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[2],
  },
  sym: { fontFamily: fontFamily.display.semibold, fontSize: fontSize.xxxl },
  priceHuge: { fontFamily: fontFamily.display.semibold, fontSize: fontSize.xxl },
  flightHero: {
    alignSelf: "stretch",
    width: "100%",
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[3],
  },
  flightRecommendation: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
  },
  routeStrip: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    gap: space[1],
  },
  routeStripInner: { gap: space[1] },
  routePrimary: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.snug),
  },
  routeSecondary: {
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  flightDealLink: {
    marginTop: space[2],
  },
  flightCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[2],
    ...Platform.select({
      ios: {
        shadowColor: "#1c1a16",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 1 },
    }),
  },
  flightCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space[3],
  },
  flightBadge: {
    borderRadius: radii.sm,
    paddingHorizontal: space[2],
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  flightBadgeText: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.2,
  },
  flightPriceCol: { alignItems: "flex-end" },
  flightPriceLabel: { fontSize: fontSize.xs },
  flightPriceHuge: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xxl,
    lineHeight: lh(fontSize.xxl, lineHeight.tight),
  },
  flightMetaRow: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[1] },
  flightAirline: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.md,
    flex: 1,
  },
  flightChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[1] },
  flightChip: {
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[3],
    paddingVertical: 6,
  },
  flightChipText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
  },
  flightTimes: {
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
    marginTop: space[1],
  },
});
