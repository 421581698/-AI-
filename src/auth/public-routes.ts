const PUBLIC_PATHS = new Set(["/health", "/console", "/v1/auth/register", "/v1/auth/login"]);

export function isPublicRoute(requestUrl: string): boolean {
  const pathname = requestUrl.split("?")[0] ?? requestUrl;
  return PUBLIC_PATHS.has(pathname);
}
