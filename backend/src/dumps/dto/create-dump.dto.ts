import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDumpDto {
  @ApiProperty({
    description: 'Final text (typed or already transcribed on client)',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50_000)
  transcript!: string;

  @ApiPropertyOptional({
    description: 'Optional URL to audio for server-side Whisper (future)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  audioUrl?: string;
}
