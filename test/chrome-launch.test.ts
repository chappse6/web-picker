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
});
