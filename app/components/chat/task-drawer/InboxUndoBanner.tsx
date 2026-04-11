import { pemAmber } from "@/constants/theme";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/lib/pemApi";
import { Pressable, Text, View } from "react-native";
import { inboxStyles } from "./inboxTab.styles";

export function InboxUndoBanner({
  recentDone,
  onUndo,
}: {
  recentDone: ApiExtract[];
  onUndo: (id: string) => void;
}) {
  const { colors } = useTheme();

  if (recentDone.length === 0) return null;

  return (
    <View
      style={[inboxStyles.undoSection, { backgroundColor: colors.secondarySurface }]}
    >
      {recentDone.map((item) => (
        <View key={item.id} style={inboxStyles.undoRow}>
          <Text
            style={[inboxStyles.undoText, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {item.text}
          </Text>
          <Pressable onPress={() => onUndo(item.id)} hitSlop={8}>
            <Text style={[inboxStyles.undoBtn, { color: pemAmber }]}>Undo</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
