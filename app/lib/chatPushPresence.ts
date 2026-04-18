/**
 * While the Chat screen is focused, suppress chat_reply push banners (SSE already shows the reply).
 * Other routes stay false so pushes still surface when the app is open but not on chat.
 */
export const isChatScreenFocusedRef = { current: false };

export function setChatScreenFocused(value: boolean): void {
  isChatScreenFocusedRef.current = value;
}
