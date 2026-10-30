import fs from 'node:fs';

// 1. 修复 index.js 的 route 容错
const indexPath = 'packages/dsh-ui-delta/index.js';
let indexCode = fs.readFileSync(indexPath, 'utf8');

const oldTarget = `  const route = (path, handler) => {
    ctx.webServer.register({
      name: \`dsh-ui-delta\${path.replace(/\\//g, '-')}\`,
      kind: 'exact',
      path,
      handler: async (req, res) => {
        if (!isTrustedRequest(req)) {
          sendJson(res, 403, { error: ROUTE_REFUSAL })
          return
        }
        try {
          await handler(req, res)
        } catch (err) {
          // errors carry no key and no request body
          sendJson(res, 500, { error: String(err?.message || err) })
        }
      },
    })
  }`;

const newTarget = `  const route = (path, handler) => {
    try {
      ctx.webServer.register({
        name: \`dsh-ui-delta\${path.replace(/\\//g, '-')}\`,
        kind: 'exact',
        path,
        handler: async (req, res) => {
          if (!isTrustedRequest(req)) {
            sendJson(res, 403, { error: ROUTE_REFUSAL })
            return
          }
          try {
            await handler(req, res)
          } catch (err) {
            // errors carry no key and no request body
            sendJson(res, 500, { error: String(err?.message || err) })
          }
        },
      })
    } catch (err) {
      if (String(err?.message || err).includes('duplicate')) {
        return
      }
      throw err
    }
  }`;

// 规范化换行替换
const norm = (s) => s.replace(/\r\n/g, '\n');
let normIndexCode = norm(indexCode);
let normOldTarget = norm(oldTarget);

if (normIndexCode.includes(normOldTarget)) {
  normIndexCode = normIndexCode.replace(normOldTarget, norm(newTarget));
  fs.writeFileSync(indexPath, normIndexCode, 'utf8');
  console.log('Fixed packages/dsh-ui-delta/index.js (duplicate route safe)');
} else {
  console.warn('Could not find oldTarget in packages/dsh-ui-delta/index.js');
}

// 2. 清理 C:/Users/Fong/.dsh/profiles/desktop/cordis.patch.yml 中的重复 entry
const patchPath = 'C:/Users/Fong/.dsh/profiles/desktop/cordis.patch.yml';
let patchCode = fs.readFileSync(patchPath, 'utf8');
let normPatch = norm(patchCode);

const redundant = `
- id: dsh-ui-delta
  name: "dsh-ui-delta"
- id: dsh-code-worker
  name: "dsh-code-worker"
`;

if (normPatch.includes(redundant)) {
  normPatch = normPatch.replace(redundant, '\n');
  fs.writeFileSync(patchPath, normPatch, 'utf8');
  console.log('Removed duplicate entries from desktop/cordis.patch.yml');
} else {
  console.log('No redundant entries matched in desktop/cordis.patch.yml');
}
