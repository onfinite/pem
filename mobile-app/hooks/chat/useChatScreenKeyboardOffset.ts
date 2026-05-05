import { useEffect, useRef } from "react";
import { Animated, Keyboard, Platform } from "react-native";

/** Animated bottom inset for chat chrome when the keyboard is visible. */
export function useChatScreenKeyboardOffset(insetsBottom: number) {
  const kbHeight = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(kbHeight, {
        toValue: e.endCoordinates.height - insetsBottom,
        duration: 120,
        useNativeDriver: false,
      }).start();
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      Animated.timing(kbHeight, {
        toValue: 0,
        duration: 100,
        useNativeDriver: false,
      }).start();
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [kbHeight, insetsBottom]);
  return kbHeight;
}
