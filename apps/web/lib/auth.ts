import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import { supabase, type UserRole } from "./supabase";

async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) {
    console.error("[auth] No refresh token stored — user must re-authenticate");
    return { ...token, error: "RefreshAccessTokenError" };
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshed = await res.json();

    if (!res.ok) {
      console.error("[auth] Token refresh failed:", refreshed);
      return { ...token, error: "RefreshAccessTokenError" };
    }

    console.log("[auth] Access token refreshed successfully");
    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (err) {
    console.error("[auth] Token refresh error:", err);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          hd: "turing.com",
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/bigquery",
          ].join(" "),
          prompt: "consent",
          access_type: "offline",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Initial sign-in — store tokens and fetch role from Supabase
      if (account && profile) {
        console.log(
          "[auth] Sign-in — access_token:", !!account.access_token,
          "| refresh_token:", !!account.refresh_token,
          "| expires_at:", account.expires_at
        );

        token.accessToken = account.access_token!;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000;
        token.error = undefined;

        // Upsert user and fetch their role
        const { data } = await supabase
          .from("users")
          .upsert(
            {
              email: profile.email!,
              name: (profile as { name?: string }).name ?? null,
              google_id: profile.sub,
              last_login_at: new Date().toISOString(),
            },
            { onConflict: "email", ignoreDuplicates: false }
          )
          .select("role")
          .single();

        token.role = (data?.role ?? "member") as UserRole;
        console.log("[auth] Role fetched:", token.role);
        return token;
      }

      // Already failed to refresh — don't retry on every request
      if (token.error === "RefreshAccessTokenError") {
        return token;
      }

      // Token still valid
      if (Date.now() < (token.accessTokenExpires as number) - 60_000) {
        return token;
      }

      // Token expired — refresh it
      console.log("[auth] Access token expired, refreshing...");
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.role = token.role ?? "member";
      if (token.error) {
        (session as { error?: string }).error = token.error as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
};
