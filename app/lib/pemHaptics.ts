import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

function safe(run: () => Promise<void>): void {
  if (Platform.OS === "web") return;
  void run().catch(() => {
    /* haptics unavailable or disabled */
  });
}

/**
 * Subtle “button tap” — Taptic-style soft impact, not a long phone buzz.
 * (Avoid `Vibration.vibrate`: that’s motor buzz, not UI haptics.)
 */
export function pemImpactLight(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
}

/** Tab / segment changes — very light tick. */
export function pemSelection(): void {
  safe(() => Haptics.selectionAsync());
}
