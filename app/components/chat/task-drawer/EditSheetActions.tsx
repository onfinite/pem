import { useTheme } from "@/contexts/ThemeContext";
import { Pressable, Text, View } from "react-native";
import { editSheetStyles as s } from "./taskEditSheet.styles";

interface EditSheetActionsProps {
  onDismiss: () => void;
}

export function EditSheetActions({ onDismiss }: EditSheetActionsProps) {
  const { colors } = useTheme();

  return (
    <View style={s.actionsRow}>
      <Pressable style={s.textBtn} onPress={onDismiss}>
        <Text style={[s.textBtnLabel, { color: colors.textTertiary }]}>
          Dismiss
        </Text>
      </Pressable>
    </View>
  );
}
