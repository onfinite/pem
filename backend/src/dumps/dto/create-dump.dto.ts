import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDumpDto {
  @ApiProperty({
    description: 'Dump text (typed or transcribed on client)',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(16_000)
  transcript!: string;
}
