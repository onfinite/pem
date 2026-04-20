import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const PHOTO_UPLOAD_ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type PhotoUploadMime = (typeof PHOTO_UPLOAD_ALLOWED_MIMES)[number];

export const MAX_PHOTO_UPLOAD_BYTES = 10 * 1024 * 1024;

export class PhotoUploadUrlDto {
  @ApiProperty({ enum: PHOTO_UPLOAD_ALLOWED_MIMES })
  @IsIn([...PHOTO_UPLOAD_ALLOWED_MIMES])
  content_type!: PhotoUploadMime;

  @ApiPropertyOptional({ description: 'Declared size for validation (bytes)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PHOTO_UPLOAD_BYTES)
  byte_size?: number;

  @ApiPropertyOptional({
    description:
      'SHA-256 (hex) of raw file bytes. When set, server may return is_duplicate with an existing image_key.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  content_sha256?: string;
}
