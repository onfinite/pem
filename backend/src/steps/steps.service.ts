import { Inject, Injectable, Logger } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { agentStepsTable } from '../database/schemas';

/**
 * Persists Vercel AI SDK tool loop steps for prep detail “what Pem did”.
 */
@Injectable()
export class StepsService {
  private readonly log = new Logger(StepsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async insertStep(input: {
    prepId: string;
    stepNumber: number;
    toolName: string | null;
    toolInput: Record<string, unknown> | null;
    toolOutput: Record<string, unknown> | null;
    thinking: string | null;
  }): Promise<void> {
    try {
      await this.db.insert(agentStepsTable).values({
        prepId: input.prepId,
        stepNumber: input.stepNumber,
        toolName: input.toolName,
        toolInput: input.toolInput,
        toolOutput: input.toolOutput,
        thinking: input.thinking,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`agent_steps insert failed: ${msg}`);
    }
  }

  async listForPrep(prepId: string) {
    return this.db
      .select()
      .from(agentStepsTable)
      .where(eq(agentStepsTable.prepId, prepId))
      .orderBy(asc(agentStepsTable.stepNumber));
  }

  async deleteForPrep(prepId: string): Promise<void> {
    await this.db
      .delete(agentStepsTable)
      .where(eq(agentStepsTable.prepId, prepId));
  }
}
