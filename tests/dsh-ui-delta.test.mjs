/**
 * dsh-ui-delta 单元与集成测试
 * 验证 Delta UI 宿主端生命周期、WebServer 路由注册与客户端文件完整性。
 * 运行：pnpm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const uiDelta = await import("../packages/dsh-ui-delta/index.js");

function createMockWebServer() {
  const routes = new Map();
  return {
    routes,
    register(routeDef) {
      routes.set(routeDef.path, routeDef);
    },
  };
}

describe("dsh-ui-delta", () => {
  it("插件元信息导出正确", () => {
    assert.equal(uiDelta.name, "dsh-ui-delta");
    assert.deepEqual(uiDelta.inject, ["webServer"]);
    assert.equal(typeof uiDelta.apply, "function");
  });

  it("当 webServer 不可用时 apply 静默降级", () => {
    assert.doesNotThrow(() => {
      uiDelta.apply({});
    });
    assert.doesNotThrow(() => {
      uiDelta.apply(null);
    });
  });

  it("当 webServer 可用时正确注册各端点", () => {
    const webServer = createMockWebServer();
    const ctx = { webServer };

    uiDelta.apply(ctx);

    const expectedRoutes = [
      "/dsh-ui-delta/config",
      "/dsh-ui-delta/vision",
      "/dsh-ui-delta/search",
      "/dsh-ui-delta/version",
    ];

    for (const path of expectedRoutes) {
      assert.ok(webServer.routes.has(path), `缺少路由: ${path}`);
      assert.equal(typeof webServer.routes.get(path).handler, "function");
    }
  });

  it("/dsh-ui-delta/version 端点返回插件版本号", async () => {
    const webServer = createMockWebServer();
    uiDelta.apply({ webServer });

    const versionRoute = webServer.routes.get("/dsh-ui-delta/version");
    assert.ok(versionRoute);

    let statusCode = 0;
    let headers = {};
    let responseBody = "";

    const req = {
      method: "GET",
      headers: { host: "localhost:12345" },
      socket: { remoteAddress: "127.0.0.1" },
    };
    const res = {
      writeHead(code, h) {
        statusCode = code;
        headers = h;
      },
      end(data) {
        responseBody = data;
      },
    };

    await versionRoute.handler(req, res);

    assert.equal(statusCode, 200);
    const parsed = JSON.parse(responseBody);
    assert.equal(parsed.version, "0.1.0");
  });

  it("未受信任的请求会被路由拒绝 (403)", async () => {
    const webServer = createMockWebServer();
    uiDelta.apply({ webServer });

    const configRoute = webServer.routes.get("/dsh-ui-delta/config");
    let statusCode = 0;
    let responseBody = "";

    const untrustedReq = {
      method: "GET",
      headers: { host: "evil.example.com" },
      socket: { remoteAddress: "192.168.1.100" },
    };
    const res = {
      writeHead(code) {
        statusCode = code;
      },
      end(data) {
        responseBody = data;
      },
    };

    await configRoute.handler(untrustedReq, res);
    assert.equal(statusCode, 403);
    assert.match(responseBody, /request refused/);
  });

  it("客户端资源 client.js 与 icon.svg 存在且有效", () => {
    const clientPath = join(import.meta.dirname, "../packages/dsh-ui-delta/client.js");
    const iconPath = join(import.meta.dirname, "../packages/dsh-ui-delta/icon.svg");

    assert.ok(existsSync(clientPath), "client.js 必须存在");
    assert.ok(existsSync(iconPath), "icon.svg 必须存在");

    const clientSrc = readFileSync(clientPath, "utf8");
    assert.ok(clientSrc.length > 1000, "client.js 应当包含 Delta UI 客户端逻辑");
  });
});
