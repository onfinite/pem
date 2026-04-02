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

Use tools as needed. When finished, produce a clear final answer in plain language in your last message.`;
}
