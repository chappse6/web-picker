#!/usr/bin/env node
/**
 * MCP entrypoint used by register scripts (Claude Code / Codex point here).
 *
 * Self-healing: if the project hasn't been built yet, it builds first, then
 * execs the shim. IMPORTANT: the shim speaks MCP over stdout, so build output
 * must never touch stdout — we send it to stderr only.
 */
const { existsSync } = require('node:fs');
const { spawnSync, spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const shim = path.join(root, 'dist', 'shim', 'shim.js');
const isWin = process.platform === 'win32';

if (!existsSync(shim)) {
  process.stderr.write('[web-picker] building (first run)...\n');
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'], // keep stdout clean for MCP
    shell: isWin,
  });
  if (build.status !== 0) {
    process.stderr.write('[web-picker] build failed\n');
    process.exit(build.status || 1);
  }
}

const child = spawn(process.execPath, [shim], { cwd: root, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
