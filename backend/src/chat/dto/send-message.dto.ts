import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { MAX_CHAT_MESSAGE_IMAGES } from '@/chat/chat.constants';

class ImageKeyDto {
  @IsString()
  @MaxLength(512)
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  mime?: string;

  /** SHA-256 hex of raw bytes; enables exact duplicate dedup server-side. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  content_sha256?: string;
}

export class SendMessageDto {
  @IsEnum(['text', 'voice', 'image'])
  kind!: 'text' | 'voice' | 'image';

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  voice_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  audio_key?: string;

  /** R2 object key from POST /chat/photos/upload-url (must start with chat-images/{your_user_id}/) */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  image_key?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CHAT_MESSAGE_IMAGES)
  @ValidateNested({ each: true })
  @Type(() => ImageKeyDto)
  image_keys?: ImageKeyDto[];

  /** Same key + user returns existing message (no duplicate job) */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  idempotency_key?: string;
}
