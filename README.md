# OPL Official Software Catalog (`opl-catalog`)

Official software catalog and static package index for the **One Person Lab (OPL)** ecosystem.

`one-person-lab` (OPL Framework) provides the software-source protocol, verification engine, and lifecycle runtime; this repository owns the official software catalog data consumed by `opld` catalog synchronization (`opl sources list`, `opl pack install`).

## Directory Layout

| Directory | Category (`presentation.software_type`) | Contents |
| --- | --- | --- |
| `packages/agents/` | `agent` | Standard domain agents |
| `packages/applications/` | `application` | Independent local/workflow applications |
| `packages/extensions/` | `extension` | Efficiency & workflow extensions (e.g., `opl-flow`) |
| `packages/channels/` | `channel` | External channel connectors (native built-in Studio channels such as Weixin live in `opl-studio/plugins/channels/`) |
| `packages/dependencies/` | `dependency` | Internal runtime dependency packs (`catalog_scope: host_component`) |
| `packages/payloads/` | — | Pinned v2 payload manifests referenced via `payloads/<id>-<version>.json` |
| `allowlists/` | — | Package payload path allowlists |
| `keys/` | — | Publisher verification public keys |
| `public-listings.json` | — | Opt-in public summaries for restricted packages, bound to each owner's source repository |
| `catalog-index.json` | — | Deterministic `opl_software_catalog_index.v1` static index for single-request HTTP/ETag sync |

## Visibility & Access Control

The catalog contains the published metadata for public and restricted packages. A restricted package can opt into anonymous browsing in Software Center by adding its package ID and exact owner source repository to `public-listings.json`. The index then projects `public_summary` with the owner's published name and description in English and Chinese. Downloading, installing, or updating a restricted package requires GHCR package permission and the Framework's published artifact verification.

## Publication & History

The validation workflow checks the committed index against the descriptors. A successful run on this repository's `main` branch also records GitHub artifact provenance for those exact index bytes. For an independent verification, fetch the index at its immutable catalog commit and run the following command.

```bash
gh attestation verify catalog-index.json \
  --repo gaofeng21cn/opl-catalog \
  --signer-workflow gaofeng21cn/opl-catalog/.github/workflows/validate-catalog.yml \
  --source-ref refs/heads/main \
  --source-digest <catalog-commit>
```

Each catalog commit preserves its own payload manifests. The index embeds the current payload for each entry. Earlier payloads published before the catalog split are available in the [last Framework package tree before the split](https://github.com/gaofeng21cn/one-person-lab/tree/0217da56d1c672f2b3f94afa56541f3d3449b29f/contracts/opl-framework/packages/payloads).

## Maintenance

After updating any descriptor, payload, or allowlist, regenerate and validate the catalog index:

```bash
node scripts/build-index.mjs
node scripts/validate-catalog.mjs
```
