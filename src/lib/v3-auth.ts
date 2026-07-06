/**
 * V3 集成接口的鉴权与请求追踪工具。
 *
 * V3（运单全流程管理系统）通过 HTTP 接口调用 V2 获取运单数据。
 * 这些接口不允许裸奔：必须携带 Bearer Token（或 x-api-key）。
 * Token 通过环境变量 V3_API_KEY 配置；本地未配置时使用开发默认值，
 * 便于在没有环境变量的情况下跑通联调（生产必须显式配置）。
 */
import { NextRequest, NextResponse } from "next/server";

/** 本地开发默认 key（生产必须用环境变量覆盖） */
const DEV_DEFAULT_KEY = "v3-dev-shared-key";

export function expectedKey(): string {
  return process.env.V3_API_KEY || DEV_DEFAULT_KEY;
}

/** 生成/透传请求追踪 ID：优先用调用方传入的 x-request-id，否则本地生成 */
export function requestId(req: NextRequest): string {
  return (
    req.headers.get("x-request-id") ||
    `v2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
}

/** 从请求头提取调用方提供的凭证（Bearer 或 x-api-key 均可） */
function providedKey(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-api-key");
}

export interface AuthOk {
  ok: true;
  rid: string;
}
export interface AuthFail {
  ok: false;
  response: NextResponse;
  rid: string;
}

/**
 * 校验 V3 调用凭证。失败时返回带明确错误码/错误信息的 401 响应，
 * 而不是笼统的 500，方便对端排查是"没带 key"还是"key 不对"。
 */
export function authorize(req: NextRequest): AuthOk | AuthFail {
  const rid = requestId(req);
  const key = providedKey(req);
  if (!key) {
    return {
      ok: false,
      rid,
      response: NextResponse.json(
        {
          error: "MISSING_CREDENTIALS",
          message: "缺少鉴权凭证：请在 Authorization: Bearer <key> 或 x-api-key 中携带 V3_API_KEY",
          requestId: rid,
        },
        { status: 401, headers: { "x-request-id": rid } }
      ),
    };
  }
  if (key !== expectedKey()) {
    return {
      ok: false,
      rid,
      response: NextResponse.json(
        {
          error: "INVALID_CREDENTIALS",
          message: "鉴权失败：提供的 V3 API Key 无效",
          requestId: rid,
        },
        { status: 401, headers: { "x-request-id": rid } }
      ),
    };
  }
  return { ok: true, rid };
}

/** 统一给成功响应附加 x-request-id 头，便于链路追踪 */
export function withRid(body: unknown, rid: string, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "x-request-id": rid } });
}
