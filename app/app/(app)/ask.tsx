import AppMenuButton from "@/components/navigation/AppMenuButton";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemText from "@/components/ui/PemText";
import { inboxChrome } from "@/constants/inboxChrome";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, lh, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { askPem } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { Send } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type QA = { question: string; answer: string; sources: { id: string; text: string }[] };

export default function AskPemScreen() {
  const { resolved } = useTheme();
  const chrome = inboxChrome(resolved);
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QA[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const submit = useCallback(async () => {
    const q = question.trim();
    if (!q || loading) return;
    Keyboard.dismiss();
    setLoading(true);
    setQuestion("");
    try {
      const res = await askPem(() => getTokenRef.current(), q);
      setHistory((prev) => [...prev, { question: q, answer: res.answer, sources: res.sources }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setHistory((prev) => [
        ...prev,
        { question: q, answer: "Couldn't reach Pem right now. Try again.", sources: [] },
      ]);
    } finally {
      setLoading(false);
    }
  }, [question, loading]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: chrome.page }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: chrome.border }]}>
        <AppMenuButton tintColor={chrome.text} />
        <PemText
          style={{
            flex: 1,
            marginLeft: space[2],
            fontFamily: fontFamily.display.italic,
            fontStyle: "italic",
            fontSize: fontSize.lg,
            fontWeight: "200",
            color: pemAmber,
          }}
        >
          ask pem
        </PemText>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: space[4] }]}
        keyboardShouldPersistTaps="handled"
      >
        {history.length === 0 && !loading ? (
          <View style={styles.emptyWrap}>
            <PemText
              style={{
                fontFamily: fontFamily.display.italic,
                fontStyle: "italic",
                fontSize: fontSize.md,
                fontWeight: "200",
                color: chrome.textMuted,
                textAlign: "center",
                lineHeight: lh(fontSize.md, 1.6),
                maxWidth: 260,
              }}
            >
              Ask me anything about your thoughts.
            </PemText>
            <PemText
              style={{
                fontFamily: fontFamily.sans.regular,
                fontSize: fontSize.sm,
                fontWeight: "300",
                color: chrome.textDim,
                textAlign: "center",
                lineHeight: lh(fontSize.sm, 1.7),
                maxWidth: 220,
                marginTop: space[3],
              }}
            >
              {'"What do I have this week?" or "Did I mention the dentist?"'}
            </PemText>
          </View>
        ) : null}

        {history.map((qa, i) => (
          <View key={`qa-${i}`} style={styles.qaBlock}>
            <View style={[styles.bubble, styles.userBubble, { backgroundColor: chrome.surfaceMuted, borderColor: chrome.border }]}>
              <PemText
                style={{
                  fontFamily: fontFamily.sans.regular,
                  fontSize: fontSize.sm,
                  fontWeight: "400",
                  color: chrome.text,
                  lineHeight: lh(fontSize.sm, 1.6),
                }}
              >
                {qa.question}
              </PemText>
            </View>
            <View style={[styles.bubble, styles.pemBubble]}>
              <PemText
                style={{
                  fontFamily: fontFamily.sans.regular,
                  fontSize: fontSize.sm,
                  fontWeight: "300",
                  color: chrome.textMuted,
                  lineHeight: lh(fontSize.sm, 1.7),
                }}
              >
                {qa.answer}
              </PemText>
            </View>
          </View>
        ))}

        {loading ? (
          <View style={{ paddingVertical: space[4], alignItems: "center" }}>
            <PemLoadingIndicator placement="inline" />
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.inputBar,
          {
            borderTopColor: chrome.border,
            backgroundColor: chrome.page,
            paddingBottom: insets.bottom + space[2],
          },
        ]}
      >
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask Pem..."
          placeholderTextColor={chrome.textDim}
          style={[
            styles.input,
            {
              backgroundColor: chrome.surfaceMuted,
              borderColor: chrome.border,
              color: chrome.text,
              fontFamily: fontFamily.sans.regular,
            },
          ]}
          multiline
          maxLength={2000}
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={() => void submit()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          onPress={() => void submit()}
          disabled={loading || !question.trim()}
          style={[styles.sendBtn, { backgroundColor: pemAmber, opacity: loading || !question.trim() ? 0.4 : 1 }]}
        >
          <Send size={18} color="#fff" strokeWidth={2} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[4],
    paddingBottom: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: space[4], paddingTop: space[4] },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space[10],
  },
  qaBlock: { marginBottom: space[4] },
  bubble: {
    borderRadius: 14,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    maxWidth: "90%",
    marginBottom: space[2],
  },
  userBubble: {
    alignSelf: "flex-end",
    borderWidth: 1,
  },
  pemBubble: {
    alignSelf: "flex-start",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: space[3],
    paddingTop: space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space[2],
  },
  input: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    fontSize: 14,
    maxHeight: 120,
    minHeight: 40,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
});
