import ChatBubble from "@/components/chat/ChatBubble";
import ChatDateHeader from "@/components/chat/ChatDateHeader";
import ChatInput from "@/components/chat/ChatInput";
import ChatStatusBubble from "@/components/chat/ChatStatusBubble";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { useChatStream } from "@/hooks/useChatStream";
import {
  getChatMessages,
  sendChatMessage,
  sendVoiceMessage,
  type ApiMessage,
} from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { Settings } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ClientMessage = ApiMessage & {
  _clientStatus?: "sending" | "sent";
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

  const loadMessages = useCallback(
    async (before?: string) => {
      try {
        const res = await getChatMessages(getToken, { before, limit: 50 });
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
        }
        setHasMore(res.has_more);
      } catch (e) {
        console.warn("Failed to load messages:", e);
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

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
  });

  const handleSend = useCallback(
    async (text: string) => {
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
        const res = await sendChatMessage(getToken, {
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
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    },
    [getToken],
  );

  const handleSendVoice = useCallback(
    async (audioUri: string) => {
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
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const res = await sendVoiceMessage(getToken, audioUri);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...res.message, _clientStatus: "sent" as const }
              : m,
          ),
        );
      } catch (e) {
        console.warn("Failed to send voice:", e);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    },
    [getToken],
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
    return <ChatBubble message={item.message} />;
  };

  const keyExtractor = (item: DisplayItem, index: number) => {
    if (item.type === "message") return item.message.id;
    if (item.type === "date") return `date-${item.date}`;
    return "typing-indicator";
  };

  return (
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
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Pem
          </Text>
        </View>
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
          <PemLoadingIndicator placement="pageCenter" />
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
  );
}

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
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
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
});
