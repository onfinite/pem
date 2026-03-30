import PemText from "@/components/ui/PemText";
import { fontSize, lh, lineHeight, space } from "@/constants/typography";
import { StyleSheet, View } from "react-native";
import DumpVoiceWaveform from "./DumpVoiceWaveform";

const VOICE_TRY_LABEL = "Try saying";
const TYPE_TRY_LABEL = "Try typing";
const VOICE_EXAMPLE =
  '"...mom\'s birthday next week, the gym thing, and this app idea—"';
const TYPE_EXAMPLE = '"Gift for mom — gardening lover, budget $60."';

type BottomMode = "voice" | "type";

type Props = {
  bottomMode: BottomMode;
  pemAmber: string;
  waveInactive: string;
};

export default function DumpMainStage({ bottomMode, pemAmber, waveInactive }: Props) {
  return (
    <View style={styles.main}>
      <PemText variant="label" style={styles.centerText}>
        {bottomMode === "voice" ? VOICE_TRY_LABEL : TYPE_TRY_LABEL}
      </PemText>
      <PemText variant="brandItalic" style={[styles.centerText, styles.quoteSize]}>
        {bottomMode === "voice" ? VOICE_EXAMPLE : TYPE_EXAMPLE}
      </PemText>

      {bottomMode === "voice" ? (
        <DumpVoiceWaveform pemAmber={pemAmber} waveInactive={waveInactive} />
      ) : (
        <PemText variant="bodyMuted" style={[styles.centerText, styles.typeHint]}>
          Type everything on your mind — Pem will sort it out.
        </PemText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  main: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space[6],
    gap: space[5],
  },
  centerText: {
    textAlign: "center",
  },
  quoteSize: {
    fontSize: fontSize.xxl,
    lineHeight: lh(fontSize.xxl, lineHeight.relaxed),
  },
  typeHint: {
    marginTop: space[2],
  },
});
