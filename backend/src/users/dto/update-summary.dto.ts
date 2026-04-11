import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateSummaryDto {
  @ApiProperty({ description: 'User profile summary' })
  @IsString()
  @MaxLength(5000)
  summary!: string;
}
