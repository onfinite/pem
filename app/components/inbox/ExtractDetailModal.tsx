import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import type { InboxChrome } from "@/constants/inboxChrome";
import { fontSize, space } from "@/constants/typography";
import { pemAmber } from "@/constants/theme";
import type { ApiExtract } from "@/lib/pemApi";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  item: ApiExtract | null;
  chrome: InboxChrome;
  onClose: () => void;
  onDone: () => void;
  onDismiss: () => void;
};

export default function ExtractDetailModal({
  visible,
  item,
  chrome,
  onClose,
  onDone,
  onDismiss,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!item) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View
          style={[styles.sheet, { backgroundColor: chrome.surface, paddingBottom: insets.bottom + space[4] }]}
        >
          <View style={[styles.handle, { backgroundColor: chrome.borderStrong }]} />
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            <PemText variant="title" style={{ color: chrome.text, marginBottom: space[2] }}>
              {item.text}
            </PemText>
            <PemText variant="caption" style={{ color: chrome.textDim, marginBottom: space[3] }}>
              {item.tone} · {item.urgency}
            </PemText>
            {item.original_text ? (
              <View style={[styles.quote, { borderColor: chrome.border, backgroundColor: chrome.page }]}>
                <PemText variant="bodyMuted" style={{ color: chrome.textMuted, fontStyle: "italic" }}>
                  {item.original_text}
                </PemText>
              </View>
            ) : null}
            {item.pem_note ? (
              <View style={{ marginTop: space[4] }}>
                <PemText variant="caption" style={{ color: pemAmber, letterSpacing: 1, marginBottom: space[2] }}>
                  PEM
                </PemText>
                <PemText variant="bodyMuted" style={{ color: chrome.textMuted, lineHeight: 24 }}>
                  {item.pem_note}
                </PemText>
              </View>
            ) : null}
            {item.draft_text ? (
              <View style={{ marginTop: space[4] }}>
                <PemText variant="caption" style={{ marginBottom: space[1] }}>
                  Draft
                </PemText>
                <PemText variant="body" style={{ color: chrome.text, fontSize: fontSize.sm }}>
                  {item.draft_text}
                </PemText>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.actions}>
            <PemButton onPress={onDone}>I handled it</PemButton>
            <View style={{ height: space[2] }} />
            <PemButton variant="secondary" onPress={onDismiss}>
              Not relevant
            </PemButton>
            <View style={{ height: space[2] }} />
            <Pressable onPress={onClose} accessibilityRole="button" style={{ paddingVertical: space[3] }}>
              <PemText variant="bodyMuted" style={{ textAlign: "center" }}>
                Later
              </PemText>
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
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    maxHeight: "78%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: space[2],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: space[3],
  },
  scroll: {
    paddingHorizontal: space[5],
  },
  quote: {
    borderWidth: 1,
    borderRadius: 10,
    padding: space[3],
  },
  actions: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
});
