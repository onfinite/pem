import { pageBackground } from "@/constants/theme";
import { space } from "@/constants/typography";
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ScreenScrollProps = {
  children: ReactNode;
  /** Default: warm cream page background */
  backgroundColor?: string;
  contentStyle?: ViewStyle;
  /** Extra bottom padding for keyboard */
  bottomInset?: number;
};

export default function ScreenScroll({
  children,
  backgroundColor = pageBackground,
  contentStyle,
  bottomInset = space[8],
}: ScreenScrollProps) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor }]} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: bottomInset },
            contentStyle,
          ]}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: space[4],
    paddingTop: space[2],
  },
});
