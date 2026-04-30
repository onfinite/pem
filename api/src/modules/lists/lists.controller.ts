import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '@/core/auth/clerk-auth.guard';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import type { UserRow } from '@/database/schemas/index';
import { CreateListDto } from '@/modules/lists/dto/create-list.dto';
import { UpdateListDto } from '@/modules/lists/dto/update-list.dto';
import { type ListRow } from '@/database/schemas/index';
import { ListsService } from '@/modules/lists/lists.service';

function serializeList(l: ListRow & { openCount?: number }) {
  return {
    id: l.id,
    user_id: l.userId,
    name: l.name,
    color: l.color,
    icon: l.icon,
    is_default: l.isDefault ?? false,
    sort_order: l.sortOrder ?? 0,
    open_count: (l as { openCount?: number }).openCount ?? 0,
    created_at: l.createdAt.toISOString(),
    updated_at: l.updatedAt.toISOString(),
  };
}

@Controller('lists')
@UseGuards(ClerkAuthGuard)
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Get()
  async getAll(@CurrentUser() user: UserRow) {
    const rows = await this.lists.findByUserWithCounts(user.id);
    return { items: rows.map(serializeList) };
  }

  @Post()
  async create(@CurrentUser() user: UserRow, @Body() dto: CreateListDto) {
    const list = await this.lists.create(user.id, dto);
    return { item: serializeList(list) };
  }

  @Patch(':id')
  @HttpCode(200)
  async update(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateListDto,
  ) {
    const list = await this.lists.update(user.id, id, dto);
    return { item: serializeList(list) };
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.lists.delete(user.id, id);
    return { ok: true };
  }
}
