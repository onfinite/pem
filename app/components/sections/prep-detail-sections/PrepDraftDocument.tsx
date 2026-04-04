import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import type { DraftCardPayload } from "@/lib/adaptivePrep";
import { StyleSheet, View } from "react-native";
import PrepShareRow from "./PrepShareRow";

type Props = {
  data: DraftCardPayload;
  prepTitle: string;
  sharePlainText: string;
};

const TYPE_LABEL: Record<DraftCardPayload["draftType"], string> = {
  email: "Email",
  message: "Message",
  post: "Post",
  proposal: "Proposal",
  other: "Draft",
};

export default function PrepDraftDocument({ data, prepTitle, sharePlainText }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
      <View style={[styles.metaStrip, { borderColor: colors.borderMuted }]}>
        <PemText variant="caption" style={[styles.typePill, { color: colors.textSecondary }]}>
          {TYPE_LABEL[data.draftType]}
        </PemText>
        <PemText variant="caption" style={[styles.tonePill, { color: colors.textSecondary }]}>
          {data.tone}
        </PemText>
      </View>

      <View
        style={[
          styles.paper,
          {
            backgroundColor: colors.cardBackground,
            borderColor: colors.borderMuted,
          },
        ]}
      >
        {data.subject.trim() ? (
          <PemText selectable style={[styles.subjectLine, { color: colors.textSecondary }]}>
            Subject: {data.subject}
          </PemText>
        ) : null}
        <PemMarkdown variant="body" selectable style={{ color: colors.textPrimary }}>
          {data.body}
        </PemMarkdown>
      </View>

      {data.assumptions.trim() ? (
        <View style={[styles.assumptions, { backgroundColor: colors.secondarySurface }]}>
          <PemText variant="caption" style={[styles.assumptionsLabel, { color: colors.textSecondary }]}>
            Assumed for you
          </PemText>
          <PemMarkdown variant="companion" selectable>
            {data.assumptions}
          </PemMarkdown>
        </View>
      ) : null}

      {sharePlainText.trim() ? (
        <View style={[styles.shareFooter, { borderTopColor: colors.borderMuted }]}>
          <PrepShareRow variant="compact" text={sharePlainText.trim()} shareTitle={prepTitle} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space[4],
  },
  metaStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
    alignItems: "center",
  },
  typePill: {
    fontFamily: fontFamily.sans.semibold,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    fontSize: fontSize.xs,
  },
  tonePill: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
  },
  paper: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[5],
    gap: space[3],
  },
  subjectLine: {
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
    marginBottom: space[1],
  },
  assumptions: {
    borderRadius: radii.md,
    padding: space[3],
    gap: space[2],
  },
  assumptionsLabel: {
    fontFamily: fontFamily.sans.semibold,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    fontSize: fontSize.xs,
  },
  shareFooter: {
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
});
