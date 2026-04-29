import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const LIGHTWEIGHT_MEMORY_SYSTEM = `You extract durable personal facts from casual messages. Output ONLY a JSON array of {memory_key, note} objects for facts worth remembering about the user — name, location, job, family, preferences, habits, allergies, pets, what they enjoy or find restorative, etc. If there are NO durable facts, output an empty array []. Examples:
- "thanks, I'm heading to the gym now" → [{"memory_key": "exercise", "note": "Goes to the gym regularly"}]
- "hey" → []
- "what's the weather like in paris" → []
- "btw I'm vegan" → [{"memory_key": "diet", "note": "Vegan"}]
- "I really enjoyed being in nature this weekend" → [{"memory_key": "preferences", "note": "Enjoys time in nature; finds it restorative"}]
- "I love hiking" → [{"memory_key": "preferences", "note": "Loves hiking"}]`;

const OFF_TOPIC_REDIRECT_SYSTEM = `You are Pem — the place people dump whatever's on their mind so their head stays clear. You organize their tasks, calendar, and memory. The user asked something you genuinely can't answer (weather, sports, trivia, etc.). Be honest and natural — like a friend would say "I don't know that one." If there's a related way you CAN help (set a reminder, note it, add to their list), mention it briefly. 1-2 sentences. No markdown. No filler endings ("let me know", "feel free to ask"). Don't be defensive — just be real.`;

const MERGE_SUMMARY_SYSTEM = `You maintain a concise profile summary of a person for their AI assistant.

Rules:
- Merge the NEW information into the EXISTING summary.
- KEEP all existing facts — goals, habits, preferences, relationships, worries, life situation.
- ADD the new information naturally alongside what already exists.
- If new info CONFLICTS with old info, keep both with context (e.g. "Previously focused on X, now shifting toward Y").
- If new info REINFORCES existing facts, strengthen the language.
- Write in third person, warm and accurate tone.
- Keep under 300 words. Be concise but complete.
- Output ONLY the merged summary text, no preamble.`;

const COMPRESS_SUMMARY_SYSTEM =
  'Compress this profile summary to under 1500 characters while keeping all key facts. Output ONLY the compressed summary.';

const SEED_SUMMARY_SYSTEM = `You summarize what you know about a person from their messages to an AI assistant.
Write a ~200 word profile summary covering: name (if mentioned), life situation, goals, priorities, worries, routines, and personality.
Be warm and accurate. Only include facts clearly present. Write in third person.
Output ONLY the summary text, no preamble.`;

export async function extractLightweightMemoryJson(params: {
  apiKey: string;
  contentSlice: string;
}): Promise<string> {
  const openai = createOpenAI({ apiKey: params.apiKey });
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    maxOutputTokens: 512,
    temperature: 0,
    system: LIGHTWEIGHT_MEMORY_SYSTEM,
    prompt: params.contentSlice,
  });
  return text;
}

export async function generateOffTopicRedirectText(params: {
  apiKey: string;
  userMessageSlice: string;
}): Promise<string> {
  const openai = createOpenAI({ apiKey: params.apiKey });
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    maxOutputTokens: 256,
    system: OFF_TOPIC_REDIRECT_SYSTEM,
    prompt: params.userMessageSlice,
  });
  return text;
}

export async function mergeUserSummaryWithNewInfo(params: {
  apiKey: string;
  existing: string;
  newInfo: string;
}): Promise<string> {
  const openai = createOpenAI({ apiKey: params.apiKey });
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: MERGE_SUMMARY_SYSTEM,
    prompt: `EXISTING SUMMARY:\n${params.existing}\n\nNEW INFORMATION:\n${params.newInfo}`,
    maxOutputTokens: 1024,
  });
  return text.trim() || params.existing;
}

export async function compressProfileSummary(params: {
  apiKey: string;
  text: string;
}): Promise<string> {
  const openai = createOpenAI({ apiKey: params.apiKey });
  const { text: compressed } = await generateText({
    model: openai('gpt-4o-mini'),
    maxOutputTokens: 1024,
    system: COMPRESS_SUMMARY_SYSTEM,
    prompt: params.text,
  });
  return compressed.trim() || params.text;
}

export async function seedUserSummaryFromMessages(params: {
  apiKey: string;
  msgTexts: string;
}): Promise<string> {
  const openai = createOpenAI({ apiKey: params.apiKey });
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: SEED_SUMMARY_SYSTEM,
    prompt: `Here are the user's recent messages:\n\n${params.msgTexts}`,
  });
  return text.trim();
}
