import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { ArrowUp, Keyboard as KeyboardIcon, Mic, Pause } from "lucide-react-native";
import type { RefObject } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";

import type { VoiceSpeechStatus } from "@/hooks/useVoiceSpeechRecognition";

type BottomMode = "voice" | "type";

type Props = {
  bottomMode: BottomMode;
  onToggleMode: () => void;
  draft: string;
  onDraftChange: (t: string) => void;
  draftInputRef: RefObject<TextInput | null>;
  canSend: boolean;
  sendActive: boolean;
  onPrimarySend: () => void;
  submitting?: boolean;
  /** Voice: center mic starts / pauses listening */
  voiceStatus?: VoiceSpeechStatus;
  onVoiceCenterPress?: () => void;
};

export default function DumpBottomBar({
  bottomMode,
  onToggleMode,
  draft,
  onDraftChange,
  draftInputRef,
  canSend,
  sendActive,
  onPrimarySend,
  submitting = false,
  voiceStatus = "idle",
  onVoiceCenterPress,
}: Props) {
  const { colors, resolved } = useTheme();
  const ctrlSurface = resolved === "dark" ? colors.secondarySurface : colors.cardBackground;
  const voiceListening = voiceStatus === "listening";

  return (
    <View style={styles.bottom}>
      <View style={styles.controlRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={bottomMode === "voice" ? "Type instead" : "Back to voice"}
          onPress={onToggleMode}
          style={({ pressed }) => [
            styles.ctrlCircle,
            {
              backgroundColor: ctrlSurface,
              borderColor: colors.borderMuted,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          {bottomMode === "voice" ? (
            <KeyboardIcon size={22} color={colors.textPrimary} strokeWidth={2} />
          ) : (
            <Mic size={22} color={colors.pemAmber} strokeWidth={2.25} />
          )}
        </Pressable>

        <View
          style={[
            styles.middleSlot,
            {
              backgroundColor: colors.secondarySurface,
              borderColor: colors.border,
            },
          ]}
        >
          {bottomMode === "voice" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                voiceListening ? "Pause listening" : "Start or resume voice capture"
              }
              onPress={onVoiceCenterPress}
              disabled={submitting}
              style={({ pressed }) => [
                styles.voiceCenterTap,
                {
                  opacity: submitting ? 0.5 : pressed ? 0.88 : 1,
                },
              ]}
            >
              {voiceListening ? (
                <Pause size={28} color={colors.pemAmber} strokeWidth={2.25} />
              ) : (
                <Mic size={28} color={colors.pemAmber} strokeWidth={2.25} />
              )}
            </Pressable>
          ) : (
            <TextInput
              ref={draftInputRef}
              value={draft}
              onChangeText={onDraftChange}
              placeholder="Message Pem…"
              placeholderTextColor={colors.placeholder}
              style={[styles.middleInput, { color: colors.textPrimary }]}
              multiline
              maxLength={8000}
              scrollEnabled
              accessibilityLabel="Type your dump"
              blurOnSubmit={false}
            />
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send dump to Pem"
          onPress={onPrimarySend}
          disabled={submitting || !canSend}
          style={({ pressed }) => [
            styles.ctrlCircle,
            styles.sendCircle,
            {
              backgroundColor: sendActive ? colors.pemAmber : ctrlSurface,
              borderColor: sendActive ? colors.pemAmber : colors.borderMuted,
              opacity: submitting || !canSend ? 0.55 : pressed ? 0.92 : 1,
            },
          ]}
        >
          <ArrowUp
            size={22}
            color={sendActive ? colors.onPrimary : colors.textSecondary}
            strokeWidth={2.5}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bottom: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },
  ctrlCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  middleSlot: {
    flex: 1,
    minHeight: 52,
    maxHeight: 88,
    borderRadius: radii.full,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: space[1],
    paddingHorizontal: space[2],
  },
  voiceCenterTap: {
    width: "100%",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  middleInput: {
    flex: 1,
    width: "100%",
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.normal),
    paddingVertical: Platform.OS === "ios" ? space[2] : space[1],
    paddingHorizontal: space[2],
    maxHeight: 76,
    minHeight: 36,
  },
  sendCircle: {
    borderWidth: 1,
  },
});
