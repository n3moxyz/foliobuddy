import { Component, Suspense, type ComponentType, type ReactNode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileFunction, constants } from 'node:vm';
import { build } from 'vite';
import { expect, it, vi } from 'vitest';
import type { recoverFromVitePreloadError } from '../chunkRecovery';

class Boundary extends Component<
  { onError: (error: Error) => void; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    return this.state.error ? null : this.props.children;
  }
}

// Exercise Vite's emitted preload helper and React's production lazy initializer.
// A hand-written import mock would miss Vite resolving a cancelled error as undefined.
it('keeps a missing production chunk rejected while a recovery reload is pending', async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'foliobuddy-chunk-recovery-'));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const entryId = path.join(root, 'chunk-recovery-fixture.js');
  const pageId = path.join(root, 'chunk-recovery-page.js');
  const recoveryId = path.join(root, 'src/lib/chunkRecovery.ts');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const reload = vi.fn();
  const onError = vi.fn();
  const silenceExpectedError = (event: ErrorEvent) => {
    if (event.error?.code === 'ERR_MODULE_NOT_FOUND') event.preventDefault();
  };
  window.addEventListener('error', silenceExpectedError);
  let listener: ((event: Event) => void) | undefined;
  let unmount: (() => void) | undefined;

  try {
    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      plugins: [
        {
          name: 'chunk-recovery-fixture',
          resolveId(id) {
            if (id === 'fixture:entry') return entryId;
            if (id === 'fixture:page') return pageId;
          },
          load(id) {
            if (id === pageId) return 'export default function Page() { return null; }';
            if (id === entryId) {
              return `
                import { lazy } from 'react';
                export { recoverFromVitePreloadError } from ${JSON.stringify(recoveryId)};
                export const Page = lazy(() => import('fixture:page'));
              `;
            }
          },
        },
      ],
      build: {
        outDir: outputDir,
        rollupOptions: {
          input: 'fixture:entry',
          output: { entryFileNames: 'entry.mjs', chunkFileNames: '[name].mjs' },
          preserveEntrySignatures: 'strict',
        },
      },
    });
    await unlink(path.join(outputDir, 'chunk-recovery-page.mjs'));

    // Use Node's native loader so Vitest does not transform the production bundle.
    const importBuiltModule = compileFunction('return import(url)', ['url'], {
      importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
    }) as (url: string) => Promise<{
      Page: ComponentType;
      recoverFromVitePreloadError: typeof recoverFromVitePreloadError;
    }>;
    const { Page, recoverFromVitePreloadError: recover } = await importBuiltModule(
      pathToFileURL(path.join(outputDir, 'entry.mjs')).href
    );
    listener = (event) => {
      recover(event, { reload, storage: { getItem: () => null, setItem: () => {} } });
    };
    window.addEventListener('vite:preloadError', listener);

    ({ unmount } = render(
      <Boundary onError={onError}>
        <Suspense fallback="Loading page…">
          <Page />
        </Suspense>
      </Boundary>
    ));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(reload).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toMatchObject({ code: 'ERR_MODULE_NOT_FOUND' });
  } finally {
    unmount?.();
    if (listener) window.removeEventListener('vite:preloadError', listener);
    window.removeEventListener('error', silenceExpectedError);
    consoleError.mockRestore();
    await rm(outputDir, { recursive: true, force: true });
  }
}, 30_000);
