import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { MAX_CHAT_MESSAGE_IMAGES } from '../chat.constants';

class ImageKeyDto {
  @ApiProperty()
  @IsString()
  @MaxLength(512)
  key!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  mime?: string;
}

export class SendMessageDto {
  @ApiProperty({ enum: ['text', 'voice', 'image'] })
  @IsEnum(['text', 'voice', 'image'])
  kind!: 'text' | 'voice' | 'image';

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

  @ApiPropertyOptional({
    description:
      'R2 object key from POST /chat/photos/upload-url (must start with chat-images/{your_user_id}/)',
  })
  @IsString()
  @MaxLength(512)
  @IsOptional()
  image_key?: string;

  @ApiPropertyOptional({ type: [ImageKeyDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CHAT_MESSAGE_IMAGES)
  @ValidateNested({ each: true })
  @Type(() => ImageKeyDto)
  image_keys?: ImageKeyDto[];

  @ApiPropertyOptional({
    description: 'Same key + user returns existing message (no duplicate job)',
  })
  @IsString()
  @MaxLength(256)
  @IsOptional()
  idempotency_key?: string;
}
