import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class PushTokenDto {
  /** Expo push token; omit or null to clear */
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(4096)
  @IsOptional()
  token?: string | null;
}
