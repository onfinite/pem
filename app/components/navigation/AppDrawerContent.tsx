import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { inboxChrome } from "@/constants/inboxChrome";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { pemAmber } from "@/constants/theme";
import { useUser } from "@clerk/expo";
import { router, usePathname } from "expo-router";
import {
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Inbox,
  Layers,
  Lightbulb,
  Mail,
  Phone,
  Settings,
  ShoppingCart,
  Sunrise,
  Truck,
} from "lucide-react-native";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type NavItem = {
  key: string;
  label: string;
  href: string;
  Icon: typeof Inbox;
};

const MAIN: NavItem[] = [
  { key: "inbox", label: "Inbox", href: "/inbox", Icon: Inbox },
  { key: "thoughts", label: "Thoughts", href: "/thoughts", Icon: BookOpen },
  { key: "done", label: "Done", href: "/done", Icon: CheckCircle2 },
  { key: "everything", label: "Everything", href: "/everything", Icon: Layers },
];

const CATEGORIES: NavItem[] = [
  { key: "ideas", label: "Ideas", href: "/category/ideas", Icon: Lightbulb },
  { key: "someday", label: "Someday", href: "/category/someday", Icon: Sunrise },
];

const BATCHES: NavItem[] = [
  { key: "shopping", label: "Shopping", href: "/category/shopping", Icon: ShoppingCart },
  { key: "calls", label: "Calls", href: "/category/calls", Icon: Phone },
  { key: "emails", label: "Emails", href: "/category/emails", Icon: Mail },
  { key: "errands", label: "Errands", href: "/category/errands", Icon: Truck },
];

const BOTTOM: NavItem[] = [
  { key: "ask", label: "Ask Pem", href: "/ask", Icon: HelpCircle },
  { key: "settings", label: "Settings", href: "/settings", Icon: Settings },
];

type Props = { onRequestClose: () => void };

export default function AppDrawerContent({ onRequestClose }: Props) {
  const insets = useSafeAreaInsets();
  const { resolved, colors } = useTheme();
  const chrome = inboxChrome(resolved);
  const { user } = useUser();
  const pathname = usePathname() ?? "";
  const imageUrl = user?.imageUrl;

  const go = (href: string) => {
    onRequestClose();
    router.push(href as any);
  };

  const renderItem = (item: NavItem) => {
    const selected = isActive(pathname, item.href);
    const fg = selected ? pemAmber : chrome.textMuted;
    return (
      <Pressable
        key={item.key}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        onPress={() => go(item.href)}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: pressed ? chrome.surface : "transparent",
            borderColor: selected ? chrome.amberBorder : "transparent",
          },
        ]}
      >
        <item.Icon size={20} color={fg} strokeWidth={2} />
        <PemText
          variant="body"
          style={{
            marginLeft: space[3],
            color: selected ? chrome.text : chrome.textMuted,
            fontWeight: selected ? "500" : "400",
            fontSize: fontSize.sm,
          }}
        >
          {item.label}
        </PemText>
      </Pressable>
    );
  };

  const sectionLabel = (text: string) => (
    <PemText
      style={{
        fontFamily: fontFamily.sans.regular,
        fontSize: 10,
        fontWeight: "500",
        color: chrome.textDim,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        paddingHorizontal: space[3],
        paddingTop: space[4],
        paddingBottom: space[1],
      }}
    >
      {text}
    </PemText>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, backgroundColor: chrome.page }]}>
      <View style={styles.brandRow}>
        <PemText
          style={{
            fontFamily: fontFamily.display.italic,
            fontSize: fontSize.lg,
            fontStyle: "italic",
            color: pemAmber,
            fontWeight: "200",
          }}
        >
          pem
        </PemText>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {MAIN.map(renderItem)}

        {sectionLabel("Categories")}
        {CATEGORIES.map(renderItem)}

        {sectionLabel("Batches")}
        {BATCHES.map(renderItem)}

        <View style={{ height: space[2] }} />
        {BOTTOM.map(renderItem)}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Account and settings"
        onPress={() => go("/settings")}
        style={[styles.footer, { borderTopColor: chrome.border, paddingBottom: insets.bottom + 12 }]}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: chrome.surfaceMuted }]}>
            <PemText variant="caption" style={{ color: chrome.textMuted }}>
              {(user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? "?").toUpperCase()}
            </PemText>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: space[3] }}>
          <PemText variant="body" style={{ color: chrome.text }} numberOfLines={1}>
            {user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Account"}
          </PemText>
          <PemText variant="caption" style={{ color: chrome.textDim }} numberOfLines={1}>
            Settings
          </PemText>
        </View>
        <Settings size={20} color={colors.textSecondary} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/inbox") return pathname === "/inbox";
  if (href === "/thoughts") return pathname.startsWith("/thoughts");
  if (href === "/done") return pathname.startsWith("/done");
  if (href === "/everything") return pathname === "/everything";
  if (href === "/ask") return pathname === "/ask";
  return pathname === href || pathname.startsWith(href);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  brandRow: { paddingHorizontal: space[5], marginBottom: space[4] },
  scroll: { paddingHorizontal: space[3], gap: space[0] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: 12,
    borderWidth: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[4],
    paddingTop: space[4],
    marginTop: "auto",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
