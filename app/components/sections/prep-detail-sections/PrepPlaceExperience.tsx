import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { RemoteImageOrPlaceholder } from "@/components/ui/SafeRemoteImage";
import type { PlaceCardPayload } from "@/lib/adaptivePrep";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { ExternalLink, MapPin } from "lucide-react-native";
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import PrepShareRow from "./PrepShareRow";

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

function mapsUrlForPlace(p: PlaceCardPayload["places"][number]): string {
  const u = p.url.trim();
  if (u.startsWith("http")) return u;
  if (p.lat !== 0 && p.lng !== 0) {
    return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  }
  const q = encodeURIComponent(`${p.name} ${p.address}`.trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export default function PrepPlaceExperience({ data, prepTitle, sharePlainText }: Props) {
  const { colors } = useTheme();

  const showMap = data.mapCenterLat !== 0 && data.mapCenterLng !== 0;
  const mapUri = showMap
    ? `https://staticmap.openstreetmap.de/staticmap.php?center=${data.mapCenterLat},${data.mapCenterLng}&zoom=14&size=640x240&markers=${data.mapCenterLat},${data.mapCenterLng},red-pushpin`
    : "";

  return (
    <View style={styles.root}>
      {showMap ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open map area in Maps"
          onPress={() =>
            void openExternalUrl(
              `https://www.google.com/maps/search/?api=1&query=${data.mapCenterLat},${data.mapCenterLng}`,
            )
          }
        >
          <Image
            source={{ uri: mapUri }}
            style={[styles.mapPreview, { backgroundColor: colors.secondarySurface }]}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </Pressable>
      ) : null}
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
          <MapPin size={18} stroke={colors.pemAmber} strokeWidth={2.25} />
          <PemText style={[styles.heroKicker, { color: colors.pemAmber }]}>Places</PemText>
        </View>
        <PemText style={[styles.heroTitle, { color: colors.textPrimary }]}>{data.recommendation}</PemText>
        {data.query.trim() ? (
          <PemText variant="caption" style={[styles.heroSub, { color: colors.textSecondary }]}>
            {data.query}
          </PemText>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hScroll}
        decelerationRate="fast"
      >
        {data.places.map((p, i) => (
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
              {p.address.trim() ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }} numberOfLines={3}>
                  {p.address}
                </PemText>
              ) : null}
              {ratingLine(p.rating, p.reviewCount) ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }}>
                  {ratingLine(p.rating, p.reviewCount)}
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
              {p.phone.trim() ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }}>
                  {p.phone}
                </PemText>
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
                accessibilityLabel={`Open ${p.name} in Maps`}
                onPress={() => void openExternalUrl(mapsUrlForPlace(p))}
                style={({ pressed }) => [
                  styles.linkRow,
                  { opacity: pressed ? 0.85 : 1, borderTopColor: colors.borderMuted },
                ]}
              >
                <ExternalLink size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                <PemText style={[styles.linkText, { color: colors.pemAmber }]} numberOfLines={1}>
                  Open in Maps
                </PemText>
              </Pressable>
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

const styles = StyleSheet.create({
  root: {
    gap: space[5],
  },
  mapPreview: {
    width: "100%",
    height: 160,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  hero: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[2],
  },
  heroIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  heroKicker: {
    fontFamily: fontFamily.sans.semibold,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontSize: fontSize.xs,
  },
  heroTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize["2xl"],
    lineHeight: lh(fontSize["2xl"], lineHeight.snug),
  },
  heroSub: {
    marginTop: space[1],
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
  shareFooter: {
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
});
