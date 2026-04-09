import PemText from "@/components/ui/PemText";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@clerk/expo";
import { router } from "expo-router";
import { ArrowLeft, Check, Clock, Target } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch } from "@/lib/pemApi";

const HOUR_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10];
const TIME_PREFS: { value: "morning" | "afternoon"; label: string; desc: string }[] = [
  { value: "morning", label: "Mornings", desc: "Before lunch" },
  { value: "afternoon", label: "Afternoons", desc: "After lunch" },
];

export default function FocusTimeSettings() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [hours, setHours] = useState(4);
  const [prefTime, setPrefTime] = useState<"morning" | "afternoon">("morning");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch<{
      focus_hours_per_week: number | null;
      preferences: { focus_time_pref?: string } | null;
    }>("/users/me", { getToken: () => getTokenRef.current() })
      .then((r) => {
        if (r.focus_hours_per_week) setHours(r.focus_hours_per_week);
        if (r.preferences?.focus_time_pref === "afternoon") setPrefTime("afternoon");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await apiFetch("/users/me/focus-time", {
        method: "PATCH",
        getToken: () => getTokenRef.current(),
        body: JSON.stringify({ hours, preferred_time: prefTime }),
      });
      router.back();
    } catch {
      /* ignore */
    }
    setSaving(false);
  }, [hours, prefTime]);

  if (!loaded) return null;

  return (
    <View style={[styles.root, { backgroundColor: colors.pageBackground, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <ArrowLeft size={22} stroke={colors.textPrimary} strokeWidth={2} />
        </Pressable>
        <PemText variant="title" style={{ flex: 1, textAlign: "center" }}>
          Focus Time
        </PemText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[8] }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.iconCircle, { backgroundColor: pemAmber + "18" }]}>
          <Target size={32} color={pemAmber} />
        </View>

        <PemText variant="bodyMuted" style={styles.intro}>
          Pem will find and block distraction-free time on your calendar each week.
        </PemText>

        <PemText variant="label" style={styles.sectionLabel}>Hours per week</PemText>
        <View style={styles.chipGrid}>
          {HOUR_OPTIONS.map((h) => (
            <Pressable
              key={h}
              onPress={() => setHours(h)}
              style={[
                styles.chip,
                {
                  backgroundColor: hours === h ? pemAmber : colors.cardBackground,
                  borderColor: hours === h ? pemAmber : colors.borderMuted,
                },
              ]}
            >
              <PemText
                style={[
                  styles.chipText,
                  { color: hours === h ? "#fff" : colors.textPrimary },
                ]}
              >
                {h}h
              </PemText>
            </Pressable>
          ))}
        </View>

        <PemText variant="label" style={styles.sectionLabel}>Preferred time</PemText>
        <View
          style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}
        >
          {TIME_PREFS.map((p, i) => (
            <View key={p.value}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: colors.borderMuted }]} />}
              <Pressable
                onPress={() => setPrefTime(p.value)}
                style={styles.prefRow}
              >
                <Clock size={20} stroke={colors.textSecondary} strokeWidth={1.8} />
                <View style={{ flex: 1 }}>
                  <PemText variant="body" style={{ color: colors.textPrimary }}>{p.label}</PemText>
                  <PemText variant="caption" style={{ color: colors.textSecondary }}>{p.desc}</PemText>
                </View>
                {prefTime === p.value && <Check size={20} stroke={pemAmber} strokeWidth={2.5} />}
              </Pressable>
            </View>
          ))}
        </View>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, saving && { opacity: 0.5 }]}
        >
          <PemText style={styles.saveBtnText}>
            {saving ? "Saving..." : "Save"}
          </PemText>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[3],
    paddingVertical: space[3],
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  content: { paddingHorizontal: space[5], alignItems: "center" },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginTop: space[4],
    marginBottom: space[4],
  },
  intro: { textAlign: "center", marginBottom: space[6], lineHeight: 22 },
  sectionLabel: { alignSelf: "flex-start", marginBottom: space[3] },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: space[6],
    justifyContent: "center",
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  chipText: { fontFamily: fontFamily.sans.medium, fontSize: fontSize.sm },
  card: { borderRadius: radii.lg, borderWidth: 1, padding: space[3], width: "100%", marginBottom: space[6] },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[2],
  },
  divider: { height: StyleSheet.hairlineWidth },
  saveBtn: {
    backgroundColor: pemAmber,
    paddingHorizontal: space[8],
    paddingVertical: 14,
    borderRadius: radii.lg,
    alignItems: "center",
    marginTop: space[2],
  },
  saveBtnText: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.base,
    color: "#fff",
  },
});
