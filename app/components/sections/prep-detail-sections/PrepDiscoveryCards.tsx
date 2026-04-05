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
import {
  isLikelyMapsHttpUrl,
  labelForPlaceRowAction,
  openBusinessListingInMaps,
} from "@/lib/placeLinks";
import { openExternalUrl } from "@/lib/openExternalUrl";
import * as Clipboard from "expo-clipboard";
import {
  Briefcase,
  Building2,
  Calendar,
  ChevronRight,
  Copy,
  ExternalLink,
  LineChart,
  MapPin,
  Phone,
  Plane,
  Star,
  TrendingUp,
} from "lucide-react-native";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { pemSelection } from "@/lib/pemHaptics";
import { PICK_INTROS, PrepPickSectionHeader } from "./PrepPickSectionChrome";
import PrepShareRow from "./PrepShareRow";

const ADDR_COPY_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;

async function copyLine(t: string): Promise<void> {
  const s = t.trim();
  if (!s) return;
  await Clipboard.setStringAsync(s);
  pemSelection();
}

/** Align with PLACE_CARD: native Maps when possible; label clarifies Google Maps listing vs site. */
function businessPrimaryLinkLabel(b: BusinessCardPayload["businesses"][number]): string {
  const u = b.mapsUrl.trim();
  const kind = labelForPlaceRowAction({ lat: b.lat, lng: b.lng, urlTrimmed: u });
  if (kind === "Map" && u && isLikelyMapsHttpUrl(u)) return "Google Maps";
  if (kind === "Map") return "Maps";
  return "Website";
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
      <PrepPickSectionHeader
        icon={Calendar}
        label="Events"
        intro={PICK_INTROS.events}
        meta={data.query.trim() || undefined}
        iconAccent="muted"
      />
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
  const titleLine = prepTitle.trim();
  const recLine = data.recommendation.trim();
  const titleMatchesRec =
    titleLine.length > 0 &&
    recLine.length > 0 &&
    titleLine.toLowerCase() === recLine.toLowerCase();
  /** Don’t repeat the screen title in the card. */
  const showRec = recLine.length > 0 && !titleMatchesRec;

  const showRecommendationBlock = showRec;

  return (
    <View style={styles.root}>
      <PrepPickSectionHeader
        icon={Plane}
        label="Flights"
        intro={PICK_INTROS.flights}
        meta={data.routeLabel.trim() || data.query.trim() || undefined}
      />
      {showRecommendationBlock ? (
        <PemText variant="caption" style={[styles.flightRecInline, { color: colors.textSecondary }]}>
          {recLine}
        </PemText>
      ) : null}

      {data.offers.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hScroll}
          decelerationRate="fast"
        >
          {data.offers.map((o, i) => {
            const tripMeta = [o.duration.trim(), o.stops.trim()].filter(Boolean).join(" · ");
            const badge = o.label.trim() || (i === 0 ? "Best" : "");
            const notesLine = o.notes.trim();
            const schedulePrimary = notesLine || tripMeta;
            const showMetaUnderAirline = Boolean(notesLine && tripMeta);
            const url = o.bookingUrl.trim();
            const openBooking = () => {
              if (!url) return;
              pemSelection();
              void openExternalUrl(url);
            };

            const cardBody = (
              <>
                <View style={styles.gfCardTop}>
                  {badge ? (
                    <View style={[styles.gfBadge, { backgroundColor: colors.secondarySurface }]}>
                      <PemText style={[styles.gfBadgeText, { color: colors.textSecondary }]} numberOfLines={1}>
                        {badge}
                      </PemText>
                    </View>
                  ) : (
                    <View style={styles.gfBadgePlaceholder} />
                  )}
                  {o.price.trim() ? (
                    <PemText style={[styles.gfPrice, { color: colors.textPrimary }]} numberOfLines={1}>
                      {o.price.trim()}
                    </PemText>
                  ) : null}
                </View>

                {schedulePrimary ? (
                  <PemText style={[styles.gfTimes, { color: colors.textPrimary }]} numberOfLines={2}>
                    {schedulePrimary}
                  </PemText>
                ) : null}

                <PemText style={[styles.gfAirline, { color: colors.textSecondary }]} numberOfLines={2}>
                  {o.airline.trim() || "Airline"}
                </PemText>

                {showMetaUnderAirline ? (
                  <PemText style={[styles.gfTripMeta, { color: colors.textTertiary }]} numberOfLines={2}>
                    {tripMeta}
                  </PemText>
                ) : null}

                {url ? (
                  <View style={[styles.gfFooter, { borderTopColor: colors.borderMuted }]}>
                    <PemText style={[styles.gfFooterText, { color: colors.pemAmber }]}>View booking options</PemText>
                    <ChevronRight size={18} color={colors.pemAmber} strokeWidth={2} />
                  </View>
                ) : null}
              </>
            );

            return url ? (
              <Pressable
                key={`${o.label}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={`${o.airline}, ${o.price}, open booking`}
                onPress={openBooking}
                style={({ pressed }) => [
                  styles.gfCard,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.borderMuted,
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
              >
                {cardBody}
              </Pressable>
            ) : (
              <View
                key={`${o.label}-${i}`}
                style={[
                  styles.gfCard,
                  { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted },
                ]}
              >
                {cardBody}
              </View>
            );
          })}
        </ScrollView>
      ) : null}
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

function phoneForDial(phone: string): string | null {
  const t = phone.trim();
  if (!t) return null;
  const core = t.replace(/[^\d+]/g, "");
  if (!core) return null;
  return core;
}

function ensureHttpWebsite(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
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
      <PrepPickSectionHeader
        icon={Building2}
        label="Local results"
        intro={PICK_INTROS.local}
        meta={data.query.trim() || undefined}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
        {data.businesses.map((b, i) => {
          const primaryLabel = businessPrimaryLinkLabel(b);
          const primaryIsMap = primaryLabel !== "Website";
          const a11yPrimary =
            primaryLabel === "Google Maps"
              ? `Open ${b.name} in Google Maps`
              : primaryIsMap
                ? `Open ${b.name} in Maps`
                : `Open website for ${b.name}`;
          const dial = phoneForDial(b.phone);
          const websiteUrl = ensureHttpWebsite(b.website);
          return (
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
                <View style={styles.addrCopyRow}>
                  <PemText variant="caption" style={[styles.addrCopyText, { color: colors.textSecondary }]} selectable>
                    {b.address.trim()}
                  </PemText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Copy address"
                    hitSlop={ADDR_COPY_HIT_SLOP}
                    onPress={() => void copyLine(b.address)}
                  >
                    <Copy size={18} stroke={colors.pemAmber} strokeWidth={2.25} />
                  </Pressable>
                </View>
              ) : null}
              {dial ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Call ${b.name}`}
                  onPress={() => {
                    pemSelection();
                    void openExternalUrl(`tel:${dial}`);
                  }}
                  style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.85 : 1, borderTopColor: colors.borderMuted }]}
                >
                  <Phone size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                  <PemText style={[styles.linkText, { color: colors.pemAmber }]} numberOfLines={1}>
                    {b.phone.trim()}
                  </PemText>
                </Pressable>
              ) : null}
              {websiteUrl ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Website for ${b.name}`}
                  onPress={() => {
                    pemSelection();
                    void openExternalUrl(websiteUrl);
                  }}
                  style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.85 : 1, borderTopColor: colors.borderMuted }]}
                >
                  <ExternalLink size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                  <PemText style={[styles.linkText, { color: colors.pemAmber }]} numberOfLines={1}>
                    Website
                  </PemText>
                </Pressable>
              ) : null}
              {b.pemNote.trim() ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }} numberOfLines={3}>
                  {b.pemNote}
                </PemText>
              ) : null}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={a11yPrimary}
                onPress={() =>
                  void openBusinessListingInMaps({
                    name: b.name,
                    address: b.address,
                    lat: b.lat,
                    lng: b.lng,
                    mapsUrl: b.mapsUrl,
                  })
                }
                style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.85 : 1, borderTopColor: colors.borderMuted }]}
              >
                {primaryIsMap ? (
                  <MapPin size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                ) : (
                  <ExternalLink size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                )}
                <PemText style={[styles.linkText, { color: colors.pemAmber }]} numberOfLines={1}>
                  {primaryLabel}
                </PemText>
              </Pressable>
            </View>
          </View>
          );
        })}
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
      <PrepPickSectionHeader
        icon={TrendingUp}
        label="Trends"
        intro={PICK_INTROS.trends}
        meta={data.keyword.trim() || data.query.trim() || undefined}
        iconAccent="muted"
      />
      <View style={styles.trendsBody}>
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
      <PrepPickSectionHeader
        icon={LineChart}
        label="Market"
        intro={PICK_INTROS.market}
        meta={data.query.trim() || undefined}
        iconAccent="muted"
      />
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
      <PrepPickSectionHeader
        icon={Briefcase}
        label="Jobs"
        intro={PICK_INTROS.jobs}
        meta={data.query.trim() || undefined}
        iconAccent="muted"
      />
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
  root: { gap: space[4] },
  trendsBody: {
    gap: space[3],
  },
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
  addrCopyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  addrCopyText: { flex: 1, minWidth: 0 },
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
  sourceLink: { fontFamily: fontFamily.sans.medium, fontSize: fontSize.sm },
  marketHero: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[2],
  },
  sym: { fontFamily: fontFamily.display.semibold, fontSize: fontSize.xxxl },
  priceHuge: { fontFamily: fontFamily.display.semibold, fontSize: fontSize.xxl },
  flightRecInline: {
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  /** Google Flights–style result card — flat, dense, price + times first. */
  gfCard: {
    width: 308,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[4],
    paddingTop: space[4],
    paddingBottom: space[3],
    gap: space[1],
  },
  gfCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space[3],
  },
  gfBadge: {
    borderRadius: radii.sm,
    paddingHorizontal: space[2],
    paddingVertical: 4,
    maxWidth: "58%",
  },
  gfBadgePlaceholder: {
    flex: 1,
    minWidth: 0,
  },
  gfBadgeText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    letterSpacing: 0.2,
  },
  gfPrice: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.tight),
    flexShrink: 0,
    textAlign: "right",
  },
  gfTimes: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
    marginTop: space[1],
  },
  gfAirline: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
    marginTop: space[1],
  },
  gfTripMeta: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  gfFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space[2],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  gfFooterText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
});
