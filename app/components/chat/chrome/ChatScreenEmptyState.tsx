import { CHAT_EXAMPLE_PROMPTS } from "@/constants/chatScreen.constants";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

const pemLogo = require("@/assets/images/pem-icon-1024-transparent.png");

interface ChatScreenEmptyStateProps {
  onExamplePromptPress: (prompt: string) => void;
}

export function ChatScreenEmptyState({
  onExamplePromptPress,
}: ChatScreenEmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.emptyContainer}>
      <Image source={pemLogo} style={styles.emptyLogo} />
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
        {`What's on your mind?`}
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        Try one of these to get started
      </Text>
      <View style={styles.emptyChips}>
        {CHAT_EXAMPLE_PROMPTS.map((prompt) => (
          <Pressable
            key={prompt}
            onPress={() => onExamplePromptPress(prompt)}
            style={[
              styles.emptyChip,
              {
                borderColor: colors.borderMuted,
                backgroundColor: colors.cardBackground,
              },
            ]}
          >
            <Text style={[styles.emptyChipText, { color: colors.textPrimary }]}>
              {prompt}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space[6],
  },
  emptyLogo: {
    width: 56,
    height: 56,
    marginBottom: space[4],
  },
  emptyTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    marginBottom: space[2],
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    textAlign: "center",
    marginBottom: space[5],
  },
  emptyChips: {
    width: "100%",
    maxWidth: 320,
    gap: space[2],
  },
  emptyChip: {
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radii.md,
    borderWidth: 1,
  },
  emptyChipText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
});
