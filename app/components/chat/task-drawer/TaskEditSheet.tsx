import { useTheme } from "@/contexts/ThemeContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Modal, PanResponder, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EditSheetActions } from "./EditSheetActions";
import { EditSheetChipRow } from "./EditSheetChipRow";
import { EditSheetDateSection } from "./EditSheetDateSection";
import { DraftSection } from "./DraftSection";
import { PRIORITY_CHIPS, REMINDER_CHIPS, SWIPE_THRESHOLD, reminderIso, reminderKeyFor } from "./taskEditSheet.constants";
import { editSheetStyles as s } from "./taskEditSheet.styles";
import type { TaskEditSheetProps } from "./types";

export function TaskEditSheet({
  visible, extract, lists, onClose, onSave, onDone, onDismiss, onDelete,
}: TaskEditSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const [text, setText] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!extract) return;
    setText(extract.text);
    setNote(extract.pem_note ?? "");
    translateY.setValue(0);
  }, [extract, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > SWIPE_THRESHOLD) onCloseRef.current();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const listChips = useMemo(
    () => [...lists.map((l) => ({ key: l.id, label: l.name })), { key: "none", label: "No list" }],
    [lists],
  );

  if (!visible || !extract) return null;

  const save = (patch: Record<string, unknown>) => onSave(extract.id, patch);
  const isExternal = !extract.is_organizer && !!extract.external_event_id;
  const reminderAnchor = extract.event_start_at ?? extract.due_at;

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Animated.View
          onStartShouldSetResponder={() => true}
          style={[s.sheet, { backgroundColor: colors.cardBackground, paddingBottom: insets.bottom + 8, transform: [{ translateY }] }]}
        >
          <View style={s.handleWrap} {...panResponder.panHandlers}>
            <View style={[s.handle, { backgroundColor: colors.textTertiary }]} />
          </View>
          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled">
            <TextInput
              style={[s.titleInput, { color: colors.textPrimary }]}
              value={text}
              onChangeText={setText}
              onBlur={() => { if (text.trim() && text !== extract.text) save({ text: text.trim() }); }}
              placeholder="Task title"
              placeholderTextColor={colors.placeholder}
              multiline
            />

            <EditSheetDateSection extract={extract} onSave={save} />

            <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>Priority</Text>
            <EditSheetChipRow
              options={PRIORITY_CHIPS}
              activeKey={extract.priority ?? "none"}
              onSelect={(k) => save({ priority: k === "none" ? null : k })}
            />

            {lists.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>List</Text>
                <EditSheetChipRow
                  options={listChips}
                  activeKey={extract.list_id ?? "none"}
                  onSelect={(k) => save({ list_id: k === "none" ? null : k })}
                />
              </>
            )}

            <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>Reminder</Text>
            <EditSheetChipRow
              options={REMINDER_CHIPS}
              activeKey={reminderKeyFor(extract)}
              onSelect={(k) => save({ reminder_at: reminderIso(k, reminderAnchor) })}
            />

            <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>Note</Text>
            <TextInput
              style={[s.noteInput, { color: colors.textPrimary }]}
              value={note}
              onChangeText={setNote}
              onBlur={() => { if (note !== (extract.pem_note ?? "")) save({ pem_note: note || null }); }}
              placeholder="Add a note..."
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={3}
            />

            <DraftSection extract={extract} />

            {isExternal && (
              <View style={[s.banner, { backgroundColor: colors.secondarySurface }]}>
                <Text style={[s.bannerText, { color: colors.textTertiary }]}>
                  This event was created by someone else
                </Text>
              </View>
            )}

            <EditSheetActions
              onDone={() => onDone(extract.id)}
              onDismiss={() => onDismiss(extract.id)}
              onDelete={() => onDelete(extract.id)}
            />
          </ScrollView>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
