import PemText from "@/components/ui/PemText";
import { useInboxShell } from "@/constants/shellTokens";
import { fontFamily, fontSize } from "@/constants/typography";
import { StyleSheet, View } from "react-native";

const MAX_SHOWN = 99;

type Props = {
  /** Ready preps with no `opened_at` (For you). */
  count: number;
};

/**
 * Compact count pill for unread-ready preps — hub menu and drawer.
 */
export default function HubUnreadBadge({ count }: Props) {
  const s = useInboxShell();
  if (count <= 0) return null;
  const label = count > MAX_SHOWN ? `${MAX_SHOWN}+` : String(count);
  const wide = count > 9;

  return (
    <View
      style={[
        styles.badge,
        wide && styles.badgeWide,
        { backgroundColor: s.amber },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <PemText
        numberOfLines={1}
        style={[styles.text, { color: s.fabIconOnAmber, fontFamily: fontFamily.sans.bold }]}
      >
        {label}
      </PemText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeWide: {
    minWidth: 22,
    paddingHorizontal: 5,
  },
  text: {
    fontSize: fontSize.xs - 1,
    lineHeight: 14,
    marginTop: -0.5,
  },
});
