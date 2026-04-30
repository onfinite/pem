import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '@/core/auth/clerk-auth.guard';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import type { UserRow } from '@/database/schemas/index';
import { extractMutationAuditFromHeaders } from '@/modules/extracts/helpers/extract-audit-from-headers';
import { ExtractsService } from '@/modules/extracts/services/extracts.service';
import { ExtractsQueryDto } from '@/modules/extracts/dto/extracts-query.dto';
import { RescheduleExtractDto } from '@/modules/extracts/dto/reschedule-extract.dto';
import { ReportExtractDto } from '@/modules/extracts/dto/report-extract.dto';
import { SnoozeExtractDto } from '@/modules/extracts/dto/snooze-extract.dto';
import { updateExtractBodySchema } from '@/modules/extracts/dto/update-extract.dto';

@Controller('extracts')
@UseGuards(ClerkAuthGuard)
export class ExtractsController {
  constructor(private readonly extracts: ExtractsService) {}

  @Get('counts')
  async getCounts(@CurrentUser() user: UserRow) {
    return this.extracts.getTaskCounts(user.id);
  }

  @Get('brief')
  async getBrief(@CurrentUser() user: UserRow) {
    const buckets = await this.extracts.getBrief(user.id);
    const s = this.extracts.serialize.bind(this.extracts);
    return {
      overdue: buckets.overdue.map(s),
      today: buckets.today.map(s),
      tomorrow: buckets.tomorrow.map(s),
      this_week: buckets.this_week.map(s),
      next_week: buckets.next_week.map(s),
      later: buckets.later.map(s),
      batch_counts: buckets.batch_counts,
    };
  }

  @Get('calendar')
  async getCalendarView(
    @CurrentUser() user: UserRow,
    @Query('month') month?: string,
  ) {
    return this.extracts.getCalendarView(user.id, month);
  }

  @Get('closed')
  async listClosed(
    @CurrentUser() user: UserRow,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 30;
    const { rows, next_cursor } = await this.extracts.listClosed(
      user.id,
      Number.isNaN(limit) ? 30 : limit,
      cursor ?? null,
    );
    return { items: rows.map((r) => this.extracts.serialize(r)), next_cursor };
  }

  @Get('open')
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

  @Get(':id')
  async getOne(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.extracts.wakeSnoozed(user.id);
    const row = await this.extracts.findForUser(user.id, id);
    if (!row) throw new NotFoundException('Extract not found');
    return { item: this.extracts.serialize(row) };
  }

  @Patch(':id/close')
  @HttpCode(200)
  async close(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('x-pem-surface') pemSurface?: string,
    @Headers('x-pem-request-id') pemRequestId?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const audit = extractMutationAuditFromHeaders(
      pemSurface,
      pemRequestId,
      requestId,
    );
    const row = await this.extracts.markClosed(user.id, id, audit);
    return { item: this.extracts.serialize(row) };
  }

  @Patch(':id/unclose')
  @HttpCode(200)
  async unclose(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('x-pem-surface') pemSurface?: string,
    @Headers('x-pem-request-id') pemRequestId?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const audit = extractMutationAuditFromHeaders(
      pemSurface,
      pemRequestId,
      requestId,
    );
    const row = await this.extracts.unclose(user.id, id, audit);
    return { item: this.extracts.serialize(row) };
  }

  @Patch(':id/rsvp')
  @HttpCode(200)
  async rsvp(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body('response') response: string,
  ) {
    const valid = ['accepted', 'declined', 'tentative'];
    if (!valid.includes(response)) {
      throw new BadRequestException(
        `response must be one of: ${valid.join(', ')}`,
      );
    }
    const row = await this.extracts.rsvp(
      user.id,
      id,
      response as 'accepted' | 'declined' | 'tentative',
    );
    return { item: this.extracts.serialize(row) };
  }

  @Patch(':id/snooze')
  @HttpCode(200)
  async snooze(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: SnoozeExtractDto,
    @Headers('x-pem-surface') pemSurface?: string,
    @Headers('x-pem-request-id') pemRequestId?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const audit = extractMutationAuditFromHeaders(
      pemSurface,
      pemRequestId,
      requestId,
    );
    const row = await this.extracts.snooze(
      user.id,
      id,
      body.until,
      body.iso,
      audit,
    );
    return { item: this.extracts.serialize(row) };
  }

  @Patch(':id/reschedule')
  @HttpCode(200)
  async reschedule(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: RescheduleExtractDto,
    @Headers('x-pem-surface') pemSurface?: string,
    @Headers('x-pem-request-id') pemRequestId?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const audit = extractMutationAuditFromHeaders(
      pemSurface,
      pemRequestId,
      requestId,
    );
    const row = await this.extracts.reschedule(user.id, id, body.target, audit);
    return { item: this.extracts.serialize(row) };
  }

  @Patch(':id')
  @HttpCode(200)
  async updateExtract(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
    @Headers('x-pem-surface') pemSurface?: string,
    @Headers('x-pem-request-id') pemRequestId?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const parsed = updateExtractBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join('; ');
      throw new BadRequestException(msg || 'Invalid body');
    }
    if (Object.keys(parsed.data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    const audit = extractMutationAuditFromHeaders(
      pemSurface,
      pemRequestId,
      requestId,
    );
    const row = await this.extracts.updateExtract(
      user.id,
      id,
      parsed.data,
      audit,
    );
    return { item: this.extracts.serialize(row) };
  }

  @Post(':id/report')
  @HttpCode(200)
  async report(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ReportExtractDto,
    @Headers('x-pem-surface') pemSurface?: string,
    @Headers('x-pem-request-id') pemRequestId?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const audit = extractMutationAuditFromHeaders(
      pemSurface,
      pemRequestId,
      requestId,
    );
    await this.extracts.report(user.id, id, body.reason, audit);
    return { ok: true };
  }
}
