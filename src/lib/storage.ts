import { Storage } from '@google-cloud/storage';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

export interface StorageConfig {
  provider: 's3' | 'gcs';
  bucket: string;
  region?: string | null;
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
  endpoint?: string | null;
  gcpProjectId?: string | null;
  gcpCredentials?: string | null;
}

export async function listPulumiStates(config: StorageConfig) {
  if (config.provider === 's3') {
    const client = new S3Client({
      region: config.region || undefined,
      credentials: {
        accessKeyId: config.accessKeyId || '',
        secretAccessKey: config.secretAccessKey || '',
      },
      endpoint: config.endpoint || undefined,
      forcePathStyle: !!config.endpoint,
    });

    const response = await client.send(new ListObjectsV2Command({ Bucket: config.bucket }));
    const files = response.Contents?.map((item) => item.Key || '') || [];

    const states = files.filter((file) => {
      if (!file.endsWith('.json')) return false;
      if (file.includes('/history/')) return false;
      if (file.includes('/backups/')) return false;
      if (file.endsWith('.json.bak')) return false;
      return file.includes('.pulumi/stacks/') || !file.includes('.pulumi/');
    });

    const locks = files.filter((file) => file.startsWith('.pulumi/locks/'));
    return { states, locks };
  }

  if (config.provider === 'gcs') {
    const gcsOptions: Record<string, unknown> = {};
    if (config.gcpProjectId?.trim()) {
      gcsOptions.projectId = config.gcpProjectId;
    }
    if (config.gcpCredentials?.trim()) {
      try {
        gcsOptions.credentials = JSON.parse(config.gcpCredentials);
      } catch {
        throw new Error('Invalid GCP Credentials JSON');
      }
    }

    const storage = new Storage(gcsOptions);
    const [files] = await storage.bucket(config.bucket).getFiles();
    const fileNames = files.map((file) => file.name);

    const states = fileNames.filter((file) => {
      if (!file.endsWith('.json')) return false;
      if (file.includes('/history/')) return false;
      if (file.includes('/backups/')) return false;
      if (file.endsWith('.json.bak')) return false;
      return file.includes('.pulumi/stacks/') || !file.includes('.pulumi/');
    });

    const locks = fileNames.filter((file) => file.startsWith('.pulumi/locks/'));
    return { states, locks };
  }

  throw new Error('Unsupported provider');
}

export async function getPulumiState(config: StorageConfig, key: string) {
  if (config.provider === 's3') {
    const client = new S3Client({
      region: config.region || undefined,
      credentials: {
        accessKeyId: config.accessKeyId || '',
        secretAccessKey: config.secretAccessKey || '',
      },
      endpoint: config.endpoint || undefined,
      forcePathStyle: !!config.endpoint,
    });

    const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const str = await response.Body?.transformToString();
    if (!str) throw new Error('Empty state file');
    return JSON.parse(str);
  }

  if (config.provider === 'gcs') {
    const gcsOptions: Record<string, unknown> = {};
    if (config.gcpProjectId?.trim()) {
      gcsOptions.projectId = config.gcpProjectId;
    }
    if (config.gcpCredentials?.trim()) {
      try {
        gcsOptions.credentials = JSON.parse(config.gcpCredentials);
      } catch {
        throw new Error('Invalid GCP Credentials JSON');
      }
    }

    const storage = new Storage(gcsOptions);
    const file = storage.bucket(config.bucket).file(key);
    const [contents] = await file.download();
    return JSON.parse(contents.toString('utf8'));
  }

  throw new Error('Unsupported provider');
}

export async function listPulumiHistory(config: StorageConfig, cleanId: string) {
  const prefix = `.pulumi/history/${cleanId}/`;

  if (config.provider === 's3') {
    const client = new S3Client({
      region: config.region || undefined,
      credentials: {
        accessKeyId: config.accessKeyId || '',
        secretAccessKey: config.secretAccessKey || '',
      },
      endpoint: config.endpoint || undefined,
      forcePathStyle: !!config.endpoint,
    });

    const response = await client.send(
      new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix }),
    );
    const files = response.Contents?.map((item) => item.Key || '') || [];
    const historyFiles = files.filter((file) => file.endsWith('.history.json'));

    const historyData = await Promise.all(
      historyFiles.map(async (key) => {
        const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        const str = await result.Body?.transformToString();
        if (!str) return null;
        const data = JSON.parse(str);
        return { key, ...data };
      }),
    );

    return historyData.filter(Boolean).sort((a, b) => b.startTime - a.startTime);
  }

  if (config.provider === 'gcs') {
    const gcsOptions: Record<string, unknown> = {};
    if (config.gcpProjectId?.trim()) {
      gcsOptions.projectId = config.gcpProjectId;
    }
    if (config.gcpCredentials?.trim()) {
      try {
        gcsOptions.credentials = JSON.parse(config.gcpCredentials);
      } catch {
        throw new Error('Invalid GCP Credentials JSON');
      }
    }

    const storage = new Storage(gcsOptions);
    const [files] = await storage.bucket(config.bucket).getFiles({ prefix });
    const historyFiles = files
      .map((file) => file.name)
      .filter((name) => name.endsWith('.history.json'));

    const historyData = await Promise.all(
      historyFiles.map(async (key) => {
        const file = storage.bucket(config.bucket).file(key);
        const [contents] = await file.download();
        const data = JSON.parse(contents.toString('utf8'));
        return { key, ...data };
      }),
    );

    return historyData.sort((a, b) => b.startTime - a.startTime);
  }

  throw new Error('Unsupported provider');
}
