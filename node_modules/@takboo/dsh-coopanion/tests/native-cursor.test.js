import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
const { createNativeCursor } = createRequire(import.meta.url)('../desktop/native-cursor.cjs');
it('uses bounded fresh X11 coordinates without passing host credentials and closes its own helper', () => {
  let time=0;
  const child=new EventEmitter();child.stdout=new EventEmitter();child.kill=vi.fn();
  const start=vi.fn(()=>child), screen={getCursorScreenPoint:()=>({x:1,y:2})};
  const cursor=createNativeCursor({screen,platform:'linux',env:{DISPLAY:':99',API_KEY:'private'},start,now:()=>time});
  expect(start.mock.calls[0][2].env).toEqual({DISPLAY:':99'});
  expect(cursor.read()).toEqual({x:1,y:2});
  child.stdout.emit('data',Buffer.from('{"x":90,"y":100}\n'));
  expect(cursor.read()).toEqual({x:90,y:100});
  time=501;expect(cursor.read()).toEqual({x:1,y:2});
  child.stdout.emit('data',Buffer.from('{"x":0,"y":0,"key":"unexpected"}\n'));
  expect(child.kill).toHaveBeenCalledOnce();expect(cursor.read()).toEqual({x:1,y:2});cursor.stop();
});
it.each([{platform:'darwin',env:{}},{platform:'linux',env:{DISPLAY:':99',WAYLAND_DISPLAY:'wayland-0'}}])('does not start an X11 helper for other sessions', options=>{
  const start=vi.fn(),cursor=createNativeCursor({...options,screen:{getCursorScreenPoint:()=>({x:1,y:2})},start});
  expect(start).not.toHaveBeenCalled();expect(cursor.read()).toEqual({x:1,y:2});cursor.stop();
});
