/**
 * size-check.js — Bundle size budget checker (T3.2)
 *
 * Usage: node scripts/size-check.js [--dist <path>] [--budget <path>]
 *
 * Reads gzipped sizes of all .js files in frontend/dist/assets/ (or dist/),
 * classifies them as main vs vendor, compares against config/perf-budget.json,
 * prints a table, and exits 0 (pass) or 1 (fail/error).
 */

import { createGzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { readdir, readFile, access } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { PassThrough } from 'node:stream';

// ---------------------------------------------------------------------------
// Core logic (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Gzip a Buffer in memory and return the compressed byte length.
 * @param {Buffer} buf
 * @returns {Promise<number>}
 */
export async function gzippedSize(buf) {
  return new Promise((resolve, reject) => {
    const gzip = createGzip();
    let size = 0;
    gzip.on('data', (chunk) => { size += chunk.length; });
    gzip.on('end', () => resolve(size));
    gzip.on('error', reject);
    gzip.end(buf);
  });
}

/**
 * Classify a JS filename as 'vendor' or 'main'.
 * vendor: contains "vendor", "node_modules", or starts with "chunk-"
 * @param {string} filename  basename only
 * @returns {'vendor'|'main'}
 */
export function classifyFile(filename) {
  if (
    filename.includes('vendor') ||
    filename.includes('node_modules') ||
    filename.startsWith('chunk-')
  ) {
    return 'vendor';
  }
  return 'main';
}

/**
 * Parse a budget value string like "350KB" into bytes.
 * @param {string} val
 * @returns {number}
 */
export function parseBudgetBytes(val) {
  const match = String(val).match(/^(\d+(?:\.\d+)?)\s*KB$/i);
  if (!match) throw new Error(`Invalid budget value: "${val}"`);
  return parseFloat(match[1]) * 1024;
}

/**
 * Resolve the dist directory: prefer <distRoot>/assets if it exists.
 * @param {string} distRoot  absolute path to frontend/dist
 * @returns {Promise<string>}
 */
export async function resolveAssetsDir(distRoot) {
  const assetsDir = join(distRoot, 'assets');
  try {
    await access(assetsDir);
    return assetsDir;
  } catch {
    // fall back to distRoot itself
    return distRoot;
  }
}

/**
 * Collect gzipped sizes per category for all .js files in dir.
 * Returns { main: number, vendor: number } (bytes).
 * Throws if dir doesn't exist or contains no .js files.
 *
 * @param {string} dir
 * @returns {Promise<{main: number, vendor: number}>}
 */
export async function collectSizes(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch (err) {
    throw new Error(`Cannot read dist directory "${dir}": ${err.message}`);
  }

  const jsFiles = entries.filter((f) => f.endsWith('.js'));
  if (jsFiles.length === 0) {
    throw new Error(`No .js files found in "${dir}"`);
  }

  const sizes = { main: 0, vendor: 0 };

  await Promise.all(
    jsFiles.map(async (file) => {
      const filePath = join(dir, file);
      const buf = await readFile(filePath);
      const gz = await gzippedSize(buf);
      const category = classifyFile(basename(file));
      sizes[category] += gz;
    })
  );

  return sizes;
}

/**
 * Load and parse the perf budget JSON file.
 * Returns { main: number, vendor: number } (bytes).
 * @param {string} budgetPath
 * @returns {Promise<{main: number, vendor: number}>}
 */
export async function loadBudget(budgetPath) {
  let raw;
  try {
    raw = await readFile(budgetPath, 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read budget file "${budgetPath}": ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in budget file "${budgetPath}": ${err.message}`);
  }

  return {
    main: parseBudgetBytes(parsed.main),
    vendor: parseBudgetBytes(parsed.vendor),
  };
}

/**
 * Compare sizes against budgets and return results.
 * @param {{main: number, vendor: number}} sizes    actual gzipped bytes
 * @param {{main: number, vendor: number}} budgets  budget bytes
 * @returns {Array<{category: string, actual: number, budget: number, pass: boolean}>}
 */
export function buildResults(sizes, budgets) {
  return ['main', 'vendor'].map((cat) => ({
    category: cat,
    actual: sizes[cat] ?? 0,
    budget: budgets[cat],
    pass: (sizes[cat] ?? 0) <= budgets[cat],
  }));
}

/**
 * Format and print the results table to stdout, return exit code.
 * @param {Array<{category: string, actual: number, budget: number, pass: boolean}>} results
 * @returns {0|1}
 */
export function printTable(results) {
  const toKB = (bytes) => (bytes / 1024).toFixed(1);
  const colW = [10, 14, 14, 8];
  const header = ['Category', 'Actual (KB)', 'Budget (KB)', 'Status'];
  const sep = colW.map((w) => '-'.repeat(w)).join('-+-');

  const pad = (str, w) => String(str).padEnd(w);

  console.log('');
  console.log('Bundle Size Budget Report');
  console.log(sep);
  console.log(header.map((h, i) => pad(h, colW[i])).join(' | '));
  console.log(sep);

  let allPass = true;
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    if (!r.pass) allPass = false;
    console.log(
      [
        pad(r.category, colW[0]),
        pad(toKB(r.actual), colW[1]),
        pad(toKB(r.budget), colW[2]),
        pad(status, colW[3]),
      ].join(' | ')
    );
  }
  console.log(sep);
  console.log('');

  return allPass ? 0 : 1;
}

/**
 * Main entry point — returns exit code.
 * @param {object} opts
 * @param {string} opts.distRoot   absolute path to frontend/dist
 * @param {string} opts.budgetPath absolute path to config/perf-budget.json
 * @returns {Promise<0|1>}
 */
export async function run({ distRoot, budgetPath }) {
  let assetsDir;
  try {
    assetsDir = await resolveAssetsDir(distRoot);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return 1;
  }

  let sizes;
  try {
    sizes = await collectSizes(assetsDir);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return 1;
  }

  let budgets;
  try {
    budgets = await loadBudget(budgetPath);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return 1;
  }

  const results = buildResults(sizes, budgets);
  return printTable(results);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
  const distRoot = join(repoRoot, 'frontend', 'dist');
  const budgetPath = join(repoRoot, 'config', 'perf-budget.json');

  run({ distRoot, budgetPath }).then((code) => {
    process.exitCode = code;
  }).catch((err) => {
    console.error('Unexpected error:', err);
    process.exitCode = 1;
  });
}
