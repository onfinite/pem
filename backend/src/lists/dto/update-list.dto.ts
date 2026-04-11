import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateListDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(30)
  color?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(60)
  icon?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Min(0)
  sortOrder?: number;
}
