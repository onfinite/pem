import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { ClientHintsDto } from './dto/client-hints.dto';
import { ShoppingMoreDto } from './dto/shopping-more.dto';
import { StarPrepDto } from './dto/star-prep.dto';
import { serializePrepForApi } from './prep-serialization';
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
  @ApiQuery({
    name: 'starred',
    required: false,
    description:
      'If 1/true, list starred preps only (any status); ignores status',
  })
  async list(
    @CurrentUser() user: UserRow,
    @Query('status') status?: PrepStatus,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
    @Query('dumpId') dumpId?: string,
    @Query('starred') starredRaw?: string,
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
      const starredOnly =
        starredRaw === '1' || starredRaw === 'true' || starredRaw === 'yes';
      const { rows, nextCursor } = await this.preps.listForUserPaginated(
        user.id,
        {
          ...(starredOnly ? { starredOnly: true as const } : { status }),
          dumpId: dumpUuid,
          limit,
          cursor: cursor || undefined,
        },
      );
      return {
        items: this.serializePrepRows(rows),
        next_cursor: nextCursor,
      };
    }
    if (dumpId) {
      throw new BadRequestException('dumpId requires limit (paginated list)');
    }
    const rows = await this.preps.listForUser(user.id, status);
    return this.serializePrepRows(rows);
  }

  @Get('counts')
  @ApiOperation({
    summary: 'Exact prep counts per hub tab (ready / preparing / archived)',
  })
  async counts(@CurrentUser() user: UserRow) {
    return this.preps.countByTabBuckets(user.id);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search preps by thought, title, or summary (paginated)',
  })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({
    name: 'starred',
    required: false,
    description: 'If 1/true, only search starred preps',
  })
  async search(
    @CurrentUser() user: UserRow,
    @Query('q') q: string,
    @Query('status') status?: PrepStatus,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
    @Query('starred') starredRaw?: string,
  ) {
    const lim = Math.min(Math.max(Number(limitRaw) || 12, 1), 50);
    if (!q?.trim()) {
      throw new BadRequestException('q is required');
    }
    const st: 'ready' | 'prepping' | 'archived' =
      status === 'archived'
        ? 'archived'
        : status === 'prepping' || status === 'failed'
          ? 'prepping'
          : 'ready';
    const starredOnly =
      starredRaw === '1' || starredRaw === 'true' || starredRaw === 'yes';
    const { rows, nextCursor } = await this.preps.searchPrepsPaginated(
      user.id,
      {
        q: q.trim(),
        status: st,
        limit: lim,
        cursor: cursor || undefined,
        ...(starredOnly ? { starredOnly: true } : {}),
      },
    );
    return {
      items: this.serializePrepRows(rows),
      next_cursor: nextCursor,
    };
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
    return serializePrepForApi(p);
  }

  @Patch(':id/opened')
  @ApiOperation({ summary: 'Mark prep as read (first open)' })
  async markOpened(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const p = await this.preps.markOpened(id, user.id);
    return serializePrepForApi(p);
  }

  @Patch(':id/star')
  @ApiOperation({ summary: 'Star or unstar a prep (Gmail-style)' })
  async setStar(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: StarPrepDto,
  ) {
    const p = await this.preps.setStarred(id, user.id, body.starred);
    return serializePrepForApi(p);
  }

  @Post(':id/shopping/more')
  @ApiOperation({
    summary:
      'Append shopping products via Serp (deduped URLs, max 25 on prep). Body: optional query, batchSize.',
  })
  async shoppingMore(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ShoppingMoreDto,
  ) {
    const p = await this.preps.appendShoppingProducts(user.id, id, {
      query: body.query,
      batchSize: body.batchSize,
    });
    return serializePrepForApi(p);
  }

  @Post(':id/client-hints')
  @ApiOperation({
    summary:
      'Ephemeral device location for one prep run (Redis only — not stored on prep row)',
  })
  async submitClientHints(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ClientHintsDto,
  ) {
    return this.preps.submitClientHints(id, user.id, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single prep with full structured result' })
  async getOne(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const { prep, transcript } =
      await this.preps.getByIdWithDumpTranscriptForUser(id, user.id);
    return serializePrepForApi(prep, { dumpTranscript: transcript });
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive prep after user acted' })
  async archive(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const p = await this.preps.archive(id, user.id);
    return serializePrepForApi(p);
  }

  @Patch(':id/unarchive')
  @ApiOperation({ summary: 'Restore archived prep to Ready' })
  async unarchive(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const p = await this.preps.unarchive(id, user.id);
    return serializePrepForApi(p);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Permanently delete prep (cannot be undone)' })
  async delete(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.preps.deleteForUser(id, user.id);
  }

  private serializePrepRows(rows: PrepRow[]) {
    return rows.map((p) => serializePrepForApi(p));
  }
}
