import PemLogoRow from "@/components/brand/PemLogoRow";
import SocialSignInButtons from "@/components/auth/SocialSignInButtons";
import ScreenScroll from "@/components/layout/ScreenScroll";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import { StyleSheet, View } from "react-native";

export default function WelcomeScreen() {
  const { colors } = useTheme();
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null;
  }
  if (isSignedIn) {
    return <Redirect href="/home" />;
  }

  return (
    <ScreenScroll
      backgroundColor={colors.surfacePage}
      bottomInset={space[10]}
      contentStyle={styles.scrollInner}
    >
      <View style={styles.column}>
        <PemLogoRow size="large" />
        <PemText variant="display" style={styles.heroLine1}>
          Whatever&apos;s on your mind
        </PemText>
        <PemText variant="brandItalic" style={styles.heroLine2}>
          Pem&apos;s got it.
        </PemText>
        <PemText variant="bodyMuted" style={styles.heroBody}>
          Dump what’s on your mind in text. Pem researches, drafts, and finds your options while you live your
          life. Come back when your preps are ready — you act in seconds.
        </PemText>
        <View style={styles.authBlock}>
          <SocialSignInButtons />
        </View>
      </View>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  scrollInner: {
    flexGrow: 1,
    justifyContent: "center",
    paddingTop: space[6],
    paddingBottom: space[6],
  },
  column: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    alignItems: "center",
  },
  heroLine1: {
    marginTop: space[8],
    textAlign: "center",
    fontSize: 28,
    lineHeight: 34,
  },
  heroLine2: {
    marginTop: space[2],
    textAlign: "center",
    fontSize: 28,
    lineHeight: 34,
  },
  heroBody: {
    marginTop: space[6],
    textAlign: "center",
    paddingHorizontal: space[2],
  },
  authBlock: {
    marginTop: space[10],
    width: "100%",
    alignItems: "center",
  },
});
