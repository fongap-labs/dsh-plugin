#!/usr/bin/env node
/**
 * Bundle 校验与打包脚本。
 *
 * 用法：
 *   node scripts/pack-bundles.mjs            校验所有 Bundle 并把通过者打包为 dist/*.zip
 *   node scripts/pack-bundles.mjs --check    仅校验（构建/CI 用），有错误时退出码 1
 *
 * 校验规则对应 DSH Profile Bundle 规范：package.json 需声明 dsh.bundle.patch，
 * 该 patch 文件、locale/*.json（含 meta.title / meta.description）、icon.svg（≤ 256 KiB）
 * 以及 ESM 入口都必须存在。
 */

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = join(ROOT, "packages");
const DIST_DIR = join(ROOT, "dist");
const MAX_ICON_BYTES = 256 * 1024;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i += 1) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
    const data = entry.data;
    const crc = crc32(data);
    const { time, date } = dosDateTime(entry.mtime ?? new Date());
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    chunks.push(header, nameBytes, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBytes]));
    offset += header.length + nameBytes.length + data.length;
  }
  const centralData = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralData.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralData, eocd]);
}

function walkFiles(dir, recursive, predicate) {
  const out = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive && entry.name !== "node_modules") visit(full);
        continue;
      }
      if (entry.isFile() && (!predicate || predicate(entry.name))) out.push(full);
    }
  };
  visit(dir);
  return out;
}

function expandFilesList(dir, patterns) {
  const files = new Set();
  for (const pattern of patterns) {
    if (pattern.includes("**")) {
      const [base, rest] = pattern.split("**");
      const baseDir = join(dir, base.replace(/\/$/, ""));
      if (!existsSync(baseDir)) continue;
      const suffix = (rest ?? "").replace(/^\//, "");
      const extension = suffix.startsWith("*") ? suffix.slice(1) : null;
      for (const file of walkFiles(baseDir, true, (name) => (extension ? name.endsWith(extension) : true))) {
        files.add(relative(dir, file));
      }
      continue;
    }
    if (pattern.endsWith("*")) {
      const baseDir = join(dir, pattern.slice(0, -1).replace(/\/$/, ""));
      if (!existsSync(baseDir)) continue;
      const extension = pattern.slice(pattern.lastIndexOf("*") + 1);
      for (const file of walkFiles(baseDir, false, (name) => (extension ? name.endsWith(extension) : true))) {
        files.add(relative(dir, file));
      }
      continue;
    }
    const single = join(dir, pattern);
    if (existsSync(single) && statSync(single).isFile()) files.add(pattern);
  }
  return [...files].sort();
}

/** Resolve the runtime entry declared by a package manifest. */
function resolveEntry(manifest) {
  const root = manifest?.exports?.["."];
  if (typeof root === "string") return root;
  if (root && typeof root === "object") {
    for (const condition of ["default", "import", "require"]) {
      if (typeof root[condition] === "string") return root[condition];
    }
  }
  return typeof manifest?.main === "string" ? manifest.main : "";
}

function validateBundle(dir) {
  const errors = [];
  const warnings = [];
  const manifestPath = join(dir, "package.json");
  if (!existsSync(manifestPath)) {
    errors.push("缺少 package.json");
    return { errors, warnings, manifest: null };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    errors.push(`package.json 不是合法 JSON: ${error.message}`);
    return { errors, warnings, manifest: null };
  }
  if (typeof manifest.name !== "string" || manifest.name.trim() === "") errors.push("package.json 缺少 name");
  if (typeof manifest.version !== "string" || manifest.version.trim() === "") errors.push("package.json 缺少 version");
  if (manifest.type !== "module") errors.push('package.json 需声明 "type": "module"');

  const patchRel = manifest?.dsh?.bundle?.patch;
  // 内部共享库（如 @dsh-plugin/shared）不声明 dsh.bundle.patch，跳过 Bundle 校验
  if (typeof patchRel !== "string" || patchRel.trim() === "") {
    return { errors, warnings, manifest };
  }

  if (!existsSync(join(dir, patchRel))) {
    errors.push(`dsh.bundle.patch 指向的文件不存在: ${patchRel}`);
  }

  const entryRel = resolveEntry(manifest);
  if (typeof entryRel !== "string" || entryRel.trim() === "") {
    errors.push('package.json must declare exports["."] or main');
  } else if (/\.(ts|mts|cts)$/.test(entryRel)) {
    // A bundle must ship executable JavaScript: the DSH host does not compile TypeScript.
    errors.push(`entry must be executable JavaScript, not TypeScript source: ${entryRel}`);
  } else {
    const entryFile = join(dir, entryRel);
    if (!existsSync(entryFile)) {
      errors.push(`入口文件不存在: ${entryRel}`);
    } else {
      const source = readFileSync(entryFile, "utf8");
      const hasApply = /export\s+(async\s+)?function\s+apply|export\s*\{[^}]*apply/.test(source);
      const hasInject = /export\s+const\s+inject/.test(source);
      if (!hasApply) errors.push(`入口文件需导出 apply(ctx, config): ${entryRel}`);
      if (!hasInject) warnings.push(`入口文件未显式声明 export const inject: ${entryRel}`);
    }
  }

  for (const localeName of ["en.json", "zh.json"]) {
    const localePath = join(dir, "locale", localeName);
    if (!existsSync(localePath)) {
      errors.push(`缺少 locale/${localeName}`);
      continue;
    }
    try {
      const locale = JSON.parse(readFileSync(localePath, "utf8"));
      const title = locale?.meta?.title;
      const description = locale?.meta?.description;
      if (typeof title !== "string" || title.trim() === "") errors.push(`locale/${localeName} 缺少 meta.title`);
      if (typeof description !== "string" || description.trim() === "") errors.push(`locale/${localeName} 缺少 meta.description`);
    } catch (error) {
      errors.push(`locale/${localeName} 不是合法 JSON: ${error.message}`);
    }
  }

  const iconPath = join(dir, "icon.svg");
  if (!existsSync(iconPath)) {
    errors.push("缺少 icon.svg");
  } else if (statSync(iconPath).size > MAX_ICON_BYTES) {
    errors.push(`icon.svg 超过 256 KiB 上限 (${statSync(iconPath).size} bytes)`);
  }

  if (manifest.name && dir.split(/[\\/]/).pop() !== manifest.name.split("/").pop()) {
    warnings.push(`目录名与包名后缀不一致: ${dir.split(/[\\/]/).pop()} vs ${manifest.name}`);
  }
  return { errors, warnings, manifest };
}

function zipBundle(dir, manifest) {
  const patterns = Array.isArray(manifest.files) && manifest.files.length > 0
    ? manifest.files
    : ["lib/**/*.js", "lib/**/*.d.ts", "cordis.patch.yml", "locale/*.json", "icon.svg", "README.md"];
  const files = expandFilesList(dir, patterns);
  if (files.length === 0) throw new Error("没有可打包的文件");
  const entries = files.map((rel) => {
    const full = join(dir, rel);
    return { name: rel, data: readFileSync(full), mtime: statSync(full).mtime };
  });
  const zip = buildZip(entries);
  const safeName = manifest.name.replace(/^@/, "").replaceAll("/", "-");
  const filename = `${safeName}-${manifest.version}.zip`;
  if (!existsSync(DIST_DIR)) mkdirSync(DIST_DIR, { recursive: true });
  const target = join(DIST_DIR, filename);
  writeFileSync(target, zip);
  return { target, entries: files };
}

function main() {
  const checkOnly = process.argv.includes("--check");
  if (!existsSync(PACKAGES_DIR)) {
    console.error(`pack-bundles: 目录不存在: ${PACKAGES_DIR}`);
    process.exit(1);
  }
  const dirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PACKAGES_DIR, entry.name))
    .filter((dir) => existsSync(join(dir, "package.json")));

  if (dirs.length === 0) {
    console.error(`pack-bundles: packages/ 下没有可校验的插件包`);
    process.exit(1);
  }

  let errorCount = 0;
  const packed = [];
  for (const dir of dirs) {
    const label = relative(ROOT, dir);
    const { errors, warnings, manifest } = validateBundle(dir);
    for (const warning of warnings) console.warn(`[warn] ${label}: ${warning}`);
    if (errors.length > 0) {
      errorCount += errors.length;
      for (const error of errors) console.error(`[error] ${label}: ${error}`);
      continue;
    }
    console.log(`[ok] ${label}: ${manifest.name}@${manifest.version}`);
    if (!checkOnly) {
      try {
        const { target, entries } = zipBundle(dir, manifest);
        console.log(`       -> ${relative(ROOT, target)} (${entries.length} 个文件)`);
        packed.push(target);
      } catch (error) {
        errorCount += 1;
        console.error(`[error] ${label}: 打包失败: ${error.message}`);
      }
    }
  }

  if (errorCount > 0) {
    console.error(`pack-bundles: ${errorCount} 个错误`);
    process.exit(1);
  }
  console.log(checkOnly ? "pack-bundles: 校验通过" : `pack-bundles: 已输出 ${packed.length} 个 zip 到 dist/`);
}

main();
