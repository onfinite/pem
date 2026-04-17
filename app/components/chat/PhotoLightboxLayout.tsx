import {
  photoLightboxBackdrop,
  photoLightboxCloseBorder,
  photoLightboxCloseFill,
  photoLightboxIcon,
} from "@/constants/photoLightbox.constants";
import { space, radii } from "@/constants/typography";
import { StatusBar } from "expo-status-bar";
import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PhotoLightboxLayoutProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function PhotoLightboxLayout({
  visible,
  onRequestClose,
  children,
  footer,
}: PhotoLightboxLayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle={Platform.OS === "ios" ? "overFullScreen" : undefined}
      statusBarTranslucent={Platform.OS === "android"}
      onRequestClose={onRequestClose}
    >
      <View style={styles.root}>
        <StatusBar style="light" />
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onRequestClose}
          accessibilityLabel="Dismiss photo"
          accessibilityRole="button"
        />
        <View style={styles.layer} pointerEvents="box-none">
          <Pressable
            onPress={onRequestClose}
            style={[
              styles.closeBtn,
              {
                top: insets.top + space[2],
                right: space[3],
              },
            ]}
            hitSlop={16}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <X size={26} color={photoLightboxIcon} strokeWidth={2.2} />
          </Pressable>
          <View
            style={[
              styles.body,
              { paddingTop: insets.top + space[6] },
            ]}
          >
            {children}
          </View>
          {footer ? (
            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom, space[4]) },
              ]}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: photoLightboxBackdrop,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  closeBtn: {
    position: "absolute",
    zIndex: 3,
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: photoLightboxCloseFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: photoLightboxCloseBorder,
  },
  body: {
    flex: 1,
    justifyContent: "center",
  },
  footer: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
    gap: space[2],
  },
});
