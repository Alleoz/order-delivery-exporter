/**
 * Diagnostic endpoint to test 17track API connectivity and data.
 * Visit: /api/tracking-debug?num=ZC57951220699
 * 
 * This will show:
 * - Whether TRACKING_API_KEY is set
 * - Quota remaining
 * - What gettrackinfo returns for the number
 * - Whether registration is needed
 * - The raw API response structure
 */

import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";

export const loader: LoaderFunction = async ({ request }) => {
    const url = new URL(request.url);
    const trackingNumber = url.searchParams.get("num") || "ZC57951220699";
    const apiKey = process.env.TRACKING_API_KEY || process.env.SEVENTEENTRACK_API_KEY || '';

    const diagnostics: any = {
        trackingNumber,
        apiKeySet: !!apiKey,
        apiKeyLength: apiKey.length,
        timestamp: new Date().toISOString(),
    };

    if (!apiKey) {
        diagnostics.error = "No TRACKING_API_KEY or SEVENTEENTRACK_API_KEY environment variable found";
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
        diagnostics.quotaStatus = quotaRes.status;
        diagnostics.quotaData = await quotaRes.json();
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
        diagnostics.getTrackInfoStatus = trackRes.status;
        const trackData = await trackRes.json();
        diagnostics.getTrackInfoRaw = trackData;

        // Check if accepted or rejected
        const accepted = trackData?.data?.accepted || [];
        const rejected = trackData?.data?.rejected || [];
        diagnostics.accepted = accepted.length;
        diagnostics.rejected = rejected.length;

        if (accepted.length > 0 && accepted[0].track_info) {
            diagnostics.trackInfoKeys = Object.keys(accepted[0].track_info);
            diagnostics.latestStatus = accepted[0].track_info.latest_status;
            diagnostics.packageState = accepted[0].track_info.package_state;
            diagnostics.latestEvent = accepted[0].track_info.latest_event;

            const providers = accepted[0].track_info.tracking?.providers;
            if (providers?.[0]) {
                diagnostics.providerKeys = Object.keys(providers[0]);
                const events = providers[0].events || providers[0].trackinfo;
                diagnostics.eventCount = events?.length || 0;
                if (events?.[0]) {
                    diagnostics.firstEventKeys = Object.keys(events[0]);
                    diagnostics.firstEvent = events[0];
                }
                if (events?.[events.length - 1]) {
                    diagnostics.lastEvent = events[events.length - 1];
                }
            } else {
                diagnostics.noProviders = true;
                diagnostics.trackingKeys = Object.keys(accepted[0].track_info.tracking || {});
            }
        }

        if (rejected.length > 0) {
            diagnostics.rejectionReason = rejected[0];
        }
    } catch (e: any) {
        diagnostics.getTrackInfoError = e.message;
    }

    return json(diagnostics, {
        headers: { 'Content-Type': 'application/json' },
    });
};
