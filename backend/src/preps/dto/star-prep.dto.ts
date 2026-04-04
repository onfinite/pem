import { IsBoolean } from 'class-validator';

/** PATCH /preps/:id/star — toggle Gmail-style star on a prep. */
export class StarPrepDto {
  @IsBoolean()
  starred!: boolean;
}
