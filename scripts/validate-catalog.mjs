#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogIndex, canonicalJson } from './build-index.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { index } = buildCatalogIndex(repoRoot);

assert.equal(index.schema_version, 'opl_software_catalog_index.v1');
assert.equal(index.catalog_id, 'public-registry:opl');

for (const entry of index.packages) {
  assert.notEqual(entry.package_id, 'opl-channel-weixin', 'opl-channel-weixin is a native Studio DSH plugin, not a catalog package');
  assert.match(entry.manifest_sha256, /^sha256:[0-9a-f]{64}$/);
  if (entry.payload_path) {
    assert.match(entry.payload_sha256, /^sha256:[0-9a-f]{64}$/);
  }
  assert.match(entry.allowlist_sha256, /^sha256:[0-9a-f]{64}$/);
}

const allowlistsDir = path.join(repoRoot, 'allowlists');
const diskAllowlists = fs.readdirSync(allowlistsDir).filter((name) => name.endsWith('.json')).sort();
assert.deepEqual(
  diskAllowlists,
  index.packages.map((entry) => `${entry.package_id}.json`).sort(),
  'allowlists/ must match packages/ 1:1',
);

const indexPath = path.join(repoRoot, 'catalog-index.json');
assert.ok(fs.existsSync(indexPath), 'catalog-index.json is missing; run node scripts/build-index.mjs');
const actual = fs.readFileSync(indexPath, 'utf8');
const expected = canonicalJson(index);
assert.equal(actual, expected, 'catalog-index.json is out of date; run node scripts/build-index.mjs');

console.log(`Catalog validation passed: ${index.package_count} packages`, index.counts_by_category);
