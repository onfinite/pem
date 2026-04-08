import { Controller, Get, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserRow, ExtractRow } from '../database/schemas';
import { ExtractsService } from '../extracts/extracts.service';
import { InboxStreamService } from './inbox-stream.service';

@ApiTags('inbox')
@Controller('inbox')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class InboxController {
  constructor(
    private readonly extracts: ExtractsService,
    private readonly stream: InboxStreamService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Today inbox' })
  async getToday(@CurrentUser() user: UserRow) {
    await this.extracts.wakeSnoozed(user.id);
    const today = await this.extracts.listToday(user.id);
    return { today: today.map((a) => this.extracts.serialize(a)) };
  }

  @Get('brief')
  @ApiOperation({
    summary: 'Daily brief — today timeline, batch counts, week glance',
  })
  async getBrief(@CurrentUser() user: UserRow) {
    const data = await this.extracts.getBrief(user.id);
    const ser = (a: ExtractRow) => this.extracts.serialize(a);
    return {
      overdue: data.overdue.map(ser),
      today: data.today.map(ser),
      tomorrow: data.tomorrow.map(ser),
      this_week: data.this_week.map(ser),
      next_week: data.next_week.map(ser),
      later: data.later.map(ser),
      batch_counts: data.batch_counts,
    };
  }

  @Get('all')
  @ApiOperation({ summary: 'Full inbox sections' })
  async getAll(@CurrentUser() user: UserRow) {
    await this.extracts.wakeSnoozed(user.id);
    const data = await this.extracts.listAllForUser(user.id);
    const ser = (a: (typeof data.this_week)[0]) => this.extracts.serialize(a);
    return {
      this_week: data.this_week.map(ser),
      someday: data.someday.map(ser),
      ideas: data.ideas.map(ser),
      dismissed: data.dismissed.map(ser),
      batch_groups: data.batch_groups.map((g) => ({
        batch_key: g.batch_key,
        items: g.items.map(ser),
      })),
      batch_slots: data.batch_slots.map((s) => ({
        batch_key: s.batch_key,
        count: s.count,
        items: s.items.map(ser),
      })),
    };
  }

  @Sse('stream')
  @ApiOperation({ summary: 'SSE — inbox extraction events for a dump' })
  streamInbox(
    @CurrentUser() user: UserRow,
    @Query('dumpId') dumpId: string,
  ): Observable<MessageEvent> {
    return this.stream.subscribe(user.id, dumpId);
  }
}
