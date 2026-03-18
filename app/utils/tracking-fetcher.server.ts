/**
 * External Tracking Fetcher Service
 * Server-side service to fetch delivery details from 17track's official API
 * for carriers that Shopify doesn't natively track.
 *
 * IMPORTANT: 17track QUOTA EXPLAINED
 * - Quota is ONLY consumed when you REGISTER a new tracking number
 * - Once registered, gettrackinfo calls are FREE and unlimited
 * - Free tier: 200 registrations (one-time)
 * - We track which numbers have been registered to avoid re-registering
 *
 * SETUP:
 * 1. Sign up at https://api.17track.net
 * 2. Add TRACKING_API_KEY=your_key to .env
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

// =====================================================================
// IN-MEMORY CACHE
// Tracks which numbers have been registered with 17track to avoid
// wasting quota on re-registration. Also caches tracking results
// to speed up repeated exports.
// =====================================================================

/** Set of tracking numbers already registered with 17track */
const registeredNumbers = new Set<string>();

/** Cache of tracking results (key: tracking number). Cleared after 30 min. */
const trackingCache = new Map<string, { result: ExternalTrackingResult; cachedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCachedResult(trackingNumber: string): ExternalTrackingResult | null {
    const entry = trackingCache.get(trackingNumber);
    if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) {
        return entry.result;
    }
    if (entry) {
        trackingCache.delete(trackingNumber); // expired
    }
    return null;
}

function setCachedResult(trackingNumber: string, result: ExternalTrackingResult): void {
    trackingCache.set(trackingNumber, { result, cachedAt: Date.now() });
}

// =====================================================================
// STATUS NORMALIZATION
// =====================================================================

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

// =====================================================================
// 17TRACK API CALLS
// =====================================================================

/**
 * Register tracking numbers with 17track.
 * ONLY registers numbers NOT already in our registeredNumbers set.
 * Returns the count of newly registered numbers (quota consumed).
 */
async function register17Track(trackingNumbers: string[], apiKey: string): Promise<number> {
    // Filter out already-registered numbers to save quota
    const newNumbers = trackingNumbers.filter(n => !registeredNumbers.has(n));

    if (newNumbers.length === 0) {
        console.log('[TrackingFetcher] All numbers already registered, skipping registration (0 quota used)');
        return 0;
    }

    console.log(`[TrackingFetcher] Registering ${newNumbers.length} NEW numbers (${trackingNumbers.length - newNumbers.length} already registered, saving quota)`);

    try {
        const body = newNumbers.map(num => ({
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
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            console.log(`[TrackingFetcher] 17track register returned: ${response.status}`);
            return 0;
        }

        const data = await response.json();
        let newlyRegistered = 0;

        // Mark accepted numbers as registered
        if (data?.data?.accepted) {
            for (const item of data.data.accepted) {
                registeredNumbers.add(item.number);
                newlyRegistered++;
            }
        }

        // Numbers rejected with "already exists" error are ALSO registered
        // (they were registered in a previous session before server restart)
        if (data?.data?.rejected) {
            for (const item of data.data.rejected) {
                // Error code -18019901 means "number already registered"
                registeredNumbers.add(item.number);
            }
        }

        console.log(`[TrackingFetcher] Registered ${newlyRegistered} new numbers. Total known registered: ${registeredNumbers.size}`);
        return newlyRegistered;
    } catch (error: any) {
        console.log(`[TrackingFetcher] 17track register failed: ${error.message}`);
        return 0;
    }
}

/**
 * Parse a single 17track API track_info response.
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
    const latestStatusStr = trackInfo.latest_status?.status || '';
    const latestEvent = trackInfo.latest_event;
    const providers = trackInfo.tracking?.providers || [];
    const events: ExternalTrackingEvent[] = [];

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

    let deliveredAt: string | undefined;
    const normalizedStatus = normalize17TrackStatus(latestStatusStr);
    if (normalizedStatus === 'delivered') {
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
 * Fetch tracking info from 17track. This does NOT consume quota.
 * Can be called unlimited times after numbers are registered.
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
                if (item.track_info) {
                    results.set(item.number, parse17TrackInfo(item.track_info));
                }
            }
        }

        if (data?.data?.rejected && Array.isArray(data.data.rejected)) {
            for (const rej of data.data.rejected) {
                console.log(`[TrackingFetcher] gettrackinfo rejected ${rej.number}: ${rej.error?.message || 'unknown'}`);
            }
        }
    } catch (error: any) {
        console.log(`[TrackingFetcher] 17track gettrackinfo failed: ${error.message}`);
    }

    return results;
}

// =====================================================================
// PUBLIC API
// =====================================================================

/**
 * Fetch external tracking for a single tracking number.
 */
export async function fetchExternalTracking(
    trackingNumber: string,
    shopifyCarrierName?: string | null,
    shopifyTrackingUrl?: string | null
): Promise<ExternalTrackingResult> {
    const carrierInfo = detectCarrier(trackingNumber);
    const universalUrls = getUniversalTrackingUrls(trackingNumber);

    // Check cache first
    const cached = getCachedResult(trackingNumber);
    if (cached) {
        return cached;
    }

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

    if (isShopifyNativeCarrier(trackingNumber, shopifyCarrierName || undefined)) {
        result.source = 'shopify';
        setCachedResult(trackingNumber, result);
        return result;
    }

    const apiKey = process.env.TRACKING_API_KEY || process.env.SEVENTEENTRACK_API_KEY || '';

    if (apiKey) {
        await register17Track([trackingNumber], apiKey);

        // Wait only if this was newly registered
        if (!registeredNumbers.has(trackingNumber)) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const trackData = await fetchFrom17TrackAPI([trackingNumber], apiKey);

        if (trackData.has(trackingNumber)) {
            const data = trackData.get(trackingNumber)!;
            result.source = '17track';
            result.status = normalize17TrackStatus(data.status);
            result.statusLabel = data.statusLabel;
            result.events = data.events;
            if (data.deliveredAt) result.deliveredAt = data.deliveredAt;
        }
    }

    setCachedResult(trackingNumber, result);
    return result;
}

/**
 * Batch fetch tracking for multiple tracking numbers.
 * Optimized: uses cache, only registers new numbers, fetches in batches of 40.
 * 
 * QUOTA USAGE: Only NEW tracking numbers consume quota (registration).
 *              Once registered, all subsequent exports are FREE.
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

    // Separate native vs external, check cache
    const needsFetch: typeof trackingNumbers = [];

    for (const tn of trackingNumbers) {
        // Check cache first
        const cached = getCachedResult(tn.number);
        if (cached) {
            results.set(tn.number, cached);
            continue;
        }

        if (isShopifyNativeCarrier(tn.number, tn.carrier || undefined)) {
            const carrierInfo = detectCarrier(tn.number);
            const result: ExternalTrackingResult = {
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
            };
            results.set(tn.number, result);
            setCachedResult(tn.number, result);
        } else {
            needsFetch.push(tn);
        }
    }

    if (needsFetch.length === 0) {
        console.log('[TrackingFetcher] All results served from cache');
        return results;
    }

    // Fetch from 17track API
    if (apiKey) {
        const nums = needsFetch.map(t => t.number);

        // Register (only new numbers will actually be registered)
        const newlyRegistered = await register17Track(nums, apiKey);

        // Wait only if we registered new numbers
        if (newlyRegistered > 0) {
            console.log(`[TrackingFetcher] Waiting for 17track to process ${newlyRegistered} new registrations...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Fetch in batches of 40 (17track limit per request)
        const BATCH_SIZE = 40;
        for (let i = 0; i < nums.length; i += BATCH_SIZE) {
            const batch = nums.slice(i, i + BATCH_SIZE);
            const trackData = await fetchFrom17TrackAPI(batch, apiKey);

            for (const tn of needsFetch.slice(i, i + BATCH_SIZE)) {
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
                    if (data.deliveredAt) result.deliveredAt = data.deliveredAt;
                }

                results.set(tn.number, result);
                setCachedResult(tn.number, result);
            }
        }
    } else {
        // No API key — detection only
        for (const tn of needsFetch) {
            const carrierInfo = detectCarrier(tn.number);
            const result: ExternalTrackingResult = {
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
            };
            results.set(tn.number, result);
        }
    }

    return results;
}
