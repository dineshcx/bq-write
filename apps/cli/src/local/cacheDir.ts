import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

/**
 * Returns ~/.bq-write/<sha1-of-repoDir>/
 * All cache files for a repo live here — nothing written into the project itself.
 */
export function getCacheDir(repoDir: string): string {
  const hash = crypto.createHash('sha1').update(repoDir).digest('hex').slice(0, 12);
  const dir = path.join(os.homedir(), '.bq-write', hash);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
