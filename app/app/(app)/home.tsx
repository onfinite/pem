import AppHomeHeader from "@/components/layout/AppHomeHeader";
import ScreenScroll from "@/components/layout/ScreenScroll";
import PemButton from "@/components/PemButton";
import PemText from "@/components/PemText";
import { cardBackground, neutral, pemAmber, textSecondary } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { useClerk, useUser } from "@clerk/expo";
import { router } from "expo-router";
import { Alert, Pressable, StyleSheet, View } from "react-native";

export default function HomeScreen() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <ScreenScroll>
      <AppHomeHeader
        onSettingsPress={() =>
          Alert.alert("Settings", "Account and app settings will live here.")
        }
      />

      {email ? (
        <PemText variant="bodyMuted" style={styles.signedInAs}>
          Signed in as {email}
        </PemText>
      ) : null}

      <PemText variant="title" style={styles.sectionLabel}>
        Your preps
      </PemText>
      <PemText variant="bodyMuted" style={styles.sectionHint}>
        When you dump something, finished preps show up here as cards. Nothing yet.
      </PemText>

      <Pressable
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel="Record a dump placeholder"
        onPress={() =>
          Alert.alert("Record", "Recording flow will open from here.")
        }
      >
        <View style={styles.cardIcon}>
          <PemText style={styles.mic}>●</PemText>
        </View>
        <View style={styles.cardText}>
          <PemText variant="title">Record a dump</PemText>
          <PemText variant="bodyMuted" style={styles.cardSub}>
            Voice or text. Pem turns it into preps.
          </PemText>
        </View>
        <PemText variant="link">Start</PemText>
      </Pressable>

      <PemButton
        variant="ghost"
        onPress={async () => {
          await signOut();
          router.replace("/welcome");
        }}
        style={styles.signOut}
      >
        Sign out
      </PemButton>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  signedInAs: {
    marginBottom: space[6],
  },
  sectionLabel: {
    marginBottom: space[2],
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
  },
  sectionHint: {
    marginBottom: space[5],
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
    padding: space[5],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: neutral[300],
    backgroundColor: cardBackground,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: pemAmber,
    alignItems: "center",
    justifyContent: "center",
  },
  mic: {
    color: "#fff",
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans.bold,
  },
  cardText: {
    flex: 1,
    gap: space[1],
  },
  cardSub: {
    color: textSecondary,
  },
  signOut: {
    marginTop: space[10],
    alignSelf: "center",
  },
});
