import AppMenuButton from "@/components/navigation/AppMenuButton";
import PemText from "@/components/ui/PemText";
import type { InboxChrome } from "@/constants/inboxChrome";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { pemAmber } from "@/constants/theme";
import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import { Image, Pressable, StyleSheet, View } from "react-native";

type Props = {
  chrome: InboxChrome;
};

export default function InboxHeader({ chrome }: Props) {
  const { user } = useUser();
  const url = user?.imageUrl;

  return (
    <View style={styles.row}>
      <AppMenuButton tintColor={chrome.text} />
      <PemText
        style={{
          flex: 1,
          marginLeft: space[2],
          fontFamily: fontFamily.display.italic,
          fontStyle: "italic",
          fontSize: fontSize.lg,
          color: pemAmber,
          fontWeight: "200",
        }}
      >
        pem
      </PemText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        onPress={() => router.push("/settings")}
        hitSlop={12}
      >
        {url ? (
          <Image source={{ uri: url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPh, { backgroundColor: chrome.surfaceMuted }]}>
            <PemText variant="caption" style={{ color: chrome.textMuted }}>
              {(user?.firstName?.[0] ?? "?").toUpperCase()}
            </PemText>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[4],
    paddingBottom: space[2],
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarPh: {
    alignItems: "center",
    justifyContent: "center",
  },
});
