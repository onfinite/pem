import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class NotificationTimeDto {
  @ApiProperty({ example: '08:00', description: 'HH:MM 24-hour format' })
  @IsString()
  @MaxLength(5)
  @Matches(/^\d{2}:\d{2}$/, { message: 'time must be in HH:MM format' })
  time!: string;
}
