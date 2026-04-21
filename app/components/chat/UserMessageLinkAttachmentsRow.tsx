import type { ClientMessage } from "@/lib/chatScreenClientMessage.types";
import { space } from "@/constants/typography";
import { StyleSheet, View } from "react-native";
import { MessageLinkPreviewCards } from "./MessageLinkPreviewCards";

type Props = {
  message: ClientMessage;
};

export function UserMessageLinkAttachmentsRow({ message }: Props) {
  if (message.role !== "user") return null;

  const previews = message.link_previews;
  if (!previews?.length) return null;

  return (
    <View style={styles.embedded}>
      <MessageLinkPreviewCards items={previews} />
    </View>
  );
}

const styles = StyleSheet.create({
  embedded: {
    marginTop: space[1],
    width: "100%",
  },
});
