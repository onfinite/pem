import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import type { ShoppingCardPayload } from "@/lib/adaptivePrep";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { ExternalLink, Sparkles } from "lucide-react-native";
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import PrepShareRow from "./PrepShareRow";

type Props = {
  data: ShoppingCardPayload;
  prepTitle: string;
  sharePlainText: string;
};

function ratingLabel(r: number): string | null {
  if (r <= 0) return null;
  return `${r.toFixed(1)} ★`;
}

export default function PrepShoppingExperience({ data, prepTitle, sharePlainText }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
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
          <Sparkles size={18} stroke={colors.pemAmber} strokeWidth={2.25} />
          <PemText style={[styles.heroKicker, { color: colors.pemAmber }]}>Pem&apos;s pick</PemText>
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
        {data.products.map((p, i) => (
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
            {p.image.trim() ? (
              <Image
                source={{ uri: p.image }}
                style={[styles.tileImage, { backgroundColor: colors.secondarySurface }]}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={[styles.tileImage, { backgroundColor: colors.secondarySurface }]} />
            )}
            <View style={styles.tileBody}>
              {p.badge.trim() ? (
                <View style={[styles.badge, { borderColor: colors.pemAmber }]}>
                  <PemText variant="caption" style={[styles.badgeText, { color: colors.pemAmber }]}>
                    {p.badge}
                  </PemText>
                </View>
              ) : null}
              <PemText style={[styles.tileName, { color: colors.textPrimary }]} numberOfLines={3}>
                {p.name}
              </PemText>
              {p.store.trim() ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }}>
                  {p.store}
                </PemText>
              ) : null}
              <View style={styles.priceRow}>
                {p.price.trim() ? (
                  <PemText style={[styles.price, { color: colors.textPrimary }]}>{p.price}</PemText>
                ) : null}
                {ratingLabel(p.rating) ? (
                  <PemText variant="caption" style={{ color: colors.textSecondary }}>
                    {ratingLabel(p.rating)}
                  </PemText>
                ) : null}
              </View>
              {p.why.trim() ? (
                <View style={styles.why}>
                  <PemMarkdown variant="companion" selectable>
                    {p.why}
                  </PemMarkdown>
                </View>
              ) : null}
              {(p.pros.length > 0 || p.cons.length > 0) && (
                <View style={styles.pc}>
                  {p.pros.length > 0 ? (
                    <PemText variant="caption" style={[styles.pcHead, { color: colors.textSecondary }]}>
                      Pros
                    </PemText>
                  ) : null}
                  {p.pros.map((line, j) => (
                    <PemText key={`pro-${j}`} variant="caption" style={{ color: colors.textPrimary }}>
                      + {line}
                    </PemText>
                  ))}
                  {p.cons.length > 0 ? (
                    <PemText variant="caption" style={[styles.pcHead, { color: colors.textSecondary, marginTop: space[2] }]}>
                      Cons
                    </PemText>
                  ) : null}
                  {p.cons.map((line, j) => (
                    <PemText key={`con-${j}`} variant="caption" style={{ color: colors.textSecondary }}>
                      – {line}
                    </PemText>
                  ))}
                </View>
              )}
              {p.url.trim() ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open link for ${p.name}`}
                  onPress={() => void openExternalUrl(p.url)}
                  style={({ pressed }) => [
                    styles.linkRow,
                    { opacity: pressed ? 0.85 : 1, borderTopColor: colors.borderMuted },
                  ]}
                >
                  <ExternalLink size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                  <PemText style={[styles.linkText, { color: colors.pemAmber }]} numberOfLines={1}>
                    {p.url.replace(/^https?:\/\//, "").split("/")[0]}
                  </PemText>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>

      {data.buyingGuide.trim() ? (
        <View style={[styles.guide, { backgroundColor: colors.secondarySurface, borderColor: colors.borderMuted }]}>
          <PemText variant="caption" style={[styles.guideLabel, { color: colors.textSecondary }]}>
            Quick tip
          </PemText>
          <PemMarkdown variant="companion" selectable>
            {data.buyingGuide}
          </PemMarkdown>
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
    gap: space[5],
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
  badge: {
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
  badgeText: {
    fontFamily: fontFamily.sans.semibold,
  },
  tileName: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space[3],
  },
  price: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
  },
  why: {
    marginTop: space[1],
  },
  pc: {
    gap: space[1],
  },
  pcHead: {
    fontFamily: fontFamily.sans.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    fontSize: fontSize.xs,
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
  guide: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[2],
  },
  guideLabel: {
    fontFamily: fontFamily.sans.semibold,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  shareFooter: {
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
});
