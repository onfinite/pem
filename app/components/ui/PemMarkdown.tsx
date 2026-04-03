import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight } from "@/constants/typography";
import { getSelectableMarkdownRules } from "@/lib/pemMarkdownSelectableRules";
import { openExternalUrl } from "@/lib/openExternalUrl";
import Markdown from "react-native-markdown-display";
import { useMemo } from "react";
import type { StyleProp, TextStyle } from "react-native";

type Variant = "body" | "card" | "companion";

type Props = {
  children: string;
  variant?: Variant;
  style?: StyleProp<TextStyle>;
  /** When true, text is selectable so users can drag selection handles (prep detail, etc.). */
  selectable?: boolean;
};

const selectableRules = getSelectableMarkdownRules();

/** Renders markdown with Pem typography. With `selectable`, links are **visual only** (tap-to-open would break native text selection). */
export default function PemMarkdown({
  children,
  variant = "body",
  style,
  selectable = false,
}: Props) {
  const { colors } = useTheme();

  const markdownStyle = useMemo(() => {
    const companion = variant === "companion";
    const baseSize = variant === "card" ? fontSize.sm : companion ? fontSize.lg : fontSize.md;
    const baseBody: TextStyle = {
      color: companion ? colors.textPrimary : colors.textSecondary,
      fontFamily: fontFamily.sans.regular,
      fontSize: baseSize,
      lineHeight: lh(baseSize, companion ? lineHeight.relaxed : lineHeight.relaxed),
    };
    return {
      body: { ...baseBody, ...(style as object) },
      paragraph: {
        marginTop: 0,
        marginBottom: variant === "card" ? 4 : companion ? 14 : 8,
        ...(selectable ? ({ userSelect: "text" } as const) : {}),
      },
      strong: {
        fontFamily: fontFamily.sans.semibold,
        color: colors.textPrimary,
      },
      em: { fontFamily: fontFamily.sans.regular, fontStyle: "italic" as const },
      link: {
        color: colors.pemAmber,
        textDecorationLine: "underline" as const,
      },
      bullet_list: { marginBottom: companion ? 12 : 8 },
      ordered_list: { marginBottom: companion ? 12 : 8 },
      list_item: { marginBottom: companion ? 6 : 4 },
      heading1: {
        fontFamily: fontFamily.sans.semibold,
        fontSize: fontSize.xl,
        color: colors.textPrimary,
        marginBottom: 8,
        ...(selectable ? ({ userSelect: "text" } as const) : {}),
      },
      heading2: {
        fontFamily: fontFamily.sans.semibold,
        fontSize: fontSize.lg,
        color: colors.textPrimary,
        marginBottom: 6,
        ...(selectable ? ({ userSelect: "text" } as const) : {}),
      },
      heading3: {
        fontFamily: fontFamily.sans.semibold,
        fontSize: fontSize.md,
        color: colors.textPrimary,
        marginBottom: 4,
        ...(selectable ? ({ userSelect: "text" } as const) : {}),
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
  }, [colors, style, variant, selectable]);

  return (
    <Markdown
      style={markdownStyle}
      mergeStyle
      rules={selectable ? selectableRules : undefined}
      onLinkPress={(url) => {
        void openExternalUrl(url);
        return true;
      }}
    >
      {children}
    </Markdown>
  );
}
