#!/usr/bin/env node
/*
 * Launch N parallel DE translation shards.
 * Each shard writes its own checkpoint/log; safe to Ctrl-C mid-run.
 *
 *   SHARDS=6 BATCH_SIZE=15 node --env-file=apps/.env scripts/run_translate_de_parallel.mjs
 *   SHARDS=1 LIMIT=5 DRY_RUN=1 node --env-file=apps/.env scripts/run_translate_de_parallel.mjs   # pilot
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SHARDS = parseInt(process.env.SHARDS || '6', 10);
const script = path.resolve('scripts/translate_products_de_cursor.mjs');
const logDir = path.resolve('seo-system/parallel-runs-de');
fs.mkdirSync(logDir, { recursive: true });

console.log(`[de-parallel] warming FR candidates cache...`);
const warm = spawnSync(process.execPath, ['--env-file=apps/.env', script], {
  env: { ...process.env, WARM_CACHE_ONLY: '1', CANDIDATES_CACHE: '0' },
  cwd: process.cwd(),
  stdio: 'inherit',
});
if (warm.status !== 0) process.exit(warm.status || 1);

const children = [];
for (let shard = 0; shard < SHARDS; shard++) {
  const logFile = path.join(logDir, `shard-${shard}.log`);
  fs.writeFileSync(logFile, `[de-parallel] shard ${shard}/${SHARDS} started ${new Date().toISOString()}\n`);
  const out = fs.openSync(logFile, 'a');
  const env = {
    ...process.env,
    SHARD: String(shard),
    TOTAL_SHARDS: String(SHARDS),
    CANDIDATES_CACHE: process.env.CANDIDATES_CACHE ?? '1',
  };
  const child = spawn(process.execPath, ['--env-file=apps/.env', script], {
    env,
    stdio: ['ignore', out, out],
    cwd: process.cwd(),
  });
  child.on('exit', (code) => {
    console.log(`[de-parallel] shard ${shard} exited ${code} → ${logFile}`);
  });
  children.push({ shard, child, logFile });
}

console.log(`[de-parallel] launched ${SHARDS} shards. Tail logs:`);
for (const c of children) console.log(`  tail -f ${c.logFile}`);
