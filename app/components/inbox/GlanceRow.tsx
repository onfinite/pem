import PemText from "@/components/ui/PemText";
import type { InboxChrome } from "@/constants/inboxChrome";
import { space } from "@/constants/typography";
import type { ApiExtract } from "@/lib/pemApi";
import {
  Calendar,
  ChevronRight,
  MapPin,
  MessageCircle,
  ShoppingCart,
  Sparkles,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

function itemIcon(item: ApiExtract, chrome: InboxChrome): { Icon: LucideIcon; color: string } {
  if (item.source === "calendar") return { Icon: Calendar, color: chrome.textDim };
  if (item.batch_key === "shopping") return { Icon: ShoppingCart, color: chrome.textDim };
  if (item.batch_key === "follow_ups") return { Icon: MessageCircle, color: chrome.textDim };
  if (item.batch_key === "errands") return { Icon: MapPin, color: chrome.textDim };
  return { Icon: Sparkles, color: chrome.textDim };
}

function isOverdue(item: ApiExtract): boolean {
  if (!item.due_at) return false;
  return new Date(item.due_at).getTime() < Date.now();
}

type Props = {
  item: ApiExtract;
  chrome: InboxChrome;
  onPress: () => void;
};

export default function GlanceRow({ item, chrome, onPress }: Props) {
  const overdue = isOverdue(item);
  const urgent = item.urgency === "today" && overdue;
  const isCalSource = item.source === "calendar";

  const subParts: string[] = [];
  if (isCalSource && item.event_start_at) {
    subParts.push(
      new Date(item.event_start_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    );
  }
  if (isCalSource && item.event_location) subParts.push(item.event_location);
  if (item.batch_key) subParts.push(item.batch_key.replace(/_/g, " "));
  if (item.snoozed_until) subParts.push("snoozed");

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? chrome.surface : "transparent",
          borderColor: urgent ? chrome.urgentBorder : chrome.border,
        },
        urgent ? { backgroundColor: chrome.urgentBg } : null,
      ]}
    >
      <View style={[styles.ico, { backgroundColor: chrome.surfaceMuted, borderColor: chrome.border }]}>
        {(() => {
          const { Icon, color } = itemIcon(item, chrome);
          return <Icon size={18} color={color} strokeWidth={1.8} />;
        })()}
      </View>
      <View style={styles.body}>
        <PemText variant="body" numberOfLines={2} style={{ color: chrome.text }}>
          {item.text}
        </PemText>
        {subParts.length > 0 ? (
          <PemText variant="caption" style={{ color: chrome.textDim, marginTop: 2 }} numberOfLines={1}>
            {subParts.join(" · ")}
          </PemText>
        ) : null}
      </View>
      <View style={styles.right}>
        {overdue ? (
          <View style={[styles.badge, { borderColor: chrome.urgentBorder, backgroundColor: chrome.urgentBg }]}>
            <PemText variant="caption" style={{ color: "#ff453a", fontSize: 9, fontWeight: "600" }}>
              overdue
            </PemText>
          </View>
        ) : null}
        {item.due_at && !overdue ? (
          <PemText variant="caption" style={{ color: chrome.textDim, fontSize: 10, fontVariant: ["tabular-nums"] }}>
            {new Date(item.due_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </PemText>
        ) : null}
        <ChevronRight size={16} color={chrome.textDim} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    borderRadius: 14,
    borderWidth: 1,
    gap: space[2],
  },
  ico: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  right: { alignItems: "flex-end", gap: 4 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
});
