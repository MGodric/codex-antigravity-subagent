#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkAgy, delegateAgy } from './agy-runtime.mjs';

function parseArgs(argv) {
  const options = {};
  const flags = new Set(['--check', '--help']);
  const values = new Set(['--cwd', '--prompt-file', '--mode', '--output-format', '--timeout-seconds', '--agent', '--model']);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (flags.has(key)) { options[key.slice(2)] = true; continue; }
    if (!values.has(key)) throw new Error(`Unknown argument: ${key}`);
    const value = argv[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    options[key.slice(2)] = value;
  }
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: agy-delegate.mjs --check | --cwd PATH --prompt-file PATH [--mode plan|default|accept-edits] [--output-format text|json] [--timeout-seconds N] [--agent NAME] [--model NAME]\n');
  } else if (options.check) {
    process.stdout.write(JSON.stringify(await checkAgy()) + '\n');
  } else {
    if (!options.cwd) throw new Error('--cwd is required');
    if (!options['prompt-file']) throw new Error('--prompt-file is required');
    const prompt = (await readFile(path.resolve(options['prompt-file']), 'utf8')).replace(/^\uFEFF/, '');
    const result = await delegateAgy({
      prompt, cwd: options.cwd, mode: options.mode, outputFormat: options['output-format'],
      timeoutSeconds: options['timeout-seconds'] === undefined ? undefined : Number(options['timeout-seconds']),
      agent: options.agent, model: options.model,
    });
    if (result.output) process.stdout.write(result.output);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) process.stderr.write(result.error + '\n');
    process.exitCode = result.timedOut ? 124 : result.isError ? (result.exitCode || 1) : 0;
  }
} catch (error) {
  process.stderr.write(`Antigravity delegation failed: ${error.message}\n`);
  process.exitCode = 1;
}
