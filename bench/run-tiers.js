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
const os = require('node:os');
const path = require('node:path');

const BENCH_SCRIPT = path.join(__dirname, 'tiers.bench.js');
const REPEATS = Number(process.env.BENCH_REPEATS) || 5;

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

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function main() {
  const allRuns = [];
  for (const config of CONFIGS) {
    for (let rep = 1; rep <= REPEATS; rep++) {
      process.stderr.write(`running: ${config.label} (${config.note}) rep ${rep}/${REPEATS}\n`);
      allRuns.push(...runOne(config));
    }
  }

  const benches = [...new Set(allRuns.map((r) => r.bench))];
  const lines = [];

  lines.push(`node ${process.version}, ${os.arch()}, ${os.cpus()[0]?.model ?? 'unknown CPU'}`);
  lines.push(`${REPEATS} repeats per config, median reported, range shown as [min–max]`);

  for (const bench of benches) {
    const byLabel = CONFIGS.map((config) => {
      const runs = allRuns.filter((r) => r.bench === bench && r.label === config.label);
      const msValues = runs.map((r) => r.ms);
      const medianMs = median(msValues);
      const iterations = runs[0].iterations;
      return {
        label: config.label,
        note: config.note,
        medianMs,
        minMs: Math.min(...msValues),
        maxMs: Math.max(...msValues),
        opsPerSec: Math.round((iterations / medianMs) * 1000),
        iterations,
      };
    });
    const baseline = byLabel.find((r) => r.label === 'no-opt');

    lines.push('');
    lines.push(`${bench}() — ${byLabel[0].iterations.toLocaleString()} iterations, after warmup`);
    lines.push(pad('config', 18) + pad('median ms', 12) + pad('[min–max]', 20) + pad('ops/sec', 14) + 'vs no-opt');
    for (const r of byLabel) {
      const speedup = baseline ? (baseline.medianMs / r.medianMs).toFixed(2) + 'x' : '-';
      const range = `[${r.minMs.toFixed(1)}–${r.maxMs.toFixed(1)}]`;
      lines.push(
        pad(r.label, 18) + pad(r.medianMs.toFixed(2), 12) + pad(range, 20) + pad(r.opsPerSec.toLocaleString(), 14) + speedup,
      );
    }
  }

  console.log(lines.join('\n'));
}

main();
