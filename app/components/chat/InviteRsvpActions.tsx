import { useTheme } from "@/contexts/ThemeContext";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space, radii } from "@/constants/typography";
import { patchExtractRsvp } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { CalendarCheck, CalendarX, HelpCircle } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type RsvpResponse = "accepted" | "declined" | "tentative";

interface InviteRsvpActionsProps {
  extractId: string;
  currentStatus: string | null;
}

export default function InviteRsvpActions({
  extractId,
  currentStatus,
}: InviteRsvpActionsProps) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const [status, setStatus] = useState<string | null>(currentStatus);
  const [loading, setLoading] = useState(false);

  const handleRsvp = useCallback(
    async (response: RsvpResponse) => {
      if (loading) return;
      setLoading(true);
      try {
        await patchExtractRsvp(getToken, extractId, response);
        setStatus(response);
      } catch {
        /* non-critical */
      } finally {
        setLoading(false);
      }
    },
    [loading, getToken, extractId],
  );

  const isAccepted = status === "accepted";
  const isDeclined = status === "declined";
  const isTentative = status === "tentative";

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => handleRsvp("accepted")}
        style={[
          styles.btn,
          { borderColor: isAccepted ? pemAmber : colors.borderMuted },
          isAccepted && { backgroundColor: pemAmber + "18" },
        ]}
        disabled={loading}
      >
        <CalendarCheck size={14} color={isAccepted ? pemAmber : colors.textSecondary} />
        <Text
          style={[
            styles.btnText,
            { color: isAccepted ? pemAmber : colors.textSecondary },
          ]}
        >
          Accept
        </Text>
      </Pressable>

      <Pressable
        onPress={() => handleRsvp("declined")}
        style={[
          styles.btn,
          { borderColor: isDeclined ? colors.error : colors.borderMuted },
          isDeclined && { backgroundColor: colors.error + "18" },
        ]}
        disabled={loading}
      >
        <CalendarX size={14} color={isDeclined ? colors.error : colors.textSecondary} />
        <Text
          style={[
            styles.btnText,
            { color: isDeclined ? colors.error : colors.textSecondary },
          ]}
        >
          Decline
        </Text>
      </Pressable>

      <Pressable
        onPress={() => handleRsvp("tentative")}
        style={[
          styles.btn,
          { borderColor: isTentative ? colors.textSecondary : colors.borderMuted },
          isTentative && { backgroundColor: colors.textSecondary + "18" },
        ]}
        disabled={loading}
      >
        <HelpCircle size={14} color={colors.textSecondary} />
        <Text style={[styles.btnText, { color: colors.textSecondary }]}>
          Maybe
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: space[2],
    marginTop: space[2],
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: space[2],
    paddingVertical: 5,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  btnText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
  },
});
