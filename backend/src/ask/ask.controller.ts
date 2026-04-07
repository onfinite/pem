import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

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

  @Post()
  @ApiOperation({ summary: 'Ask Pem about your thoughts and extracts' })
  async askPem(@CurrentUser() user: UserRow, @Body() body: AskPemDto) {
    return this.ask.answer(user.id, body.question);
  }
}
