/**
 * External Tracking Fetcher Service
 * Server-side service to fetch delivery details from 17track's official API
 * for carriers that Shopify doesn't natively track.
 *
 * SETUP REQUIRED:
 * 1. Sign up for a free 17track API account at https://api.17track.net
 * 2. Get your API key from the dashboard
 * 3. Add TRACKING_API_KEY=your_key to your .env file
 *
 * Free tier: 200 tracking numbers for new accounts.
 */

import { detectCarrier, isShopifyNativeCarrier, getUniversalTrackingUrls } from './carrier-detection';

export interface ExternalTrackingEvent {
    timestamp: string;
    status: string;
    description: string;
    location?: string;
}

export interface ExternalTrackingResult {
    trackingNumber: string;
    carrier: string;
    carrierCode: string;
    status: 'delivered' | 'in_transit' | 'out_for_delivery' | 'pending' | 'exception' | 'unknown';
    statusLabel: string;
    trackingUrl: string;
    universalTrackingUrls: Array<{ name: string; url: string }>;
    estimatedDelivery?: string;
    deliveredAt?: string;
    events: ExternalTrackingEvent[];
    lastUpdated: string;
    source: 'shopify' | '17track' | 'detection_only';
}

/**
 * Normalize status codes from 17track into our standard statuses.
 * 17track status codes:
 * 0: Not Found, 10: In Transit, 20: Expired, 30: Pick Up,
 * 35: Undelivered, 40: Delivered, 50: Returned, 60: Alert
 */
function normalize17TrackStatus(statusCode: number): ExternalTrackingResult['status'] {
    switch (statusCode) {
        case 40: return 'delivered';
        case 10: return 'in_transit';
        case 30: return 'out_for_delivery';
        case 0: return 'pending';
        case 35:
        case 50:
        case 60: return 'exception';
        default: return 'unknown';
    }
}

/**
 * Get a human-readable label for the normalized status.
 */
function getStatusLabel(status: ExternalTrackingResult['status']): string {
    const labels: Record<ExternalTrackingResult['status'], string> = {
        delivered: 'Delivered',
        in_transit: 'In Transit',
        out_for_delivery: 'Pick Up / Out for Delivery',
        pending: 'Not Found / Pending',
        exception: 'Exception / Alert',
        unknown: 'Unknown',
    };
    return labels[status] || 'Unknown';
}

/**
 * Register tracking numbers with 17track (required before getting info).
 * Must be called first — 17track needs to register and start tracking.
 */
async function register17Track(trackingNumbers: string[], apiKey: string): Promise<boolean> {
    try {
        const body = trackingNumbers.map(num => ({
            number: num,
            carrier: 0, // auto-detect
        }));

        const response = await fetch('https://api.17track.net/track/v2.2/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                '17token': apiKey,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            console.log(`[TrackingFetcher] 17track register returned: ${response.status}`);
            return false;
        }

        const data = await response.json();
        console.log(`[TrackingFetcher] 17track register result:`, JSON.stringify(data));
        return true;
    } catch (error: any) {
        console.log(`[TrackingFetcher] 17track register failed: ${error.message}`);
        return false;
    }
}

/**
 * Fetch tracking info from 17track's official API.
 * Returns detailed tracking events, status, and delivery dates.
 */
async function fetchFrom17TrackAPI(
    trackingNumbers: string[],
    apiKey: string
): Promise<Map<string, { status: number; events: any[]; deliveredAt?: string; lastEvent?: any }>> {
    const results = new Map<string, { status: number; events: any[]; deliveredAt?: string; lastEvent?: any }>();

    try {
        const body = trackingNumbers.map(num => ({
            number: num,
            carrier: 0,
        }));

        const response = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                '17token': apiKey,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            console.log(`[TrackingFetcher] 17track gettrackinfo returned: ${response.status}`);
            return results;
        }

        const data = await response.json();

        if (data?.data?.accepted && Array.isArray(data.data.accepted)) {
            for (const item of data.data.accepted) {
                const trackNum = item.number;
                const trackInfo = item.track_info;

                if (trackInfo) {
                    const latestStatus = trackInfo.latest_status?.status ?? -1;
                    const events = trackInfo.tracking?.providers?.[0]?.events || [];
                    const latestEvent = trackInfo.latest_event;

                    // Try to get the delivered date from the last event with "delivered" status
                    let deliveredAt: string | undefined;
                    if (latestStatus === 40 && events.length > 0) {
                        // The most recent event is the delivery event
                        deliveredAt = events[0]?.time_iso || events[0]?.time_utc;
                    }

                    results.set(trackNum, {
                        status: latestStatus,
                        events,
                        deliveredAt,
                        lastEvent: latestEvent,
                    });
                }
            }
        }

        // Also handle "rejected" items (already registered but trackable)
        if (data?.data?.rejected && Array.isArray(data.data.rejected)) {
            console.log(`[TrackingFetcher] 17track rejected items:`, data.data.rejected.length);
        }

    } catch (error: any) {
        console.log(`[TrackingFetcher] 17track gettrackinfo failed: ${error.message}`);
    }

    return results;
}

/**
 * Main function: Fetch external tracking details for a tracking number.
 */
export async function fetchExternalTracking(
    trackingNumber: string,
    shopifyCarrierName?: string | null,
    shopifyTrackingUrl?: string | null
): Promise<ExternalTrackingResult> {
    const carrierInfo = detectCarrier(trackingNumber);
    const universalUrls = getUniversalTrackingUrls(trackingNumber);

    // Base result from carrier detection
    const result: ExternalTrackingResult = {
        trackingNumber,
        carrier: shopifyCarrierName || carrierInfo.carrier,
        carrierCode: carrierInfo.carrierCode,
        status: 'unknown',
        statusLabel: 'Unknown',
        trackingUrl: shopifyTrackingUrl || carrierInfo.trackingUrl,
        universalTrackingUrls: universalUrls,
        events: [],
        lastUpdated: new Date().toISOString(),
        source: 'detection_only',
    };

    // If Shopify natively supports this carrier, no need for external fetch
    if (isShopifyNativeCarrier(trackingNumber, shopifyCarrierName || undefined)) {
        result.source = 'shopify';
        return result;
    }

    // Try 17track API if key is configured
    const apiKey = process.env.TRACKING_API_KEY || process.env.SEVENTEENTRACK_API_KEY || '';

    if (apiKey) {
        // First register the tracking number
        await register17Track([trackingNumber], apiKey);

        // Small delay to allow 17track to process
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Then fetch tracking info
        const trackData = await fetchFrom17TrackAPI([trackingNumber], apiKey);

        if (trackData.has(trackingNumber)) {
            const data = trackData.get(trackingNumber)!;

            result.source = '17track';
            result.status = normalize17TrackStatus(data.status);
            result.statusLabel = getStatusLabel(result.status);

            if (data.deliveredAt) {
                result.deliveredAt = data.deliveredAt;
            }

            // Map 17track events to our format
            if (data.events && data.events.length > 0) {
                result.events = data.events.map((event: any) => ({
                    timestamp: event.time_iso || event.time_utc || '',
                    status: event.status?.toString() || '',
                    description: event.description || event.details || '',
                    location: event.location || '',
                }));
            }

            // If we have a last event, also use it
            if (data.lastEvent) {
                if (!result.events.length) {
                    result.events.push({
                        timestamp: data.lastEvent.time_iso || data.lastEvent.time_utc || '',
                        status: data.lastEvent.status?.toString() || '',
                        description: data.lastEvent.description || data.lastEvent.details || '',
                        location: data.lastEvent.location || '',
                    });
                }
            }

            return result;
        }
    } else {
        console.log('[TrackingFetcher] No TRACKING_API_KEY configured. Set TRACKING_API_KEY in .env for 17track API data.');
    }

    // No external data available — provide detection-only results with tracking links
    result.status = 'pending';
    result.statusLabel = 'Track via links below';
    result.source = 'detection_only';

    return result;
}

/**
 * Batch fetch tracking details for multiple tracking numbers.
 * Optimized to use a single 17track API call for up to 40 numbers.
 */
export async function fetchExternalTrackingBatch(
    trackingNumbers: Array<{
        number: string;
        carrier?: string | null;
        url?: string | null;
    }>
): Promise<Map<string, ExternalTrackingResult>> {
    const results = new Map<string, ExternalTrackingResult>();
    const apiKey = process.env.TRACKING_API_KEY || process.env.SEVENTEENTRACK_API_KEY || '';

    // Separate native vs non-native carriers
    const nativeNums: typeof trackingNumbers = [];
    const externalNums: typeof trackingNumbers = [];

    for (const tn of trackingNumbers) {
        if (isShopifyNativeCarrier(tn.number, tn.carrier || undefined)) {
            nativeNums.push(tn);
        } else {
            externalNums.push(tn);
        }
    }

    // Handle native carriers (just detection)
    for (const tn of nativeNums) {
        const carrierInfo = detectCarrier(tn.number);
        results.set(tn.number, {
            trackingNumber: tn.number,
            carrier: tn.carrier || carrierInfo.carrier,
            carrierCode: carrierInfo.carrierCode,
            status: 'unknown',
            statusLabel: 'Tracked by Shopify',
            trackingUrl: tn.url || carrierInfo.trackingUrl,
            universalTrackingUrls: getUniversalTrackingUrls(tn.number),
            events: [],
            lastUpdated: new Date().toISOString(),
            source: 'shopify',
        });
    }

    // Handle external carriers
    if (externalNums.length > 0 && apiKey) {
        // Register all external numbers
        const nums = externalNums.map(t => t.number);
        await register17Track(nums, apiKey);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Fetch in batches of 40 (17track limit)
        const BATCH_SIZE = 40;
        for (let i = 0; i < nums.length; i += BATCH_SIZE) {
            const batch = nums.slice(i, i + BATCH_SIZE);
            const trackData = await fetchFrom17TrackAPI(batch, apiKey);

            for (const tn of externalNums.slice(i, i + BATCH_SIZE)) {
                const carrierInfo = detectCarrier(tn.number);
                const universalUrls = getUniversalTrackingUrls(tn.number);

                const result: ExternalTrackingResult = {
                    trackingNumber: tn.number,
                    carrier: tn.carrier || carrierInfo.carrier,
                    carrierCode: carrierInfo.carrierCode,
                    status: 'unknown',
                    statusLabel: 'Unknown',
                    trackingUrl: tn.url || carrierInfo.trackingUrl,
                    universalTrackingUrls: universalUrls,
                    events: [],
                    lastUpdated: new Date().toISOString(),
                    source: 'detection_only',
                };

                if (trackData.has(tn.number)) {
                    const data = trackData.get(tn.number)!;
                    result.source = '17track';
                    result.status = normalize17TrackStatus(data.status);
                    result.statusLabel = getStatusLabel(result.status);

                    if (data.deliveredAt) {
                        result.deliveredAt = data.deliveredAt;
                    }

                    if (data.events?.length > 0) {
                        result.events = data.events.map((event: any) => ({
                            timestamp: event.time_iso || event.time_utc || '',
                            status: event.status?.toString() || '',
                            description: event.description || event.details || '',
                            location: event.location || '',
                        }));
                    }
                }

                results.set(tn.number, result);
            }
        }
    } else {
        // No API key — just use detection
        for (const tn of externalNums) {
            const carrierInfo = detectCarrier(tn.number);
            results.set(tn.number, {
                trackingNumber: tn.number,
                carrier: tn.carrier || carrierInfo.carrier,
                carrierCode: carrierInfo.carrierCode,
                status: 'pending',
                statusLabel: 'Track via links below',
                trackingUrl: tn.url || carrierInfo.trackingUrl,
                universalTrackingUrls: getUniversalTrackingUrls(tn.number),
                events: [],
                lastUpdated: new Date().toISOString(),
                source: 'detection_only',
            });
        }
    }

    return results;
}
