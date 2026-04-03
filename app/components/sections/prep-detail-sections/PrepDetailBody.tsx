import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { formatKeyPointsMarkdown, formatSourcesMarkdown } from "@/lib/prepBodyMarkdown";
import { prepKindCompanionLabel } from "@/lib/prepDetailLabels";
import type { PrepOptionRow, PrepResultBlock } from "@/lib/prepBlocks";
import {
  buildBlockShareText,
  buildDraftBlockShareText,
  buildLegacyDraftShareText,
  buildPrepShareablePlainText,
} from "@/lib/prepShareableText";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { ExternalLink } from "lucide-react-native";
import { Image, Platform, Pressable, StyleSheet, View } from "react-native";
import type { Prep } from "../home-sections/homePrepData";
import PrepShareRow from "./PrepShareRow";

type Props = { prep: Prep };

const PICK_WARM = ["First pick", "Second pick", "Third pick"] as const;

const COPY = {
  optionsLead:
    "Here are a few directions that fit what you shared — tap through when something feels right.",
  researchLead: "Here’s what I pulled together for you.",
  searchLead: "Here’s the gist.",
  draftSection: "Words you can send",
  draftHint: "Share when you’re ready — you’re always the one who sends.",
  guidanceLabel: "Guidance",
  limitationLabel: "Note",
  shareSection: "Take this with you",
} as const;

/** Send/share for a block — placed after content so reading isn’t blocked by chrome. */
function BlockToolbar({ text, shareTitle }: { text: string; shareTitle: string }) {
  const { colors } = useTheme();
  if (!text.trim()) return null;
  return (
    <View style={[styles.blockToolbarFooter, { borderTopColor: colors.borderMuted }]}>
      <PrepShareRow variant="compact" text={text.trim()} shareTitle={shareTitle} />
    </View>
  );
}

function blockOptionRowToPrepOption(o: PrepOptionRow): NonNullable<Prep["options"]>[number] {
  return {
    label: o.name,
    price: o.price,
    url: o.url || undefined,
    why: o.why || undefined,
    store: o.store || undefined,
    imageUrl: o.imageUrl || undefined,
  };
}

function searchBlockMarkdown(block: Extract<PrepResultBlock, { type: "search" }>): string {
  const head = block.answer.trim();
  return head + formatSourcesMarkdown(block.sources);
}

function researchBlockMarkdown(block: Extract<PrepResultBlock, { type: "research" }>): string {
  const head = block.summary.trim();
  const kp = formatKeyPointsMarkdown(block.keyPoints, "research");
  const src = formatSourcesMarkdown(block.sources);
  return head + kp + src;
}

type OptionPicksProps = { options: NonNullable<Prep["options"]>; nested?: boolean };

function PrepDetailOptionPicks({ options, nested }: OptionPicksProps) {
  const { colors } = useTheme();
  const inner = (
    <>
      <PemText selectable style={[styles.leadProse, { color: colors.textSecondary }]}>
        {COPY.optionsLead}
      </PemText>
      <View style={styles.picksGap}>
        {options.map((o, i) => (
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
                  <PemMarkdown variant="companion" selectable>
                    {o.why}
                  </PemMarkdown>
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
    </>
  );
  if (nested) {
    return <View style={styles.sectionNested}>{inner}</View>;
  }
  return <View style={styles.section}>{inner}</View>;
}

type BlockSectionProps = { block: PrepResultBlock; prepTitle: string };

function PrepDetailBlockSection({ block, prepTitle }: BlockSectionProps) {
  const { colors } = useTheme();

  switch (block.type) {
    case "search": {
      const md = searchBlockMarkdown(block);
      if (!md.trim()) return null;
      return (
        <View style={styles.section}>
          <PemText selectable style={[styles.leadProse, { color: colors.textSecondary }]}>
            {COPY.searchLead}
          </PemText>
          <View style={[styles.proseSurface, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}>
            <PemMarkdown variant="body" selectable>
              {md}
            </PemMarkdown>
            <BlockToolbar text={buildBlockShareText(block)} shareTitle={prepTitle} />
          </View>
        </View>
      );
    }
    case "research": {
      const md = researchBlockMarkdown(block);
      if (!md.trim()) return null;
      return (
        <View style={styles.section}>
          <PemText selectable style={[styles.leadProse, { color: colors.textSecondary }]}>
            {COPY.researchLead}
          </PemText>
          <View style={[styles.proseSurface, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}>
            <PemMarkdown variant="body" selectable>
              {md}
            </PemMarkdown>
            <BlockToolbar text={buildBlockShareText(block)} shareTitle={prepTitle} />
          </View>
        </View>
      );
    }
    case "options": {
      const opts = block.options.map(blockOptionRowToPrepOption);
      if (!opts.length) return null;
      return (
        <View style={styles.section}>
          <PrepDetailOptionPicks options={opts} nested />
        </View>
      );
    }
    case "draft": {
      const body = block.body.trim();
      if (!body) return null;
      const draftShareText = buildDraftBlockShareText(block);
      return (
        <View style={styles.section}>
          <PemText style={[styles.sectionTitle, { color: colors.textPrimary }]}>{COPY.draftSection}</PemText>
          <PemText style={[styles.draftHint, { color: colors.textSecondary }]}>{COPY.draftHint}</PemText>
          <View style={[styles.draftSurface, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}>
            {block.subject ? (
              <PemText selectable style={[styles.draftMetaLine, { color: colors.textSecondary }]}>
                Subject: {block.subject}
              </PemText>
            ) : null}
            {block.tone ? (
              <PemText selectable style={[styles.draftMetaLine, { color: colors.textSecondary }]}>
                Tone: {block.tone}
              </PemText>
            ) : null}
            <PemText selectable style={[styles.draftText, { color: colors.textPrimary }]}>
              {body}
            </PemText>
            <View style={[styles.blockToolbarFooter, { borderTopColor: colors.borderMuted }]}>
              <PrepShareRow
                variant="compact"
                text={draftShareText}
                shareTitle={block.subject?.trim() || "Email draft"}
              />
            </View>
          </View>
        </View>
      );
    }
    case "guidance": {
      const body = block.body.trim();
      if (!body) return null;
      return (
        <View style={styles.section}>
          <View style={[styles.calloutCard, { backgroundColor: colors.brandMutedSurface, borderColor: colors.borderMuted }]}>
            <PemText style={[styles.calloutLabel, { color: colors.textSecondary }]}>{COPY.guidanceLabel}</PemText>
            {block.title?.trim() ? (
              <PemText style={[styles.calloutTitle, { color: colors.textPrimary }]}>{block.title.trim()}</PemText>
            ) : null}
            <PemMarkdown variant="companion" selectable>
              {body}
            </PemMarkdown>
            <BlockToolbar text={buildBlockShareText(block)} shareTitle={prepTitle} />
          </View>
        </View>
      );
    }
    case "limitation": {
      const body = block.body.trim();
      if (!body) return null;
      return (
        <View style={styles.section}>
          <View style={[styles.calloutCard, { backgroundColor: colors.secondarySurface, borderColor: colors.borderMuted }]}>
            <PemText style={[styles.calloutLabel, { color: colors.textSecondary }]}>{COPY.limitationLabel}</PemText>
            {block.title?.trim() ? (
              <PemText style={[styles.calloutTitle, { color: colors.textPrimary }]}>{block.title.trim()}</PemText>
            ) : null}
            <PemMarkdown variant="companion" selectable>
              {body}
            </PemMarkdown>
            <BlockToolbar text={buildBlockShareText(block)} shareTitle={prepTitle} />
          </View>
        </View>
      );
    }
    default:
      return null;
  }
}

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
  const useBlocks = Boolean(prep.blocks?.length);
  const isOptions = !useBlocks && prep.kind === "options" && prep.options && prep.options.length > 0;

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
          <PemText selectable style={[styles.proseMuted, { color: colors.textSecondary }]}>
            {prep.detailIntro}
          </PemText>
          <BlockToolbar text={prep.detailIntro} shareTitle={prep.title} />
        </View>
      ) : null}

      {useBlocks
        ? prep.blocks!.map((b, i) => (
            <PrepDetailBlockSection key={`${b.type}-${i}`} block={b} prepTitle={prep.title} />
          ))
        : null}

      {isOptions ? <PrepDetailOptionPicks options={prep.options!} /> : null}

      {!useBlocks && prep.body ? (
        <View style={styles.section}>
          {proseLead ? (
            <PemText selectable style={[styles.leadProse, { color: colors.textSecondary }]}>
              {proseLead}
            </PemText>
          ) : null}
          <View
            style={[
              styles.proseSurface,
              { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted },
            ]}
          >
            <PemMarkdown variant="body" selectable>
              {prep.body}
            </PemMarkdown>
            <BlockToolbar text={prep.body} shareTitle={prep.title} />
          </View>
        </View>
      ) : null}

      {!useBlocks && prep.kind === "draft" && prep.draftText ? (
        <View style={styles.section}>
          <PemText style={[styles.sectionTitle, { color: colors.textPrimary }]}>{COPY.draftSection}</PemText>
          <PemText style={[styles.draftHint, { color: colors.textSecondary }]}>{COPY.draftHint}</PemText>
          <View style={[styles.draftSurface, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}>
            <PemText selectable style={[styles.draftText, { color: colors.textPrimary }]}>
              {prep.draftText}
            </PemText>
            <View style={[styles.blockToolbarFooter, { borderTopColor: colors.borderMuted }]}>
              <PrepShareRow
                variant="compact"
                text={buildLegacyDraftShareText(prep.draftText, prep.draftSubject)}
                shareTitle={prep.title?.trim() || "Email draft"}
              />
            </View>
          </View>
        </View>
      ) : null}

      {showFullShare ? (
        <View style={[styles.shareSection, { borderTopColor: colors.borderMuted }]}>
          <PemText style={[styles.shareLabel, { color: colors.textSecondary }]}>{COPY.shareSection}</PemText>
          <PrepShareRow text={shareableFull} shareTitle={prep.title || kindLabel} />
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
  sectionNested: {
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
  blockToolbarFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: space[3],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  draftText: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
  },
  draftMetaLine: {
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
    marginBottom: space[2],
  },
  calloutCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[2],
  },
  calloutLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  calloutTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
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
