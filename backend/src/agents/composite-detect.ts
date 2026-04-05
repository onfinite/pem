import { Logger } from '@nestjs/common';
import { generateText, Output } from 'ai';
import type { LanguageModel } from 'ai';

import {
  compositeDetectSchema,
  type CompositeDetectResult,
} from './schemas/composite-prep.schema';

/**
 * Cheap gpt-4o-mini pass: is this thought a multi-domain brief (composite) vs single deliverable?
 */
export async function detectCompositeThought(params: {
  thoughtLine: string;
  transcript: string;
  miniModel: LanguageModel;
  timeoutMs: number;
  log: Logger;
}): Promise<CompositeDetectResult> {
  const { thoughtLine, transcript, miniModel, timeoutMs, log } = params;
  const dump = transcript.trim().slice(0, 5_000);
  const thought = thoughtLine.trim().slice(0, 800);

  try {
    const result = await generateText({
      model: miniModel,
      output: Output.object({ schema: compositeDetectSchema }),
      prompt: `Pem defaults to a **composite intelligent brief** (multiple sections, synthesis, recommendation) whenever the user’s goal is **situational, partial, or multi-part**. Partial dates, vague destinations, "this month", "weekend", or "plan a trip to X" are **always composite**, not single-lane.

Set **isSingleFocusedLane: true** only when the user asked for **one explicit, atomic deliverable** with tight scope, for example:
- Serp flight pipe **flight|ORIG|DEST|YYYY-MM-DD** or equivalent explicit fare matrix with airports + date already fixed
- One product SKU / one exact buy link to evaluate
- One email/message draft with recipient + topic clear
- One definition/explain with no implied research agenda beyond that

Set **isSingleFocusedLane: false** (composite) by default for: trip or vacation planning, itineraries, "LA this month", moving, jobs, shopping without exact SKU, events + context, business questions, "help me prep", life admin with unclear steps, or any wording that implies **multiple steps or missing details**.

Full dump:
"""
${dump}
"""

Primary thought line:
"""
${thought}
"""

Return JSON: isSingleFocusedLane, situationType (e.g. TRAVEL_VAGUE, FLIGHT_MATRIX, SHOPPING), confidence.`,
      timeout: timeoutMs,
    });

    const obj = result.output;
    if (!obj) {
      return {
        isSingleFocusedLane: false,
        situationType: 'unknown',
        confidence: 'low',
      };
    }
    log.log(
      `composite detect: singleLane=${obj.isSingleFocusedLane} (${obj.situationType}, ${obj.confidence})`,
    );
    return obj;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`composite detect failed, defaulting composite: ${msg}`);
    return {
      isSingleFocusedLane: false,
      situationType: 'error',
      confidence: 'low',
    };
  }
}
