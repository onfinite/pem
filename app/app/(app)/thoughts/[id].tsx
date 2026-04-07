import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemText from "@/components/ui/PemText";
import { inboxChrome } from "@/constants/inboxChrome";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, lh, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { getDumpDetail } from "@/lib/pemApi";
import { firstParam } from "@/lib/routeParams";
import { useAuth } from "@clerk/expo";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ThoughtDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = firstParam(params.id);
  const { resolved } = useTheme();
  const chrome = inboxChrome(resolved);
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [dumpStatus, setDumpStatus] = useState<
    "processing" | "processed" | "failed" | null
  >(null);
  const [dumpLastError, setDumpLastError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await getDumpDetail(() => getTokenRef.current(), id);
      setText(res.dump.text);
      setDumpStatus(res.dump.status);
      setDumpLastError(res.dump.last_error ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t load");
      setDumpStatus(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setErr("Missing thought");
      return;
    }
    void load();
  }, [load, id]);

  return (
    <View style={[styles.root, { backgroundColor: chrome.page, paddingTop: insets.top }]}>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <View style={[styles.header, { borderBottomColor: chrome.border }]}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft size={24} color={pemAmber} strokeWidth={2} />
        </Pressable>
        <PemText
          style={{
            marginLeft: space[2],
            flex: 1,
            fontFamily: fontFamily.sans.medium,
            fontSize: fontSize.base,
            fontWeight: "500",
            color: chrome.text,
          }}
        >
          Thought
        </PemText>
      </View>
      {loading ? (
        <PemLoadingIndicator placement="pageCenter" />
      ) : err ? (
        <View style={{ padding: space[5] }}>
          <PemText
            style={{
              fontFamily: fontFamily.sans.regular,
              fontSize: fontSize.sm,
              color: chrome.textMuted,
            }}
          >
            {err}
          </PemText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space[5], paddingBottom: space[10] }}
          keyboardShouldPersistTaps="handled"
        >
          {dumpStatus === "failed" ? (
            <View style={{ marginBottom: space[6] }}>
              <PemText
                style={{
                  fontSize: 10,
                  fontWeight: "500",
                  color: pemAmber,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  marginBottom: space[2],
                }}
              >
                Couldn’t finish organizing
              </PemText>
              <View
                style={[
                  styles.dumpCard,
                  {
                    backgroundColor: chrome.urgentBg,
                    borderColor: chrome.urgentBorder,
                  },
                ]}
              >
                <PemText
                  style={{
                    fontFamily: fontFamily.sans.regular,
                    fontSize: fontSize.sm,
                    fontWeight: "400",
                    color: chrome.textMuted,
                    lineHeight: lh(fontSize.sm, 1.55),
                  }}
                >
                  {dumpLastError?.trim()
                    ? dumpLastError
                    : "Something went wrong on the server. Try dumping again, or check logs if you’re developing."}
                </PemText>
              </View>
            </View>
          ) : null}

          <PemText
            style={{
              fontSize: 10,
              fontWeight: "500",
              color: chrome.textDim,
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: space[2],
            }}
          >
            Your dump
          </PemText>
          <View
            style={[
              styles.dumpCard,
              {
                backgroundColor: chrome.page,
                borderColor: chrome.border,
              },
            ]}
          >
            <PemText
              style={{
                fontFamily: fontFamily.sans.regular,
                fontSize: fontSize.sm,
                fontWeight: "300",
                fontStyle: "italic",
                color: chrome.textMuted,
                lineHeight: lh(fontSize.sm, 1.65),
              }}
            >
              {text}
            </PemText>
          </View>

        </ScrollView>
      )}
    </View>
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
  dumpCard: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: space[3],
    paddingHorizontal: space[3],
  },
});
