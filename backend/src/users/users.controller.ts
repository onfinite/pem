import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserRow } from '../database/schemas';
import { UserMeDto } from './dto/user-me.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  @Get('me')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Current user (Clerk JWT)' })
  @ApiResponse({ status: 200, description: 'Current user', type: UserMeDto })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing token / user not found',
  })
  @ApiResponse({ status: 403, description: 'User inactive' })
  @ApiResponse({
    status: 503,
    description: 'Clerk JWT not configured on server',
  })
  getMe(@CurrentUser() user: UserRow) {
    return {
      id: user.id,
      clerk_id: user.clerkId,
      email: user.email,
      full_name: user.fullName,
      is_active: user.isActive,
    };
  }
}
