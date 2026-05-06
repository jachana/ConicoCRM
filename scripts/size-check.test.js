/**
 * size-check.test.js — Unit tests for size-check.js (T3.2)
 *
 * Run: node --test scripts/size-check.test.js
 *
 * Uses Node's built-in test runner (node:test) and assert.
 * No external dependencies.
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

import {
  gzippedSize,
  classifyFile,
  parseBudgetBytes,
  buildResults,
  printTable,
  collectSizes,
  loadBudget,
  run,
} from './size-check.js';

const gzipAsync = promisify(gzip);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a Buffer that gzip-compresses to approximately `targetBytes`.
 * We achieve this by gzipping known-size content and adjusting.
 * For tests we just use pre-computed buffers via actual gzip.
 *
 * Returns a Buffer that when passed through gzippedSize() gives ≈ targetBytes.
 * Strategy: create a buffer of random(ish) bytes large enough that gzip ratio ≈ 1
 * so that uncompressed ≈ compressed (random data doesn't compress well).
 */
async function bufferWithGzippedSize(targetBytes) {
  // Use random-looking data (repeating pattern that won't compress much)
  // Iteratively approach, but for tests just use raw binary data
  // that compresses poorly: each byte = its index mod 251 (prime)
  let size = Math.ceil(targetBytes * 1.05); // slight overestimate
  let buf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buf[i] = (i * 7 + 13) % 256; // pseudo-random pattern

  // Adjust until gzipped size matches target within 0.5KB
  // (In practice a single pass is enough for unit tests — we don't need exact)
  return buf;
}

// ---------------------------------------------------------------------------
// parseBudgetBytes
// ---------------------------------------------------------------------------

describe('parseBudgetBytes', () => {
  it('parses "350KB" → 350 * 1024', () => {
    assert.strictEqual(parseBudgetBytes('350KB'), 350 * 1024);
  });

  it('parses "500KB" case-insensitive', () => {
    assert.strictEqual(parseBudgetBytes('500kb'), 500 * 1024);
  });

  it('throws on invalid format', () => {
    assert.throws(() => parseBudgetBytes('350'), /Invalid budget value/);
    assert.throws(() => parseBudgetBytes('350MB'), /Invalid budget value/);
  });
});

// ---------------------------------------------------------------------------
// classifyFile
// ---------------------------------------------------------------------------

describe('classifyFile', () => {
  it('vendor: contains "vendor"', () => {
    assert.strictEqual(classifyFile('vendor-abc123.js'), 'vendor');
  });

  it('vendor: starts with "chunk-"', () => {
    assert.strictEqual(classifyFile('chunk-react-dom.js'), 'vendor');
  });

  it('vendor: contains "node_modules"', () => {
    assert.strictEqual(classifyFile('node_modules-xyz.js'), 'vendor');
  });

  it('main: primary app bundle', () => {
    assert.strictEqual(classifyFile('index-CZ5b1ovi.js'), 'main');
  });

  it('main: other non-matching filename', () => {
    assert.strictEqual(classifyFile('app-entry.js'), 'main');
  });
});

// ---------------------------------------------------------------------------
// gzippedSize
// ---------------------------------------------------------------------------

describe('gzippedSize', () => {
  it('returns a positive number for non-empty buffer', async () => {
    const buf = Buffer.from('hello world this is a test string repeated '.repeat(100));
    const size = await gzippedSize(buf);
    assert.ok(size > 0, 'gzipped size should be positive');
    assert.ok(size < buf.length, 'gzipped should be smaller than original for compressible data');
  });

  it('returns consistent results for the same input', async () => {
    const buf = Buffer.from('abc'.repeat(500));
    const s1 = await gzippedSize(buf);
    const s2 = await gzippedSize(buf);
    assert.strictEqual(s1, s2);
  });
});

// ---------------------------------------------------------------------------
// buildResults / printTable
// ---------------------------------------------------------------------------

describe('buildResults', () => {
  it('marks categories as pass when within budget', () => {
    const sizes = { main: 100 * 1024, vendor: 200 * 1024 };
    const budgets = { main: 350 * 1024, vendor: 500 * 1024 };
    const results = buildResults(sizes, budgets);
    assert.ok(results.find((r) => r.category === 'main').pass);
    assert.ok(results.find((r) => r.category === 'vendor').pass);
  });

  it('marks main as fail when over budget', () => {
    const sizes = { main: 400 * 1024, vendor: 200 * 1024 };
    const budgets = { main: 350 * 1024, vendor: 500 * 1024 };
    const results = buildResults(sizes, budgets);
    assert.ok(!results.find((r) => r.category === 'main').pass);
    assert.ok(results.find((r) => r.category === 'vendor').pass);
  });

  it('handles missing category (zero size)', () => {
    const sizes = { main: 100 * 1024 };
    const budgets = { main: 350 * 1024, vendor: 500 * 1024 };
    const results = buildResults(sizes, budgets);
    const vendor = results.find((r) => r.category === 'vendor');
    assert.strictEqual(vendor.actual, 0);
    assert.ok(vendor.pass);
  });
});

describe('printTable', () => {
  it('returns 0 when all pass', () => {
    const results = [
      { category: 'main', actual: 100 * 1024, budget: 350 * 1024, pass: true },
      { category: 'vendor', actual: 200 * 1024, budget: 500 * 1024, pass: true },
    ];
    const code = printTable(results);
    assert.strictEqual(code, 0);
  });

  it('returns 1 when any fail', () => {
    const results = [
      { category: 'main', actual: 400 * 1024, budget: 350 * 1024, pass: false },
      { category: 'vendor', actual: 200 * 1024, budget: 500 * 1024, pass: true },
    ];
    const code = printTable(results);
    assert.strictEqual(code, 1);
  });
});

// ---------------------------------------------------------------------------
// Integration-style tests for run() using tmp files
// ---------------------------------------------------------------------------

import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Create a fake JS file whose gzip-compressed size is exactly targetGzipKB * 1024.
 * We achieve this by gzipping a known buffer, measuring, then writing a file
 * that is already a gzip stream padded to the right size.
 *
 * Simpler approach: write a pre-compressed .gz-like blob by gzipping content
 * and verifying the size matches. For tests we just need the gzippedSize()
 * function to return approximately targetGzipKB * 1024 bytes.
 *
 * Since size-check.js reads raw file content and then gzips it, we need
 * the RAW file content to produce a specific gzipped size.
 *
 * Strategy: use crypto.randomBytes() — truly random data has gzip ratio ≈ 1.0,
 * so raw size ≈ gzipped size.
 */
import { randomBytes } from 'node:crypto';

async function writeFakeBundle(dir, filename, targetGzipKB) {
  // Random bytes are incompressible: gzip output ≈ input + ~18 byte header
  // So to get targetGzipKB of gzip output, write (targetGzipKB * 1024 - 20) random bytes
  const rawSize = Math.max(1, Math.ceil(targetGzipKB * 1024) - 20);
  const buf = randomBytes(rawSize);
  await writeFile(join(dir, filename), buf);
}

describe('run() — within budget', () => {
  let tmpDir;
  let distDir;
  let budgetPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'size-check-test-'));
    distDir = join(tmpDir, 'dist');
    const assetsDir = join(distDir, 'assets');
    await mkdir(assetsDir, { recursive: true });
    budgetPath = join(tmpDir, 'perf-budget.json');

    // main=100KB gzipped, vendor=200KB gzipped — both within budget
    await writeFakeBundle(assetsDir, 'index-abc.js', 100);
    await writeFakeBundle(assetsDir, 'vendor-xyz.js', 200);

    await writeFile(budgetPath, JSON.stringify({ main: '350KB', vendor: '500KB' }));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns exit code 0 when all sizes are within budget', async () => {
    const code = await run({ distRoot: distDir, budgetPath });
    assert.strictEqual(code, 0, 'Expected exit code 0 (all within budget)');
  });
});

describe('run() — exceeds budget', () => {
  let tmpDir;
  let distDir;
  let budgetPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'size-check-test-'));
    distDir = join(tmpDir, 'dist');
    const assetsDir = join(distDir, 'assets');
    await mkdir(assetsDir, { recursive: true });
    budgetPath = join(tmpDir, 'perf-budget.json');

    // main=400KB gzipped → over 350KB budget
    await writeFakeBundle(assetsDir, 'index-abc.js', 400);
    await writeFakeBundle(assetsDir, 'vendor-xyz.js', 200);

    await writeFile(budgetPath, JSON.stringify({ main: '350KB', vendor: '500KB' }));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns exit code 1 when main exceeds budget', async () => {
    const code = await run({ distRoot: distDir, budgetPath });
    assert.strictEqual(code, 1, 'Expected exit code 1 (main over budget)');
  });
});

describe('run() — malformed dist (missing directory)', () => {
  let tmpDir;
  let budgetPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'size-check-test-'));
    budgetPath = join(tmpDir, 'perf-budget.json');
    await writeFile(budgetPath, JSON.stringify({ main: '350KB', vendor: '500KB' }));
    // distRoot points to a non-existent directory
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns exit code 1 with an error message when dist does not exist', async () => {
    const nonExistentDist = join(tmpDir, 'nonexistent-dist');
    // Capture console.error to verify error message is printed
    const errors = [];
    const origError = console.error;
    console.error = (...args) => errors.push(args.join(' '));

    const code = await run({ distRoot: nonExistentDist, budgetPath });

    console.error = origError;

    assert.strictEqual(code, 1, 'Expected exit code 1 for missing dist');
    assert.ok(
      errors.some((msg) => msg.includes('Error:')),
      `Expected an error message, got: ${JSON.stringify(errors)}`
    );
  });
});

describe('run() — empty dist (no .js files)', () => {
  let tmpDir;
  let distDir;
  let budgetPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'size-check-test-'));
    distDir = join(tmpDir, 'dist');
    await mkdir(distDir, { recursive: true }); // exists but empty
    budgetPath = join(tmpDir, 'perf-budget.json');
    await writeFile(budgetPath, JSON.stringify({ main: '350KB', vendor: '500KB' }));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns exit code 1 with an error message when dist has no .js files', async () => {
    const errors = [];
    const origError = console.error;
    console.error = (...args) => errors.push(args.join(' '));

    const code = await run({ distRoot: distDir, budgetPath });

    console.error = origError;

    assert.strictEqual(code, 1, 'Expected exit code 1 for empty dist');
    assert.ok(
      errors.some((msg) => msg.includes('Error:')),
      `Expected an error message, got: ${JSON.stringify(errors)}`
    );
  });
});
