import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Extends static `app.json` so we can inject secrets from env.
 * `EXPO_PUBLIC_EAS_PROJECT_ID` is required for Expo push tokens on a dev/standalone build
 * (run `eas init` in `mobile-app/` and paste the project ID, or add it under `expo.extra.eas` in EAS).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  const extra = config.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = fromEnv || extra?.eas?.projectId || "";

  return {
    ...config,
    extra: {
      ...config.extra,
      eas: {
        ...extra?.eas,
        projectId,
      },
    },
  };
};
