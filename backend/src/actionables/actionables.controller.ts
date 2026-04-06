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
import { ActionablesService } from './actionables.service';
import { SnoozeActionableDto } from './dto/snooze-actionable.dto';

@ApiTags('actionables')
@Controller('actionables')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class ActionablesController {
  constructor(private readonly actionables: ActionablesService) {}

  @Get('done')
  @ApiOperation({ summary: 'Done list — newest first' })
  async listDone(
    @CurrentUser() user: UserRow,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 30;
    const { rows, next_cursor } = await this.actionables.listDone(
      user.id,
      Number.isNaN(limit) ? 30 : limit,
      cursor ?? null,
    );
    return {
      items: rows.map((r) => this.actionables.serialize(r)),
      next_cursor,
    };
  }

  @Get('open')
  @ApiOperation({
    summary: 'Open actionables (inbox + snoozed) — newest first',
  })
  async listOpen(
    @CurrentUser() user: UserRow,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 30;
    const { rows, next_cursor } = await this.actionables.listOpen(
      user.id,
      Number.isNaN(limit) ? 30 : limit,
      cursor ?? null,
    );
    return {
      items: rows.map((r) => this.actionables.serialize(r)),
      next_cursor,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single actionable (detail)' })
  async getOne(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.actionables.wakeSnoozed(user.id);
    const row = await this.actionables.findForUser(user.id, id);
    if (!row) {
      throw new NotFoundException('Actionable not found');
    }
    return { item: this.actionables.serialize(row) };
  }

  @Patch(':id/done')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark actionable done' })
  async done(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const row = await this.actionables.markDone(user.id, id);
    return { item: this.actionables.serialize(row) };
  }

  @Patch(':id/dismiss')
  @HttpCode(200)
  @ApiOperation({ summary: 'Dismiss actionable' })
  async dismiss(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const row = await this.actionables.dismiss(user.id, id);
    return { item: this.actionables.serialize(row) };
  }

  @Patch(':id/undone')
  @HttpCode(200)
  @ApiOperation({ summary: 'Undo done — back to inbox' })
  async undone(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const row = await this.actionables.undone(user.id, id);
    return { item: this.actionables.serialize(row) };
  }

  @Patch(':id/undismiss')
  @HttpCode(200)
  @ApiOperation({ summary: 'Undo dismiss' })
  async undismiss(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const row = await this.actionables.undismiss(user.id, id);
    return { item: this.actionables.serialize(row) };
  }

  @Patch(':id/snooze')
  @HttpCode(200)
  @ApiOperation({ summary: 'Snooze actionable' })
  async snooze(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: SnoozeActionableDto,
  ) {
    const row = await this.actionables.snooze(
      user.id,
      id,
      body.until,
      body.iso,
    );
    return { item: this.actionables.serialize(row) };
  }
}
