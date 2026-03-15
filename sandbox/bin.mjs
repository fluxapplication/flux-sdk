#!/usr/bin/env node
import { startServer } from './server.mjs';
import { spawn, execSync } from 'child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Parse args
const args = process.argv.slice(2);
const portParam = args.findIndex(arg => arg === '--port' || arg === '-p');
const port = portParam !== -1 ? parseInt(args[portParam + 1], 10) : 3000;

// The extension is loaded from the current working directory
const extensionDir = process.cwd();

console.log(`\n📦 Starting Flux Sandbox for extension in ${extensionDir}`);

// Check if Vite build exists
const viteDist = join(__dirname, 'dist', 'index.html');
if (!existsSync(viteDist)) {
  console.log('[Sandbox] Building Vite app...');
  execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
}

// Start flux-build watch for the extension
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
