# Delta Desktop

`@fongap-labs/dsh-delta-desktop` is a native DeepSeek Harness plugin. It adds Delta appearance, search, conversation helpers and settings through public Harness plugin and Client APIs. Harness still owns model routing, sessions, approvals and the underlying conversation log.

## Conversation and context tools

### Automatic structured compaction

The package adds Harness's official `@deepseek-ai/dsh-compaction-basic` backend at the Profile layer. It checks context pressure before model steps and also uses Harness's context-overflow recovery path. This applies across agent presets; users do not need to switch the main task to the Delta Context Assistant preset. The backend uses Harness's own token meter, balanced-history selection, summary generation and durable checkpoint format.

Compaction does not delete the session's original log. Harness replaces older prompt-visible history with one summary checkpoint and keeps the recent conversation available to the model. The native checkpoint has these sections:

- **Primary Request and Intent** — task goal and changes to it.
- **Key Technical Concepts**, **Files and Code** — important facts and implementation details.
- **Errors and Fixes**, **Current Work** — completed fixes and current progress.
- **Pending Jobs**, **Next Step** — remaining tasks and the next action.
- **Critical Context** — user preferences, constraints, decisions, open questions and other facts needed to continue.

In a conversation, use **Latest structured checkpoint** below the composer to inspect the newest checkpoint. **Compact now** requests Harness's native `/compact` operation when the session is idle and a manual command is available. Automatic compaction does not require that command. If summarization fails, Harness records the failed attempt and does not use that attempt's summary to replace the conversation; Delta shows an alert below the composer from the session-projection event. The alert clears after a later successful attempt. Check the Host log for the failure reason, then retry after correcting the model or network issue.

The pressure estimate is approximate. The automatic backend needs a routed model and enough context headroom to summarize. Very small context windows, missing model capacity, an indivisible oversized tool call or an unavailable summarization model can prevent compaction. A failure must not be treated as successful compression.

### Quote selected text

Harness's native message-quote action handles selected-text quoting. Select text in a message, open its context menu and choose the quote action to put it in the composer. The native flow supports copying or removing the quote before sending. Delta does not duplicate this feature. It depends on the Host's `message-quotes` client plugin being enabled.

### Independent sidebar discussion

Choose **Discuss independently** below the composer to open a separate, tool-free Delta Context Assistant session in the right sidebar. It receives a bounded excerpt of the loaded main conversation and a snapshot of its status; subsequent discussion does not pause or steer the main task. Harness's own right sidebar controls collapse and expand; the panel's close button closes it, and the composer action opens it again.

To send a correction to the main task, type it in the sidebar, choose **Review the content to queue for the main task**, inspect the impact notice and text, then choose **Confirm and queue**. The correction uses Harness's queue path and will not interrupt an active step. A failed queue leaves the text available for retry.

### Input optimization

Choose **Optimize input** to ask the separate tool-free assistant to improve the current draft. The result appears in the sidebar and must be previewed before it is used. Edit the preview, copy it, cancel it, or choose **Use this version** to write it into the composer; it is never sent automatically. **Restore original** restores the captured draft only while the main draft still matches the original or the version applied by the preview. If the user has typed something newer, Delta refuses to overwrite it.

### Privacy, redaction, and vision bridge

In **Settings → Personalization → Conversation and input assistance**, **Enable request redaction** is on by default. It masks recognized private-key blocks, labeled credentials, bearer/API tokens, valid payment-card numbers, date/checksum-valid Chinese resident-ID formats, email addresses, and phone numbers in the model-bound request, then restores matched values in assistant text shown by the UI. Values stay masked in tool-call arguments so they cannot be forwarded to external tools. The durable conversation stays in the Host session log. This is pattern-based protection; it is not a guarantee that every sensitive value is detected, so use the switch to disable it only when the request needs the literal text.

**Enable vision bridge** is also on by default. Choose either **Use an existing model route** and enter its configured provider ID and image-capable model ID, or **Custom compatible endpoint** and select one of these generic protocols: OpenAI Chat Completions-compatible, Anthropic Messages, or Ollama. A custom API key is sent to Harness Credentials through the Host remote API and never written into the Delta configuration document.

In **Model routes**, switch **Enable DeepSeek model routes** off to hide the `deepseek-official` and `deepseek-account` catalogs and reject new requests routed to them. The setting does not alter credentials or cancel a request already running. Turning it back on restores the catalog on the next Host model-list refresh.

When a text-only route is selected and the bridge configuration is usable, Delta temporarily augments the public `llm.resolveModelInfo()` result so the Host's image admission check can reach Delta's `llm/stream` listener. The listener sends each bounded image to the selected vision route, replaces the image with an untrusted text description, and only then dispatches the text request. If the bridge fails, the original image is withheld, the request ends with a clear error, and the conversation log remains intact. The resolver wrapper is removed on plugin unload. This is a runtime-detected compatibility adapter, not a version gate or a version-pinned Harness dependency; a Host that makes the resolver non-writable cannot use the bridge until an extension seam is available.

Custom endpoint limits are 12 MiB per image, 20 images per request, 30 seconds per vision call, and 16,000 characters per returned description. Requests do not follow redirects. OpenAI-compatible URLs use the Chat Completions endpoint, Anthropic uses Messages, and Ollama uses `/api/chat`.

## MCP server management

On **Plugins → Add plugin**, choose **Add MCP server**. The entry appears after the built-in **Install a third-party plugin** action and before **Let the agent create a plugin**. The dialog lists configured and plugin-registered MCP servers, shows live connection status, and offers edit, enable/disable, connection test, restart, and configuration removal where the server is user-managed.

Choose **Local process (stdio)** to run a command on the Harness Host, or **Remote service (Streamable HTTP)** to connect to an HTTP endpoint. The server name must use 1–32 letters, digits, underscores, or hyphens. Save writes only that server's path through the revision-checked Settings form, so unrelated server entries are preserved. Removing a user override restores the inherited base value; the UI asks for a second click before removing.

stdio runs the configured command on the Host. Use trusted commands and store credentials in Harness Credentials, then refer to them with `${credential:NAME}` in environment variables or HTTP headers. If the Profile does not provide the official MCP Manager and its Settings form, the dialog explains which Host capability is unavailable.

## Other current capabilities and boundaries

- Native-service session/workspace search, sidebar quick actions and session ID copy remain additive; the Host owns navigation and workspace actions.
- Theme settings switch between Delta and official colors.
- The **Show DeepSeek Account route** preference only controls the `deepseek-account` provider label in the composer; it does not hide account identity in other Host surfaces or alter sign-in, credentials, model selection, or requests. **Show model names** independently controls the selected model name. Delta does not display names for other provider routes.
- Web Search endpoint and provider selection stay in Harness's built-in Web search settings; Delta does not create a second writer for the Host's provider selection. The legacy Messages search makes an auxiliary model request and consumes its input/output tokens. The standalone Search and Fetch APIs are billed per successful request instead; see [current Search and Fetch pricing](https://api-docs.deepseek.com/guides/search/) before choosing a route.
- Full sidebar rearrangement, workspace default collapse and a Host business-layer delete guard remain unavailable through the current public APIs.
- The package does not modify DeepSeek Harness source, `app.asar`, or private DOM structures.

## Verification

Automated source tests cover the Profile-level native backend declaration, latest compaction-outcome projection, settings persistence, separate assistant sessions, review-before-queue corrections, manual and automatic compaction failure handling, checkpoint viewing and protection against overwriting newer drafts. Privacy and vision tests cover request masking/restoration, chunk boundaries, Host resolver restoration, fail-closed image handling, and all three generic protocols. MCP tests cover menu ordering, missing Host services, revision-fenced per-server writes, write rejection, live status, probe, and restart.

Before release, manually verify on the target Windows Harness build:

1. Start a long task under both the standard and minimal presets. Confirm the checkpoint appears without a preset change and the task continues with its latest messages intact.
2. Force a summary-model failure. Confirm the composer shows an alert, no failed summary replaces the conversation, and the Host log exposes the error; after fixing the model, confirm a successful attempt clears the alert.
3. Select message text and use the native quote menu. Copy and remove the quote before sending.
4. Open the sidebar while a main task is running; verify discussion leaves the main task running. Queue a correction only after reviewing and confirming it.
5. Optimize a draft, edit the preview, apply it without sending, then test restore. Type a newer main draft before restore and confirm Delta preserves it.
6. Confirm request redaction starts enabled, then test with synthetic credentials, contact details, card numbers and resident-ID-shaped values. Verify masked values reach the model route and are restored in the displayed response; disable the switch and verify requests pass unchanged.
7. Configure an existing image-capable route, send an image while a text-only model is selected, and verify the text model receives only the description. Force the bridge to fail and confirm a clear error appears while the original message stays in the session. Repeat with custom OpenAI-compatible, Anthropic Messages, and Ollama endpoints; verify key storage and deletion through Harness Credentials.
8. Disable DeepSeek model routes and confirm both official DeepSeek catalogs disappear and a stale selected route cannot send a new request; re-enable and confirm the catalogs return. Toggle the account-route label, model-name preference and input optimization separately; restart and confirm the display settings persist.
9. Open **Plugins → Add plugin → Add MCP server**. Add and edit one stdio server and one Streamable HTTP server, verify credentials use `${credential:NAME}`, test the connection, disable and re-enable it, restart it, and remove it. Confirm a failed or stale write keeps the form values and reports an error, and that other configured servers remain unchanged.

Static and simulated tests do not substitute for this Windows Harness acceptance. See [compatibility notes](COMPATIBILITY.md) and [feature readiness](../../projects/dsh-delta-desktop/feature-readiness.json).

## Development

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm validate
pnpm link:dev dsh-delta-desktop
```

The source package version remains `0.0.0`; release versioning is controlled by the project operator.
