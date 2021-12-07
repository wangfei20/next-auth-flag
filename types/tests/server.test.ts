import Providers, { OAuthConfig } from "next-auth/providers"
import { Adapter } from "next-auth/adapters"
import NextAuth, * as NextAuthTypes from "next-auth"
import { IncomingMessage, ServerResponse } from "http"
import { Socket } from "net"
import { NextApiRequest, NextApiResponse } from "internals/utils"
import { AppOptions } from "internals"

const req: NextApiRequest = Object.assign(new IncomingMessage(new Socket()), {
  query: {},
  cookies: {},
  body: {},
  env: {},
})

const res: NextApiResponse = Object.assign(new ServerResponse(req), {
  send: (body: string) => undefined,
  json: (body: string) => undefined,
  status: (code: number) => res,
  redirect: (statusOrUrl: number | string, url?: string) => res as any,
  setPreviewData: (data: object | string) => res,
  clearPreviewData: () => res,
})

const pageOptions = {
  signin: "path/to/signin",
  signout: "path/to/signout",
  error: "path/to/error",
  verifyRequest: "path/to/verify",
  newUsers: "path/to/signup",
}

const simpleConfig = {
  providers: [
    Providers.GitHub({
      clientId: "123",
      clientSecret: "123",
      scope:
        "user public_repo repo repo_deployment repo:status read:repo_hook read:org read:public_key read:gpg_key",
    }),
  ],
}

const exampleUser: NextAuthTypes.User = {
  name: "",
  image: "",
  email: "",
}

const exampleSession: NextAuthTypes.Session = {
  userId: "",
  accessToken: "",
  sessionToken: "",
}

const exampleVerificationRequest = {
  id: "",
  identifier: "",
  token: "",
  expires: new Date(),
}

const MyAdapter: Adapter<Record<string, unknown>> = () => {
  return {
    async getAdapter(appOptions: AppOptions) {
      return {
        async createUser(profile) {
          return exampleUser
        },
        async getUser(id) {
          return exampleUser
        },
        async getUserByEmail(email) {
          return exampleUser
        },
        async getUserByProviderAccountId(providerId, providerAccountId) {
          return exampleUser
        },
        async updateUser(user) {
          return exampleUser
        },
        async linkAccount(
          userId,
          providerId,
          providerType,
          providerAccountId,
          refreshToken,
          accessToken,
          accessTokenExpires
        ) {
          return undefined
        },
        async createSession(user) {
          return exampleSession
        },
        async getSession(sessionToken) {
          return exampleSession
        },
        async updateSession(session, force) {
          return exampleSession
        },
        async deleteSession(sessionToken) {
          return undefined
        },
        async createVerificationRequest(email, url, token, secret, provider) {
          return undefined
        },
        async getVerificationRequest(
          email,
          verificationToken,
          secret,
          provider
        ) {
          return exampleVerificationRequest
        },
        async deleteVerificationRequest(
          email,
          verificationToken,
          secret,
          provider
        ) {
          return undefined
        },
      }
    },
  }
}

const client = {} // Create a fake db client

const allConfig: NextAuthTypes.NextAuthOptions = {
  providers: [
    Providers.Twitter({
      clientId: "123",
      clientSecret: "123",
    }),
  ],
  database: "path/to/db",
  debug: true,
  secret: "my secret",
  session: {
    jwt: true,
    maxAge: 365,
    updateAge: 60,
  },
  jwt: {
    secret: "secret-thing",
    maxAge: 365,
    encryption: true,
    signingKey: "some-key",
    encryptionKey: "some-key",
    encode: async () => "foo",
    decode: async () => ({}),
  },
  pages: pageOptions,
  callbacks: {
    async signIn(user, account, profile) {
      return true
    },
    async redirect(url, baseUrl) {
      return "path/to/foo"
    },
    async session(session, userOrToken) {
      return { ...session }
    },
    async jwt(token, user, account, profile, isNewUser) {
      return token
    },
  },
  events: {
    async signIn(message: NextAuthTypes.SignInEventMessage) {
      return undefined
    },
    async signOut(message: NextAuthTypes.Session | null) {
      return undefined
    },
    async createUser(message: NextAuthTypes.User) {
      return undefined
    },
    async updateUser(message: NextAuthTypes.User) {
      return undefined
    },
    async linkAccount(message: NextAuthTypes.LinkAccountEventMessage) {
      return undefined
    },
    async session(message: NextAuthTypes.Session) {
      return undefined
    },
    async error(message: any) {
      return undefined
    },
  },
  adapter: MyAdapter(client),
  useSecureCookies: true,
  cookies: {
    sessionToken: {
      name: "__Secure-next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: true as true,
        path: "/",
        secure: true,
        domain: "foo.com",
      },
    },
  },
}

const customProvider: OAuthConfig<{
  id: string
  name: string
  email: string
  picture: string
}> = {
  id: "google",
  name: "Google",
  type: "oauth",
  version: "2.0",
  scope:
    "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
  params: { grant_type: "authorization_code" },
  accessTokenUrl: "https://accounts.google.com/o/oauth2/token",
  requestTokenUrl: "https://accounts.google.com/o/oauth2/auth",
  authorizationUrl:
    "https://accounts.google.com/o/oauth2/auth?response_type=code",
  profileUrl: "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
  async profile(profile, tokens) {
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      image: profile.picture,
    }
  },
  clientId: "",
  clientSecret: "",
}

const customProviderConfig = {
  providers: [customProvider],
}

// $ExpectType void | Promise<void>
NextAuth(simpleConfig)

// $ExpectType void | Promise<void>
NextAuth(allConfig)

// $ExpectType void | Promise<void>
NextAuth(customProviderConfig)

// $ExpectType void | Promise<void>
NextAuth(req, res, simpleConfig)

// $ExpectType void | Promise<void>
NextAuth(req, res, allConfig)
