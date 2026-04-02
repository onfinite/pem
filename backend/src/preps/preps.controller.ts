import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { PrepRow, PrepStatus, UserRow } from '../database/schemas';
import { PrepsStreamService } from './preps-stream.service';
import { PrepsService } from './preps.service';

@ApiTags('preps')
@Controller('preps')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class PrepsController {
  constructor(
    private readonly preps: PrepsService,
    private readonly prepsStream: PrepsStreamService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List preps. Use ?limit=&cursor= for pagination. status=prepping includes failed. ?dumpId= scopes to one dump.',
  })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'dumpId', required: false })
  async list(
    @CurrentUser() user: UserRow,
    @Query('status') status?: PrepStatus,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
    @Query('dumpId') dumpId?: string,
  ) {
    const hasLimit =
      limitRaw !== undefined &&
      limitRaw !== '' &&
      !Number.isNaN(Number(limitRaw));
    if (hasLimit) {
      const limit = Math.min(Math.max(Number(limitRaw), 1), 50);
      let dumpUuid: string | undefined;
      if (dumpId !== undefined && dumpId !== '') {
        const uuidV4 =
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidV4.test(dumpId)) {
          throw new BadRequestException('Invalid dumpId');
        }
        dumpUuid = dumpId;
      }
      const { rows, nextCursor } = await this.preps.listForUserPaginated(
        user.id,
        {
          status,
          dumpId: dumpUuid,
          limit,
          cursor: cursor || undefined,
        },
      );
      return {
        items: rows.map((p) => this.serializePrep(p)),
        next_cursor: nextCursor,
      };
    }
    if (dumpId) {
      throw new BadRequestException('dumpId requires limit (paginated list)');
    }
    const rows = await this.preps.listForUser(user.id, status);
    return rows.map((p) => this.serializePrep(p));
  }

  @Sse('stream')
  @SkipThrottle()
  @ApiOperation({ summary: 'SSE: prep events for a dump (?dumpId=)' })
  @ApiQuery({ name: 'dumpId', required: true })
  stream(
    @CurrentUser() user: UserRow,
    @Query('dumpId', new ParseUUIDPipe({ version: '4' })) dumpId: string,
  ): Observable<MessageEvent> {
    return this.prepsStream.streamForDump(dumpId, user.id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Append-only milestone log for this prep' })
  async getLogs(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const rows = await this.preps.listLogsForPrep(id, user.id);
    return rows.map((r) => ({
      id: r.id,
      step: r.step,
      message: r.message,
      meta: r.meta,
      created_at: r.createdAt?.toISOString?.() ?? r.createdAt,
    }));
  }

  @Get(':id/steps')
  @ApiOperation({ summary: 'Agent tool steps for this prep' })
  async getSteps(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const rows = await this.preps.listAgentStepsForPrep(id, user.id);
    return rows.map((r) => ({
      id: r.id,
      step_number: r.stepNumber,
      tool_name: r.toolName,
      tool_input: r.toolInput,
      tool_output: r.toolOutput,
      thinking: r.thinking,
      created_at: r.createdAt?.toISOString?.() ?? r.createdAt,
    }));
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Re-queue a failed prep' })
  async retry(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const p = await this.preps.retry(id, user.id);
    return this.serializePrep(p);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single prep with full result' })
  async getOne(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const p = await this.preps.getByIdForUser(id, user.id);
    return this.serializePrep(p);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive prep after user acted' })
  async archive(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const p = await this.preps.archive(id, user.id);
    return this.serializePrep(p);
  }

  private serializePrep(p: PrepRow) {
    const prepType = p.renderType || p.prepType || 'search';
    return {
      id: p.id,
      dump_id: p.dumpId,
      title: p.title,
      thought: p.thought || p.title,
      prep_type: prepType,
      render_type: p.renderType,
      context: p.context,
      status: p.status,
      summary: p.summary,
      result: p.result,
      error_message: p.errorMessage,
      created_at: p.createdAt?.toISOString?.() ?? p.createdAt,
      ready_at: p.readyAt?.toISOString?.() ?? p.readyAt,
      archived_at: p.archivedAt?.toISOString?.() ?? p.archivedAt,
    };
  }
}
