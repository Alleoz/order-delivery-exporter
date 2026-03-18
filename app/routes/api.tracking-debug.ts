/**
 * Diagnostic endpoint to test 17track API connectivity and data.
 * 
 * Usage:
 *   GET /api/tracking-debug?num=ZC57951220699          → check status only
 *   GET /api/tracking-debug?num=ZC57951220699&register=1  → register + fetch data
 */

import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";

export const loader: LoaderFunction = async ({ request }) => {
    const url = new URL(request.url);
    const trackingNumber = url.searchParams.get("num") || "ZC57951220699";
    const shouldRegister = url.searchParams.get("register") === "1";
    const apiKey = process.env.TRACKING_API_KEY || process.env.SEVENTEENTRACK_API_KEY || '';

    const diagnostics: any = {
        trackingNumber,
        apiKeySet: !!apiKey,
        timestamp: new Date().toISOString(),
        shouldRegister,
    };

    if (!apiKey) {
        diagnostics.error = "No TRACKING_API_KEY or SEVENTEENTRACK_API_KEY set";
        return json(diagnostics);
    }

    // Step 1: Check quota
    try {
        const quotaRes = await fetch('https://api.17track.net/track/v2.2/getquota', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', '17token': apiKey },
            body: '{}',
            signal: AbortSignal.timeout(10000),
        });
        diagnostics.quota = (await quotaRes.json())?.data;
    } catch (e: any) {
        diagnostics.quotaError = e.message;
    }

    // Step 2: Try gettrackinfo (free)
    try {
        const body = [{ number: trackingNumber, carrier: 0 }];
        const trackRes = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', '17token': apiKey },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
        });
        const trackData = await trackRes.json();

        const accepted = trackData?.data?.accepted || [];
        const rejected = trackData?.data?.rejected || [];

        if (accepted.length > 0 && accepted[0].track_info) {
            diagnostics.status = "FOUND - Number is registered";
            diagnostics.trackInfo = accepted[0].track_info;
            return json(diagnostics, { headers: { 'Content-Type': 'application/json' } });
        }

        if (rejected.length > 0) {
            diagnostics.status = "NOT REGISTERED";
            diagnostics.rejectionError = rejected[0].error;
        }
    } catch (e: any) {
        diagnostics.getTrackInfoError = e.message;
    }

    // Step 3: Register if requested
    if (shouldRegister && diagnostics.status === "NOT REGISTERED") {
        try {
            const regBody = [{ number: trackingNumber, carrier: 0 }];
            const regRes = await fetch('https://api.17track.net/track/v2.2/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', '17token': apiKey },
                body: JSON.stringify(regBody),
                signal: AbortSignal.timeout(15000),
            });
            const regData = await regRes.json();
            diagnostics.registration = regData?.data;

            // Wait for 17track to process
            diagnostics.waitingForProcessing = "Waiting 10 seconds for 17track to process...";
            await new Promise(resolve => setTimeout(resolve, 10000));

            // Retry gettrackinfo
            const retryBody = [{ number: trackingNumber, carrier: 0 }];
            const retryRes = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', '17token': apiKey },
                body: JSON.stringify(retryBody),
                signal: AbortSignal.timeout(15000),
            });
            const retryData = await retryRes.json();

            const accepted = retryData?.data?.accepted || [];
            if (accepted.length > 0 && accepted[0].track_info) {
                diagnostics.status = "REGISTERED & DATA FOUND";
                diagnostics.trackInfo = accepted[0].track_info;
            } else {
                diagnostics.status = "REGISTERED but no data yet (may need more time)";
                diagnostics.retryResponse = retryData?.data;
            }

            // Check quota after
            const quotaRes2 = await fetch('https://api.17track.net/track/v2.2/getquota', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', '17token': apiKey },
                body: '{}',
                signal: AbortSignal.timeout(5000),
            });
            diagnostics.quotaAfter = (await quotaRes2.json())?.data;
        } catch (e: any) {
            diagnostics.registrationError = e.message;
        }
    } else if (!shouldRegister && diagnostics.status === "NOT REGISTERED") {
        diagnostics.hint = "Add &register=1 to the URL to register this number and fetch its tracking data. This will use 1 quota.";
    }

    return json(diagnostics, { headers: { 'Content-Type': 'application/json' } });
};
