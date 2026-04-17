import { useTheme } from "@/contexts/ThemeContext";
import { MAX_CHAT_MESSAGE_IMAGES } from "@/constants/chatPhotos.constants";
import { fontSize, radii, space } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import { X } from "lucide-react-native";
import {
  Image,
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

export function ChatPendingPhotoBar({
  uris,
  onRemoveAt,
  onClearAll,
}: Props) {
  const { colors } = useTheme();

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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.thumbRow}
      >
        {uris.map((uri, index) => (
          <View key={`${uri}-${index}`} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
            <Pressable
              onPress={() => handleRemoveAt(index)}
              style={styles.thumbClear}
              hitSlop={6}
            >
              <X size={16} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <View style={styles.meta}>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {uris.length === 1 ? "1 attachment" : `${uris.length} attachments`}
        </Text>
        <Text style={[styles.count, { color: colors.textTertiary }]}>
          {uris.length}/{MAX_CHAT_MESSAGE_IMAGES}
        </Text>
        <Pressable onPress={handleClearAll} hitSlop={6}>
          <Text style={[styles.clearAll, { color: colors.textSecondary }]}>
            Remove all
          </Text>
        </Pressable>
      </View>
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
  thumbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingRight: space[1],
  },
  thumbWrap: { position: "relative" },
  thumb: { width: 48, height: 48, borderRadius: radii.md },
  thumbClear: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { gap: 4 },
  hint: { fontSize: fontSize.xs },
  count: { fontSize: fontSize.xs },
  clearAll: {
    fontSize: fontSize.xs,
    textDecorationLine: "underline",
    marginTop: 2,
  },
});
