import { neutral, pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { BriefResponse } from "@/lib/pemApi";
import { CalendarDays, Search, Settings } from "lucide-react-native";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

type HeaderSummary = { text: string; isOverdue: boolean };

interface ChatScreenHeaderProps {
  briefData: BriefResponse | null;
  headerSummary: HeaderSummary;
  copyChipOpacity: Animated.Value;
  topInset: number;
  onOpenDrawer: () => void;
  onSearchPress: () => void;
  onSettingsPress: () => void;
}

export function ChatScreenHeader({
  briefData,
  headerSummary,
  copyChipOpacity,
  topInset,
  onOpenDrawer,
  onSearchPress,
  onSettingsPress,
}: ChatScreenHeaderProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: topInset + space[5],
          backgroundColor: colors.pageBackground,
          borderBottomColor: colors.borderMuted,
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.copiedHeaderToast,
          {
            opacity: copyChipOpacity,
            top: topInset + space[2],
          },
        ]}
      >
        <View style={styles.copiedHeaderPill}>
          <Text style={styles.copiedHeaderText}>Copied</Text>
        </View>
      </Animated.View>
      <Pressable
        onPress={onOpenDrawer}
        style={styles.headerLeft}
        hitSlop={12}
      >
        <CalendarDays size={22} color={colors.textSecondary} />
        {briefData &&
          (briefData.overdue.length > 0 || briefData.today.length > 0) && (
          <View
            style={[
              styles.headerDot,
              {
                backgroundColor:
                  briefData.overdue.length > 0 ? colors.error : pemAmber,
              },
            ]}
          />
        )}
      </Pressable>
      <Pressable onPress={onOpenDrawer} style={styles.headerCenter} hitSlop={8}>
        {headerSummary.text && (
          <Text
            style={[
              styles.headerBadge,
              {
                color: headerSummary.isOverdue
                  ? colors.error
                  : colors.textSecondary,
              },
            ]}
            numberOfLines={1}
          >
            {headerSummary.text}
          </Text>
        )}
      </Pressable>
      <View style={styles.headerRight}>
        <Pressable onPress={onSearchPress} hitSlop={12}>
          <Search size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable onPress={onSettingsPress} hitSlop={12}>
          <Settings size={22} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: space[2],
    paddingHorizontal: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copiedHeaderToast: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  copiedHeaderPill: {
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radii.full,
    backgroundColor: pemAmber,
  },
  copiedHeaderText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
    color: neutral.white,
  },
  headerLeft: {
    position: "absolute",
    left: space[4],
    bottom: space[2],
  },
  headerDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: space[4],
  },
  headerBadge: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
  headerRight: {
    position: "absolute",
    right: space[4],
    bottom: space[2],
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },
});
