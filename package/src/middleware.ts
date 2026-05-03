import type { MiddlewareHandler } from 'astro';

declare global {
  var __astroBunStaticHeaders: Record<string, Headers>;
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  if (!context.isPrerendered) return next();

  const route = context.url.pathname || '/';
  let store = globalThis.__astroBunStaticHeaders;
  if (!store) {
    store = {};
    globalThis.__astroBunStaticHeaders = store;
  }

  const res = await next();

  let headers: Headers | undefined = store[route];
  if (!headers) {
    headers = new Headers();
    store[route] = headers;
  }
  res.headers.forEach((value, key) => {
    if (key.startsWith('x-astro-') || (key === 'content-type' && value === 'text/html')) {
      return;
    }
    headers.append(key, value);
  });

  return res;
};
