import PemText from "@/components/ui/PemText";
import { pemAmber } from "@/constants/theme";
import { fontFamily, radii, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import {
  connectAppleCalendar,
  disconnectCalendar,
  disconnectCalendarById,
  getCalendarConnections,
  getGoogleAuthUrl,
  setCalendarPrimary,
  syncAppleCalendar,
  type CalendarConnection,
} from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import * as Calendar from "expo-calendar";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { triggerCalendarSync } from "@/lib/pemApi";
import { CalendarDays, Crown, Plus, RefreshCw, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";

export default function CalendarSection() {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getCalendarConnections(() => getTokenRef.current());
      setConnections(res.connections);
    } catch {}
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connectGoogle = useCallback(async () => {
    setLoading(true);
    try {
      const appRedirect = Linking.createURL("calendar/connected");
      const { url } = await getGoogleAuthUrl(
        () => getTokenRef.current(),
        appRedirect,
      );
      const result = await WebBrowser.openAuthSessionAsync(url, appRedirect);
      if (result.type === "success") {
        await load();
      }
    } catch (e) {
      Alert.alert("Could not connect", e instanceof Error ? e.message : "Try again.");
    } finally {
      setLoading(false);
    }
  }, [load]);

  const connectApple = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Calendar access", "Pem needs calendar access to read your events.");
        return;
      }
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writableIds = calendars
        .filter((c) => c.allowsModifications)
        .map((c) => c.id);

      if (writableIds.length === 0) {
        Alert.alert("No calendars", "No writable calendars found on this device.");
        return;
      }

      const conn = await connectAppleCalendar(() => getTokenRef.current(), writableIds);

      const now = new Date();
      const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const events = await Calendar.getEventsAsync(writableIds, now, twoWeeks);
      const mapped = events.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: e.startDate instanceof Date ? e.startDate.toISOString() : String(e.startDate),
        endDate: e.endDate instanceof Date ? e.endDate.toISOString() : String(e.endDate),
        location: e.location ?? undefined,
      }));

      await syncAppleCalendar(() => getTokenRef.current(), conn.id, mapped);
      await load();
    } catch (e) {
      Alert.alert("Could not connect", e instanceof Error ? e.message : "Try again.");
    } finally {
      setLoading(false);
    }
  }, [load]);

  const makePrimary = useCallback(
    async (id: string) => {
      await setCalendarPrimary(() => getTokenRef.current(), id);
      await load();
    },
    [load],
  );

  const disconnectGoogle = useCallback(
    (conn: CalendarConnection) => {
      const label = conn.google_email ?? "this Google account";
      Alert.alert(`Disconnect ${label}?`, "Events from this account will stop syncing.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            await disconnectCalendarById(() => getTokenRef.current(), conn.id);
            await load();
          },
        },
      ]);
    },
    [load],
  );

  const disconnectAppleAlert = useCallback(() => {
    Alert.alert("Disconnect Apple Calendar?", "Events will stop syncing.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          await disconnectCalendar(() => getTokenRef.current(), "apple");
          await load();
        },
      },
    ]);
  }, [load]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await triggerCalendarSync(() => getTokenRef.current());
      await load();
    } catch { /* ignore */ }
    setSyncing(false);
  }, [load]);

  const googleConns = connections.filter((c) => c.provider === "google");
  const apple = connections.find((c) => c.provider === "apple");

  return (
    <View>
      <PemText variant="label" style={styles.sectionLabel}>
        Calendar
      </PemText>
      <PemText variant="caption" style={styles.sectionHint}>
        Connect calendars so Pem knows what{"\u2019"}s coming. One is primary for
        writing events.
      </PemText>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.cardBackground,
            borderColor: colors.borderMuted,
          },
        ]}
      >
        {/* Google accounts */}
        {googleConns.map((g, i) => (
          <View key={g.id}>
            {i > 0 && (
              <View style={[styles.divider, { backgroundColor: colors.borderMuted }]} />
            )}
            <ConnectionRow
              icon={<CalendarDays size={20} stroke={colors.textSecondary} strokeWidth={1.8} />}
              title={g.google_email ?? "Google Calendar"}
              subtitle="Google"
              isPrimary={g.is_primary}
              lastSyncedAt={g.last_synced_at}
              colors={colors}
              onMakePrimary={() => void makePrimary(g.id)}
              onDisconnect={() => disconnectGoogle(g)}
              onSync={handleSync}
              syncing={syncing}
            />
          </View>
        ))}

        {/* Add Google account button */}
        {googleConns.length > 0 && (
          <View style={[styles.divider, { backgroundColor: colors.borderMuted }]} />
        )}
        <Pressable
          style={styles.addRow}
          accessibilityRole="button"
          accessibilityLabel="Add Google account"
          onPress={connectGoogle}
          disabled={loading}
        >
          <Plus size={18} stroke={pemAmber} strokeWidth={2} />
          <PemText variant="body" style={{ color: pemAmber }}>
            {googleConns.length > 0 ? "Add another Google account" : "Connect Google Calendar"}
          </PemText>
        </Pressable>

        {/* Apple Calendar */}
        {Platform.OS === "ios" ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.borderMuted }]} />
            {apple ? (
              <ConnectionRow
                icon={<CalendarDays size={20} stroke={colors.textSecondary} strokeWidth={1.8} />}
                title="Apple Calendar"
                subtitle={`${apple.apple_calendar_ids?.length ?? 0} calendar${(apple.apple_calendar_ids?.length ?? 0) !== 1 ? "s" : ""}`}
                isPrimary={apple.is_primary}
                lastSyncedAt={apple.last_synced_at}
                colors={colors}
                onMakePrimary={() => void makePrimary(apple.id)}
                onDisconnect={disconnectAppleAlert}
              />
            ) : (
              <Pressable
                style={styles.addRow}
                accessibilityRole="button"
                accessibilityLabel="Connect Apple Calendar"
                onPress={connectApple}
                disabled={loading}
              >
                <Plus size={18} stroke={pemAmber} strokeWidth={2} />
                <PemText variant="body" style={{ color: pemAmber }}>
                  Connect Apple Calendar
                </PemText>
              </Pressable>
            )}
          </>
        ) : null}
      </View>
    </View>
  );
}

/* ── Reusable row for a connected calendar ─────────────── */

function formatRelativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ConnectionRow({
  icon,
  title,
  subtitle,
  isPrimary,
  lastSyncedAt,
  colors,
  onMakePrimary,
  onDisconnect,
  onSync,
  syncing,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  isPrimary: boolean;
  lastSyncedAt?: string | null;
  colors: ReturnType<typeof import("@/contexts/ThemeContext").useTheme>["colors"];
  onMakePrimary: () => void;
  onDisconnect: () => void;
  onSync?: () => void;
  syncing?: boolean;
}) {
  const lastSynced = formatRelativeTime(lastSyncedAt ?? null);

  return (
    <View style={styles.row}>
      {icon}
      <View style={styles.rowText}>
        <PemText variant="body" style={{ color: colors.textPrimary }} numberOfLines={1}>
          {title}
        </PemText>
        <PemText variant="caption" style={{ color: colors.textSecondary }}>
          {subtitle}{lastSynced ? ` · Synced ${lastSynced}` : ""}
        </PemText>
      </View>
      <View style={styles.rowActions}>
        {onSync && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sync now"
            onPress={onSync}
            disabled={syncing}
            hitSlop={8}
          >
            <RefreshCw
              size={16}
              stroke={syncing ? colors.textTertiary : pemAmber}
              strokeWidth={1.8}
            />
          </Pressable>
        )}
        {isPrimary ? (
          <View style={[styles.primaryBadge, { backgroundColor: colors.brandMutedSurface }]}>
            <PemText
              style={{
                fontSize: 9,
                fontFamily: fontFamily.sans.medium,
                fontWeight: "500",
                color: pemAmber,
              }}
            >
              PRIMARY
            </PemText>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Make primary"
            onPress={onMakePrimary}
            hitSlop={8}
          >
            <Crown size={16} stroke={colors.textSecondary} strokeWidth={1.8} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Disconnect"
          onPress={onDisconnect}
          hitSlop={8}
        >
          <Trash2 size={16} stroke="#ff453a" strokeWidth={1.8} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginBottom: space[2],
    marginTop: space[2],
  },
  sectionHint: {
    marginBottom: space[4],
    opacity: 0.95,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: space[4],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },
  rowText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[1],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: space[3],
  },
  primaryBadge: {
    paddingHorizontal: space[2],
    paddingVertical: 2,
    borderRadius: 5,
  },
});
