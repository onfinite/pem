/**
 * Shared “pick section” chrome — title row + short intro + optional meta, then tile picks.
 * No outer bordered card; only individual pick tiles are elevated.
 */
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

export const PICK_INTROS = {
  shopping:
    "Product listings from major retailers — tap a card to open the store page.",
  places: "Places from search and maps — tap a card to open in Maps or the website.",
  local: "Local businesses and services — tap a card for phone, website, or directions.",
  events: "Events and listings we found — tap a card for details or tickets.",
  flights: "Flight offers — tap a card to view booking options on the airline or OTA site.",
  trends: "Interest over time and related searches from trend data.",
  market: "Snapshot from finance sources — not investment advice.",
  jobs: "Job listings — tap through to apply on the employer or board site.",
} as const;

type HeaderProps = {
  icon: LucideIcon;
  /** Section title — sentence case, e.g. “Shopping”. */
  label: string;
  /** One or two lines of context (our copy or intent-specific). */
  intro: string;
  /** Optional line (e.g. search query). */
  meta?: string;
  /** Use amber icon like primary nav accents; muted matches Events/Hero legacy. */
  iconAccent?: "amber" | "muted";
};

export function PrepPickSectionHeader({
  icon: Icon,
  label,
  intro,
  meta,
  iconAccent = "amber",
}: HeaderProps) {
  const { colors } = useTheme();
  const stroke = iconAccent === "amber" ? colors.pemAmber : colors.textSecondary;
  return (
    <View style={styles.headerBlock}>
      <View style={styles.titleRow}>
        <Icon size={22} stroke={stroke} strokeWidth={2.25} />
        <PemText style={[styles.label, { color: colors.textPrimary }]}>{label}</PemText>
      </View>
      {intro.trim() ? (
        <PemText
          variant="caption"
          style={[styles.intro, { color: colors.textSecondary, lineHeight: lh(fontSize.sm, lineHeight.relaxed) }]}
        >
          {intro.trim()}
        </PemText>
      ) : null}
      {meta?.trim() ? (
        <PemText variant="caption" style={[styles.intro, { color: colors.textTertiary }]}>
          {meta.trim()}
        </PemText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    gap: space[2],
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  label: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
  },
  intro: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
  },
});
