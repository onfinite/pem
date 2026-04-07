import { useAppDrawer } from "@/contexts/AppDrawerContext";
import { Menu } from "lucide-react-native";
import { Pressable } from "react-native";

type Props = {
  tintColor: string;
};

/** Opens the left navigation drawer (custom modal — avoids expo-router/drawer native issues). */
export default function AppMenuButton({ tintColor }: Props) {
  const { openDrawer } = useAppDrawer();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open menu"
      hitSlop={10}
      onPress={openDrawer}
    >
      <Menu size={26} color={tintColor} strokeWidth={2} />
    </Pressable>
  );
}
