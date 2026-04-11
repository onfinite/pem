import { useTheme } from "@/contexts/ThemeContext";
import { Inbox } from "lucide-react-native";
import { Text, View } from "react-native";
import { inboxStyles } from "./inboxTab.styles";

export function InboxGeneralTasksHeader({
  count,
  show,
}: {
  count: number;
  show: boolean;
}) {
  const { colors } = useTheme();

  if (!show) return null;

  return (
    <View
      style={[
        inboxStyles.sectionHeader,
        { borderBottomColor: colors.borderMuted },
      ]}
    >
      <Inbox size={16} color={colors.textTertiary} />
      <Text style={[inboxStyles.sectionTitle, { color: colors.textPrimary }]}>
        Tasks
      </Text>
      <Text style={[inboxStyles.sectionCount, { color: colors.textTertiary }]}>
        {count}
      </Text>
    </View>
  );
}
