import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProfileFactDto {
  @ApiProperty({
    example: 'Location',
    description: 'Short label (normalized to snake_case memory_key)',
  })
  @IsString()
  @MaxLength(200)
  key!: string;

  @ApiProperty({ example: 'Based in the East Bay, CA' })
  @IsString()
  @MaxLength(16_000)
  note!: string;
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
  @MaxLength(16_000)
  note?: string;
}
