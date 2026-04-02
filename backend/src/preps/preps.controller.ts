import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { PrepRow, PrepStatus, UserRow } from '../database/schemas';
import { PrepsService } from './preps.service';

@ApiTags('preps')
@Controller('preps')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class PrepsController {
  constructor(private readonly preps: PrepsService) {}

  @Get()
  @ApiOperation({
    summary: 'List preps (optional ?status=prepping|ready|archived)',
  })
  @ApiQuery({ name: 'status', required: false })
  async list(
    @CurrentUser() user: UserRow,
    @Query('status') status?: PrepStatus,
  ) {
    const rows = await this.preps.listForUser(user.id, status);
    return rows.map((p) => this.serializePrep(p));
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Append-only agent steps for this prep' })
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
    return {
      id: p.id,
      dump_id: p.dumpId,
      title: p.title,
      prep_type: p.prepType,
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
