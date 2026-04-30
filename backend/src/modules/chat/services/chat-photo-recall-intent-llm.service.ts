import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const photoRecallIntentSchema = z.object({
  attachRelevantPastPhotos: z.boolean(),
  orderedMessageIds: z.array(z.string()).optional(),
  embeddingSearchHint: z.string().nullable().optional(),
});

export type PhotoRecallIntentOutput = z.infer<typeof photoRecallIntentSchema>;

@Injectable()
export class ChatPhotoRecallIntentLlmService {
  constructor(private readonly config: ConfigService) {}

  async classifyIntent(params: {
    userText: string;
    numberedCandidatesBlock: string;
  }): Promise<PhotoRecallIntentOutput | null> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return null;
    const modelId = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';
    const openai = createOpenAI({ apiKey });
    const result = await generateText({
      model: openai(modelId),
      output: Output.object({
        name: 'photo_recall_intent',
        description:
          'Whether to show past chat photo thumbnails and optional search hints',
        schema: photoRecallIntentSchema,
      }),
      temperature: 0.2,
      maxRetries: 1,
      system: this.photoRecallIntentSystemPrompt(),
      prompt: this.photoRecallIntentUserPrompt(
        params.userText,
        params.numberedCandidatesBlock,
      ),
      providerOptions: { openai: { strictJsonSchema: false } },
    });
    const out = result.output;
    if (!out) return null;
    return {
      attachRelevantPastPhotos: out.attachRelevantPastPhotos,
      orderedMessageIds: out.orderedMessageIds ?? [],
      embeddingSearchHint: out.embeddingSearchHint ?? null,
    };
  }

  private photoRecallIntentSystemPrompt(): string {
    return `
You decide whether to attach a "From your photos" strip: small thumbnails of photos the user already sent in this chat (not from the web).

Set attachRelevantPastPhotos to true when ANY of these apply AND at least one candidate row plausibly relates:
- They ask to see, find, show, recall, open, or browse past photos/pictures/images/screenshots they sent.
- They are doing memory or conversation recall where images would help: e.g. what did we discuss with [person], remind me about [meeting/topic/trip], what did we talk about when, trying to remember [event] — and a candidate's caption or vision excerpt ties to that person, place, meeting, or topic.

Set attachRelevantPastPhotos to false when:
- They pasted or shared a **web link** (Amazon, article, etc.) or the message is mostly a URL — even if it is a product. That is not a request to surface old chat photos. attachRelevantPastPhotos must be false unless they explicitly ask about a **photo they sent** or memory recall tied to images.
- They are mainly describing or captioning what they are sending right now ("here is a photo from my meeting", "pic from lunch") without asking to remember past discussion or past photos.
- They ask about tasks, calendar, or lists with no recall of a person/meeting/conversation and no ask for images.
- They only want **current** shopping or grocery **inventory** ("what's on my shopping list", "what do I need from the store", "what's on my list for Costco", "near Target what's on my list") with no mention of photos, remembering, a specific past trip, or a specific product/person to jog memory — do not attach old list snapshots; open tasks in the app are the source of truth for that.
- They say they **finished** shopping or **bought** everything ("got it all", "picked everything up", "done at Costco", "bought them all") — no strip for that turn.
- Bare confirmations ("yes", "ok", "sure", "go ahead") or short commands like "add them to my shopping list" with no mention of past photos, pictures, or remembering — never attach a strip for those.
- None of the candidates plausibly relate to their message (do not attach unrelated photos just because they exist).

Set attachRelevantPastPhotos to true when (in addition to the rules above) for shopping or errands: they ask about a **specific** item, brand, person, or remembered context ("milk for Arshad", "that PediaSure", "what was on the list in the photo I sent", "remember the Costco list") and a candidate clearly matches — then photos help.

When true, optional embeddingSearchHint: short English phrase for semantic image search (e.g. "Farin meeting discussion", "LA trip beach"). Use names/topics from their message.

When true, optional orderedMessageIds: candidate message ids best-matching their request, best first. Prefer ids whose caption/vision clearly match. Omit if unsure — search will still run.
- orderedMessageIds: list **only** images that clearly match the topic (e.g. the kid card / flyer). Do **not** include generic screenshots (todo lists, random UI, unrelated errands) even if they feel vaguely “life admin” — those will confuse the strip.
`.trim();
  }

  private photoRecallIntentUserPrompt(
    message: string,
    numberedCandidates: string,
  ): string {
    return `User message:
"""${message.slice(0, 4000)}"""

Past user photo messages in chat (id — caption — vision excerpt):
${numberedCandidates}`.trim();
  }
}
