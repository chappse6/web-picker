import { describe, expect, it } from 'vitest';

async function loadGenerator(): Promise<Record<string, any>> {
  const loaded = await import('../scripts/generate-sbom.mjs').catch((error) => ({ error }));
  expect(loaded).not.toHaveProperty('error');
  return loaded as Record<string, any>;
}

function rawBom(withVolatileMetadata: boolean) {
  const distribution = (path: string) => ({
    type: 'distribution',
    url: `https://registry.npmjs.org/${path}/-/${path}-1.0.0.tgz`,
    ...(withVolatileMetadata
      ? {
          hashes: [{
            alg: 'SHA-256',
            content: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
          }],
          comment: 'as detected from npm-ls property "resolved" and property "integrity"',
        }
      : { comment: 'as detected from npm-ls property "resolved"' }),
  });
  const pathProperty = (path: string) => ({ name: 'cdx:npm:package:path', value: path });

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    components: [{
      type: 'library',
      name: 'parent',
      version: '1.0.0',
      scope: withVolatileMetadata ? 'optional' : undefined,
      externalReferences: [distribution('parent')],
      properties: [
        ...(withVolatileMetadata
          ? [{ name: 'cdx:npm:package:development', value: 'true' }]
          : []),
        pathProperty('node_modules/parent'),
      ],
      components: [{
        type: 'library',
        name: 'child',
        version: '1.0.0',
        externalReferences: [distribution('child')],
        properties: [pathProperty('node_modules/parent/node_modules/child')],
      }],
    }],
  };
}

const lock = {
  lockfileVersion: 3,
  packages: {
    'node_modules/parent': {
      version: '1.0.0',
      resolved: 'https://registry.npmjs.org/parent/-/parent-1.0.0.tgz',
      integrity: 'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
      dev: true,
      optional: true,
    },
    'node_modules/parent/node_modules/child': {
      version: '1.0.0',
      resolved: 'https://registry.npmjs.org/child/-/child-1.0.0.tgz',
      integrity: 'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
    },
  },
};

describe('canonical SBOM generator', () => {
  it('canonicalizes clean and stale npm raw BOMs to identical bytes recursively', async () => {
    const generator = await loadGenerator();
    expect(generator.canonicalizeBom).toBeTypeOf('function');
    expect(generator.stableJson).toBeTypeOf('function');

    const clean = generator.stableJson(generator.canonicalizeBom(rawBom(true), lock));
    const stale = generator.stableJson(generator.canonicalizeBom(rawBom(false), lock));

    expect(stale).toBe(clean);
    const canonical = JSON.parse(stale);
    expect(canonical.components[0]).toMatchObject({
      scope: 'optional',
      properties: expect.arrayContaining([
        { name: 'cdx:npm:package:development', value: 'true' },
      ]),
      externalReferences: [expect.objectContaining({
        hashes: [{
          alg: 'SHA-256',
          content: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        }],
      })],
    });
    expect(canonical.components[0].components[0].externalReferences[0].hashes).toEqual([{
      alg: 'SHA-256',
      content: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    }]);
  });

  it('rejects Node versions older than the package engine floor', async () => {
    const generator = await loadGenerator();
    expect(generator.assertSupportedNode).toBeTypeOf('function');

    expect(() => generator.assertSupportedNode('20.18.0')).not.toThrow();
    expect(() => generator.assertSupportedNode('20.17.9')).toThrow(
      'Node.js >=20.18.0 is required for npm run sbom',
    );
    expect(() => generator.assertSupportedNode('19.99.0')).toThrow(
      'Node.js >=20.18.0 is required for npm run sbom',
    );
  });
});
