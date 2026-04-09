import ChatBubble from "@/components/chat/ChatBubble";
import ChatDateHeader from "@/components/chat/ChatDateHeader";
import ChatInput from "@/components/chat/ChatInput";
import ChatStatusBubble from "@/components/chat/ChatStatusBubble";
import TaskDrawer, { type TaskDrawerHandle } from "@/components/chat/TaskDrawer";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { pemAmber } from "@/constants/theme";
import { useTheme } from "@/contexts/ThemeContext";
import { useChatStream } from "@/hooks/useChatStream";
import { pemImpactLight } from "@/lib/pemHaptics";
import {
  getChatMessages,
  getTaskCounts,
  sendChatMessage,
  sendVoiceMessage,
  type ApiMessage,
  type TaskCounts,
} from "@/lib/pemApi";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import { CalendarDays, Settings } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CACHE_KEY = "@pem/chat_messages_v1";
const CACHE_LIMIT = 50;

async function readCache(): Promise<ClientMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ClientMessage[];
  } catch {
    return [];
  }
}

async function writeCache(messages: ClientMessage[]) {
  try {
    // Only cache confirmed, non-optimistic messages
    const cacheable = messages
      .filter((m) => m._clientStatus === "sent" && !m._localUri)
      .slice(-CACHE_LIMIT);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheable));
  } catch {
    // Non-critical — ignore cache write errors
  }
}

export type ClientMessage = ApiMessage & {
  _clientStatus?: "sending" | "sent" | "failed";
  _localUri?: string;
};

type DisplayItem =
  | { type: "message"; message: ClientMessage }
  | { type: "date"; date: string }
  | { type: "typing" };

export default function ChatScreen() {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [taskCounts, setTaskCounts] = useState<TaskCounts | null>(null);
  const drawerRef = useRef<TaskDrawerHandle>(null);

  const fetchCounts = useCallback(async () => {
    try {
      const c = await getTaskCounts(getTokenRef.current);
      setTaskCounts(c);
    } catch { /* non-critical */ }
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
          setMessages(withStatus);
          writeCache(withStatus);
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
    readCache().then((cached) => {
      if (!mounted) return;
      if (cached.length > 0) {
        setMessages(cached);
        setLoading(false);
      }
      loadMessages();
    });
    fetchCounts();
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

  const handleSend = useCallback(
    async (text: string) => {
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
      } catch (e) {
        console.warn("Failed to send message:", e);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, _clientStatus: "failed" as const } : m,
          ),
        );
      }
    },
    [],
  );

  const handleSendVoice = useCallback(
    (audioUri: string) => {
      pemImpactLight();
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
        created_at: new Date().toISOString(),
        _clientStatus: "sending",
        _localUri: audioUri,
      };
      setMessages((prev) => [...prev, optimistic]);

      sendVoiceMessage(getTokenRef.current, audioUri)
        .then((res) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? {
                    ...res.message,
                    voice_url: audioUri,
                    _localUri: audioUri,
                    _clientStatus: "sent" as const,
                  }
                : m,
            ),
          );
        })
        .catch((e) => {
          console.warn("Failed to send voice:", e);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? { ...m, _clientStatus: "failed" as const }
                : m,
            ),
          );
        });
    },
    [],
  );

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    loadMessages(messages[0].created_at).finally(() => setLoadingMore(false));
  }, [hasMore, loading, loadingMore, messages, loadMessages]);

  const displayItems: DisplayItem[] = [];
  const seenIds = new Set<string>();
  const deduped: ClientMessage[] = [];
  for (const msg of messages) {
    if (seenIds.has(msg.id)) continue;
    seenIds.add(msg.id);
    deduped.push(msg);
  }

  const pemIsTyping = Object.keys(statusMap).length > 0;
  if (pemIsTyping) {
    displayItems.push({ type: "typing" });
  }

  for (let i = deduped.length - 1; i >= 0; i--) {
    const msg = deduped[i];
    displayItems.push({ type: "message", message: msg });

    const msgDate = new Date(msg.created_at).toDateString();
    const prevMsg = deduped[i - 1];
    const prevDate = prevMsg
      ? new Date(prevMsg.created_at).toDateString()
      : null;
    if (msgDate !== prevDate) {
      displayItems.push({ type: "date", date: msg.created_at });
    }
  }

  const renderItem = ({ item }: { item: DisplayItem }) => {
    if (item.type === "date") return <ChatDateHeader date={item.date} />;
    if (item.type === "typing") return <ChatStatusBubble />;
    return (
      <ChatBubble
        message={item.message}
        onRetry={handleRetry}
        onViewTasks={handleOpenDrawer}
      />
    );
  };

  const keyExtractor = (item: DisplayItem, index: number) => {
    if (item.type === "message") return item.message.id;
    if (item.type === "date") return `date-${item.date}`;
    return "typing-indicator";
  };

  const handleOpenDrawer = useCallback(() => {
    pemImpactLight();
    drawerRef.current?.open();
  }, []);

  const handleCountsChanged = useCallback(() => {
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
        sendVoiceMessage(getTokenRef.current, msg._localUri)
          .then((res) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.id
                  ? {
                      ...res.message,
                      voice_url: msg._localUri!,
                      _localUri: msg._localUri,
                      _clientStatus: "sent" as const,
                    }
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
      } else if (msg.content) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, _clientStatus: "sending" as const } : m,
          ),
        );
        sendChatMessage(getTokenRef.current, {
          kind: "text",
          content: msg.content,
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
    [],
  );

  return (
    <>
      <View style={[styles.root, { backgroundColor: colors.pageBackground }]}>
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + space[1],
              backgroundColor: colors.pageBackground,
              borderBottomColor: colors.borderMuted,
            },
          ]}
        >
          <Pressable
            onPress={handleOpenDrawer}
            style={styles.headerLeft}
            hitSlop={12}
          >
            <CalendarDays size={22} color={colors.textSecondary} />
            {taskCounts && taskCounts.total_open > 0 && (
              <View style={[styles.headerDot, {
                backgroundColor: taskCounts.overdue > 0 ? colors.error : pemAmber,
              }]} />
            )}
          </Pressable>
          <Pressable onPress={handleOpenDrawer} style={styles.headerCenter} hitSlop={8}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Pem
            </Text>
            {taskCounts && taskCounts.total_open > 0 && (
              <Text style={[styles.headerBadge, {
                color: taskCounts.overdue > 0 ? colors.error : colors.textTertiary,
              }]}>
                {taskCounts.overdue > 0
                  ? `${taskCounts.overdue} overdue`
                  : taskCounts.today > 0
                    ? `${taskCounts.today} today`
                    : `${taskCounts.total_open} open`}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => router.push("/settings")}
            style={styles.headerRight}
            hitSlop={12}
          >
            <Settings size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <SkeletonBubbles />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {"Hey! I'm Pem."}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {
                "Dump your thoughts, ask questions, or tell me what's on your mind. I'll handle the rest."
              }
            </Text>
          </View>
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
          <ChatInput onSendText={handleSend} onSendVoice={handleSendVoice} />
        </View>
      </View>

      <TaskDrawer ref={drawerRef} onCountsChanged={handleCountsChanged} />
    </>
  );
}

function SkeletonBubbles() {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  const bg = colors.cardBackground;
  return (
    <View style={skeletonStyles.wrap}>
      {[0.6, 0.45, 0.7, 0.5].map((w, i) => (
        <Animated.View
          key={i}
          style={[
            skeletonStyles.bubble,
            {
              backgroundColor: bg,
              width: `${w * 100}%` as any,
              alignSelf: i % 2 === 0 ? "flex-start" : "flex-end",
              opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: space[3],
    paddingBottom: space[4],
    gap: space[2],
  },
  bubble: {
    height: 44,
    borderRadius: 16,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: space[2],
    paddingHorizontal: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    position: "absolute",
    left: space[4],
    bottom: space[2],
  },
  headerDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
  },
  headerBadge: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  headerRight: {
    position: "absolute",
    right: space[4],
    bottom: space[2],
  },
  loadingContainer: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space[8],
  },
  emptyTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    marginBottom: space[2],
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    textAlign: "center",
    lineHeight: 22,
  },
  listContent: {
    paddingVertical: space[2],
  },
  paginationSpinner: {
    paddingVertical: space[4],
    alignItems: "center",
  },
});
