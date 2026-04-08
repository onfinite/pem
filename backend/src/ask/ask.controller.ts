import {
  Body,
  Controller,
  Get,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserRow } from '../database/schemas';
import { AskService } from './ask.service';
import { AskPemDto } from './dto/ask-pem.dto';

@ApiTags('ask')
@Controller('ask')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class AskController {
  constructor(private readonly ask: AskService) {}

  @Get('history')
  @ApiOperation({ summary: 'Recent Ask Pem Q&A (newest first)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async history(
    @CurrentUser() user: UserRow,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    return this.ask.listHistory(
      user.id,
      Number.isNaN(limit as number) ? undefined : limit,
    );
  }

  @Post()
  @Throttle({ default: { ttl: 60000, limit: 15 } })
  @ApiOperation({ summary: 'Ask Pem (text) — answer only, no dump' })
  async askPem(@CurrentUser() user: UserRow, @Body() body: AskPemDto) {
    return this.ask.answer(user.id, body.question);
  }

  @Post('voice')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Ask Pem (voice) — transcribe, answer only; never saves a dump',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('audio'))
  @ApiCreatedResponse({
    description: '{ text, answer, sources } — transcription + Ask result',
  })
  async askPemFromVoice(
    @CurrentUser() user: UserRow,
    @UploadedFile() audio: Express.Multer.File,
  ) {
    return this.ask.answerFromVoice(user.id, audio);
  }
}
