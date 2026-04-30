import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { logWithContext } from '@/core/utils/format-log-context';

@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucket = process.env.R2_BUCKET_NAME ?? 'pem-audio';

    if (accountId && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.log.warn(
        logWithContext('R2 credentials missing — audio upload disabled', {
          scope: 'storage_r2',
        }),
      );
      this.client = null;
    }
  }

  get enabled(): boolean {
    return this.client != null;
  }

  async upload(
    key: string,
    body: Buffer,
    contentType = 'audio/m4a',
  ): Promise<void> {
    if (!this.client) return;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string | null> {
    if (!this.client) return null;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  /** Presigned PUT for direct client uploads (e.g. chat images). */
  async getPresignedPutUrl(
    key: string,
    contentType: string,
    expiresIn = 900,
  ): Promise<string | null> {
    if (!this.client) return null;
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn },
    );
  }

  /** Download object bytes (e.g. for server-side vision). */
  async downloadObject(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!this.client) return null;
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = res.Body;
    if (!body) return null;
    const stream = body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const ct =
      typeof res.ContentType === 'string' && res.ContentType
        ? res.ContentType
        : 'application/octet-stream';
    return { buffer: Buffer.concat(chunks), contentType: ct };
  }
}
