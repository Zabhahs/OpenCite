// OpenCITE — Auth.js v5 Vercel Serverless Handler
// Route: /api/auth/* (catch-all via vercel.json rewrite)
// Runtime: Node.js (Prisma requires Node — no edge config)
//
// ACTIVE:   Google (OIDC)
// INACTIVE: Apple, Microsoft Entra ID — coming soon, commented out
// PHASE 4:  SIWE / Base L2 — hook point marked below

import { Auth } from "@auth/core";
import Google from "@auth/core/providers/google";
// import Apple from "@auth/core/providers/apple";
// import MicrosoftEntraID from "@auth/core/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "../_shared/prisma.js";
import { TRUSTED_ORIGINS } from "../_shared/auth.js";

// ─── Auth config ─────────────────────────────────────────────────────────────

// F-414: fail at module load (deploy time) rather than at the first token-signing
// operation. An absent/short secret is a session-forgery surface — make it fatal and
// loud instead of a silent runtime 500. (openssl rand -base64 32 → 44 chars.)
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  throw new Error(
    "[auth] AUTH_SECRET must be set and at least 32 characters. Generate with: openssl rand -base64 32"
  );
}

const authConfig = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET,
  basePath: "/api/auth",
  trustHost: true,
  redirectProxyUrl: null,

  providers: [
    Google({
      clientId:     process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: { prompt: "select_account" },
      },
    }),

    // ── COMING SOON — Apple ────────────────────────────────────────────────
    // Callback: https://citation.today/api/auth/callback/apple
    // Apple({ clientId: process.env.AUTH_APPLE_ID, clientSecret: process.env.AUTH_APPLE_SECRET }),

    // ── COMING SOON — Microsoft Entra ID ──────────────────────────────────
    // Callback: https://citation.today/api/auth/callback/microsoft-entra-id
    // MicrosoftEntraID({
    //   clientId:     process.env.AUTH_MICROSOFT_ENTRA_ID,
    //   clientSecret: process.env.AUTH_MICROSOFT_ENTRA_SECRET,
    //   tenantId:     process.env.AUTH_MICROSOFT_ENTRA_TENANT_ID ?? "common",
    // }),

    // ── PHASE 4 HOOK — SIWE / Base L2 ─────────────────────────────────────
    // Add CredentialsProvider here. Map wallet → User.agent_wallet_address.
    // Both auth paths resolve to the same internal_id UUID.
  ],

  callbacks: {
    // Expose internal_id (UUID) on the session. Read by BillingContext + API routes.
    session({ session, user }) {
      if (session.user && user?.id) {
        session.user.id = user.id;
      }
      return session;
    },

    // Only allow post-auth redirects to trusted domains or relative paths.
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (TRUSTED_ORIGINS.some((o) => url.startsWith(o))) return url;
      return baseUrl;
    },
  },

  pages: {
    // signIn: "/auth/signin",  // override when custom sign-in page is built
  },
};

// ─── Node.js ↔ Web API bridge ─────────────────────────────────────────────────
// @auth/core Auth() expects Web Request/Response.
// Vercel Node.js functions provide IncomingMessage/ServerResponse.
// No new dependencies — pure Node + Web API primitives.

function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function toWebRequest(req) {
  const protocol = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim();
  const url = new URL(req.url, `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val != null) headers.set(key, Array.isArray(val) ? val.join(", ") : val);
  }

  const body = await readBody(req);
  return new Request(url.toString(), {
    method: req.method,
    headers,
    body,
    ...(body ? { duplex: "half" } : {}),
  });
}

async function toNodeResponse(webResponse, res) {
  res.statusCode = webResponse.status;
  res.statusMessage = webResponse.statusText;

  for (const [key, value] of webResponse.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") {
      const cookies = webResponse.headers.getSetCookie?.() ?? [value];
      res.setHeader("set-cookie", cookies);
    } else {
      res.setHeader(key, value);
    }
  }

  res.end(Buffer.from(await webResponse.arrayBuffer()));
}

// ─── Vercel serverless export ─────────────────────────────────────────────────

export default async function handler(req, res) {
  try {
    const webResponse = await Auth(await toWebRequest(req), authConfig);
    await toNodeResponse(webResponse, res);
  } catch (err) {
    console.error("[auth] handler error:", err);
    res.statusCode = 500;
    res.end("Internal auth error");
  }
}
