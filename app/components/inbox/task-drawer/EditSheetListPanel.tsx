import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiList } from "@/lib/pemApi";
import { ArrowLeft, Check, List } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

interface EditSheetListPanelProps {
  lists: ApiList[];
  activeListId: string | null;
  onSelect: (listId: string | null) => void;
  onBack: () => void;
}

export function EditSheetListPanel({ lists, activeListId, onSelect, onBack }: EditSheetListPanelProps) {
  const { colors } = useTheme();

  return (
    <View style={local.root}>
      <Pressable style={local.backRow} onPress={onBack} hitSlop={8}>
        <ArrowLeft size={20} color={colors.textPrimary} />
        <Text style={[local.backText, { color: colors.textPrimary }]}>List</Text>
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Pressable style={[local.row, { borderBottomColor: colors.borderMuted }]} onPress={() => onSelect(null)}>
          <View style={local.rowContent}>
            <List size={18} color={colors.textSecondary} />
            <Text style={[local.rowText, { color: colors.textPrimary }]}>No list</Text>
          </View>
          {!activeListId && <Check size={18} color={pemAmber} />}
        </Pressable>

        {lists.map((l) => (
          <Pressable key={l.id} style={[local.row, { borderBottomColor: colors.borderMuted }]} onPress={() => onSelect(l.id)}>
            <View style={local.rowContent}>
              <List size={18} color={colors.textSecondary} />
              <Text style={[local.rowText, { color: colors.textPrimary }]}>{l.name}</Text>
            </View>
            {activeListId === l.id && <Check size={18} color={pemAmber} />}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  root: { flex: 1 },
  backRow: { flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[4], paddingVertical: space[3] },
  backText: { fontFamily: fontFamily.sans.semibold, fontSize: fontSize.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space[4], paddingHorizontal: space[4], borderBottomWidth: StyleSheet.hairlineWidth },
  rowContent: { flexDirection: "row", alignItems: "center", gap: space[3] },
  rowText: { fontFamily: fontFamily.sans.regular, fontSize: fontSize.base },
});
