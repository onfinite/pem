import { Logger } from '@nestjs/common';
import { generateText, type LanguageModel } from 'ai';

import { buildCompositeMergeSystemPrompt } from './prompts/prep-composite-merge.prompt';

/**
 * Second pass after parallel lanes: one LLM call (no tools) to dedupe and unify lane text
 * before the COMPOSITE_BRIEF JSON formatter.
 */
export async function synthesizeCompositeMerge(params: {
  mergedLaneTranscript: string;
  thoughtLine: string;
  miniModel: LanguageModel;
  timeoutMs: number;
  log: Logger;
}): Promise<string> {
  const { mergedLaneTranscript, thoughtLine, miniModel, timeoutMs, log } =
    params;
  const raw = mergedLaneTranscript.trim();
  if (raw.length < 80) {
    return raw;
  }

  const clipped = raw.slice(0, 48_000);
  const thought = thoughtLine.trim().slice(0, 1_200);

  try {
    const result = await generateText({
      model: miniModel,
      system: buildCompositeMergeSystemPrompt(),
      prompt: `## User thought / situation\n\n${thought}\n\n---\n\n## Parallel lane research (combine and refine)\n\n${clipped}`,
      timeout: timeoutMs,
    });
    const out = result.text.trim();
    if (out.length < 120) {
      log.warn('composite merge: output too short, using raw lane merge');
      return raw;
    }
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`composite merge failed, using raw lane merge: ${msg}`);
    return raw;
  }
}
