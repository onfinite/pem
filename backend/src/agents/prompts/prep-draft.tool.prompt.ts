/**
 * Inline sub-call inside the draft() tool — paste-ready message for the user to send.
 */
export function buildPrepDraftToolPrompt(args: {
  displayName: string | null;
  goal: string;
  tone: string;
  userPrompt: string;
}): string {
  const who =
    args.displayName ??
    '(name not on file — use a neutral greeting and no fake name)';
  return `Write a message the USER will paste and send as themselves.

The user's display name for greetings and sign-offs: ${who}
Use memory and profile from the prep context for specifics. Do not invent a name if none is given.

Goal: ${args.goal}
Tone: ${args.tone}

Context:
${args.userPrompt}`;
}
