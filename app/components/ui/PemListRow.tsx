import PemText from "@/components/ui/PemText";
import type { InboxChrome } from "@/constants/inboxChrome";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

type Props = {
  chrome: InboxChrome;
  /** Emoji string or a ReactNode (e.g. Lucide icon) for the left tile. */
  icon?: string | ReactNode;
  title: string;
  /** Dimmed secondary line (11px, textDim). */
  subtitle?: string;
  right?: ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
};

/**
 * Flat list row — matches “Layer 3” items: icon tile, title (muted), subtitle, optional chevron.
 */
export default function PemListRow({
  chrome,
  icon,
  title,
  subtitle,
  right,
  showChevron = true,
  onPress,
}: Props) {
  const content = (
    <>
      {icon ? (
        <View
          style={[
            styles.ico,
            { backgroundColor: chrome.surfaceMuted, borderColor: chrome.border },
          ]}
        >
          {typeof icon === "string" ? (
            <PemText style={{ fontSize: fontSize.sm }}>{icon}</PemText>
          ) : (
            icon
          )}
        </View>
      ) : (
        <View style={{ width: space[2] }} />
      )}
      <View style={styles.body}>
        <PemText
          numberOfLines={2}
          style={{
            fontFamily: fontFamily.sans.regular,
            fontSize: fontSize.sm,
            fontWeight: "400",
            color: chrome.textMuted,
          }}
        >
          {title}
        </PemText>
        {subtitle ? (
          <PemText
            numberOfLines={2}
            style={{
              marginTop: 2,
              fontFamily: fontFamily.sans.regular,
              fontSize: fontSize.xs,
              fontWeight: "300",
              color: chrome.textDim,
            }}
          >
            {subtitle}
          </PemText>
        ) : null}
      </View>
      <View style={styles.right}>
        {right}
        {showChevron && onPress ? (
          <ChevronRight size={14} color={chrome.textDim} strokeWidth={1.8} />
        ) : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: chrome.border },
          pressed ? { backgroundColor: chrome.surfaceMuted } : null,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, { borderBottomColor: chrome.border }]}>{content}</View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space[3],
    paddingHorizontal: space[5],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space[3],
  },
  ico: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    flexShrink: 0,
  },
});
