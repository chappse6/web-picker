import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MINIMUM_NODE = [20, 18, 0];
const NODE_ERROR = 'Node.js >=20.18.0 is required for npm run sbom';
const PATH_PROPERTY = 'cdx:npm:package:path';
const DEVELOPMENT_PROPERTY = 'cdx:npm:package:development';

export function assertSupportedNode(version = process.versions.node) {
  const parts = String(version).replace(/^v/, '').split('.').map(Number);
  let comparison = 0;
  for (let index = 0; index < MINIMUM_NODE.length; index += 1) {
    const actual = Number.isFinite(parts[index]) ? parts[index] : 0;
    if (actual === MINIMUM_NODE[index]) continue;
    comparison = actual > MINIMUM_NODE[index] ? 1 : -1;
    break;
  }
  const supported = comparison >= 0;
  if (!supported) throw new Error(NODE_ERROR);
}

function integrityHashes(integrity) {
  const algorithms = new Map([
    ['md5', 'MD5'],
    ['sha1', 'SHA-1'],
    ['sha256', 'SHA-256'],
    ['sha384', 'SHA-384'],
    ['sha512', 'SHA-512'],
  ]);
  const hashes = [];
  for (const token of String(integrity ?? '').trim().split(/\s+/)) {
    const match = /^([a-z0-9]+)-([A-Za-z0-9+/=]+)$/.exec(token);
    const algorithm = match && algorithms.get(match[1].toLowerCase());
    if (!match || !algorithm) continue;
    hashes.push({
      alg: algorithm,
      content: Buffer.from(match[2], 'base64').toString('hex'),
    });
  }
  return hashes.sort((a, b) => a.alg.localeCompare(b.alg) || a.content.localeCompare(b.content));
}

function hydrateComponent(component, packages) {
  const properties = Array.isArray(component.properties) ? component.properties : [];
  const packagePath = properties.find((property) => property?.name === PATH_PROPERTY)?.value;
  const lockEntry = typeof packagePath === 'string' ? packages[packagePath] : undefined;

  if (lockEntry) {
    const stableProperties = properties.filter((property) => property?.name !== DEVELOPMENT_PROPERTY);
    if (lockEntry.dev || lockEntry.devOptional) {
      stableProperties.push({ name: DEVELOPMENT_PROPERTY, value: 'true' });
    }
    component.properties = stableProperties.sort((a, b) =>
      String(a.name).localeCompare(String(b.name)) || String(a.value).localeCompare(String(b.value)),
    );

    if (lockEntry.optional) component.scope = 'optional';
    else delete component.scope;

    if (lockEntry.resolved) {
      component.externalReferences ??= [];
      let distribution = component.externalReferences.find((reference) => reference?.type === 'distribution');
      if (!distribution) {
        distribution = { type: 'distribution', url: lockEntry.resolved };
        component.externalReferences.push(distribution);
      }
      distribution.url = lockEntry.resolved;
      const hashes = integrityHashes(lockEntry.integrity);
      if (hashes.length > 0) {
        distribution.hashes = hashes;
        distribution.comment = 'as detected from npm-ls property "resolved" and property "integrity"';
      } else {
        delete distribution.hashes;
        distribution.comment = 'as detected from npm-ls property "resolved"';
      }
    }
  }

  for (const child of component.components ?? []) hydrateComponent(child, packages);
}

export function canonicalizeBom(rawBom, packageLock) {
  const canonical = JSON.parse(JSON.stringify(rawBom));
  const packages = packageLock?.packages ?? {};
  for (const component of canonical.components ?? []) hydrateComponent(component, packages);
  return canonical;
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortObjectKeys(value[key])]),
  );
}

export function stableJson(value) {
  return `${JSON.stringify(sortObjectKeys(value), null, 2)}\n`;
}

async function validateBom(serialized) {
  const [{ JsonValidator }, { Version }] = await Promise.all([
    import('@cyclonedx/cyclonedx-library/Validation'),
    import('@cyclonedx/cyclonedx-library/Spec'),
  ]);
  const error = await new JsonValidator(Version.v1dot5).validate(serialized);
  if (error !== null) {
    throw new Error(`canonical CycloneDX validation failed: ${JSON.stringify(error)}`);
  }
}

export async function generateSbom(projectRoot = process.cwd()) {
  assertSupportedNode();
  const root = resolve(projectRoot);
  const scratch = mkdtempSync(join(tmpdir(), 'web-picker-sbom-'));
  const rawPath = join(scratch, 'raw.cdx.json');
  const outputPath = join(root, 'artifacts', 'sbom.cdx.json');
  const outputTemp = `${outputPath}.tmp-${process.pid}`;
  try {
    execFileSync(process.execPath, [
      join(root, 'node_modules', '@cyclonedx', 'cyclonedx-npm', 'bin', 'cyclonedx-npm-cli.js'),
      '--output-file', rawPath,
      '--output-format', 'JSON',
      '--spec-version', '1.5',
      '--output-reproducible',
      '--validate',
    ], { cwd: root, stdio: 'inherit' });

    const rawBom = JSON.parse(readFileSync(rawPath, 'utf8'));
    const packageLock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
    const serialized = stableJson(canonicalizeBom(rawBom, packageLock));
    await validateBom(serialized);

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputTemp, serialized);
    renameSync(outputTemp, outputPath);
  } finally {
    try { unlinkSync(outputTemp); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    try { unlinkSync(rawPath); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    rmdirSync(scratch);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  generateSbom().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
