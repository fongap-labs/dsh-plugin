#!/usr/bin/env node
/**
 * 将指定插件链接到本机 DSH Profile 的插件目录，供实时联调。
 *
 * 用法：
 *   node scripts/link-profile.mjs <plugin-name> [--profile <name>] [--unlink] [--install]
 *
 * 说明：
 * - 默认走软链接（零拷贝、实时生效），并把包名追加到 profile 的 dsh.profile.bundles。
 * - `--install` 走 DSH 官方通道：优先调用 `dsh plugin --profile <name> add link:<abs>`，
 *   等价于 plugin_manager.install_bundle；dsh 不可用时回退到本地 pnpm add。
 * - `--unlink` 移除链接并从 dsh.profile.bundles 中摘除该包。
 */

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = join(ROOT, "packages");

function fail(message) {
  console.error(`link-profile: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { names: [], profile: process.env.DSH_PROFILE || "desktop", unlink: false, install: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--profile") {
      options.profile = argv[++i];
      if (!options.profile) fail("--profile requires a value");
    } else if (arg === "--unlink") {
      options.unlink = true;
    } else if (arg === "--install") {
      options.install = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--")) {
      fail(`unknown option ${arg}`);
    } else {
      options.names.push(arg);
    }
  }
  return options;
}

function resolveDshHome() {
  const configured = process.env.DSH_HOME;
  if (typeof configured === "string" && configured.trim() !== "") return resolve(configured.trim());
  return join(homedir(), ".dsh");
}

function resolveProfileDir(profile) {
  return join(resolveDshHome(), "profiles", profile);
}

function discoverPackages() {
  if (!existsSync(PACKAGES_DIR)) return [];
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PACKAGES_DIR, entry.name))
    .filter((dir) => existsSync(join(dir, "package.json")))
    .map((dir) => {
      const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      return { dir, name: manifest.name, version: manifest.version, private: manifest.private === true };
    });
}

function matchPackage(packages, needle) {
  const exact = packages.find((p) => p.name === needle);
  if (exact) return exact;
  const byDir = packages.find((p) => p.dir.endsWith(`${delimiter}${needle}`) || p.dir.endsWith(`/${needle}`));
  if (byDir) return byDir;
  const bySuffix = packages.find((p) => p.name.endsWith(`/${needle}`) || p.name.endsWith(`-${needle}`));
  if (bySuffix) return bySuffix;
  return undefined;
}

function readProfileManifest(profileDir) {
  const manifestPath = join(profileDir, "package.json");
  if (!existsSync(manifestPath)) {
    fail(`profile manifest not found: ${manifestPath}`);
  }
  return { manifestPath, manifest: JSON.parse(readFileSync(manifestPath, "utf8")) };
}

function writeProfileManifest(manifestPath, manifest) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`, "utf8");
}

function setBundleEnabled(manifest, packageName, enabled) {
  const bundles = Array.isArray(manifest?.dsh?.profile?.bundles) ? [...manifest.dsh.profile.bundles] : [];
  const index = bundles.indexOf(packageName);
  if (enabled && index === -1) bundles.push(packageName);
  if (!enabled && index !== -1) bundles.splice(index, 1);
  manifest.dsh = {
    ...manifest.dsh,
    profile: { ...manifest.dsh?.profile, bundles },
  };
  return manifest;
}

function profileModulesDir(profileDir) {
  return join(profileDir, "node_modules");
}

function linkTarget(profileDir, packageName) {
  const parts = packageName.split("/");
  return parts.length > 1
    ? join(profileModulesDir(profileDir), ...parts)
    : join(profileModulesDir(profileDir), packageName);
}

function removeLink(target) {
  if (!existsSync(target) && !isSymlink(target)) return false;
  const stat = lstatSync(target);
  if (stat.isSymbolicLink()) {
    unlinkSync(target);
    return true;
  }
  if (stat.isDirectory()) {
    rmSync(target, { recursive: true, force: true });
    return true;
  }
  rmSync(target, { force: true });
  return true;
}

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  return result.status === 0;
}

function hasDshCli() {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", ["dsh"], { stdio: "ignore" });
  return probe.status === 0;
}

function linkPackage(pkg, profileDir) {
  const target = linkTarget(profileDir, pkg.name);
  removeLink(target);
  const modules = profileModulesDir(profileDir);
  if (!existsSync(modules)) {
    console.error(`link-profile: profile node_modules not found: ${modules}`);
    console.error("link-profile: 请先在 DSH 中创建或初始化该 Profile。");
    process.exit(1);
  }
  if (pkg.name.includes("/")) {
    const scopeDir = join(modules, pkg.name.split("/")[0]);
    if (!existsSync(scopeDir)) {
      const result = spawnSync(process.platform === "win32" ? "cmd" : "mkdir", process.platform === "win32" ? ["/c", "mkdir", scopeDir] : ["-p", scopeDir], { stdio: "ignore" });
      if (result.status !== 0) fail(`failed to create scope directory: ${scopeDir}`);
    }
  }
  symlinkSync(realpathSync(pkg.dir), target, process.platform === "win32" ? "junction" : "dir");
  console.log(`linked ${pkg.name} -> ${pkg.dir}`);
  console.log(`        ${target}`);
}

function unlinkPackage(pkg, profileDir) {
  const target = linkTarget(profileDir, pkg.name);
  const removed = removeLink(target);
  console.log(removed ? `unlinked ${pkg.name}` : `${pkg.name} was not linked`);
}

function installViaDshCli(pkg, profile) {
  const spec = `link:${pkg.dir}`;
  console.log(`install_bundle: dsh plugin --profile ${profile} add ${spec}`);
  return run("dsh", ["plugin", "--profile", profile, "add", spec], ROOT);
}

function installViaPnpm(pkg, profileDir) {
  console.log(`install_bundle: pnpm add link:${pkg.dir} (in ${profileDir})`);
  return run("pnpm", ["add", `link:${pkg.dir}`], profileDir);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || options.names.length === 0) {
    console.log(
      [
        "Usage: node scripts/link-profile.mjs <plugin-name> [--profile <name>] [--unlink] [--install]",
        "",
        "  <plugin-name>   插件包名或 packages/ 下的目录名，例如 dsh-code-worker 或 dsh-ui-delta",
        "  --profile       DSH Profile 名称，默认取 $DSH_PROFILE 或 desktop",
        "  --install       走 DSH 官方安装通道（等价 plugin_manager.install_bundle）",
        "  --unlink        移除链接并从 dsh.profile.bundles 摘除",
      ].join("\n"),
    );
    if (options.names.length === 0 && !options.help) process.exit(1);
    return;
  }

  const packages = discoverPackages();
  const profileDir = resolveProfileDir(options.profile);
  if (!existsSync(profileDir)) {
    fail(`profile directory not found: ${profileDir}`);
  }

  for (const needle of options.names) {
    const pkg = matchPackage(packages, needle);
    if (!pkg) {
      fail(`plugin not found in packages/: ${needle}`);
    }

    const { manifestPath, manifest } = readProfileManifest(profileDir);

    if (options.unlink) {
      unlinkPackage(pkg, profileDir);
      writeProfileManifest(manifestPath, setBundleEnabled(manifest, pkg.name, false));
      console.log(`removed ${pkg.name} from dsh.profile.bundles`);
      continue;
    }

    if (options.install) {
      const installed = hasDshCli()
        ? installViaDshCli(pkg, options.profile)
        : installViaPnpm(pkg, profileDir);
      if (!installed) {
        fail(`install failed for ${pkg.name}`);
      }
      writeProfileManifest(manifestPath, setBundleEnabled(manifest, pkg.name, true));
      console.log(`enabled ${pkg.name} in dsh.profile.bundles`);
      continue;
    }

    linkPackage(pkg, profileDir);
    writeProfileManifest(manifestPath, setBundleEnabled(manifest, pkg.name, true));
    console.log(`enabled ${pkg.name} in dsh.profile.bundles`);
  }

  console.log(`profile: ${profileDir}`);
  console.log("提示：重启或热重载 DSH 后插件生效；未生效时检查 profile 的 cordis.patch.yml 是否有 id 冲突。");
}

main();
