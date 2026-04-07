import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDumpDto {
  @ApiProperty({ description: 'Raw dump text' })
  @IsString()
  @MinLength(1)
  @MaxLength(16_000)
  text!: string;
}
