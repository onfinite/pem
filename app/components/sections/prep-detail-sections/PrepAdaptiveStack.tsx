import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { RemoteImageOrPlaceholder } from "@/components/ui/SafeRemoteImage";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import type { Prep } from "@/components/sections/home-sections/homePrepData";
import { isLikelyBlockedRemoteImageUrl, normalizeRemoteImageUri } from "@/lib/remoteImageUrl";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { ChevronRight, ExternalLink, Gavel, GitCompare, Scale, StickyNote, User } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import PrepDraftDocument from "./PrepDraftDocument";
import PrepPlaceExperience from "./PrepPlaceExperience";
import PrepShoppingExperience from "./PrepShoppingExperience";
import PrepShareRow from "./PrepShareRow";

type Props = {
  prep: Prep;
  prepTitle: string;
  sharePlainText: string;
};

function Hero({
  kicker,
  title,
  sub,
  variant = "card",
}: {
  kicker: string;
  title: string;
  sub?: string;
  /** `plain` — editorial top matter, no card chrome (research reads like an article). */
  variant?: "card" | "plain";
}) {
  const { colors } = useTheme();
  if (variant === "plain") {
    return (
      <View style={styles.heroPlain}>
        <PemText style={[styles.heroKicker, { color: colors.textSecondary }]}>{kicker}</PemText>
        <PemText style={[styles.heroTitle, { color: colors.textPrimary }]}>{title}</PemText>
        {sub?.trim() ? (
          <PemText variant="caption" style={[styles.heroSub, { color: colors.textTertiary }]}>
            {sub}
          </PemText>
        ) : null}
      </View>
    );
  }
  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.borderMuted,
        },
      ]}
    >
      <PemText style={[styles.heroKicker, { color: colors.pemAmber }]}>{kicker}</PemText>
      <PemText style={[styles.heroTitle, { color: colors.textPrimary }]}>{title}</PemText>
      {sub?.trim() ? (
        <PemText variant="caption" style={[styles.heroSub, { color: colors.textSecondary }]}>
          {sub}
        </PemText>
      ) : null}
    </View>
  );
}

function ComparisonSwipe({ prep }: { prep: NonNullable<Prep["comparisonCard"]> }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const pageW = Math.min(width - space[6] * 2, 320);
  return (
    <View style={styles.root}>
      <Hero kicker="Compare" title={prep.winnerReason || "Side by side"} sub={prep.query} />
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={pageW + space[3]}
        decelerationRate="fast"
        contentContainerStyle={[styles.hScroll, { paddingRight: space[4] }]}
      >
        {prep.options.map((o, i) => (
          <View
            key={`${o.name}-${i}`}
            style={[
              styles.compareTile,
              {
                width: pageW,
                backgroundColor: colors.cardBackground,
                borderColor: colors.borderMuted,
                ...Platform.select({
                  ios: {
                    shadowColor: "#1c1a16",
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.08,
                    shadowRadius: 16,
                  },
                  android: { elevation: 2 },
                }),
              },
            ]}
          >
            <View style={styles.compareHead}>
              <GitCompare size={18} stroke={colors.pemAmber} strokeWidth={2.25} />
              <PemText variant="caption" style={{ color: colors.pemAmber }}>
                Option {i + 1}
              </PemText>
            </View>
            <RemoteImageOrPlaceholder
              uri={o.logo.trim()}
              resizeMode="contain"
              style={[styles.logoImg, { backgroundColor: colors.secondarySurface }]}
              placeholderStyle={{ backgroundColor: colors.secondarySurface }}
            />
            <PemText style={[styles.tileTitle, { color: colors.textPrimary }]}>{o.name}</PemText>
            {o.price.trim() ? (
              <PemText style={{ color: colors.textSecondary }}>{o.price}</PemText>
            ) : null}
            {prep.criteria.map((c) => (
              <PemText key={c} variant="caption" style={{ color: colors.textSecondary }}>
                {c}: {o.scores[c] != null ? `${o.scores[c]}/5` : "—"}
              </PemText>
            ))}
            {o.bestFor.trim() ? (
              <PemText variant="caption" style={{ color: colors.textPrimary, marginTop: space[2] }}>
                Best for: {o.bestFor}
              </PemText>
            ) : null}
            {o.pros.length > 0 ? (
              <View style={{ marginTop: space[2] }}>
                <PemText variant="caption" style={{ color: colors.textSecondary }}>
                  Pros
                </PemText>
                {o.pros.map((l, j) => (
                  <PemText key={`p-${j}`} variant="caption" style={{ color: colors.textPrimary }}>
                    + {l}
                  </PemText>
                ))}
              </View>
            ) : null}
            {o.cons.length > 0 ? (
              <View style={{ marginTop: space[2] }}>
                <PemText variant="caption" style={{ color: colors.textSecondary }}>
                  Cons
                </PemText>
                {o.cons.map((l, j) => (
                  <PemText key={`c-${j}`} variant="caption" style={{ color: colors.textSecondary }}>
                    – {l}
                  </PemText>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
      <View style={[styles.winnerBar, { backgroundColor: colors.secondarySurface, borderColor: colors.borderMuted }]}>
        <PemText variant="caption" style={{ color: colors.pemAmber }}>
          Winner
        </PemText>
        <PemText style={[styles.winnerName, { color: colors.textPrimary }]}>{prep.winner}</PemText>
      </View>
    </View>
  );
}

function ResearchArticle({ prep }: { prep: NonNullable<Prep["researchCard"]> }) {
  const { colors } = useTheme();
  return (
    <View style={styles.researchArticleRoot}>
      <Hero variant="plain" kicker="Research" title={prep.topic || "Findings"} sub={prep.lastUpdated} />
      <View style={styles.researchLead}>
        <PemMarkdown variant="body" selectable>
          {prep.executiveSummary}
        </PemMarkdown>
      </View>
      {prep.keyFacts.length > 0 ? (
        <View style={styles.researchFacts}>
          <PemText style={[styles.researchLabel, { color: colors.textSecondary }]}>Key facts</PemText>
          <View style={styles.researchFactList}>
            {prep.keyFacts.map((f, i) => (
              <View key={i} style={styles.researchFactLine}>
                <PemText style={[styles.researchFactBullet, { color: colors.textTertiary }]}>•</PemText>
                <PemText selectable style={[styles.researchFactText, { color: colors.textPrimary }]}>
                  {f}
                </PemText>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {(prep.sections ?? []).map((s, i) =>
        s.title.trim() || s.content.trim() ? (
          <View key={i} style={styles.researchSection}>
            {s.title.trim() ? (
              <PemText style={[styles.researchSectionHeading, { color: colors.textPrimary }]}>
                {s.title}
              </PemText>
            ) : null}
            <PemMarkdown variant="body" selectable>
              {s.content}
            </PemMarkdown>
          </View>
        ) : null,
      )}
      {prep.sources.length > 0 ? (
        <View style={styles.researchSources}>
          <PemText style={[styles.researchLabel, { color: colors.textSecondary }]}>Sources</PemText>
          <View style={styles.researchSourceList}>
            {prep.sources.map((s, i) => (
              <Pressable
                key={i}
                onPress={() => void openExternalUrl(s.url)}
                style={({ pressed }) => [styles.researchSourceRow, { opacity: pressed ? 0.75 : 1 }]}
              >
                <ExternalLink size={15} stroke={colors.textTertiary} strokeWidth={2} />
                <PemText
                  style={[
                    styles.researchSourceText,
                    {
                      color: colors.textPrimary,
                      textDecorationColor: colors.borderMuted,
                    },
                  ]}
                  numberOfLines={3}
                >
                  {s.title || s.url}
                </PemText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PersonAvatar({ uri }: { uri: string }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const normalized = normalizeRemoteImageUri(uri);
  const blocked = isLikelyBlockedRemoteImageUrl(normalized);
  if (!normalized || blocked || failed) {
    return (
      <View style={[styles.avatar, styles.avatarPh, { backgroundColor: colors.secondarySurface }]}>
        <User size={32} stroke={colors.textSecondary} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: normalized }}
      style={[styles.avatar, { backgroundColor: colors.secondarySurface }]}
      onError={() => setFailed(true)}
    />
  );
}

function PersonCard({ prep }: { prep: NonNullable<Prep["personCard"]> }) {
  const { colors } = useTheme();
  const links = useMemo(
    () =>
      [
        { label: "LinkedIn", url: prep.linkedin.trim() },
        { label: "X / Twitter", url: prep.twitter.trim() },
        { label: "Website", url: prep.website.trim() },
      ].filter((x) => x.url.length > 0),
    [prep.linkedin, prep.twitter, prep.website],
  );
  return (
    <View style={styles.root}>
      <View
        style={[
          styles.profileCard,
          { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted },
        ]}
      >
        <View style={styles.profileRow}>
          {prep.photo.trim() ? (
            <PersonAvatar uri={prep.photo} />
          ) : (
            <View style={[styles.avatar, styles.avatarPh, { backgroundColor: colors.secondarySurface }]}>
              <User size={32} stroke={colors.textSecondary} />
            </View>
          )}
          <View style={{ flex: 1, gap: space[1] }}>
            <PemText style={[styles.profileName, { color: colors.textPrimary }]}>{prep.name}</PemText>
            <PemText variant="caption" style={{ color: colors.textSecondary }}>
              {prep.title}
              {prep.company.trim() ? ` · ${prep.company}` : ""}
            </PemText>
            {prep.location.trim() ? (
              <PemText variant="caption" style={{ color: colors.textSecondary }}>
                {prep.location}
              </PemText>
            ) : null}
          </View>
        </View>
        {prep.companyLogo.trim() ? (
          <RemoteImageOrPlaceholder
            uri={prep.companyLogo.trim()}
            resizeMode="contain"
            style={[styles.companyLogo, { backgroundColor: colors.secondarySurface }]}
            placeholderStyle={{ backgroundColor: colors.secondarySurface }}
          />
        ) : null}
        {prep.bio.trim() ? (
          <PemMarkdown variant="companion" selectable style={{ marginTop: space[3] }}>
            {prep.bio}
          </PemMarkdown>
        ) : null}
        {prep.recentActivity.length > 0 ? (
          <View style={{ marginTop: space[3] }}>
            <PemText variant="caption" style={{ color: colors.textSecondary }}>
              Recent
            </PemText>
            {prep.recentActivity.map((l, i) => (
              <PemText key={i} variant="caption" style={{ color: colors.textPrimary }}>
                • {l}
              </PemText>
            ))}
          </View>
        ) : null}
        {prep.pemNote.trim() ? (
          <PemText variant="caption" style={{ marginTop: space[2], color: colors.pemAmber }}>
            {prep.pemNote}
          </PemText>
        ) : null}
        {links.map((l) => (
          <Pressable
            key={l.label}
            onPress={() => void openExternalUrl(l.url)}
            style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.85 : 1, borderColor: colors.borderMuted }]}
          >
            <ExternalLink size={16} stroke={colors.pemAmber} />
            <PemText style={{ color: colors.pemAmber }}>{l.label}</PemText>
            <ChevronRight size={16} stroke={colors.textSecondary} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function MeetingBrief({ prep }: { prep: NonNullable<Prep["meetingBrief"]> }) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Hero kicker="Meeting brief" title={prep.meetingWith} sub={prep.company} />
      <View style={[styles.briefGrid, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}>
        {prep.photo.trim() ? (
          <RemoteImageOrPlaceholder
            uri={prep.photo.trim()}
            style={styles.briefPhoto}
            placeholderStyle={{ backgroundColor: colors.secondarySurface }}
          />
        ) : null}
        <PemText style={{ color: colors.textPrimary, fontFamily: fontFamily.sans.semibold }}>Company</PemText>
        <PemMarkdown variant="companion" selectable>
          {prep.about}
        </PemMarkdown>
        <PemText style={{ color: colors.textPrimary, fontFamily: fontFamily.sans.semibold, marginTop: space[3] }}>
          Person
        </PemText>
        <PemMarkdown variant="companion" selectable>
          {prep.personBackground}
        </PemMarkdown>
      </View>
      {prep.recentNews.length > 0 ? (
        <View style={styles.listBlock}>
          <PemText variant="caption" style={{ color: colors.textSecondary }}>
            Recent news
          </PemText>
          {prep.recentNews.map((n, i) => (
            <PemText key={i} style={{ color: colors.textPrimary }}>
              • {n}
            </PemText>
          ))}
        </View>
      ) : null}
      {prep.suggestedTalkingPoints.length > 0 ? (
        <View style={styles.listBlock}>
          <PemText variant="caption" style={{ color: colors.textSecondary }}>
            Talking points
          </PemText>
          {prep.suggestedTalkingPoints.map((n, i) => (
            <PemText key={i} style={{ color: colors.textPrimary }}>
              {i + 1}. {n}
            </PemText>
          ))}
        </View>
      ) : null}
      {prep.thingsToAvoid.length > 0 ? (
        <View style={styles.listBlock}>
          <PemText variant="caption" style={{ color: colors.textSecondary }}>
            Avoid
          </PemText>
          {prep.thingsToAvoid.map((n, i) => (
            <PemText key={i} style={{ color: colors.textSecondary }}>
              • {n}
            </PemText>
          ))}
        </View>
      ) : null}
      {prep.pemNote.trim() ? (
        <PemText variant="caption" style={{ color: colors.pemAmber }}>
          {prep.pemNote}
        </PemText>
      ) : null}
    </View>
  );
}

function DecisionVerdict({ prep }: { prep: NonNullable<Prep["decisionCard"]> }) {
  const { colors } = useTheme();
  const confColor =
    prep.confidence === "high"
      ? colors.pemAmber
      : prep.confidence === "low"
        ? colors.textSecondary
        : colors.textPrimary;
  return (
    <View style={styles.root}>
      <View style={[styles.verdictBox, { backgroundColor: colors.cardBackground, borderColor: colors.pemAmber }]}>
        <View style={styles.verdictRow}>
          <Scale size={22} stroke={colors.pemAmber} strokeWidth={2.25} />
          <PemText variant="caption" style={{ color: colors.pemAmber }}>
            Verdict
          </PemText>
        </View>
        <PemText style={[styles.verdictText, { color: colors.textPrimary }]}>{prep.verdict}</PemText>
        <PemText variant="caption" style={{ color: confColor }}>
          Confidence: {prep.confidence}
        </PemText>
      </View>
      <PemMarkdown variant="companion" selectable>
        {prep.verdictReason}
      </PemMarkdown>
      {prep.keyData.length > 0 ? (
        <View style={styles.listBlock}>
          <PemText variant="caption" style={{ color: colors.textSecondary }}>
            Data points
          </PemText>
          {prep.keyData.map((k, i) => (
            <PemText key={i} style={{ color: colors.textPrimary }}>
              • {k}
            </PemText>
          ))}
        </View>
      ) : null}
      {prep.options.map((o, i) => (
        <View
          key={i}
          style={[styles.optBlock, { backgroundColor: colors.secondarySurface, borderColor: colors.borderMuted }]}
        >
          <PemText style={{ color: colors.textPrimary, fontFamily: fontFamily.display.semibold }}>{o.name}</PemText>
          {o.pros.map((p, j) => (
            <PemText key={`p-${j}`} variant="caption" style={{ color: colors.textPrimary }}>
              + {p}
            </PemText>
          ))}
          {o.cons.map((p, j) => (
            <PemText key={`c-${j}`} variant="caption" style={{ color: colors.textSecondary }}>
              – {p}
            </PemText>
          ))}
        </View>
      ))}
    </View>
  );
}

function LegalFinancial({ prep }: { prep: NonNullable<Prep["legalFinancialCard"]> }) {
  const { colors } = useTheme();
  const [plain, setPlain] = useState(true);
  return (
    <View style={styles.root}>
      <Hero kicker="Legal & money" title={prep.topic} sub="" />
      <View style={styles.toggleRow}>
        <Pressable
          onPress={() => setPlain(true)}
          style={[
            styles.toggleBtn,
            {
              borderColor: colors.borderMuted,
              backgroundColor: plain ? colors.secondarySurface : colors.cardBackground,
            },
          ]}
        >
          <PemText style={{ color: plain ? colors.pemAmber : colors.textSecondary }}>Plain English</PemText>
        </Pressable>
        <Pressable
          onPress={() => setPlain(false)}
          style={[
            styles.toggleBtn,
            {
              borderColor: colors.borderMuted,
              backgroundColor: !plain ? colors.secondarySurface : colors.cardBackground,
            },
          ]}
        >
          <Gavel size={16} stroke={colors.textSecondary} />
          <PemText style={{ color: !plain ? colors.pemAmber : colors.textSecondary }}>Detail</PemText>
        </Pressable>
      </View>
      {plain ? (
        <View style={[styles.article, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}>
          <PemMarkdown variant="body" selectable>
            {prep.plainEnglish}
          </PemMarkdown>
        </View>
      ) : (
        prep.clauses.map((c, i) =>
          c.title.trim() || c.text.trim() ? (
            <View key={i} style={styles.section}>
              {c.title.trim() ? (
                <PemText style={[styles.sectionTitle, { color: colors.textPrimary }]}>{c.title}</PemText>
              ) : null}
              <PemMarkdown variant="body" selectable>
                {c.text}
              </PemMarkdown>
            </View>
          ) : null,
        )
      )}
      {prep.caveats.length > 0 ? (
        <View style={[styles.callout, { backgroundColor: colors.secondarySurface, borderColor: colors.borderMuted }]}>
          {prep.caveats.map((c, i) => (
            <PemText key={i} variant="caption" style={{ color: colors.textSecondary }}>
              {c}
            </PemText>
          ))}
        </View>
      ) : null}
      {prep.sources.length > 0 ? (
        <View style={styles.sources}>
          {prep.sources.map((s, i) => (
            <Pressable key={i} onPress={() => void openExternalUrl(s.url)} style={styles.sourceRow}>
              <ExternalLink size={14} stroke={colors.pemAmber} />
              <PemText style={[styles.sourceLink, { color: colors.pemAmber }]} numberOfLines={2}>
                {s.title || s.url}
              </PemText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ExplainCard({ prep }: { prep: NonNullable<Prep["explainCard"]> }) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Hero kicker="Explained" title={prep.concept} sub={prep.tldr} />
      <View style={[styles.article, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}>
        <PemMarkdown variant="body" selectable>
          {prep.explanation}
        </PemMarkdown>
      </View>
      {prep.steps.length > 0 ? (
        <View style={styles.listBlock}>
          <PemText variant="caption" style={{ color: colors.textSecondary }}>
            Steps
          </PemText>
          {prep.steps.map((s, i) => (
            <PemText key={i} style={{ color: colors.textPrimary }}>
              {i + 1}. {s}
            </PemText>
          ))}
        </View>
      ) : null}
      {prep.analogy.trim() ? (
        <View style={[styles.callout, { backgroundColor: colors.secondarySurface, borderColor: colors.borderMuted }]}>
          <PemText variant="caption" style={{ color: colors.textSecondary }}>
            Analogy
          </PemText>
          <PemMarkdown variant="companion" selectable>
            {prep.analogy}
          </PemMarkdown>
        </View>
      ) : null}
      {prep.commonMistakes.length > 0 ? (
        <View style={styles.listBlock}>
          <PemText variant="caption" style={{ color: colors.textSecondary }}>
            Common mistakes
          </PemText>
          {prep.commonMistakes.map((s, i) => (
            <PemText key={i} style={{ color: colors.textSecondary }}>
              • {s}
            </PemText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SummaryCard({ prep }: { prep: NonNullable<Prep["summaryCard"]> }) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Hero kicker="Summary" title={prep.sourceTitle || "Highlights"} sub={prep.readingTime} />
      {prep.pullQuote.trim() ? (
        <View style={[styles.quote, { borderLeftColor: colors.pemAmber, backgroundColor: colors.secondarySurface }]}>
          <PemText style={[styles.quoteText, { color: colors.textPrimary }]}>&ldquo;{prep.pullQuote}&rdquo;</PemText>
        </View>
      ) : null}
      <PemText style={{ color: colors.textPrimary, fontFamily: fontFamily.display.semibold }}>{prep.tldr}</PemText>
      <View style={styles.listBlock}>
        {prep.keyPoints.map((k, i) => (
          <View key={i} style={[styles.factRow, { borderLeftColor: colors.pemAmber }]}>
            <PemText style={{ color: colors.textPrimary }}>{k}</PemText>
          </View>
        ))}
      </View>
      {prep.sourceUrl.trim() ? (
        <Pressable onPress={() => void openExternalUrl(prep.sourceUrl)} style={styles.sourceRow}>
          <ExternalLink size={16} stroke={colors.pemAmber} />
          <PemText style={{ color: colors.pemAmber }} numberOfLines={1}>
            Open source
          </PemText>
        </Pressable>
      ) : null}
    </View>
  );
}

function IdeaSwipe({ prep }: { prep: NonNullable<Prep["ideaCards"]> }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const pageW = Math.min(width - space[6] * 2, 300);
  return (
    <View style={styles.root}>
      <Hero kicker="Ideas" title={prep.context || "Angles to try"} sub="" />
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={pageW + space[3]}
        decelerationRate="fast"
        contentContainerStyle={[styles.hScroll, { paddingRight: space[4] }]}
      >
        {prep.ideas.map((idea, i) => (
          <View
            key={`${idea.title}-${i}`}
            style={[
              styles.ideaTile,
              {
                width: pageW,
                backgroundColor: colors.cardBackground,
                borderColor: colors.borderMuted,
              },
            ]}
          >
            <View style={styles.compareHead}>
              <StickyNote size={18} stroke={colors.pemAmber} />
              <PemText variant="caption" style={{ color: colors.pemAmber }}>
                Idea {i + 1}
              </PemText>
            </View>
            <PemText style={[styles.tileTitle, { color: colors.textPrimary }]}>{idea.title}</PemText>
            {idea.hook.trim() ? (
              <PemText style={{ color: colors.textSecondary, fontStyle: "italic" }}>{idea.hook}</PemText>
            ) : null}
            {idea.angle.trim() ? (
              <PemMarkdown variant="companion" selectable>
                {idea.angle}
              </PemMarkdown>
            ) : null}
            {idea.format.trim() ? (
              <PemText variant="caption" style={{ color: colors.pemAmber, marginTop: space[2] }}>
                {idea.format}
              </PemText>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Renders the single adaptive layout for this prep (one schema at a time). */
export default function PrepAdaptiveStack({ prep, prepTitle, sharePlainText, onPrepRefresh }: Props) {
  const { colors } = useTheme();
  const share =
    sharePlainText.trim().length > 0 ? (
      <View style={[styles.shareFooter, { borderTopColor: colors.borderMuted }]}>
        <PrepShareRow variant="compact" text={sharePlainText.trim()} shareTitle={prepTitle} />
      </View>
    ) : null;

  if (prep.shoppingCard) {
    return (
      <View>
        <PrepShoppingExperience data={prep.shoppingCard} prepTitle={prepTitle} sharePlainText={sharePlainText} />
      </View>
    );
  }
  if (prep.placeCard) {
    return (
      <View>
        <PrepPlaceExperience data={prep.placeCard} prepTitle={prepTitle} sharePlainText={sharePlainText} />
      </View>
    );
  }
  if (prep.draftCard) {
    return (
      <View>
        <PrepDraftDocument data={prep.draftCard} prepTitle={prepTitle} sharePlainText={sharePlainText} />
      </View>
    );
  }
  if (prep.comparisonCard) {
    return (
      <View style={styles.wrap}>
        <ComparisonSwipe prep={prep.comparisonCard} />
        {share}
      </View>
    );
  }
  if (prep.researchCard) {
    return (
      <View style={styles.wrap}>
        <ResearchArticle prep={prep.researchCard} />
        {share}
      </View>
    );
  }
  if (prep.personCard) {
    return (
      <View style={styles.wrap}>
        <PersonCard prep={prep.personCard} />
        {share}
      </View>
    );
  }
  if (prep.meetingBrief) {
    return (
      <View style={styles.wrap}>
        <MeetingBrief prep={prep.meetingBrief} />
        {share}
      </View>
    );
  }
  if (prep.decisionCard) {
    return (
      <View style={styles.wrap}>
        <DecisionVerdict prep={prep.decisionCard} />
        {share}
      </View>
    );
  }
  if (prep.legalFinancialCard) {
    return (
      <View style={styles.wrap}>
        <LegalFinancial prep={prep.legalFinancialCard} />
        {share}
      </View>
    );
  }
  if (prep.explainCard) {
    return (
      <View style={styles.wrap}>
        <ExplainCard prep={prep.explainCard} />
        {share}
      </View>
    );
  }
  if (prep.summaryCard) {
    return (
      <View style={styles.wrap}>
        <SummaryCard prep={prep.summaryCard} />
        {share}
      </View>
    );
  }
  if (prep.ideaCards) {
    return (
      <View style={styles.wrap}>
        <IdeaSwipe prep={prep.ideaCards} />
        {share}
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  root: { gap: space[4] },
  wrap: { gap: space[4] },
  heroPlain: {
    gap: space[2],
    marginBottom: space[2],
  },
  hero: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[1],
  },
  heroKicker: {
    fontFamily: fontFamily.sans.semibold,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontSize: fontSize.xs,
  },
  heroTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize["2xl"],
    lineHeight: lh(fontSize["2xl"], lineHeight.snug),
  },
  heroSub: { marginTop: space[1] },
  hScroll: { gap: space[3], paddingVertical: space[1] },
  compareTile: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[2],
  },
  compareHead: { flexDirection: "row", alignItems: "center", gap: space[2] },
  tileTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
  },
  logoImg: { width: 120, height: 40, marginVertical: space[2] },
  winnerBar: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[3],
    gap: space[1],
  },
  winnerName: { fontFamily: fontFamily.display.semibold, fontSize: fontSize.lg },
  article: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
  },
  /** Adaptive research_card — continuous reading, no inset cards. */
  researchArticleRoot: { gap: space[6] },
  researchLead: {
    gap: space[3],
  },
  researchLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.35,
    textTransform: "uppercase",
    marginBottom: space[2],
  },
  researchFacts: { gap: 0 },
  researchFactList: { gap: space[3] },
  researchFactLine: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  researchFactBullet: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    marginTop: 1,
  },
  researchFactText: {
    flex: 1,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
  },
  researchSection: {
    gap: space[3],
    paddingTop: space[1],
  },
  researchSectionHeading: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
  },
  researchSources: { gap: 0, marginTop: space[1] },
  researchSourceList: { gap: space[3] },
  researchSourceRow: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  researchSourceText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
    textDecorationLine: "underline",
  },
  facts: { gap: space[2] },
  factRow: {
    borderLeftWidth: 3,
    paddingLeft: space[3],
  },
  sectionLabel: {
    fontFamily: fontFamily.sans.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: space[1],
  },
  section: { gap: space[2] },
  sectionTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.md,
  },
  sources: { gap: space[2] },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  sourceLink: { flex: 1, fontFamily: fontFamily.sans.medium, fontSize: fontSize.sm },
  profileCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[2],
  },
  profileRow: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  avatar: { width: 72, height: 72, borderRadius: radii.lg },
  avatarPh: { alignItems: "center", justifyContent: "center" },
  profileName: { fontFamily: fontFamily.display.semibold, fontSize: fontSize["2xl"] },
  companyLogo: { width: 100, height: 32, marginTop: space[2] },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: space[2],
  },
  briefGrid: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[2],
  },
  briefPhoto: { width: "100%", height: 140, borderRadius: radii.md, marginBottom: space[2] },
  listBlock: { gap: space[1] },
  verdictBox: {
    borderRadius: radii.lg,
    borderWidth: 2,
    padding: space[4],
    gap: space[2],
  },
  verdictRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  verdictText: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize["2xl"],
    lineHeight: lh(fontSize["2xl"], lineHeight.snug),
  },
  optBlock: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[3],
    gap: space[1],
  },
  toggleRow: { flexDirection: "row", gap: space[2] },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[1],
    paddingVertical: space[2],
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  callout: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[3],
    gap: space[1],
  },
  quote: {
    borderLeftWidth: 4,
    padding: space[4],
    borderRadius: radii.md,
  },
  quoteText: {
    fontFamily: fontFamily.display.medium,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.relaxed),
    fontStyle: "italic",
  },
  ideaTile: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
    gap: space[2],
  },
  shareFooter: {
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
});
