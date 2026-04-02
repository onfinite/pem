import { ApiProperty } from '@nestjs/swagger';

/** Response shape for `GET /users/me`. */
export class UserMeDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  clerk_id!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  full_name!: string | null;

  @ApiProperty()
  is_active!: boolean;
}
