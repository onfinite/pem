import { pemAmber } from "@/constants/theme";
import { space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/lib/pemApi";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { inboxStyles } from "./inboxTab.styles";
import { InboxSectionItemsGroup } from "./InboxSectionItemsGroup";

export function InboxDoneSection({
  doneItems,
  collapsed,
  onToggleDone,
  hasMore,
  loadingMore,
}: {
  doneItems: ApiExtract[];
  collapsed: boolean;
  onToggleDone: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}) {
  const { colors } = useTheme();

  if (doneItems.length === 0) return null;

  return (
    <>
      <Pressable
        onPress={onToggleDone}
        style={[
          inboxStyles.sectionHeader,
          {
            borderBottomColor: colors.borderMuted,
            marginTop: space[2],
          },
        ]}
      >
        <CheckCircle2 size={16} color={colors.textTertiary} />
        <Text style={[inboxStyles.sectionTitle, { color: colors.textSecondary }]}>
          Done
        </Text>
        <Text style={[inboxStyles.sectionCount, { color: colors.textTertiary }]}>
          {doneItems.length}
        </Text>
        <View style={{ flex: 1 }} />
        {!collapsed ? (
          <ChevronDown size={16} color={colors.textTertiary} />
        ) : (
          <ChevronRight size={16} color={colors.textTertiary} />
        )}
      </Pressable>
      {!collapsed && (
        <InboxSectionItemsGroup>
          {doneItems.map((item) => (
            <View
              key={item.id}
              style={[
                inboxStyles.doneRow,
                { borderBottomColor: colors.borderMuted },
              ]}
            >
              <CheckCircle2 size={14} color={colors.textTertiary} />
              <Text
                style={[inboxStyles.doneText, { color: colors.textTertiary }]}
                numberOfLines={1}
              >
                {item.text}
              </Text>
              {item.done_at && (
                <Text style={[inboxStyles.doneTime, { color: colors.textTertiary }]}>
                  {new Date(item.done_at).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              )}
            </View>
          ))}
        </InboxSectionItemsGroup>
      )}
      {!collapsed && loadingMore && (
        <View style={{ paddingVertical: space[2], alignItems: "center" }}>
          <ActivityIndicator color={pemAmber} size="small" />
        </View>
      )}
      {!collapsed && hasMore && !loadingMore && doneItems.length > 0 && (
        <Text
          style={[
            inboxStyles.doneTime,
            {
              color: colors.textTertiary,
              textAlign: "center",
              paddingVertical: space[1],
            },
          ]}
        >
          Scroll for more
        </Text>
      )}
    </>
  );
}
