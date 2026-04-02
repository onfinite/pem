import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight } from "@/constants/typography";
import { openExternalUrl } from "@/lib/openExternalUrl";
import Markdown from "react-native-markdown-display";
import { useMemo } from "react";
import type { StyleProp, TextStyle } from "react-native";

type Variant = "body" | "card";

type Props = {
  children: string;
  variant?: Variant;
  style?: StyleProp<TextStyle>;
};

/** Renders markdown with Pem typography and tappable links (`openExternalUrl` → browser / Custom Tabs). */
export default function PemMarkdown({ children, variant = "body", style }: Props) {
  const { colors } = useTheme();

  const markdownStyle = useMemo(() => {
    const baseBody: TextStyle = {
      color: colors.textSecondary,
      fontFamily: fontFamily.sans.regular,
      fontSize: variant === "card" ? fontSize.sm : fontSize.md,
      lineHeight: lh(
        variant === "card" ? fontSize.sm : fontSize.md,
        lineHeight.relaxed,
      ),
    };
    return {
      body: { ...baseBody, ...(style as object) },
      paragraph: { marginTop: 0, marginBottom: variant === "card" ? 4 : 8 },
      strong: {
        fontFamily: fontFamily.sans.semibold,
        color: colors.textPrimary,
      },
      em: { fontFamily: fontFamily.sans.regular, fontStyle: "italic" as const },
      link: {
        color: colors.pemAmber,
        textDecorationLine: "underline" as const,
      },
      bullet_list: { marginBottom: 8 },
      ordered_list: { marginBottom: 8 },
      list_item: { marginBottom: 4 },
      heading1: {
        fontFamily: fontFamily.sans.semibold,
        fontSize: fontSize.xl,
        color: colors.textPrimary,
        marginBottom: 8,
      },
      heading2: {
        fontFamily: fontFamily.sans.semibold,
        fontSize: fontSize.lg,
        color: colors.textPrimary,
        marginBottom: 6,
      },
      heading3: {
        fontFamily: fontFamily.sans.semibold,
        fontSize: fontSize.md,
        color: colors.textPrimary,
        marginBottom: 4,
      },
      code_inline: {
        fontFamily: fontFamily.sans.regular,
        backgroundColor: colors.secondarySurface,
        color: colors.textPrimary,
      },
      fence: {
        fontFamily: fontFamily.sans.regular,
        backgroundColor: colors.secondarySurface,
        color: colors.textSecondary,
        padding: 8,
        borderRadius: 6,
      },
    };
  }, [colors, style, variant]);

  return (
    <Markdown
      style={markdownStyle}
      mergeStyle
      onLinkPress={(url) => {
        void openExternalUrl(url);
        return true;
      }}
    >
      {children}
    </Markdown>
  );
}
