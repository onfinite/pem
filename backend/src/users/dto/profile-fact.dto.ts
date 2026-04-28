import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Short label (normalized to snake_case memory_key) */
export class CreateProfileFactDto {
  @IsString()
  @MaxLength(200)
  key!: string;

  @IsString()
  @MaxLength(16_000)
  note!: string;
}

export class UpdateProfileFactDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16_000)
  note?: string;
}
