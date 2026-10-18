// Human-readable log stream for local development.
//
// pino emits one JSON object per line. In production that raw JSON goes
// straight to stdout for the log aggregator; in development this stream
// re-renders each record as an aligned, colour-coded terminal line:
//
//   ◆  Wedding Expense Tracker API                     v1.0.0
//   ✔  Database        connected in 412 ms · db "test"
//   23:51:02  GET     /api/expenses/summary        200    93 ms  8cea207e
//
// Zero dependencies. Honours NO_COLOR / FORCE_COLOR (https://no-color.org).

const fs = require('fs');

const useColor =
  !('NO_COLOR' in process.env) &&
  (('FORCE_COLOR' in process.env && process.env.FORCE_COLOR !== '0') || !!process.stdout.isTTY);

const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  bold: paint('1'),
  dim: paint('2'),
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  blue: paint('34'),
  magenta: paint('35'),
  cyan: paint('36'),
  gray: paint('90'),
  boldRed: paint('1;31'),
};

const WIDTH = 64;
const INDENT = '  ';
const STEP_LABEL_WIDTH = 14;
const PATH_WIDTH = 34;

const LEVELS = {
  10: { name: 'TRACE', color: c.gray },
  20: { name: 'DEBUG', color: c.gray },
  30: { name: 'INFO', color: c.cyan },
  40: { name: 'WARN', color: c.yellow },
  50: { name: 'ERROR', color: c.red },
  60: { name: 'FATAL', color: c.boldRed },
};

const STEP_SYMBOLS = {
  ok: c.green('✔'),
  info: c.cyan('•'),
  pending: c.gray('…'),
  skip: c.gray('○'),
  warn: c.yellow('⚠'),
  fail: c.red('✖'),
};

// Keys pino / pino-http / the boot reporter own. Everything else on a record is
// treated as caller-supplied context and rendered as key=value pairs.
const RESERVED = new Set([
  'level', 'time', 'pid', 'hostname', 'msg', 'v',
  'req', 'res', 'responseTime', 'err', 'reqId',
  'boot', 'step', 'status', 'hint', 'integrations',
  'service', 'version', 'node', 'env', 'url', 'origins', 'bootMs',
]);

const rule = () => INDENT + c.gray('─'.repeat(WIDTH));

function clock(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtValue(v) {
  if (v == null) return String(v);
  if (typeof v === 'string') return /\s|=|"/.test(v) ? JSON.stringify(v) : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const json = JSON.stringify(v);
  return json.length > 240 ? `${json.slice(0, 239)}…` : json;
}

function fmtContext(rec) {
  const pairs = Object.keys(rec)
    .filter((k) => !RESERVED.has(k))
    .map((k) => `${c.gray(`${k}=`)}${fmtValue(rec[k])}`);
  return pairs.length ? `  ${pairs.join('  ')}` : '';
}

function fmtError(err, level) {
  if (!err) return '';
  if (typeof err === 'string') return `\n${INDENT}${' '.repeat(10)}${c.red(err)}`;
  const head = `\n${INDENT}${' '.repeat(10)}${c.red(`${err.type || 'Error'}: ${err.message}`)}`;
  if (level < 50 || !err.stack) return head;
  const frames = String(err.stack)
    .split('\n')
    .slice(1)
    .filter((l) => !/node_modules|node:/.test(l))
    .slice(0, 6)
    .map((l) => `${INDENT}${' '.repeat(12)}${c.gray(l.trim())}`);
  return frames.length ? `${head}\n${frames.join('\n')}` : head;
}

function statusColor(code) {
  if (code >= 500) return c.red;
  if (code >= 400) return c.yellow;
  if (code >= 300) return c.cyan;
  return c.green;
}

function durationColor(ms) {
  if (ms >= 1000) return c.red;
  if (ms >= 300) return c.yellow;
  return c.gray;
}

const METHOD_COLORS = {
  GET: c.blue, POST: c.green, PUT: c.yellow, PATCH: c.yellow, DELETE: c.red, OPTIONS: c.gray,
};

function fmtRequest(rec) {
  const method = String(rec.req.method || '').toUpperCase();
  const url = String(rec.req.url || '');
  const status = rec.res.statusCode;
  const ms = Math.round(rec.responseTime || 0);
  const id = rec.req.id ? c.gray(String(rec.req.id).slice(0, 8)) : '';
  const path = url.length > PATH_WIDTH ? url : url.padEnd(PATH_WIDTH);
  const line =
    `${INDENT}${c.gray(clock(rec.time))}  ` +
    `${(METHOD_COLORS[method] || c.magenta)(method.padEnd(7))} ` +
    `${path}  ` +
    `${statusColor(status)(String(status))}  ` +
    `${durationColor(ms)(`${String(ms).padStart(5)} ms`)}  ${id}`;
  return line + fmtError(rec.err, rec.level);
}

function fmtIntegrations(map) {
  return Object.entries(map)
    .map(([name, on]) => (on ? `${c.green('✔')} ${name}` : c.gray(`○ ${name}`)))
    .join('   ');
}

function fmtBoot(rec) {
  switch (rec.boot) {
    case 'banner': {
      const title = `${c.magenta('◆')}  ${c.bold(rec.service)}`;
      const version = c.gray(`v${rec.version}`);
      const gap = Math.max(2, WIDTH - 3 - String(rec.service).length - String(rec.version).length - 1);
      return [
        '',
        `${INDENT}${title}${' '.repeat(gap)}${version}`,
        `${INDENT}   ${c.gray(`node ${rec.node}  ·  ${rec.env}  ·  pid ${rec.pid}`)}`,
        rule(),
      ].join('\n');
    }
    case 'step': {
      const symbol = STEP_SYMBOLS[rec.status] || STEP_SYMBOLS.info;
      const label = String(rec.step).padEnd(STEP_LABEL_WIDTH);
      const body = rec.integrations ? fmtIntegrations(rec.integrations) : rec.msg;
      const tone = rec.status === 'fail' ? c.red : rec.status === 'warn' ? c.yellow : (s) => s;
      let out = `${INDENT}${symbol}  ${c.bold(label)}${tone(body)}`;
      if (rec.hint) out += `\n${INDENT}   ${' '.repeat(STEP_LABEL_WIDTH)}${c.gray(`→ ${rec.hint}`)}`;
      return out;
    }
    case 'ready': {
      const secs = (rec.bootMs / 1000).toFixed(2);
      const origins = Array.isArray(rec.origins) && rec.origins.length
        ? c.gray(`  ·  CORS ${rec.origins.join(', ')}`)
        : '';
      return [
        rule(),
        `${INDENT}${c.green('✔')}  ${c.bold(`Ready in ${secs}s`)}  ${c.cyan(rec.url)}${origins}`,
        '',
        `${INDENT}${c.gray(`${'TIME'.padEnd(8)}  ${'METHOD'.padEnd(7)} ${'PATH'.padEnd(PATH_WIDTH)}  STATUS  DURATION  REQ-ID`)}`,
      ].join('\n');
    }
    case 'abort': {
      const lines = [rule(), `${INDENT}${c.red('✖')}  ${c.boldRed(rec.msg)}`];
      if (rec.hint) lines.push(`${INDENT}   ${c.gray(rec.hint)}`);
      lines.push('');
      return lines.join('\n');
    }
    default:
      return null;
  }
}

function fmtGeneric(rec) {
  const lvl = LEVELS[rec.level] || LEVELS[30];
  const context = rec.req ? c.gray(`  ${rec.req.method} ${rec.req.url}`) : '';
  return (
    `${INDENT}${c.gray(clock(rec.time))}  ${lvl.color(lvl.name.padEnd(7))} ${rec.msg || ''}` +
    context +
    fmtContext(rec) +
    fmtError(rec.err, rec.level)
  );
}

function formatRecord(rec) {
  if (rec.boot) {
    const out = fmtBoot(rec);
    if (out != null) return out;
  }
  if (rec.req && rec.res && rec.responseTime != null) return fmtRequest(rec);
  return fmtGeneric(rec);
}

// TTYs go through the stream so Windows consoles receive proper Unicode
// regardless of code page; pipes/files use a synchronous fd write so a line
// emitted right before process.exit() is never lost.
function writeOut(text) {
  if (process.stdout.isTTY) {
    process.stdout.write(text);
    return;
  }
  try {
    fs.writeSync(1, text);
  } catch {
    process.stdout.write(text);
  }
}

function createDevStream() {
  return {
    write(chunk) {
      for (const line of String(chunk).split('\n')) {
        if (!line.trim()) continue;
        let rendered;
        try {
          rendered = formatRecord(JSON.parse(line));
        } catch {
          rendered = line;
        }
        writeOut(`${rendered}\n`);
      }
    },
  };
}

module.exports = { createDevStream };
