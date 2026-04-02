import TimedFactFields from "@/components/sections/settings-sections/TimedFactFields";
import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import PemTextField from "@/components/ui/PemTextField";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import type { ApiProfileFact } from "@/lib/pemApi";
import {
  emptyTimedValue,
  normalizeProfileKey,
  parseTimedValue,
  serializeTimedValue,
  tryParseTimedForEdit,
  type TimedProfileValue,
} from "@/lib/profileTimed";
import { X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Mode = "add" | "edit";

type Props = {
  visible: boolean;
  mode: Mode;
  fact: ApiProfileFact | null;
  onClose: () => void;
  onSave: (payload: { id?: string; key: string; value: string }) => Promise<void>;
};

function displayKeyFromStored(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sanitizeTimed(v: TimedProfileValue): TimedProfileValue {
  return {
    ...v,
    previous: v.previous.filter(
      (p) => p.value.trim() && p.from.trim() && p.to.trim(),
    ),
  };
}

export default function ProfileFactEditorModal({ visible, mode, fact, onClose, onSave }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [keyText, setKeyText] = useState("");
  const [valueText, setValueText] = useState("");
  const [timedState, setTimedState] = useState<TimedProfileValue>(() => emptyTimedValue());
  const [useTimedHistory, setUseTimedHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setError(null);
    if (mode === "edit" && fact) {
      setKeyText(displayKeyFromStored(fact.key));
      const parsed = tryParseTimedForEdit(fact.value);
      if (parsed) {
        setTimedState(parsed);
        setUseTimedHistory(true);
        setValueText("");
      } else {
        setUseTimedHistory(false);
        setValueText(fact.value);
        setTimedState(emptyTimedValue());
      }
    } else {
      setKeyText("");
      setValueText("");
      setTimedState(emptyTimedValue());
      setUseTimedHistory(false);
    }
  }, [visible, mode, fact]);

  const onToggleTimedHistory = useCallback(
    (next: boolean) => {
      if (next) {
        setTimedState(parseTimedValue(valueText.trim()));
      } else {
        setValueText(timedState.current.trim());
        setTimedState(emptyTimedValue());
      }
      setUseTimedHistory(next);
    },
    [valueText, timedState],
  );

  const submit = useCallback(async () => {
    setError(null);
    const k = keyText.trim();
    if (!k) {
      setError("Add a short label (e.g. Location or Work).");
      return;
    }
    const nk = normalizeProfileKey(k);
    if (!nk) {
      setError("Use letters or numbers in the label.");
      return;
    }
    setSaving(true);
    try {
      if (useTimedHistory) {
        const sanitized = sanitizeTimed(timedState);
        if (!sanitized.current.trim()) {
          setError("Set the current value.");
          setSaving(false);
          return;
        }
        await onSave({
          id: mode === "edit" && fact ? fact.id : undefined,
          key: nk,
          value: serializeTimedValue(sanitized),
        });
      } else {
        const v = valueText.trim();
        if (!v) {
          setError("Add a value.");
          setSaving(false);
          return;
        }
        await onSave({
          id: mode === "edit" && fact ? fact.id : undefined,
          key: nk,
          value: v,
        });
      }
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.replace(/^HTTP \d+\s*/, "").slice(0, 280));
    } finally {
      setSaving(false);
    }
  }, [keyText, valueText, timedState, useTimedHistory, mode, fact, onSave, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalFill}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.pageBackground,
                borderColor: colors.borderMuted,
                paddingBottom: Math.max(insets.bottom, space[4]),
              },
            ]}
          >
            <View style={styles.sheetHead}>
              <PemText style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                {mode === "add" ? "Add a fact" : "Edit fact"}
              </PemText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={8}
                style={({ pressed }) => [styles.closeHit, { opacity: pressed ? 0.75 : 1 }]}
              >
                <X size={22} stroke={colors.textSecondary} strokeWidth={2} />
              </Pressable>
            </View>
            <PemText variant="caption" style={[styles.hint, { color: colors.textSecondary }]}>
              {useTimedHistory
                ? "Optional time history: current value plus dated past periods when something changed."
                : "Short label (letters or spaces). Pem stores labels in a simple form (e.g. work_email)."}
            </PemText>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.form}
            >
              <PemTextField
                label="Label"
                placeholder="e.g. Location"
                value={keyText}
                onChangeText={setKeyText}
                editable={!saving}
                autoCapitalize="sentences"
                error={null}
              />
              <View style={styles.toggleRow}>
                <PemText style={[styles.toggleLabel, { color: colors.textPrimary }]}>
                  Include time history
                </PemText>
                <Switch
                  value={useTimedHistory}
                  onValueChange={onToggleTimedHistory}
                  disabled={saving}
                  trackColor={{ false: colors.borderMuted, true: colors.pemAmber }}
                  thumbColor={colors.cardBackground}
                />
              </View>
              {useTimedHistory ? (
                <TimedFactFields value={timedState} onChange={setTimedState} disabled={saving} />
              ) : (
                <PemTextField
                  label="What to remember"
                  placeholder="e.g. East Bay, usually free weekday evenings"
                  value={valueText}
                  onChangeText={setValueText}
                  editable={!saving}
                  multiline
                  style={styles.valueInput}
                  error={null}
                />
              )}
              {error ? (
                <PemText variant="caption" style={{ color: colors.error }}>
                  {error}
                </PemText>
              ) : null}
              <PemButton size="md" onPress={() => void submit().catch(() => {})} disabled={saving}>
                {saving ? "Saving…" : mode === "add" ? "Save" : "Update"}
              </PemButton>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalFill: {
    flex: 1,
  },
  flex: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: space[4],
    paddingTop: space[4],
    maxHeight: "92%",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[2],
  },
  sheetTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
    flex: 1,
  },
  closeHit: {
    padding: space[2],
  },
  hint: {
    marginBottom: space[4],
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  form: {
    gap: space[4],
    paddingBottom: space[6],
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
  },
  toggleLabel: {
    flex: 1,
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.md,
  },
  valueInput: {
    minHeight: 120,
    textAlignVertical: "top",
    paddingTop: space[3],
  },
});
