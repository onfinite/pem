import ChatBubble from "@/components/chat/ChatBubble";
import ChatDateHeader from "@/components/chat/ChatDateHeader";
import ChatInput from "@/components/chat/ChatInput";
import ChatSearchBar from "@/components/chat/ChatSearchBar";
import ChatStatusBubble from "@/components/chat/ChatStatusBubble";
import { ChatScreenEmptyState } from "@/components/chat/ChatScreenEmptyState";
import { ChatScreenHeader } from "@/components/chat/ChatScreenHeader";
import { ChatScreenSkeletonBubbles } from "@/components/chat/ChatScreenSkeletonBubbles";
import { ChatImageSourceSheet } from "@/components/chat/ChatImageSourceSheet";
import TaskDrawer, { type TaskDrawerHandle } from "@/components/inbox/TaskDrawer";
import { space } from "@/constants/typography";
import { pemAmber } from "@/constants/theme";
import { useTheme } from "@/contexts/ThemeContext";
import { useChatStream } from "@/hooks/useChatStream";
import { useMessageSearch } from "@/hooks/useMessageSearch";
import { pemImpactLight } from "@/lib/pemHaptics";
import {
  getBrief,
  getChatMessages,
  pollChatMessageForLinkPreviews,
  requestBrief,
  sendChatMessage,
  sendVoiceMessage,
  type BriefResponse,
} from "@/lib/pemApi";
import type { ClientMessage } from "@/lib/chatScreenClientMessage.types";
import { buildHeaderSummary } from "@/lib/chatScreenHeaderSummary";
import {
  mergeServerMessagesWithClientLocals,
  readChatMessagesCache,
  writeChatMessagesCache,
} from "@/lib/chatScreenMessageCache";
import {
  buildChatDisplayItems,
  type ChatDisplayItem,
} from "@/lib/buildChatDisplayItems";
import { MAX_CHAT_MESSAGE_IMAGES } from "@/constants/chatPhotos.constants";
import {
  uploadChatImagesAndSend,
  uploadPendingChatImageKeys,
} from "@/lib/uploadChatImage";
import {
  pendingImagesFromPickerAssets,
  type PendingChatImage,
} from "@/lib/pendingChatImagesFromPicker";
import {
  loadPendingImagesDraft,
  savePendingImagesDraft,
} from "@/lib/pendingChatImagesDraft";
import { setChatScreenFocused } from "@/lib/chatPushPresence";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Linking,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ChatScreen() {
  const { colors } = useTheme();
  const { getToken, userId, isLoaded: isAuthLoaded } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const copyChipOpacity = useRef(new Animated.Value(0)).current;

  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [briefData, setBriefData] = useState<BriefResponse | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingChatImage[]>([]);
  const [isImageSourceSheetVisible, setImageSourceSheetVisible] = useState(false);
  /** After first auth-aware draft load — avoids overwriting disk before hydrate. */
  const [pendingImagesHydrated, setPendingImagesHydrated] = useState(false);
  const pendingImageUris = pendingImages.map((p) => p.uri);
  const headerSummary = buildHeaderSummary(briefData);
  const drawerRef = useRef<TaskDrawerHandle>(null);
  const search = useMessageSearch(getToken);

  useFocusEffect(
    useCallback(() => {
      setChatScreenFocused(true);
      return () => setChatScreenFocused(false);
    }, []),
  );

  const kbHeight = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(kbHeight, {
        toValue: e.endCoordinates.height - insets.bottom,
        duration: 120,
        useNativeDriver: false,
      }).start();
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      Animated.timing(kbHeight, {
        toValue: 0,
        duration: 100,
        useNativeDriver: false,
      }).start();
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, [kbHeight, insets.bottom]);

  useEffect(() => {
    if (!isAuthLoaded) return;
    if (!userId) {
      setPendingImages([]);
      setPendingImagesHydrated(true);
      return;
    }
    setPendingImages([]);
    setPendingImagesHydrated(false);
    let cancelled = false;
    void (async () => {
      const restored = await loadPendingImagesDraft(userId);
      if (cancelled) return;
      setPendingImages(restored);
      setPendingImagesHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthLoaded, userId]);

  useEffect(() => {
    if (!isAuthLoaded || !userId || !pendingImagesHydrated) return;
    void savePendingImagesDraft(userId, pendingImages);
  }, [isAuthLoaded, userId, pendingImages, pendingImagesHydrated]);

  const countsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fetchCounts = useCallback(() => {
    clearTimeout(countsTimerRef.current);
    countsTimerRef.current = setTimeout(async () => {
      try {
        const b = await getBrief(getTokenRef.current);
        setBriefData(b);
      } catch { /* non-critical */ }
    }, 800);
  }, []);

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const loadMessages = useCallback(
    async (before?: string) => {
      try {
        const res = await getChatMessages(getTokenRef.current, { before, limit: 50 });
        const withStatus: ClientMessage[] = res.messages.map((m) => ({
          ...m,
          _clientStatus: "sent" as const,
        }));
        if (before) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const fresh = withStatus.filter((m) => !existingIds.has(m.id));
            return [...fresh, ...prev];
          });
        } else {
          setMessages((prev) => {
            const merged = mergeServerMessagesWithClientLocals(prev, withStatus);
            void writeChatMessagesCache(merged);
            return merged;
          });
        }
        setHasMore(res.has_more);
      } catch (e) {
        console.warn("Failed to load messages:", e);
      } finally {
        setLoading(false);
      }
    },
    [], // Stable — uses ref for getToken
  );

  // Load once on mount: show cache instantly, then fetch fresh
  useEffect(() => {
    let mounted = true;
    readChatMessagesCache().then((cached) => {
      if (!mounted) return;
      if (cached.length > 0) {
        setMessages(cached);
        setLoading(false);
      }
      loadMessages();
    });
    fetchCounts();
    requestBrief(getTokenRef.current).then((res) => {
      if (res.generated && mounted) loadMessages();
    }).catch(() => {});
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useChatStream({
    onPemMessage: (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, { ...msg, _clientStatus: "sent" as const }];
      });
      setStatusMap((prev) => {
        const next = { ...prev };
        if (msg.parent_message_id) delete next[msg.parent_message_id];
        return next;
      });
      // Pem response likely means tasks changed — refresh counts
      fetchCounts();
    },
    onStatus: (messageId, text) => {
      setStatusMap((prev) => ({ ...prev, [messageId]: text }));
    },
    onMessageUpdated: (messageId, field, value) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, [field]: value } : m,
        ),
      );
    },
    onTasksUpdated: () => {
      fetchCounts();
      drawerRef.current?.refresh();
    },
  });

  const handleSendText = useCallback(async (text: string) => {
    pemImpactLight();
    const tempId = `temp-text-${Date.now()}`;
    const optimistic: ClientMessage = {
      id: tempId,
      role: "user",
      kind: "text",
      content: text,
      voice_url: null,
      transcript: null,
      triage_category: null,
      processing_status: null,
      polished_text: null,
      parent_message_id: null,
      summary: null,
      created_at: new Date().toISOString(),
      _clientStatus: "sending",
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await sendChatMessage(getTokenRef.current, {
        kind: "text",
        content: text,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...res.message, _clientStatus: "sent" as const }
            : m,
        ),
      );
      setStatusMap((prev) => ({ ...prev, [res.message.id]: "Thinking..." }));
    } catch (e) {
      console.warn("Failed to send message:", e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, _clientStatus: "failed" as const } : m,
        ),
      );
    }
  }, []);

  const handleSendImage = useCallback(
    async (
      localUris: string[],
      opts?: { replaceMessageId?: string; caption?: string },
    ) => {
      pemImpactLight();
      const tempId = opts?.replaceMessageId ?? `temp-image-${Date.now()}`;
      const caption = opts?.caption?.trim() ?? null;
      const optimistic: ClientMessage = {
        id: tempId,
        role: "user",
        kind: "image",
        content: caption,
        voice_url: null,
        transcript: null,
        image_keys: null,
        image_urls: null,
        vision_summary: null,
        vision_summary_detail: null,
        triage_category: null,
        processing_status: null,
        polished_text: null,
        parent_message_id: null,
        summary: null,
        created_at: new Date().toISOString(),
        _clientStatus: "sending",
        _localUri: localUris[0],
        _pendingLocalUris: localUris.length > 1 ? localUris : undefined,
      };
      setMessages((prev) => {
        if (opts?.replaceMessageId) {
          return prev.map((m) =>
            m.id === opts.replaceMessageId ? optimistic : m,
          );
        }
        return [...prev, optimistic];
      });

      try {
        const res = await uploadChatImagesAndSend(getTokenRef.current, localUris, {
          content: caption ?? undefined,
        });
        const serverId = res.message.id;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...res.message,
                  _localUri: localUris.length === 1 ? localUris[0] : undefined,
                  _pendingLocalUris:
                    localUris.length > 1 ? localUris : undefined,
                  _clientStatus: "sent" as const,
                }
              : m,
          ),
        );
        setStatusMap((prev) => ({ ...prev, [serverId]: "Thinking..." }));

        void (async () => {
          try {
            const latest = await pollChatMessageForLinkPreviews(
              getTokenRef.current,
              serverId,
              { maxWaitMs: 22_000, intervalMs: 500 },
            );
            if (latest.link_previews?.length) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === serverId
                    ? { ...m, link_previews: latest.link_previews }
                    : m,
                ),
              );
            }
          } catch {
            /* SSE or GET may already have applied link_previews */
          }
        })();
      } catch (e) {
        console.warn("Failed to send image:", e);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, _clientStatus: "failed" as const } : m,
          ),
        );
        throw e;
      }
    },
    [],
  );

  const handleComposerSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (pendingImages.length > 0) {
        const uris = pendingImages.map((p) => p.uri);
        const snapshot = [...pendingImages];
        setPendingImages([]);
        try {
          await handleSendImage(uris, {
            caption: trimmed ? trimmed : undefined,
          });
        } catch {
          setPendingImages(snapshot);
        }
        return;
      }
      await handleSendText(trimmed);
    },
    [pendingImages, handleSendText, handleSendImage],
  );

  const handlePickImageFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photo library",
        "Pem needs access to your photos to attach an image.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Settings", onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const remainingSlots = MAX_CHAT_MESSAGE_IMAGES - pendingImages.length;
    if (remainingSlots <= 0) {
      Alert.alert(
        "Photo limit",
        `You can attach up to ${MAX_CHAT_MESSAGE_IMAGES} photos per message.`,
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
      allowsMultipleSelection: remainingSlots > 1,
      selectionLimit: remainingSlots,
    });
    if (result.canceled) return;

    const additions = await pendingImagesFromPickerAssets(
      result.assets,
      pendingImages,
      remainingSlots,
    );
    if (!additions.length) return;

    setPendingImages((prev) =>
      [...prev, ...additions].slice(0, MAX_CHAT_MESSAGE_IMAGES),
    );
  }, [pendingImages]);

  const handleTakePhoto = useCallback(async () => {
    const remainingSlots = MAX_CHAT_MESSAGE_IMAGES - pendingImages.length;
    if (remainingSlots <= 0) {
      Alert.alert(
        "Photo limit",
        `You can attach up to ${MAX_CHAT_MESSAGE_IMAGES} photos per message.`,
      );
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Camera",
        "Pem needs camera access to snap a photo for chat.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Settings", onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });
    } catch {
      Alert.alert(
        "Camera unavailable",
        "The camera is not available here (for example on a simulator). Use Photos or try on a physical device.",
      );
      return;
    }
    if (result.canceled) return;

    const additions = await pendingImagesFromPickerAssets(
      result.assets,
      pendingImages,
      remainingSlots,
    );
    if (!additions.length) return;

    setPendingImages((prev) =>
      [...prev, ...additions].slice(0, MAX_CHAT_MESSAGE_IMAGES),
    );
  }, [pendingImages]);

  const handleAttachImagePress = useCallback(() => {
    if (Platform.OS === "web") {
      void handlePickImageFromLibrary();
      return;
    }
    setImageSourceSheetVisible(true);
  }, [handlePickImageFromLibrary]);

  const handleSheetChooseCamera = useCallback(() => {
    setImageSourceSheetVisible(false);
    void handleTakePhoto();
  }, [handleTakePhoto]);

  const handleSheetChoosePhotos = useCallback(() => {
    setImageSourceSheetVisible(false);
    void handlePickImageFromLibrary();
  }, [handlePickImageFromLibrary]);

  const handleSendVoice = useCallback(
    async (audioUri: string) => {
      pemImpactLight();
      const snapshot = [...pendingImages];
      const imageUris = snapshot.map((p) => p.uri);
      if (snapshot.length > 0) {
        setPendingImages([]);
      }

      const tempId = `temp-voice-${Date.now()}`;
      const optimistic: ClientMessage = {
        id: tempId,
        role: "user",
        kind: "voice",
        content: null,
        voice_url: audioUri,
        transcript: null,
        triage_category: null,
        processing_status: null,
        polished_text: null,
        parent_message_id: null,
        summary: null,
        created_at: new Date().toISOString(),
        _clientStatus: "sending",
        _localUri: audioUri,
        _pendingImageUris:
          imageUris.length > 0 ? imageUris : undefined,
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const imageKeys =
          imageUris.length > 0
            ? await uploadPendingChatImageKeys(
                getTokenRef.current,
                imageUris,
              )
            : undefined;
        const res = await sendVoiceMessage(
          getTokenRef.current,
          audioUri,
          "audio/m4a",
          imageKeys?.length ? { image_keys: imageKeys } : undefined,
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...res.message,
                  voice_url: audioUri,
                  _localUri: audioUri,
                  _clientStatus: "sent" as const,
                  _pendingImageUris: undefined,
                }
              : m,
          ),
        );
        setStatusMap((prev) => ({ ...prev, [res.message.id]: "Thinking..." }));
      } catch (e) {
        console.warn("Failed to send voice:", e);
        if (snapshot.length > 0) {
          setPendingImages(snapshot);
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, _clientStatus: "failed" as const }
              : m,
          ),
        );
      }
    },
    [pendingImages],
  );

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    loadMessages(messages[0].created_at).finally(() => setLoadingMore(false));
  }, [hasMore, loading, loadingMore, messages, loadMessages]);

  const handleOpenDrawer = useCallback(() => {
    pemImpactLight();
    drawerRef.current?.open();
  }, []);

  const triggerCopyFeedback = useCallback(() => {
    copyChipOpacity.stopAnimation(() => {});
    copyChipOpacity.setValue(1);
    Animated.sequence([
      Animated.delay(1800),
      Animated.timing(copyChipOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [copyChipOpacity]);

  const displayItems = useMemo(
    () => buildChatDisplayItems(messages, statusMap),
    [messages, statusMap],
  );

  const renderItem = ({ item }: { item: ChatDisplayItem }) => {
    if (item.type === "date") return <ChatDateHeader date={item.date} />;
    if (item.type === "typing") return <ChatStatusBubble />;
    return (
      <ChatBubble
        message={item.message}
        isHighlighted={item.message.id === search.highlightId}
        onRetry={handleRetry}
        onViewTasks={handleOpenDrawer}
        onCopyFeedback={triggerCopyFeedback}
      />
    );
  };

  const keyExtractor = (item: ChatDisplayItem, index: number) => {
    if (item.type === "message") return item.message.id;
    if (item.type === "date") return `date-${item.date}`;
    return "typing-indicator";
  };

  const scrollToMessage = useCallback(
    (messageId: string) => {
      const idx = displayItems.findIndex(
        (item) => item.type === "message" && item.message.id === messageId,
      );
      if (idx >= 0 && flatListRef.current) {
        flatListRef.current.scrollToIndex({
          index: idx,
          animated: true,
          viewPosition: 0.5,
        });
      }
    },
    [displayItems],
  );

  useEffect(() => {
    if (search.highlightId) scrollToMessage(search.highlightId);
  }, [search.highlightId, scrollToMessage]);

  const handleCountsChanged = useCallback((removedId: string) => {
    setBriefData((prev) => {
      if (!prev) return prev;
      const strip = (arr: typeof prev.overdue) => arr.filter((x) => x.id !== removedId);
      return {
        ...prev,
        overdue: strip(prev.overdue),
        today: strip(prev.today),
        tomorrow: strip(prev.tomorrow),
        this_week: strip(prev.this_week),
        next_week: strip(prev.next_week),
        later: strip(prev.later),
      };
    });
    fetchCounts();
  }, [fetchCounts]);

  const handleRetry = useCallback(
    (msg: ClientMessage) => {
      if (msg.kind === "voice" && msg._localUri) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, _clientStatus: "sending" as const } : m,
          ),
        );
        const retryVoice = async () => {
          try {
            const uris = msg._pendingImageUris ?? [];
            const imageKeys =
              uris.length > 0
                ? await uploadPendingChatImageKeys(
                    getTokenRef.current,
                    uris,
                  )
                : undefined;
            const res = await sendVoiceMessage(
              getTokenRef.current,
              msg._localUri!,
              "audio/m4a",
              imageKeys?.length ? { image_keys: imageKeys } : undefined,
            );
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.id
                  ? {
                      ...res.message,
                      voice_url: msg._localUri!,
                      _localUri: msg._localUri,
                      _clientStatus: "sent" as const,
                      _pendingImageUris: undefined,
                    }
                  : m,
              ),
            );
          } catch {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.id
                  ? { ...m, _clientStatus: "failed" as const }
                  : m,
              ),
            );
          }
        };
        void retryVoice();
      } else if (msg.kind === "image" && (msg._localUri || msg._pendingLocalUris?.length)) {
        let uris: string[] = [];
        if (msg._pendingLocalUris?.length) {
          uris = msg._pendingLocalUris;
        } else if (msg._localUri) {
          uris = [msg._localUri];
        }
        if (!uris.length) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, _clientStatus: "sending" as const } : m,
          ),
        );
        handleSendImage(uris, {
          replaceMessageId: msg.id,
          caption: msg.content?.trim() || undefined,
        }).catch(() => {});
      } else if (msg.content) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, _clientStatus: "sending" as const } : m,
          ),
        );
        sendChatMessage(getTokenRef.current, {
          kind: "text",
          content: msg.content ?? "",
        })
          .then((res) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.id
                  ? { ...res.message, _clientStatus: "sent" as const }
                  : m,
              ),
            );
          })
          .catch(() => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.id
                  ? { ...m, _clientStatus: "failed" as const }
                  : m,
              ),
            );
          });
      }
    },
    [handleSendImage],
  );

  const handleRemovePendingImageAt = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearPendingImages = useCallback(() => {
    setPendingImages([]);
  }, []);

  return (
    <>
      <View style={[styles.root, { backgroundColor: colors.pageBackground }]}>
        <ChatScreenHeader
          briefData={briefData}
          headerSummary={headerSummary}
          copyChipOpacity={copyChipOpacity}
          topInset={insets.top}
          onOpenDrawer={handleOpenDrawer}
          onSearchPress={search.handleOpen}
          onSettingsPress={() => router.push("/settings")}
        />

        {search.isOpen && (
          <ChatSearchBar
            query={search.query}
            resultCount={search.results.length}
            isSearching={search.isSearching}
            activeIndex={search.activeIndex}
            onQueryChange={search.handleQueryChange}
            onClose={search.handleClose}
            onPrev={search.handlePrev}
            onNext={search.handleNext}
          />
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ChatScreenSkeletonBubbles />
          </View>
        ) : messages.length === 0 ? (
          <ChatScreenEmptyState onExamplePromptPress={handleSendText} />
        ) : (
          <FlatList
            ref={flatListRef}
            data={displayItems}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            inverted
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.5,
                });
              }, 200);
            }}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.paginationSpinner}>
                  <ActivityIndicator size="small" color={pemAmber} />
                </View>
              ) : null
            }
          />
        )}

        <View
          style={{
            backgroundColor: colors.pageBackground,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderMuted,
            paddingBottom: Math.max(insets.bottom, space[2]),
          }}
        >
          <ChatInput
            onSendText={handleComposerSend}
            onSendVoice={handleSendVoice}
            onPickImage={handleAttachImagePress}
            pendingImageUris={pendingImageUris}
            onRemovePendingImageAt={handleRemovePendingImageAt}
            onClearPendingImages={handleClearPendingImages}
          />
        </View>
        <Animated.View style={{ height: kbHeight }} />

        <ChatImageSourceSheet
          visible={isImageSourceSheetVisible}
          onRequestClose={() => setImageSourceSheetVisible(false)}
          onChooseCamera={handleSheetChooseCamera}
          onChoosePhotos={handleSheetChoosePhotos}
        />
      </View>

      <TaskDrawer ref={drawerRef} onCountsChanged={handleCountsChanged} />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: "relative",
  },
  loadingContainer: {
    flex: 1,
  },
  listContent: {
    paddingVertical: space[2],
  },
  paginationSpinner: {
    paddingVertical: space[4],
    alignItems: "center",
  },
});
