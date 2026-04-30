/**
 * Inbox glance surfaces — aligned with `brand/pem-brand.html` + glance mock (warm cream / deep charcoal).
 */
export type InboxChrome = {
  page: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textDim: string;
  amberSoft: string;
  amberBorder: string;
  urgentBg: string;
  urgentBorder: string;
};

export function inboxChrome(resolved: "light" | "dark"): InboxChrome {
  if (resolved === "dark") {
    return {
      page: "#141410",
      surface: "#1c1c1e",
      surfaceMuted: "#232320",
      border: "#2a2a26",
      borderStrong: "#3a3a36",
      text: "#ffffff",
      textMuted: "#a8a8a4",
      textDim: "#787870",
      amberSoft: "rgba(232,118,58,0.10)",
      amberBorder: "rgba(232,118,58,0.22)",
      urgentBg: "rgba(255,69,58,0.08)",
      urgentBorder: "rgba(255,69,58,0.18)",
    };
  }
  return {
    page: "#f7f5f1",
    surface: "#ffffff",
    surfaceMuted: "#faf8f4",
    border: "#e8e2d8",
    borderStrong: "#d8d0c4",
    text: "#1c1a16",
    textMuted: "#6b6560",
    textDim: "#8a8278",
    amberSoft: "rgba(232,118,58,0.08)",
    amberBorder: "rgba(232,118,58,0.22)",
    urgentBg: "rgba(215,0,21,0.06)",
    urgentBorder: "rgba(215,0,21,0.15)",
  };
}
