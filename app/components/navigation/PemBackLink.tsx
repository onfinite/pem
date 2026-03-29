import PemText from "@/components/PemText";
import { router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

type Props = {
  label?: string;
};

export default function PemBackLink({ label = "Back" }: Props) {
  return (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      style={styles.hit}
    >
      <PemText variant="link">← {label}</PemText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
});
