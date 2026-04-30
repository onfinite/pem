import { useTheme } from "@/contexts/ThemeContext";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space, radii } from "@/constants/typography";
import { ChevronDown, ChevronUp, X } from "lucide-react-native";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  query: string;
  resultCount: number;
  isSearching: boolean;
  activeIndex: number;
  onQueryChange: (text: string) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export default function ChatSearchBar({
  query,
  resultCount,
  isSearching,
  activeIndex,
  onQueryChange,
  onClose,
  onPrev,
  onNext,
}: Props) {
  const { colors } = useTheme();
  const hasResults = resultCount > 0;
  const counterText = hasResults
    ? `${activeIndex >= 0 ? activeIndex + 1 : 0}/${resultCount}`
    : "";

  return (
    <View style={[styles.container, { borderBottomColor: colors.borderMuted }]}>
      <View style={[styles.inputRow, { backgroundColor: colors.cardBackground }]}>
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
          placeholder="Search messages…"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={onQueryChange}
          autoFocus
          returnKeyType="search"
        />
        {isSearching && <ActivityIndicator size="small" color={pemAmber} />}

        {hasResults && (
          <View style={styles.navGroup}>
            <Text style={[styles.counterText, { color: colors.textTertiary }]}>
              {counterText}
            </Text>
            <Pressable onPress={onPrev} hitSlop={8} style={styles.chevron}>
              <ChevronUp size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable onPress={onNext} hitSlop={8} style={styles.chevron}>
              <ChevronDown size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}

        <Pressable onPress={onClose} hitSlop={10}>
          <X size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {query.trim().length > 0 && !isSearching && resultCount === 0 && (
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          No messages found
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: space[3],
    marginVertical: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radii.md,
    gap: space[2],
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    paddingVertical: 0,
  },
  navGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  counterText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.xs,
    fontVariant: ["tabular-nums"],
    marginRight: 4,
  },
  chevron: {
    padding: 2,
  },
  emptyText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    textAlign: "center",
    paddingVertical: space[4],
  },
});
