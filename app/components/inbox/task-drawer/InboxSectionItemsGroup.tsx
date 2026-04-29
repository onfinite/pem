import type { ReactNode } from "react";
import { View } from "react-native";
import { inboxStyles } from "@/components/inbox/task-drawer/inboxTab.styles";

export function InboxSectionItemsGroup({ children }: { children: ReactNode }) {
  return (
    <View style={inboxStyles.sectionItemsInset}>
      {children}
    </View>
  );
}
