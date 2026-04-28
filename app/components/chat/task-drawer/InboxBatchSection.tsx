import { pemAmber } from "@/constants/theme";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/lib/pemApi";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { BATCH_META } from "@/components/chat/task-drawer/constants";
import { dismissOpenTaskSwipe } from "@/components/chat/task-drawer/taskSwipeRegistry";
import { inboxStyles } from "@/components/chat/task-drawer/inboxTab.styles";
import { InboxSectionItemsGroup } from "@/components/chat/task-drawer/InboxSectionItemsGroup";
import { TaskItem } from "@/components/chat/task-drawer/TaskItem";

export function InboxBatchSection({
  batchKey,
  items,
  isOpen,
  onToggle,
  onCloseTask,
  onEditTask,
}: {
  batchKey: string;
  items: ApiExtract[];
  isOpen: boolean;
  onToggle: (key: string) => void;
  onCloseTask: (id: string) => void;
  onEditTask: (item: ApiExtract) => void;
}) {
  const { colors } = useTheme();
  const meta = BATCH_META[batchKey];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <View>
      <Pressable
        onPress={() => {
          dismissOpenTaskSwipe();
          onToggle(batchKey);
        }}
        style={[
          inboxStyles.sectionHeader,
          { borderBottomColor: colors.borderMuted },
        ]}
      >
        <Icon size={16} color={pemAmber} />
        <Text style={[inboxStyles.sectionTitle, { color: colors.textPrimary }]}>
          {meta.label}
        </Text>
        <Text style={[inboxStyles.sectionCount, { color: colors.textTertiary }]}>
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
              compact
              onEditPress={onEditTask}
            />
          ))}
        </InboxSectionItemsGroup>
      )}
    </View>
  );
}
