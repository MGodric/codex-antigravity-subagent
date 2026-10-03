# Security policy

## Trust model

This plugin launches the official Google Antigravity CLI as a local child process. It does not proxy requests through a project-owned server. Antigravity receives the delegated prompt and operates under the user's existing Antigravity authentication, settings, permissions, and sandbox.

The `agy_delegate` MCP tool is marked as potentially destructive because `default` and `accept-edits` modes can modify workspace files. The bundled skill instructs Codex to default to `plan` mode and to use edit-capable modes only after explicit user authorization.

The server does not expose arbitrary extra CLI arguments or the `--dangerously-skip-permissions` flag. Each call has a finite execution timeout (preceded by bounded version/help probes) and a 2 MiB capture limit per output stream. Truncation is an error. Timeout cleanup targets only the launched process tree. Current `plan` mode is a `/plan` instruction prefix, not OS containment; workspace and permission boundaries remain the responsibility of the CLI and host.

## Supported versions

Only the latest release is supported. Reproduce security issues against the newest release before reporting them.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's **Security → Report a vulnerability** flow for this repository. Include the affected version, operating system, Node.js version, Antigravity CLI version, reproduction steps, and impact.

Do not include credentials, private prompts, customer data, or proprietary source code in the report.
