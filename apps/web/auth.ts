import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

type GoogleSource = "authjs" | "legacy" | "missing";

function parseCsv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getAuthConfigSnapshot() {
  const authGoogleId = readEnv("AUTH_GOOGLE_ID");
  const authGoogleSecret = readEnv("AUTH_GOOGLE_SECRET");
  const legacyGoogleId = readEnv("GOOGLE_CLIENT_ID");
  const legacyGoogleSecret = readEnv("GOOGLE_CLIENT_SECRET");
  const authSecret = readEnv("AUTH_SECRET");
  const nextAuthSecret = readEnv("NEXTAUTH_SECRET");

  const authGooglePair =
    authGoogleId && authGoogleSecret
      ? {
          source: "authjs" as const,
          clientId: authGoogleId,
          clientSecret: authGoogleSecret,
        }
      : null;
  const legacyGooglePair =
    legacyGoogleId && legacyGoogleSecret
      ? {
          source: "legacy" as const,
          clientId: legacyGoogleId,
          clientSecret: legacyGoogleSecret,
        }
      : null;
  const preferredGoogleSource = readEnv("GOOGLE_AUTH_SOURCE");
  const googleConfig =
    preferredGoogleSource === "legacy"
      ? legacyGooglePair ?? authGooglePair
      : preferredGoogleSource === "authjs"
        ? authGooglePair ?? legacyGooglePair
        : authGooglePair ?? legacyGooglePair;

  const activeGoogleSource: GoogleSource = googleConfig?.source ?? "missing";
  const resolvedAuthSecret = authSecret ?? nextAuthSecret;
  const googleIdsMatch =
    !authGoogleId || !legacyGoogleId ? null : authGoogleId === legacyGoogleId;
  const googleSecretsMatch =
    !authGoogleSecret || !legacyGoogleSecret
      ? null
      : authGoogleSecret === legacyGoogleSecret;
  const authSecretsMatch =
    !authSecret || !nextAuthSecret ? null : authSecret === nextAuthSecret;
  const hints: string[] = [];

  if (!resolvedAuthSecret) {
    hints.push("Add AUTH_SECRET or NEXTAUTH_SECRET.");
  } else if (authSecretsMatch === false) {
    hints.push("AUTH_SECRET and NEXTAUTH_SECRET differ. Make them identical.");
  }

  if (!googleConfig) {
    hints.push(
      "Add one complete Google OAuth pair: AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.",
    );
  } else if (googleIdsMatch === false || googleSecretsMatch === false) {
    hints.push(
      "Two different Google OAuth env pairs are set. Keep only one pair, or set GOOGLE_AUTH_SOURCE to the pair you want to use.",
    );
  }

  return {
    authSecret: resolvedAuthSecret,
    googleConfig,
    preferredGoogleSource,
    sources: {
      activeGoogleSource,
      authSecretSource: authSecret
        ? "AUTH_SECRET"
        : nextAuthSecret
          ? "NEXTAUTH_SECRET"
          : "missing",
    },
    consistency: {
      googleIdsMatch,
      googleSecretsMatch,
      authSecretsMatch,
      authGooglePairReady: Boolean(authGooglePair),
      legacyGooglePairReady: Boolean(legacyGooglePair),
    },
    configured: {
      authSecret: Boolean(resolvedAuthSecret),
      googleClientId: Boolean(authGoogleId || legacyGoogleId),
      googleClientSecret: Boolean(authGoogleSecret || legacyGoogleSecret),
    },
    hints,
  };
}

const allowedEmails = new Set(parseCsv(process.env.SYNQ_INVITE_EMAILS));
const allowedDomains = new Set(parseCsv(process.env.SYNQ_INVITE_DOMAINS));
const authConfig = getAuthConfigSnapshot();

function isInvited(email: string) {
  if (!allowedEmails.size && !allowedDomains.size) {
    return true;
  }

  const normalized = email.toLowerCase();
  const domain = normalized.split("@")[1] ?? "";

  return allowedEmails.has(normalized) || allowedDomains.has(domain);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: authConfig.authSecret,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/chat",
    error: "/chat",
  },
  providers:
    authConfig.googleConfig
      ? [
          Google({
            clientId: authConfig.googleConfig.clientId,
            clientSecret: authConfig.googleConfig.clientSecret,
          }),
        ]
      : [],
  logger: {
    error(code, ...message) {
      console.error("[synq-auth]", code, ...message);
    },
    warn(code, ...message) {
      console.warn("[synq-auth]", code, ...message);
    },
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) {
        return false;
      }

      return isInvited(user.email);
    },
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub ?? token.email ?? "");
        session.user.email = String(token.email ?? session.user.email ?? "");
        session.user.name = String(token.name ?? session.user.name ?? "");
        session.user.image =
          typeof token.picture === "string" ? token.picture : session.user.image;
      }

      return session;
    },
  },
});

export { getAuthConfigSnapshot };
