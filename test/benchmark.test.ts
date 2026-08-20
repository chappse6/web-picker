import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtures } from '../benchmark/fixtures.js';
import { runBenchmark, writeBenchmarkArtifacts } from '../benchmark/run.js';

const scoringFixtures = [
  {
    id: 'ambiguous-label',
    category: 'repeated-label' as const,
    stratum: 'ambiguous-label' as const,
    html: '<main><h1>Account</h1><button id="target">Save</button><button>Save</button></main>',
    target: '#target',
  },
  {
    id: 'unique-label',
    category: 'safe-test-id' as const,
    stratum: 'unique-label' as const,
    html: '<main><h1>Account</h1><button id="target">Continue</button></main>',
    target: '#target',
  },
];

describe('target-disambiguation benchmark', () => {
  it('exports deterministic results for its static fixtures', async () => {
    await expect(import('../benchmark/run.js')).resolves.toMatchObject({
      runBenchmark: expect.any(Function),
    });
  });

  it('counts text only for a non-null label unique in the document', () => {
    const result = runBenchmark(scoringFixtures);

    expect(result.fixtureCount).toBe(2);
    expect(result.textOnlyRate).toBe(0.5);
    expect(result.locatorRate).toBe(1);
  });

  it('returns stable payload metrics and confidence calibration', () => {
    expect(runBenchmark(scoringFixtures)).toEqual(runBenchmark(scoringFixtures));
    const result = runBenchmark(scoringFixtures);

    expect(result.meanPayloadBytes).toBeGreaterThan(0);
    expect(result.p95PayloadBytes).toBeGreaterThan(0);
    expect(result.confidenceCalibration.high).toEqual({ total: 2, successes: 2 });
  });

  it('covers at least 30 fixtures and exactly six named categories', async () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(30);
    expect(new Set(fixtures.map((item) => item.category))).toEqual(new Set([
      'repeated-label',
      'repeated-class',
      'nested-landmark',
      'generated-class',
      'aria-only',
      'safe-test-id',
    ]));
    expect([...new Set(fixtures.map((item) => item.category))]).toHaveLength(6);
    for (const category of new Set(fixtures.map((item) => item.category))) {
      expect(fixtures.filter((item) => item.category === category)).toHaveLength(5);
    }
  });

  it('is deterministic across repeated fixture runs', () => {
    expect(runBenchmark(fixtures)).toEqual(runBenchmark(fixtures));
  });

  it('balances ambiguous and unique label strata with varied locator outcomes', () => {
    const result = runBenchmark(fixtures);

    expect(fixtures.filter((fixture) => fixture.stratum === 'ambiguous-label')).toHaveLength(15);
    expect(fixtures.filter((fixture) => fixture.stratum === 'unique-label')).toHaveLength(15);
    expect((result as any).strata).toMatchObject({
      'ambiguous-label': { fixtures: 15 },
      'unique-label': { fixtures: 15 },
    });
    expect(new Set(result.fixtures.map((fixture) => fixture.confidence))).toEqual(new Set(['high', 'medium', 'low']));
    expect(result.fixtures.some((fixture) => !fixture.locatorSuccess)).toBe(true);
  });

  it('reports category by confidence calibration totals and successes', () => {
    const result = runBenchmark(fixtures) as any;

    expect(result.categoryConfidenceCalibration).toMatchObject({
      'repeated-class': {
        low: { total: expect.any(Number), successes: 0 },
      },
    });
    const total = Object.values(result.categoryConfidenceCalibration)
      .flatMap((byConfidence: any) => Object.values(byConfidence))
      .reduce((sum: number, bucket: any) => sum + bucket.total, 0);
    expect(total).toBe(fixtures.length);
  });

  it('writes stable JSON and Markdown artifacts without timestamps', () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), 'web-picker-benchmark-'));
    try {
      writeBenchmarkArtifacts(outputDirectory);
      const firstJson = readFileSync(join(outputDirectory, 'benchmark-results.json'));
      const firstMarkdown = readFileSync(join(outputDirectory, 'benchmark-results.md'));
      writeBenchmarkArtifacts(outputDirectory);
      const secondJson = readFileSync(join(outputDirectory, 'benchmark-results.json'));
      const secondMarkdown = readFileSync(join(outputDirectory, 'benchmark-results.md'));
      const json = secondJson.toString('utf8');
      const markdown = secondMarkdown.toString('utf8');

      expect(secondJson.equals(firstJson)).toBe(true);
      expect(secondMarkdown.equals(firstMarkdown)).toBe(true);
      expect(JSON.parse(json)).toMatchObject({
        label: 'target-disambiguation benchmark',
        fixtureCount: 30,
      });
      expect(markdown).toContain('# target-disambiguation benchmark');
      expect(markdown).toContain('## Strata');
      expect(markdown).toContain('## Category confidence calibration');
      expect(json).not.toMatch(/createdAt|timestamp/i);
      expect(markdown).not.toMatch(/createdAt|timestamp/i);
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});
