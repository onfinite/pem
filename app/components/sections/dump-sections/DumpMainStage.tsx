import PemText from "@/components/ui/PemText";
import { DUMP_TRANSCRIPT_MAX_CHARS } from "@/constants/limits";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import type { RefObject } from "react";
import { StyleSheet, TextInput, View } from "react-native";

const TRY_LABEL = "What’s on your mind?";
const EXAMPLE = '"Gift for mom — gardening lover, budget $60."';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  inputRef: RefObject<TextInput | null>;
};

/**
 * Headline + example + primary multiline dump field (text-only).
 */
export default function DumpMainStage({ value, onChangeText, inputRef }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.main}>
      <PemText variant="label" style={styles.centerText}>
        {TRY_LABEL}
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
        {EXAMPLE}
      </PemText>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder="Type your dump…"
        placeholderTextColor={colors.placeholder}
        multiline
        maxLength={DUMP_TRANSCRIPT_MAX_CHARS}
        textAlignVertical="top"
        style={[styles.dumpInput, { color: colors.textPrimary, borderColor: colors.borderMuted }]}
        accessibilityLabel="Dump text"
      />

      <PemText variant="bodyMuted" style={[styles.centerText, styles.hint]}>
        Get it all down — Pem figures out what each piece needs.
      </PemText>
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
  hint: {
    marginTop: space[1],
  },
  dumpInput: {
    flex: 1,
    minHeight: 200,
    width: "100%",
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
});
