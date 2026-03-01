#!/usr/bin/env node
/**
 * Global build script for Flux extensions.
 *
 *   flux-build          — build
 *   flux-build --pack   — build + dist/bundle.zip
 *   flux-build --watch  — watch for changes and rebuild
 */

import * as esbuild from "esbuild"
import {
  cpSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs"
import { execSync } from "node:child_process"
import { join, basename } from "node:path"
import { deflateSync } from "node:zlib"

const dir = process.cwd()
const doPack = process.argv.includes("--pack")
const doWatch = process.argv.includes("--watch")
const name = basename(dir)

const generateIcon = (outputPath, r = 139, g = 92, b = 246, size = 64) => {
  const crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c
  }
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const pngChunk = (type, data) => {
    const typeBuf = Buffer.from(type, "ascii")
    const lenBuf = Buffer.alloc(4)
    lenBuf.writeUInt32BE(data.length)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.alloc(1 + size * 3)
  row[0] = 0
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r
    row[2 + x * 3] = g
    row[3 + x * 3] = b
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  const png = Buffer.concat([
    Buffer.from("\x89PNG\r\n\x1a\n", "binary"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
  writeFileSync(outputPath, png)
}

const distDir = join(dir, "dist")
mkdirSync(distDir, { recursive: true })

const uiFile = join(dir, "ui.tsx")
const renderersFile = join(dir, "renderers.ts")
const commandsFile = join(dir, "commands.ts")
const backendFile = join(dir, "backend.ts")
const manifestFile = join(dir, "manifest.json")
const iconSrc = join(dir, "icon.png")
const iconDest = join(distDir, "icon.png")

console.log(`\n◆ Building ${name}…`)

const entryParts = []
if (existsSync(uiFile)) entryParts.push(`export * from './ui.tsx'`)
if (existsSync(renderersFile)) entryParts.push(`export { messageRenderers } from './renderers.ts'`)
if (existsSync(commandsFile)) entryParts.push(`export { commands, contextMenuItems } from './commands.ts'`)

async function run() {
  let uiCtx;
  if (entryParts.length > 0) {
    const options = {
      stdin: { contents: entryParts.join("\n"), resolveDir: dir, loader: "ts" },
      bundle: true,
      minify: !doWatch,
      format: "iife",
      globalName: "__FluxExtension__",
      external: ["react", "react-dom", "lucide-react"],
      outfile: join(distDir, "bundle.js"),
      jsx: "automatic",
      jsxImportSource: "react",
      resolveExtensions: [".tsx", ".ts", ".jsx", ".js"],
      logLevel: doWatch ? 'info' : 'warning'
    };
    
    if (doWatch) {
      uiCtx = await esbuild.context(options);
      await uiCtx.watch();
      console.log("  ✓ bundle.js (watching)");
    } else {
      await esbuild.build(options);
      console.log("  ✓ bundle.js");
    }
  } else {
    writeFileSync(join(distDir, "bundle.js"), "")
    console.log("  ✓ bundle.js (empty)")
  }

  let backendCtx;
  if (existsSync(backendFile)) {
    const options = {
      entryPoints: [backendFile],
      bundle: true,
      minify: !doWatch,
      format: "cjs",
      platform: "node",
      external: ["flux-sdk"],
      outfile: join(distDir, "backend.js"),
      resolveExtensions: [".tsx", ".ts", ".jsx", ".js"],
      logLevel: doWatch ? 'info' : 'warning'
    };
    
    if (doWatch) {
      backendCtx = await esbuild.context(options);
      await backendCtx.watch();
      console.log("  ✓ backend.js (watching)");
    } else {
      await esbuild.build(options);
      console.log("  ✓ backend.js");
    }
  }

  if (existsSync(manifestFile)) {
    cpSync(manifestFile, join(distDir, "manifest.json"))
    console.log("  ✓ manifest.json")
  }

  if (existsSync(iconSrc)) {
    cpSync(iconSrc, iconDest)
    console.log("  ✓ icon.png")
  } else {
    generateIcon(iconDest)
    console.log("  ✓ icon.png (generated)")
  }

  if (doPack) {
    const zipFile = join(distDir, "bundle.zip")
    if (existsSync(zipFile)) rmSync(zipFile)
    const hasBackend = existsSync(backendFile)
    const files = ["bundle.js", hasBackend && "backend.js", "manifest.json", "icon.png"].filter(Boolean).join(" ")
    execSync(`zip -j bundle.zip ${files}`, { cwd: distDir })
    const kb = (readFileSync(zipFile).byteLength / 1024).toFixed(1)
    console.log(`  ✓ bundle.zip (${kb} KB)`)
  }

  if (!doWatch) {
    console.log(`  ✓ ${name} done\n`)
  } else {
    console.log(`  ✓ ${name} watching for changes...\n`)
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
