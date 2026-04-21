import type { ClientMessage } from "@/lib/chatScreenClientMessage.types";
import { space } from "@/constants/typography";
import { StyleSheet, View } from "react-native";
import { MessageLinkPreviewCards } from "./MessageLinkPreviewCards";

type Props = {
  message: ClientMessage;
  /** Hide link-card hero image when the message already has user photos (avoid stacked thumbnails). */
  omitLinkPreviewHero?: boolean;
};

export function UserMessageLinkAttachmentsRow({
  message,
  omitLinkPreviewHero = false,
}: Props) {
  const previews =
    message.link_previews ?? message.metadata?.link_previews ?? undefined;
  if (!previews?.length) return null;

  return (
    <View style={styles.embedded}>
      <MessageLinkPreviewCards
        items={previews}
        omitLinkPreviewHero={omitLinkPreviewHero}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  embedded: {
    marginTop: space[1],
    width: "100%",
  },
});
