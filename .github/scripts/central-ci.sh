#!/usr/bin/env bash
# Central execution contract: invoked by fongap-labs/action-worker.
#
# Usage: central-ci.sh <target-root> [shard]
#
# The Action Worker sandbox checks out this repository at the change under test and runs this
# script against it. dsh-plugin owns its tests (tests/) and its bundle validation script, so this
# script invokes them directly; it does not use a central test pack. Exit 0 only when every phase
# passes. Phase markers keep per-phase timing visible for public repositories.
set -Eeuo pipefail

TARGET_ROOT="${1:-}"
SHARD="${2:-all}"
if [ -z "$TARGET_ROOT" ] || [ ! -d "$TARGET_ROOT" ]; then
  echo "central-ci: target root is required" >&2
  exit 64
fi
case "$SHARD" in
  all) ;;
  *)
    echo "central-ci: unknown shard: $SHARD" >&2
    exit 64
    ;;
esac

cd "$TARGET_ROOT"

phase_begin() {
  PHASE_LABEL="$1"
  PHASE_STARTED=$SECONDS
}

phase_end() {
  echo "central-ci: $SHARD/$PHASE_LABEL finished in $((SECONDS - PHASE_STARTED))s"
}

# The sandbox provides Node; pnpm is activated through Corepack at the pinned version so the
# lockfile is interpreted by the same pnpm release the project was verified with.
phase_begin pnpm
corepack enable
corepack prepare pnpm@10.28.0 --activate
phase_end

phase_begin install
pnpm install --frozen-lockfile
phase_end

# Invoke the underlying commands directly (not "pnpm test"/"pnpm build") so a pull request cannot
# weaken CI by editing package.json scripts.
phase_begin test
node --test "tests/**/*.test.mjs"
phase_end

phase_begin build
node scripts/pack-bundles.mjs --check
phase_end

echo "central-ci: all phases passed for shard $SHARD"
