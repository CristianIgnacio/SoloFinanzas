import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const mode = process.argv[2];
if (!['production', 'development'].includes(mode)) throw new Error('Usage: node benchmarks/report.mjs production|development');
const root = resolve(import.meta.dirname, '..');
function walk(path) { return readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(resolve(path, e.name)) : [resolve(path, e.name)]); }
// Use original output files only; Playwright also copies them into attachments.
const files = walk(resolve(root, `test-results/benchmark-${mode}`)).filter(p => /[\\/]network-baseline\.json$/.test(p));
if (!files.length) throw new Error('No successful benchmark attachments found.');
const runs = files.map(p => JSON.parse(readFileSync(p, 'utf8')));
const median = values => { const a = values.toSorted((a, b) => a - b); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
const summary = runs[0].measurements.map(m => {
  const samples = runs.map(r => r.measurements.find(x => x.name === m.name));
  return { name: m.name, started: samples.map(s => s.started), decodedBytes: samples.map(s => s.decodedBytes),
    medianUiCheckpointMs: median(samples.map(s => s.uiCheckpointMs)), medianApiCompleteMs: median(samples.map(s => s.apiCompleteMs)) };
});
const dir = resolve(root, '../docs/measurements'); mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, `http-baseline-${mode}.json`), JSON.stringify({ mode, capturedAt: new Date().toISOString(), fixture: runs[0].fixture, runs, summary }, null, 2) + '\n');
console.table(summary);
