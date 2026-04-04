/**
 * `react-native-markdown-display` renders most nodes as nested `<Text>` without `selectable`.
 * Selection rules for prep detail:
 * - Only **block-level** `Text` (paragraph, headings, code) use `selectable={true}`. Nested inline
 *   nodes must **not** set `selectable` or they fight the parent selection.
 * - **Links** use `Text` + `onPress` (library default) so `[label](url)` opens in the browser.
 *   Tapping a link may not start a selection on that span; surrounding prose stays selectable.
 */
import { openExternalUrl } from "@/lib/openExternalUrl";
import {
  hasParents,
  renderRules,
  type ASTNode,
  type RenderRules,
} from "react-native-markdown-display";
import FitImage from "react-native-fit-image";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { ImageStyle, TextStyle } from "react-native";

/**
 * React 19: `key` must not be inside a spread object. Library puts `key` on `imageProps`
 * and spreads into FitImage — fix by passing `key` on the JSX element only.
 */
export function makeMarkdownImageRule(): NonNullable<RenderRules["image"]> {
  return (node: ASTNode, _children, _parent, styles, allowedImageHandlers, defaultImageHandler) => {
    const handlers = allowedImageHandlers ?? [
      "data:image/png;base64",
      "data:image/gif;base64",
      "data:image/jpeg;base64",
      "https://",
      "http://",
    ];
    const fallback = defaultImageHandler ?? "https://";
    const src = typeof node.attributes.src === "string" ? node.attributes.src : "";
    const alt = node.attributes.alt;

    const show =
      handlers.filter((value) => src.toLowerCase().startsWith(value.toLowerCase())).length > 0;
    if (show === false && defaultImageHandler === null) {
      return null;
    }

    const imageProps: {
      indicator: boolean;
      style: ImageStyle;
      source: { uri: string };
      accessible?: boolean;
      accessibilityLabel?: string;
    } = {
      indicator: true,
      style: styles._VIEW_SAFE_image as ImageStyle,
      source: {
        uri: show === true ? src : `${fallback}${src}`,
      },
    };
    if (alt) {
      imageProps.accessible = true;
      imageProps.accessibilityLabel = alt;
    }

    return <FitImage key={node.key} {...imageProps} />;
  };
}

/** Same list as `react-native-markdown-display` `textStyleProps` (not exported in typings). */
const TEXT_STYLE_PROPS: readonly string[] = [
  "textShadowOffset",
  "color",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "lineHeight",
  "textAlign",
  "textDecorationLine",
  "textShadowColor",
  "fontFamily",
  "textShadowRadius",
  "includeFontPadding",
  "textAlignVertical",
  "fontVariant",
  "letterSpacing",
  "textDecorationColor",
  "textDecorationStyle",
  "textTransform",
  "writingDirection",
];

/** Library default paragraph/heading styles use flex row; that breaks native text selection. */
function blockSelectableStyle(styles: Record<string, unknown>, key: string): TextStyle {
  const flat = StyleSheet.flatten(styles[key as keyof typeof styles]) as Record<string, unknown>;
  if (!flat) return {};
  const { flexDirection: _fd, alignItems: _ai, justifyContent: _jc, ...rest } = flat;
  return rest as TextStyle;
}

const selectableListItem: NonNullable<RenderRules["list_item"]> = (
  node,
  children,
  parent,
  styles,
  inheritedStyles = {},
) => {
  const refStyle = {
    ...inheritedStyles,
    ...StyleSheet.flatten(styles.list_item),
  };

  const modifiedInheritedStylesObj: Record<string, unknown> = {};
  for (const key of Object.keys(refStyle)) {
    if (TEXT_STYLE_PROPS.includes(key)) {
      modifiedInheritedStylesObj[key] = refStyle[key as keyof typeof refStyle];
    }
  }

  if (hasParents(parent, "bullet_list")) {
    return (
      <View key={node.key} style={styles._VIEW_SAFE_list_item}>
        <Text style={[modifiedInheritedStylesObj, styles.bullet_list_icon]} accessible={false}>
          {Platform.select({
            android: "\u2022",
            ios: "\u00B7",
            default: "\u2022",
          })}
        </Text>
        <View style={styles._VIEW_SAFE_bullet_list_content}>{children}</View>
      </View>
    );
  }

  if (hasParents(parent, "ordered_list")) {
    const orderedListIndex = parent.findIndex((el) => el.type === "ordered_list");
    const orderedList = parent[orderedListIndex];
    let listItemNumber: number;
    if (orderedList?.attributes?.start != null) {
      listItemNumber = orderedList.attributes.start + node.index;
    } else {
      listItemNumber = node.index + 1;
    }

    return (
      <View key={node.key} style={styles._VIEW_SAFE_list_item}>
        <Text style={[modifiedInheritedStylesObj, styles.ordered_list_icon]}>
          {listItemNumber}
          {node.markup}
        </Text>
        <View style={styles._VIEW_SAFE_ordered_list_content}>{children}</View>
      </View>
    );
  }

  return (
    <View key={node.key} style={styles._VIEW_SAFE_list_item}>
      {children}
    </View>
  );
};

export function getSelectableMarkdownRules(): RenderRules {
  return {
    ...renderRules,
    image: makeMarkdownImageRule(),
    paragraph: (node, children, parent, styles) => (
      <Text key={node.key} selectable style={blockSelectableStyle(styles as never, "paragraph")}>
        {children}
      </Text>
    ),
    heading1: (node, children, parent, styles) => (
      <Text key={node.key} selectable style={blockSelectableStyle(styles as never, "heading1")}>
        {children}
      </Text>
    ),
    heading2: (node, children, parent, styles) => (
      <Text key={node.key} selectable style={blockSelectableStyle(styles as never, "heading2")}>
        {children}
      </Text>
    ),
    heading3: (node, children, parent, styles) => (
      <Text key={node.key} selectable style={blockSelectableStyle(styles as never, "heading3")}>
        {children}
      </Text>
    ),
    heading4: (node, children, parent, styles) => (
      <Text key={node.key} selectable style={blockSelectableStyle(styles as never, "heading4")}>
        {children}
      </Text>
    ),
    heading5: (node, children, parent, styles) => (
      <Text key={node.key} selectable style={blockSelectableStyle(styles as never, "heading5")}>
        {children}
      </Text>
    ),
    heading6: (node, children, parent, styles) => (
      <Text key={node.key} selectable style={blockSelectableStyle(styles as never, "heading6")}>
        {children}
      </Text>
    ),
    text: (node, children, parent, styles, inheritedStyles = {}) => (
      <Text key={node.key} style={[inheritedStyles, styles.text]}>
        {node.content}
      </Text>
    ),
    textgroup: (node, children, parent, styles) => (
      <Text key={node.key} style={styles.textgroup}>
        {children}
      </Text>
    ),
    strong: (node, children, parent, styles) => (
      <Text key={node.key} style={styles.strong}>
        {children}
      </Text>
    ),
    em: (node, children, parent, styles) => (
      <Text key={node.key} style={styles.em}>
        {children}
      </Text>
    ),
    s: (node, children, parent, styles) => (
      <Text key={node.key} style={styles.s}>
        {children}
      </Text>
    ),
    code_inline: (node, children, parent, styles, inheritedStyles = {}) => (
      <Text key={node.key} style={[inheritedStyles, styles.code_inline]}>
        {node.content}
      </Text>
    ),
    code_block: (node, children, parent, styles, inheritedStyles = {}) => {
      let { content } = node;
      if (
        typeof node.content === "string" &&
        node.content.charAt(node.content.length - 1) === "\n"
      ) {
        content = node.content.substring(0, node.content.length - 1);
      }
      return (
        <Text key={node.key} selectable style={[inheritedStyles, styles.code_block]}>
          {content}
        </Text>
      );
    },
    fence: (node, children, parent, styles, inheritedStyles = {}) => {
      let { content } = node;
      if (
        typeof node.content === "string" &&
        node.content.charAt(node.content.length - 1) === "\n"
      ) {
        content = node.content.substring(0, node.content.length - 1);
      }
      return (
        <Text key={node.key} selectable style={[inheritedStyles, styles.fence]}>
          {content}
        </Text>
      );
    },
    link: (node, children, parent, styles) => (
      <Text
        key={node.key}
        style={styles.link}
        accessibilityRole="link"
        onPress={() => {
          const href = node.attributes.href;
          if (typeof href === "string" && href.length > 0) {
            void openExternalUrl(href);
          }
        }}
      >
        {children}
      </Text>
    ),
    hardbreak: (node, children, parent, styles) => (
      <Text key={node.key} style={styles.hardbreak}>
        {"\n"}
      </Text>
    ),
    softbreak: (node, children, parent, styles) => (
      <Text key={node.key} style={styles.softbreak}>
        {"\n"}
      </Text>
    ),
    inline: (node, children, parent, styles) => (
      <Text key={node.key} style={styles.inline}>
        {children}
      </Text>
    ),
    span: (node, children, parent, styles) => (
      <Text key={node.key} style={styles.span}>
        {children}
      </Text>
    ),
    list_item: selectableListItem,
  };
}
