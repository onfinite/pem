import type Swipeable from "react-native-gesture-handler/Swipeable";

let active: Swipeable | null = null;

/** Closes any open task row swipe (animated). */
export function dismissOpenTaskSwipe() {
  active?.close();
  active = null;
}

export function notifyTaskSwipeOpened(row: Swipeable) {
  if (active && active !== row) {
    active.close();
  }
  active = row;
}

export function notifyTaskSwipeClosed(row: Swipeable) {
  if (active === row) {
    active = null;
  }
}

export function releaseTaskSwipe(row: Swipeable) {
  if (active === row) {
    active = null;
  }
}
