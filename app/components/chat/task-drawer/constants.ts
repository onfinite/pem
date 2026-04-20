import { Dimensions } from "react-native";
import {
  ShoppingCart,
  UserCheck,
  type LucideIcon,
} from "lucide-react-native";

export const SCREEN_H = Dimensions.get("window").height;

/** Small padding below the safe-area inset so drawers sit just under the dynamic island. */
const NOTCH_PAD = 8;

/** Y position where sheet drawers should start (just below dynamic island / notch). */
export function chatDrawerTopOffset(safeTop: number): number {
  return safeTop + NOTCH_PAD;
}

/** Drawer height from below header to bottom of screen. */
export function chatDrawerHeight(safeTop: number): number {
  return SCREEN_H - chatDrawerTopOffset(safeTop);
}

export const SWIPE_THRESHOLD = 80;

export const CALENDAR_EVENT_DOT_COLOR = "#5b8def";

export const BATCH_META: Record<string, { label: string; icon: LucideIcon }> = {
  shopping: { label: "Shopping", icon: ShoppingCart },
  follow_ups: { label: "Follow-ups", icon: UserCheck },
};
