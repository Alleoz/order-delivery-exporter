import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("Auth Route: Starting authentication...");
  console.log("Auth Route: URL:", request.url);

  try {
    const result = await authenticate.admin(request);
    console.log("Auth Route: Authentication successful");
    return null;
  } catch (error) {
    console.error("Auth Route: Authentication error:", error);
    // Re-throw to let Shopify handle redirects
    throw error;
  }
};
