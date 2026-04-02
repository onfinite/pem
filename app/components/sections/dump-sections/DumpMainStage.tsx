import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import DumpVoiceWaveform from "./DumpVoiceWaveform";

const VOICE_TRY_LABEL = "Tap the mic below to speak";
const TYPE_TRY_LABEL = "Try typing";
const VOICE_EXAMPLE =
  "Your words appear here as you talk — pause anytime, then send when you’re ready.";
const TYPE_EXAMPLE = '"Gift for mom — gardening lover, budget $60."';

type BottomMode = "voice" | "type";

type Props = {
  bottomMode: BottomMode;
  pemAmber: string;
  waveInactive: string;
  /** Live + edited dump text (voice) */
  voiceTranscript: string;
  onVoiceTranscriptChange: (t: string) => void;
  voiceListening: boolean;
};

export default function DumpMainStage({
  bottomMode,
  pemAmber,
  waveInactive,
  voiceTranscript,
  onVoiceTranscriptChange,
  voiceListening,
}: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.main}>
      <PemText variant="label" style={styles.centerText}>
        {bottomMode === "voice" ? VOICE_TRY_LABEL : TYPE_TRY_LABEL}
      </PemText>
      <PemText
        style={[
          styles.centerText,
          styles.quoteSize,
          {
            fontFamily: fontFamily.display.italic,
            color: colors.textSecondary,
          },
        ]}
      >
        {bottomMode === "voice" ? VOICE_EXAMPLE : TYPE_EXAMPLE}
      </PemText>

      {bottomMode === "voice" ? (
        <>
          <ScrollView
            style={styles.voiceScroll}
            contentContainerStyle={styles.voiceScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            <TextInput
              value={voiceTranscript}
              onChangeText={onVoiceTranscriptChange}
              placeholder="Your dump will appear here…"
              placeholderTextColor={colors.placeholder}
              editable={!voiceListening}
              multiline
              maxLength={8000}
              style={[styles.voiceTranscript, { color: colors.textPrimary }]}
              accessibilityLabel="Voice dump transcript"
            />
          </ScrollView>
          {voiceListening ? (
            <DumpVoiceWaveform pemAmber={pemAmber} waveInactive={waveInactive} />
          ) : null}
        </>
      ) : (
        <PemText variant="bodyMuted" style={[styles.centerText, styles.typeHint]}>
          Get it all down — Pem figures out what each piece needs.
        </PemText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  main: {
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: space[6],
    gap: space[4],
    minHeight: 0,
  },
  centerText: {
    textAlign: "center",
  },
  quoteSize: {
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.relaxed),
  },
  typeHint: {
    marginTop: space[2],
  },
  voiceScroll: {
    flexGrow: 1,
    minHeight: 120,
    maxHeight: 280,
    width: "100%",
  },
  voiceScrollContent: {
    flexGrow: 1,
    paddingVertical: space[2],
  },
  voiceTranscript: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    textAlignVertical: "top",
    minHeight: 120,
  },
});
