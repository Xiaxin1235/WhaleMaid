import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { ConnectionFetchRoute, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';

const STAGE = '/api/coopanion/stage/1';
const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/** Each live stream is one lease. No browser-supplied identity or persisted visibility preference. */
export class StagePresence {
  private readonly leases = new Set<() => void>();
  private closed = false;
  constructor(private readonly setAway: (away: boolean) => void) {}

  open(signal: AbortSignal): Response {
    if (this.closed || signal.aborted) return new Response(null, { status: 503, headers: HEADERS });
    if (this.leases.size >= 64) return new Response(null, { status: 429, headers: HEADERS });
    const encoder = new TextEncoder();
    let release: () => void;
    const stream = new ReadableStream<Uint8Array>({
      start: controller => {
        const timer = setInterval(() => {
          if ((controller.desiredSize ?? 0) > 0) controller.enqueue(encoder.encode(':\n\n'));
        }, 15000);
        timer.unref();
        release = () => {
          if (!this.leases.delete(finish)) return;
          clearInterval(timer);
          signal.removeEventListener('abort', finish);
          if (!this.leases.size) this.setAway(false);
        };
        const finish = () => { release(); controller.close(); };
        this.leases.add(finish);
        signal.addEventListener('abort', finish, { once: true });
        controller.enqueue(encoder.encode('data: stage/1\n\n'));
        if (this.leases.size === 1) this.setAway(true);
      },
      cancel: () => { release(); },
    });
    // Harness bypasses its gzip buffer for event streams.
    return new Response(stream, { headers: {
      ...HEADERS, 'Cache-Control': 'no-store, no-transform', 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no',
    } });
  }

  close(): void {
    this.closed = true;
    for (const finish of this.leases) finish();
  }
}

export function stageDocument(source: string) {
  const script = source.replace(/<\/script/gi, '<\\/script');
  const hash = createHash('sha256').update(script).digest('base64');
  const html = [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}',
    '#stage{width:100%;height:100%;display:block}#drawing{pointer-events:none}#hit{fill:transparent;cursor:pointer}</style>',
    '</head><body><svg id="stage" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
    '<g id="actor"><g id="drawing"></g><g id="hit">',
    '<ellipse cx="125" cy="94" rx="94" ry="77"/><ellipse cx="128" cy="191" rx="62" ry="63"/>',
    '</g></g></svg><script type="module">' + script + '</script></body></html>',
  ].join('\n');
  const headers = {
    ...HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "sandbox allow-scripts; default-src 'none'; script-src 'sha256-" + hash +
      "'; img-src data: blob:; style-src 'unsafe-inline'; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
  };
  return { html, headers };
}

export function stageRoutes(
  connection: Pick<HostConnectionHandle, 'admit' | 'operator'>,
  presence: StagePresence,
  load = () => readFile(new URL('../dist/stage.js', import.meta.url), 'utf8'),
): ConnectionFetchRoute[] {
  let document: Promise<ReturnType<typeof stageDocument>> | undefined;
  const admit = (request: Request) => {
    const admission = connection.admit(request);
    if ('rejection' in admission) return new Response(null, { status: admission.rejection, headers: HEADERS });
    // Older carriers admit only their operator and expose no principal or peer signal.
    const peer = admission.peer as typeof admission.peer & { principal?: { kind: string }; signal?: AbortSignal };
    if (peer.principal ? peer.principal.kind !== 'owner' : peer !== connection.operator)
      return new Response(null, { status: 403, headers: HEADERS });
    return peer;
  };
  return [
    {
      path: STAGE, methods: ['GET', 'HEAD'], requestBody: 'buffered',
      async fetch(request) {
        const peer = admit(request);
        if (peer instanceof Response) return peer;
        document ??= load().then(stageDocument);
        try {
          const { html, headers } = await document;
          return new Response(request.method === 'HEAD' ? null : html, { headers });
        } catch {
          document = undefined;
          return new Response(null, { status: 503, headers: HEADERS });
        }
      },
    },
    {
      path: STAGE + '/away', methods: ['POST'], requestBody: 'buffered',
      async fetch(request) {
        const peer = admit(request);
        if (peer instanceof Response) return peer;
        if (request.body !== null) return new Response(null, { status: 400, headers: HEADERS });
        return presence.open(peer.signal ? AbortSignal.any([request.signal, peer.signal]) : request.signal);
      },
    },
  ];
}
