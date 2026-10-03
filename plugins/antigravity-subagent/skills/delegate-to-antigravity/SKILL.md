---
name: delegate-to-antigravity
description: Delegate a bounded coding, research, review, debugging, or implementation task to the local Google Antigravity CLI (`agy`) and use its response as a second-agent result. Use when the user explicitly asks to use Antigravity as a subagent, requests a second opinion from Antigravity, or asks Codex to offload an independent task to `agy`.
---

# Delegate to Antigravity

Treat Antigravity as an external delegated worker. It is not a native Codex collaboration agent: collect its output, verify it, and remain responsible for the final answer and workspace changes.

## Workflow

1. Prefer the `agy_check` and `agy_delegate` MCP tools when they are available. A current `agy_check` reports the CLI version, runner version, and capabilities. If a loaded older MCP server reports only an executable path, use the bundled runner for this task and reload the plugin before relying on the updated MCP behavior.
2. Otherwise use the bundled `scripts/agy-delegate.mjs` runner. It requires Node.js 20 or newer and a locally installed, authenticated `agy` CLI.
3. Establish compatibility with `agy_check` or `node <skill-dir>/scripts/agy-delegate.mjs --check`. This launches `--version` and `--help`; it does not verify authentication. Confirm authentication with one small, non-mutating delegation when needed.
4. Make the task concrete and bounded. Include the goal, constraints, expected output, and relevant absolute paths.
5. Default to `mode: plan`, and explicitly state no edits for analysis tasks. In current agy, plan prepends the `/plan` instruction; it is not filesystem containment. Use `accept-edits` only when the user requested implementation and authorized changes to that workspace. `default` omits `--mode` and follows the CLI's persisted policy, which can permit edits.
6. Inspect Antigravity's response and the workspace diff. Run relevant tests independently when it made changes.
7. Report its contribution as delegated analysis, not independently verified fact.

## Bundled runner

For the Skills-only path, write the complete prompt to a temporary UTF-8 file and pass its absolute path to the runner. Do not interpolate an untrusted prompt into shell syntax.

```text
node <skill-dir>/scripts/agy-delegate.mjs --cwd <absolute-workspace> --mode plan --prompt-file <absolute-prompt-file>
```

Delete the temporary prompt file in cleanup, including failed runs. The runner accepts `--output-format text|json`, `--timeout-seconds 1..1800`, `--agent`, and `--model`. Use `agy models` or `agy agents` to discover current names when a selection is requested; otherwise preserve the CLI's configured defaults.

The runner and MCP share capability-based transport. CLIs advertising stream input receive one UTF-8 NDJSON `user` message on stdin; the runner closes stdin and reads the final `result`. Older CLIs with JSON print output use a bounded argv fallback. On Windows, oversized fallback arguments are rejected before launch. Both public output formats remain supported regardless of transport. Success requires exit code zero and a complete result with `status: SUCCESS`; `WAITING`, `ERROR`, missing results, timeout, and truncated capture are failures.

For a nonstandard installation, set `AGY_EXECUTABLE` to an absolute native executable path for this invocation. Windows also searches `%LOCALAPPDATA%\\agy\\bin\\agy.exe`; Unix searches `~/.local/bin/agy`. An access-denied launch is a process permission problem, not evidence of CLI incompatibility. Use the host's normal approval mechanism if needed; do not change global PATH, ACLs, authentication, or persisted permissions to make the probe pass.

Do not add permission-bypass flags. Do not add `--disable-slash-commands`: current agy warns that it disables the effect of `--mode plan`.

Current protocol references: [headless mode](https://www.antigravity.google/docs/cli/headless/) and [execution modes](https://www.antigravity.google/docs/cli/modes/). The installed CLI's help determines supported flags; do not infer compatibility from a version number alone.

If neither the MCP tools nor local process execution is available, explain that this plugin requires a local Codex environment with Node.js and an authenticated `agy` installation.

## Safety

- Never weaken the user's persisted sandbox or permission policy.
- Do not delegate secrets, credentials, private data, destructive operations, releases, deployments, purchases, or external messages without explicit authorization for that scope.
- Use one invocation per independent task. Do not create recursive delegation loops or ask Antigravity to invoke Codex.
- If authentication or interactive approval is required, return control to the user rather than bypassing it.
- Use a finite `timeoutSeconds`; split oversized work into bounded tasks.
