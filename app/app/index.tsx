import { button, layout, text } from "@/styles/theme";
import { Pressable, Text, View } from "react-native";

export default function Index() {
  return (
    <View style={layout.center}>
      <Text style={text.headline}>Pem</Text>
      <Text style={[text.bodyMuted, { marginTop: 8 }]}>
        Edit app/index.tsx to edit this screen.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => { }}
        style={({ pressed }) => [
          button.primary,
          { marginTop: 24 },
          pressed && button.primaryPressed,
        ]}
      >
        <Text style={button.primaryLabel}>Get started</Text>
      </Pressable>
    </View>
  );
}
