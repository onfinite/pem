import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserRow } from '../database/schemas';
import { ThoughtsService } from './thoughts.service';

@ApiTags('thoughts')
@Controller('thoughts')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class ThoughtsController {
  constructor(private readonly thoughts: ThoughtsService) {}

  @Get()
  @ApiOperation({
    summary: 'List dump sessions (newest first); text is polished or raw',
  })
  async list(
    @CurrentUser() user: UserRow,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 30;
    return this.thoughts.listForUser(
      user.id,
      Number.isNaN(limit) ? 30 : limit,
      cursor ?? null,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Dump session detail (`id` = dump id) + actionables',
  })
  async getOne(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.thoughts.getById(user.id, id);
  }
}
