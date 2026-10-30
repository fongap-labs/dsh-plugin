/**
 * 共享库聚合出口：路径解析与沙箱校验，以及 tool / subprocess 模块的再导出。
 */

import { isAbsolute, relative, resolve, sep } from "node:path";

export * from "./tool.js";
export * from "./subprocess.js";

export class SandboxViolationError extends Error {
  constructor(message, { root, target } = {}) {
    super(message);
    this.name = "SandboxViolationError";
    this.root = root;
    this.target = target;
  }
}

/**
 * 规范化路径分隔符并去除结尾分隔符，便于跨平台比较。
 */
export function normalizePath(input) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new TypeError("normalizePath: path must be a non-empty string");
  }
  const trimmed = input.replace(/[\\/]+$/, "");
  return trimmed === "" ? input : trimmed;
}

/**
 * 判断 target 是否位于 root 之内（含 root 自身）。不解析符号链接。
 */
export function isPathInside(root, target) {
  if (typeof root !== "string" || typeof target !== "string") return false;
  const absoluteRoot = resolve(root);
  const absoluteTarget = resolve(absoluteRoot, target);
  const rel = relative(absoluteRoot, absoluteTarget);
  if (rel === "") return true;
  if (isAbsolute(rel)) return false;
  return !rel.startsWith(`..${sep}`) && rel !== "..";
}

/**
 * 把候选路径解析为 root 之内的绝对路径。越界时抛出 SandboxViolationError。
 */
export function resolveInside(root, candidate) {
  if (typeof root !== "string" || root.trim() === "") {
    throw new TypeError("resolveInside: root must be a non-empty string");
  }
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new TypeError("resolveInside: candidate must be a non-empty string");
  }
  const absoluteRoot = resolve(root);
  const absoluteTarget = resolve(absoluteRoot, candidate);
  if (!isPathInside(absoluteRoot, absoluteTarget)) {
    throw new SandboxViolationError(
      `path escapes the sandbox root: ${JSON.stringify(candidate)} is outside ${JSON.stringify(absoluteRoot)}`,
      { root: absoluteRoot, target: absoluteTarget },
    );
  }
  return absoluteTarget;
}

/**
 * 断言候选路径位于 root 之内，否则抛出 SandboxViolationError。
 */
export function assertInsideSandbox(root, candidate) {
  const resolved = resolveInside(root, candidate);
  return resolved;
}

/**
 * 在 root 之内解析一个目录路径，失败时返回 undefined 而不是抛错。
 */
export function tryResolveInside(root, candidate) {
  try {
    return resolveInside(root, candidate);
  } catch {
    return undefined;
  }
}
