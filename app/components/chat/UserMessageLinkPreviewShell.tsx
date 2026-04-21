import { useTheme } from "@/contexts/ThemeContext";
import { neutral } from "@/constants/theme";
import { radii } from "@/constants/typography";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

type Props = {
  onPress: () => void;
  children: ReactNode;
};

export function UserMessageLinkPreviewShell({ onPress, children }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable onPress={onPress}>
      <View
        style={[
          styles.shell,
          {
            backgroundColor: colors.onPrimary,
            borderColor: neutral[200],
            shadowColor: "#000000",
          },
        ]}
      >
        {children}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    borderRadius: radii.md,
    padding: 3,
    borderWidth: 1,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      default: {
        elevation: 2,
      },
    }),
  },
});
