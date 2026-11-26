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

const PACKAGE_ID = /^[a-z0-9][a-z0-9.-]*$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/;

export function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256Text(text) {
  return `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function localizedSummaryText(value) {
  return Object.fromEntries(['zh-CN', 'en-US']
    .filter((locale) => typeof value?.[locale] === 'string' && value[locale].trim())
    .map((locale) => [locale, value[locale]]));
}

function publicSummaryFor(manifest, ownerSourceRepo) {
  if (manifest.visibility !== 'authorized_only' || manifest.source_repo !== ownerSourceRepo
    || typeof ownerSourceRepo !== 'string' || !ownerSourceRepo
    || typeof manifest.display_name !== 'string' || !manifest.display_name.trim()) {
    throw new Error(`Invalid public listing approval for ${manifest.package_id}`);
  }
  return {
    owner_source_repo: ownerSourceRepo,
    display_name: manifest.display_name,
    display_name_i18n: localizedSummaryText(manifest.presentation?.display_name_i18n),
    description_i18n: localizedSummaryText(manifest.presentation?.description_i18n),
  };
}

export function buildCatalogIndex(repoRoot) {
  const packagesRoot = path.join(repoRoot, 'packages');
  const allowlistsRoot = path.join(repoRoot, 'allowlists');
  const allowedPackageEntries = new Set([...CATEGORIES, 'payloads']);
  const publicListings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'public-listings.json'), 'utf8'));
  if (!publicListings || typeof publicListings !== 'object' || Array.isArray(publicListings)) {
    throw new Error('public-listings.json must map package IDs to owner source repositories');
  }

  for (const dirent of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory() || !allowedPackageEntries.has(dirent.name)) {
      throw new Error(`Unexpected entry under packages/: ${dirent.name}`);
    }
  }

  const payloads = new Map();
  const payloadsDir = path.join(packagesRoot, 'payloads');
  if (fs.existsSync(payloadsDir)) {
    for (const entry of fs.readdirSync(payloadsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        throw new Error(`Unexpected entry under packages/payloads/: ${entry.name}`);
      }
      const payload = JSON.parse(fs.readFileSync(path.join(payloadsDir, entry.name), 'utf8'));
      const { package_id: packageId, package_version: version } = payload;
      if (typeof packageId !== 'string' || !PACKAGE_ID.test(packageId)
        || typeof version !== 'string' || !VERSION.test(version)
        || entry.name !== `${packageId}-${version}.json`) {
        throw new Error(`Payload filename must match package_id and package_version: ${entry.name}`);
      }
      payloads.set(`payloads/${entry.name}`, payload);
    }
  }

  const seenIds = new Map();
  const countsByCategory = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  const entries = [];

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
      if (typeof packageId !== 'string' || !PACKAGE_ID.test(packageId) || fileName !== `${packageId}.json`) {
        throw new Error(`Manifest filename mismatch: packages/${category}/${fileName} (package_id=${String(packageId)})`);
      }
      if (typeof manifest.version !== 'string' || !VERSION.test(manifest.version)) {
        throw new Error(`Invalid version for ${packageId}: ${String(manifest.version)}`);
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
        const expectedPath = `payloads/${packageId}-${manifest.version}.json`;
        payload = payloads.get(payloadUrl);
        if (payloadUrl !== expectedPath || !payload || payload.source_repo !== manifest.source_repo) {
          throw new Error(`Invalid current payload for ${packageId}: expected ${expectedPath} from its source repository`);
        }
        payloadPath = `packages/${expectedPath}`;
        payloadSha256 = sha256Text(canonicalJson(payload));
      }

      const allowlistAbs = path.join(allowlistsRoot, `${packageId}.json`);
      if (!fs.existsSync(allowlistAbs)) {
        throw new Error(`Missing allowlist for package ${packageId}: allowlists/${packageId}.json`);
      }
      const allowlist = JSON.parse(fs.readFileSync(allowlistAbs, 'utf8'));
      if (allowlist.package_id !== packageId || allowlist.source_repo !== manifest.source_repo) {
        throw new Error(`Allowlist package_id or source_repo mismatch for ${packageId}`);
      }
      const publicSummary = Object.hasOwn(publicListings, packageId)
        ? publicSummaryFor(manifest, publicListings[packageId])
        : null;

      countsByCategory[category] += 1;
      entries.push({
        package_id: packageId,
        category,
        software_type: softwareType,
        version: manifest.version,
        visibility: manifest.visibility === 'authorized_only' ? 'authorized_only' : 'public',
        ...(publicSummary ? { public_summary: publicSummary } : {}),
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

  for (const packageId of Object.keys(publicListings)) {
    if (!seenIds.has(packageId)) {
      throw new Error(`Public listing approval refers to missing package ${packageId}`);
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
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { index } = buildCatalogIndex(repoRoot);
  const outPath = path.join(repoRoot, 'catalog-index.json');
  fs.writeFileSync(outPath, canonicalJson(index), 'utf8');
  console.log(`Built catalog-index.json with ${index.package_count} packages:`, index.counts_by_category);
}
