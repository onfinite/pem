import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class AppleEventDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() startDate!: string;
  @ApiProperty() @IsString() endDate!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() location?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() status?: string;
}

export class AppleSyncDto {
  @ApiProperty() @IsString() connectionId!: string;

  @ApiProperty({ type: [AppleEventDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AppleEventDto)
  events!: AppleEventDto[];
}

export class AppleConnectDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  calendarIds!: string[];
}
