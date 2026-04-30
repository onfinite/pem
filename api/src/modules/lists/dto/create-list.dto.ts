import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateListDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;
}
