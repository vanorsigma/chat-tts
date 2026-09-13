import { createReadStream, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface FileStreamOptions {
  start?: number;
  end?: number;
  onClose?: () => void;
}

export function createTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function removeTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    console.warn('tempFiles: failed to delete temp dir', dir, err);
  }
}

export function fileToWebStream(
  filePath: string,
  options: FileStreamOptions = {}
): ReadableStream<Uint8Array> {
  const { start, end, onClose } = options;
  const fileStream = createReadStream(filePath, start === undefined ? undefined : { start, end });

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    onClose?.();
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      fileStream.on('data', (chunk) => controller.enqueue(chunk as Uint8Array));
      fileStream.on('end', () => {
        cleanup();
        controller.close();
      });
      fileStream.on('error', (err) => {
        cleanup();
        controller.error(err);
      });
    },
    cancel() {
      fileStream.destroy();
      cleanup();
    }
  });
}
