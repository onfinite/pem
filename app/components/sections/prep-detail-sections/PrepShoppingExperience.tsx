import PemMarkdown from "@/components/ui/PemMarkdown";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemText from "@/components/ui/PemText";
import PemButton from "@/components/ui/PemButton";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { SHOPPING_PRODUCTS_MAX } from "@/constants/shopping";
import { RemoteImageOrPlaceholder } from "@/components/ui/SafeRemoteImage";
import type { ShoppingCardPayload, ShoppingProduct } from "@/lib/adaptivePrep";
import { appendShoppingMore, type ApiPrep } from "@/lib/pemApi";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { useAuth } from "@clerk/expo";
import { ExternalLink, ShoppingBag } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import PrepShareRow from "./PrepShareRow";

type Props = {
  prepId: string;
  data: ShoppingCardPayload;
  prepTitle: string;
  sharePlainText: string;
  onPrepUpdated?: (row: ApiPrep) => Promise<void>;
};

function ratingLabel(r: number): string | null {
  if (r <= 0) return null;
  return `${r.toFixed(1)} ★`;
}

function ProductTile({
  p,
  compact,
}: {
  p: ShoppingProduct;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        compact ? styles.compactTile : styles.tile,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.borderMuted,
          ...Platform.select({
            ios: {
              shadowColor: "#1c1a16",
              shadowOffset: { width: 0, height: compact ? 4 : 8 },
              shadowOpacity: compact ? 0.05 : 0.08,
              shadowRadius: compact ? 10 : 16,
            },
            android: { elevation: compact ? 1 : 2 },
          }),
        },
      ]}
    >
      {!compact ? (
        <RemoteImageOrPlaceholder
          uri={p.image.trim()}
          style={[styles.tileImage, { backgroundColor: colors.secondarySurface }]}
          placeholderStyle={{ backgroundColor: colors.secondarySurface }}
        />
      ) : (
        <RemoteImageOrPlaceholder
          uri={p.image.trim()}
          style={[styles.compactImage, { backgroundColor: colors.secondarySurface }]}
          placeholderStyle={{ backgroundColor: colors.secondarySurface }}
        />
      )}
      <View style={[styles.tileBody, compact && styles.compactBody]}>
        {p.badge.trim() && !compact ? (
          <View style={[styles.badge, { borderColor: colors.pemAmber }]}>
            <PemText variant="caption" style={[styles.badgeText, { color: colors.pemAmber }]}>
              {p.badge}
            </PemText>
          </View>
        ) : null}
        <PemText
          style={[compact ? styles.compactName : styles.tileName, { color: colors.textPrimary }]}
          numberOfLines={compact ? 2 : 3}
        >
          {p.name}
        </PemText>
        {p.store.trim() ? (
          <PemText variant="caption" style={{ color: colors.textSecondary }} numberOfLines={1}>
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
        {!compact && p.why.trim() ? (
          <View style={styles.why}>
            <PemMarkdown variant="companion" selectable>
              {p.why}
            </PemMarkdown>
          </View>
        ) : null}
        {!compact && (p.pros.length > 0 || p.cons.length > 0) && (
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
              <PemText
                variant="caption"
                style={[styles.pcHead, { color: colors.textSecondary, marginTop: space[2] }]}
              >
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
  );
}

export default function PrepShoppingExperience({
  prepId,
  data,
  prepTitle,
  sharePlainText,
  onPrepUpdated,
}: Props) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const [loadingMore, setLoadingMore] = useState(false);

  const hero = data.products.slice(0, 3);
  const morePicks = data.products.slice(3);
  const canLoadMore = data.products.length < SHOPPING_PRODUCTS_MAX;

  const onLoadMore = useCallback(async () => {
    if (loadingMore || !canLoadMore) return;
    setLoadingMore(true);
    try {
      const row = await appendShoppingMore(() => getTokenRef.current(), prepId, {
        batchSize: 6,
      });
      await onPrepUpdated?.(row);
    } catch {
      /* optional toast */
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, canLoadMore, prepId, onPrepUpdated]);

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
          <ShoppingBag size={18} stroke={colors.pemAmber} strokeWidth={2.25} />
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
        {hero.map((p, i) => (
          <ProductTile key={`${p.name}-${p.url}-${i}`} p={p} />
        ))}
      </ScrollView>

      {morePicks.length > 0 ? (
        <View style={{ gap: space[2] }}>
          <PemText style={[styles.moreSectionTitle, { color: colors.textSecondary }]}>
            More options
          </PemText>
          <View style={{ gap: space[3] }}>
            {morePicks.map((p, i) => (
              <ProductTile key={`more-${p.name}-${p.url}-${i}`} p={p} compact />
            ))}
          </View>
        </View>
      ) : null}

      {canLoadMore ? (
        <View style={{ gap: space[2] }}>
          <PemText variant="caption" style={{ color: colors.textSecondary }}>
            Load more from the web (same search as this prep; saved here, max {SHOPPING_PRODUCTS_MAX}).
          </PemText>
          {loadingMore ? (
            <PemLoadingIndicator placement="listFooter" />
          ) : (
            <PemButton variant="secondary" onPress={() => void onLoadMore()}>
              Load more picks
            </PemButton>
          )}
        </View>
      ) : null}

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
  moreSectionTitle: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
    letterSpacing: 0.2,
    textTransform: "uppercase",
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
  compactTile: {
    flexDirection: "row",
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    maxWidth: "100%",
  },
  tileImage: {
    width: "100%",
    height: 140,
  },
  compactImage: {
    width: 88,
    height: 88,
  },
  tileBody: {
    padding: space[4],
    gap: space[2],
    flex: 1,
  },
  compactBody: {
    padding: space[3],
    minWidth: 0,
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
  compactName: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.snug),
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
