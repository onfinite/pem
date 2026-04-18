import { pemAmber } from "@/constants/theme";
import { fontFamily } from "@/constants/typography";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { splitTextWithUrls } from "@/utils/splitTextWithUrls";
import { type ReactNode, useMemo } from "react";
import {
  type StyleProp,
  Text,
  type TextStyle,
} from "react-native";

type Props = {
  children: string;
  style?: StyleProp<TextStyle>;
  /** Inline links use this color; defaults to brand amber. */
  linkColor?: string;
};

/**
 * Renders simple markdown inline (**bold**), line breaks, and clickable http(s) URLs.
 */
export function MarkdownText({ children, style, linkColor = pemAmber }: Props) {
  const nodes = useMemo(
    () => buildNodes(children, linkColor),
    [children, linkColor],
  );
  return <Text style={style}>{nodes}</Text>;
}

function buildNodes(raw: string, linkColor: string): ReactNode[] {
  const segments = splitTextWithUrls(raw);
  const out: ReactNode[] = [];

  segments.forEach((seg, si) => {
    if (seg.type === "text") {
      out.push(...parseBoldInline(seg.value, `s${si}`));
    } else {
      out.push(
        <Text
          key={`s${si}-url`}
          accessibilityRole="link"
          onPress={() => void openExternalUrl(seg.href)}
          style={[linkTextBase, { color: linkColor }]}
        >
          {seg.display}
        </Text>,
      );
    }
  });

  return out;
}

function parseBoldInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  const nodes: ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const boldMatch = part.match(/^\*\*(.+)\*\*$/);
    if (boldMatch) {
      nodes.push(
        <Text key={`${keyPrefix}-b${i}`} style={boldStyle}>
          {boldMatch[1]}
        </Text>,
      );
    } else {
      nodes.push(part);
    }
  }

  return nodes;
}

const boldStyle: TextStyle = {
  fontFamily: fontFamily.sans.semibold,
};

const linkTextBase: TextStyle = {
  fontFamily: fontFamily.sans.medium,
  textDecorationLine: "underline",
};
