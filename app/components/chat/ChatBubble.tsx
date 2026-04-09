import { useTheme } from "@/contexts/ThemeContext";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, lh, space, radii } from "@/constants/typography";
import type { ClientMessage } from "@/app/(app)/chat";
import { Check, CheckCheck } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import VoiceBubble from "./VoiceBubble";

type Props = {
  message: ClientMessage;
};

export default function ChatBubble({ message }: Props) {
  const { colors } = useTheme();
  const isUser = message.role === "user";
  const isBrief = message.kind === "brief";
  const isSending = message._clientStatus === "sending";

  if (message.kind === "voice") {
    return (
      <VoiceBubble
        message={message}
        isUser={isUser}
        isSending={isSending}
      />
    );
  }

  const bubbleBg = isUser
    ? colors.userBubble
    : isBrief
      ? colors.brandMutedSurface
      : colors.cardBackground;
  const textColor = isUser ? colors.userBubbleText : colors.textPrimary;

  const content = message.content ?? message.transcript ?? "";
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const tickColor = isUser ? colors.userBubbleMeta : colors.textTertiary;

  return (
    <View style={[styles.row, isUser && styles.rowRight]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: bubbleBg },
          isUser ? styles.bubbleUser : styles.bubblePem,
          isBrief && { borderWidth: 1, borderColor: colors.borderMuted },
          isSending && { opacity: 0.8 },
        ]}
      >
        {isBrief && (
          <Text style={[styles.briefLabel, { color: pemAmber }]}>
            Morning Brief
          </Text>
        )}
        <Text style={[styles.text, { color: textColor }]}>{content}</Text>
        <View style={styles.metaRow}>
          <Text style={[styles.time, { color: tickColor }]}>{time}</Text>
          {isUser && (
            isSending ? (
              <Check size={14} color={tickColor} strokeWidth={2} />
            ) : (
              <CheckCheck size={14} color={tickColor} strokeWidth={2} />
            )
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginBottom: space[2],
    paddingHorizontal: space[3],
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radii.lg,
  },
  bubbleUser: {
    borderBottomRightRadius: radii.sm,
  },
  bubblePem: {
    borderBottomLeftRadius: radii.sm,
  },
  briefLabel: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xs,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: space[1],
  },
  text: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, 1.4),
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: space[1],
  },
  time: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.xs,
  },
});
