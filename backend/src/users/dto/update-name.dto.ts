import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateNameDto {
  @ApiProperty({ description: 'Preferred display name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
