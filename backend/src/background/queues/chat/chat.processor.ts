import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { ChatOrchestratorService } from './chat-orchestrator.service';

@Processor('chat')
export class ChatProcessor extends WorkerHost {
  private readonly log = new Logger(ChatProcessor.name);

  constructor(private readonly orchestrator: ChatOrchestratorService) {
    super();
  }

  async process(
    job: Job<{ messageId: string; userId: string }>,
  ): Promise<void> {
    const { messageId, userId } = job.data;
    if (!messageId || !userId) {
      this.log.warn('chat job missing messageId or userId');
      return;
    }
    const isFinalAttempt = job.attemptsMade >= (job.opts?.attempts ?? 3) - 1;
    await this.orchestrator.processMessage(messageId, userId, {
      isFinalAttempt,
    });
  }
}
