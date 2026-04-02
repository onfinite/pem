import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('health')
@Controller()
export class HealthController {
  @Get('health')
  @ApiOperation({ summary: 'Liveness / readiness' })
  @ApiOkResponse({ type: HealthResponseDto, description: 'Service is up' })
  health(): HealthResponseDto {
    return { status: 'ok' };
  }
}
