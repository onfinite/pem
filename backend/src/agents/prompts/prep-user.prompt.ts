/**
 * User message for the main prep agent loop (transcript + thought + memory + JSON context).
 */
export function buildPrepUserPrompt(args: {
  transcript: string;
  thoughtLine: string;
  memorySection: string;
  relevantBlock: string;
  enrichedContextJson: string;
}): string {
  const {
    transcript,
    thoughtLine,
    memorySection,
    relevantBlock,
    enrichedContextJson,
  } = args;
  return `Full dump transcript (context):
"""
${transcript}
"""

Thought to prep (this card):
${thoughtLine}

${memorySection}

${relevantBlock ? `${relevantBlock}\n` : ''}

Enriched context (JSON) — structured profile map for tools that still expect key/value:
${enrichedContextJson}

Prioritize the memory block and relevant history above when they do not contradict this thought. The transcript may mention facts that apply to this card — use remember() / save() so durable details land in memory. Ground recommendations in memory (budget, city, family). Use tools as needed. When finished, produce a clear final answer in plain language in your last message — specifics from memory and history should show up in what you say, not generic one-size-fits-all advice.`;
}
