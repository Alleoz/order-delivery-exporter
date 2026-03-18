/**
 * External Tracking Fetcher Service
 * Server-side service to fetch delivery details from 17track API
 * for carriers that Shopify doesn't natively track.
 *
 * QUOTA STRATEGY:
 * - gettrackinfo is FREE for already-registered numbers (unlimited queries)
 * - Only register() consumes quota (200 free, then paid plans)
 * - We try gettrackinfo FIRST and only register numbers that get rejected
 * - This means older orders that were already registered are always free
 * - Set TRACKING_API_KEY in .env for 17track API access
 *
 * Without an API key: falls back to carrier detection + tracking links
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
// IN-MEMORY CACHE (survives across requests within the same server instance)
// =====================================================================

/** Cache of tracking results. Cleared after TTL. */
const trackingCache = new Map<string, { result: ExternalTrackingResult; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCachedResult(trackingNumber: string): ExternalTrackingResult | null {
    const entry = trackingCache.get(trackingNumber);
    if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) {
        return entry.result;
    }
    if (entry) trackingCache.delete(trackingNumber);
    return null;
}

function setCachedResult(trackingNumber: string, result: ExternalTrackingResult): void {
    trackingCache.set(trackingNumber, { result, cachedAt: Date.now() });
}

// =====================================================================
// STATUS NORMALIZATION
// =====================================================================

function normalize17TrackStatus(statusStr: string): ExternalTrackingResult['status'] {
    const s = (statusStr || '').toLowerCase().replace(/[_\s-]/g, '');
    if (s.includes('delivered')) return 'delivered';
    if (s.includes('intransit') || s.includes('transit')) return 'in_transit';
    if (s.includes('pickup') || s.includes('outfordelivery')) return 'out_for_delivery';
    if (s.includes('notfound') || s.includes('pending')) return 'pending';
    if (s.includes('expired') || s.includes('exception') || s.includes('alert') ||
        s.includes('undelivered') || s.includes('returned')) return 'exception';
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
// 17TRACK API
// =====================================================================

interface Parsed17TrackData {
    status: string;
    statusLabel: string;
    events: ExternalTrackingEvent[];
    deliveredAt?: string;
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
        deliveredAt = latestEvent?.time_iso || (events.length > 0 ? events[0].timestamp : undefined);
    }

    return {
        status: latestStatusStr,
        statusLabel: getStatusLabel(normalizedStatus),
        events,
        deliveredAt,
    };
}

/**
 * Step 1: Try gettrackinfo FIRST (free, no quota consumed).
 * Returns data for already-registered numbers.
 * Returns list of rejected (unregistered) numbers that need registration.
 */
async function tryGetTrackInfo(
    trackingNumbers: string[],
    apiKey: string
): Promise<{ data: Map<string, Parsed17TrackData>; unregistered: string[] }> {
    const data = new Map<string, Parsed17TrackData>();
    const unregistered: string[] = [];

    try {
        const body = trackingNumbers.map(num => ({ number: num, carrier: 0 }));
        const response = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', '17token': apiKey },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            console.log(`[TrackingFetcher] gettrackinfo HTTP ${response.status}`);
            return { data, unregistered: trackingNumbers };
        }

        const result = await response.json();

        // Accepted = already registered, has tracking data
        for (const item of (result?.data?.accepted || [])) {
            if (item.track_info) {
                data.set(item.number, parse17TrackInfo(item.track_info));
            }
        }

        // Rejected = not registered yet (error code -18019902)
        for (const item of (result?.data?.rejected || [])) {
            if (item.error?.code === -18019902) {
                unregistered.push(item.number);
            }
        }

        console.log(`[TrackingFetcher] gettrackinfo: ${data.size} with data, ${unregistered.length} need registration`);
    } catch (error: any) {
        console.log(`[TrackingFetcher] gettrackinfo failed: ${error.message}`);
        return { data, unregistered: trackingNumbers };
    }

    return { data, unregistered };
}

/**
 * Step 2: Register new tracking numbers (consumes quota).
 * Only called for numbers not yet registered.
 */
async function registerNumbers(
    trackingNumbers: string[],
    apiKey: string
): Promise<{ registered: number; quotaRemain: number }> {
    if (trackingNumbers.length === 0) return { registered: 0, quotaRemain: -1 };

    try {
        const body = trackingNumbers.map(num => ({ number: num, carrier: 0 }));
        const response = await fetch('https://api.17track.net/track/v2.2/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', '17token': apiKey },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            console.log(`[TrackingFetcher] register HTTP ${response.status}`);
            return { registered: 0, quotaRemain: -1 };
        }

        const result = await response.json();
        const accepted = result?.data?.accepted?.length || 0;
        const rejected = result?.data?.rejected?.length || 0;

        console.log(`[TrackingFetcher] Registered ${accepted} new numbers (${rejected} already existed). Quota used: ${accepted}`);

        // Check remaining quota
        let quotaRemain = -1;
        try {
            const quotaRes = await fetch('https://api.17track.net/track/v2.2/getquota', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', '17token': apiKey },
                body: '{}',
                signal: AbortSignal.timeout(5000),
            });
            const quotaData = await quotaRes.json();
            quotaRemain = quotaData?.data?.quota_remain ?? -1;
            console.log(`[TrackingFetcher] Quota remaining: ${quotaRemain}`);
        } catch { /* ignore quota check errors */ }

        return { registered: accepted, quotaRemain };
    } catch (error: any) {
        console.log(`[TrackingFetcher] register failed: ${error.message}`);
        return { registered: 0, quotaRemain: -1 };
    }
}

/**
 * Step 3: Fetch tracking info for newly registered numbers.
 * Called after register + delay.
 */
async function fetchNewlyRegistered(
    trackingNumbers: string[],
    apiKey: string
): Promise<Map<string, Parsed17TrackData>> {
    if (trackingNumbers.length === 0) return new Map();

    // 17track needs time to process newly registered numbers
    await new Promise(resolve => setTimeout(resolve, 3000));

    const { data } = await tryGetTrackInfo(trackingNumbers, apiKey);
    return data;
}

// =====================================================================
// PUBLIC API
// =====================================================================

function buildResult(
    trackingNumber: string,
    carrier: string | null | undefined,
    url: string | null | undefined,
    source: ExternalTrackingResult['source'],
    trackData?: Parsed17TrackData
): ExternalTrackingResult {
    const carrierInfo = detectCarrier(trackingNumber);
    const universalUrls = getUniversalTrackingUrls(trackingNumber);

    const result: ExternalTrackingResult = {
        trackingNumber,
        carrier: carrier || carrierInfo.carrier,
        carrierCode: carrierInfo.carrierCode,
        status: 'unknown',
        statusLabel: 'Unknown',
        trackingUrl: url || carrierInfo.trackingUrl,
        universalTrackingUrls: universalUrls,
        events: [],
        lastUpdated: new Date().toISOString(),
        source,
    };

    if (trackData) {
        result.source = '17track';
        result.status = normalize17TrackStatus(trackData.status);
        result.statusLabel = trackData.statusLabel;
        result.events = trackData.events;
        if (trackData.deliveredAt) result.deliveredAt = trackData.deliveredAt;
    }

    return result;
}

/**
 * Fetch external tracking for a single tracking number.
 */
export async function fetchExternalTracking(
    trackingNumber: string,
    shopifyCarrierName?: string | null,
    shopifyTrackingUrl?: string | null
): Promise<ExternalTrackingResult> {
    const cached = getCachedResult(trackingNumber);
    if (cached) return cached;

    if (isShopifyNativeCarrier(trackingNumber, shopifyCarrierName || undefined)) {
        const result = buildResult(trackingNumber, shopifyCarrierName, shopifyTrackingUrl, 'shopify');
        setCachedResult(trackingNumber, result);
        return result;
    }

    const apiKey = process.env.TRACKING_API_KEY || process.env.SEVENTEENTRACK_API_KEY || '';

    if (apiKey) {
        // Try gettrackinfo first (free)
        const { data, unregistered } = await tryGetTrackInfo([trackingNumber], apiKey);

        if (data.has(trackingNumber)) {
            const result = buildResult(trackingNumber, shopifyCarrierName, shopifyTrackingUrl, '17track', data.get(trackingNumber));
            setCachedResult(trackingNumber, result);
            return result;
        }

        // Register if needed (uses quota) and retry
        if (unregistered.includes(trackingNumber)) {
            await registerNumbers([trackingNumber], apiKey);
            const newData = await fetchNewlyRegistered([trackingNumber], apiKey);
            if (newData.has(trackingNumber)) {
                const result = buildResult(trackingNumber, shopifyCarrierName, shopifyTrackingUrl, '17track', newData.get(trackingNumber));
                setCachedResult(trackingNumber, result);
                return result;
            }
        }
    }

    // Fallback: detection only with tracking links
    const result = buildResult(trackingNumber, shopifyCarrierName, shopifyTrackingUrl, 'detection_only');
    result.status = 'pending';
    result.statusLabel = 'Track via links below';
    return result;
}

/**
 * Batch fetch tracking for multiple tracking numbers.
 *
 * STRATEGY:
 * 1. Check cache → return cached results instantly
 * 2. Call gettrackinfo for all non-cached numbers (FREE, no quota)
 *    → Returns data for already-registered numbers
 * 3. For rejected (unregistered) numbers → register them (uses quota)
 * 4. After registration → call gettrackinfo again for the new ones
 *
 * Net result: only truly new tracking numbers consume quota.
 * Re-exports of the same orders are 100% free.
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

    // Step 0: Check cache and separate native vs external
    const needsFetch: typeof trackingNumbers = [];

    for (const tn of trackingNumbers) {
        const cached = getCachedResult(tn.number);
        if (cached) {
            results.set(tn.number, cached);
            continue;
        }

        if (isShopifyNativeCarrier(tn.number, tn.carrier || undefined)) {
            const result = buildResult(tn.number, tn.carrier, tn.url, 'shopify');
            results.set(tn.number, result);
            setCachedResult(tn.number, result);
        } else {
            needsFetch.push(tn);
        }
    }

    if (needsFetch.length === 0 || !apiKey) {
        // No API key or nothing to fetch — add detection-only results
        for (const tn of needsFetch) {
            const result = buildResult(tn.number, tn.carrier, tn.url, 'detection_only');
            result.status = 'pending';
            result.statusLabel = 'Track via links below';
            results.set(tn.number, result);
        }
        if (!apiKey && needsFetch.length > 0) {
            console.log('[TrackingFetcher] No TRACKING_API_KEY set. Add to .env for tracking data.');
        }
        return results;
    }

    console.log(`[TrackingFetcher] Fetching ${needsFetch.length} external tracking numbers...`);

    // Build a lookup map for carrier/url info
    const infoMap = new Map(needsFetch.map(tn => [tn.number, tn]));
    const allNums = needsFetch.map(t => t.number);

    // Step 1: Try gettrackinfo FIRST (free) in batches of 40
    const BATCH_SIZE = 40;
    const allUnregistered: string[] = [];

    for (let i = 0; i < allNums.length; i += BATCH_SIZE) {
        const batch = allNums.slice(i, i + BATCH_SIZE);
        const { data, unregistered } = await tryGetTrackInfo(batch, apiKey);

        // Process results
        for (const [num, trackData] of data) {
            const info = infoMap.get(num);
            const result = buildResult(num, info?.carrier, info?.url, '17track', trackData);
            results.set(num, result);
            setCachedResult(num, result);
        }

        allUnregistered.push(...unregistered);
    }

    // Step 2: Register unregistered numbers (uses quota)
    if (allUnregistered.length > 0) {
        console.log(`[TrackingFetcher] ${allUnregistered.length} numbers need registration (will use quota)...`);
        const { registered, quotaRemain } = await registerNumbers(allUnregistered, apiKey);

        if (registered > 0) {
            // Step 3: Fetch newly registered numbers
            const newlyRegisteredData = await fetchNewlyRegistered(allUnregistered, apiKey);

            for (const [num, trackData] of newlyRegisteredData) {
                const info = infoMap.get(num);
                const result = buildResult(num, info?.carrier, info?.url, '17track', trackData);
                results.set(num, result);
                setCachedResult(num, result);
            }
        }

        // For any that still don't have data, add detection-only
        for (const num of allUnregistered) {
            if (!results.has(num)) {
                const info = infoMap.get(num);
                const result = buildResult(num, info?.carrier, info?.url, 'detection_only');
                result.status = 'pending';
                result.statusLabel = 'Recently registered - data available on next export';
                results.set(num, result);
            }
        }
    }

    console.log(`[TrackingFetcher] Batch complete: ${results.size} results (${trackingCache.size} cached total)`);
    return results;
}
