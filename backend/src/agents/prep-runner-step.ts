import type { StepsService } from '../steps/steps.service';

function toolCallName(c: unknown): string {
  return typeof c === 'object' && c !== null && 'toolName' in c
    ? String((c as { toolName: unknown }).toolName)
    : 'tool';
}

function toolCallInput(c: unknown): Record<string, unknown> {
  return typeof c === 'object' && c !== null && 'input' in c
    ? ((c as { input: unknown }).input as Record<string, unknown>)
    : {};
}

function toolResultOutput(r: unknown): unknown {
  return r && typeof r === 'object' && 'output' in r
    ? (r as { output: unknown }).output
    : undefined;
}

/**
 * Persist one agent loop step to `agent_steps` (matches `generateText` `onStepFinish` payload).
 */
export async function appendPrepAgentStep(
  prepId: string,
  steps: StepsService,
  event: {
    stepNumber: number;
    text?: string;
    toolCalls?: unknown;
    toolResults?: unknown;
  },
): Promise<void> {
  const tc = Array.isArray(event.toolCalls) ? event.toolCalls : [];
  const tr = Array.isArray(event.toolResults) ? event.toolResults : [];

  const names = tc.map(toolCallName);
  const inputs = tc.map(toolCallInput);
  const outputs = tr.map(toolResultOutput);

  await steps.insertStep({
    prepId,
    stepNumber: event.stepNumber,
    toolName: names.length ? names.join(',') : 'model',
    toolInput: inputs.length ? { calls: inputs } : { text: event.text },
    toolOutput: outputs.length ? { results: outputs } : null,
    thinking: event.text?.slice(0, 4000) ?? null,
  });
}
