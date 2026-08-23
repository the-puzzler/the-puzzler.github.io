import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const builder = path.join(scriptDir, 'build-site.py');
const result = spawnSync('python3', [builder], { stdio: 'inherit' });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
