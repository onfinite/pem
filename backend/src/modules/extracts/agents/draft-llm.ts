import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const DRAFT_SYSTEM = `You are Pem, drafting a message on behalf of the user.

Rules:
- Write a brief, natural message the user can send.
- Match the appropriate tone: professional for work, casual for friends/family.
- Keep it concise — 2-5 sentences max.
- Do NOT include greetings like "Dear" unless it's clearly formal.
- Do NOT sign off with the user's name.
- Output ONLY the message text, nothing else.`;

export async function generateExtractDraftText(params: {
  apiKey: string;
  userPrompt: string;
}): Promise<string> {
  const openai = createOpenAI({ apiKey: params.apiKey });
  const result = await generateText({
    model: openai('gpt-4o'),
    system: DRAFT_SYSTEM,
    prompt: params.userPrompt,
  });
  return result.text.trim();
}
