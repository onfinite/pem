import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, space, radii } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import type { ClientMessage } from "@/lib/chatScreenClientMessage.types";
import { collectUserPhotoDisplayUris } from "@/utils/collectUserPhotoDisplayUris";
import { UserPhotoPreviewModal } from "@/components/chat/UserPhotoPreviewModal";
import { UserPhotoBubbleThumbnails } from "@/components/chat/UserPhotoBubbleThumbnails";
import { AlertCircle, Check, CheckCheck } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  message: ClientMessage;
  isSending: boolean;
  isFailed: boolean;
  onRetry?: () => void;
  onCopyFeedback?: () => void;
};

export function UserPhotoBubble({
  message,
  isSending,
  isFailed,
  onRetry,
  onCopyFeedback,
}: Props) {
  const { colors } = useTheme();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const uris = collectUserPhotoDisplayUris(message);
  const caption = (message.content ?? "").trim();
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const tickColor = colors.userBubbleMeta;

  const handleLongPress = useCallback(() => {
    if (!caption) return;
    pemImpactLight();
    void Clipboard.setStringAsync(caption);
    onCopyFeedback?.();
  }, [caption, onCopyFeedback]);

  return (
    <View style={[styles.row, styles.rowRight]}>
      <Pressable
        onPress={() => uris.length > 0 && setIsPreviewOpen(true)}
        onLongPress={caption ? handleLongPress : undefined}
        style={[
          styles.bubble,
          { backgroundColor: colors.userBubble },
          isSending && styles.dim,
          isFailed && styles.dim,
        ]}
      >
        <UserPhotoBubbleThumbnails
          uris={uris}
          userBubbleText={colors.userBubbleText}
          secondarySurface={colors.secondarySurface}
          isSending={isSending}
        />
        {caption ? (
          <Text style={[styles.caption, { color: colors.userBubbleText }]}>
            {caption}
          </Text>
        ) : null}
        {isFailed && (
          <Pressable onPress={onRetry} style={styles.retryRow} hitSlop={8}>
            <AlertCircle size={14} color="#ff3b30" />
            <Text style={styles.retryText}>Failed — tap to retry</Text>
          </Pressable>
        )}
        <View style={styles.metaRow}>
          <Text style={[styles.time, { color: tickColor }]}>{time}</Text>
          {isFailed ? (
            <AlertCircle size={14} color="#ff3b30" />
          ) : isSending ? (
            <Check size={14} color={tickColor} strokeWidth={2} />
          ) : (
            <CheckCheck size={14} color={tickColor} strokeWidth={2} />
          )}
        </View>
      </Pressable>

      <UserPhotoPreviewModal
        uris={uris}
        visible={isPreviewOpen}
        onClose={() => {
          pemImpactLight();
          setIsPreviewOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginBottom: space[2],
    paddingHorizontal: space[3],
  },
  rowRight: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "80%",
    padding: space[2],
    borderRadius: radii.lg,
    borderBottomRightRadius: radii.sm,
  },
  dim: { opacity: 0.75 },
  caption: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, 1.4),
    marginTop: space[2],
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
  },
  retryText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    color: "#ff3b30",
  },
});
