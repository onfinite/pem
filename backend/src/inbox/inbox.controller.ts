import { Controller, Get, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserRow } from '../database/schemas';
import { ActionablesService } from '../actionables/actionables.service';
import { InboxStreamService } from './inbox-stream.service';

@ApiTags('inbox')
@Controller('inbox')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class InboxController {
  constructor(
    private readonly actionables: ActionablesService,
    private readonly stream: InboxStreamService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Today inbox' })
  async getToday(@CurrentUser() user: UserRow) {
    await this.actionables.wakeSnoozed(user.id);
    const today = await this.actionables.listToday(user.id);
    return {
      today: today.map((a) => this.actionables.serialize(a)),
    };
  }

  @Get('all')
  @ApiOperation({ summary: 'Full inbox sections' })
  async getAll(@CurrentUser() user: UserRow) {
    await this.actionables.wakeSnoozed(user.id);
    const data = await this.actionables.listAllForUser(user.id);
    const ser = (a: (typeof data.this_week)[0]) =>
      this.actionables.serialize(a);
    return {
      this_week: data.this_week.map(ser),
      someday: data.someday.map(ser),
      ideas: data.ideas.map(ser),
      dismissed: data.dismissed.map(ser),
      batch_groups: data.batch_groups.map((g) => ({
        batch_key: g.batch_key,
        items: g.items.map(ser),
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
