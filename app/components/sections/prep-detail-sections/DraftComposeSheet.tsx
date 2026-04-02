import PemText from "@/components/ui/PemText";
import type { ThemeSemantic } from "@/contexts/ThemeContext";
import { mailComposeChoicesForDisplay, openMailComposeUrl, type MailComposeChoice } from "@/lib/mailCompose";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  onClose: () => void;
  subject: string | null;
  body: string;
  colors: ThemeSemantic;
  resolved: "light" | "dark";
};

export default function DraftComposeSheet({
  visible,
  onClose,
  subject,
  body,
  colors,
  resolved,
}: Props) {
  const insets = useSafeAreaInsets();
  const [choices, setChoices] = useState<MailComposeChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setLoading(true);
    setError(null);
    setChoices([]);
    void mailComposeChoicesForDisplay(subject, body)
      .then(setChoices)
      .catch(() => setChoices([]))
      .finally(() => setLoading(false));
  }, [visible, subject, body]);

  const onPick = useCallback(
    async (c: MailComposeChoice) => {
      setError(null);
      setOpening(c.id);
      try {
        await openMailComposeUrl(c.url);
        onClose();
      } catch {
        setError(`Couldn’t open ${c.label}. Try Mail or copy the draft instead.`);
      } finally {
        setOpening(null);
      }
    },
    [onClose],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={[
            styles.backdrop,
            { backgroundColor: resolved === "dark" ? "rgba(0,0,0,0.55)" : "rgba(28,26,22,0.45)" },
          ]}
          onPress={onClose}
        />
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.borderMuted,
                paddingBottom: Math.max(insets.bottom, space[4]),
              },
            ]}
          >
            <View style={[styles.grabberZone, { backgroundColor: colors.cardBackground }]}>
              <View style={[styles.grabber, { backgroundColor: colors.borderMuted }]} />
            </View>
            <PemText style={[styles.sheetTitle, { color: colors.textPrimary }]}>Open draft in…</PemText>
            <PemText variant="caption" style={[styles.sheetHint, { color: colors.textSecondary }]}>
              Picks the app with the email ready to edit. If nothing opens, use Mail or Copy.
            </PemText>

            {loading ? (
              <ActivityIndicator style={{ marginVertical: space[5] }} color={colors.pemAmber} />
            ) : (
              <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.list}>
                  {choices.map((c) => {
                    const busy = opening === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Open in ${c.label}`}
                        disabled={busy}
                        onPress={() => void onPick(c)}
                        style={({ pressed }) => [
                          styles.row,
                          {
                            borderColor: colors.borderMuted,
                            backgroundColor: pressed ? colors.secondarySurface : colors.pageBackground,
                            opacity: busy ? 0.65 : 1,
                          },
                        ]}
                      >
                        <View style={styles.rowText}>
                          <PemText style={[styles.rowLabel, { color: colors.textPrimary }]}>{c.label}</PemText>
                          {c.description ? (
                            <PemText variant="caption" style={{ color: colors.textSecondary }}>
                              {c.description}
                            </PemText>
                          ) : null}
                        </View>
                        {busy ? (
                          <ActivityIndicator size="small" color={colors.pemAmber} />
                        ) : (
                          <ChevronRight size={20} stroke={colors.textSecondary} strokeWidth={2} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            {error ? (
              <PemText variant="caption" style={[styles.err, { color: colors.textSecondary }]}>
                {error}
              </PemText>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onClose}
              style={({ pressed }) => [
                styles.cancelBtn,
                { borderColor: colors.borderMuted, opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <PemText style={[styles.cancelLabel, { color: colors.textPrimary }]}>Cancel</PemText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetWrap: {
    maxHeight: "100%",
  },
  listScroll: {
    maxHeight: 280,
  },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: space[4],
    paddingTop: space[2],
    maxHeight: Platform.OS === "ios" ? "72%" : "80%",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  grabberZone: {
    alignItems: "center",
    paddingBottom: space[2],
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
    marginBottom: space[1],
  },
  sheetHint: {
    marginBottom: space[4],
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  list: {
    gap: space[2],
    marginBottom: space[4],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    borderRadius: radii.md,
    borderWidth: 1,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
  },
  err: {
    marginBottom: space[3],
    textAlign: "center",
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: space[4],
    borderRadius: radii.md,
    borderWidth: 1,
  },
  cancelLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
  },
});
