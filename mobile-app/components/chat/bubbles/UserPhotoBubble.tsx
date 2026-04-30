import { useTheme } from "@/contexts/ThemeContext";
import { USER_PHOTOS_SHARED_LABEL } from "@/constants/chatPhotos.constants";
import { fontFamily, fontSize, lh, space, radii } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import type { ClientMessage } from "@/lib/chatScreenClientMessage.types";
import { collectUserPhotoDisplayUris } from "@/utils/images/collectUserPhotoDisplayUris";
import { UserPhotoPreviewModal } from "@/components/chat/media/UserPhotoPreviewModal";
import { UserMessageLinkAttachmentsRow } from "@/components/chat/links/UserMessageLinkAttachmentsRow";
import { MarkdownText } from "@/components/chat/bubbles/MarkdownText";
import { extractHttpUrlsFromUserText } from "@/utils/text/extractHttpUrlsFromUserText";
import { UserPhotoBubbleThumbnails } from "@/components/chat/bubbles/UserPhotoBubbleThumbnails";
import { AlertCircle, Check, CheckCheck } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { useCallback, useMemo, useState } from "react";
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
  const [lightboxStart, setLightboxStart] = useState<number | null>(null);
  const uris = collectUserPhotoDisplayUris(message);
  const rawCaption = (message.content ?? "").trim();
  const hasCaption = Boolean(rawCaption);
  const userHasInlineLinkUrls = useMemo(
    () => extractHttpUrlsFromUserText(rawCaption).length > 0,
    [rawCaption],
  );
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const tickColor = colors.userBubbleMeta;

  const handleLongPressCaption = useCallback(() => {
    if (!rawCaption) return;
    pemImpactLight();
    void Clipboard.setStringAsync(rawCaption);
    onCopyFeedback?.();
  }, [rawCaption, onCopyFeedback]);

  return (
    <View style={[styles.row, styles.rowRight]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: colors.userBubble },
          isSending && styles.dim,
          isFailed && styles.dim,
        ]}
      >
        {hasCaption ? (
          <Pressable onLongPress={handleLongPressCaption}>
            <MarkdownText
              style={[styles.caption, { color: colors.userBubbleText }]}
              userBubbleInlineLinks={userHasInlineLinkUrls}
            >
              {rawCaption}
            </MarkdownText>
          </Pressable>
        ) : null}

        {hasCaption ? (
          <Text
            style={[styles.photosLabel, { color: colors.textSecondary }]}
          >
            {USER_PHOTOS_SHARED_LABEL}
          </Text>
        ) : null}

        <UserPhotoBubbleThumbnails
          uris={uris}
          userBubbleText={colors.userBubbleText}
          secondarySurface={colors.secondarySurface}
          borderColor={colors.borderMuted}
          isSending={isSending}
          onOpenAt={(i) => setLightboxStart(i)}
        />

        <UserMessageLinkAttachmentsRow
          message={message}
          omitLinkPreviewHero
        />
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
      </View>

      <UserPhotoPreviewModal
        uris={uris}
        startIndex={lightboxStart}
        onClose={() => setLightboxStart(null)}
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
    gap: space[2],
  },
  dim: { opacity: 0.75 },
  caption: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, 1.4),
  },
  photosLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
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
