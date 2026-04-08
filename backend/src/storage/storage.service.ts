import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
      this.log.warn('R2 credentials missing — audio upload disabled');
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
}
