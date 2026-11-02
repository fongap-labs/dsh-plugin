/**
 * Release manifest contract tests.
 *
 * These mirror the checks Action Worker applies while it resolves a release build, so a manifest
 * that would fail the release pipeline fails `pnpm test` first. The checks are intentionally a
 * local copy of the contract in `action-worker/contracts/release-build.json`: the release build is
 * the only place a broken manifest shows up otherwise, and that run is slow and remote.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { resolveBundleFiles } from "../scripts/pack-bundles.mjs";

const repoRoot = join(import.meta.dirname, "..");
const projectsDir = join(repoRoot, "projects");

const MANIFEST_KEYS = new Set([
  "artifact_name",
  "builds",
  "license_expression",
  "node_version_file",
  "python_version_file",
  "release_key",
  "release_name",
  "release_notes",
  "root",
  "sbom_asset",
  "schema_version",
  "target_repository",
]);
const MANIFEST_REQUIRED_KEYS = [...MANIFEST_KEYS].filter((key) => key !== "root");
const BUILD_KEYS = new Set(["assets", "attest_asset", "id", "runner_profile", "script", "target"]);

const PRODUCT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RELEASE_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BUILD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUNNER_PROFILE = /^[a-z][a-z0-9-]{0,63}$/;
const RELATIVE_PATH = /^(?:(?!.*\.\.)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)?$/;
// rustup target triples: <arch>-<vendor>-<os>[-<env>]. Action Worker passes this value straight to
// `rustup toolchain install --target`, so any other spelling fails the release build before the
// repository build script even starts.
const RUSTUP_TARGET = /^(?:x86_64|aarch64|i686)-[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)?$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// pack-bundles.mjs strips the npm scope and turns '/' into '-' to name the packed zip.
function safeNameOf(packageName) {
  return packageName.replace(/^@/, "").replaceAll("/", "-");
}

const products = readdirSync(projectsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => PRODUCT_NAME.test(name))
  .map((name) => {
    const directory = join(projectsDir, name);
    const manifestPath = join(directory, "release.manifest.json");
    return { name, directory, manifestPath, manifest: existsSync(manifestPath) ? readJson(manifestPath) : null };
  })
  .filter((product) => product.manifest !== null);

describe("release manifests", () => {
  it("uses the projects layout only", () => {
    assert.equal(
      existsSync(join(repoRoot, ".github", "release.manifest.json")),
      false,
      "a root manifest next to projects/ is rejected: keep only one layout"
    );
  });

  it("declares a manifest for every publishable product", () => {
    assert.ok(products.length >= 1, "expected at least one projects/<name>/release.manifest.json");
  });

  it("keeps every product directory name valid", () => {
    for (const product of products) {
      assert.match(product.name, PRODUCT_NAME, `product directory name is invalid: ${product.name}`);
    }
  });

  it("satisfies the release build manifest contract", () => {
    for (const { name, manifest } of products) {
      const label = `projects/${name}/release.manifest.json`;
      assert.equal(typeof manifest, "object", `${label} must hold a JSON object`);
      assert.equal(manifest.schema_version, 1, `${label} schema_version must be 1`);
      for (const key of MANIFEST_REQUIRED_KEYS) {
        assert.ok(Object.hasOwn(manifest, key), `${label} is missing ${key}`);
      }
      for (const key of Object.keys(manifest)) {
        assert.ok(MANIFEST_KEYS.has(key), `${label} has an unknown key: ${key}`);
      }
      // A product under projects/ must declare a non-empty, repository-relative build root.
      assert.equal(typeof manifest.root, "string", `${label} root must be a string`);
      assert.ok(manifest.root !== "", `${label} root must be non-empty in the projects layout`);
      assert.match(manifest.root, RELATIVE_PATH, `${label} root must be a relative repository path`);
      assert.match(manifest.artifact_name, ASSET_NAME, `${label} artifact_name is invalid`);
      assert.match(manifest.target_repository, REPOSITORY, `${label} target_repository is invalid`);
      assert.match(manifest.release_key, RELEASE_KEY, `${label} release_key is invalid`);
      assert.equal(typeof manifest.release_name, "string", `${label} release_name must be a string`);
      assert.ok(manifest.release_name.length >= 1, `${label} release_name must not be empty`);
      assert.equal(typeof manifest.release_notes, "string", `${label} release_notes must be a string`);
      assert.ok(manifest.release_notes.length <= 20000, `${label} release_notes is too long`);
      assert.ok(
        typeof manifest.license_expression === "string" && manifest.license_expression.length >= 1,
        `${label} license_expression must not be empty`
      );
      assert.match(manifest.node_version_file, RELATIVE_PATH, `${label} node_version_file is invalid`);
      assert.match(manifest.python_version_file, RELATIVE_PATH, `${label} python_version_file is invalid`);
      assert.match(manifest.sbom_asset, ASSET_NAME, `${label} sbom_asset is invalid`);
      assert.ok(Array.isArray(manifest.builds), `${label} builds must be an array`);
      assert.ok(
        manifest.builds.length >= 1 && manifest.builds.length <= 32,
        `${label} builds must hold 1 to 32 entries`
      );
    }
  });

  it("declares build entries with a rustup target, an existing script and a valid asset set", () => {
    for (const { name, manifest } of products) {
      const label = `projects/${name}/release.manifest.json`;
      const ids = new Set();
      const assets = new Set();
      for (const build of manifest.builds) {
        assert.equal(typeof build, "object", `${label} build entry must be an object`);
        for (const key of BUILD_KEYS) {
          assert.ok(Object.hasOwn(build, key), `${label} build entry is missing ${key}`);
        }
        for (const key of Object.keys(build)) {
          assert.ok(BUILD_KEYS.has(key), `${label} build entry has an unknown key: ${key}`);
        }
        assert.match(build.id, BUILD_ID, `${label} build id is invalid: ${build.id}`);
        assert.ok(!ids.has(build.id), `${label} has a duplicate build id: ${build.id}`);
        ids.add(build.id);
        assert.match(
          build.runner_profile,
          RUNNER_PROFILE,
          `${label} runner_profile is invalid: ${build.runner_profile}`
        );
        assert.match(
          build.target,
          RUSTUP_TARGET,
          `${label} target must be a rustup target triple such as x86_64-pc-windows-msvc, got: ${build.target}`
        );
        assert.match(build.script, RELATIVE_PATH, `${label} script must be a relative path`);
        assert.ok(build.script.endsWith(".ps1"), `${label} script must end with .ps1: ${build.script}`);
        // Action Worker joins the manifest root with the script path and requires the file.
        const scriptPath = join(repoRoot, manifest.root, build.script);
        assert.ok(existsSync(scriptPath), `${label} script does not exist: ${manifest.root}/${build.script}`);
        assert.ok(Array.isArray(build.assets) && build.assets.length >= 1, `${label} assets must not be empty`);
        for (const asset of build.assets) {
          assert.match(asset, ASSET_NAME, `${label} asset name is invalid: ${asset}`);
          assert.ok(!assets.has(asset), `${label} has a duplicate asset name: ${asset}`);
          assets.add(asset);
        }
        assert.match(build.attest_asset, ASSET_NAME, `${label} attest_asset is invalid`);
        assert.ok(
          build.assets.includes(build.attest_asset),
          `${label} attest_asset must be one of the declared assets: ${build.attest_asset}`
        );
      }
      assert.ok(
        !assets.has(manifest.sbom_asset),
        `${label} sbom_asset must not reuse a build asset name: ${manifest.sbom_asset}`
      );
    }
  });

  it("declares assets that match the packed bundle and tarball names", () => {
    for (const { name, manifest } of products) {
      const label = `projects/${name}/release.manifest.json`;
      const packageJsonPath = join(repoRoot, manifest.root, name, "package.json");
      assert.ok(
        existsSync(packageJsonPath),
        `${label} expects a package at ${manifest.root}/${name}/package.json`
      );
      const packageJson = readJson(packageJsonPath);
      // The build script copies the packed zip to <safe-name>.zip and the tarball to <safe-name>.tgz,
      // so the declared assets must match both.
      const safe = safeNameOf(packageJson.name);
      const expected = [`${safe}.zip`, `${safe}.tgz`];
      const declared = manifest.builds.flatMap((build) => build.assets);
      assert.deepEqual(declared, expected, `${label} assets must be exactly ${JSON.stringify(expected)}`);
    }
  });

  it("delegates each build script to the generic release build", () => {
    for (const { name, manifest } of products) {
      for (const build of manifest.builds) {
        const text = readFileSync(join(repoRoot, manifest.root, build.script), "utf8");
        assert.ok(
          text.includes(`-Package ${name}`),
          `projects/${name}: ${build.script} must call the generic script with -Package ${name}`
        );
      }
    }
  });

  it("declares unique release keys, artifact names and assets across products", () => {
    const seen = new Map();
    for (const { name, manifest } of products) {
      const entries = [
        ["release_key", manifest.release_key],
        ["artifact_name", manifest.artifact_name],
        ...manifest.builds.flatMap((build) => build.assets.map((asset) => ["asset", asset])),
      ];
      for (const [kind, value] of entries) {
        const key = `${kind}:${value}`;
        assert.ok(
          !seen.has(key),
          `${kind} is declared by both ${seen.get(key)} and ${name}: ${value}`
        );
        seen.set(key, name);
      }
    }
  });

  it("allows package-specific licenses and aligns package, release, and distributed metadata", () => {
    const defaultLicense = readJson(join(repoRoot, "package.json")).license;
    const defaultLicenseText = readFileSync(join(repoRoot, "LICENSE"), "utf8");
    assert.equal(defaultLicense, "Apache-2.0");
    assert.match(defaultLicenseText, /Apache License\\s+Version 2\\.0/);

    const packagesDir = join(repoRoot, "packages");
    const packageManifests = new Map();
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(packagesDir, entry.name);
      const manifestPath = join(dir, "package.json");
      if (!existsSync(manifestPath)) continue;

      const pkg = readJson(manifestPath);
      assert.equal(typeof pkg.license, "string", `${entry.name}: package license must be explicit`);
      assert.match(
        pkg.license,
        /^[A-Za-z0-9][A-Za-z0-9.+() -]*$/,
        `${entry.name}: package license must be a valid SPDX-style expression`
      );

      const licensePath = join(dir, "LICENSE");
      assert.ok(existsSync(licensePath), `${entry.name}: package-specific LICENSE file is required`);
      const licenseText = readFileSync(licensePath, "utf8");
      assert.ok(licenseText.trim().length > 0, `${entry.name}: LICENSE must not be empty`);
      if (pkg.license === defaultLicense) {
        assert.equal(licenseText, defaultLicenseText, `${entry.name}: default license text must match root`);
      }
      if (pkg.dsh?.bundle?.patch) {
        assert.ok(
          resolveBundleFiles(dir, pkg).includes("LICENSE"),
          `${entry.name}: packaged bundle must contain its own LICENSE`
        );
      }
      packageManifests.set(entry.name, pkg);
    }

    for (const { name, manifest } of products) {
      const pkg = packageManifests.get(name);
      assert.ok(pkg, `${name}: release product must have a package manifest`);
      assert.equal(
        manifest.license_expression,
        pkg.license,
        `${name}: release license must match its package license, not the repository default`
      );
    }
  });

  it("packs package.json so the release version reaches the artifact", () => {
    for (const { name, manifest } of products) {
      const dir = join(repoRoot, manifest.root, name);
      const files = resolveBundleFiles(dir, readJson(join(dir, "package.json")));
      // The release build injects the version into package.json before packing; if package.json is
      // not inside the zip, the published artifact carries no version at all.
      assert.ok(files.includes("package.json"), `${name}: the bundle must contain package.json`);
      assert.ok(
        files.includes("cordis.patch.yml"),
        `${name}: the bundle must contain cordis.patch.yml`
      );
      // lib/ is generated by `pnpm build` and is not checked in, so only assert it when present.
      if (existsSync(join(dir, "lib"))) {
        assert.ok(
          files.some((file) => file.startsWith("lib/")),
          `${name}: the bundle must contain compiled lib/ output`
        );
      }
      // `locale/*.json` is a single-segment glob; it must resolve or the bundle ships without i18n.
      if (existsSync(join(dir, "locale"))) {
        assert.ok(
          files.some((file) => file.startsWith("locale/")),
          `${name}: the bundle must contain locale/*.json`
        );
      }
    }
  });

  it("pins Node in a plain ASCII version file", () => {
    for (const { name, manifest } of products) {
      const label = `projects/${name}/release.manifest.json`;
      assert.notEqual(manifest.node_version_file, "", `${label} must pin Node in node_version_file`);
      const versionPath = join(repoRoot, manifest.root, manifest.node_version_file);
      assert.ok(existsSync(versionPath), `${label} node_version_file does not exist: ${versionPath}`);
      const bytes = readFileSync(versionPath);
      // actions/setup-node reads the file as UTF-8 text. A UTF-16 BOM or NUL byte becomes part of
      // the version string and Node resolution fails with an unreadable version.
      assert.ok(!(bytes[0] === 0xff && bytes[1] === 0xfe), `${label} node_version_file is UTF-16LE`);
      assert.ok(!(bytes[0] === 0xfe && bytes[1] === 0xff), `${label} node_version_file is UTF-16BE`);
      assert.ok(
        !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf),
        `${label} node_version_file has a UTF-8 BOM`
      );
      assert.ok(!bytes.includes(0), `${label} node_version_file contains a NUL byte`);
      const text = bytes.toString("utf8").trim();
      assert.match(text, /^\d+(?:\.\d+){0,2}$/, `${label} node_version_file must hold a version: ${text}`);
    }
  });
  it("enforces valid dsh.client manifest for all packages with client assets", () => {
    const packagesDir = join(repoRoot, "packages");
    const dirs = readdirSync(packagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    for (const pkg of dirs) {
      const dir = join(packagesDir, pkg);
      const manifestPath = join(dir, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = readJson(manifestPath);
      const hasClient =
        existsSync(join(dir, "src/client.ts")) ||
        existsSync(join(dir, "lib/client.js")) ||
        Boolean(manifest?.exports?.["./client"]) ||
        Boolean(manifest?.dsh?.client);
      if (hasClient) {
        assert.equal(typeof manifest?.dsh?.client, "object", `${pkg} must declare dsh.client object`);
        assert.equal(manifest.dsh.client.platform, "web", `${pkg} dsh.client.platform must be web`);
        assert.ok(manifest.exports?.["./client"], `${pkg} must declare exports["./client"]`);
      }
    }
  });

  it("enforces bundleDependencies for packages depending on internal workspace packages", () => {
    const packagesDir = join(repoRoot, "packages");
    const dirs = readdirSync(packagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    for (const pkg of dirs) {
      const dir = join(packagesDir, pkg);
      const manifestPath = join(dir, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = readJson(manifestPath);
      const deps = manifest.dependencies ? Object.keys(manifest.dependencies) : [];
      const internalDeps = deps.filter((dep) => dep.startsWith("@fongap-labs/"));
      if (internalDeps.length > 0) {
        const bundled = manifest.bundleDependencies || manifest.bundledDependencies || [];
        for (const dep of internalDeps) {
          assert.ok(
            bundled.includes(dep),
            `${pkg} depends on internal ${dep} but does not declare it in bundleDependencies`
          );
        }
      }
    }
  });
});
