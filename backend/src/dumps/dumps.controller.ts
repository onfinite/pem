import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
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

  @Post('voice')
  @ApiOperation({ summary: 'Voice dump — transcribe audio and create dump' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('audio'))
  @ApiCreatedResponse({ description: '{ dumpId, text }' })
  async createFromVoice(
    @CurrentUser() user: UserRow,
    @UploadedFile() audio: Express.Multer.File,
  ): Promise<{ dumpId: string; text: string }> {
    return this.dumps.createFromVoice(user, audio);
  }

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
    return this.dumps.listPaginated(
      user.id,
      Number.isNaN(limit) ? 30 : limit,
      cursor ?? null,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single dump + extracts for that dump' })
  async getOne(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.dumps.getById(user.id, id);
  }
}
