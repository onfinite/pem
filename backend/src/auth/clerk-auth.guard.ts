import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { UserService } from '../users/user.service';

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

    let sub: string;
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer });
      const claim = payload.sub;
      if (typeof claim !== 'string' || !claim) {
        throw new UnauthorizedException('Invalid token');
      }
      sub = claim;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.users.findByClerkId(sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!user.isActive) {
      throw new ForbiddenException('User inactive');
    }
    req.user = user;
    return true;
  }
}
