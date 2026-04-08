import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class IntakeDto {
  @ApiProperty({ description: 'Text to process — dump, question, or both' })
  @IsString()
  @MinLength(1)
  @MaxLength(16_000)
  text!: string;
}
