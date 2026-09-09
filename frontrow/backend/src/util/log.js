// Tiny levelled logger. Home Assistant shows stdout verbatim in the add-on log,
// so lines are short, prefixed and human-readable rather than JSON.

import config from '../config.js';

const LEVELS = { trace: 10, debug: 20, info: 30, warning: 40, error: 50 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

const stamp = () => new Date().toISOString().slice(11, 19);

function emit(level, icon, scope, args) {
  if (LEVELS[level] < threshold) return;
  const stream = LEVELS[level] >= LEVELS.error ? process.stderr : process.stdout;
  stream.write(`${stamp()} ${icon} [${scope}] ${args.map(fmt).join(' ')}\n`);
}

const fmt = (a) => (typeof a === 'string' ? a : a instanceof Error ? (a.stack || a.message) : JSON.stringify(a));

export function logger(scope) {
  return {
    trace: (...a) => emit('trace', '·', scope, a),
    debug: (...a) => emit('debug', '›', scope, a),
    info: (...a) => emit('info', 'ℹ', scope, a),
    warn: (...a) => emit('warning', '⚠', scope, a),
    error: (...a) => emit('error', '✖', scope, a),
  };
}

export default logger;
