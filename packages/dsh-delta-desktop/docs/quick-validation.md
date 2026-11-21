# Delta Desktop — quick validation (B2 stage 0)

This tests a **single Root UI plugin** inside DeepSeek Harness, not a second Electron program. The fast prototype **does not disable native UI modules** and therefore does **not** prove the B2 memory-saving architecture.

## Prerequisites

Use a disposable Windows Harness Desktop profile with a functioning model, a backup of the existing profile, and an **out-of-band way to disable the plugin** if its UI cannot open. Install this package alone for the first test, without Delta Suite; coexistence testing comes later. Do **not** apply `cordis.delta-only.patch.yml`.

## Screenshot-driven UI regression checklist

- On Windows, the title, session search box and top controls must begin **below** the Harness caption/menu row (the native menu remains Harness-owned). On macOS, traffic-light clearance must also be maintained.
- Long session titles must stay on one line and show their full value via hover title. Search must filter only the visible list, not delete or move Sessions.
- The composer Send button must not stretch to the textarea height. Tab/Enter navigation must remain usable.
- An empty page must show whether the selected Session is loading, failed, has additional older history, or has no supported text; the UI must not claim the durable Session is empty without checking its event window.
- The native UI remains installed for out-of-band rollback. This is **not** proof of B2 memory savings or complete conversation rendering.

## Smoke checklist

1. Install and enable `@fongap-labs/dsh-delta-desktop` as a regular Harness plugin. Confirm a single Harness window and the **Delta Desktop** heading. If no UI changes, stop and check Client loader logs.
2. Create a Session and confirm it appears in the left list. Switch it away and back.
3. Submit `Reply with PASS only` and verify that both the submitted User text and a **committed Assistant reply** appear for that Session. Seeing a running indicator alone does not pass.
4. Disable Desktop and restart Harness. Confirm the **original UI returns** without requiring interaction with the Delta Shell.
5. Record time to interactive, idle private working set/RSS after one minute, and a repeat after a short conversation, using the same Harness version/configuration for both modes.

## Failure and stop conditions

Stop on a blank window, missing Client module registration, failed Session create/prompt, absent committed Assistant replies, an unhandled approval request, duplicate Agent Host, or inability to recover the standard UI. Record full Harness version, console error, screenshot, and whether the plugin was enabled. Do not interpret a hidden UI as proof that its code was not loaded.

## Gate

Source `0.0.0` remains unchanged under repo release governance. `0.1.0-alpha.1` is the proposed **validation candidate only**, not a published release. Do not tag, merge, or publish while Action Worker checks are failing or Windows smoke tests are incomplete.

Not covered in this stage: native UI module exclusion, partial streaming chunks, tool approval UI, attachments, settings, third-party Slot compatibility, or any claimed memory reduction.
