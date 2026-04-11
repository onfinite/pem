import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class WorkHoursDto {
  @IsString()
  @MaxLength(5)
  start!: string;

  @IsString()
  @MaxLength(5)
  end!: string;
}

export class PreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkHoursDto)
  work_hours?: WorkHoursDto;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  work_days?: number[];

  @ApiPropertyOptional({ enum: ['office', 'remote', 'hybrid'] })
  @IsOptional()
  @IsEnum(['office', 'remote', 'hybrid'])
  work_type?: 'office' | 'remote' | 'hybrid';

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEnum(['evenings', 'weekends', 'lunch', 'mornings'], { each: true })
  personal_windows?: ('evenings' | 'weekends' | 'lunch' | 'mornings')[];

  @ApiPropertyOptional({ enum: ['weekend_morning', 'lunch', 'after_work'] })
  @IsOptional()
  @IsEnum(['weekend_morning', 'lunch', 'after_work'])
  errand_window?: 'weekend_morning' | 'lunch' | 'after_work';
}
