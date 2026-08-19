import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import type {
  QueuePersistence,
  QueueSnapshot,
  WebRequest,
} from '../shared/types.js';
import { queueSnapshotSchema } from './persistence.js';
import { ensureDir, type Paths } from './paths.js';

export type QueueWarning = 'queue-corrupt';

export interface QueueLoadResult {
  requests: WebRequest[];
  warning: QueueWarning | null;
}

export interface FileQueueStore extends QueuePersistence {
  load(): QueueLoadResult;
}

export function createFileQueueStore(paths: Paths): FileQueueStore {
  return {
    load() {
      ensureDir(paths);
      if (!existsSync(paths.queueFile)) {
        return { requests: [], warning: null };
      }

      chmodSync(paths.queueFile, 0o600);
      const raw = readFileSync(paths.queueFile, 'utf8');
      let snapshot: QueueSnapshot | null = null;
      try {
        const parsed = queueSnapshotSchema.safeParse(JSON.parse(raw));
        if (parsed.success) snapshot = parsed.data;
      } catch {
        // Invalid JSON is handled by the same quarantine path as bad schemas.
      }

      if (snapshot) {
        return { requests: snapshot.requests, warning: null };
      }

      const quarantineFile = `${paths.queueFile}.corrupt-${Date.now()}`;
      renameSync(paths.queueFile, quarantineFile);
      console.warn('queue-corrupt', { path: quarantineFile });
      return { requests: [], warning: 'queue-corrupt' };
    },

    save(snapshot) {
      ensureDir(paths);
      const tempFile = `${paths.queueFile}.tmp-${process.pid}-${Date.now()}`;
      let fd: number | undefined;
      try {
        fd = openSync(tempFile, 'wx', 0o600);
        writeFileSync(fd, JSON.stringify(snapshot));
        fsyncSync(fd);
        closeSync(fd);
        fd = undefined;
        chmodSync(tempFile, 0o600);
        renameSync(tempFile, paths.queueFile);
      } catch (error) {
        if (fd !== undefined) closeSync(fd);
        if (existsSync(tempFile)) unlinkSync(tempFile);
        throw error;
      }
    },
  };
}
