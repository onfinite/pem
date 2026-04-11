import { fontFamily } from "@/constants/typography";
import { type ReactNode, useMemo } from "react";
import { type StyleProp, Text, type TextStyle } from "react-native";

type Props = {
  children: string;
  style?: StyleProp<TextStyle>;
};

/**
 * Renders simple markdown inline: **bold** and line breaks.
 * Keeps styling consistent with the chat bubble text.
 */
export function MarkdownText({ children, style }: Props) {
  const nodes = useMemo(() => parseInline(children), [children]);
  return <Text style={style}>{nodes}</Text>;
}

function parseInline(raw: string): ReactNode[] {
  const parts = raw.split(/(\*\*[^*]+\*\*)/g);
  const nodes: ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const boldMatch = part.match(/^\*\*(.+)\*\*$/);
    if (boldMatch) {
      nodes.push(
        <Text key={i} style={boldStyle}>
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
