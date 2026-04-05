import type { PrepTab } from "@/components/sections/home-sections/homePrepData";
import { useInboxShell } from "@/constants/shellTokens";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { pemImpactLight } from "@/lib/pemHaptics";
import PemText from "@/components/ui/PemText";
import { Archive, ArchiveRestore, Trash2, X } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  count: number;
  tab: PrepTab;
  onCancel: () => void;
  /** Ready or Prepping tab — move to archive. */
  onArchive?: () => void | Promise<void>;
  /** Archived tab — restore to Ready. */
  onUnarchive?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  /** False when no selected prep can be deleted (no dump). */
  canDelete: boolean;
  /**
   * When set, overrides tab-based visibility (e.g. Starred tab with both ready and archived).
   * Omit to use defaults from `tab`.
   */
  showArchiveAction?: boolean;
  showUnarchiveAction?: boolean;
};

/**
 * Gmail-style hub toolbar while multi-select is active — replaces the search header.
 */
export default function InboxHubSelectionBar({
  count,
  tab,
  onCancel,
  onArchive,
  onUnarchive,
  onDelete,
  canDelete,
  showArchiveAction,
  showUnarchiveAction,
}: Props) {
  const s = useInboxShell();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const showArchive =
    showArchiveAction ?? (tab === "ready" || tab === "prepping" || tab === "done");
  const showUnarchive = showUnarchiveAction ?? tab === "archived";

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: s.bg }]}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel selection"
          hitSlop={10}
          onPress={() => {
            pemImpactLight();
            onCancel();
          }}
          style={({ pressed }) => [styles.iconHit, { opacity: pressed ? 0.72 : 1 }]}
        >
          <X size={22} color={s.textPrimary} strokeWidth={2.25} />
        </Pressable>

        <PemText
          numberOfLines={1}
          style={[styles.count, { color: s.textSecondary, flex: 1 }]}
        >
          {count === 1 ? "1 selected" : `${count} selected`}
        </PemText>

        {showArchive && onArchive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Archive selected preps"
            hitSlop={8}
            onPress={() => {
              pemImpactLight();
              void onArchive();
            }}
            style={({ pressed }) => [styles.iconHit, { opacity: pressed ? 0.72 : 1 }]}
          >
            <Archive size={22} color={s.textPrimary} strokeWidth={2.25} />
          </Pressable>
        ) : null}

        {showUnarchive && onUnarchive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restore selected preps"
            hitSlop={8}
            onPress={() => {
              pemImpactLight();
              void onUnarchive();
            }}
            style={({ pressed }) => [styles.iconHit, { opacity: pressed ? 0.72 : 1 }]}
          >
            <ArchiveRestore size={22} color={s.textPrimary} strokeWidth={2.25} />
          </Pressable>
        ) : null}

        {onDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete selected preps"
            hitSlop={8}
            disabled={!canDelete}
            onPress={() => {
              if (!canDelete) return;
              pemImpactLight();
              void onDelete();
            }}
            style={({ pressed }) => [
              styles.iconHit,
              { opacity: !canDelete ? 0.35 : pressed ? 0.72 : 1 },
            ]}
          >
            <Trash2 size={22} color={colors.error} strokeWidth={2.25} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space[4],
    paddingBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  iconHit: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.snug),
  },
});
