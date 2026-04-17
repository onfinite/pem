export function photoRecallIntentSystemPrompt(): string {
  return `
You decide whether to attach a "From your photos" strip: small thumbnails of photos the user already sent in this chat (not from the web).

Set attachRelevantPastPhotos to true when ANY of these apply AND at least one candidate row plausibly relates:
- They ask to see, find, show, recall, open, or browse past photos/pictures/images/screenshots they sent.
- They are doing memory or conversation recall where images would help: e.g. what did we discuss with [person], remind me about [meeting/topic/trip], what did we talk about when, trying to remember [event] — and a candidate's caption or vision excerpt ties to that person, place, meeting, or topic.

Set attachRelevantPastPhotos to false when:
- They are mainly describing or captioning what they are sending right now ("here is a photo from my meeting", "pic from lunch") without asking to remember past discussion or past photos.
- They ask about tasks, calendar, or lists with no recall of a person/meeting/conversation and no ask for images.
- None of the candidates plausibly relate to their message (do not attach unrelated photos just because they exist).

When true, optional embeddingSearchHint: short English phrase for semantic image search (e.g. "Farin meeting discussion", "LA trip beach"). Use names/topics from their message.

When true, optional orderedMessageIds: candidate message ids best-matching their request, best first. Prefer ids whose caption/vision clearly match. Omit if unsure — search will still run.
`.trim();
}

export function photoRecallIntentUserPrompt(
  message: string,
  numberedCandidates: string,
): string {
  return `User message:
"""${message.slice(0, 4000)}"""

Past user photo messages in chat (id — caption — vision excerpt):
${numberedCandidates}`.trim();
}
