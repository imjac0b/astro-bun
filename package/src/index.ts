import type { AstroAdapter, AstroIntegration, IntegrationResolvedRoute } from 'astro';
import { AstroError } from 'astro/errors';
import { name as packageName } from '~/package.json';
import { CreateExports } from '~/types';
import type { Options } from '~/types.ts';
import { OptionsSchema } from '~/validators';

export function getAdapter(args: Options = {}): AstroAdapter {
  return {
    args,
    exports: [
      CreateExports.HANDLE,
      CreateExports.RUNNING,
      CreateExports.START,
      CreateExports.STOP,
    ] satisfies Array<(typeof CreateExports)[keyof typeof CreateExports]>,
    name: packageName,
    serverEntrypoint: `${packageName}/server.js`,
    supportedAstroFeatures: {
      envGetSecret: 'experimental',
      hybridOutput: 'deprecated',
      i18nDomains: 'unsupported',
      serverOutput: 'stable',
      sharpImageService: 'stable',
      staticOutput: 'stable',
    },
  };
}

export default function integration(options?: Options): AstroIntegration {
  // Note: Running the parser manually instead of using `defineIntegration` because
  // of this issue comment: https://github.com/NuroDev/astro-bun/pull/11#discussion_r1896212455
  const parsedOptions = OptionsSchema.optional().safeParse(options);
  if (!parsedOptions.success)
    throw new AstroError(
      `Invalid options passed to "${packageName}" integration\n`,
      parsedOptions.error.issues.map((i) => i.message).join('\n'),
    );

  let astroRoutes: Array<IntegrationResolvedRoute>;

  return {
    name: packageName,
    hooks: {
      'astro:config:setup': ({ addMiddleware }) => {
        addMiddleware({
          entrypoint: new URL('middleware.mjs', import.meta.url),
          order: 'pre',
        });
      },
      'astro:config:done': (params) => {
        params.setAdapter(
          getAdapter(
            Object.assign(
              {},
              {
                assets: params.config.build.assets,
                client: params.config.build.client.href,
                host: params.config.server.host,
                port: params.config.server.port,
                server: params.config.build.server.href,
              },
              parsedOptions.data,
            ),
          ),
        );
      },
      'astro:routes:resolved': ({ routes }) => {
        astroRoutes = routes;
      },
      'astro:build:start': () => {
        globalThis.__astroBunStaticHeaders = {} as Record<string, globalThis.Headers>;
      },
      'astro:build:done': async ({ dir, logger }) => {
        const headers = globalThis.__astroBunStaticHeaders as
          | Record<string, globalThis.Headers>
          | undefined;
        Reflect.deleteProperty(globalThis, '__astroBunStaticHeaders');

        if (!headers || Object.keys(headers).length === 0) {
          return;
        }

        astroRoutes
          .filter(({ redirect, isPrerendered }) => redirect && isPrerendered)
          .forEach(({ pattern }) => {
            Reflect.deleteProperty(headers, pattern);
          });

        const headersContent = Object.entries(headers).reduce(
          (acc, [route, routeHeaders]) => {
            if (!routeHeaders) return acc;
            const entries: Array<[string, string]> = [];
            routeHeaders.forEach((value, key) => {
              entries.push([key, value]);
            });
            if (entries.length === 0) return acc;
            acc[route] = Object.fromEntries(entries);
            return acc;
          },
          {} as Record<string, Record<string, string>>,
        );

        const { writeFile } = await import('node:fs/promises');
        await writeFile(
          new URL('./static-headers.json', dir),
          JSON.stringify(headersContent, null, 2),
          'utf8',
        );
        logger.info(
          `Wrote static headers for ${Object.keys(headersContent).length} routes`,
        );
      },
    },
  };
}
