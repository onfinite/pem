import type {
  EmbeddingsService,
  SimilaritySearchOpts,
} from '@/modules/memory/embeddings.service';
import {
  buildAgentRagSearchParams,
  isBroadTopicRecallQuery,
  isLooseRecallQuery,
  mergeRagHitsByMessageId,
  RAG_MIN_SIMILARITY_BROAD_TOPIC_RECALL_FALLBACK,
} from '@/modules/chat/helpers/chat-rag-recall-params';
import {
  RAG_ENRICHMENT_MERGE_TRIGGER_MAX,
  RAG_ENRICHMENT_MIN_SIMILARITY,
  RAG_ENRICHMENT_TOP_K,
} from '@/modules/chat/constants/chat.constants';
import type { QuestionTemporalRange } from '@/modules/agent/question/helpers/chat-question-temporal';

export type RagSearchBundle = {
  ragResults: Awaited<ReturnType<EmbeddingsService['similaritySearch']>>;
  ragVectorQuery: string;
  ragContext: string;
};

/**
 * needs_agent path: planner-aware query text + enrichment merge + loose-recall floor.
 */
export async function runNeedsAgentRagSearch(
  embeddings: EmbeddingsService,
  params: {
    userId: string;
    ragQueryText: string;
    temporalRange: QuestionTemporalRange | null;
    ragSimilarityOpts: SimilaritySearchOpts | undefined;
  },
): Promise<RagSearchBundle> {
  const { userId, ragQueryText, temporalRange, ragSimilarityOpts } = params;
  const ragUsesLooseRecallFloor =
    isBroadTopicRecallQuery(ragQueryText) || isLooseRecallQuery(ragQueryText);
  const ragSearch = buildAgentRagSearchParams(ragQueryText, temporalRange);
  let ragResults = await embeddings.similaritySearch(
    userId,
    ragSearch.vectorQuery,
    ragSearch.topK,
    ragSearch.minSimilarity,
    ragSimilarityOpts,
  );
  if (
    ragResults.length < RAG_ENRICHMENT_MERGE_TRIGGER_MAX &&
    !ragUsesLooseRecallFloor
  ) {
    const enrich = await embeddings.similaritySearch(
      userId,
      ragSearch.vectorQuery,
      RAG_ENRICHMENT_TOP_K,
      RAG_ENRICHMENT_MIN_SIMILARITY,
      ragSimilarityOpts,
    );
    ragResults = mergeRagHitsByMessageId(ragResults, enrich);
  }
  if (ragResults.length === 0 && ragUsesLooseRecallFloor) {
    ragResults = await embeddings.similaritySearch(
      userId,
      ragSearch.vectorQuery,
      Math.max(ragSearch.topK, 32),
      RAG_MIN_SIMILARITY_BROAD_TOPIC_RECALL_FALLBACK,
      ragSimilarityOpts,
    );
  }
  const ragVectorQuery = ragSearch.vectorQuery;
  const ragContext = ragResults.map((r) => r.content).join('\n');
  return { ragResults, ragVectorQuery, ragContext };
}
