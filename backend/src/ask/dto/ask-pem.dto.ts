import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AskPemDto {
  @ApiProperty({ description: 'Question to ask Pem about your thoughts' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  question!: string;
}
