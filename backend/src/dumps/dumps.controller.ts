import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserRow } from '../database/schemas';
import { CreateDumpDto } from './dto/create-dump.dto';
import { DumpsService } from './dumps.service';

@ApiTags('dumps')
@Controller('dumps')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class DumpsController {
  constructor(private readonly dumps: DumpsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create dump — enqueue extraction, return immediately',
  })
  @ApiCreatedResponse({ description: '{ dumpId }' })
  async create(
    @CurrentUser() user: UserRow,
    @Body() body: CreateDumpDto,
  ): Promise<{ dumpId: string }> {
    return this.dumps.createDump(user, body.text);
  }

  @Get()
  @ApiOperation({ summary: 'List current user dumps' })
  async list(@CurrentUser() user: UserRow) {
    const rows = await this.dumps.listDumpsForUser(user.id);
    return rows.map((d) => ({
      id: d.id,
      text: d.dumpText,
      status: d.status,
      created_at: d.createdAt?.toISOString?.() ?? d.createdAt,
    }));
  }
}
