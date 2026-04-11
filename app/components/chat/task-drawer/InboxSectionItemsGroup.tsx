import { useTheme } from "@/contexts/ThemeContext";
import type { ReactNode } from "react";
import { View } from "react-native";
import { inboxStyles } from "./inboxTab.styles";

export function InboxSectionItemsGroup({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        inboxStyles.sectionItemsInset,
        { borderLeftColor: colors.borderMuted },
      ]}
    >
      {children}
    </View>
  );
}
