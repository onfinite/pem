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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserRow } from '../database/schemas';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { ListsService } from './lists.service';

@ApiTags('lists')
@Controller('lists')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Get()
  @ApiOperation({ summary: 'All lists with open task counts' })
  async getAll(@CurrentUser() user: UserRow) {
    await this.lists.seedDefaults(user.id);
    return { items: await this.lists.findByUserWithCounts(user.id) };
  }

  @Post()
  @ApiOperation({ summary: 'Create a list' })
  async create(@CurrentUser() user: UserRow, @Body() dto: CreateListDto) {
    const list = await this.lists.create(user.id, dto);
    return { item: list };
  }

  @Patch(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update a list' })
  async update(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateListDto,
  ) {
    const list = await this.lists.update(user.id, id, dto);
    return { item: list };
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a non-default list' })
  async remove(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.lists.delete(user.id, id);
    return { ok: true };
  }
}
