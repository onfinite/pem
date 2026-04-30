const HTTP_URL = /https?:\/\/[^\s<>"']+/gi;

/** Removes http(s) URL substrings for display when showing link preview cards. */
export function stripHttpUrlsFromUserText(text: string): string {
  return text
    .replace(HTTP_URL, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
