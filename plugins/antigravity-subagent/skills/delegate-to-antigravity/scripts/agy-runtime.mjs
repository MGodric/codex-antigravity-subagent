import { spawn } from 'node:child_process';
import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const VERSION = '0.2.1';
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_PROMPT_CHARS = 100_000;

async function isExecutable(candidate) {
  try {
    return (await stat(candidate)).isFile() && (await access(candidate, constants.X_OK), true);
  } catch {
    return false;
  }
}

async function findAgy() {
  if (process.env.AGY_EXECUTABLE) {
    const candidate = process.env.AGY_EXECUTABLE;
    if (!path.isAbsolute(candidate) || !(await isExecutable(candidate))) {
      throw new Error('AGY_EXECUTABLE must be an absolute path to an executable file.');
    }
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(candidate)) {
      throw new Error('Use the native agy.exe in AGY_EXECUTABLE, not a shell wrapper.');
    }
    return candidate;
  }
  const names = process.platform === 'win32' ? ['agy.exe'] : ['agy'];
  const directories = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    directories.push(path.join(process.env.LOCALAPPDATA, 'agy', 'bin'));
  } else if (process.platform !== 'win32') {
    directories.push(path.join(homedir(), '.local', 'bin'));
  }
  for (const directory of directories) {
    for (const name of names) {
      const candidate = path.resolve(directory.replace(/^"|"$/g, ''), name);
      if (await isExecutable(candidate)) return candidate;
    }
  }
  throw new Error('Antigravity CLI was not found. Install and authenticate the official agy CLI, or set AGY_EXECUTABLE to its absolute native executable path.');
}

/** @param {string} executable @param {string[]} args
 * @param {{cwd?: string, timeoutMs: number, input?: string}} options */
export function runProcess(executable, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: process.env,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let truncated = false;
    let timedOut = false;
    let settled = false;
    let cleanupTimer;
    const append = (current, chunk) => {
      const remaining = MAX_OUTPUT_BYTES - current.length;
      if (chunk.length > remaining) truncated = true;
      return remaining > 0 ? Buffer.concat([current, chunk.subarray(0, remaining)]) : current;
    };
    const finish = (exitCode, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(cleanupTimer);
      if (error) reject(error);
      else resolve({ exitCode, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), timedOut, truncated });
    };
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    child.on('error', error => finish(null, error));
    child.on('close', code => finish(code));
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) {
        // Kill only this invocation's tree; never kill processes by image name.
        const killer = spawn(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
          ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
        killer.on('close', () => child.kill());
      } else if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
      cleanupTimer = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        child.stdin?.destroy();
        child.unref();
        finish(null);
      }, 2000);
    }, options.timeoutMs);
    if (options.input !== undefined) {
      // A failed CLI may close stdin early. Its exit/status is reported below.
      child.stdin.on('error', () => {});
      child.stdin.end(options.input, 'utf8');
    }
  });
}

export async function probeAgy(executable, run = runProcess) {
  const [versionResult, helpResult] = await Promise.all([
    run(executable, ['--version'], { timeoutMs: 10_000 }),
    run(executable, ['--help'], { timeoutMs: 10_000 }),
  ]);
  for (const result of [versionResult, helpResult]) {
    if (result.timedOut || result.truncated || result.exitCode !== 0) {
      throw new Error(`Cannot probe Antigravity CLI at ${executable}: ${result.stderr.trim() || 'version/help failed or timed out'}`);
    }
  }
  const help = helpResult.stdout + helpResult.stderr;
  const flagLine = name => help.split(/\r?\n/).find(line => new RegExp(`(?:^|\\s)--${name}(?:\\s|[=,])`).test(line)) ?? '';
  const missing = ['print', 'output-format', 'mode'].filter(name => !flagLine(name));
  if (!/\bjson\b/.test(flagLine('output-format'))) missing.push('JSON output');
  if (!/\bplan\b/.test(flagLine('mode'))) missing.push('plan mode');
  if (missing.length) throw new Error(`Incompatible agy CLI: missing ${missing.join(', ')}. Update the official CLI before delegating.`);
  return {
    available: true,
    executable,
    cliVersion: (versionResult.stdout || versionResult.stderr).trim(),
    runnerVersion: VERSION,
    capabilities: {
      streamInput: /\bstream-json\b/.test(flagLine('input-format')) && /\bstream-json\b/.test(flagLine('output-format')),
      printTimeout: !!flagLine('print-timeout'),
      acceptEdits: /\baccept-edits\b/.test(flagLine('mode')),
    },
  };
}

export async function checkAgy() {
  return probeAgy(await findAgy());
}

/** @param {{prompt: string, cwd: string, mode?: string, outputFormat?: string,
 * timeoutSeconds?: number, agent?: string, model?: string}} options */
export async function delegateAgy(options, { check: probe = checkAgy, run: execute = runProcess } = {}) {
  const { prompt, cwd, agent, model } = options;
  const mode = options.mode ?? 'plan';
  const outputFormat = options.outputFormat ?? 'text';
  const timeoutSeconds = options.timeoutSeconds ?? 900;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`Prompt must contain 1..${MAX_PROMPT_CHARS} characters and cannot be whitespace only.`);
  }
  if (!['plan', 'default', 'accept-edits'].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);
  if (!['text', 'json'].includes(outputFormat)) throw new Error(`Unsupported output format: ${outputFormat}`);
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 1800) {
    throw new Error('Timeout must be an integer from 1 to 1800 seconds.');
  }
  if (!path.isAbsolute(cwd)) throw new Error('Workspace must be an absolute path.');
  const workspace = path.resolve(cwd);
  if (!(await stat(workspace)).isDirectory()) throw new Error(`Workspace is not a directory: ${workspace}`);
  const check = await probe();
  if (mode === 'accept-edits' && !check.capabilities.acceptEdits) throw new Error('This agy CLI does not support accept-edits.');
  const transport = check.capabilities.streamInput ? 'stream-json' : 'argv';
  const args = transport === 'stream-json'
    ? ['--input-format', 'stream-json', '--output-format', 'stream-json']
    : ['--print', prompt, '--output-format', 'json'];
  // "default" means keep the CLI's persisted policy; it is not a mode value.
  if (mode !== 'default') args.push('--mode', mode);
  if (check.capabilities.printTimeout) args.push('--print-timeout', `${timeoutSeconds}s`);
  // Do not disable slash expansion: current agy implements --mode plan through it.
  if (agent) args.push('--agent', agent);
  if (model) args.push('--model', model);
  if (process.platform === 'win32' && (check.executable.length + args.reduce((n, arg) => n + arg.length * 2 + 3, 0)) > 30_000) {
    throw new Error('Prompt/arguments exceed the conservative Windows command-line limit. Update agy to a CLI with stream-json stdin support, or split the task.');
  }
  const run = await execute(check.executable, args, {
    cwd: workspace,
    timeoutMs: timeoutSeconds * 1000,
    input: transport === 'stream-json' ? JSON.stringify({ event: 'user', message: { content: prompt } }) + '\n' : undefined,
  });
  let envelope;
  let protocolError;
  if (!run.timedOut && !run.truncated) {
    try {
      if (transport === 'stream-json') {
        const results = run.stdout.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line))
          .filter(event => event.event === 'result');
        if (results.length !== 1) throw new Error(`Expected one result event, received ${results.length}`);
        envelope = results[0].result;
      } else {
        envelope = JSON.parse(run.stdout);
      }
      if (!envelope || typeof envelope.status !== 'string' || typeof envelope.response !== 'string') {
        throw new Error('Missing status or response in agy result');
      }
    } catch (error) {
      envelope = undefined;
      protocolError = `Invalid Antigravity result: ${error.message}`;
    }
  }
  const isError = run.exitCode !== 0 || run.timedOut || run.truncated || !!protocolError || envelope?.status !== 'SUCCESS';
  const errors = [
    run.exitCode !== 0 && !run.timedOut ? `Antigravity process exited with code ${run.exitCode}.` : '',
    run.timedOut ? `Antigravity timed out after ${timeoutSeconds} seconds.` : '',
    run.truncated ? 'Output exceeded the 2 MiB per-stream capture limit; result is incomplete.' : '',
    protocolError,
    envelope && envelope.status !== 'SUCCESS' ? `Antigravity status ${envelope.status}: ${envelope.error || 'turn did not complete successfully'}` : '',
  ].filter(Boolean);
  return {
    ...run,
    isError,
    output: envelope ? (outputFormat === 'json' ? JSON.stringify(envelope) + '\n' : envelope.response) : '',
    error: errors.join('\n'),
    cliVersion: check.cliVersion,
    transport,
    status: envelope?.status ?? null,
    conversationId: envelope?.conversation_id ?? null,
    mode,
    cwd: workspace,
  };
}
