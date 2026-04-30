import { useTheme } from "@/contexts/ThemeContext";
import { MAX_CHAT_MESSAGE_IMAGES } from "@/constants/chatPhotos.constants";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import { X } from "lucide-react-native";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  uris: string[];
  onRemoveAt: (index: number) => void;
  onClearAll: () => void;
};

const THUMB = 56;
const REMOVE = 28;
/** Half the remove control — sits on the image corner, half on pixels / half past the edge. */
const CORNER_OUT = REMOVE / 2;

export function ChatPendingPhotoBar({ uris, onRemoveAt, onClearAll }: Props) {
  const { colors } = useTheme();
  const countLabel = `${uris.length} of ${MAX_CHAT_MESSAGE_IMAGES}`;
  const slotSize = THUMB + CORNER_OUT;

  const handleRemoveAt = (index: number) => {
    pemImpactLight();
    onRemoveAt(index);
  };

  const handleClearAll = () => {
    pemImpactLight();
    onClearAll();
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.secondarySurface,
          borderColor: colors.borderMuted,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Photos</Text>
        <View style={styles.headerRight}>
          <View
            style={[
              styles.countPill,
              {
                backgroundColor: colors.brandMutedSurface,
                borderColor: colors.borderMuted,
              },
            ]}
          >
            <Text style={[styles.countPillText, { color: colors.textSecondary }]}>
              {countLabel}
            </Text>
          </View>
          <Pressable onPress={handleClearAll} hitSlop={8}>
            <Text style={[styles.removeAll, { color: colors.textSecondary }]}>
              Remove all
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.thumbRow}
      >
        {uris.map((uri, index) => (
          <View
            key={`${uri}-${index}`}
            style={[styles.thumbSlot, { width: slotSize, height: slotSize }]}
          >
            <View
              style={[
                styles.thumbImageClip,
                {
                  top: CORNER_OUT,
                  borderColor: colors.borderMuted,
                  backgroundColor: colors.cardBackground,
                },
              ]}
            >
              <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
            </View>
            <Pressable
              accessibilityLabel="Remove photo"
              accessibilityRole="button"
              onPress={() => handleRemoveAt(index)}
              style={({ pressed }) => [
                styles.removeBtn,
                {
                  left: THUMB - CORNER_OUT,
                  top: 0,
                  backgroundColor: pressed ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.94)",
                  borderColor: colors.border,
                  ...Platform.select({
                    ios: {
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.22,
                      shadowRadius: 2,
                    },
                    android: { elevation: 4 },
                    default: {},
                  }),
                },
              ]}
              hitSlop={8}
            >
              <X size={15} color={pemAmber} strokeWidth={2.75} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: space[2],
    marginBottom: space[1],
    padding: space[2],
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[2],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[2],
  },
  title: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
    flexShrink: 0,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    flexShrink: 1,
    justifyContent: "flex-end",
  },
  countPill: {
    paddingHorizontal: space[2],
    paddingVertical: 4,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  countPillText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    letterSpacing: 0.2,
  },
  removeAll: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    textDecorationLine: "underline",
  },
  thumbRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space[2],
    paddingTop: 4,
    paddingBottom: 2,
    paddingRight: space[1],
  },
  thumbSlot: {
    position: "relative",
  },
  thumbImageClip: {
    position: "absolute",
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  removeBtn: {
    position: "absolute",
    width: REMOVE,
    height: REMOVE,
    borderRadius: REMOVE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
});
