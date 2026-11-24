# Clerk script startup failure

Sentry issue `PA-PORTFOLIO-FRONTEND-T` recorded `failed_to_load_clerk_js` on `/portfolio`. Blocking Clerk's `/npm/` requests in a browser reproduces the failure while leaving the Frontend API reachable.

The production Vite build gets the pinned `@clerk/clerk-js` archive through npm and checks its SHA-512 digest before extraction. The build needs `tar` and uses the local npm cache when the archive is available. Update the version and digest together in `packages/frontend/vite.config.ts`.

Vite publishes the browser script and its lazy UI chunks under `/assets/clerk/<version>/`. `ClerkProvider` loads the local script through `clerkJSUrl`. Keep the published filenames together because Clerk uses them for its lazy imports. The publishable key still selects the Clerk instance. Development uses Clerk's usual script URL.

After a Clerk SDK update, build the frontend and open `/portfolio` in a signed-out browser. Block `https://clerk.foliobuddy.xyz/npm/**` and confirm the full Clerk sign-in form renders from the build's script and chunks. Block the build's Clerk script in a separate browser context and confirm the reload screen appears. Restore the request and verify that Reload Page recovers the form.
