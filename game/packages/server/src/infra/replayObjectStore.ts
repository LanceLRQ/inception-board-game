import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ReplayObjectStore } from '../match/ColdReplay.js';

export function replayObjectStoreFromEnv(env: NodeJS.ProcessEnv): ReplayObjectStore | undefined {
  const bucket = env.REPLAY_ARCHIVE_BUCKET?.trim();
  if (!bucket) return undefined;
  const endpoint = env.REPLAY_ARCHIVE_ENDPOINT?.trim() || undefined;
  const client = new S3Client({
    region: env.REPLAY_ARCHIVE_REGION?.trim() || 'us-east-1',
    ...(endpoint && { endpoint, forcePathStyle: true }),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return {
    async put(key, body) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: 'application/gzip',
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
    },
    async get(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(30_000),
      });
      if (!result.Body) throw new Error('Replay archive object is empty');
      return Buffer.from(await result.Body.transformToByteArray());
    },
  };
}
