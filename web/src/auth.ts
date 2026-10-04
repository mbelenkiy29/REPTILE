// Auth.js: GitHub (our GitHub App's user authorization), Google, and email sign-in links via Resend.
// Database sessions in http-only cookies; Secure in production. Only providers with credentials are enabled.
import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import { db, getDb, schema as s } from "@/db";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

export function enabledProviders() {
  return {
    github: !!(process.env.GITHUB_APP_CLIENT_ID && process.env.GITHUB_APP_CLIENT_SECRET),
    google: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    email: !!process.env.EMAIL_FROM || process.env.NODE_ENV !== "production" || devLoginEnabled(),
    dev: devLoginEnabled(),
  };
}

/** Local and CI only: sign in as a seeded user without a provider. Never on a public URL. */
export function devLoginEnabled() {
  return process.env.AUTH_DEV_LOGIN === "1" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(process.env.APP_URL ?? "http://localhost:3000");
}

const p = enabledProviders();

const config = (): NextAuthConfig => ({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: s.users,
    // Our tables add a uuid primary key and a bigint expires_at; the adapter only reads the named columns.
    accountsTable: s.accounts as never,
    sessionsTable: s.sessions as never,
    verificationTokensTable: s.verificationTokens,
  }),
  session: { strategy: "database", maxAge: 30 * 86400, updateAge: 86400 },
  trustHost: true,
  pages: { signIn: "/login", verifyRequest: "/login?sent=1", error: "/login" },
  providers: [
    ...(p.github ? [GitHub({ clientId: process.env.GITHUB_APP_CLIENT_ID, clientSecret: process.env.GITHUB_APP_CLIENT_SECRET })] : []),
    ...(p.google ? [Google] : []),
    ...(p.email
      ? [Resend({
          from: process.env.EMAIL_FROM ?? "Countersign <dev@localhost>",
          maxAge: 15 * 60,
          async sendVerificationRequest({ identifier, url }) {
            await rateLimit(`signin-email:${identifier.toLowerCase()}`, 5, 3600);
            await sendEmail(identifier, "signin", { url });
          },
        })]
      : []),
  ],
  events: {
    // Auth.js stores provider tokens only on first link; keep the GitHub token and login fresh on every sign-in.
    async signIn({ user, account, profile }) {
      if (account?.provider !== "github" || !user.id) return;
      const login = (profile as { login?: string } | undefined)?.login;
      if (login) {
        await db.update(s.users).set({ githubLogin: null }).where(and(eq(s.users.githubLogin, login)));
        await db.update(s.users).set({ githubLogin: login, updatedAt: new Date().toISOString() }).where(eq(s.users.id, user.id));
      }
      await db.update(s.accounts).set({
        access_token: account.access_token, refresh_token: account.refresh_token ?? null, expires_at: account.expires_at ?? null,
        updatedAt: new Date().toISOString(),
      }).where(and(eq(s.accounts.provider, "github"), eq(s.accounts.providerAccountId, account.providerAccountId)));
    },
  },
});

// Lazy: the config (and the database connection) is created on the first request, not at build time.
export const { handlers, auth, signIn, signOut } = NextAuth(() => config());

export const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];
