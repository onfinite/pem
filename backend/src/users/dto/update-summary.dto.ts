import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateSummaryDto {
  @IsString()
  @MinLength(0)
  @MaxLength(4000)
  summary!: string;
}
