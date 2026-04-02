import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import PemTextField from "@/components/ui/PemTextField";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import type { ApiProfileFact } from "@/lib/pemApi";
import { normalizeProfileKey } from "@/lib/profileTimed";
import { X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Mode = "add" | "edit";

type Props = {
  visible: boolean;
  mode: Mode;
  fact: ApiProfileFact | null;
  onClose: () => void;
  onSave: (payload: { id?: string; key: string; note: string }) => Promise<void>;
};

function displayKeyFromStored(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProfileFactEditorModal({ visible, mode, fact, onClose, onSave }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [keyText, setKeyText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setError(null);
    if (mode === "edit" && fact) {
      setKeyText(displayKeyFromStored(fact.memory_key));
      setNoteText(fact.note);
    } else {
      setKeyText("");
      setNoteText("");
    }
  }, [visible, mode, fact]);

  const submit = useCallback(async () => {
    setError(null);
    const k = keyText.trim();
    if (!k) {
      setError("Add a short label (e.g. Location or Car budget).");
      return;
    }
    const nk = normalizeProfileKey(k);
    if (!nk) {
      setError("Use letters or numbers in the label.");
      return;
    }
    const note = noteText.trim();
    if (!note) {
      setError("Add what Pem should remember (plain language).");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: mode === "edit" && fact ? fact.id : undefined,
        key: nk,
        note,
      });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.replace(/^HTTP \d+\s*/, "").slice(0, 280));
    } finally {
      setSaving(false);
    }
  }, [keyText, noteText, mode, fact, onSave, onClose]);

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
              Short topic label + a natural-language note. When something changes later, Pem keeps
              history — you’ll see older entries under Historical.
            </PemText>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
            >
              <PemTextField
                label="Topic"
                value={keyText}
                onChangeText={setKeyText}
                placeholder="e.g. Car, Location"
                editable={!saving}
                autoCapitalize="words"
              />
              <PemTextField
                label="What Pem should remember"
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Plain language — what a friend would recall about you."
                multiline
                editable={!saving}
                style={styles.noteField}
              />
              {error ? (
                <PemText variant="caption" style={{ color: colors.textSecondary }}>
                  {error}
                </PemText>
              ) : null}
              <PemButton
                size="md"
                onPress={() => void submit().catch(() => {})}
                disabled={saving}
                style={styles.saveBtn}
              >
                {saving ? "Saving…" : "Save"}
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
    justifyContent: "flex-end",
  },
  flex: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: "88%",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space[4],
    paddingTop: space[4],
    paddingBottom: space[2],
  },
  sheetTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
  },
  closeHit: {
    padding: space[2],
  },
  hint: {
    paddingHorizontal: space[4],
    marginBottom: space[2],
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    paddingHorizontal: space[4],
    gap: space[3],
    paddingBottom: space[4],
  },
  noteField: {
    minHeight: 120,
  },
  saveBtn: {
    marginTop: space[2],
  },
});
