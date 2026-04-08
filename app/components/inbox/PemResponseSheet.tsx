import PemText from "@/components/ui/PemText";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { X } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";

type Source = { id: string; text: string };

type Props = {
  visible: boolean;
  answer: string;
  sources?: Source[];
  onDismiss: () => void;
  pageColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
};

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "– ")
    .replace(/^[-*]\s+/gm, "– ")
    .replace(/`(.*?)`/g, "$1")
    .trim();
}

export default function PemResponseSheet({
  visible,
  answer,
  sources,
  onDismiss,
  pageColor,
  textColor,
  mutedColor,
  borderColor,
}: Props) {
  const translateY = useRef(new Animated.Value(300)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 300,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.backdrop,
        { opacity },
      ]}
      pointerEvents="box-none"
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: pageColor,
            borderColor,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.header}>
          <PemText
            style={{
              fontFamily: fontFamily.display.italic,
              fontStyle: "italic",
              fontSize: fontSize.sm,
              fontWeight: "200",
              color: pemAmber,
            }}
          >
            pem
          </PemText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={onDismiss}
            hitSlop={12}
          >
            <X size={18} color={mutedColor} strokeWidth={2} />
          </Pressable>
        </View>
        <PemText
          style={{
            fontFamily: fontFamily.sans.regular,
            fontSize: fontSize.sm,
            fontWeight: "300",
            color: textColor,
            lineHeight: Math.round(fontSize.sm * 1.7),
          }}
        >
          {stripMarkdown(answer)}
        </PemText>
        {sources && sources.length > 0 && (
          <View style={styles.sources}>
            <PemText
              style={{
                fontFamily: fontFamily.sans.regular,
                fontSize: fontSize.xs,
                fontWeight: "400",
                color: mutedColor,
                marginBottom: 4,
              }}
            >
              Referenced:
            </PemText>
            {sources.slice(0, 3).map((s) => (
              <PemText
                key={s.id}
                numberOfLines={1}
                style={{
                  fontFamily: fontFamily.sans.regular,
                  fontSize: fontSize.xs,
                  fontWeight: "300",
                  color: mutedColor,
                  lineHeight: Math.round(fontSize.xs * 1.6),
                }}
              >
                · {s.text}
              </PemText>
            ))}
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 90,
    justifyContent: "flex-end",
    paddingHorizontal: space[4],
    paddingBottom: 100,
  },
  sheet: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[5],
    paddingVertical: space[4],
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space[3],
  },
  sources: {
    marginTop: space[3],
    paddingTop: space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.15)",
  },
});
