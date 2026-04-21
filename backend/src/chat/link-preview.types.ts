/** Client-facing summary of a fetched link on a chat message. */
export type ChatLinkPreviewSerialized = {
  original_url: string;
  canonical_url: string | null;
  title: string | null;
  content_type: string | null;
  fetch_status: string;
  summary: string | null;
  /** From extracted_metadata when present (e.g. product image). */
  image_url: string | null;
};
