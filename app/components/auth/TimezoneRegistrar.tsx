import { getMe, patchTimezone } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { useEffect, useRef } from "react";

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * After auth, send device IANA timezone once so the API can interpret dates.
 */
export default function TimezoneRegistrar() {
  const { isSignedIn, getToken } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (!isSignedIn || ran.current) return;
    ran.current = true;

    void (async () => {
      try {
        const me = await getMe(getToken);
        if (me.timezone) return;
        const tz = deviceTimeZone();
        await patchTimezone(getToken, tz);
      } catch {
        /* non-fatal */
      }
    })();
  }, [isSignedIn, getToken]);

  return null;
}
