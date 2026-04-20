import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const UNTIL_VALUES = [
  'later_today',
  'tomorrow',
  'weekend',
  'next_week',
  'holding',
] as const;

export class SnoozeExtractDto {
  @ApiProperty({ enum: UNTIL_VALUES })
  @IsString()
  @IsIn([...UNTIL_VALUES])
  until!: (typeof UNTIL_VALUES)[number];

  @ApiPropertyOptional({
    description: 'Optional ISO 8601 instant when until is custom',
  })
  @IsOptional()
  @IsString()
  iso?: string;
}
