import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { clerkProfileFromJwtPayload } from '@/core/auth/clerk-jwt-profile';
import { UserService } from '@/modules/users/user.service';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private jwksUrl: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly users: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const jwksUrl = this.config.get<string>('clerk.jwksUrl');
    const issuer = this.config.get<string>('clerk.jwtIssuer');
    if (!jwksUrl || !issuer) {
      throw new ServiceUnavailableException(
        'Authentication is not configured on the server',
      );
    }

    const req = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string }; user?: unknown }>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid token');
    }
    const token = auth.slice('Bearer '.length).trim();

    if (this.jwksUrl !== jwksUrl || !this.jwks) {
      this.jwksUrl = jwksUrl;
      this.jwks = createRemoteJWKSet(new URL(jwksUrl));
    }
    const jwks = this.jwks;
    if (!jwks) {
      throw new ServiceUnavailableException(
        'Authentication is not configured on the server',
      );
    }

    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(token, jwks, { issuer });
      payload = verified.payload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const claim = payload.sub;
    if (typeof claim !== 'string' || !claim) {
      throw new UnauthorizedException('Invalid token');
    }
    const sub = claim;

    const { email, name } = clerkProfileFromJwtPayload(payload);
    let user = await this.users.findByClerkId(sub);
    if (!user) {
      user = await this.users.upsertUserFromClerk(sub, email, name);
    } else if (
      (email !== null && email !== user.email) ||
      (name !== null && name !== user.name)
    ) {
      user = await this.users.upsertUserFromClerk(
        sub,
        email ?? user.email,
        name ?? user.name,
      );
    }
    req.user = user;
    return true;
  }
}
