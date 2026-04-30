import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import type { ReactNode } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

export type PemTextFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
  /** Optional right slot (e.g. icon) */
  accessoryRight?: ReactNode;
};

export default function PemTextField({
  label,
  error,
  containerStyle,
  accessoryRight,
  style,
  ...inputProps
}: PemTextFieldProps) {
  const { colors } = useTheme();

  return (
    <View style={containerStyle}>
      <PemText variant="label" style={styles.label}>
        {label}
      </PemText>
      <View
        style={[
          styles.fieldRow,
          {
            borderColor: error ? colors.error : colors.border,
            backgroundColor: colors.secondarySurface,
          },
        ]}
      >
        <TextInput
          placeholderTextColor={colors.placeholder}
          style={[
            styles.input,
            { color: colors.textPrimary },
            style,
          ]}
          {...inputProps}
        />
        {accessoryRight ? (
          <View style={styles.accessory}>{accessoryRight}</View>
        ) : null}
      </View>
      {error ? (
        <PemText variant="caption" style={[styles.errorText, { color: colors.error }]}>
          {error}
        </PemText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: space[2],
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontSize: fontSize.xs,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radii.sm,
    minHeight: 48,
  },
  input: {
    flex: 1,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, lineHeight.relaxed),
  },
  accessory: {
    paddingRight: space[3],
  },
  errorText: {
    marginTop: space[1],
  },
});
