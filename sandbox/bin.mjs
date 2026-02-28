#!/usr/bin/env node
import { startServer } from './server.mjs';
import { resolve } from 'path';

// Parse args
const args = process.argv.slice(2);
const portParam = args.findIndex(arg => arg === '--port' || arg === '-p');
const port = portParam !== -1 ? parseInt(args[portParam + 1], 10) : 3000;

// The extension is loaded from the current working directory
const extensionDir = process.cwd();

console.log(`\n📦 Starting Flux Sandbox for extension in ${extensionDir}`);
startServer(port, extensionDir).catch((err) => {
  console.error("Failed to start sandbox server:", err);
  process.exit(1);
});
