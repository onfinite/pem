import type { ChatLinkPreview } from "@/lib/pemApi";
import { View, StyleSheet } from "react-native";
import { space } from "@/constants/typography";
import { MessageLinkPreviewCard } from "./MessageLinkPreviewCard";

type Props = {
  items: ChatLinkPreview[];
};

export function MessageLinkPreviewCards({ items }: Props) {
  if (!items.length) return null;

  return (
    <View style={styles.wrap}>
      {items.map((p, i) => (
        <MessageLinkPreviewCard key={`${p.original_url}-${String(i)}`} preview={p} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2], width: "100%", maxWidth: "100%" },
});
