import { useTheme } from "@/contexts/ThemeContext";
import { Alert, Pressable, Text, View } from "react-native";
import { editSheetStyles as s } from "./taskEditSheet.styles";

interface EditSheetActionsProps {
  onDismiss: () => void;
  onDelete: () => void;
}

export function EditSheetActions({ onDismiss, onDelete }: EditSheetActionsProps) {
  const { colors } = useTheme();

  const handleDelete = () => {
    Alert.alert("Delete task", "Are you sure? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);
  };

  return (
    <View style={s.actionsRow}>
      <Pressable style={s.textBtn} onPress={onDismiss}>
        <Text style={[s.textBtnLabel, { color: colors.textTertiary }]}>
          Dismiss
        </Text>
      </Pressable>
      <Pressable style={s.textBtn} onPress={handleDelete}>
        <Text style={[s.textBtnLabel, { color: colors.error }]}>Delete</Text>
      </Pressable>
    </View>
  );
}
