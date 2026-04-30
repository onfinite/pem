import type { ChatLinkPreview } from "@/services/api/pemApi";
import { View, StyleSheet } from "react-native";
import { space } from "@/constants/typography";
import { MessageLinkPreviewCard } from "@/components/chat/links/MessageLinkPreviewCard";

type Props = {
  items: ChatLinkPreview[];
  omitLinkPreviewHero?: boolean;
};

export function MessageLinkPreviewCards({
  items,
  omitLinkPreviewHero = false,
}: Props) {
  if (!items.length) return null;

  return (
    <View style={styles.wrap}>
      {items.map((p, i) => (
        <MessageLinkPreviewCard
          key={`${p.original_url}-${String(i)}`}
          preview={p}
          omitHero={omitLinkPreviewHero}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2], width: "100%", maxWidth: "100%" },
});
