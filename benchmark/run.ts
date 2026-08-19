// @ts-expect-error jsdom ships runtime code but no declarations in this project.
import { JSDOM } from 'jsdom';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error The extension capture module is JavaScript by design.
import { captureElement, generateLocatorEvidence } from '#web-picker-capture';
import { fixtures, type BenchmarkCategory, type BenchmarkFixture, type BenchmarkStratum } from './fixtures.js';

type Confidence = 'high' | 'medium' | 'low';

interface FixtureResult {
  id: string;
  category: BenchmarkCategory;
  stratum: BenchmarkStratum;
  textOnlySuccess: boolean;
  locatorSuccess: boolean;
  confidence: Confidence;
  payloadBytes: number;
}

interface CalibrationBucket {
  total: number;
  successes: number;
}

interface ScopeMetrics {
  fixtures: number;
  textOnlySuccesses: number;
  locatorSuccesses: number;
  textOnlyRate: number;
  locatorRate: number;
}

type ConfidenceCalibration = Record<Confidence, CalibrationBucket>;

export interface BenchmarkResult {
  label: 'target-disambiguation benchmark';
  fixtureCount: number;
  textOnlyRate: number;
  locatorRate: number;
  confidenceCalibration: ConfidenceCalibration;
  categoryConfidenceCalibration: Record<string, ConfidenceCalibration>;
  strata: Record<BenchmarkStratum, ScopeMetrics>;
  meanPayloadBytes: number;
  p95PayloadBytes: number;
  fixtures: FixtureResult[];
  categories: Record<string, { fixtures: number; textOnlySuccesses: number; locatorSuccesses: number }>;
}

function rate(successes: number, total: number): number {
  return total === 0 ? 0 : successes / total;
}

function isTextOnlySuccess(document: Document, target: Element): boolean {
  const targetLabel = captureElement(target).visibleLabel;
  if (targetLabel === null) return false;

  const matches = Array.from(document.querySelectorAll('*')).filter(
    (element) => captureElement(element).visibleLabel === targetLabel,
  );
  return matches.length === 1 && matches[0] === target;
}

function makeCapturePayload(fixture: BenchmarkFixture, target: Element) {
  return {
    url: `https://benchmark.invalid/${fixture.id}`,
    title: 'target-disambiguation benchmark',
    viewport: { width: 1280, height: 720 },
    element: captureElement(target),
    userQuestion: '',
    createdAt: '1970-01-01T00:00:00.000Z',
    source: 'chrome-extension',
  };
}

function scoreFixture(fixture: BenchmarkFixture): FixtureResult {
  const dom = new JSDOM(fixture.html, { url: `https://benchmark.invalid/${fixture.id}` });
  const { document } = dom.window;
  const target = document.querySelector(fixture.target);
  if (!target) throw new Error(`Fixture ${fixture.id} has no target for ${fixture.target}`);

  const evidence = generateLocatorEvidence(target);
  const highestRanked = evidence.candidates[0];
  const candidates = highestRanked ? Array.from(document.querySelectorAll(highestRanked.value)) : [];
  const locatorSuccess = highestRanked?.matchCount === 1 && candidates.length === 1 && candidates[0] === target;
  const payloadBytes = Buffer.byteLength(JSON.stringify(makeCapturePayload(fixture, target)));

  return {
    id: fixture.id,
    category: fixture.category,
    stratum: fixture.stratum,
    textOnlySuccess: isTextOnlySuccess(document, target),
    locatorSuccess,
    confidence: evidence.confidence,
    payloadBytes,
  };
}

export function runBenchmark(fixtures: readonly BenchmarkFixture[]): BenchmarkResult {
  const results = [...fixtures].sort((left, right) => left.id.localeCompare(right.id)).map(scoreFixture);
  const payloadBytes = results.map((result) => result.payloadBytes).sort((left, right) => left - right);
  const calibration: ConfidenceCalibration = {
    high: { total: 0, successes: 0 },
    low: { total: 0, successes: 0 },
    medium: { total: 0, successes: 0 },
  };
  const categories: BenchmarkResult['categories'] = {};
  const categoryConfidenceCalibration: BenchmarkResult['categoryConfidenceCalibration'] = {};

  for (const result of results) {
    const bucket = calibration[result.confidence];
    bucket.total += 1;
    bucket.successes += Number(result.locatorSuccess);

    const categoryCalibration = categoryConfidenceCalibration[result.category] ?? {
      high: { total: 0, successes: 0 },
      low: { total: 0, successes: 0 },
      medium: { total: 0, successes: 0 },
    };
    categoryCalibration[result.confidence].total += 1;
    categoryCalibration[result.confidence].successes += Number(result.locatorSuccess);
    categoryConfidenceCalibration[result.category] = categoryCalibration;

    const category = categories[result.category] ?? {
      fixtures: 0,
      textOnlySuccesses: 0,
      locatorSuccesses: 0,
    };
    category.fixtures += 1;
    category.textOnlySuccesses += Number(result.textOnlySuccess);
    category.locatorSuccesses += Number(result.locatorSuccess);
    categories[result.category] = category;
  }

  const total = results.length;
  const strata = Object.fromEntries(
    (['ambiguous-label', 'unique-label'] as const).map((stratum) => {
      const scopedResults = results.filter((result) => result.stratum === stratum);
      return [stratum, {
        fixtures: scopedResults.length,
        textOnlySuccesses: scopedResults.filter((result) => result.textOnlySuccess).length,
        locatorSuccesses: scopedResults.filter((result) => result.locatorSuccess).length,
        textOnlyRate: rate(scopedResults.filter((result) => result.textOnlySuccess).length, scopedResults.length),
        locatorRate: rate(scopedResults.filter((result) => result.locatorSuccess).length, scopedResults.length),
      }];
    }),
  ) as Record<BenchmarkStratum, ScopeMetrics>;
  return {
    label: 'target-disambiguation benchmark',
    fixtureCount: total,
    textOnlyRate: rate(results.filter((result) => result.textOnlySuccess).length, total),
    locatorRate: rate(results.filter((result) => result.locatorSuccess).length, total),
    confidenceCalibration: calibration,
    categoryConfidenceCalibration: Object.fromEntries(Object.entries(categoryConfidenceCalibration).sort(([left], [right]) => left.localeCompare(right))),
    strata,
    meanPayloadBytes: total === 0 ? 0 : payloadBytes.reduce((sum, value) => sum + value, 0) / total,
    p95PayloadBytes: total === 0 ? 0 : payloadBytes[Math.ceil(total * 0.95) - 1],
    fixtures: results,
    categories: Object.fromEntries(Object.entries(categories).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function percentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function renderMarkdown(result: BenchmarkResult): string {
  const categoryRows = Object.entries(result.categories)
    .map(([category, metrics]) => `| ${category} | ${metrics.fixtures} | ${metrics.textOnlySuccesses} | ${metrics.locatorSuccesses} |`)
    .join('\n');
  const fixtureRows = result.fixtures
    .map((fixture) => `| ${fixture.id} | ${fixture.category} | ${fixture.stratum} | ${fixture.textOnlySuccess} | ${fixture.locatorSuccess} | ${fixture.confidence} | ${fixture.payloadBytes} |`)
    .join('\n');
  const stratumRows = (['ambiguous-label', 'unique-label'] as const)
    .map((stratum) => {
      const metrics = result.strata[stratum];
      return `| ${stratum} | ${metrics.fixtures} | ${percentage(metrics.textOnlyRate)} | ${percentage(metrics.locatorRate)} |`;
    })
    .join('\n');
  const categoryConfidenceRows = Object.entries(result.categoryConfidenceCalibration)
    .flatMap(([category, calibration]) => (['high', 'medium', 'low'] as const)
      .map((confidence) => `| ${category} | ${confidence} | ${calibration[confidence].total} | ${calibration[confidence].successes} |`))
    .join('\n');

  return `# target-disambiguation benchmark

| Metric | Value |
| --- | ---: |
| Fixtures | ${result.fixtureCount} |
| Text-only success rate | ${percentage(result.textOnlyRate)} |
| Web Picker locator success rate | ${percentage(result.locatorRate)} |
| Mean payload bytes | ${result.meanPayloadBytes} |
| P95 payload bytes | ${result.p95PayloadBytes} |

## Confidence calibration

| Confidence | Fixtures | Locator successes |
| --- | ---: | ---: |
| high | ${result.confidenceCalibration.high.total} | ${result.confidenceCalibration.high.successes} |
| low | ${result.confidenceCalibration.low.total} | ${result.confidenceCalibration.low.successes} |
| medium | ${result.confidenceCalibration.medium.total} | ${result.confidenceCalibration.medium.successes} |

## Strata

| Label stratum | Fixtures | Text-only success rate | Locator success rate |
| --- | ---: | ---: | ---: |
${stratumRows}

## Category confidence calibration

| Category | Confidence | Fixtures | Locator successes |
| --- | --- | ---: | ---: |
${categoryConfidenceRows}

## Categories

| Category | Fixtures | Text-only successes | Locator successes |
| --- | ---: | ---: | ---: |
${categoryRows}

## Fixtures

| Fixture | Category | Label stratum | Text-only success | Locator success | Confidence | Payload bytes |
| --- | --- | --- | --- | --- | --- | ---: |
${fixtureRows}
`;
}

export function writeBenchmarkArtifacts(outputDirectory = resolve('artifacts')): BenchmarkResult {
  const result = runBenchmark(fixtures);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, 'benchmark-results.json'), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(resolve(outputDirectory, 'benchmark-results.md'), renderMarkdown(result));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  writeBenchmarkArtifacts();
}
