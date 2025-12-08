import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    return json({
        headers: Object.fromEntries(request.headers.entries()),
        env: {
            SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL,
            // Don't expose keys/secrets here
            HAS_API_KEY: !!process.env.SHOPIFY_API_KEY,
            HAS_SECRET: !!process.env.SHOPIFY_API_SECRET,
            SCOPES: process.env.SCOPES,
        },
    });
};

export default function Debug() {
    const data = useLoaderData<typeof loader>();
    return (
        <div style={{ padding: 20, fontFamily: "monospace" }}>
            <h1>Debug Info</h1>
            <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
    );
}
