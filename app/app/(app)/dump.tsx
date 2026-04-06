import DumpBottomBar from "@/components/sections/dump-sections/DumpBottomBar";
import DumpCloseBar from "@/components/sections/dump-sections/DumpCloseBar";
import DumpMainStage from "@/components/sections/dump-sections/DumpMainStage";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import { amber, surfacePage } from "@/constants/theme";
import { space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { createDump } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Text-only dump: large field + send. */
export default function DumpScreen() {
  const insets = useSafeAreaInsets();
  const { colors, resolved } = useTheme();
  const { getToken } = useAuth();
  const { prefill: prefillParam } = useLocalSearchParams<{ prefill?: string | string[] }>();
  const prefill =
    typeof prefillParam === "string"
      ? prefillParam
      : Array.isArray(prefillParam) && prefillParam[0]
        ? prefillParam[0]
        : "";
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const draftInputRef = useRef<TextInput>(null);
  const trimmed = draft.trim();
  const canSend = trimmed.length > 0;

  const gradientColors = useMemo(
    (): readonly [string, string, string] =>
      resolved === "dark"
        ? [colors.brandMutedSurface, colors.cardBackground, colors.pageBackground]
        : [surfacePage, amber[50], amber[100]],
    [colors, resolved],
  );

  const dismissKeyboardSoft = useCallback(() => {
    if (Platform.OS === "android") {
      LayoutAnimation.configureNext({
        duration: 240,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
    }
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => draftInputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const p = prefill.trim();
    if (p) setDraft(p);
  }, [prefill]);

  useEffect(() => {
    return () => Keyboard.dismiss();
  }, []);

  const submitDump = useCallback(async () => {
    const payload = trimmed;
    if (!payload || submitting) return;
    setSubmitting(true);
    try {
      const res = await createDump(getToken, payload);
      router.replace({ pathname: "/inbox", params: { dumpId: res.dumpId } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      Alert.alert("Couldn’t send dump", msg);
    } finally {
      setSubmitting(false);
    }
  }, [trimmed, submitting, getToken]);

  const sendActive = !submitting && canSend;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.pageBackground }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <LinearGradient
        colors={gradientColors}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <TouchableWithoutFeedback accessible={false} onPress={dismissKeyboardSoft}>
          <View style={styles.sheetInner}>
            <View style={{ paddingTop: insets.top }}>
              <DumpCloseBar />
            </View>

            {submitting ? (
              <View style={styles.submittingOverlay} accessibilityLabel="Sending dump">
                <PemLoadingIndicator placement="overlayLarge" />
              </View>
            ) : null}

            <DumpMainStage value={draft} onChangeText={setDraft} inputRef={draftInputRef} />

            <View style={{ paddingBottom: Math.max(insets.bottom, space[4]) }}>
              <DumpBottomBar
                canSend={canSend}
                sendActive={sendActive}
                onSend={() => void submitDump()}
                submitting={submitting}
              />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  sheetInner: {
    flex: 1,
  },
  submittingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
});
