import HubEmptyState from "@/components/shell/HubEmptyState";
import { useTheme } from "@/contexts/ThemeContext";
import { Inbox } from "lucide-react-native";

/**
 * Ready tab empty — FAB (+) is the primary capture; no duplicate CTA here.
 */
export default function HomeReadyEmpty() {
  const { colors } = useTheme();
  return (
    <HubEmptyState
      icon={<Inbox size={32} stroke={colors.textSecondary} strokeWidth={2} />}
      title="Nothing here yet"
      body="Tap the + button to dump anything on your mind. Pem will prep it and land it here when it’s ready to open."
    />
  );
}
