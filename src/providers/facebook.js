export default function Facebook(options) {
  return {
    id: "facebook",
    name: "Facebook",
    type: "oauth",
    version: "2.0",
    scope: "email",
    accessTokenUrl: "https://graph.facebook.com/oauth/access_token",
    authorizationUrl:
      "https://www.facebook.com/v11.0/dialog/oauth?scope=email",
    profileUrl: "https://graph.facebook.com/me?fields=id,email,name,picture",
    profile(profile) {
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        image: profile.picture.data.url,
      }
    },
    ...options,
  }
}
