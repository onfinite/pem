import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReportExtractDto {
  @ApiProperty({ description: 'Why this extract is wrong or needs attention' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}
