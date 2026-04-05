import { IsBoolean } from 'class-validator';

/** PATCH /preps/:id/done — move between Inbox and Done (ready preps only). */
export class SetPrepDoneDto {
  @IsBoolean()
  done!: boolean;
}
