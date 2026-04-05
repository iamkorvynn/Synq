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
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/chat",
    error: "/chat",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "missing-google-client-id",
      clientSecret:
        process.env.AUTH_GOOGLE_SECRET ?? "missing-google-client-secret",
    }),
  ],
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
