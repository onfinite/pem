import { TOP_ICON_CHIP } from "@/components/sections/home-sections/homeLayout";
import HubUnreadBadge from "@/components/shell/HubUnreadBadge";
import { useInboxShell } from "@/constants/shellTokens";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import { Menu, Search, UserRound } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  searchValue: string;
  onSearchChange: (q: string) => void;
  onOpenMenu: () => void;
  /** Ready preps not yet opened (badge on menu). */
  unreadReadyCount?: number;
};

/** Fixed header: menu, search field, account avatar (opens Settings). */
export default function InboxHeader({
  searchValue,
  onSearchChange,
  onOpenMenu,
  unreadReadyCount = 0,
}: Props) {
  const s = useInboxShell();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const imageUrl = user?.imageUrl;
  const [avatarDecoded, setAvatarDecoded] = useState(false);

  useEffect(() => {
    setAvatarDecoded(false);
  }, [imageUrl]);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: s.bg }]}>
      <View style={styles.row}>
        <View style={styles.menuWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              unreadReadyCount > 0
                ? `Open navigation menu, ${unreadReadyCount} unread in For you`
                : "Open navigation menu"
            }
            hitSlop={10}
            onPress={onOpenMenu}
            style={({ pressed }) => [styles.menuHit, { opacity: pressed ? 0.72 : 1 }]}
          >
            <Menu size={22} color={s.textPrimary} strokeWidth={2.25} />
          </Pressable>
          {unreadReadyCount > 0 ? (
            <View style={styles.menuBadgeSlot} pointerEvents="none">
              <HubUnreadBadge count={unreadReadyCount} />
            </View>
          ) : null}
        </View>
        <View style={[styles.search, { backgroundColor: s.bgElevated, borderColor: s.border }]}>
          <Search size={16} color={s.textSecondary} strokeWidth={2} />
          <TextInput
            accessibilityLabel="Search preps"
            placeholder="Search preps…"
            placeholderTextColor={s.textTertiary}
            value={searchValue}
            onChangeText={onSearchChange}
            style={[
              styles.input,
              {
                color: s.textPrimary,
                fontFamily: fontFamily.sans.regular,
                lineHeight: lh(fontSize.sm, lineHeight.snug),
                ...(Platform.OS === "android"
                  ? {
                      textAlignVertical: "center" as const,
                      paddingVertical: 0,
                      includeFontPadding: false,
                    }
                  : { paddingVertical: 0 }),
              },
            ]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account and settings"
          hitSlop={10}
          onPress={() => router.push("/settings")}
          style={({ pressed }) => [styles.avatarHit, { opacity: pressed ? 0.88 : 1 }]}
        >
          <View
            style={[
              styles.avatarShell,
              {
                width: TOP_ICON_CHIP,
                height: TOP_ICON_CHIP,
                borderRadius: TOP_ICON_CHIP / 2,
                backgroundColor: colors.brandMutedSurface,
                borderColor: s.border,
              },
            ]}
          >
            {imageUrl ? (
              <Image
                accessibilityIgnoresInvertColors
                source={{ uri: imageUrl }}
                style={[styles.avatarImage, { opacity: avatarDecoded ? 1 : 0 }]}
                resizeMode="cover"
                onLoad={() => setAvatarDecoded(true)}
                onError={() => setAvatarDecoded(true)}
              />
            ) : null}
            {(!imageUrl || !avatarDecoded) && (
              <View style={styles.avatarFallback} pointerEvents="none">
                {imageUrl && !avatarDecoded ? (
                  <ActivityIndicator color={colors.placeholder} />
                ) : (
                  <UserRound size={20} stroke={s.textSecondary} strokeWidth={2} />
                )}
              </View>
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space[4],
    paddingBottom: space[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  menuWrap: {
    width: 40,
    height: 40,
    position: "relative",
  },
  menuHit: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  menuBadgeSlot: {
    position: "absolute",
    top: -2,
    right: -4,
    zIndex: 2,
  },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 36,
    fontSize: fontSize.sm,
    padding: 0,
    margin: 0,
  },
  avatarHit: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarShell: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    ...StyleSheet.absoluteFillObject,
  },
  avatarFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
