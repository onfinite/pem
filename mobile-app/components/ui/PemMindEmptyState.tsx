import PemText from "@/components/ui/PemText";
import type { InboxChrome } from "@/constants/inboxChrome";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, lh, space } from "@/constants/typography";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

type Props = {
  chrome: InboxChrome;
  /** Fraunces italic headline (e.g. “Nothing on your mind right now.”) */
  title: string;
  /** DM Sans body — textDim */
  subtitle: string;
  /** Show “pem” wordmark above title (matches brand mock). */
  showBrand?: boolean;
  /** Hint under divider (e.g. tap the mic). Omit to hide. */
  micHint?: string | null;
};

/**
 * Centered empty state from glance mock — Fraunces italic + soft body + hairline divider.
 */
export default function PemMindEmptyState({
  chrome,
  title,
  subtitle,
  showBrand = true,
  micHint = "tap the mic below",
}: Props) {
  return (
    <View style={styles.wrap}>
      {showBrand ? (
        <PemText
          style={{
            fontFamily: fontFamily.display.italic,
            fontStyle: "italic",
            fontSize: fontSize.lg,
            fontWeight: "200",
            color: pemAmber,
            marginBottom: space[3],
          }}
        >
          pem
        </PemText>
      ) : null}
      <PemText
        style={{
          fontFamily: fontFamily.display.italic,
          fontStyle: "italic",
          fontSize: fontSize.md,
          fontWeight: "200",
          color: chrome.textMuted,
          textAlign: "center",
          lineHeight: lh(fontSize.md, 1.6),
          maxWidth: 260,
          marginBottom: space[3],
        }}
      >
        {title}
      </PemText>
      <PemText
        style={{
          fontFamily: fontFamily.sans.regular,
          fontSize: fontSize.sm,
          fontWeight: "300",
          color: chrome.textDim,
          textAlign: "center",
          lineHeight: lh(fontSize.sm, 1.7),
          maxWidth: 220,
          marginBottom: space[3],
        }}
      >
        {subtitle}
      </PemText>
      <LinearGradient
        colors={["transparent", chrome.border]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.divider}
      />
      {micHint ? (
        <PemText
          style={{
            fontFamily: fontFamily.sans.regular,
            fontSize: 10,
            fontWeight: "400",
            color: chrome.textDim,
            letterSpacing: 0.6,
            marginTop: space[3],
            textAlign: "center",
          }}
        >
          {micHint}
        </PemText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[8],
    paddingVertical: space[10],
    minHeight: 280,
  },
  divider: {
    width: 1,
    height: 36,
    marginTop: space[1],
  },
});
