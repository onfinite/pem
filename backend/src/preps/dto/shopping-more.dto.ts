import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** POST /preps/:id/shopping/more — load more shopping rows (Serp + DB merge). */
export class ShoppingMoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  /** Refined shopping query; defaults to prep’s stored query line. */
  query?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  batchSize?: number;
}
