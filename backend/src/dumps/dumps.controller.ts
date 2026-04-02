import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

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

  @Post('audio')
  @ApiOperation({
    summary: 'Voice dump — Whisper transcription, then classify + queue preps',
  })
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({
    description: 'dumpId + prepIds; workers process preps async',
  })
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async createWithAudio(
    @CurrentUser() user: UserRow,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ dumpId: string; prepIds: string[] }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing audio file');
    }
    return this.dumps.createDumpFromAudio(user, file);
  }

  @Post()
  @ApiOperation({
    summary: 'Create dump — classify, enqueue prep jobs, return immediately',
  })
  @ApiCreatedResponse({
    description: 'dumpId + prepIds; workers process preps async',
  })
  async create(
    @CurrentUser() user: UserRow,
    @Body() body: CreateDumpDto,
  ): Promise<{ dumpId: string; prepIds: string[] }> {
    return this.dumps.createDump(user, body.transcript, body.audioUrl);
  }

  @Get()
  @ApiOperation({ summary: 'List current user dumps' })
  async list(@CurrentUser() user: UserRow) {
    const rows = await this.dumps.listDumpsForUser(user.id);
    return rows.map((d) => ({
      id: d.id,
      transcript: d.transcript,
      audio_url: d.audioUrl,
      created_at: d.createdAt?.toISOString?.() ?? d.createdAt,
    }));
  }
}
