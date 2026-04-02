import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { getPrepLogs, type ApiPrepLog } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

type Props = { prepId: string };

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function PrepDetailActivity({ prepId }: Props) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const [logs, setLogs] = useState<ApiPrepLog[] | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const rows = await getPrepLogs(getToken, prepId);
      setLogs(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setLogs([]);
    }
  }, [getToken, prepId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (logs === undefined && !err) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.pemAmber} />
      </View>
    );
  }

  if (err || !logs?.length) {
    return null;
  }

  return (
    <View style={[styles.wrap, { borderColor: colors.borderMuted, backgroundColor: colors.cardBackground }]}>
      <PemText style={[styles.title, { color: colors.textPrimary }]}>Activity</PemText>
      <View style={styles.gap}>
        {logs.map((log) => (
          <View key={log.id} style={styles.row}>
            <PemText style={[styles.time, { color: colors.textSecondary }]}>{formatTime(log.created_at)}</PemText>
            <View style={styles.rowBody}>
              <PemText style={[styles.step, { color: colors.pemAmber }]}>{log.step}</PemText>
              <PemText style={[styles.msg, { color: colors.textSecondary }]}>{log.message}</PemText>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: space[2],
  },
  wrap: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: space[4],
    gap: space[3],
  },
  title: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  gap: {
    gap: space[3],
  },
  row: {
    flexDirection: "row",
    gap: space[3],
    alignItems: "flex-start",
  },
  time: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.sans.regular,
    width: 52,
    paddingTop: 2,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  step: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    textTransform: "capitalize",
  },
  msg: {
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
  },
});
