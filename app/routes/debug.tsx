import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    let dbStatus = "unknown";
    let sessionCount = 0;

    try {
        // Test database connection
        sessionCount = await prisma.session.count();
        dbStatus = "connected";
    } catch (error: any) {
        dbStatus = `error: ${error.message}`;
    }

    const url = new URL(request.url);

    return json({
        timestamp: new Date().toISOString(),
        url: {
            pathname: url.pathname,
            search: url.search,
            host: url.host,
        },
        headers: Object.fromEntries(request.headers.entries()),
        env: {
            NODE_ENV: process.env.NODE_ENV,
            SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL,
            HAS_API_KEY: !!process.env.SHOPIFY_API_KEY,
            API_KEY_PREVIEW: process.env.SHOPIFY_API_KEY?.substring(0, 10) + "...",
            HAS_SECRET: !!process.env.SHOPIFY_API_SECRET,
            SCOPES: process.env.SCOPES,
            HAS_DATABASE_URL: !!process.env.DATABASE_URL,
        },
        database: {
            status: dbStatus,
            sessionCount: sessionCount,
        },
    });
};

export default function Debug() {
    const data = useLoaderData<typeof loader>();
    return (
        <div style={{ padding: 20, fontFamily: "monospace", backgroundColor: "#1a1a2e", color: "#eee", minHeight: "100vh" }}>
            <h1 style={{ color: "#00d4ff" }}>🔍 Debug Info</h1>
            <h2 style={{ color: "#00ff88" }}>Environment</h2>
            <pre style={{ backgroundColor: "#16213e", padding: 15, borderRadius: 8 }}>
                {JSON.stringify(data.env, null, 2)}
            </pre>
            <h2 style={{ color: "#00ff88" }}>Database</h2>
            <pre style={{ backgroundColor: "#16213e", padding: 15, borderRadius: 8 }}>
                {JSON.stringify(data.database, null, 2)}
            </pre>
            <h2 style={{ color: "#00ff88" }}>Request Info</h2>
            <pre style={{ backgroundColor: "#16213e", padding: 15, borderRadius: 8 }}>
                {JSON.stringify(data.url, null, 2)}
            </pre>
            <h2 style={{ color: "#00ff88" }}>Headers</h2>
            <pre style={{ backgroundColor: "#16213e", padding: 15, borderRadius: 8, fontSize: 12 }}>
                {JSON.stringify(data.headers, null, 2)}
            </pre>
        </div>
    );
}
