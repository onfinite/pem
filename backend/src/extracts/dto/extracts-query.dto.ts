import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const BATCH = ['shopping', 'follow_ups', 'errands'] as const;
const STATUS = ['open', 'inbox', 'snoozed', 'dismissed', 'done'] as const;
const TONE = ['confident', 'tentative', 'idea', 'someday'] as const;
const URGENCY = ['today', 'this_week', 'someday', 'none'] as const;

/** Query params for `GET /extracts/query` — composable filters. */
export class ExtractsQueryDto {
  @IsOptional()
  @IsIn(STATUS)
  /** `open` = all rows where status is not `done` (default). */
  status?: (typeof STATUS)[number];

  @IsOptional()
  @IsIn(BATCH)
  batch_key?: (typeof BATCH)[number];

  @IsOptional()
  @IsIn(TONE)
  tone?: (typeof TONE)[number];

  @IsOptional()
  @IsIn(TONE)
  exclude_tone?: (typeof TONE)[number];

  @IsOptional()
  @IsIn(URGENCY)
  urgency?: (typeof URGENCY)[number];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
