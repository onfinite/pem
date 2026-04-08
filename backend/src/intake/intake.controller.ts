import {
  Body,
  Controller,
  Post,
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
import { Throttle } from '@nestjs/throttler';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserRow } from '../database/schemas';
import { IntakeService } from './intake.service';
import { IntakeDto } from './dto/intake.dto';

@ApiTags('intake')
@Controller('intake')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Post()
  @Throttle({ default: { ttl: 60000, limit: 12 } })
  @ApiOperation({ summary: 'Unified intake — dump, ask, or both' })
  @ApiCreatedResponse({ description: 'IntakeResult' })
  async create(@CurrentUser() user: UserRow, @Body() body: IntakeDto) {
    return this.intake.process(user, body.text);
  }

  @Post('voice')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Voice intake — transcribe, classify, route' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('audio'))
  @ApiCreatedResponse({ description: 'IntakeResult with transcription' })
  async createFromVoice(
    @CurrentUser() user: UserRow,
    @UploadedFile() audio: Express.Multer.File,
  ) {
    return this.intake.processVoice(user, audio);
  }
}
