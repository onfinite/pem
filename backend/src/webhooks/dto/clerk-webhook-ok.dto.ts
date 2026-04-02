import { ApiProperty } from '@nestjs/swagger';

export class ClerkWebhookOkDto {
  @ApiProperty({ example: 'ok' })
  status!: string;
}
