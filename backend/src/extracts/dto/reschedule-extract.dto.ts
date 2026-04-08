import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

const URGENCY_VALUES = [
  'today',
  'tomorrow',
  'this_week',
  'next_week',
  'someday',
] as const;

export type RescheduleTarget = (typeof URGENCY_VALUES)[number];

export class RescheduleExtractDto {
  @ApiProperty({ enum: URGENCY_VALUES })
  @IsString()
  @IsIn([...URGENCY_VALUES])
  target!: RescheduleTarget;
}
