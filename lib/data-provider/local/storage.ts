import fs from 'fs';
import path from 'path';
import { LOCAL_DATA_DIR } from './constants';
import { newId } from './utils';

function ensureFilesDir(): string {
  const dir = path.join(process.cwd(), LOCAL_DATA_DIR, 'files');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function createLocalStorage() {
  return {
    from(bucket: string) {
      return {
        async upload(
          filePath: string,
          body: Buffer | ArrayBuffer | Blob | File,
          _options?: { contentType?: string; upsert?: boolean }
        ) {
          const dir = path.join(ensureFilesDir(), bucket);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const filename = `${newId()}-${path.basename(filePath)}`;
          const fullPath = path.join(dir, filename);
          let buffer: Buffer;
          if (Buffer.isBuffer(body)) {
            buffer = body;
          } else if (body instanceof ArrayBuffer) {
            buffer = Buffer.from(body);
          } else {
            const arrayBuffer = await body.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
          }
          fs.writeFileSync(fullPath, buffer);
          return { data: { path: `${bucket}/${filename}` }, error: null };
        },

        async createSignedUrl(
          filePath: string,
          _expiresIn: number
        ): Promise<{
          data: { signedUrl: string } | null;
          error: { message: string } | null;
        }> {
          const localPath = path.join(
            process.cwd(),
            LOCAL_DATA_DIR,
            'files',
            filePath
          );
          if (!fs.existsSync(localPath)) {
            return { data: null, error: { message: 'File not found' } };
          }
          return {
            data: { signedUrl: `file://${localPath}` },
            error: null,
          };
        },

        async remove(paths: string[]) {
          for (const p of paths) {
            const localPath = path.join(
              process.cwd(),
              LOCAL_DATA_DIR,
              'files',
              p
            );
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
          }
          return { data: paths, error: null };
        },

        getPublicUrl(filePath: string) {
          return {
            data: {
              publicUrl: `/api/local-files/${encodeURIComponent(filePath)}`,
            },
          };
        },
      };
    },
  };
}
