import { useTheme } from "@/contexts/ThemeContext";
import { Pressable, ScrollView, Text, View } from "react-native";
import { editSheetStyles as s } from "@/components/chat/task-drawer/taskEditSheet.styles";

export type ChipOption = {
  key: string;
  label: string;
  /** Background color when active (defaults to pemAmber). */
  activeColor?: string;
};

interface EditSheetChipRowProps {
  options: ChipOption[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}

export function EditSheetChipRow({
  options,
  activeKey,
  onSelect,
}: EditSheetChipRowProps) {
  const { colors } = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={s.chipRow}>
        {options.map((opt) => {
          const isActive = opt.key === activeKey;
          const activeBg = opt.activeColor ?? colors.pemAmber;
          return (
            <Pressable
              key={opt.key}
              style={[
                s.chip,
                {
                  backgroundColor: isActive ? activeBg : "transparent",
                  borderColor: isActive ? activeBg : colors.border,
                },
              ]}
              onPress={() => onSelect(opt.key)}
            >
              <Text
                style={[
                  s.chipText,
                  { color: isActive ? "#ffffff" : colors.textSecondary },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
