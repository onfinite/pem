import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, lh } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { chatInlineLinkHostnameNatural } from "@/utils/linkPreviewDisplayStrings";
import { splitTextWithUrls } from "@/utils/splitTextWithUrls";
import { type ReactNode, useMemo } from "react";
import {
  type StyleProp,
  Text,
  type TextStyle,
} from "react-native";

/** Typographic “out” arrow — renders in the body font (avoids emoji scaling). */
const INLINE_LINK_MARK = "\u2197";

const INLINE_LINK_MARK_FONT_SIZE = Math.round(fontSize.base * 0.68);

type Props = {
  children: string;
  style?: StyleProp<TextStyle>;
  /** Inline links use this color; defaults to brand amber. */
  linkColor?: string;
  /** User bubble: URL → mark + italic underlined hostname; inherits body font size (use pem amber). */
  userBubbleInlineLinks?: boolean;
  userBubbleLinkColor?: string;
};

/**
 * Renders simple markdown inline (**bold**), line breaks, and clickable http(s) URLs.
 */
export function MarkdownText({
  children,
  style,
  linkColor = pemAmber,
  userBubbleInlineLinks = false,
  userBubbleLinkColor = pemAmber,
}: Props) {
  const nodes = useMemo(
    () =>
      buildNodes(children, linkColor, {
        userBubbleInline: userBubbleInlineLinks,
        userLinkColor: userBubbleLinkColor,
      }),
    [children, linkColor, userBubbleInlineLinks, userBubbleLinkColor],
  );
  return <Text style={style}>{nodes}</Text>;
}

type BuildOpts = {
  userBubbleInline: boolean;
  userLinkColor: string;
};

function buildNodes(
  raw: string,
  linkColor: string,
  opts: BuildOpts,
): ReactNode[] {
  const segments = splitTextWithUrls(raw);
  const out: ReactNode[] = [];

  segments.forEach((seg, si) => {
    if (seg.type === "text") {
      out.push(...parseBoldInline(seg.value, `s${si}`));
    } else if (opts.userBubbleInline) {
      const label = chatInlineLinkHostnameNatural(seg.href);
      const c = opts.userLinkColor;
      out.push(
        <Text
          key={`s${si}-url`}
          accessibilityRole="link"
          accessibilityLabel={`Open link ${label}`}
          onPress={() => {
            pemImpactLight();
            void openExternalUrl(seg.href);
          }}
        >
          <Text style={[userBubbleLinkHostText, { color: c }]}>
            <Text style={[userBubbleLinkMark, { color: c }]}>
              {INLINE_LINK_MARK}
            </Text>
            {`\u00A0${label}`}
          </Text>
        </Text>,
      );
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

/** Slightly smaller than body so the arrow reads as a hint, not a second headline. */
const userBubbleLinkMark: TextStyle = {
  fontFamily: fontFamily.sans.regular,
  fontSize: INLINE_LINK_MARK_FONT_SIZE,
  lineHeight: lh(INLINE_LINK_MARK_FONT_SIZE, 1.15),
  textDecorationLine: "none",
};

/**
 * Hostname: inherits fontSize/lineHeight from parent `style`; same regular face + synthetic italic.
 */
const userBubbleLinkHostText: TextStyle = {
  fontFamily: fontFamily.sans.regular,
  fontStyle: "italic",
  textDecorationLine: "underline",
};

const linkTextBase: TextStyle = {
  fontFamily: fontFamily.sans.medium,
  textDecorationLine: "underline",
};
