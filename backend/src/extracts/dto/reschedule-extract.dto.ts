import { IsIn, IsString } from 'class-validator';

const URGENCY_VALUES = [
  'today',
  'tomorrow',
  'this_week',
  'next_week',
  'holding',
] as const;

export type RescheduleTarget = (typeof URGENCY_VALUES)[number];

export class RescheduleExtractDto {
  @IsString()
  @IsIn([...URGENCY_VALUES])
  target!: RescheduleTarget;
}
