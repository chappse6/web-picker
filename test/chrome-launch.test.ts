import { describe, expect, it } from 'vitest';
import { composeChromeExtensionArguments } from './e2e/chrome-launch.js';

const PLAYWRIGHT_1_61_1_DISABLE_FEATURES = '--disable-features=' + [
  'AvoidUnnecessaryBeforeUnloadCheckSync',
  'BoundaryEventDispatchTracksNodeRemoval',
  'DestroyProfileOnBrowserClose',
  'DialMediaRouteProvider',
  'GlobalMediaControls',
  'HttpsUpgrades',
  'LensOverlay',
  'MediaRouter',
  'PaintHolding',
  'ThirdPartyStoragePartitioning',
  'Translate',
  'AutoDeElevate',
  'RenderDocument',
  'OptimizationHints',
  'msForceBrowserSignIn',
  'msEdgeUpdateLaunchServicesPreferredVersion',
].join(',');

describe('Chrome extension launch arguments', () => {
  it('replaces Playwright 1.61.1 disabled features with one merged argument', () => {
    const extensionDir = '/tmp/web-picker-extension';
    const options = composeChromeExtensionArguments(extensionDir);
    const mergedDisableFeatures = `${PLAYWRIGHT_1_61_1_DISABLE_FEATURES},DisableDisableExtensionsExceptCommandLineSwitch`;

    expect(options.ignoreDefaultArgs).toEqual([
      '--disable-extensions',
      PLAYWRIGHT_1_61_1_DISABLE_FEATURES,
    ]);
    expect(options.args).toEqual([
      mergedDisableFeatures,
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ]);
    expect(options.args.filter((arg) => arg.startsWith('--disable-features='))).toHaveLength(1);
  });

  it('rejects a configured Chrome path unless it is executable', async () => {
    const helpers = await import('./e2e/chrome-launch.js') as Record<string, unknown>;
    expect(helpers.configuredChromeExecutable).toBeTypeOf('function');
    const configuredChromeExecutable = helpers.configuredChromeExecutable as (
      path: string,
      isExecutable: (path: string) => boolean,
    ) => string;

    expect(() => configuredChromeExecutable('/tmp/chrome', () => false)).toThrow(
      'Google Chrome is required for npm run test:e2e; install Chrome or set PLAYWRIGHT_CHROME_EXECUTABLE',
    );
    expect(configuredChromeExecutable('/tmp/chrome', () => true)).toBe('/tmp/chrome');
  });

  it.each([
    [Object.assign(new Error('spawn EACCES'), { code: 'EACCES' })],
    [new Error('browserType.launchPersistentContext: Failed to launch browser process')],
  ])('normalizes Chrome launch prerequisite failures', async (rawError) => {
    const helpers = await import('./e2e/chrome-launch.js') as Record<string, unknown>;
    expect(helpers.normalizeChromeLaunchError).toBeTypeOf('function');
    const normalizeChromeLaunchError = helpers.normalizeChromeLaunchError as (error: unknown) => Error;

    expect(normalizeChromeLaunchError(rawError).message).toBe(
      'Google Chrome is required for npm run test:e2e; install Chrome or set PLAYWRIGHT_CHROME_EXECUTABLE',
    );
  });
});
