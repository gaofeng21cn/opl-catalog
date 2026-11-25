#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CATEGORIES = ['agents', 'applications', 'extensions', 'channels', 'dependencies'];
export const SOFTWARE_TYPE_TO_CATEGORY = {
  agent: 'agents',
  application: 'applications',
  extension: 'extensions',
  channel: 'channels',
  dependency: 'dependencies',
};

export function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256Text(text) {
  return `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function assertSafeRelative(relPath, label) {
  if (typeof relPath !== 'string' || !relPath.trim() || path.isAbsolute(relPath) || relPath.includes('\0')) {
    throw new Error(`Invalid ${label}: ${String(relPath)}`);
  }
  const normalized = path.posix.normalize(relPath.replace(/\\/g, '/'));
  if (normalized === '..' || normalized.startsWith('../') || normalized !== relPath) {
    throw new Error(`Unsafe relative ${label}: ${relPath}`);
  }
  return normalized;
}

export function buildCatalogIndex(repoRoot) {
  const packagesRoot = path.join(repoRoot, 'packages');
  const allowlistsRoot = path.join(repoRoot, 'allowlists');
  const allowedPackageEntries = new Set([...CATEGORIES, 'payloads']);

  for (const dirent of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!allowedPackageEntries.has(dirent.name)) {
      throw new Error(`Unexpected entry under packages/: ${dirent.name}`);
    }
  }

  const seenIds = new Map();
  const countsByCategory = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  const entries = [];
  const referencedPayloads = new Set();

  for (const category of CATEGORIES) {
    const dir = path.join(packagesRoot, category);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();

    for (const fileName of files) {
      const manifestAbs = path.join(dir, fileName);
      const manifest = JSON.parse(fs.readFileSync(manifestAbs, 'utf8'));
      const packageId = manifest.package_id;
      if (typeof packageId !== 'string' || !packageId || fileName !== `${packageId}.json`) {
        throw new Error(`Manifest filename mismatch: packages/${category}/${fileName} (package_id=${String(packageId)})`);
      }
      if (seenIds.has(packageId)) {
        throw new Error(`Duplicate package_id ${packageId} in ${seenIds.get(packageId)} and ${category}`);
      }
      seenIds.set(packageId, category);

      const softwareType = manifest.presentation?.software_type;
      const expectedCategory = SOFTWARE_TYPE_TO_CATEGORY[softwareType];
      if (!expectedCategory || expectedCategory !== category) {
        throw new Error(
          `Package ${packageId} in packages/${category}/ declares incompatible presentation.software_type=${String(softwareType)}`,
        );
      }

      const payloadUrl = manifest.codex_surface?.plugin_payload_manifest_url;
      let payloadPath = null;
      let payload = null;
      let payloadSha256 = null;
      if (payloadUrl !== undefined && payloadUrl !== null) {
        const safePayloadRel = assertSafeRelative(payloadUrl, `payload url for ${packageId}`);
        if (!safePayloadRel.startsWith('payloads/')) {
          throw new Error(`Package ${packageId} payload url must reside under payloads/: ${safePayloadRel}`);
        }
        const payloadAbs = path.join(packagesRoot, safePayloadRel);
        if (!fs.existsSync(payloadAbs)) {
          throw new Error(`Package ${packageId} references missing payload manifest: packages/${safePayloadRel}`);
        }
        payload = JSON.parse(fs.readFileSync(payloadAbs, 'utf8'));
        payloadPath = `packages/${safePayloadRel}`;
        payloadSha256 = sha256Text(canonicalJson(payload));
        referencedPayloads.add(path.basename(safePayloadRel));
      }

      const allowlistAbs = path.join(allowlistsRoot, `${packageId}.json`);
      if (!fs.existsSync(allowlistAbs)) {
        throw new Error(`Missing allowlist for package ${packageId}: allowlists/${packageId}.json`);
      }
      const allowlist = JSON.parse(fs.readFileSync(allowlistAbs, 'utf8'));
      if (allowlist.package_id !== packageId) {
        throw new Error(`Allowlist package_id mismatch for ${packageId}`);
      }

      countsByCategory[category] += 1;
      entries.push({
        package_id: packageId,
        category,
        software_type: softwareType,
        version: String(manifest.version ?? ''),
        visibility: manifest.visibility === 'authorized_only' ? 'authorized_only' : 'public',
        manifest_path: `packages/${category}/${fileName}`,
        manifest_sha256: sha256Text(canonicalJson(manifest)),
        payload_path: payloadPath,
        payload_sha256: payloadSha256,
        allowlist_path: `allowlists/${packageId}.json`,
        allowlist_sha256: sha256Text(canonicalJson(allowlist)),
        manifest,
        payload,
        allowlist,
      });
    }
  }

  entries.sort((left, right) => left.package_id.localeCompare(right.package_id, 'en'));

  return {
    index: {
      schema_version: 'opl_software_catalog_index.v1',
      catalog_id: 'public-registry:opl',
      catalog_name: 'OPL Official Software Catalog',
      catalog_repo: 'https://github.com/gaofeng21cn/opl-catalog.git',
      categories: CATEGORIES,
      package_count: entries.length,
      counts_by_category: countsByCategory,
      packages: entries,
    },
    referencedPayloads,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { index } = buildCatalogIndex(repoRoot);
  const outPath = path.join(repoRoot, 'catalog-index.json');
  fs.writeFileSync(outPath, canonicalJson(index), 'utf8');
  console.log(`Built catalog-index.json with ${index.package_count} packages:`, index.counts_by_category);
}
