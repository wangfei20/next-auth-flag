import adapters from "../adapters"
import jwt from "../lib/jwt"
import parseUrl from "../lib/parse-url"
import logger, { setLogger } from "../lib/logger"
import * as cookie from "./lib/cookie"
import * as defaultEvents from "./lib/default-events"
import * as defaultCallbacks from "./lib/default-callbacks"
import parseProviders from "./lib/providers"
import * as routes from "./routes"
import renderPage from "./pages"
import createSecret from "./lib/create-secret"
import callbackUrlHandler from "./lib/callback-url-handler"
import extendRes from "./lib/extend-res"
import csrfTokenHandler from "./lib/csrf-token-handler"
import * as pkce from "./lib/oauth/pkce-handler"
import * as state from "./lib/oauth/state-handler"

// To work properly in production with OAuth providers the NEXTAUTH_URL
// environment variable must be set.
if (!process.env.NEXTAUTH_URL) {
  logger.warn("NEXTAUTH_URL", "NEXTAUTH_URL environment variable not set")
}

/**
 * @param {import("next").NextApiRequest} req
 * @param {import("next").NextApiResponse} res
 * @param {import("types").NextAuthOptions} userOptions
 */
async function NextAuthHandler(req, res, userOptions) {
  if (userOptions.logger) {
    setLogger(userOptions.logger)
  }
  // If debug enabled, set ENV VAR so that logger logs debug messages
  if (userOptions.debug) {
    process.env._NEXTAUTH_DEBUG = true
  }

  // To the best of my knowledge, we need to return a promise here
  // to avoid early termination of calls to the serverless function
  // (and then return that promise when we are done) - eslint
  // complains but I'm not sure there is another way to do this.
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve) => {
    extendRes(req, res, resolve)

    if (!req.query.nextauth) {
      const error =
        "Cannot find [...nextauth].js in pages/api/auth. Make sure the filename is written correctly."

      logger.error("MISSING_NEXTAUTH_API_ROUTE_ERROR", error)
      return res.status(500).end(`Error: ${error}`)
    }

    const {
      nextauth,
      action = nextauth[0],
      providerId = nextauth[1],
      error = nextauth[1],
    } = req.query

    // @todo refactor all existing references to baseUrl and basePath
    const { basePath, baseUrl } = parseUrl(
      process.env.NEXTAUTH_URL || process.env.VERCEL_URL
    )

    const cookies = {
      ...cookie.defaultCookies(
        userOptions.useSecureCookies || baseUrl.startsWith("https://")
      ),
      // Allow user cookie options to override any cookie settings above
      ...userOptions.cookies,
    }

    const secret = createSecret({ userOptions, basePath, baseUrl })

    const providers = parseProviders({
      providers: userOptions.providers,
      baseUrl,
      basePath,
    })
    const provider = providers.find(({ id }) => id === providerId)

    // Protection only works on OAuth 2.x providers
    // TODO:
    // - rename to `checks` in 4.x, so it is similar to `openid-client`
    // - stop supporting `protection` as string
    // - remove `state` property
    if (provider?.type === "oauth" && provider.version?.startsWith("2")) {
      // Priority: (protection array > protection string) > state > default
      if (provider.protection) {
        provider.protection = Array.isArray(provider.protection)
          ? provider.protection
          : [provider.protection]
      } else if (provider.state !== undefined) {
        provider.protection = [provider.state ? "state" : "none"]
      } else {
        // Default to state, as we did in 3.1
        // REVIEW: should we use "pkce" or "none" as default?
        provider.protection = ["state"]
      }
    }

    const maxAge = 30 * 24 * 60 * 60 // Sessions expire after 30 days of being idle

    // Parse database / adapter
    // If adapter is provided, use it (advanced usage, overrides database)
    // If database URI or config object is provided, use it (simple usage)
    const adapter =
      userOptions.adapter ??
      (userOptions.database && adapters.Default(userOptions.database))

    // User provided options are overriden by other options,
    // except for the options with special handling above
    req.options = {
      debug: false,
      pages: {},
      theme: "auto",
      // Custom options override defaults
      ...userOptions,
      // These computed settings can have values in userOptions but we override them
      // and are request-specific.
      adapter,
      baseUrl,
      basePath,
      action,
      provider,
      cookies,
      secret,
      providers,
      // Session options
      session: {
        jwt: !adapter, // If no adapter specified, force use of JSON Web Tokens (stateless)
        maxAge,
        updateAge: 24 * 60 * 60, // Sessions updated only if session is greater than this value (0 = always, 24*60*60 = every 24 hours)
        ...userOptions.session,
      },
      // JWT options
      jwt: {
        secret, // Use application secret if no keys specified
        maxAge, // same as session maxAge,
        encode: jwt.encode,
        decode: jwt.decode,
        ...userOptions.jwt,
      },
      // Event messages
      events: {
        ...defaultEvents,
        ...userOptions.events,
      },
      // Callback functions
      callbacks: {
        ...defaultCallbacks,
        ...userOptions.callbacks,
      },
      pkce: {},
      logger,
    }

    csrfTokenHandler(req, res)
    await callbackUrlHandler(req, res)

    const render = renderPage(req, res)
    const { pages } = req.options

    if (req.method === "GET") {
      switch (action) {
        case "providers":
          return routes.providers(req, res)
        case "session":
          return routes.session(req, res)
        case "csrf":
          return res.json({ csrfToken: req.options.csrfToken })
        case "signin":
          if (pages.signIn) {
            let signinUrl = `${pages.signIn}${
              pages.signIn.includes("?") ? "&" : "?"
            }callbackUrl=${req.options.callbackUrl}`
            if (error) {
              signinUrl = `${signinUrl}&error=${error}`
            }
            return res.redirect(signinUrl)
          }

          return render.signin()
        case "signout":
          if (pages.signOut) return res.redirect(pages.signOut)

          return render.signout()
        case "callback":
          if (provider) {
            if (await pkce.handleCallback(req, res)) return
            if (await state.handleCallback(req, res)) return
            return routes.callback(req, res)
          }
          break
        case "verify-request":
          if (pages.verifyRequest) {
            return res.redirect(pages.verifyRequest)
          }
          return render.verifyRequest()
        case "error":
          if (pages.error) {
            return res.redirect(
              `${pages.error}${
                pages.error.includes("?") ? "&" : "?"
              }error=${error}`
            )
          }

          // These error messages are displayed in line on the sign in page
          if (
            [
              "Signin",
              "OAuthSignin",
              "OAuthCallback",
              "OAuthCreateAccount",
              "EmailCreateAccount",
              "Callback",
              "OAuthAccountNotLinked",
              "EmailSignin",
              "CredentialsSignin",
            ].includes(error)
          ) {
            return res.redirect(`${baseUrl}${basePath}/signin?error=${error}`)
          }

          return render.error({ error })
        default:
      }
    } else if (req.method === "POST") {
      switch (action) {
        case "signin":
          // Verified CSRF Token required for all sign in routes
          if (req.options.csrfTokenVerified && provider) {
            if (await pkce.handleSignin(req, res)) return
            if (await state.handleSignin(req, res)) return
            return routes.signin(req, res)
          }

          return res.redirect(`${baseUrl}${basePath}/signin?csrf=true`)
        case "signout":
          // Verified CSRF Token required for signout
          if (req.options.csrfTokenVerified) {
            return routes.signout(req, res)
          }
          return res.redirect(`${baseUrl}${basePath}/signout?csrf=true`)
        case "callback":
          if (provider) {
            // Verified CSRF Token required for credentials providers only
            if (
              provider.type === "credentials" &&
              !req.options.csrfTokenVerified
            ) {
              return res.redirect(`${baseUrl}${basePath}/signin?csrf=true`)
            }

            if (await pkce.handleCallback(req, res)) return
            if (await state.handleCallback(req, res)) return
            return routes.callback(req, res)
          }
          break
        case "_log":
          if (userOptions.logger) {
            try {
              const {
                code = "CLIENT_ERROR",
                level = "error",
                message = "[]",
              } = req.body

              logger[level](code, ...JSON.parse(message))
            } catch (error) {
              // If logging itself failed...
              logger.error("LOGGER_ERROR", error)
            }
          }
          return res.end()
        default:
      }
    }
    return res
      .status(400)
      .end(`Error: HTTP ${req.method} is not supported for ${req.url}`)
  })
}

/** Tha main entry point to next-auth */
export default function NextAuth(...args) {
  if (args.length === 1) {
    return (req, res) => NextAuthHandler(req, res, args[0])
  }

  return NextAuthHandler(...args)
}
