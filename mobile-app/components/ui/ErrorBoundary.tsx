import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleRestart = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={s.root}>
          <Text style={s.heading}>Something went wrong</Text>
          <Text style={s.body}>
            An unexpected error occurred. Please try restarting.
          </Text>
          <Pressable style={s.btn} onPress={this.handleRestart}>
            <Text style={s.btnText}>Restart</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: space[6],
    backgroundColor: "#faf8f4",
  },
  heading: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    color: "#1c1a16",
    marginBottom: space[3],
  },
  body: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    color: "#6b6560",
    textAlign: "center",
    marginBottom: space[6],
  },
  btn: {
    backgroundColor: pemAmber,
    paddingHorizontal: space[6],
    paddingVertical: 14,
    borderRadius: radii.lg,
  },
  btnText: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.base,
    color: "#fff",
  },
});
