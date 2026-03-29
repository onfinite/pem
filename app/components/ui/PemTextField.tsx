import PemText from "@/components/PemText";
import { error as errorColor, neutral, textPrimary } from "@/constants/theme";
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
  return (
    <View style={containerStyle}>
      <PemText variant="label" style={styles.label}>
        {label}
      </PemText>
      <View style={[styles.fieldRow, error ? styles.fieldError : null]}>
        <TextInput
          placeholderTextColor={neutral[400]}
          style={[styles.input, style]}
          {...inputProps}
        />
        {accessoryRight ? (
          <View style={styles.accessory}>{accessoryRight}</View>
        ) : null}
      </View>
      {error ? (
        <PemText variant="caption" style={styles.errorText}>
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
    borderColor: neutral[300],
    borderRadius: radii.sm,
    backgroundColor: neutral.white,
    minHeight: 48,
  },
  fieldError: {
    borderColor: errorColor,
  },
  input: {
    flex: 1,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, lineHeight.relaxed),
    color: textPrimary,
  },
  accessory: {
    paddingRight: space[3],
  },
  errorText: {
    color: errorColor,
    marginTop: space[1],
  },
});
