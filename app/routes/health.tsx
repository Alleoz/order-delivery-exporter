import { json } from "@remix-run/node";

export const loader = async () => {
    return json({ status: "ok", timestamp: new Date().toISOString() });
};

export default function Health() {
    return (
        <div style={{ padding: "20px", fontFamily: "system-ui, sans-serif" }}>
            <h1>Health Check</h1>
            <p>Status: OK</p>
            <p>The server is running correctly.</p>
        </div>
    );
}
