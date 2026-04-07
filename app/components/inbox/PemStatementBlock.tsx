import PemText from "@/components/ui/PemText";
import type { InboxChrome } from "@/constants/inboxChrome";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { StyleSheet, View } from "react-native";

type Props = {
  chrome: InboxChrome;
  headline: string;
  subline: string;
  dateLine: string;
  /** When false, only the date line shows (e.g. empty today — body lives in PemMindEmptyState). */
  showBody?: boolean;
};

export default function PemStatementBlock({
  chrome,
  headline,
  subline,
  dateLine,
  showBody = true,
}: Props) {
  return (
    <View style={styles.block}>
      <PemText variant="caption" style={{ color: chrome.textDim, letterSpacing: 1.2, marginBottom: space[2] }}>
        {dateLine}
      </PemText>
      {showBody ? (
        <>
          <PemText
            style={{
              fontFamily: fontFamily.display.italic,
              fontStyle: "italic",
              fontSize: fontSize.md,
              fontWeight: "200",
              color: chrome.text,
              lineHeight: Math.round(fontSize.md * 1.55),
              marginBottom: space[1],
            }}
          >
            {headline}
          </PemText>
          <PemText variant="bodyMuted" style={{ color: chrome.textMuted, fontWeight: "300", lineHeight: 24 }}>
            {subline}
          </PemText>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: space[6], paddingTop: space[2] },
});
