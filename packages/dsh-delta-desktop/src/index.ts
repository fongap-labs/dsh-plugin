/** Host half: this plugin does not modify Host business services or Profile entries. */
export const name = '@fongap-labs/dsh-delta-desktop'
export const inject: string[] = []
export function apply(): () => void {
  return () => {}
}
