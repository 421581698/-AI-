import { describe, expect, it } from "vitest";
import { isPublicRoute } from "./public-routes.js";

describe("public route allowlist", () => {
  it.each(["/health", "/health?probe=1", "/console", "/console?tab=overview", "/v1/auth/register", "/v1/auth/login"])("allows %s without a bearer token", (path) => {
    expect(isPublicRoute(path)).toBe(true);
  });
  it.each(["/v1/auth/me", "/v1/auth/api-keys", "/v1/auth/register/other", "/console/admin", "/mcp", "/v1/tasks"])("keeps %s behind authentication", (path) => {
    expect(isPublicRoute(path)).toBe(false);
  });
});
