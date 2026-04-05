import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

function parseCsv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const allowedEmails = new Set(parseCsv(process.env.SYNQ_INVITE_EMAILS));
const allowedDomains = new Set(parseCsv(process.env.SYNQ_INVITE_DOMAINS));
const authGooglePair =
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
    ? {
        source: "authjs" as const,
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      }
    : null;
const legacyGooglePair =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        source: "legacy" as const,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }
    : null;
const googleConfig = authGooglePair ?? legacyGooglePair;
const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

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
  secret: authSecret,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/chat",
    error: "/chat",
  },
  providers:
    googleConfig
      ? [
          Google({
            clientId: googleConfig.clientId,
            clientSecret: googleConfig.clientSecret,
          }),
        ]
      : [],
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
