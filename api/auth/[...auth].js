// OpenCITE — Auth.js v5 Vercel Serverless Handler
// Route: /api/auth/* (catch-all)
// Runtime: Node.js (Prisma requires Node — no edge config)
//
// ACTIVE:   Google (OIDC)
// INACTIVE: Apple, Microsoft Entra ID — coming soon, commented out
// PHASE 4:  SIWE / Base L2 — hook point marked below
//
// Trusted domains: citation.today, opencite.space

import { Auth } from "@auth/core";
import Google from "@auth/core/providers/google";
// import Apple from "@auth/core/providers/apple";               // COMING SOON — Phase 1b
// import MicrosoftEntraID from "@auth/core/providers/microsoft-entra-id"; // COMING SOON — Phase 1b
import { PrismaAdapter } from "@auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";

// ─── Prisma singleton (safe for serverless cold-starts) ──────────────────────

const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ─── Trusted production domains ──────────────────────────────────────────────

const TRUSTED_DOMAINS = [
  "https://citation.today",
  "https://opencite.space",
];

// ─── Auth config ─────────────────────────────────────────────────────────────

const authConfig = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET,

  // Restrict callbacks to known production domains only
  // Prevents token reuse across unrelated origins
  trustHost: true,
  redirectProxyUrl: null,

  providers: [
    Google({
      clientId:     process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          // Force account picker on every sign-in — prevents silent
          // auto-sign-in with wrong account on shared devices
          prompt: "select_account",
        },
      },
    }),

    // ── COMING SOON — Apple ────────────────────────────────────────────────
    // Requires: .p8 private key, Services ID, Team ID from Apple Developer
    // Callback: https://citation.today/api/auth/callback/apple
    //           https://opencite.space/api/auth/callback/apple
    // Apple({
    //   clientId:     process.env.AUTH_APPLE_ID,
    //   clientSecret: process.env.AUTH_APPLE_SECRET,
    // }),

    // ── COMING SOON — Microsoft Entra ID ──────────────────────────────────
    // Requires: App registration in Azure Portal
    // Callback: https://citation.today/api/auth/callback/microsoft-entra-id
    //           https://opencite.space/api/auth/callback/microsoft-entra-id
    // MicrosoftEntraID({
    //   clientId:     process.env.AUTH_MICROSOFT_ENTRA_ID,
    //   clientSecret: process.env.AUTH_MICROSOFT_ENTRA_SECRET,
    //   tenantId:     process.env.AUTH_MICROSOFT_ENTRA_TENANT_ID ?? "common",
    // }),

    // ── PHASE 4 HOOK — SIWE / Base L2 ─────────────────────────────────────
    // Add CredentialsProvider here with SIWE signature verification.
    // Map verified wallet address to User.agent_wallet_address.
    // Both auth paths resolve to the same internal_id UUID.
    // ── END PHASE 4 HOOK ──────────────────────────────────────────────────
  ],

  callbacks: {
    // Expose internal_id (UUID) on the session object.
    // BillingContext and API routes read session.user.id.
    session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.internal_id;
      }
      return session;
    },

    // Guard: only allow callbacks from trusted production domains
    async redirect({ url, baseUrl }) {
      const trusted = TRUSTED_DOMAINS.some(
        (d) => url.startsWith(d) || url.startsWith("/")
      );
      return trusted ? url : baseUrl;
    },
  },

  // Credits seeded via Prisma schema default: Decimal @default(10)
  // No additional onCreate hook needed for Phase 1.

  pages: {
    // signIn: "/auth/signin",  // override when custom sign-in page is built
  },
};

// ─── Vercel serverless export ─────────────────────────────────────────────────

export default function handler(req, res) {
  return Auth(req, res, authConfig);
}
