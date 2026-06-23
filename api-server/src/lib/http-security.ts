import type { CookieOptions } from "express";

function splitOrigins(value: string | undefined) {
  return String(value || "")
    .split(/[,\s]+/)
    .map(item => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function allowedCorsOrigins() {
  return [
    ...splitOrigins(process.env.FRONTEND_ORIGIN),
    ...splitOrigins(process.env.FRONTEND_URL),
    ...splitOrigins(process.env.CORS_ORIGINS),
    ...splitOrigins(process.env.PUBLIC_SITE_URL),
  ];
}

export function crossSiteCookiesEnabled() {
  return process.env.CROSS_SITE_COOKIES === "true" || allowedCorsOrigins().length > 0;
}

export function sessionCookieOptions(maxAge?: number): CookieOptions {
  const crossSite = crossSiteCookiesEnabled();
  return {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: process.env.NODE_ENV === "production" || crossSite,
    maxAge,
    path: "/",
  };
}

export function clearSessionCookieOptions(): CookieOptions {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions();
  return options;
}
