import HubEmptyState from "@/components/shell/HubEmptyState";
import { Loader2 } from "lucide-react-native";
import { useTheme } from "@/contexts/ThemeContext";

type Props = { variant?: "default" | "inbox" };

/** Prepping tab with nothing in flight — intentional, not an error. */
export default function HomePreppingEmpty({ variant = "default" }: Props) {
  const { colors } = useTheme();
  const inbox = variant === "inbox";
  return (
    <HubEmptyState
      icon={<Loader2 size={30} stroke={colors.textSecondary} strokeWidth={2} />}
      title={inbox ? "Nothing brewing" : "Nothing in flight"}
      body={
        inbox
          ? "Dump something and Pem gets to work."
          : "After you dump, active work shows up here until it lands in Ready."
      }
    />
  );
}
