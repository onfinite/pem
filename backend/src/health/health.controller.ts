import { Controller, Get } from '@nestjs/common';

type HealthPayload = {
  status: 'ok';
};

@Controller()
export class HealthController {
  @Get('health')
  health(): HealthPayload {
    return { status: 'ok' };
  }
}
