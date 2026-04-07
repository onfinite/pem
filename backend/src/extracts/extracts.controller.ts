import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserRow } from '../database/schemas';
import { ExtractsService } from './extracts.service';
import { ExtractsQueryDto } from './dto/extracts-query.dto';
import { SnoozeExtractDto } from './dto/snooze-extract.dto';

@ApiTags('extracts')
@Controller('extracts')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class ExtractsController {
  constructor(private readonly extracts: ExtractsService) {}

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
}
