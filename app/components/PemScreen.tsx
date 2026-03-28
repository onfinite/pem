import { pageBackground } from "@/constants/theme";
import { space } from "@/constants/typography";
import type { ReactNode } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";

export type PemScreenVariant = "screen" | "padded" | "center";

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: pageBackground,
  },
  padded: {
    flex: 1,
    backgroundColor: pageBackground,
    paddingHorizontal: space[4],
    paddingVertical: space[4],
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: pageBackground,
  },
});

type PemScreenProps = Omit<ViewProps, "style"> & {
  variant?: PemScreenVariant;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export default function PemScreen({
  variant = "screen",
  style,
  children,
  ...rest
}: PemScreenProps) {
  return (
    <View style={[styles[variant], style]} {...rest}>
      {children}
    </View>
  );
}
