import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { PLACE_HERO_COUNT } from "@/constants/shopping";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { RemoteImageOrPlaceholder } from "@/components/ui/SafeRemoteImage";
import type { PlaceCardPayload } from "@/lib/adaptivePrep";
import {
  isLikelyMapsHttpUrl,
  labelForPlaceRowAction,
  openNativeMapsForPlace,
  shouldOpenPlaceRowAsMap,
} from "@/lib/placeLinks";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { pemSelection } from "@/lib/pemHaptics";
import * as Clipboard from "expo-clipboard";
import { ChevronRight, Copy, ExternalLink, MapPin, MessageCircle, Phone } from "lucide-react-native";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import PrepShareRow from "./PrepShareRow";
import { PICK_INTROS, PrepPickSectionHeader } from "./PrepPickSectionChrome";

type Props = {
  data: PlaceCardPayload;
  prepTitle: string;
  sharePlainText: string;
};

function ratingLine(r: number, reviews: number): string | null {
  if (r <= 0 && reviews <= 0) return null;
  const stars = r > 0 ? `${r.toFixed(1)} ★` : null;
  const rc = reviews > 0 ? `${reviews.toLocaleString()} reviews` : null;
  return [stars, rc].filter(Boolean).join(" · ");
}

function openPlaceRow(p: PlaceCardPayload["places"][number]): void {
  const urlTrimmed = p.url.trim();
  if (shouldOpenPlaceRowAsMap({ lat: p.lat, lng: p.lng, urlTrimmed })) {
    void openNativeMapsForPlace({
      name: p.name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      mapsHttpUrl: urlTrimmed && isLikelyMapsHttpUrl(urlTrimmed) ? urlTrimmed : undefined,
    });
    return;
  }
  void openExternalUrl(ensureHttpUrl(urlTrimmed));
}

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;

/** Digits and leading + only — for tel: / sms: */
function phoneForDial(phone: string): string | null {
  const t = phone.trim();
  if (!t) return null;
  const core = t.replace(/[^\d+]/g, "");
  if (!core) return null;
  return core;
}

function ensureHttpUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

async function copyLine(text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  await Clipboard.setStringAsync(t);
  pemSelection();
}

function PlaceMoreRow({ p }: { p: PlaceCardPayload["places"][number] }) {
  const { colors } = useTheme();
  const urlTrimmed = p.url.trim();
  const asMap = shouldOpenPlaceRowAsMap({ lat: p.lat, lng: p.lng, urlTrimmed });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={asMap ? `${p.name}, open in Maps` : `${p.name}, open website`}
      onPress={() => void openPlaceRow(p)}
      style={({ pressed }) => [
        styles.morePlaceRow,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.borderMuted,
          opacity: pressed ? 0.92 : 1,
          ...Platform.select({
            ios: {
              shadowColor: "#1c1a16",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 6,
            },
            android: { elevation: 1 },
          }),
        },
      ]}
    >
      <RemoteImageOrPlaceholder
        uri={p.photo.trim()}
        style={[styles.morePlaceImage, { backgroundColor: colors.secondarySurface }]}
        placeholderStyle={{ backgroundColor: colors.secondarySurface }}
      />
      <View style={styles.morePlaceBody}>
        <PemText numberOfLines={2} style={[styles.morePlaceTitle, { color: colors.textPrimary }]}>
          {p.name}
        </PemText>
        {ratingLine(p.rating, p.reviewCount) ? (
          <PemText variant="caption" style={{ color: colors.textSecondary }}>
            {ratingLine(p.rating, p.reviewCount)}
          </PemText>
        ) : null}
        {p.address.trim() ? (
          <PemText variant="caption" numberOfLines={2} style={{ color: colors.textTertiary }}>
            {p.address}
          </PemText>
        ) : null}
      </View>
      <ChevronRight size={20} stroke={colors.textTertiary} strokeWidth={2} />
    </Pressable>
  );
}

export default function PrepPlaceExperience({ data, prepTitle, sharePlainText }: Props) {
  const { colors } = useTheme();

  const heroPlaces = data.places.slice(0, PLACE_HERO_COUNT);
  const morePlaces = data.places.slice(PLACE_HERO_COUNT);

  return (
    <View style={styles.root}>
      <PrepPickSectionHeader
        icon={MapPin}
        label="Places"
        intro={PICK_INTROS.places}
        meta={data.query.trim() || undefined}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hScroll}
        decelerationRate="fast"
      >
          {heroPlaces.map((p, i) => {
          const dial = phoneForDial(p.phone);
          const placeLinkKind = labelForPlaceRowAction({
            lat: p.lat,
            lng: p.lng,
            urlTrimmed: p.url.trim(),
          });
          return (
          <View
            key={`${p.name}-${i}`}
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
              uri={p.photo.trim()}
              style={[styles.tileImage, { backgroundColor: colors.secondarySurface }]}
              placeholderStyle={{ backgroundColor: colors.secondarySurface }}
            />
            <View style={styles.tileBody}>
              <PemText style={[styles.tileName, { color: colors.textPrimary }]} numberOfLines={3}>
                {p.name}
              </PemText>
              {ratingLine(p.rating, p.reviewCount) ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }}>
                  {ratingLine(p.rating, p.reviewCount)}
                </PemText>
              ) : null}
              {p.reviewSnippet.trim() ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }} numberOfLines={4}>
                  {p.reviewSnippet.trim()}
                </PemText>
              ) : null}
              {p.customerSatisfaction.trim() ? (
                <PemText variant="caption" style={{ color: colors.pemAmber }} numberOfLines={3}>
                  {p.customerSatisfaction.trim()}
                </PemText>
              ) : null}
              {p.priceRange.trim() ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }}>
                  {p.priceRange}
                </PemText>
              ) : null}
              {p.hours.trim() ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }} numberOfLines={2}>
                  {p.hours}
                </PemText>
              ) : null}
              {p.address.trim() ? (
                <View style={styles.copyLineRow}>
                  <PemText variant="caption" style={[styles.flex1, { color: colors.textSecondary }]} selectable>
                    {p.address}
                  </PemText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Copy address"
                    hitSlop={HIT_SLOP}
                    onPress={() => void copyLine(p.address)}
                  >
                    <Copy size={18} stroke={colors.pemAmber} strokeWidth={2.25} />
                  </Pressable>
                </View>
              ) : null}
              {p.phone.trim() ? (
                <View style={styles.contactBlock}>
                  <PemText variant="caption" style={{ color: colors.textTertiary }}>
                    Phone
                  </PemText>
                  <View style={styles.phoneRow}>
                    <PemText
                      style={[styles.contactValue, styles.flex1, { color: colors.textPrimary }]}
                      selectable
                    >
                      {p.phone}
                    </PemText>
                    <View style={styles.iconActions}>
                      {dial ? (
                        <>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Call"
                            hitSlop={HIT_SLOP}
                            onPress={() => void openExternalUrl(`tel:${dial}`)}
                          >
                            <Phone size={20} stroke={colors.pemAmber} strokeWidth={2.25} />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Text"
                            hitSlop={HIT_SLOP}
                            onPress={() => void openExternalUrl(`sms:${dial}`)}
                          >
                            <MessageCircle size={20} stroke={colors.pemAmber} strokeWidth={2.25} />
                          </Pressable>
                        </>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Copy phone number"
                        hitSlop={HIT_SLOP}
                        onPress={() => void copyLine(p.phone)}
                      >
                        <Copy size={20} stroke={colors.textSecondary} strokeWidth={2.25} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}
              {p.email.trim() ? (
                <View style={styles.contactBlock}>
                  <PemText variant="caption" style={{ color: colors.textTertiary }}>
                    Email
                  </PemText>
                  <View style={styles.copyLineRow}>
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`Email ${p.email}`}
                      onPress={() => void openExternalUrl(`mailto:${p.email.trim()}`)}
                      style={styles.flex1}
                    >
                      <PemText style={[styles.contactValue, { color: colors.pemAmber }]} selectable numberOfLines={2}>
                        {p.email}
                      </PemText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Copy email"
                      hitSlop={HIT_SLOP}
                      onPress={() => void copyLine(p.email)}
                    >
                      <Copy size={18} stroke={colors.textSecondary} strokeWidth={2.25} />
                    </Pressable>
                  </View>
                </View>
              ) : null}
              {p.website.trim() ? (
                <View style={styles.contactBlock}>
                  <PemText variant="caption" style={{ color: colors.textTertiary }}>
                    Website
                  </PemText>
                  <View style={styles.copyLineRow}>
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel="Open website"
                      onPress={() => void openExternalUrl(ensureHttpUrl(p.website))}
                      style={styles.flex1}
                    >
                      <PemText style={[styles.contactValue, { color: colors.pemAmber }]} numberOfLines={2} selectable>
                        {p.website}
                      </PemText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Copy website URL"
                      hitSlop={HIT_SLOP}
                      onPress={() => void copyLine(ensureHttpUrl(p.website))}
                    >
                      <Copy size={18} stroke={colors.textSecondary} strokeWidth={2.25} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Open in browser"
                      hitSlop={HIT_SLOP}
                      onPress={() => void openExternalUrl(ensureHttpUrl(p.website))}
                    >
                      <ExternalLink size={18} stroke={colors.pemAmber} strokeWidth={2.25} />
                    </Pressable>
                  </View>
                </View>
              ) : null}
              {p.pemNote.trim() ? (
                <View style={styles.note}>
                  <PemMarkdown variant="companion" selectable>
                    {p.pemNote}
                  </PemMarkdown>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={
                  placeLinkKind === "Map"
                    ? `Open ${p.name} in Maps`
                    : `Open ${p.name} website`
                }
                onPress={() => void openPlaceRow(p)}
                style={({ pressed }) => [
                  styles.linkRow,
                  { opacity: pressed ? 0.85 : 1, borderTopColor: colors.borderMuted },
                ]}
              >
                {placeLinkKind === "Map" ? (
                  <MapPin size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                ) : (
                  <ExternalLink size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                )}
                <PemText style={[styles.linkText, { color: colors.pemAmber }]} numberOfLines={1}>
                  {placeLinkKind}
                </PemText>
              </Pressable>
            </View>
          </View>
          );
        })}
      </ScrollView>

      {morePlaces.length > 0 ? (
        <View style={styles.morePlacesSection}>
          <PemText variant="caption" style={[styles.morePlacesHint, { color: colors.textTertiary }]}>
            More matches — tap a row to open in Maps or the site.
          </PemText>
          <View style={styles.morePlacesList}>
            {morePlaces.map((p, i) => (
              <PlaceMoreRow key={`more-place-${p.name}-${i}`} p={p} />
            ))}
          </View>
        </View>
      ) : null}

      {sharePlainText.trim() ? (
        <View style={[styles.shareFooter, { borderTopColor: colors.borderMuted }]}>
          <PrepShareRow variant="compact" text={sharePlainText.trim()} shareTitle={prepTitle} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space[4],
  },
  morePlacesSection: {
    gap: space[3],
  },
  morePlacesHint: {
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  morePlacesList: {
    gap: space[3],
  },
  morePlaceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[3],
  },
  morePlaceImage: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
  },
  morePlaceBody: {
    flex: 1,
    gap: space[1],
    minWidth: 0,
  },
  morePlaceTitle: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.snug),
  },
  hScroll: {
    gap: space[3],
    paddingVertical: space[1],
    paddingRight: space[2],
  },
  tile: {
    width: 280,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  tileImage: {
    width: "100%",
    height: 140,
  },
  tileBody: {
    padding: space[4],
    gap: space[2],
  },
  tileName: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
  },
  note: {
    marginTop: space[1],
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    marginTop: space[2],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  linkText: {
    flex: 1,
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
  flex1: { flex: 1 },
  copyLineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2],
  },
  contactBlock: {
    gap: space[1],
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2],
  },
  iconActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingTop: 2,
  },
  contactValue: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.snug),
  },
  shareFooter: {
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
});
