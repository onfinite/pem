import * as Linking from "expo-linking";
import { Platform } from "react-native";

export type MailComposeChoice = {
  id: string;
  label: string;
  /** Short hint under the title (e.g. default mail app). */
  description?: string;
  url: string;
};

function buildQuery(subject: string | null, body: string): string {
  const p = new URLSearchParams();
  if (subject?.trim()) {
    p.set("subject", subject.trim());
  }
  p.set("body", body);
  return p.toString();
}

/**
 * Builds compose URLs for common mail apps. `mailto:` is the most reliable; others depend on the app being installed.
 */
export function buildMailComposeChoices(
  subject: string | null,
  body: string,
): MailComposeChoice[] {
  const q = buildQuery(subject, body);
  return [
    {
      id: "mail",
      label: "Mail",
      description: "Default email app",
      url: `mailto:?${q}`,
    },
    {
      id: "gmail",
      label: "Gmail",
      url: `googlegmail://co?${q}`,
    },
    {
      id: "outlook",
      label: "Outlook",
      url: `ms-outlook://compose?to=&${q}`,
    },
    {
      id: "yahoo",
      label: "Yahoo Mail",
      url: `ymail://mail/compose?${q}`,
    },
  ];
}

function schemeForCanOpenUrl(choice: MailComposeChoice): string {
  if (choice.id === "mail") {
    return "mailto:";
  }
  const u = choice.url;
  const idx = u.indexOf(":");
  return idx === -1 ? u : `${u.slice(0, idx + 1)}`;
}

/**
 * On iOS, filters to apps that report as openable (`canOpenURL`). On Android, returns all entries
 * (package visibility makes `canOpenURL` unreliable for third-party schemes).
 */
export async function mailComposeChoicesForDisplay(
  subject: string | null,
  body: string,
): Promise<MailComposeChoice[]> {
  const all = buildMailComposeChoices(subject, body);
  if (Platform.OS !== "ios") {
    return all;
  }
  const out: MailComposeChoice[] = [];
  for (const c of all) {
    try {
      const ok = await Linking.canOpenURL(schemeForCanOpenUrl(c));
      if (ok) {
        out.push(c);
      }
    } catch {
      if (c.id === "mail") {
        out.push(c);
      }
    }
  }
  return out.length > 0 ? out : all;
}

export async function openMailComposeUrl(url: string): Promise<void> {
  await Linking.openURL(url);
}
