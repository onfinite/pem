import AppHomeHeader from "@/components/layout/AppHomeHeader";
import PemLogoRow from "@/components/brand/PemLogoRow";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { router } from "expo-router";
import { ArrowUp, Mic } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function HomeScreen() {
  const { colors, resolved } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();
  const canSend = trimmed.length > 0;

  const onSettingsPress = useCallback(() => {
    router.push("/settings");
  }, []);

  const onSend = useCallback(() => {
    if (!canSend) return;
    Alert.alert("Pem", "Your dump will be sent to Pem when the API is wired up.");
    setDraft("");
  }, [canSend]);

  const onMic = useCallback(() => {
    Alert.alert("Voice", "Voice capture will start the record flow.");
  }, []);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.pageBackground }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.pageBackground }]}>
          <View style={styles.headerPad}>
            <AppHomeHeader variant="minimal" onSettingsPress={onSettingsPress} />
          </View>

          <View style={styles.hero}>
            <PemLogoRow size="hero" />
            <PemText variant="brandItalic" style={styles.tagline}>
              Tell Pem what{"'"}s on your mind
            </PemText>
            <PemText variant="bodyMuted" style={styles.hint}>
              Voice or text — Pem turns it into preps you can act on.
            </PemText>
          </View>

          <View
            style={[
              styles.composerWrap,
              { paddingBottom: Math.max(insets.bottom, space[4]) },
            ]}
          >
            <View
              style={[
                styles.composer,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.borderMuted,
                  ...Platform.select({
                    ios: {
                      shadowColor: resolved === "dark" ? "#000000" : "#1c1a16",
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: resolved === "dark" ? 0.35 : 0.06,
                      shadowRadius: 20,
                    },
                    android: {
                      elevation: 4,
                    },
                  }),
                },
              ]}
            >
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Dump a thought, task, or worry…"
                placeholderTextColor={colors.placeholder}
                style={[
                  styles.input,
                  { color: colors.textPrimary },
                ]}
                multiline
                maxLength={8000}
                textAlignVertical="top"
                accessibilityLabel="Message to Pem"
                returnKeyType="default"
              />
              <View style={styles.composerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Record voice"
                  onPress={onMic}
                  style={({ pressed }) => [
                    styles.iconCircle,
                    { backgroundColor: colors.brandMutedSurface },
                    pressed && styles.pressed,
                  ]}
                >
                  <Mic size={22} stroke={pemAmber} strokeWidth={2.25} />
                </Pressable>
                {canSend ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Send"
                    onPress={onSend}
                    style={({ pressed }) => [
                      styles.iconCircle,
                      { backgroundColor: colors.pemAmber },
                      pressed && styles.pressed,
                    ]}
                  >
                    <ArrowUp size={22} stroke={colors.onPrimary} strokeWidth={2.25} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  headerPad: {
    paddingHorizontal: space[4],
  },
  hero: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space[8],
    gap: space[4],
  },
  tagline: {
    textAlign: "center",
    fontSize: fontSize.xxl,
    lineHeight: lh(fontSize.xxl, lineHeight.snug),
    marginTop: space[2],
  },
  hint: {
    textAlign: "center",
    maxWidth: 300,
  },
  composerWrap: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space[3],
    paddingLeft: space[5],
    paddingRight: space[3],
    paddingVertical: space[3],
    borderRadius: radii.xl,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingVertical: space[2],
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
  },
  composerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingBottom: 2,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.85,
  },
});
