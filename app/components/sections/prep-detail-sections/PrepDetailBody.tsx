import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import * as Clipboard from "expo-clipboard";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { Copy, ExternalLink, FileText } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { Prep } from "../home-sections/homePrepData";

type Props = { prep: Prep };

export default function PrepDetailBody({ prep }: Props) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);

  const copyDraft = useCallback(async () => {
    if (!prep.draftText) return;
    await Clipboard.setStringAsync(prep.draftText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [prep.draftText]);

  return (
    <View style={styles.block}>
      {prep.status === "prepping" ? (
        <PemText style={[styles.intro, { color: colors.textSecondary }]}>
          Pem&apos;s still working on this prep. It will move to Ready when you can act on it.
        </PemText>
      ) : null}

      {prep.detailIntro ? (
        <PemText style={[styles.intro, { color: colors.textSecondary }]}>{prep.detailIntro}</PemText>
      ) : null}

      {prep.kind === "options" && prep.options ? (
        <View style={styles.gap}>
          {prep.options.map((o, i) => (
            <View
              key={`${o.label}-${i}`}
              style={[styles.optionCard, { backgroundColor: colors.pageBackground, borderColor: colors.borderMuted }]}
            >
              <View style={styles.optionTop}>
                <View style={styles.optionTextCol}>
                  <PemText style={[styles.optLabel, { color: colors.textPrimary }]}>{o.label}</PemText>
                  {o.why ? (
                    <View style={styles.whyBlock}>
                      <PemMarkdown>{o.why}</PemMarkdown>
                    </View>
                  ) : null}
                </View>
                {o.price ? (
                  <PemText style={[styles.optPrice, { color: colors.textSecondary }]}>{o.price}</PemText>
                ) : null}
              </View>
              {o.url ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open link for ${o.label}`}
                  onPress={() => void openExternalUrl(o.url!)}
                  style={({ pressed }) => [
                    styles.linkRow,
                    { opacity: pressed ? 0.85 : 1, borderTopColor: colors.borderMuted },
                  ]}
                >
                  <ExternalLink size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                  <PemText style={[styles.linkText, { color: colors.pemAmber }]} numberOfLines={1}>
                    {o.url.replace(/^https?:\/\//, "")}
                  </PemText>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {prep.body ? (
        <View style={[styles.bodyBlock, { borderColor: colors.borderMuted }]}>
          <View style={styles.bodyHead}>
            <FileText size={18} stroke={colors.textSecondary} strokeWidth={2} />
            <PemText style={[styles.bodyHeadLabel, { color: colors.textPrimary }]}>
              {prep.kind === "deep_research"
                ? "Research"
                : prep.kind === "draft"
                  ? "Notes"
                  : prep.kind === "options"
                    ? "Note"
                    : "Summary"}
            </PemText>
          </View>
          <PemMarkdown>{prep.body}</PemMarkdown>
        </View>
      ) : null}

      {prep.kind === "draft" && prep.draftText ? (
        <View style={[styles.draftShell, { backgroundColor: colors.secondarySurface, borderColor: colors.borderMuted }]}>
          <View style={styles.draftToolbar}>
            <PemText style={[styles.draftLabel, { color: colors.textPrimary }]}>Draft</PemText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy draft to clipboard"
              onPress={copyDraft}
              style={({ pressed }) => [
                styles.copyBtn,
                { backgroundColor: colors.cardBackground, opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <Copy size={18} stroke={colors.textSecondary} strokeWidth={2.25} />
              <PemText style={[styles.copyLabel, { color: colors.textPrimary }]}>
                {copied ? "Copied" : "Copy"}
              </PemText>
            </Pressable>
          </View>
          <PemText selectable style={[styles.draftText, { color: colors.textPrimary }]}>
            {prep.draftText}
          </PemText>
        </View>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space[5],
  },
  intro: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
  },
  gap: {
    gap: space[2],
  },
  optionCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  optionTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[3],
  },
  optionTextCol: {
    flex: 1,
    minWidth: 0,
    gap: space[2],
  },
  whyBlock: {
    marginTop: 2,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  linkText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans.medium,
  },
  optLabel: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: fontFamily.sans.medium,
    minWidth: 0,
  },
  optPrice: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans.regular,
  },
  bodyBlock: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: space[4],
    gap: space[2],
  },
  bodyHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  bodyHeadLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  draftShell: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: space[4],
    gap: space[3],
  },
  draftToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  draftLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radii.md,
  },
  copyLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
  },
  draftText: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
  },
});
