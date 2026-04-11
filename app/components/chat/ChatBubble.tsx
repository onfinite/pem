import { useTheme } from "@/contexts/ThemeContext";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, lh, space, radii } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import type { ClientMessage } from "@/app/(app)/chat";
import { AlertCircle, Check, CheckCheck, ListTodo } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef } from "react";
import { Alert, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { MarkdownText } from "./MarkdownText";
import VoiceBubble from "./VoiceBubble";

type Props = {
  message: ClientMessage;
  isHighlighted?: boolean;
  onRetry?: (message: ClientMessage) => void;
  onViewTasks?: () => void;
};

export default function ChatBubble({ message, isHighlighted, onRetry, onViewTasks }: Props) {
  const { colors } = useTheme();
  const isUser = message.role === "user";
  const isBrief = message.kind === "brief";
  const isSending = message._clientStatus === "sending";
  const isFailed = message._clientStatus === "failed";

  const flashOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isHighlighted) return;
    flashOpacity.setValue(1);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 1200,
      useNativeDriver: true,
    }).start();
  }, [isHighlighted, flashOpacity]);

  if (message.kind === "voice") {
    return (
      <VoiceBubble
        key={message.id}
        message={message}
        isUser={isUser}
        isSending={isSending}
        isFailed={isFailed}
        onRetry={onRetry ? () => onRetry(message) : undefined}
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

  const meta = message.metadata;
  const hasActions =
    meta &&
    ((meta.tasks_created ?? 0) > 0 ||
      (meta.tasks_updated ?? 0) > 0 ||
      (meta.tasks_completed ?? 0) > 0 ||
      (meta.calendar_written ?? 0) > 0);

  const handleLongPress = () => {
    if (!content) return;
    pemImpactLight();
    Alert.alert("Message", undefined, [
      {
        text: "Copy",
        onPress: () => Clipboard.setStringAsync(content),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={[styles.row, isUser && styles.rowRight]}>
      {isHighlighted && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: pemAmber, opacity: flashOpacity, borderRadius: radii.lg },
          ]}
        />
      )}
      <Pressable
        onLongPress={handleLongPress}
        style={[
          styles.bubble,
          { backgroundColor: bubbleBg },
          isUser ? styles.bubbleUser : styles.bubblePem,
          isBrief && { borderWidth: 1, borderColor: colors.borderMuted },
          isSending && { opacity: 0.8 },
          isFailed && { opacity: 0.6 },
        ]}
      >
        {isBrief && (
          <Text style={[styles.briefLabel, { color: pemAmber }]}>
            Daily Brief
          </Text>
        )}
        {isUser ? (
          <Text style={[styles.text, { color: textColor }]}>{content}</Text>
        ) : (
          <MarkdownText style={[styles.text, { color: textColor }]}>
            {content}
          </MarkdownText>
        )}

        {isFailed && (
          <Pressable
            onPress={onRetry ? () => onRetry(message) : undefined}
            style={styles.retryRow}
            hitSlop={8}
          >
            <AlertCircle size={14} color="#ff3b30" />
            <Text style={styles.retryText}>Failed — tap to retry</Text>
          </Pressable>
        )}

        {!isUser && hasActions && onViewTasks && (
          <Pressable
            onPress={onViewTasks}
            style={[styles.viewTasksChip, { backgroundColor: colors.secondarySurface }]}
            hitSlop={6}
          >
            <ListTodo size={13} color={pemAmber} strokeWidth={2} />
            <Text style={[styles.viewTasksText, { color: pemAmber }]}>
              View tasks
            </Text>
          </Pressable>
        )}

        <View style={styles.metaRow}>
          <Text style={[styles.time, { color: tickColor }]}>{time}</Text>
          {isUser &&
            (isFailed ? (
              <AlertCircle size={14} color="#ff3b30" />
            ) : isSending ? (
              <Check size={14} color={tickColor} strokeWidth={2} />
            ) : (
              <CheckCheck size={14} color={tickColor} strokeWidth={2} />
            ))}
        </View>
      </Pressable>
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
  retryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: space[2],
    paddingVertical: 4,
  },
  retryText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    color: "#ff3b30",
  },
  viewTasksChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: space[2],
    paddingHorizontal: space[2],
    paddingVertical: 5,
    borderRadius: 12,
  },
  viewTasksText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
  },
});
