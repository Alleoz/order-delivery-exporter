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
 * Normalize status strings from 17track API v2.2.
 * The API returns status as a string like "Delivered", "InTransit", etc.
 */
function normalize17TrackStatus(statusStr: string): ExternalTrackingResult['status'] {
    const normalized = (statusStr || '').toLowerCase().replace(/[_\s-]/g, '');
    if (normalized.includes('delivered')) return 'delivered';
    if (normalized.includes('intransit') || normalized.includes('transit')) return 'in_transit';
    if (normalized.includes('pickup') || normalized.includes('outfordelivery')) return 'out_for_delivery';
    if (normalized.includes('notfound') || normalized.includes('pending')) return 'pending';
    if (normalized.includes('expired') || normalized.includes('exception') ||
        normalized.includes('alert') || normalized.includes('undelivered') ||
        normalized.includes('returned')) return 'exception';
    return 'unknown';
}

/**
 * Get a human-readable label for the normalized status.
 */
function getStatusLabel(status: ExternalTrackingResult['status']): string {
    const labels: Record<ExternalTrackingResult['status'], string> = {
        delivered: 'Delivered',
        in_transit: 'In Transit',
        out_for_delivery: 'Out for Delivery',
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
 * Parse a single 17track API track_info response into our internal format.
 */
interface Parsed17TrackData {
    status: string;
    statusLabel: string;
    events: ExternalTrackingEvent[];
    deliveredAt?: string;
    latestDescription?: string;
    latestLocation?: string;
}

function parse17TrackInfo(trackInfo: any): Parsed17TrackData {
    // Extract status — it's a string like "Delivered", "InTransit"
    const latestStatusStr = trackInfo.latest_status?.status || '';
    const latestEvent = trackInfo.latest_event;
    const providers = trackInfo.tracking?.providers || [];
    const events: ExternalTrackingEvent[] = [];

    // Parse events from providers
    for (const provider of providers) {
        if (provider.events && Array.isArray(provider.events)) {
            for (const evt of provider.events) {
                events.push({
                    timestamp: evt.time_iso || evt.time_utc || '',
                    status: evt.sub_status || evt.stage || '',
                    description: evt.description || '',
                    location: evt.location || evt.address?.city || '',
                });
            }
        }
    }

    // Get delivered date — if status is "Delivered", use the latest event time
    let deliveredAt: string | undefined;
    const normalizedStatus = normalize17TrackStatus(latestStatusStr);
    if (normalizedStatus === 'delivered') {
        // Use latest event time as delivery date
        if (latestEvent?.time_iso) {
            deliveredAt = latestEvent.time_iso;
        } else if (events.length > 0) {
            deliveredAt = events[0].timestamp;
        }
    }

    return {
        status: latestStatusStr,
        statusLabel: getStatusLabel(normalizedStatus),
        events,
        deliveredAt,
        latestDescription: latestEvent?.description || '',
        latestLocation: latestEvent?.location || latestEvent?.address?.city || '',
    };
}

/**
 * Fetch tracking info from 17track's official API.
 * Returns detailed tracking events, status, and delivery dates.
 */
async function fetchFrom17TrackAPI(
    trackingNumbers: string[],
    apiKey: string
): Promise<Map<string, Parsed17TrackData>> {
    const results = new Map<string, Parsed17TrackData>();

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
                    results.set(trackNum, parse17TrackInfo(trackInfo));
                }
            }
        }

        // Log rejected items for debugging
        if (data?.data?.rejected && Array.isArray(data.data.rejected)) {
            for (const rej of data.data.rejected) {
                console.log(`[TrackingFetcher] 17track rejected ${rej.number}: ${rej.error?.message || 'unknown error'}`);
            }
        }

    } catch (error: any) {
        console.log(`[TrackingFetcher] 17track gettrackinfo failed: ${error.message}`);
    }

    return results;
}

/**
 * Main function: Fetch external tracking details for a single tracking number.
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

        // Wait for 17track to process
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Fetch tracking info
        const trackData = await fetchFrom17TrackAPI([trackingNumber], apiKey);

        if (trackData.has(trackingNumber)) {
            const data = trackData.get(trackingNumber)!;
            result.source = '17track';
            result.status = normalize17TrackStatus(data.status);
            result.statusLabel = data.statusLabel;
            result.events = data.events;

            if (data.deliveredAt) {
                result.deliveredAt = data.deliveredAt;
            }

            return result;
        }
    } else {
        console.log('[TrackingFetcher] No TRACKING_API_KEY configured. Set TRACKING_API_KEY in .env for 17track API data.');
    }

    // No external data available — return detection-only results with tracking links
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

    // Handle native carriers (just carrier detection, no API call)
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

    // Handle external carriers with 17track API
    if (externalNums.length > 0 && apiKey) {
        const nums = externalNums.map(t => t.number);

        // Register all external numbers first
        await register17Track(nums, apiKey);

        // Wait for 17track to process registrations
        await new Promise(resolve => setTimeout(resolve, 3000));

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
                    result.statusLabel = data.statusLabel;
                    result.events = data.events;

                    if (data.deliveredAt) {
                        result.deliveredAt = data.deliveredAt;
                    }
                }

                results.set(tn.number, result);
            }
        }
    } else {
        // No API key — just use carrier detection with tracking links
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
