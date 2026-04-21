import { useTheme } from "@/contexts/ThemeContext";
import { neutral } from "@/constants/theme";
import { fontFamily, fontSize, lh, space, radii } from "@/constants/typography";
import type { ChatLinkPreview } from "@/lib/pemApi";
import { pemImpactLight } from "@/lib/pemHaptics";
import {
  linkPreviewDisplayTitle,
  linkPreviewFetchErrorMessage,
} from "@/utils/linkPreviewDisplayStrings";
import { openLinkInInAppBrowser } from "@/utils/openLinkInInAppBrowser";
import { upgradeAmazonProductImageUrl } from "@/utils/upgradeAmazonProductImageUrl";
import { UserMessageLinkPreviewShell } from "./UserMessageLinkPreviewShell";
import { Image as ExpoImage } from "expo-image";
import { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const HERO_ASPECT = 16 / 9;

type Props = {
  preview: ChatLinkPreview;
};

export function MessageLinkPreviewCard({ preview: p }: Props) {
  const { colors } = useTheme();
  const url = p.canonical_url ?? p.original_url;

  const openLink = useCallback(() => {
    void openLinkInInAppBrowser(url);
  }, [url]);

  const handleMetaPress = useCallback(() => {
    pemImpactLight();
    openLink();
  }, [openLink]);

  const hasError =
    p.fetch_status === "unauthorized" ||
    p.fetch_status === "failed" ||
    p.fetch_status === "timeout" ||
    p.fetch_status === "malformed";

  const heroUri = useMemo(
    () => (p.image_url ? upgradeAmazonProductImageUrl(p.image_url) : null),
    [p.image_url],
  );

  const displayTitle = linkPreviewDisplayTitle(p);
  const showPreviewBody = Boolean(heroUri || displayTitle.length > 0);

  return (
    <View style={styles.stack}>
      {showPreviewBody ? (
        <UserMessageLinkPreviewShell onPress={handleMetaPress}>
          {heroUri ? (
            <View
              style={[
                styles.heroClip,
                { backgroundColor: neutral[100] },
              ]}
            >
              <ExpoImage
                source={{ uri: heroUri }}
                style={styles.heroImage}
                contentFit="cover"
                transition={120}
              />
            </View>
          ) : null}
          <View
            style={[
              styles.titleBlock,
              heroUri
                ? [
                    styles.titleBlockAfterHero,
                    { borderTopColor: neutral[200] },
                  ]
                : null,
            ]}
          >
            <Text
              style={[styles.title, { color: neutral[600] }]}
              numberOfLines={3}
            >
              {displayTitle}
            </Text>
          </View>
        </UserMessageLinkPreviewShell>
      ) : null}

      {hasError ? (
        <Pressable onPress={handleMetaPress}>
          <Text style={[styles.warn, { color: colors.userBubbleMeta }]}>
            {linkPreviewFetchErrorMessage(p.fetch_status)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    width: "100%",
    maxWidth: "100%",
    gap: space[2],
  },
  heroClip: {
    width: "100%",
    aspectRatio: HERO_ASPECT,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  titleBlock: {
    paddingHorizontal: space[2],
    paddingVertical: space[2],
  },
  titleBlockAfterHero: {
    paddingTop: space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontFamily: fontFamily.sans.italic,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, 1.35),
  },
  warn: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.xs,
  },
});
