/** Jest ESM shim — `expo-server-sdk` ships ESM-only; tests mock it. */
export type ExpoPushMessage = {
  to?: string;
  sound?: string;
  title?: string;
  body?: string;
  data?: unknown;
};

export default class Expo {
  static isExpoPushToken(token: string): boolean {
    return typeof token === 'string' && token.length > 0;
  }

  chunkPushNotifications(messages: unknown[]) {
    return [messages];
  }

  sendPushNotificationsAsync() {
    return Promise.resolve([{ status: 'ok' as const }]);
  }
}
