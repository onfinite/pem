import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ReportExtractDto {
  @ApiProperty({ description: 'Why this extract is wrong or needs attention' })
  @IsString()
  @MinLength(1)
  reason!: string;
}
