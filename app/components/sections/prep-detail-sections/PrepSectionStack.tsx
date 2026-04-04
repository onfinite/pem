/**
 * Prep detail — canonical section stack (order + visuals per `pem-prep-sections.mdc`).
 */

import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { RemoteImageOrPlaceholder } from "@/components/ui/SafeRemoteImage";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import type { PrepSourceChip } from "@/lib/prepBlocks";
import { openExternalUrl } from "@/lib/openExternalUrl";
import type { PrepCanonicalSection } from "@/lib/prepSections";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { AlertCircle, Check, Copy, ExternalLink, Send, Zap } from "lucide-react-native";
import { useCallback } from "react";
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";

const { width: SCREEN_W } = Dimensions.get("window");
const OPTION_CARD_W = 200;
const OPTION_GAP = 12;
const SNAP = OPTION_CARD_W + OPTION_GAP;

const COPY = {
  whatIFound: "What I found",
  gist: "Here’s the gist",
  optionsFound: (n: number) => `Options found · ${n} pick${n === 1 ? "" : "s"}`,
  draftReady: "Draft ready",
  prosCons: "Pros and cons",
  nextSteps: "Next steps",
  goodToKnow: "Good to know",
  sideBySide: "Side by side",
  cantDo: "What I can’t do here",
  canDo: "What I can do instead",
  followUpHint: "Go deeper with Pem",
} as const;

/** Vertical link list — reading flow (research / gist), not favicon chips. */
function PlainSourceList({ sources, max = 12 }: { sources: PrepSourceChip[]; max?: number }) {
  const { colors } = useTheme();
  const shown = sources.slice(0, max);
  if (shown.length === 0) return null;
  return (
    <View style={styles.plainSources}>
      <PemText style={[styles.plainSourcesLabel, { color: colors.textSecondary }]}>Sources</PemText>
      {shown.map((s, i) => (
        <Pressable
          key={`${s.url}-${i}`}
          accessibilityRole="link"
          onPress={() => void openExternalUrl(s.url)}
          style={({ pressed }) => [styles.plainSourceRow, { opacity: pressed ? 0.78 : 1 }]}
        >
          <ExternalLink size={15} stroke={colors.textTertiary} strokeWidth={2} />
          <PemText
            numberOfLines={3}
            style={[
              styles.plainSourceText,
              {
                color: colors.textPrimary,
                textDecorationColor: colors.borderMuted,
              },
            ]}
          >
            {s.title?.trim() || s.domain || s.url}
          </PemText>
        </Pressable>
      ))}
    </View>
  );
}

function SummarySection({ text }: { text: string }) {
  const { colors } = useTheme();
  if (!text.trim()) return null;
  return (
    <PemText selectable style={[styles.summaryText, { color: colors.textPrimary }]}>
      {text.trim()}
    </PemText>
  );
}

function ResearchLikeSection({
  title,
  narrative,
  keyPoints,
  sources,
}: {
  title: string;
  narrative: string;
  keyPoints: string[];
  sources: PrepSourceChip[];
}) {
  const { colors } = useTheme();
  const paras = narrative.split(/\n\n+/).filter(Boolean);
  return (
    <View style={styles.readingBlock}>
      <PemText style={[styles.readingTitle, { color: colors.textPrimary }]}>{title}</PemText>
      {paras.map((p, i) => (
        <PemMarkdown key={i} variant="body" selectable style={{ color: colors.textPrimary }}>
          {p}
        </PemMarkdown>
      ))}
      {keyPoints.length > 0 ? (
        <View style={styles.kpListLoose}>
          {keyPoints.map((k, i) => (
            <View key={i} style={styles.kpRowLoose}>
              <PemText style={[styles.kpBullet, { color: colors.textTertiary }]}>•</PemText>
              <PemText selectable style={[styles.kpText, { color: colors.textPrimary }]}>
                {k}
              </PemText>
            </View>
          ))}
        </View>
      ) : null}
      {sources.length > 0 ? <PlainSourceList sources={sources} /> : null}
    </View>
  );
}

function ProsConsSection({
  pros,
  cons,
  verdict,
}: {
  pros: string[];
  cons: string[];
  verdict?: string;
}) {
  const { colors } = useTheme();
  const maxR = Math.max(pros.length, cons.length, 0);
  return (
    <View style={styles.sectionGap}>
      <PemText style={[styles.sectionHeader, { color: colors.textPrimary }]}>{COPY.prosCons}</PemText>
      <View style={styles.prosConsRow}>
        <View style={styles.prosCol}>
          {Array.from({ length: maxR }).map((_, i) => {
            const line = pros[i];
            if (!line) return <View key={i} style={styles.proConSlot} />;
            return (
              <View key={i} style={styles.proConRow}>
                <View style={[styles.statusDot, { backgroundColor: "#22c55e" }]} />
                <PemText selectable style={[styles.proConText, { color: colors.textPrimary }]}>
                  {line}
                </PemText>
              </View>
            );
          })}
        </View>
        <View style={styles.prosCol}>
          {Array.from({ length: maxR }).map((_, i) => {
            const line = cons[i];
            if (!line) return <View key={i} style={styles.proConSlot} />;
            return (
              <View key={i} style={styles.proConRow}>
                <View style={[styles.statusDot, { backgroundColor: "#ef4444" }]} />
                <PemText selectable style={[styles.proConText, { color: colors.textPrimary }]}>
                  {line}
                </PemText>
              </View>
            );
          })}
        </View>
      </View>
      {verdict?.trim() ? (
        <PemText style={[styles.verdict, { color: colors.pemAmber }]}>{verdict.trim()}</PemText>
      ) : null}
    </View>
  );
}

function OptionsHorizontalSection({
  options,
}: {
  options: import("@/lib/prepBlocks").PrepOptionRow[];
}) {
  const { colors } = useTheme();
  const n = options.length;
  if (n === 0) return null;
  const single = n === 1;

  const card = (o: (typeof options)[0], i: number) => {
    const img = o.imageUrl?.trim() ?? "";
    return (
    <View
      key={`${o.name}-${i}`}
      style={[
        styles.optionCard,
        single ? styles.optionCardFull : { width: OPTION_CARD_W },
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.borderMuted,
        },
      ]}
    >
      {img ? (
        <RemoteImageOrPlaceholder
          uri={img}
          style={[styles.optionImage, { backgroundColor: colors.brandMutedSurface }]}
          placeholderStyle={{ backgroundColor: colors.brandMutedSurface }}
        />
      ) : (
        <View
          style={[
            styles.optionImage,
            styles.initialsPh,
            { backgroundColor: colors.brandMutedSurface },
          ]}
        >
          <PemText style={[styles.initialsText, { color: colors.pemAmber }]}>
            {(o.store || o.name || "?").slice(0, 1).toUpperCase()}
          </PemText>
        </View>
      )}
      <View style={styles.optionBody}>
        <PemText numberOfLines={2} style={[styles.optionName, { color: colors.textPrimary }]}>
          {o.name}
        </PemText>
        {o.price ? (
          <PemText style={[styles.optionPrice, { color: colors.pemAmber }]}>{o.price}</PemText>
        ) : null}
        {o.store ? (
          <PemText variant="caption" style={{ color: colors.textSecondary }}>
            {o.store}
          </PemText>
        ) : null}
        {o.why ? (
          <PemText variant="caption" style={[styles.optionWhy, { color: colors.textSecondary }]}>
            {o.why}
          </PemText>
        ) : null}
        {o.rating ? (
          <PemText variant="caption" style={{ color: colors.textSecondary }}>
            {o.rating}
          </PemText>
        ) : null}
        {o.url ? (
          <Pressable
            onPress={() => void openExternalUrl(o.url)}
            style={({ pressed }) => [
              styles.viewBtn,
              { backgroundColor: colors.pemAmber, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <PemText style={styles.viewBtnText}>View →</PemText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
  };

  return (
    <View style={styles.sectionGap}>
      <PemText style={[styles.sectionHeader, { color: colors.textPrimary }]}>{COPY.optionsFound(n)}</PemText>
      {single ? (
        <View style={{ width: "100%" }}>{card(options[0], 0)}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={SNAP}
          decelerationRate="fast"
          contentContainerStyle={styles.hScrollPad}
        >
          {options.map((o, i) => card(o, i))}
        </ScrollView>
      )}
    </View>
  );
}

function DraftSection({
  subject,
  body,
  tone,
  recipientHint,
  prepTitle,
}: {
  subject: string | null;
  body: string;
  tone: string;
  recipientHint?: string;
  prepTitle: string;
}) {
  const { colors } = useTheme();
  const onCopy = useCallback(async () => {
    const t = [subject?.trim() ? `Subject: ${subject}` : null, body.trim()].filter(Boolean).join("\n\n");
    if (t) await Clipboard.setStringAsync(t);
  }, [subject, body]);

  const onSend = useCallback(async () => {
    const t = body.trim();
    if (!t) return;
    await Share.share(Platform.OS === "android" ? { message: t, title: prepTitle } : { message: t });
  }, [body, prepTitle]);

  if (!body.trim()) return null;

  return (
    <View style={styles.sectionGap}>
      <PemText style={[styles.sectionHeader, { color: colors.textPrimary }]}>{COPY.draftReady}</PemText>
      {tone ? (
        <View style={[styles.tonePill, { borderColor: colors.pemAmber }]}>
          <PemText variant="caption" style={{ color: colors.pemAmber }}>
            {tone}
          </PemText>
        </View>
      ) : null}
      {recipientHint?.trim() ? (
        <PemText variant="caption" style={{ color: colors.textSecondary }}>
          {recipientHint.trim()}
        </PemText>
      ) : null}
      {subject?.trim() ? (
        <PemText selectable style={[styles.draftSubject, { color: colors.textSecondary }]}>
          Subject: {subject}
        </PemText>
      ) : null}
      <View style={[styles.draftBubble, { backgroundColor: colors.brandMutedSurface }]}>
        <PemMarkdown variant="body" selectable style={{ color: colors.textPrimary }}>
          {body.trim()}
        </PemMarkdown>
      </View>
      <View style={styles.draftActions}>
        <Pressable
          onPress={() => void onCopy()}
          style={({ pressed }) => [styles.draftBtn, { borderColor: colors.borderMuted, opacity: pressed ? 0.85 : 1 }]}
        >
          <Copy size={16} stroke={colors.pemAmber} strokeWidth={2} />
          <PemText style={{ color: colors.textPrimary }}>Copy</PemText>
        </Pressable>
        <Pressable
          onPress={() => void onSend()}
          style={({ pressed }) => [styles.draftBtn, { borderColor: colors.borderMuted, opacity: pressed ? 0.85 : 1 }]}
        >
          <Send size={16} stroke={colors.pemAmber} strokeWidth={2} />
          <PemText style={{ color: colors.textPrimary }}>Send with…</PemText>
        </Pressable>
        <Pressable
          onPress={() => {
            Alert.alert("Edit", "Copy the draft and change it in your notes or email app for now.");
          }}
          style={({ pressed }) => [styles.draftBtn, { borderColor: colors.borderMuted, opacity: pressed ? 0.85 : 1 }]}
        >
          <PemText style={{ color: colors.textPrimary }}>Edit</PemText>
        </Pressable>
      </View>
    </View>
  );
}

function ActionStepsSection({
  steps,
}: {
  steps: { number: number; title: string; detail?: string }[];
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionGap}>
      <PemText style={[styles.sectionHeader, { color: colors.textPrimary }]}>{COPY.nextSteps}</PemText>
      {steps.map((s) => (
        <View key={s.number} style={styles.stepRow}>
          <View style={[styles.stepNum, { borderColor: colors.pemAmber }]}>
            <PemText variant="caption" style={{ color: colors.pemAmber }}>
              {s.number}
            </PemText>
          </View>
          <View style={{ flex: 1, gap: space[1] }}>
            <PemText style={[styles.stepTitle, { color: colors.textPrimary }]}>{s.title}</PemText>
            {s.detail?.trim() ? (
              <PemText variant="caption" style={{ color: colors.textSecondary }}>
                {s.detail}
              </PemText>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function TipsSection({ tips }: { tips: { text: string; isWarning?: boolean }[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionGap}>
      <PemText style={[styles.sectionHeader, { color: colors.textPrimary }]}>{COPY.goodToKnow}</PemText>
      {tips.map((t, i) => (
        <View
          key={i}
          style={[
            styles.tipCard,
            {
              backgroundColor: t.isWarning ? "rgba(239,68,68,0.08)" : colors.brandMutedSurface,
              borderColor: colors.borderMuted,
            },
          ]}
        >
          {t.isWarning ? (
            <AlertCircle size={16} stroke="#f97316" strokeWidth={2} />
          ) : (
            <Zap size={16} stroke={colors.pemAmber} strokeWidth={2} />
          )}
          <PemText style={{ flex: 1, color: colors.textPrimary }}>{t.text}</PemText>
        </View>
      ))}
    </View>
  );
}

function ComparisonSection({
  headers,
  rows,
}: {
  headers: string[];
  rows: { label: string; values: string[]; recommended?: boolean }[];
}) {
  const { colors } = useTheme();
  const colW = Math.min(100, (SCREEN_W - space[8]) / Math.max(headers.length + 1, 2));

  return (
    <View style={styles.sectionGap}>
      <PemText style={[styles.sectionHeader, { color: colors.textPrimary }]}>{COPY.sideBySide}</PemText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.tableRow, { borderBottomColor: colors.borderMuted }]}>
            <View style={[styles.tableCorner, { width: colW }]} />
            {headers.map((h, i) => (
              <View key={i} style={[styles.tableHeadCell, { width: colW, backgroundColor: colors.secondarySurface }]}>
                <PemText variant="caption" style={{ fontFamily: fontFamily.sans.semibold, color: colors.textPrimary }}>
                  {h}
                </PemText>
              </View>
            ))}
          </View>
          {rows.map((row, ri) => (
            <View
              key={ri}
              style={[
                styles.tableRow,
                {
                  borderBottomColor: colors.borderMuted,
                  borderLeftWidth: row.recommended ? 3 : 0,
                  borderLeftColor: row.recommended ? colors.pemAmber : "transparent",
                  backgroundColor: row.recommended ? colors.brandMutedSurface : "transparent",
                },
              ]}
            >
              <View style={[styles.tableLabel, { width: colW }]}>
                <PemText variant="caption" numberOfLines={2} style={{ color: colors.textPrimary }}>
                  {row.label}
                </PemText>
              </View>
              {headers.map((_, ci) => {
                const cell = row.values[ci] ?? "—";
                const isCheck = /^(yes|true|✓|check)$/i.test(cell.trim());
                return (
                  <View key={ci} style={[styles.tableCell, { width: colW }]}>
                    {isCheck ? (
                      <Check size={14} stroke={colors.pemAmber} strokeWidth={2.5} />
                    ) : (
                      <PemText variant="caption" style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
                        {cell}
                      </PemText>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function LimitationsSection({
  cannotDo,
  canDo,
  suggestedTools,
}: {
  cannotDo: string;
  canDo: string[];
  suggestedTools?: { name: string; url?: string }[];
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.sectionGap, styles.limitWrap, { backgroundColor: colors.secondarySurface }]}>
      <PemText style={[styles.sectionHeader, { color: colors.textPrimary }]}>{COPY.cantDo}</PemText>
      <PemText style={{ color: colors.textSecondary }}>{cannotDo}</PemText>
      {canDo.length > 0 ? (
        <>
          <View style={[styles.limitDivider, { backgroundColor: colors.borderMuted }]} />
          <PemText style={[styles.subHeader, { color: colors.textPrimary }]}>{COPY.canDo}</PemText>
          {canDo.map((line, i) => (
            <View key={i} style={styles.kpRow}>
              <View style={[styles.amberDot, { backgroundColor: colors.pemAmber }]} />
              <PemText style={{ flex: 1, color: colors.textPrimary }}>{line}</PemText>
            </View>
          ))}
        </>
      ) : null}
      {suggestedTools && suggestedTools.length > 0 ? (
        <View style={styles.chipRow}>
          {suggestedTools.map((t, i) => (
            <Pressable
              key={i}
              onPress={() => t.url && void openExternalUrl(t.url)}
              style={[styles.sourceChip, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}
            >
              <PemText variant="caption" style={{ color: colors.textSecondary }}>
                {t.name}
              </PemText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function FollowUpSection({ question, prefill }: { question: string; prefill?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        const p = prefill?.trim();
        if (p) {
          router.push(`/dump?prefill=${encodeURIComponent(p)}`);
        } else {
          router.push("/dump");
        }
      }}
      style={({ pressed }) => [
        styles.followCard,
        {
          backgroundColor: colors.brandMutedSurface,
          borderColor: colors.pemAmber,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <PemText variant="caption" style={{ color: colors.pemAmber }}>
        {COPY.followUpHint}
      </PemText>
      <PemText style={{ color: colors.textPrimary }}>{question}</PemText>
    </Pressable>
  );
}

function StandaloneSources({ sources }: { sources: PrepSourceChip[] }) {
  if (!sources.length) return null;
  return <PlainSourceList sources={sources} max={16} />;
}

type Props = {
  sections: PrepCanonicalSection[];
  prepTitle: string;
};

export default function PrepSectionStack({ sections, prepTitle }: Props) {
  return (
    <View style={styles.stack}>
      {sections.map((s, i) => {
        const key = `${s.type}-${i}`;
        switch (s.type) {
          case "summary":
            return <SummarySection key={key} text={s.content.text} />;
          case "research":
            return (
              <ResearchLikeSection
                key={key}
                title={COPY.whatIFound}
                narrative={s.content.narrative}
                keyPoints={s.content.keyPoints}
                sources={s.content.sources}
              />
            );
          case "search":
            return (
              <ResearchLikeSection
                key={key}
                title={COPY.gist}
                narrative={s.content.answer}
                keyPoints={[]}
                sources={s.content.sources}
              />
            );
          case "pros_cons":
            return (
              <ProsConsSection
                key={key}
                pros={s.content.pros}
                cons={s.content.cons}
                verdict={s.content.verdict}
              />
            );
          case "options":
            return <OptionsHorizontalSection key={key} options={s.content.options} />;
          case "comparison":
            return (
              <ComparisonSection key={key} headers={s.content.headers} rows={s.content.rows} />
            );
          case "draft":
            return (
              <DraftSection
                key={key}
                subject={s.content.subject}
                body={s.content.body}
                tone={s.content.tone}
                recipientHint={s.content.recipientHint}
                prepTitle={prepTitle}
              />
            );
          case "action_steps":
            return <ActionStepsSection key={key} steps={s.content.steps} />;
          case "tips":
            return <TipsSection key={key} tips={s.content.tips} />;
          case "limitations":
            return (
              <LimitationsSection
                key={key}
                cannotDo={s.content.cannotDo}
                canDo={s.content.canDo}
                suggestedTools={s.content.suggestedTools}
              />
            );
          case "sources":
            return <StandaloneSources key={key} sources={s.content.sources} />;
          case "follow_up":
            return (
              <FollowUpSection key={key} question={s.content.question} prefill={s.content.prefill} />
            );
          default:
            return null;
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[8],
  },
  summaryText: {
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
  },
  sectionGap: {
    gap: space[4],
  },
  /** Research / search narrative blocks — top-to-bottom reading, no card chrome. */
  readingBlock: {
    gap: space[5],
  },
  readingTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize["2xl"],
    lineHeight: lh(fontSize["2xl"], lineHeight.snug),
  },
  sectionHeader: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
  },
  subHeader: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
  },
  kpList: {
    gap: space[2],
  },
  kpListLoose: {
    gap: space[3],
  },
  kpRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2],
  },
  kpRowLoose: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
  },
  kpBullet: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    marginTop: 1,
  },
  amberDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  plainSources: {
    gap: space[3],
    marginTop: space[1],
  },
  plainSourcesLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  plainSourceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
  },
  plainSourceText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
    textDecorationLine: "underline",
  },
  kpText: {
    flex: 1,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  sourceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  prosConsRow: {
    flexDirection: "row",
    gap: space[3],
  },
  prosCol: {
    flex: 1,
    gap: space[2],
  },
  proConRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2],
  },
  proConSlot: {
    minHeight: 22,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  proConText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  verdict: {
    fontStyle: "italic",
    fontSize: fontSize.md,
    marginTop: space[2],
  },
  hScrollPad: {
    paddingRight: space[4],
    gap: OPTION_GAP,
  },
  optionCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  optionCardFull: {
    width: "100%",
  },
  optionImage: {
    width: "100%",
    height: 160,
  },
  initialsPh: {
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: {
    fontSize: fontSize.xxl,
    fontFamily: fontFamily.display.semibold,
  },
  optionBody: {
    padding: space[3],
    gap: space[1],
  },
  optionName: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.base,
  },
  optionPrice: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.lg,
  },
  optionWhy: {
    fontStyle: "italic",
  },
  viewBtn: {
    marginTop: space[2],
    paddingVertical: space[2],
    borderRadius: radii.md,
    alignItems: "center",
  },
  viewBtnText: {
    color: "#fff",
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
  },
  tonePill: {
    alignSelf: "flex-start",
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radii.full,
    borderWidth: 1,
  },
  draftSubject: {
    fontSize: fontSize.sm,
  },
  draftBubble: {
    borderRadius: radii.lg,
    padding: space[4],
  },
  draftActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  draftBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stepRow: {
    flexDirection: "row",
    gap: space[3],
    alignItems: "flex-start",
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepTitle: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[2],
    padding: space[3],
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableCorner: {},
  tableHeadCell: {
    padding: space[2],
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "transparent",
  },
  tableLabel: {
    padding: space[2],
    justifyContent: "center",
  },
  tableCell: {
    padding: space[2],
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "rgba(0,0,0,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  limitWrap: {
    padding: space[4],
    borderRadius: radii.lg,
  },
  limitDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: space[3],
  },
  followCard: {
    padding: space[4],
    borderRadius: radii.lg,
    borderWidth: 2,
    gap: space[2],
  },
});
