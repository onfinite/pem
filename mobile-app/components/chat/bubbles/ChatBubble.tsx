import { useTheme } from "@/contexts/ThemeContext";
import { pemAmber } from "@/constants/theme";
import { USER_PHOTOS_SHARED_LABEL } from "@/constants/chatPhotos.constants";
import { fontFamily, fontSize, lh, space, radii } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import type { ClientMessage } from "@/lib/chatScreenClientMessage.types";
import { AlertCircle, Check, CheckCheck, ListTodo } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { UserPhotoPreviewModal } from "@/components/chat/media/UserPhotoPreviewModal";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { MarkdownText } from "@/components/chat/bubbles/MarkdownText";
import VoiceBubble from "@/components/chat/bubbles/VoiceBubble";
import { UserPhotoBubble } from "@/components/chat/bubbles/UserPhotoBubble";
import { UserPhotoBubbleThumbnails } from "@/components/chat/bubbles/UserPhotoBubbleThumbnails";
import { PemPhotoRecallStrip } from "@/components/chat/media/PemPhotoRecallStrip";
import { UserMessageLinkAttachmentsRow } from "@/components/chat/links/UserMessageLinkAttachmentsRow";
import { extractHttpUrlsFromUserText } from "@/utils/text/extractHttpUrlsFromUserText";
import { collectUserPhotoDisplayUris } from "@/utils/images/collectUserPhotoDisplayUris";
import { mergePhotoRecallWithPersisted } from "@/utils/images/mergePhotoRecallWithPersisted";

type Props = {
  message: ClientMessage;
  isHighlighted?: boolean;
  onRetry?: (message: ClientMessage) => void;
  onViewTasks?: () => void;
  /** Shown in chat header after long-press copy. */
  onCopyFeedback?: () => void;
};

export default function ChatBubble({
  message,
  isHighlighted,
  onRetry,
  onViewTasks,
  onCopyFeedback,
}: Props) {
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

  const [voicePhotoLightboxStart, setVoicePhotoLightboxStart] = useState<
    number | null
  >(null);

  const meta = message.metadata;
  const photoRecallForDisplay = useMemo(
    () =>
      mergePhotoRecallWithPersisted(
        meta?.photo_recall,
        message._persistedPhotoRecall,
      ),
    [meta?.photo_recall, message._persistedPhotoRecall],
  );

  const rawTextContent = message.content ?? message.transcript ?? "";
  const effectiveLinkPreviews = useMemo(
    () => message.link_previews ?? message.metadata?.link_previews ?? null,
    [message.link_previews, message.metadata?.link_previews],
  );

  const userHasInlineLinkUrls = useMemo(
    () =>
      message.role === "user" &&
      extractHttpUrlsFromUserText(rawTextContent).length > 0,
    [message.role, rawTextContent],
  );

  const pemHasInlineLinkUrls = useMemo(
    () =>
      message.role === "pem" &&
      extractHttpUrlsFromUserText(rawTextContent).length > 0,
    [message.role, rawTextContent],
  );

  const userHasLinkAttachments =
    message.role === "user" &&
    (extractHttpUrlsFromUserText(rawTextContent).length > 0 ||
      (effectiveLinkPreviews?.length ?? 0) > 0);

  if (message.kind === "image") {
    return (
      <UserPhotoBubble
        message={message}
        isSending={isSending}
        isFailed={isFailed}
        onRetry={onRetry ? () => onRetry(message) : undefined}
        onCopyFeedback={onCopyFeedback}
      />
    );
  }

  if (message.kind === "voice") {
    const voicePhotoUris =
      isUser ? collectUserPhotoDisplayUris(message) : [];
    if (voicePhotoUris.length > 0) {
      if (userHasLinkAttachments) {
        return (
          <>
            <View style={voiceWithPhotosStyles.column}>
              <View
                style={[
                  voiceWithPhotosStyles.unifiedUserLinkShell,
                  { backgroundColor: colors.userBubble },
                ]}
              >
                <VoiceBubble
                  key={message.id}
                  message={message}
                  isUser={isUser}
                  isSending={isSending}
                  isFailed={isFailed}
                  onRetry={onRetry ? () => onRetry(message) : undefined}
                  omitOuterGutters
                  transparentUserSurface
                />
                <View style={voiceWithPhotosStyles.unifiedUserPhotosBlock}>
                  <Text
                    style={[
                      voiceWithPhotosStyles.photosLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {USER_PHOTOS_SHARED_LABEL}
                  </Text>
                  <UserPhotoBubbleThumbnails
                    uris={voicePhotoUris}
                    userBubbleText={colors.userBubbleText}
                    secondarySurface={colors.secondarySurface}
                    borderColor={colors.borderMuted}
                    isSending={isSending}
                    onOpenAt={(i) => setVoicePhotoLightboxStart(i)}
                  />
                </View>
                <View style={voiceWithPhotosStyles.unifiedUserLinkFooter}>
                  <UserMessageLinkAttachmentsRow
                    message={message}
                    omitLinkPreviewHero
                  />
                </View>
              </View>
            </View>
            <UserPhotoPreviewModal
              uris={voicePhotoUris}
              startIndex={voicePhotoLightboxStart}
              onClose={() => setVoicePhotoLightboxStart(null)}
            />
          </>
        );
      }
      return (
        <>
          <View style={voiceWithPhotosStyles.column}>
            <VoiceBubble
              key={message.id}
              message={message}
              isUser={isUser}
              isSending={isSending}
              isFailed={isFailed}
              onRetry={onRetry ? () => onRetry(message) : undefined}
              omitOuterGutters
            />
            <Text
              style={[
                voiceWithPhotosStyles.photosLabel,
                { color: colors.textSecondary },
              ]}
            >
              {USER_PHOTOS_SHARED_LABEL}
            </Text>
            <UserPhotoBubbleThumbnails
              uris={voicePhotoUris}
              userBubbleText={colors.userBubbleText}
              secondarySurface={colors.secondarySurface}
              borderColor={colors.borderMuted}
              isSending={isSending}
              onOpenAt={(i) => setVoicePhotoLightboxStart(i)}
            />
          </View>
          <UserPhotoPreviewModal
            uris={voicePhotoUris}
            startIndex={voicePhotoLightboxStart}
            onClose={() => setVoicePhotoLightboxStart(null)}
          />
        </>
      );
    }
    if (userHasLinkAttachments && isUser) {
      return (
        <View style={voiceWithPhotosStyles.voiceUserUnifiedRow}>
          <View
            style={[
              voiceWithPhotosStyles.unifiedUserLinkShell,
              { backgroundColor: colors.userBubble },
            ]}
          >
            <VoiceBubble
              key={message.id}
              message={message}
              isUser={isUser}
              isSending={isSending}
              isFailed={isFailed}
              onRetry={onRetry ? () => onRetry(message) : undefined}
              omitOuterGutters
              transparentUserSurface
            />
            <View style={voiceWithPhotosStyles.unifiedUserLinkFooter}>
              <UserMessageLinkAttachmentsRow
                message={message}
                omitLinkPreviewHero
              />
            </View>
          </View>
        </View>
      );
    }
    return (
      <View
        style={
          isUser ? voiceWithPhotosStyles.voiceUserOnlyColumn : undefined
        }
      >
        <VoiceBubble
          key={message.id}
          message={message}
          isUser={isUser}
          isSending={isSending}
          isFailed={isFailed}
          onRetry={onRetry ? () => onRetry(message) : undefined}
        />
      </View>
    );
  }

  const bubbleBg = isUser
    ? colors.userBubble
    : isBrief
      ? colors.brandMutedSurface
      : colors.cardBackground;
  const textColor = isUser ? colors.userBubbleText : colors.textPrimary;

  const showUserMarkdown = !isUser || rawTextContent.trim().length > 0;
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const tickColor = isUser ? colors.userBubbleMeta : colors.textTertiary;

  const hasActions =
    meta &&
    ((meta.tasks_created ?? 0) > 0 ||
      (meta.tasks_updated ?? 0) > 0 ||
      (meta.tasks_completed ?? 0) > 0 ||
      (meta.calendar_written ?? 0) > 0);

  const handleLongPress = () => {
    const text = rawTextContent.trim();
    if (!text) return;
    pemImpactLight();
    void Clipboard.setStringAsync(text);
    onCopyFeedback?.();
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
      <View style={isUser ? voiceWithPhotosStyles.userTextStack : undefined}>
        <Pressable
          onLongPress={handleLongPress}
          style={({ pressed }) => {
            const base = [
              styles.bubble,
              { backgroundColor: bubbleBg },
              isUser ? styles.bubbleUser : styles.bubblePem,
              isBrief && { borderWidth: 1, borderColor: colors.borderMuted },
            ];
            if (isFailed) return [...base, { opacity: 0.6 }];
            if (isSending) return [...base, { opacity: 0.8 }];
            if (pressed) return [...base, { opacity: 0.88 }];
            return base;
          }}
        >
          {isBrief && (
            <Text style={[styles.briefLabel, { color: pemAmber }]}>
              Daily Brief
            </Text>
          )}
          {showUserMarkdown ? (
            <MarkdownText
              style={[styles.text, { color: textColor }]}
              userBubbleInlineLinks={
                userHasInlineLinkUrls || pemHasInlineLinkUrls
              }
            >
              {rawTextContent}
            </MarkdownText>
          ) : null}

          {!isUser && photoRecallForDisplay.length > 0 && (
            <PemPhotoRecallStrip items={photoRecallForDisplay} />
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

          {isUser && (effectiveLinkPreviews?.length ?? 0) > 0 ? (
            <UserMessageLinkAttachmentsRow message={message} />
          ) : null}

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
    </View>
  );
}

const voiceWithPhotosStyles = StyleSheet.create({
  column: {
    alignItems: "flex-end",
    width: "100%",
    paddingHorizontal: space[3],
    gap: space[2],
    marginBottom: space[2],
  },
  /** Voice-only user row: chips under bubble; no extra horizontal padding (VoiceBubble has gutters). */
  voiceUserOnlyColumn: {
    alignItems: "flex-end",
    gap: space[2],
  },
  /** Full row width so inner `maxWidth: "80%"` on the bubble resolves against the screen, not shrink-wrapped content (avoids ultra-narrow bubbles and mid-word URL breaks). */
  userTextStack: {
    width: "100%",
    alignItems: "flex-end",
    gap: space[2],
  },
  unifiedUserLinkShell: {
    alignSelf: "flex-end",
    maxWidth: "80%",
    borderRadius: radii.lg,
    borderBottomRightRadius: radii.sm,
    overflow: "hidden",
    gap: space[2],
  },
  unifiedUserPhotosBlock: {
    paddingHorizontal: space[3],
    gap: space[1],
  },
  photosLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
  },
  unifiedUserLinkFooter: {
    paddingHorizontal: space[3],
    paddingBottom: space[2],
  },
  voiceUserUnifiedRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: "100%",
    marginBottom: space[2],
    paddingHorizontal: space[3],
  },
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    width: "100%",
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
    overflow: "hidden",
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
