// The apps' site (app.tkkoskovi.cz, on the NAS) looks like the web and is its
// "Aplikace" tab. Its header asks the web who is signed in (and signs out)
// with the web's cookie: the two share the site tkkoskovi.cz.
export const appSiteUrl = process.env.NEXT_PUBLIC_APP_SITE_URL || "https://app.tkkoskovi.cz";

// CORS headers for a request from the apps' site, none for anyone else.
export function appSiteCors(request: Request): Record<string, string> {
  const origin = new URL(appSiteUrl).origin;

  return request.headers.get("origin") === origin
    ? { "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : { Vary: "Origin" };
}
