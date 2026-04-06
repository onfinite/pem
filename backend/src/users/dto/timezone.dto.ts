import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** IANA timezone e.g. America/Los_Angeles */
export class TimezoneDto {
  @ApiProperty({ example: 'America/Los_Angeles' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  timezone!: string;
}
