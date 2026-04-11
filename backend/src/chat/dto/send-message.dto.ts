import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ enum: ['text', 'voice'] })
  @IsEnum(['text', 'voice'])
  kind!: 'text' | 'voice';

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(10_000)
  @IsOptional()
  content?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2048)
  @IsOptional()
  voice_url?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(512)
  @IsOptional()
  audio_key?: string;

  @ApiPropertyOptional({ description: 'Same key + user returns existing message (no duplicate job)' })
  @IsString()
  @MaxLength(256)
  @IsOptional()
  idempotency_key?: string;
}
