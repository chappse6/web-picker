export interface ChromeExtensionArguments {
  ignoreDefaultArgs: string[];
  args: string[];
}

// Locked to playwright-core 1.61.1. When upgrading Playwright, update this
// list and its literal regression fixture together from chromiumSwitches.ts.
const PLAYWRIGHT_DISABLED_FEATURES = [
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
];

export function composeChromeExtensionArguments(extensionDir: string): ChromeExtensionArguments {
  const playwrightDisableFeatures = `--disable-features=${PLAYWRIGHT_DISABLED_FEATURES.join(',')}`;
  return {
    ignoreDefaultArgs: ['--disable-extensions', playwrightDisableFeatures],
    args: [
      `${playwrightDisableFeatures},DisableDisableExtensionsExceptCommandLineSwitch`,
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  };
}
