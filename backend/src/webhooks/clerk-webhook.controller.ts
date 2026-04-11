import {
  BadRequestException,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Webhook } from 'svix';

import { ListsService } from '../lists/lists.service';
import { UserService } from '../users/user.service';
import { ClerkWebhookOkDto } from './dto/clerk-webhook-ok.dto';

/** Resolve primary email from Clerk `User` object in webhook `data`. */
function primaryEmail(data: Record<string, unknown>): string | null {
  const addresses = data.email_addresses;
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return null;
  }

  const primaryId = data.primary_email_address_id;
  if (typeof primaryId === 'string') {
    for (const item of addresses) {
      if (
        item &&
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        (item as { id?: unknown }).id === primaryId &&
        'email_address' in item
      ) {
        const e = (item as { email_address?: unknown }).email_address;
        if (typeof e === 'string') {
          return e;
        }
      }
    }
  }

  const first: unknown = addresses[0];
  if (
    first &&
    typeof first === 'object' &&
    first !== null &&
    'email_address' in first
  ) {
    const e = (first as { email_address?: unknown }).email_address;
    return typeof e === 'string' ? e : null;
  }
  return null;
}

function fullName(data: Record<string, unknown>): string | null {
  const firstRaw = data.first_name;
  const lastRaw = data.last_name;
  const first = (typeof firstRaw === 'string' ? firstRaw : '').trim();
  const last = (typeof lastRaw === 'string' ? lastRaw : '').trim();
  const joined = [first, last].filter(Boolean).join(' ');
  return joined || null;
}

function clerkUserId(data: Record<string, unknown>): string | null {
  const id = data.id;
  if (typeof id === 'string' && id.length > 0) {
    return id;
  }
  if (id != null && (typeof id === 'number' || typeof id === 'bigint')) {
    return String(id);
  }
  return null;
}

@ApiTags('webhooks')
@Controller()
@SkipThrottle()
export class ClerkWebhookController {
  private readonly log = new Logger(ClerkWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly users: UserService,
    private readonly lists: ListsService,
  ) {}

  @Post('webhooks/clerk')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Clerk webhook (Svix)',
    description:
      'Verifies Svix signatures on the raw JSON body. Handles `user.created`, `user.updated`, and `user.deleted`. ' +
      'Subscribe to **user.created** (and usually **user.updated**) in the Clerk dashboard — other events return 200 but do not sync users. ' +
      'Swagger “Try it out” will not work (body must be raw and Svix-signed).',
  })
  @ApiHeader({ name: 'svix-id', required: true })
  @ApiHeader({ name: 'svix-timestamp', required: true })
  @ApiHeader({ name: 'svix-signature', required: true })
  @ApiOkResponse({ type: ClerkWebhookOkDto })
  @ApiResponse({
    status: 400,
    description: 'Missing headers, bad signature, or invalid payload',
  })
  @ApiResponse({ status: 503, description: 'Webhook secret not configured' })
  async handleClerk(@Req() req: Request) {
    const secret = this.config.get<string>('clerk.webhookSecret');
    if (!secret) {
      throw new ServiceUnavailableException('Clerk webhook is not configured');
    }

    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];
    if (
      typeof svixId !== 'string' ||
      typeof svixTimestamp !== 'string' ||
      typeof svixSignature !== 'string'
    ) {
      throw new BadRequestException('Missing Svix headers');
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    const wh = new Webhook(secret);
    let payload: unknown;
    try {
      payload = wh.verify(rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch {
      this.log.warn('clerk_webhook_invalid_signature');
      throw new BadRequestException('Invalid signature');
    }

    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid payload shape');
    }

    const p = payload as Record<string, unknown>;
    const eventType = p.type;
    const raw = p.data;

    // Always log event type — Clerk shows 200 even when we skip unknown events.
    this.log.log(`clerk_webhook received type=${String(eventType)}`);

    const data: Record<string, unknown> =
      raw && typeof raw === 'object' && raw !== null
        ? (raw as Record<string, unknown>)
        : {};

    if (raw && typeof raw !== 'object') {
      this.log.warn(
        `clerk_webhook data is not an object (got ${typeof raw}) — check Clerk payload version`,
      );
    }

    try {
      if (eventType === 'user.created' || eventType === 'user.updated') {
        const clerkId = clerkUserId(data);
        if (!clerkId) {
          throw new BadRequestException('Missing user id');
        }
        const user = await this.users.upsertUserFromClerk(
          clerkId,
          primaryEmail(data),
          fullName(data),
        );
        if (eventType === 'user.created' && user) {
          await this.lists
            .seedDefaults(user.id)
            .catch((err) =>
              this.log.warn(
                `Failed to seed default lists: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
        }
        this.log.log(
          `clerk_user_upserted event=${String(eventType)} clerk_id=${clerkId}`,
        );
      } else if (eventType === 'user.deleted') {
        const clerkId = clerkUserId(data);
        if (!clerkId) {
          throw new BadRequestException('Missing user id');
        }
        const deleted = await this.users.deleteUserByClerkId(clerkId);
        this.log.log(
          `clerk_user_deleted clerk_id=${clerkId} deleted=${deleted}`,
        );
      } else {
        // 200 still returned — Svix/Clerk mark delivery OK; no DB change unless you handle this type.
        this.log.warn(
          `clerk_webhook unhandled event type=${String(eventType)} — add subscription for user.created / user.updated in Clerk dashboard if you expected a DB row`,
        );
      }
    } catch (e) {
      if (e instanceof BadRequestException) {
        throw e;
      }
      this.log.error(e instanceof Error ? e.stack : String(e));
      throw e;
    }

    return { status: 'ok' };
  }
}
