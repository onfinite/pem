import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Ephemeral device location for one prep (Redis only — never stored on `preps`).
 */
export class ClientHintsDto {
  @IsOptional()
  @IsBoolean()
  locationUnavailable?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
