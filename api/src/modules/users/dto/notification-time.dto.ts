import { Matches } from 'class-validator';

export class NotificationTimeDto {
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  time!: string;
}
