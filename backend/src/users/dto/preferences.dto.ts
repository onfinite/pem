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
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkHoursDto)
  work_hours?: WorkHoursDto;

  @IsOptional()
  @IsArray()
  work_days?: number[];

  @IsOptional()
  @IsEnum(['office', 'remote', 'hybrid'])
  work_type?: 'office' | 'remote' | 'hybrid';

  @IsOptional()
  @IsArray()
  @IsEnum(['evenings', 'weekends', 'lunch', 'mornings'], { each: true })
  personal_windows?: ('evenings' | 'weekends' | 'lunch' | 'mornings')[];

  @IsOptional()
  @IsEnum(['weekend_morning', 'lunch', 'after_work'])
  errand_window?: 'weekend_morning' | 'lunch' | 'after_work';
}
