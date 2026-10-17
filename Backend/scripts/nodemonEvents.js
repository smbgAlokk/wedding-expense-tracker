// One-line restart / crash notices for `npm run dev` (wired via nodemon.json
// "events"). nodemon itself runs with -q so its own banner lines don't
// interleave with the server's boot checklist.

const event = process.argv[2];
const color = !('NO_COLOR' in process.env) && !!process.stdout.isTTY;
const gray = (s) => (color ? `\x1b[90m${s}\x1b[0m` : s);
const yellow = (s) => (color ? `\x1b[33m${s}\x1b[0m` : s);

if (event === 'restart') {
  process.stdout.write(`\n  ${yellow('↻')}  ${gray('File change detected — restarting…')}\n`);
} else if (event === 'crash') {
  process.stdout.write(`  ${gray('○  Server stopped — waiting for file changes before restarting…')}\n\n`);
}
