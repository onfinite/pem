import HubEmptyState from "@/components/shell/HubEmptyState";
import PemButton from "@/components/ui/PemButton";
import { pemImpactLight } from "@/lib/pemHaptics";
import { useTheme } from "@/contexts/ThemeContext";
import { router } from "expo-router";
import { Inbox } from "lucide-react-native";

type Props = { variant?: "default" | "inbox" };

export default function HomeReadyEmpty({ variant = "default" }: Props) {
  const { colors } = useTheme();
  const inbox = variant === "inbox";
  return (
    <HubEmptyState
      icon={<Inbox size={32} stroke={colors.textSecondary} strokeWidth={2} />}
      title={inbox ? "Nothing here yet" : "Nothing for you yet"}
      body={
        inbox
          ? "Tap the button below and dump anything on your mind."
          : "Drop a thought in the composer — Pem will prep it and land it here when it’s ready to open."
      }
    >
      <PemButton
        variant="primary"
        size="lg"
        onPress={() => {
          pemImpactLight();
          router.push("/dump");
        }}
      >
        Dump something
      </PemButton>
    </HubEmptyState>
  );
}
