// Local test double: no account, network, or workspace mutations.
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('1.2.15-fixture');
} else if (args.includes('--help')) {
  console.log(`
  --print            Run a prompt
  --mode             Execution mode (plan, accept-edits)
  --output-format    Output (text, json, stream-json)
  --input-format     Input (text, stream-json)
  --print-timeout    Time limit
  --disable-slash-commands Literal prompt
  `);
} else {
  if (args.includes('--dangerously-skip-permissions') || args[args.indexOf('--mode') + 1] === 'default') process.exit(90);
  const stream = args.includes('--input-format');
  let prompt;
  if (stream) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const message = JSON.parse(input);
    if (message.event !== 'user' || typeof message.message.content !== 'string') process.exit(91);
    prompt = message.message.content;
  } else {
    prompt = args[args.indexOf('--print') + 1];
  }
  if (prompt === 'TIMEOUT') {
    setInterval(() => {}, 1000);
  } else if (prompt === 'TRUNCATE') {
    process.stdout.write('x'.repeat(2 * 1024 * 1024 + 1));
  } else if (prompt === 'MALFORMED') {
    console.log('not-json');
  } else if (prompt === 'MISSING_RESULT') {
    console.log(JSON.stringify({ event: 'init', init: {} }));
  } else if (prompt === 'INVALID_RESULT') {
    console.log(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 123 } }));
  } else {
    const status = ['ERROR', 'WAITING', 'CANCELED'].includes(prompt) ? prompt : 'SUCCESS';
    const result = {
      status, response: prompt, error: status === 'SUCCESS' ? undefined : 'fixture failure',
      conversation_id: 'fixture-id', args,
    };
    if (stream) {
      console.log(JSON.stringify({ event: 'init', init: {} }));
      console.log(JSON.stringify({ event: 'result', result }));
    } else {
      console.log(JSON.stringify(result));
    }
    if (prompt === 'EXIT_FAILURE') process.exitCode = 7;
  }
}
