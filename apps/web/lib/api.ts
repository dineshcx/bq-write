/**
 * Shared API utilities: response helpers, auth context, SSE support.
 *
 * Auth helpers follow the "result object" pattern — they return either
 * `{ ok: true, session, user }` or `{ ok: false, error, status, response }`.
 * Routes check `if (!auth.ok) return auth.response` and move on.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Session } from "next-auth";

// ─── Response Helpers ──────────────────────────────────────────────────────────

export const ok = (data: unknown, status = 200): NextResponse =>
  NextResponse.json(data, { status });

export const err = (message: string, status: number): NextResponse =>
  NextResponse.json({ error: message }, { status });

// ─── SSE Helpers ──────────────────────────────────────────────────────────────

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

export const sseEvent = (data: Record<string, unknown>): string =>
  `data: ${JSON.stringify(data)}\n\n`;

export const sseErr = (message: string, status: number): Response =>
  new Response(sseEvent({ type: "error", message }), {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });

// ─── Auth Context ──────────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  role: string;
}

export interface AuthContext {
  session: Session;
  user: DbUser;
}

type AuthOk = { ok: true } & AuthContext;
type AuthFail = { ok: false; error: string; status: number; response: NextResponse };
export type AuthResult = AuthOk | AuthFail;

function fail(message: string, status: number): AuthFail {
  return { ok: false, error: message, status, response: err(message, status) };
}

export const isAdmin = (role: string): boolean =>
  role === "admin" || role === "superadmin";

// ─── Auth Helpers ──────────────────────────────────────────────────────────────

/**
 * Validates the session and loads the matching db user row.
 * Use this as the base for all authenticated routes.
 */
export async function getAuth(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return fail("Unauthorized", 401);

  const { data: user } = await supabase
    .from("users")
    .select("id, role")
    .eq("email", session.user.email)
    .single();

  if (!user) return fail("User not found", 404);

  return { ok: true, session, user };
}

/**
 * Like getAuth(), but also enforces admin or superadmin role.
 * Use for write operations (create, update, delete).
 */
export async function getAdminAuth(): Promise<AuthResult> {
  const result = await getAuth();
  if (!result.ok) return result;
  if (!isAdmin(result.user.role)) return fail("Forbidden", 403);
  return result;
}

/**
 * Like getAuth(), but enforces superadmin role specifically.
 * Use for platform-level admin routes (e.g. listing all users).
 */
export async function getSuperAdminAuth(): Promise<AuthResult> {
  const result = await getAuth();
  if (!result.ok) return result;
  if (result.user.role !== "superadmin") return fail("Forbidden", 403);
  return result;
}

/**
 * Like getAuth(), but also verifies the caller has access to the given app.
 * Admins/superadmins always pass. Members must have an app_members row.
 */
export async function getAppAuth(appId: string): Promise<AuthResult> {
  const result = await getAuth();
  if (!result.ok) return result;

  if (result.user.role === "member") {
    const { data: membership } = await supabase
      .from("app_members")
      .select("app_id")
      .eq("app_id", appId)
      .eq("user_id", result.user.id)
      .single();

    if (!membership) return fail("Forbidden", 403);
  }

  return result;
}
