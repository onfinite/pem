import { pemAmber } from "@/constants/theme";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/lib/pemApi";
import type { LucideIcon } from "lucide-react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { inboxStyles } from "./inboxTab.styles";
import { InboxSectionItemsGroup } from "./InboxSectionItemsGroup";
import { TaskItem } from "./TaskItem";

export function InboxLabeledSection({
  sectionKey,
  title,
  Icon,
  iconColor,
  titleColor,
  countColor,
  items,
  isOpen,
  onToggle,
  onCloseTask,
  onEditTask,
  compact = true,
}: {
  sectionKey: string;
  title: string;
  Icon: LucideIcon;
  iconColor?: string;
  titleColor?: string;
  countColor?: string;
  items: ApiExtract[];
  isOpen: boolean;
  onToggle: (key: string) => void;
  onCloseTask: (id: string) => void;
  onEditTask: (item: ApiExtract) => void;
  compact?: boolean;
}) {
  const { colors } = useTheme();

  if (items.length === 0) return null;

  return (
    <View>
      <Pressable
        onPress={() => onToggle(sectionKey)}
        style={[
          inboxStyles.sectionHeader,
          { borderBottomColor: colors.borderMuted },
        ]}
      >
        <Icon size={16} color={iconColor ?? pemAmber} />
        <Text style={[inboxStyles.sectionTitle, { color: titleColor ?? colors.textPrimary }]}>
          {title}
        </Text>
        <Text style={[inboxStyles.sectionCount, { color: countColor ?? colors.textTertiary }]}>
          {items.length}
        </Text>
        <View style={{ flex: 1 }} />
        {isOpen ? (
          <ChevronDown size={16} color={colors.textTertiary} />
        ) : (
          <ChevronRight size={16} color={colors.textTertiary} />
        )}
      </Pressable>
      {isOpen && (
        <InboxSectionItemsGroup>
          {items.map((item) => (
            <TaskItem
              key={item.id}
              item={item}
              onCloseTask={onCloseTask}
              compact={compact}
              onEditPress={onEditTask}
            />
          ))}
        </InboxSectionItemsGroup>
      )}
    </View>
  );
}
