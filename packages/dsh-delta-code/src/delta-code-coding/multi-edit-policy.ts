/** Host-independent mode and compensation policy for code_multi_edit. */
export function shouldPreflightMultiEdit(preflight: boolean | undefined, editCount: number): boolean {
  return preflight === true || (preflight !== false && editCount > 1)
}

/** Host FS guarded-intent is the only contract where compensation is permitted. */
export function canCompensateMultiEdit(
  usePreflight: boolean, dryRun: boolean, fsWriteContract: string | undefined,
): boolean {
  return usePreflight && !dryRun && fsWriteContract === 'guarded-intent'
}
