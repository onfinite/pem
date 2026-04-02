import { ApiProperty } from '@nestjs/swagger';

/** Response shape for `GET /users/me`. */
export class UserMeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clerk_id!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  push_token!: string | null;
}
