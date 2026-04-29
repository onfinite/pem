import { createOpenAI } from '@ai-sdk/openai';
import { embed } from 'ai';

export async function embedTextWithOpenAI(params: {
  apiKey: string;
  text: string;
}): Promise<number[]> {
  const openai = createOpenAI({ apiKey: params.apiKey });
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: params.text,
  });
  return embedding;
}
