# OPL Official Software Catalog (`opl-catalog`)

Official software catalog and static package index for the **One Person Lab (OPL)** ecosystem.

`one-person-lab` (OPL Framework) provides the software-source protocol, verification engine, and lifecycle runtime; this repository owns the official software catalog data consumed by `opl sources refresh --source-id public-registry:opl`.

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
| `catalog-index.json` | — | Deterministic `opl_software_catalog_index.v1` static index for single-request HTTP/ETag sync |

## Visibility & Access Control

Both `visibility: "public"` and `visibility: "authorized_only"` catalog metadata live in this repository (descriptors contain metadata only — never source archives, binaries, or secrets). Downloading and installing `authorized_only` packages is strictly gated at artifact fetch time by GHCR package permissions (`ghcr.io/gaofeng21cn/one-person-lab-private-packages/*`) and verified source credentials (`github-packages:gaofeng21cn`).

## Maintenance

After updating any descriptor, payload, or allowlist, regenerate and validate the catalog index:

```bash
node scripts/build-index.mjs
node scripts/validate-catalog.mjs
```
