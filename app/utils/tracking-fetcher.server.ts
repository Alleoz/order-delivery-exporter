/**
 * External Tracking Fetcher Service
 * Server-side service to fetch delivery details from external tracking platforms
 * when Shopify's native fulfillment tracking doesn't provide data.
 *
 * This handles carriers that Shopify doesn't natively integrate with,
 * such as Chinese logistics carriers (ZC, LP, LS prefix tracking numbers).
 *
 * Strategy:
 * 1. Try to scrape tracking info from 17track's public lookup
 * 2. Fall back to generic carrier detection + tracking URL generation
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
    events: ExternalTrackingEvent[];
    lastUpdated: string;
    source: 'shopify' | 'external' | 'detection_only';
}

/**
 * Normalize status strings from various sources into a standard status.
 */
function normalizeStatus(rawStatus: string): ExternalTrackingResult['status'] {
    const s = rawStatus.toLowerCase().trim();

    if (s.includes('deliver') && !s.includes('out for')) return 'delivered';
    if (s.includes('out for delivery') || s.includes('out_for_delivery')) return 'out_for_delivery';
    if (s.includes('transit') || s.includes('shipping') || s.includes('departed') || s.includes('arrived') || s.includes('customs')) return 'in_transit';
    if (s.includes('exception') || s.includes('fail') || s.includes('return')) return 'exception';
    if (s.includes('pending') || s.includes('pre') || s.includes('info received') || s.includes('label') || s.includes('created')) return 'pending';

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
        pending: 'Pending / Info Received',
        exception: 'Exception',
        unknown: 'Unknown',
    };
    return labels[status] || 'Unknown';
}

/**
 * Try to fetch tracking details from 17track's public API.
 * This is the best free option for international tracking numbers.
 *
 * Note: 17track's public web interface doesn't have a simple REST API,
 * so we use their track endpoint format for basic info.
 */
async function fetchFrom17Track(trackingNumber: string): Promise<ExternalTrackingEvent[] | null> {
    try {
        // 17track's public register endpoint
        const response = await fetch('https://api.17track.net/track/v2.2/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify([
                { number: trackingNumber }
            ]),
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
            console.log('[TrackingFetcher] 17track register endpoint returned:', response.status);
            return null;
        }

        // The register endpoint just confirms registration,
        // actual details need a follow-up call or webhook.
        // For now, we return null and rely on the detection-based approach.
        return null;
    } catch (error: any) {
        console.log('[TrackingFetcher] 17track fetch failed:', error.message);
        return null;
    }
}

/**
 * Try to fetch tracking data from ParcelsApp's public API.
 */
async function fetchFromParcelsApp(trackingNumber: string): Promise<ExternalTrackingEvent[] | null> {
    try {
        const response = await fetch(`https://parcelsapp.com/api/v3/shipments/tracking`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                trackingId: trackingNumber,
                language: 'en',
                country: 'US',
            }),
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
            console.log('[TrackingFetcher] ParcelsApp endpoint returned:', response.status);
            return null;
        }

        const data = await response.json();

        if (data?.states && Array.isArray(data.states)) {
            return data.states.map((state: any) => ({
                timestamp: state.date || new Date().toISOString(),
                status: state.status || 'unknown',
                description: state.text || state.status || 'No description',
                location: state.location || undefined,
            }));
        }

        return null;
    } catch (error: any) {
        console.log('[TrackingFetcher] ParcelsApp fetch failed:', error.message);
        return null;
    }
}

/**
 * Main function: Fetch external tracking details for a tracking number.
 *
 * This is the primary function to call from routes/components.
 * It will:
 * 1. Detect the carrier from the tracking number
 * 2. Attempt to fetch tracking events from external sources
 * 3. Return a structured result with the best available info
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

    // Try fetching from external sources
    let events: ExternalTrackingEvent[] | null = null;

    // Try 17track first
    events = await fetchFrom17Track(trackingNumber);

    // If 17track didn't return data, try ParcelsApp
    if (!events || events.length === 0) {
        events = await fetchFromParcelsApp(trackingNumber);
    }

    // If we got events from external sources, process them
    if (events && events.length > 0) {
        result.events = events;
        result.source = 'external';

        // Determine status from the latest event
        const latestEvent = events[0]; // Events should be newest first
        if (latestEvent) {
            result.status = normalizeStatus(latestEvent.status);
            result.statusLabel = getStatusLabel(result.status);
        }
    } else {
        // No external data available — provide best available info
        result.status = 'pending';
        result.statusLabel = 'Tracking Available';
        result.source = 'detection_only';
    }

    return result;
}

/**
 * Batch fetch tracking details for multiple tracking numbers.
 */
export async function fetchExternalTrackingBatch(
    trackingNumbers: Array<{
        number: string;
        carrier?: string | null;
        url?: string | null;
    }>
): Promise<Map<string, ExternalTrackingResult>> {
    const results = new Map<string, ExternalTrackingResult>();

    // Process in parallel with a concurrency limit of 5
    const BATCH_SIZE = 5;
    for (let i = 0; i < trackingNumbers.length; i += BATCH_SIZE) {
        const batch = trackingNumbers.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map((tn) => fetchExternalTracking(tn.number, tn.carrier, tn.url))
        );
        batchResults.forEach((result) => {
            results.set(result.trackingNumber, result);
        });
    }

    return results;
}
