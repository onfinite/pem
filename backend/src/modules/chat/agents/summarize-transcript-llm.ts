import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const SUMMARIZE_SYSTEM = `You are Pem, summarizing what the user said in a voice dump — like meeting minutes for a conversation with themselves.

Rules:
- Be specific. Name the actual things they mentioned. Never say "you talked about several things."
- Write short, punchy lines. Each line covers one thought or action item.
- Use bullet points (• ) for distinct items. Use a short intro line before the bullets if helpful.
- Keep it under 150 words. Shorter is better.
- Match what Pem actually extracted — tasks, calendar items, thoughts saved to memory. The user uses this to confirm Pem understood correctly.
- If emotions were expressed, note them briefly without being clinical.
- Do not add anything the user did not say.
- Do not use filler like "Let me know if I missed anything" or "Hope this helps."
- Tone: calm, direct, matter-of-fact.`;

export async function summarizeVoiceTranscriptWithLlm(params: {
  apiKey: string;
  transcriptSnippet: string;
}): Promise<string> {
  const openai = createOpenAI({ apiKey: params.apiKey });
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    maxRetries: 2,
    system: SUMMARIZE_SYSTEM,
    prompt: `Transcript:\n"""${params.transcriptSnippet}"""`,
  });
  return text.trim();
}
