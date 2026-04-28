import { IsString } from 'class-validator';

export class TimezoneDto {
  @IsString()
  timezone!: string;
}
