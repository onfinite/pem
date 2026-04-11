import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserRow } from '../database/schemas';
import { ExtractsService } from './extracts.service';
import { DraftService } from './draft.service';
import { ExtractsQueryDto } from './dto/extracts-query.dto';
import { RescheduleExtractDto } from './dto/reschedule-extract.dto';
import { ReportExtractDto } from './dto/report-extract.dto';
import { SnoozeExtractDto } from './dto/snooze-extract.dto';
import {
  UpdateExtractDto,
  updateExtractBodySchema,
} from './dto/update-extract.dto';

@ApiTags('extracts')
@Controller('extracts')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class ExtractsController {
  constructor(
    private readonly extracts: ExtractsService,
    private readonly draft: DraftService,
  ) {}

  @Get('counts')
  @ApiOperation({
    summary: 'Task counts for the pill — today, overdue, total open',
  })
  async getCounts(@CurrentUser() user: UserRow) {
    return this.extracts.getTaskCounts(user.id);
  }

  @Get('calendar')
  @ApiOperation({
    summary:
      'Calendar view — items for a month, undated tasks, overdue, dot map',
  })
  async getCalendarView(
    @CurrentUser() user: UserRow,
    @Query('month') month?: string,
  ) {
    return this.extracts.getCalendarView(user.id, month);
  }

  @Get('done')
  @ApiOperation({ summary: 'Done list — newest first' })
  async listDone(
    @CurrentUser() user: UserRow,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 30;
    const { rows, next_cursor } = await this.extracts.listDone(
      user.id,
      Number.isNaN(limit) ? 30 : limit,
      cursor ?? null,
    );
    return { items: rows.map((r) => this.extracts.serialize(r)), next_cursor };
  }

  @Get('open')
  @ApiOperation({ summary: 'Open extracts (inbox + snoozed) — newest first' })
  async listOpen(
    @CurrentUser() user: UserRow,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 30;
    const { rows, next_cursor } = await this.extracts.listOpen(
      user.id,
      Number.isNaN(limit) ? 30 : limit,
      cursor ?? null,
    );
    return { items: rows.map((r) => this.extracts.serialize(r)), next_cursor };
  }

  @Get('query')
  @ApiOperation({
    summary:
      'Filter extracts — composable query (status, batch_key, tone, urgency, …)',
  })
  async queryList(@CurrentUser() user: UserRow, @Query() q: ExtractsQueryDto) {
    await this.extracts.wakeSnoozed(user.id);
    const limit = q.limit != null && !Number.isNaN(q.limit) ? q.limit : 30;
    const { rows, next_cursor } = await this.extracts.listQuery(
      user.id,
      {
        status: q.status,
        batch_key: q.batch_key,
        tone: q.tone,
        exclude_tone: q.exclude_tone,
        urgency: q.urgency,
      },
      limit,
      q.cursor ?? null,
    );
    return { items: rows.map((r) => this.extracts.serialize(r)), next_cursor };
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Change history for an extract' })
  async getHistory(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const row = await this.extracts.findForUser(user.id, id);
    if (!row) throw new NotFoundException('Extract not found');
    const logs = await this.extracts.getHistory(user.id, id);
    return {
      logs: logs.map((l) => ({
        id: l.id,
        type: l.type,
        is_agent: l.isAgent,
        pem_note: l.pemNote,
        payload: l.payload,
        error: l.error,
        created_at: l.createdAt.toISOString(),
      })),
    };
  }

  @Post(':id/draft')
  @HttpCode(200)
  @ApiOperation({ summary: 'Generate a draft message for a follow-up item' })
  async generateDraft(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const row = await this.extracts.findForUser(user.id, id);
    if (!row) throw new NotFoundException('Extract not found');
    const draftText = await this.draft.generateDraft(user.id, row);
    return { draft: draftText, item: this.extracts.serialize(row) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single extract (detail)' })
  async getOne(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.extracts.wakeSnoozed(user.id);
    const row = await this.extracts.findForUser(user.id, id);
    if (!row) throw new NotFoundException('Extract not found');
    return { item: this.extracts.serialize(row) };
  }

  @Patch(':id/done')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark extract done' })
  async done(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const row = await this.extracts.markDone(user.id, id);
    return { item: this.extracts.serialize(row) };
  }

  @Patch(':id/dismiss')
  @HttpCode(200)
  @ApiOperation({ summary: 'Dismiss extract' })
  async dismiss(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const row = await this.extracts.dismiss(user.id, id);
    return { item: this.extracts.serialize(row) };
  }

  @Patch(':id/undone')
  @HttpCode(200)
  @ApiOperation({ summary: 'Undo done — back to inbox' })
  async undone(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const row = await this.extracts.undone(user.id, id);
    return { item: this.extracts.serialize(row) };
  }

  @Patch(':id/undismiss')
  @HttpCode(200)
  @ApiOperation({ summary: 'Undo dismiss' })
  async undismiss(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const row = await this.extracts.undismiss(user.id, id);
    return { item: this.extracts.serialize(row) };
  }

  @Patch(':id/snooze')
  @HttpCode(200)
  @ApiOperation({ summary: 'Snooze extract' })
  async snooze(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: SnoozeExtractDto,
  ) {
    const row = await this.extracts.snooze(user.id, id, body.until, body.iso);
    return { item: this.extracts.serialize(row) };
  }

  @Patch(':id/reschedule')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reschedule extract — move to a different urgency' })
  async reschedule(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: RescheduleExtractDto,
  ) {
    const row = await this.extracts.reschedule(user.id, id, body.target);
    return { item: this.extracts.serialize(row) };
  }

  @Patch(':id')
  @HttpCode(200)
  @ApiBody({ type: UpdateExtractDto })
  @ApiOperation({
    summary:
      'Update task (title, when/priority, dates, period, duration, list)',
  })
  async updateExtract(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    const parsed = updateExtractBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join('; ');
      throw new BadRequestException(msg || 'Invalid body');
    }
    if (Object.keys(parsed.data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    const row = await this.extracts.updateExtract(user.id, id, parsed.data);
    return { item: this.extracts.serialize(row) };
  }

  @Post(':id/report')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Report incorrect extract — user flags a bad generation',
  })
  async report(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ReportExtractDto,
  ) {
    await this.extracts.report(user.id, id, body.reason);
    return { ok: true };
  }
}
