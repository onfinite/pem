import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { DUMP_TEXT_MAX_CHARS } from '../dumps.service';

export class CreateDumpDto {
  @ApiProperty({ description: 'Raw dump text', maxLength: DUMP_TEXT_MAX_CHARS })
  @IsString()
  @IsNotEmpty()
  @MaxLength(DUMP_TEXT_MAX_CHARS)
  text!: string;
}
