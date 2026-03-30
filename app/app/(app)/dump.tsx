import DumpBottomBar from "@/components/sections/dump-sections/DumpBottomBar";
import DumpCloseBar from "@/components/sections/dump-sections/DumpCloseBar";
import DumpMainStage from "@/components/sections/dump-sections/DumpMainStage";
import { amber, surfacePage } from "@/constants/theme";
import { space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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

type BottomMode = "voice" | "type";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Voice / text capture — full-bleed gradient; Done or Send → preping flow. */
export default function DumpScreen() {
  const insets = useSafeAreaInsets();
  const { colors, resolved } = useTheme();
  const [bottomMode, setBottomMode] = useState<BottomMode>("voice");
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();
  const canSend = trimmed.length > 0;
  const draftInputRef = useRef<TextInput>(null);

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
    if (bottomMode !== "type") {
      draftInputRef.current?.blur();
      return;
    }
    const t = setTimeout(() => draftInputRef.current?.focus(), 48);
    return () => clearTimeout(t);
  }, [bottomMode]);

  useEffect(() => {
    return () => Keyboard.dismiss();
  }, []);

  const waveInactive = colors.border;

  const goNext = useCallback(() => {
    router.replace("/preping");
  }, []);

  const onPrimarySend = useCallback(() => {
    if (bottomMode === "voice") {
      goNext();
      return;
    }
    if (canSend) goNext();
  }, [bottomMode, canSend, goNext]);

  const sendActive = bottomMode === "voice" ? true : canSend;

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

            <DumpMainStage
              bottomMode={bottomMode}
              pemAmber={colors.pemAmber}
              waveInactive={waveInactive}
            />

            <View style={{ paddingBottom: Math.max(insets.bottom, space[4]) }}>
              <DumpBottomBar
                bottomMode={bottomMode}
                onToggleMode={() => setBottomMode(bottomMode === "voice" ? "type" : "voice")}
                draft={draft}
                onDraftChange={setDraft}
                draftInputRef={draftInputRef}
                canSend={canSend}
                sendActive={sendActive}
                onPrimarySend={onPrimarySend}
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
});
