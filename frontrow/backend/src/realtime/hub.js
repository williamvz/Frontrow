// The realtime hub: one in-process event bus, and a Server-Sent Events stream
// that mirrors it to every open browser.
//
// SSE rather than WebSockets, deliberately. It survives Home Assistant's
// ingress proxy (which is why the add-on sets `ingress_stream: true`), it
// reconnects itself with no client code, it replays missed events through
// Last-Event-ID, and it costs one idle HTTP response per phone in the house.
// We only ever push server -> client, so the second direction would be dead
// weight.

import { EventEmitter } from 'node:events';
import { logger } from '../util/log.js';

const log = logger('hub');

export const bus = new EventEmitter();
bus.setMaxListeners(50);

// A short ring buffer so a phone that was in a tunnel for thirty seconds
// catches up on the goals it missed instead of showing a stale screen.
const RING = 200;
const backlog = [];
let seq = 0;

/**
 * Publish an event to every connected client.
 * @param {string} type  'match:update' | 'match:goal' | 'match:status' |
 *                       'standings:update' | 'sync' | 'hello'
 */
export function publish(type, data) {
  const event = { id: ++seq, type, data, at: new Date().toISOString() };
  backlog.push(event);
  if (backlog.length > RING) backlog.shift();
  bus.emit('event', event);
  bus.emit(type, data);
  return event;
}

export const since = (lastId) => backlog.filter((e) => e.id > Number(lastId || 0));
export const currentSeq = () => seq;

/** Attach an Express response as an SSE client. */
export function attach(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Nginx (and HA's ingress) will otherwise buffer the stream into silence.
    'X-Accel-Buffering': 'no',
  });

  const write = (event) => {
    res.write(`id: ${event.id}\n`);
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  };

  // Replay anything this client missed, then greet it.
  const lastId = req.headers['last-event-id'] || req.query?.lastEventId;
  for (const e of since(lastId)) write(e);
  write({ id: seq, type: 'hello', data: { seq, at: new Date().toISOString() } });

  const onEvent = (event) => write(event);
  bus.on('event', onEvent);

  // A comment line every 20s keeps proxies and mobile radios from deciding the
  // connection is dead. It costs three bytes.
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);

  const close = () => {
    clearInterval(ping);
    bus.off('event', onEvent);
    log.debug(`client disconnected (${bus.listenerCount('event')} left)`);
  };
  req.on('close', close);
  req.on('error', close);

  log.debug(`client connected (${bus.listenerCount('event')} total)`);
}

export const clientCount = () => bus.listenerCount('event');
