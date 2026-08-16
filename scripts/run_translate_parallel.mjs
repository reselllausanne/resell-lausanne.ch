#!/usr/bin/env node
/*
 * Launch N parallel translation shards. Each shard writes its own checkpoint/log.
 *
 *   SHARDS=6 BATCH_SIZE=40 node --env-file=apps/.env scripts/run_translate_parallel.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SHARDS = parseInt(process.env.SHARDS || '6', 10);
const script = path.resolve('scripts/translate_products_cursor.mjs');
const logDir = path.resolve('seo-system/parallel-runs');
fs.mkdirSync(logDir, { recursive: true });

console.log(`[parallel] warming EN candidates cache...`);
const warm = spawnSync(process.execPath, ['--env-file=apps/.env', script], {
  env: { ...process.env, WARM_CACHE_ONLY: '1', CANDIDATES_CACHE: '0' },
  cwd: process.cwd(),
  stdio: 'inherit',
});
if (warm.status !== 0) process.exit(warm.status || 1);

const children = [];
for (let shard = 0; shard < SHARDS; shard++) {
  const logFile = path.join(logDir, `shard-${shard}.log`);
  fs.writeFileSync(logFile, `[parallel] shard ${shard}/${SHARDS} started ${new Date().toISOString()}\n`);
  const out = fs.openSync(logFile, 'a');
  const env = {
    ...process.env,
    SHARD: String(shard),
    TOTAL_SHARDS: String(SHARDS),
    CANDIDATES_CACHE: process.env.CANDIDATES_CACHE ?? '1',
    REPAIR: process.env.REPAIR ?? '',
  };
  const child = spawn(process.execPath, ['--env-file=apps/.env', script], {
    env,
    stdio: ['ignore', out, out],
    cwd: process.cwd(),
  });
  children.push({ shard, child, logFile });
  console.log(`[parallel] shard ${shard}/${SHARDS} → ${logFile}`);
}

let exitCode = 0;
await Promise.all(
  children.map(
    ({ shard, child, logFile }) =>
      new Promise((resolve) => {
        child.on('exit', (code) => {
          console.log(`[parallel] shard ${shard} exit ${code} (see ${logFile})`);
          if (code) exitCode = code;
          resolve();
        });
      }),
  ),
);

process.exit(exitCode);
