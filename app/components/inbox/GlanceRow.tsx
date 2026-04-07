import PemText from "@/components/ui/PemText";
import type { InboxChrome } from "@/constants/inboxChrome";
import { pemAmber } from "@/constants/theme";
import { fontSize, space } from "@/constants/typography";
import type { ApiExtract } from "@/lib/pemApi";
import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

function batchEmoji(batch: string | null): string {
  if (batch === "shopping") return "🛒";
  if (batch === "calls") return "📞";
  if (batch === "emails") return "📧";
  if (batch === "errands") return "📍";
  return "◆";
}

function isOverdue(item: ApiExtract): boolean {
  if (!item.due_at) return false;
  return new Date(item.due_at).getTime() < Date.now();
}

function isCalHighlight(item: ApiExtract): boolean {
  return item.due_at != null || item.period_label != null;
}

type Props = {
  item: ApiExtract;
  chrome: InboxChrome;
  onPress: () => void;
};

export default function GlanceRow({ item, chrome, onPress }: Props) {
  const overdue = isOverdue(item);
  const cal = isCalHighlight(item);
  const urgent = item.urgency === "today" && overdue;

  const subParts: string[] = [];
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
          borderColor: urgent ? chrome.urgentBorder : cal ? chrome.amberBorder : chrome.border,
        },
        urgent ? { backgroundColor: chrome.urgentBg } : null,
        cal && !urgent ? { backgroundColor: chrome.amberSoft } : null,
      ]}
    >
      <View
        style={[
          styles.ico,
          {
            backgroundColor: chrome.surfaceMuted,
            borderColor: chrome.border,
          },
          cal ? { backgroundColor: chrome.amberSoft, borderColor: chrome.amberBorder } : null,
        ]}
      >
        <PemText style={{ fontSize: fontSize.md }}>{batchEmoji(item.batch_key)}</PemText>
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
          <View style={[styles.badge, { borderColor: chrome.amberBorder, backgroundColor: chrome.amberSoft }]}>
            <PemText variant="caption" style={{ color: pemAmber, fontSize: 9, fontWeight: "600" }}>
              {new Date(item.due_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </PemText>
          </View>
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
