import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space, radii } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { generateExtractDraft, type ApiExtract } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import * as Clipboard from "expo-clipboard";
import { Copy, RefreshCw, Sparkles } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type Props = { extract: ApiExtract };

export function DraftSection({ extract }: Props) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const [draft, setDraft] = useState(extract.draft_text);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const res = await generateExtractDraft(getToken, extract.id);
      setDraft(res.draft);
    } catch { /* toast or silent */ }
    setIsGenerating(false);
  }, [getToken, extract.id]);

  const handleCopy = useCallback(async () => {
    if (!draft) return;
    await Clipboard.setStringAsync(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [draft]);

  const hasDraft = !!draft || !!extract.draft_text;
  const displayDraft = draft ?? extract.draft_text;

  if (!hasDraft && !extract.batch_key?.includes("follow_up") && !extract.text.toLowerCase().match(/\b(email|text|message|reply|respond|call|write)\b/)) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textTertiary }]}>Draft</Text>

      {displayDraft ? (
        <>
          <Text style={[styles.draftText, { color: colors.textPrimary }]} selectable>
            {displayDraft}
          </Text>
          <View style={styles.row}>
            <Pressable onPress={handleCopy} style={[styles.actionBtn, { backgroundColor: colors.secondarySurface }]}>
              <Copy size={14} color={copied ? pemAmber : colors.textSecondary} />
              <Text style={[styles.actionLabel, { color: copied ? pemAmber : colors.textSecondary }]}>
                {copied ? "Copied" : "Copy"}
              </Text>
            </Pressable>
            <Pressable onPress={handleGenerate} disabled={isGenerating} style={[styles.actionBtn, { backgroundColor: colors.secondarySurface }]}>
              {isGenerating
                ? <ActivityIndicator size={14} color={colors.textSecondary} />
                : <RefreshCw size={14} color={colors.textSecondary} />}
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Regenerate</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable onPress={handleGenerate} disabled={isGenerating} style={[styles.generateBtn, { borderColor: colors.borderMuted }]}>
          {isGenerating
            ? <ActivityIndicator size={14} color={pemAmber} />
            : <Sparkles size={14} color={pemAmber} />}
          <Text style={[styles.generateLabel, { color: colors.textPrimary }]}>
            {isGenerating ? "Generating…" : "Generate a draft"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: space[3] },
  label: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    marginBottom: space[1],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  draftText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: 22,
    paddingVertical: space[1],
  },
  row: { flexDirection: "row", gap: space[2], marginTop: space[2] },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space[3],
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  actionLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  generateLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
});
