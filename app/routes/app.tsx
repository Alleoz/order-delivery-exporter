import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("App Loader: Starting");
  try {
    console.log("App Loader: Authenticating...");
    await authenticate.admin(request);
    console.log("App Loader: Authentication successful");
  } catch (error) {
    console.error("App Loader: Authentication failed", error);
    // If it's a Response (redirect), re-throw it so Remix handles the redirect
    if (error instanceof Response) throw error;
    throw error;
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  console.log("App Loader: API Key present?", !!apiKey);

  return { apiKey: apiKey || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  if (!apiKey) {
    return (
      <div>
        <h1>Error: Missing API Key</h1>
        <p>SHOPIFY_API_KEY is not set in the environment variables.</p>
      </div>
    );
  }

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/orders">Orders</Link>
        <Link to="/app/additional">Additional page</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
