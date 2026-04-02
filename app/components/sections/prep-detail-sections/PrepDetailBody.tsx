import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { prepKindCompanionLabel } from "@/lib/prepDetailLabels";
import { buildPrepOptionShareText, buildPrepShareablePlainText } from "@/lib/prepShareableText";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { ExternalLink } from "lucide-react-native";
import { Image, Platform, Pressable, StyleSheet, View } from "react-native";
import type { Prep } from "../home-sections/homePrepData";
import PrepShareCopyRow from "./PrepShareCopyRow";

type Props = { prep: Prep };

const PICK_WARM = ["First pick", "Second pick", "Third pick"] as const;

const COPY = {
  optionsLead:
    "Here are a few directions that fit what you shared — tap through when something feels right.",
  researchLead: "Here’s what I pulled together for you.",
  searchLead: "Here’s the gist.",
  draftSection: "Words you can send",
  draftHint: "Copy or share when you’re ready — you’re always the one who sends.",
  shareSection: "Take this with you",
} as const;

export default function PrepDetailBody({ prep }: Props) {
  const { colors } = useTheme();

  const shareableFull = buildPrepShareablePlainText(prep);
  const showFullShare =
    prep.status !== "prepping" &&
    prep.status !== undefined &&
    shareableFull.trim().length > 0;

  const kindLabel = prepKindCompanionLabel(prep.kind);
  const isResearch = prep.kind === "deep_research";
  const isSearch = prep.kind === "web";
  const isOptions = prep.kind === "options" && prep.options && prep.options.length > 0;

  const proseLead = isResearch ? COPY.researchLead : isSearch ? COPY.searchLead : null;

  return (
    <View style={styles.block}>
      {prep.status === "prepping" ? (
        <PemText style={[styles.proseMuted, { color: colors.textSecondary }]}>
          I&apos;m still on this one — it&apos;ll show up in Ready when there&apos;s something solid to open.
        </PemText>
      ) : null}

      {prep.detailIntro ? (
        <View style={[styles.draftMetaCard, { backgroundColor: colors.brandMutedSurface, borderColor: colors.borderMuted }]}>
          <PemText style={[styles.proseMuted, { color: colors.textSecondary }]}>{prep.detailIntro}</PemText>
        </View>
      ) : null}

      {isOptions ? (
        <View style={styles.section}>
          <PemText style={[styles.leadProse, { color: colors.textSecondary }]}>{COPY.optionsLead}</PemText>
          <View style={styles.picksGap}>
            {prep.options!.map((o, i) => (
              <View
                key={`${o.label}-${i}`}
                style={[
                  styles.pickShell,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: colors.borderMuted,
                    ...Platform.select({
                      ios: {
                        shadowColor: "#1c1a16",
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.07,
                        shadowRadius: 14,
                      },
                      android: { elevation: 1 },
                    }),
                  },
                ]}
              >
                {o.imageUrl ? (
                  <Image
                    source={{ uri: o.imageUrl }}
                    style={[styles.pickImage, { backgroundColor: colors.secondarySurface }]}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                  />
                ) : null}
                <View style={styles.pickInner}>
                  <View style={styles.pickHeader}>
                    <PemText variant="caption" style={[styles.pickOrdinal, { color: colors.pemAmber }]}>
                      {PICK_WARM[i] ?? `Pick ${i + 1}`}
                    </PemText>
                    <PrepShareCopyRow
                      variant="compact"
                      text={buildPrepOptionShareText(o)}
                      shareTitle={o.label}
                    />
                  </View>
                  <PemText style={[styles.pickTitle, { color: colors.textPrimary }]}>{o.label}</PemText>
                  {o.store ? (
                    <PemText variant="caption" style={{ color: colors.textSecondary }}>
                      {o.store}
                    </PemText>
                  ) : null}
                  {o.price ? (
                    <PemText style={[styles.pickPrice, { color: colors.textSecondary }]}>{o.price}</PemText>
                  ) : null}
                  {o.why ? (
                    <View style={styles.whyBlock}>
                      <PemMarkdown variant="companion">{o.why}</PemMarkdown>
                    </View>
                  ) : null}
                  {o.url ? (
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`Open link for ${o.label}`}
                      onPress={() => void openExternalUrl(o.url!)}
                      style={({ pressed }) => [
                        styles.pickLink,
                        { opacity: pressed ? 0.8 : 1, borderTopColor: colors.borderMuted },
                      ]}
                    >
                      <ExternalLink size={16} stroke={colors.pemAmber} strokeWidth={2.25} />
                      <PemText style={[styles.pickLinkText, { color: colors.pemAmber }]}>
                        Open · {o.url.replace(/^https?:\/\//, "").split("/")[0]}
                      </PemText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {prep.body ? (
        <View style={styles.section}>
          {proseLead ? (
            <PemText style={[styles.leadProse, { color: colors.textSecondary }]}>{proseLead}</PemText>
          ) : null}
          <View
            style={[
              styles.proseSurface,
              { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted },
            ]}
          >
            <PemMarkdown variant="body">{prep.body}</PemMarkdown>
          </View>
        </View>
      ) : null}

      {prep.kind === "draft" && prep.draftText ? (
        <View style={styles.section}>
          <PemText style={[styles.sectionTitle, { color: colors.textPrimary }]}>{COPY.draftSection}</PemText>
          <PemText style={[styles.draftHint, { color: colors.textSecondary }]}>{COPY.draftHint}</PemText>
          <View style={[styles.draftSurface, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}>
            <PemText selectable style={[styles.draftText, { color: colors.textPrimary }]}>
              {prep.draftText}
            </PemText>
          </View>
        </View>
      ) : null}

      {showFullShare ? (
        <View style={[styles.shareSection, { borderTopColor: colors.borderMuted }]}>
          <PemText style={[styles.shareLabel, { color: colors.textSecondary }]}>{COPY.shareSection}</PemText>
          <PrepShareCopyRow text={shareableFull} shareTitle={prep.title || kindLabel} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space[6],
  },
  section: {
    gap: space[4],
  },
  leadProse: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
  },
  proseMuted: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
  },
  draftMetaCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
  },
  picksGap: {
    gap: space[5],
  },
  pickShell: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  pickImage: {
    width: "100%",
    height: 160,
  },
  pickInner: {
    padding: space[4],
    gap: space[2],
  },
  pickHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[2],
  },
  pickOrdinal: {
    fontFamily: fontFamily.sans.semibold,
    letterSpacing: 0.2,
  },
  pickTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
  },
  pickPrice: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans.regular,
  },
  whyBlock: {
    marginTop: space[1],
  },
  pickLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    marginTop: space[3],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pickLinkText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.sans.medium,
    flex: 1,
  },
  proseSurface: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
  },
  sectionTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
  },
  draftHint: {
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
    marginTop: -space[2],
  },
  draftSurface: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
  },
  draftText: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
  },
  shareSection: {
    gap: space[3],
    paddingTop: space[4],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  shareLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
    letterSpacing: 0.2,
  },
});
