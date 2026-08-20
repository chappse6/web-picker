import { accessSync, constants, statSync } from 'node:fs';

export interface ChromeExtensionArguments {
  ignoreDefaultArgs: string[];
  args: string[];
}

export const CHROME_REQUIRED = 'Google Chrome is required for npm run test:e2e; install Chrome or set PLAYWRIGHT_CHROME_EXECUTABLE';

export function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function configuredChromeExecutable(
  path: string,
  executable: (path: string) => boolean = isExecutableFile,
): string {
  if (!executable(path)) throw new Error(CHROME_REQUIRED);
  return path;
}

export function normalizeChromeLaunchError(error: unknown): Error | null {
  const code = (error as NodeJS.ErrnoException)?.code;
  const message = error instanceof Error ? error.message : String(error);
  if (
    code === 'EACCES'
    || /\bEACCES\b|permission denied|executable.*(?:doesn.t exist|not found)|distribution.*chrome.*not found|failed to launch browser process/i.test(message)
  ) {
    return new Error(CHROME_REQUIRED);
  }
  return null;
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
