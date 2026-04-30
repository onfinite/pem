import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { UserRow } from '@/database/schemas/index';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserRow => {
    const req = ctx.switchToHttp().getRequest<{ user: UserRow }>();
    return req.user;
  },
);
