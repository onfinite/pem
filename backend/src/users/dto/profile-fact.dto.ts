import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProfileFactDto {
  @ApiProperty({
    example: 'Location',
    description: 'Short label (normalized to snake_case)',
  })
  @IsString()
  @MaxLength(200)
  key!: string;

  @ApiProperty({ example: 'East Bay, CA' })
  @IsString()
  @MaxLength(8000)
  value!: string;
}

export class UpdateProfileFactDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  value?: string;
}
