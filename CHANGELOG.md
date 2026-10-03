# Changelog

## 0.2.1 - Unreleased

- Probe the installed CLI's version and capabilities instead of only checking executable presence.
- Share the MCP and skill runner implementation; use stream-json stdin for long prompts when supported, with a bounded legacy fallback.
- Preserve CLI policy by omitting `--mode` for `default`, and validate terminal result status before reporting success.
- Add compatibility regressions for Unicode, modes, failures, output limits, and timeout.

## 0.2.0 - 2026-08-01

- Add the `agy_check` and `agy_delegate` stdio MCP tools.
- Add the `$delegate-to-antigravity` Codex skill.
- Default delegation to `plan` mode.
- Add bounded timeouts and output capture.
- Bundle the Node.js runtime artifact for installation without `npm install`.
- Add GitHub marketplace packaging, CI, installation guidance, and security documentation.
