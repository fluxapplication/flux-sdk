#!/usr/bin/env node
import { startServer } from './server.mjs';
import { resolve } from 'path';
import { spawn } from 'child_process';

// Parse args
const args = process.argv.slice(2);
const portParam = args.findIndex(arg => arg === '--port' || arg === '-p');
const port = portParam !== -1 ? parseInt(args[portParam + 1], 10) : 3000;

// The extension is loaded from the current working directory
const extensionDir = process.cwd();

console.log(`\n📦 Starting Flux Sandbox for extension in ${extensionDir}`);

const builder = spawn('flux-build', ['--watch'], {
  stdio: 'inherit',
  cwd: extensionDir,
  shell: true
});
builder.on('error', (err) => {
  console.error('[Sandbox] Failed to start flux-build:', err);
});

startServer(port, extensionDir).catch((err) => {
  console.error("Failed to start sandbox server:", err);
  builder.kill();
  process.exit(1);
});

process.on('SIGINT', () => {
  builder.kill();
  process.exit(0);
});
process.on('SIGTERM', () => {
  builder.kill();
  process.exit(0);
});
