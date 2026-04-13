import { pemAmber, success } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { Check } from "lucide-react-native";
import { useCallback, useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

const SNACKBAR_DURATION_MS = 5000;
const SLIDE_IN_MS = 200;
const SLIDE_OUT_MS = 150;

export type UndoItem = {
  id: string;
  text: string;
  action: "done" | "dismissed";
};

export function UndoSnackbar({
  item,
  onUndo,
  onExpire,
}: {
  item: UndoItem | null;
  onUndo: (id: string) => void;
  onExpire: (id: string) => void;
}) {
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeId = useRef<string | null>(null);

  const slideOut = useCallback(
    (cb?: () => void) => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 80,
          duration: SLIDE_OUT_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: SLIDE_OUT_MS,
          useNativeDriver: true,
        }),
      ]).start(() => cb?.());
    },
    [translateY, opacity],
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!item) {
      if (activeId.current) slideOut();
      activeId.current = null;
      return;
    }

    activeId.current = item.id;

    translateY.setValue(80);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 300,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: SLIDE_IN_MS,
        useNativeDriver: true,
      }),
    ]).start();

    timerRef.current = setTimeout(() => {
      const expId = item.id;
      slideOut(() => {
        activeId.current = null;
        onExpire(expId);
      });
    }, SNACKBAR_DURATION_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [item, translateY, opacity, slideOut, onExpire]);

  const handleUndo = useCallback(() => {
    if (!item) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const undoId = item.id;
    slideOut(() => {
      activeId.current = null;
      onUndo(undoId);
    });
  }, [item, onUndo, slideOut]);

  if (!item) return null;

  const label = item.action === "done" ? "Marked done" : "Dismissed";

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }], opacity }]}
      pointerEvents="box-none"
    >
      <View style={styles.content}>
        <Check size={16} color={success} strokeWidth={2.5} />
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Pressable onPress={handleUndo} hitSlop={12} style={styles.undoBtn}>
          <Text style={styles.undoText}>Undo</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: space[3],
    left: space[5],
    right: space[5],
    borderRadius: radii.md,
    backgroundColor: "#323232",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    zIndex: 999,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[4],
    paddingVertical: 14,
    gap: space[3],
  },
  label: {
    flex: 1,
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
    color: "#f5f5f5",
  },
  undoBtn: {
    paddingVertical: 4,
    paddingHorizontal: space[2],
  },
  undoText: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
    color: pemAmber,
  },
});
