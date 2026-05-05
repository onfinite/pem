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
          'Episodic recall only: attach past chat photo thumbnails when the user is reconnecting with something they showed you before, or explicitly asked for those images. Default false.',
        schema: photoRecallIntentSchema,
      }),
      temperature: 0.1,
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
You decide whether to attach a "From your photos" strip: small thumbnails of images the user already sent in this chat (not from the web).

## What this is for
Episodic recall: they shared something in a photo weeks or months ago, and **this turn** is about **remembering that moment** or **Pem's answer genuinely needs what was in that image** (e.g. "what did we decide about the flyer?", "which car was I looking at?", "remind me what that doc said"). The strip exists so Pem and the user can **tie the reply to the same visual context** — not to decorate messages when a random word matches an old picture.

## Default
attachRelevantPastPhotos = **false** unless you are confident the strip is **materially useful** for this turn. If unsure, false. Do not maintain a mental list of "bad topics"; use judgment from the principle above.

## When true (need a plausible match in the candidate list)
Set true when **both** of the following hold:
1) **Intent**: They explicitly want past images they sent (show/find/open/bring up that photo, what did I send, photos I shared, etc.) **or** they are reconstructing memory / conversation / a past situation where **seeing what they photographed** is part of answering. **Also true** when they ask what you **recall**, **remember**, or **know about** a **named topic** ("anything about Tesla?", "do you remember what we said about the lease?") and a candidate photo **plausibly** relates to that topic — images are part of what they shared, even if they did not say the word "photo".
2) **Evidence**: At least one candidate row's caption or vision excerpt **reasonably** matches that recall target (same scene, document, person, trip, or whiteboard/diagram — prefer the strongest match first in **orderedMessageIds**). If they use words like **diagram**, **screenshot**, or **photo of X**, prefer candidates whose vision text mentions the same subject even when the caption is empty.

When you set **attachRelevantPastPhotos: true**, always populate **orderedMessageIds** (best match first, up to a few ids) whenever **any** candidate is a plausible fit. Downstream search may miss; your ordering still grounds the reply.

## When false (examples of shape, not an exhaustive keyword list)
- They are doing **current operations** only: tasks, calendar, lists, confirmations, new instructions — with no ask to remember **earlier** images or **earlier** visual context.
- They are **captioning what they are sending right now** without asking about older photos or older discussion.
- They pasted a **web link** or the turn is mostly a URL — unless they explicitly tie it to **a photo they sent in chat**.
- **No candidate** clearly matches the recall they need, or thumbnails would be **ornamental** (mentioning a topic that happens to appear in an old image is not enough).
- Shopping / errands: true **only** if they anchor to **remembering** or **the photo they sent** (e.g. "what was on the list in the picture I sent"); not for generic "what's on my list" or product chatter without that anchor.

When the user message includes a **"Recent chat:"** block, that is prior turns in this thread — use it to resolve vague references (**"the photo"**, **"that picture"**, **"bring it up"**) to the real subject they were just discussing (names, places, products from that block). If they ask for **the** photo right after discussing something, set true when any candidate plausibly matches that subject.

When true, optional embeddingSearchHint: a **short phrase describing what they are trying to remember** for image search — the recall target (pull topic names from Recent chat when needed), not every noun in the latest line alone.

When true, optional orderedMessageIds: ids of candidates that **clearly** match that target, best first. Omit ids you are not sure about. Prefer specific scenes over generic UI screenshots.
`.trim();
  }

  private photoRecallIntentUserPrompt(
    message: string,
    numberedCandidates: string,
  ): string {
    return `User message (this turn):
"""${message.slice(0, 4000)}"""

Past user photo messages in chat (id — caption — vision excerpt). Use only rows that clearly support episodic recall for this turn:
${numberedCandidates}`.trim();
  }
}
