'use strict';

// Runs bench/tiers.bench.js once per V8 optimizing-compiler tier config, in
// a fresh `node` process per config (tiering state isn't something you can
// toggle mid-process). V8's real pipeline is always
// Ignition (interpreter) -> Sparkplug (baseline JIT) -> Maglev -> TurboFan;
// --no-turbofan / --no-maglev just stop a process from tiering past that
// point, which is what "only Maglev" / "only TurboFan" mean here — Ignition
// and Sparkplug are never disabled, in any of the 4 runs, since the user
// asked about the two *optimizing* compilers specifically.
//
//   npm run bench

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const BENCH_SCRIPT = path.join(__dirname, 'tiers.bench.js');

const CONFIGS = [
  { label: 'no-opt', note: 'Ignition + Sparkplug only', flags: ['--no-turbofan', '--no-maglev'] },
  { label: 'maglev-only', note: 'no TurboFan', flags: ['--no-turbofan', '--maglev'] },
  { label: 'turbofan-only', note: 'no Maglev', flags: ['--turbofan', '--no-maglev'] },
  { label: 'turbofan+maglev', note: 'default pipeline', flags: ['--turbofan', '--maglev'] },
];

function runOne(config) {
  const args = [...config.flags, BENCH_SCRIPT, config.label];
  const proc = spawnSync(process.execPath, args, { encoding: 'utf8' });

  if (proc.error) throw proc.error;
  if (proc.status !== 0) {
    process.stderr.write(proc.stderr);
    throw new Error(`bench process for "${config.label}" exited with code ${proc.status}`);
  }

  return proc.stdout
    .split('\n')
    .filter((line) => line.startsWith('RESULT '))
    .map((line) => JSON.parse(line.slice('RESULT '.length)));
}

function pad(str, len) {
  str = String(str);
  return str + ' '.repeat(Math.max(0, len - str.length));
}

function main() {
  const allResults = [];
  for (const config of CONFIGS) {
    process.stderr.write(`running: ${config.label} (${config.note}) — ${config.flags.join(' ')}\n`);
    allResults.push(...runOne(config));
  }

  const benches = [...new Set(allResults.map((r) => r.bench))];

  for (const bench of benches) {
    const rows = allResults.filter((r) => r.bench === bench);
    const baseline = rows.find((r) => r.label === 'no-opt');

    console.log(`\n${bench}() — ${rows[0].iterations.toLocaleString()} iterations, after warmup`);
    console.log(pad('config', 18) + pad('ms', 10) + pad('ops/sec', 14) + 'vs no-opt');
    for (const r of rows) {
      const speedup = baseline ? (baseline.ms / r.ms).toFixed(2) + 'x' : '-';
      console.log(pad(r.label, 18) + pad(r.ms, 10) + pad(r.opsPerSec.toLocaleString(), 14) + speedup);
    }
  }
}

main();
