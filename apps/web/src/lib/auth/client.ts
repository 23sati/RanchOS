import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  // Use the web app origin so Next can proxy auth requests to the API.
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
});
