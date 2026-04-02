import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import PemTextField from "@/components/ui/PemTextField";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import type { TimedProfileValue, TimedSegment } from "@/lib/profileTimed";
import { todayIso } from "@/lib/profileTimed";
import { Minus, Plus } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

type Props = {
  value: TimedProfileValue;
  onChange: (next: TimedProfileValue) => void;
  disabled?: boolean;
};

function updateSegment(
  previous: TimedSegment[],
  index: number,
  patch: Partial<TimedSegment>,
): TimedSegment[] {
  return previous.map((p, i) => (i === index ? { ...p, ...patch } : p));
}

export default function TimedFactFields({ value, onChange, disabled = false }: Props) {
  const { colors } = useTheme();
  const [changeFrom, setChangeFrom] = useState("");
  const [changeTo, setChangeTo] = useState(todayIso());
  const [newCurrent, setNewCurrent] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);

  const addPastRow = useCallback(() => {
    onChange({
      ...value,
      previous: [
        ...value.previous,
        { value: "", from: todayIso(), to: todayIso() },
      ],
    });
  }, [value, onChange]);

  const removePast = useCallback(
    (index: number) => {
      onChange({
        ...value,
        previous: value.previous.filter((_, i) => i !== index),
      });
    },
    [value, onChange],
  );

  const applyChange = useCallback(() => {
    setMoveError(null);
    if (!value.current.trim()) {
      setMoveError("Set the current value first.");
      return;
    }
    if (!newCurrent.trim()) {
      setMoveError("Enter what it changed to.");
      return;
    }
    const from = changeFrom.trim();
    const to = changeTo.trim();
    if (!from || !to) {
      setMoveError("Use YYYY-MM-DD for from and until dates.");
      return;
    }
    if (from > to) {
      setMoveError("“From” must be on or before “until”.");
      return;
    }
    onChange({
      ...value,
      previous: [
        ...value.previous,
        { value: value.current.trim(), from, to },
      ],
      current: newCurrent.trim(),
    });
    setNewCurrent("");
    setChangeFrom("");
    setChangeTo(todayIso());
  }, [value, onChange, changeFrom, changeTo, newCurrent]);

  return (
    <View style={styles.wrap}>
      <PemTextField
        label="Current value"
        placeholder="e.g. Seattle, WA or Senior IC"
        value={value.current}
        onChangeText={(t) => onChange({ ...value, current: t })}
        editable={!disabled}
        autoCapitalize="sentences"
        error={null}
      />

      <View style={[styles.moveBox, { borderColor: colors.borderMuted, backgroundColor: colors.secondarySurface }]}>
        <PemText style={[styles.moveTitle, { color: colors.textPrimary }]}>Recorded a change?</PemText>
        <PemText variant="caption" style={{ color: colors.textSecondary, marginBottom: space[3] }}>
          Moves the current value into “Previously” with dates, then set the new value below.
        </PemText>
        <PemTextField
          label="There from (YYYY-MM-DD)"
          placeholder="2019-06-01"
          value={changeFrom}
          onChangeText={setChangeFrom}
          editable={!disabled}
          autoCapitalize="none"
          error={null}
        />
        <PemTextField
          label="Until (YYYY-MM-DD)"
          placeholder={todayIso()}
          value={changeTo}
          onChangeText={setChangeTo}
          editable={!disabled}
          autoCapitalize="none"
          error={null}
        />
        <PemTextField
          label="Now"
          placeholder="e.g. Austin, TX"
          value={newCurrent}
          onChangeText={setNewCurrent}
          editable={!disabled}
          autoCapitalize="sentences"
          error={null}
        />
        {moveError ? (
          <PemText variant="caption" style={{ color: colors.error }}>
            {moveError}
          </PemText>
        ) : null}
        <PemButton
          variant="secondary"
          size="md"
          onPress={applyChange}
          disabled={disabled}
        >
          Apply change
        </PemButton>
      </View>

      <View style={styles.pastHead}>
        <PemText style={[styles.pastTitle, { color: colors.textPrimary }]}>Previously</PemText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add past period"
          onPress={addPastRow}
          disabled={disabled}
          style={({ pressed }) => [
            styles.addPast,
            { borderColor: colors.borderMuted, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
          ]}
        >
          <Plus size={18} stroke={colors.pemAmber} strokeWidth={2.25} />
          <PemText style={[styles.addPastLabel, { color: colors.pemAmber }]}>Add row</PemText>
        </Pressable>
      </View>
      <PemText variant="caption" style={{ color: colors.textSecondary, marginBottom: space[2] }}>
        Optional: add past periods and date ranges yourself (same as above, without using the form).
      </PemText>

      {value.previous.map((seg, index) => (
        <View
          key={`past-${index}`}
          style={[styles.segment, { borderColor: colors.borderMuted, backgroundColor: colors.cardBackground }]}
        >
          <View style={styles.segmentHead}>
            <PemText style={[styles.segmentLabel, { color: colors.textSecondary }]}>Past period {index + 1}</PemText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove past period"
              onPress={() => removePast(index)}
              disabled={disabled}
              hitSlop={8}
            >
              <Minus size={20} stroke={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>
          <PemTextField
            label="Value"
            placeholder="What was true then"
            value={seg.value}
            onChangeText={(t) =>
              onChange({
                ...value,
                previous: updateSegment(value.previous, index, { value: t }),
              })
            }
            editable={!disabled}
            error={null}
          />
          <View style={styles.dateRow}>
            <View style={styles.dateCol}>
              <PemTextField
                label="From"
                placeholder="YYYY-MM-DD"
                value={seg.from}
                onChangeText={(t) =>
                  onChange({
                    ...value,
                    previous: updateSegment(value.previous, index, { from: t }),
                  })
                }
                editable={!disabled}
                autoCapitalize="none"
                error={null}
              />
            </View>
            <View style={styles.dateCol}>
              <PemTextField
                label="To"
                placeholder="YYYY-MM-DD"
                value={seg.to}
                onChangeText={(t) =>
                  onChange({
                    ...value,
                    previous: updateSegment(value.previous, index, { to: t }),
                  })
                }
                editable={!disabled}
                autoCapitalize="none"
                error={null}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space[4],
  },
  moveBox: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: space[4],
    gap: space[3],
  },
  moveTitle: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
  },
  pastHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pastTitle: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
  },
  addPast: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    paddingVertical: space[2],
    paddingHorizontal: space[2],
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  addPastLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
  },
  segment: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: space[3],
    gap: space[2],
  },
  segmentHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  segmentLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  dateRow: {
    flexDirection: "row",
    gap: space[3],
  },
  dateCol: {
    flex: 1,
    minWidth: 0,
  },
});
