import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { delegateAgy, probeAgy, runProcess } from '../../skills/delegate-to-antigravity/scripts/agy-runtime.mjs';

const fixture = fileURLToPath(new URL('./fixtures/agy.mjs', import.meta.url));
const cwd = fileURLToPath(new URL('.', import.meta.url));
const fakeRun = (_executable, args, options) => runProcess(process.execPath, [fixture, ...args], options);
const check = () => probeAgy(process.execPath, fakeRun);
const deps = { check, run: fakeRun };
const ask = (prompt, extra = {}, overrides = deps) => delegateAgy({ prompt, cwd, timeoutSeconds: 5, ...extra }, overrides);

test('capability probe checks launch and help rather than only executable presence', async () => {
  const result = await check();
  assert.equal(result.cliVersion, '1.2.15-fixture');
  assert.equal(result.capabilities.streamInput, true);
  await assert.rejects(probeAgy('unused', async () => ({ exitCode: 0, stdout: 'unsupported', stderr: '' })), /Incompatible/);
  await assert.rejects(runProcess(fileURLToPath(new URL('./missing-executable', import.meta.url)), [], { timeoutMs: 100 }), /ENOENT/);
});

test('long Unicode prompts round-trip via stdin with no shell or argv interpolation', async () => {
  const prompt = '中文\n"quotes" `backticks` $(do-not-run) \\ path 😀 '.repeat(1200);
  const result = await ask(prompt, { outputFormat: 'json', agent: 'agent name', model: 'model name' });
  assert.equal(result.isError, false);
  assert.equal(result.transport, 'stream-json');
  const envelope = JSON.parse(result.output);
  assert.equal(envelope.response, prompt);
  assert.equal(envelope.args.includes(prompt), false);
  assert.equal(envelope.args[envelope.args.indexOf('--mode') + 1], 'plan');
  assert.equal(envelope.args[envelope.args.indexOf('--print-timeout') + 1], '5s');
  assert.equal(envelope.args[envelope.args.indexOf('--agent') + 1], 'agent name');
  assert.equal(envelope.args[envelope.args.indexOf('--model') + 1], 'model name');
  assert.equal(envelope.args.includes('--disable-slash-commands'), false);
});

test('default preserves CLI policy by omitting --mode; accept-edits is explicit', async () => {
  const result = await ask('default-policy', { mode: 'default', outputFormat: 'json' });
  assert.equal(result.isError, false);
  assert.equal(JSON.parse(result.output).args.includes('--mode'), false);
  const edit = await ask('edit-mode', { mode: 'accept-edits', outputFormat: 'json' });
  const args = JSON.parse(edit.output).args;
  assert.equal(args[args.indexOf('--mode') + 1], 'accept-edits');
});

test('legacy CLI falls back to JSON argv and rejects oversized Windows arguments', async () => {
  const legacyCheck = async () => {
    const result = await check();
    result.capabilities.streamInput = false;
    result.capabilities.printTimeout = false;
    return result;
  };
  const legacyDeps = { check: legacyCheck, run: fakeRun };
  const result = await ask('旧版中文 prompt', {}, legacyDeps);
  assert.equal(result.isError, false);
  assert.equal(result.transport, 'argv');
  assert.equal(result.output, '旧版中文 prompt');
  if (process.platform === 'win32') await assert.rejects(ask('中'.repeat(20000), {}, legacyDeps), /command-line limit/);
});

for (const prompt of ['ERROR', 'WAITING', 'CANCELED', 'EXIT_FAILURE', 'MALFORMED', 'MISSING_RESULT', 'INVALID_RESULT', 'TRUNCATE']) {
  test(`incomplete or failed turn is reported as error: ${prompt}`, async () => {
    const result = await ask(prompt);
    assert.equal(result.isError, true);
    if (prompt === 'EXIT_FAILURE') assert.equal(result.exitCode, 7);
    if (prompt === 'TRUNCATE') assert.equal(result.truncated, true);
    if (prompt === 'INVALID_RESULT') { assert.equal(result.output, ''); assert.match(result.error, /Invalid Antigravity result/); }
    if (['ERROR', 'WAITING', 'CANCELED'].includes(prompt)) assert.equal(result.status, prompt);
  });
}

test('timeout returns promptly and kills the owned child', async () => {
  const start = Date.now();
  const result = await ask('TIMEOUT', { timeoutSeconds: 1 });
  assert.equal(result.timedOut, true);
  assert.equal(result.isError, true);
  assert.ok(Date.now() - start < 6000);
});

test('invalid delegation input fails before CLI execution', async () => {
  let called = false;
  const overrides = { check: async () => { called = true; throw new Error('unexpected probe'); } };
  for (const options of [{ prompt: ' ' }, { prompt: 'x'.repeat(100001) }, { timeoutSeconds: 0 }, { cwd: 'relative/path' }, { mode: 'unsafe' }, { outputFormat: 'xml' }]) {
    await assert.rejects(delegateAgy({ prompt: 'test', cwd, ...options }, overrides));
  }
  assert.equal(called, false);
});
