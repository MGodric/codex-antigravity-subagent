# Antigravity Subagent for Codex

[![CI](https://github.com/MGodric/codex-antigravity-subagent/actions/workflows/ci.yml/badge.svg)](https://github.com/MGodric/codex-antigravity-subagent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Use your locally authenticated Google Antigravity CLI (`agy`) as an external second agent from Codex. Ask Antigravity for a review, research pass, debugging hypothesis, or bounded implementation while Codex remains responsible for verification and the final result.

> [!IMPORTANT]
> This is an independent community project. It is not affiliated with or endorsed by Google, Antigravity, or OpenAI.

This fork maintains CLI compatibility changes on top of [IlleJiViN/codex-antigravity-subagent](https://github.com/IlleJiViN/codex-antigravity-subagent). The upstream MIT license and attribution are preserved.

## What it adds

- `agy_check` launches the CLI to report its path, version, and supported headless capabilities. Authentication requires an actual delegation.
- `agy_delegate` runs one bounded prompt in Antigravity headless mode and returns its response.
- `$delegate-to-antigravity` teaches Codex when and how to delegate safely.

Delegation defaults to `plan` mode. Edit-capable calls are marked as potentially destructive for the MCP host, dangerous permission-bypass flags are not exposed, executions time out, and captured output is capped at 2 MiB.

## Requirements

- Codex CLI or Codex in the ChatGPT desktop app
- Node.js 20 or newer
- [Google Antigravity CLI](https://www.antigravity.google/docs/cli/install/), installed and authenticated as `agy`, with JSON print output and plan mode. Stream-input support is detected from `--help`; older CLIs use a bounded argv fallback.

Verify the prerequisites:

```powershell
node --version
agy --version
```

## Install

### 1. Add the GitHub marketplace

Run this once:

```powershell
codex plugin marketplace add MGodric/codex-antigravity-subagent --ref main
```

The command is identical on Windows, macOS, and Linux.

### 2. Install the plugin

Open the Codex plugin browser:

```text
codex
/plugins
```

Choose the **Antigravity Subagent** marketplace, open **antigravity-subagent**, and install it. Start a new Codex session afterward so the skill and MCP tools are loaded.

Plugins are not currently available in the Codex IDE extension; use Codex CLI or the ChatGPT desktop app.

## First successful delegation

In a new Codex session, try:

```text
Use $delegate-to-antigravity to ask Antigravity for a second opinion on this bug.
Keep it in plan mode and do not modify files.
```

Codex should first call `agy_check`, then call `agy_delegate` with the current workspace and `mode: plan`. A successful result returns Antigravity's analysis to Codex for verification.

Other useful prompts:

```text
Ask Antigravity to review this implementation for missed edge cases.
Delegate a bounded research pass on these three files to Antigravity.
Use Antigravity to propose a fix, but keep it in plan mode.
```

## Permission and data flow

`agy_delegate` starts the official CLI on your machine. It sends one prompt as UTF-8 NDJSON on stdin when the CLI supports stream input; otherwise it uses JSON print mode with the prompt in argv. Public `text` and `json` outputs are preserved. A complete `SUCCESS` result and exit code zero are required; waiting, malformed results, truncation, and timeout are reported as errors. The prompt, workspace path, and any files Antigravity chooses to read are handled according to your local Antigravity configuration, Google account, sandbox, and permission settings.

The plugin:

- does not collect telemetry or run a remote service;
- does not store prompts or Antigravity responses itself;
- does not expose `--dangerously-skip-permissions`;
- does not bypass Antigravity authentication or approval prompts;
- captures child-process output only to return it to the active Codex session.

Do not delegate secrets, credentials, private customer data, deployments, purchases, or destructive operations unless you explicitly intend to send that scope through Antigravity.

## Modes

| Mode | Intended use | Can change files? |
| --- | --- | --- |
| `plan` | Reviews, research, diagnosis, proposed changes; current CLI prepends `/plan` | No edits intended; not OS containment |
| `default` | Omit `--mode` to follow your persisted Antigravity policy | Depends on local policy |
| `accept-edits` | Explicitly authorized implementation | Yes |

Codex should use `plan` unless you explicitly request workspace changes.

## Update or remove

Refresh this marketplace to the newest `main` version:

```powershell
codex plugin marketplace upgrade antigravity-subagent
```

Use `/plugins` in Codex CLI to update, disable, or uninstall the plugin. Remove the marketplace entirely with:

```powershell
codex plugin marketplace remove antigravity-subagent
```

## Troubleshooting

### `agy_check` says the CLI is missing

Install Antigravity from the [official installation guide](https://www.antigravity.google/docs/cli/install/), open a new terminal, authenticate with `agy`, then restart Codex. Windows discovery includes `%LOCALAPPDATA%\\agy\\bin\\agy.exe`, and Unix discovery includes `~/.local/bin/agy`. For a nonstandard location, set `AGY_EXECUTABLE` to an absolute native executable path; Windows shell wrappers are not supported.

### Launch denied or incompatible CLI

A denied `--version` or `--help` launch is reported separately from missing headless capabilities. Use the host's normal process approval flow for sandbox denial; no PATH or ACL changes are needed. If the CLI lacks required flags, update it. Oversized Windows prompts require stream input or a smaller task. Do not combine `--disable-slash-commands` with `--mode plan`: current agy warns that this removes plan's effect.

### The plugin does not appear

Run `codex plugin marketplace list`, confirm `antigravity-subagent` is present, then restart Codex and open `/plugins` again.

### A delegation waits for approval

Complete the Antigravity authentication or permission prompt in a terminal. The plugin intentionally does not bypass interactive security checks.

## Development

```powershell
cd plugins/antigravity-subagent/mcp
npm install
npm run check
npm run build
npm test
```

`npm test` runs compatibility regressions, performs a real stdio MCP round trip, and calls the installed `agy` CLI in `plan` mode. `npm run test:protocol` runs the offline regressions and MCP handshake without an Antigravity account. Tests cover long Unicode stdin prompts, legacy argv, mode mapping, unsuccessful statuses, malformed output, capture bounds, and timeout. The checked-in `dist/server.cjs` is the runtime artifact used by the installed plugin.

Security reports and the trust model are documented in [SECURITY.md](SECURITY.md). Contributions are welcome through issues and pull requests.

The project's [Privacy Policy](PRIVACY.md) and [Terms of Use](TERMS.md) apply to public directory distribution.
