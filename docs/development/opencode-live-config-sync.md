# OpenCode Live Config Sync

Last verified: 2026-11-01

Baseline:

- CC Switch: `4.0.23`
- Branch: `fix/opencode-live-config-sync`
- Commit: `b6a846e7`
- OpenCode CLI tested locally: `2.2.3`

## Purpose

This note records why an OpenCode provider can look as if it was saved only in
the CC Switch database, how live-config writes work, and how to verify or debug
the behavior without exposing user credentials or database contents in the
repository.

Do not commit these artifacts:

- `cc-switch.db`
- `.exe`, `.zip`, or `.msi` build outputs
- exported provider credentials or API keys
- one-off `.patch` files once the change is committed

## User-visible symptom

A provider is present in the CC Switch provider list, but its entry does not
appear in OpenCode's live config. The card may remain under "available" even
though the database contains a row for it.

There are two distinct cases:

1. A provider was added with `addToLive=false`, or was deliberately removed
   from live config. It is intentionally database-only.
2. The live config was written, but the frontend cache still contains the old
   membership result. This makes a successfully written provider look
   database-only until another refresh happens.

Existing database-only providers are not automatically migrated by startup.
Editing and saving a database-only provider does not add it to live config.
Use the card's **Add** action, or add a new provider, to trigger the live write.

## OpenCode config path resolution

CC Switch resolves the OpenCode config path in this order:

1. If the CC Switch OpenCode directory override is set, use that directory.
2. Otherwise, if `OPENCODE_CONFIG` is set, use that exact file path.
3. Otherwise resolve the directory using:
   - `OPENCODE_CONFIG_DIR`
   - `$XDG_CONFIG_HOME/opencode`
   - `~/.config/opencode`
4. Inside the selected directory, CC Switch uses:
   - `opencode.jsonc` if present
   - otherwise `opencode.json` if present
   - otherwise create `opencode.json`

Relevant implementation:

- `src-tauri/src/opencode_config.rs`
- `get_opencode_dir`
- `get_opencode_config_path`
- `resolve_config_path`

## OpenCode's own config precedence

OpenCode runtime configuration loads both `opencode.json` and `opencode.jsonc`
when both exist. The documents are ordered as:

```text
opencode.json -> opencode.jsonc
```

For duplicate keys, the later document wins, so the effective precedence is:

```text
opencode.jsonc > opencode.json
```

When only one of the files exists, OpenCode uses that file.

There are command-specific exceptions. For example, `opencode mcp add` chooses
its target file separately and currently prefers `opencode.json`. Do not infer
normal runtime config precedence from that command.

To re-check precedence after an OpenCode upgrade:

```powershell
$root = Join-Path $env:TEMP 'opencode-precedence-check'
$configDir = Join-Path $root 'config\opencode'
$projectDir = Join-Path $root 'project'
New-Item -ItemType Directory -Force -Path $configDir, $projectDir | Out-Null

Set-Content -LiteralPath (Join-Path $configDir 'opencode.json') `
  -Value '{"model":"provider/json-model"}' -Encoding utf8NoBOM

@(
  '{'
  '  // jsonc should win when both files are loaded'
  '  "model": "provider/jsonc-model"'
  '}'
) | Set-Content -LiteralPath (Join-Path $configDir 'opencode.jsonc') `
  -Encoding utf8NoBOM

$env:HOME = $root
$env:USERPROFILE = $root
$env:XDG_CONFIG_HOME = Join-Path $root 'config'
$env:XDG_DATA_HOME = Join-Path $root 'data'
$env:XDG_CACHE_HOME = Join-Path $root 'cache'
$env:XDG_STATE_HOME = Join-Path $root 'state'
Remove-Item Env:OPENCODE_CONFIG -ErrorAction SilentlyContinue
Remove-Item Env:OPENCODE_CONFIG_DIR -ErrorAction SilentlyContinue

Push-Location $projectDir
try {
  opencode --standalone --log-level error debug config
} finally {
  Pop-Location
}
```

`debug config` lists the discovered source documents. Confirm that
`opencode.jsonc` is loaded after `opencode.json`, then inspect the current
OpenCode source's `findLast` merge behavior before changing CC Switch's file
selection logic.

## CC Switch write flow

Frontend add flow:

```text
AddProviderDialog
  -> useAddProviderMutation
  -> providersApi.add
  -> add_provider
  -> ProviderService::add_from_editor
  -> state.db.save_provider
  -> write_live_for_state
  -> opencode_config::set_provider_with_format
```

After a successful mutation, OpenCode live-derived query caches are invalidated
through `invalidateOpencodeLiveState` in:

- `src/lib/query/opencode.ts`
- `src/lib/query/mutations.ts`

The invalidated keys include:

- `opencodeLiveProviderIds`
- `opencodeDefaultModel`
- `opencode/runtime-models`
- OMO and OMO Slim current-provider/count keys

The live membership query is authoritative for the OpenCode card sections.
`meta.liveConfigManaged` can be stale and should not be used as the only source
of truth for whether an OpenCode ID is currently in the live config.

## Database-only provider behavior

For additive-mode apps, `update` intentionally does not auto-add a provider
that is absent from live config. This avoids restoring a provider that the user
deliberately removed.

To add an existing database-only provider:

1. Open the OpenCode page.
2. Find the provider under the available/not-added section.
3. Click **Add**.
4. Verify that it moves to the added section and that the config file contains
   the provider ID.

Switching an additive provider goes through `switch_normal`, which calls
`write_live_for_state`. Do not tell users that editing alone will add a
database-only provider.

## Debugging checklist

1. Confirm the correct executable is running. Compare the running process path
   and build artifact; an old portable EXE is a common false positive.
2. Confirm which action the user performed: **Add** versus **Edit -> Save**.
3. Check whether `opencode.jsonc`, `opencode.json`, or both exist.
4. Check the resolved path in CC Switch settings and environment variables.
5. Check the CC Switch log for an OpenCode live-write event.
6. Validate that the target config is valid JSON or JSONC.
7. If the file is correct but the UI is stale, inspect the query invalidation.
8. If the write fails, verify whether the database transaction rolled back the
   new row as designed.

Useful non-secret SQL inspection:

```sql
SELECT app_type, id, category, meta, created_at
FROM providers
WHERE app_type = 'opencode';
```

Never paste API keys from `settings_config` into issues or commits.

## Tests to run

Frontend:

```powershell
pnpm vitest run src/lib/query/mutations.test.ts
pnpm typecheck
```

Rust:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml opencode_config -- --nocapture
cargo test --manifest-path src-tauri/Cargo.toml opencode_tests -- --nocapture
```

If an exact test filter changes, use `cargo test -- --list` to find the current
module name. Prefer adding regression tests near the behavior being changed.

## Change guardrails

- Keep all OpenCode filesystem resolution in `opencode_config.rs`; do not add a
  second path-selection implementation in UI or command code.
- Keep live-derived cache invalidation centralized in
  `invalidateOpencodeLiveState`.
- Do not automatically re-add database-only providers on startup or edit.
- Do not change `.json` versus `.jsonc` precedence without re-verifying the
  current OpenCode runtime behavior.
- Do not commit user data, credentials, or build artifacts.
