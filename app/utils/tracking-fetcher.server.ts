/**
 * External Tracking Fetcher Service
 * Server-side service to fetch delivery details from 17track API
 * for carriers that Shopify doesn't natively track.
 *
 * QUOTA STRATEGY (optimized for 200+ orders/day):
 * - gettrackinfo is FREE for already-registered numbers (unlimited queries)
 * - Only register() consumes quota (200 free per period, then paid plans)
 * - We try gettrackinfo FIRST and only register numbers that get rejected
 * - Already-registered numbers are always free to query
 * - Set TRACKING_API_KEY in .env (or Vercel env vars) for 17track API access
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
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — keeps data fresh

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

function normalize17TrackStatus(statusInput: string | number): ExternalTrackingResult['status'] {
    // Handle numeric status codes from 17track API
    if (typeof statusInput === 'number') {
        switch (statusInput) {
            case 40: return 'delivered';
            case 10: return 'in_transit';
            case 30: return 'out_for_delivery';
            case 0: return 'pending';
            case 20: // expired
            case 35: // undelivered
            case 50: // exception/alert
                return 'exception';
            default: return 'unknown';
        }
    }

    // Handle string status from 17track API
    const s = (statusInput || '').toLowerCase().replace(/[_\s-]/g, '');
    if (s.includes('delivered') || s.includes('deliver')) return 'delivered';
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
// 17TRACK API - Response Parsing
// =====================================================================

interface Parsed17TrackData {
    status: ExternalTrackingResult['status'];
    statusLabel: string;
    events: ExternalTrackingEvent[];
    deliveredAt?: string;
}

/**
 * Parse tracking info from 17track API response.
 * The API can return events in several different structures
 * depending on the carrier, so we try multiple paths.
 */
function parse17TrackInfo(trackInfo: any): Parsed17TrackData {
    // === STATUS ===
    // Try multiple paths for the status field
    const latestStatusStr = trackInfo.latest_status?.status || '';
    const packageState = trackInfo.package_state;  // numeric status code
    const latestEvent = trackInfo.latest_event;

    // Use numeric package_state if available (more reliable), otherwise string
    const normalizedStatus = packageState !== undefined
        ? normalize17TrackStatus(packageState)
        : normalize17TrackStatus(latestStatusStr);

    // === EVENTS ===
    const events: ExternalTrackingEvent[] = [];
    const providers = trackInfo.tracking?.providers || [];

    for (const provider of providers) {
        // Try multiple array names for events
        const providerEvents = provider.events || provider.trackinfo || [];
        if (Array.isArray(providerEvents)) {
            for (const evt of providerEvents) {
                // Timestamp: try every possible field name
                const timestamp = evt.time_iso || evt.time_utc || evt.time
                    || evt.time_raw || evt.Date || '';

                // Description: try multiple fields
                const description = evt.description || evt.Details || evt.context
                    || evt.message || '';

                // Status: sub_status is most specific
                const status = evt.sub_status || evt.stage || evt.status
                    || evt.StatusDescription || '';

                // Location: try multiple location paths
                const location = evt.location
                    || (typeof evt.address === 'string' ? evt.address : evt.address?.city)
                    || evt.Location || '';

                if (timestamp || description) {
                    events.push({
                        timestamp,
                        status,
                        description: description || status,
                        location,
                    });
                }
            }
        }
    }

    // Fallback: if no events from providers, try latest_event directly
    if (events.length === 0 && latestEvent) {
        const timestamp = latestEvent.time_iso || latestEvent.time_utc
            || latestEvent.time || latestEvent.time_raw || '';
        const description = latestEvent.description || latestEvent.Details
            || latestEvent.context || '';
        const location = latestEvent.location
            || (typeof latestEvent.address === 'string' ? latestEvent.address : latestEvent.address?.city)
            || '';

        if (timestamp || description) {
            events.push({
                timestamp,
                status: latestStatusStr,
                description: description || latestStatusStr,
                location,
            });
        }
    }

    // === DELIVERED DATE ===
    let deliveredAt: string | undefined;
    if (normalizedStatus === 'delivered') {
        deliveredAt = latestEvent?.time_iso || latestEvent?.time_utc || latestEvent?.time
            || (events.length > 0 ? events[0].timestamp : undefined);
    }

    return {
        status: normalizedStatus,
        statusLabel: getStatusLabel(normalizedStatus),
        events,
        deliveredAt,
    };
}

// =====================================================================
// 17TRACK API - Network Calls
// =====================================================================

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

        // DEBUG: Log raw response structure for first item (helps diagnose parsing issues)
        if (result?.data?.accepted?.length > 0) {
            const sample = result.data.accepted[0];
            console.log(`[TrackingFetcher] DEBUG - Sample accepted number: ${sample.number}`);
            if (sample.track_info) {
                console.log(`[TrackingFetcher] DEBUG - track_info keys: ${JSON.stringify(Object.keys(sample.track_info))}`);
                if (sample.track_info.latest_status) {
                    console.log(`[TrackingFetcher] DEBUG - latest_status: ${JSON.stringify(sample.track_info.latest_status)}`);
                }
                if (sample.track_info.package_state !== undefined) {
                    console.log(`[TrackingFetcher] DEBUG - package_state: ${sample.track_info.package_state}`);
                }
                const providers = sample.track_info.tracking?.providers;
                if (providers?.[0]) {
                    const p = providers[0];
                    console.log(`[TrackingFetcher] DEBUG - provider keys: ${JSON.stringify(Object.keys(p))}`);
                    const evts = p.events || p.trackinfo;
                    if (evts?.[0]) {
                        console.log(`[TrackingFetcher] DEBUG - event keys: ${JSON.stringify(Object.keys(evts[0]))}`);
                        console.log(`[TrackingFetcher] DEBUG - event sample: ${JSON.stringify(evts[0])}`);
                    } else {
                        console.log(`[TrackingFetcher] DEBUG - NO events/trackinfo in provider. Provider data: ${JSON.stringify(p).substring(0, 300)}`);
                    }
                } else {
                    console.log(`[TrackingFetcher] DEBUG - NO providers found. tracking keys: ${JSON.stringify(Object.keys(sample.track_info.tracking || {}))}`);
                    // Log entire track_info for debugging
                    console.log(`[TrackingFetcher] DEBUG - Full track_info: ${JSON.stringify(sample.track_info).substring(0, 500)}`);
                }
            }
        }

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
            } else {
                console.log(`[TrackingFetcher] Rejected ${item.number} - error: ${JSON.stringify(item.error)}`);
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
 * Checks remaining quota before registration to avoid waste.
 *
 * IMPORTANT: Registration is fast but 17track needs a few seconds
 * to process the data. We do a quick retry after 3 seconds.
 * If data isn't ready yet, it'll be available on the next export.
 */
async function registerAndFetch(
    trackingNumbers: string[],
    apiKey: string
): Promise<{ data: Map<string, Parsed17TrackData>; quotaRemain: number; registeredCount: number }> {
    const data = new Map<string, Parsed17TrackData>();
    if (trackingNumbers.length === 0) return { data, quotaRemain: -1, registeredCount: 0 };

    // Check quota first
    let quotaRemain = -1;
    try {
        const quotaRes = await fetch('https://api.17track.net/track/v2.2/getquota', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', '17token': apiKey },
            body: '{}',
            signal: AbortSignal.timeout(3000),
        });
        const quotaData = await quotaRes.json();
        quotaRemain = quotaData?.data?.quota_remain ?? -1;
        console.log(`[TrackingFetcher] Quota remaining: ${quotaRemain}`);

        if (quotaRemain === 0) {
            console.log(`[TrackingFetcher] ⚠️ Quota exhausted! Skipping registration.`);
            return { data, quotaRemain: 0, registeredCount: 0 };
        }

        // Only register up to the remaining quota
        if (quotaRemain > 0 && trackingNumbers.length > quotaRemain) {
            trackingNumbers = trackingNumbers.slice(0, quotaRemain);
        }
    } catch { /* proceed with registration */ }

    // Register
    let registeredCount = 0;
    try {
        const body = trackingNumbers.map(num => ({ number: num, carrier: 0 }));
        const response = await fetch('https://api.17track.net/track/v2.2/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', '17token': apiKey },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(8000),
        });

        if (response.ok) {
            const result = await response.json();
            registeredCount = result?.data?.accepted?.length || 0;
            const alreadyRegistered = result?.data?.rejected?.length || 0;
            console.log(`[TrackingFetcher] Registered ${registeredCount} new, ${alreadyRegistered} already existed`);
        }
    } catch (error: any) {
        console.log(`[TrackingFetcher] register failed: ${error.message}`);
    }

    if (registeredCount === 0) {
        return { data, quotaRemain, registeredCount: 0 };
    }

    // Quick retry after 3 seconds — if data isn't ready, it'll be on next export
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        const result = await tryGetTrackInfo(trackingNumbers, apiKey);
        for (const [num, trackData] of result.data) {
            data.set(num, trackData);
        }
        console.log(`[TrackingFetcher] Got data for ${data.size}/${trackingNumbers.length} after registration`);
    } catch (error: any) {
        console.log(`[TrackingFetcher] Post-registration fetch failed: ${error.message}`);
    }

    return { data, quotaRemain, registeredCount };
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
        result.status = trackData.status;
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
            const { data: newData } = await registerAndFetch([trackingNumber], apiKey);
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
 * 3. For rejected (unregistered) numbers → register them (uses quota, checks quota first)
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

    // Step 2: Register unregistered numbers and try to fetch immediately
    if (allUnregistered.length > 0) {
        console.log(`[TrackingFetcher] ${allUnregistered.length} numbers need registration...`);
        const { data: newData, quotaRemain, registeredCount } = await registerAndFetch(allUnregistered, apiKey);

        for (const [num, trackData] of newData) {
            const info = infoMap.get(num);
            const result = buildResult(num, info?.carrier, info?.url, '17track', trackData);
            results.set(num, result);
            setCachedResult(num, result);
        }

        // For any that still don't have data, add helpful status
        for (const num of allUnregistered) {
            if (!results.has(num)) {
                const info = infoMap.get(num);
                const result = buildResult(num, info?.carrier, info?.url, 'detection_only');
                result.status = 'pending';
                if (quotaRemain === 0) {
                    result.statusLabel = 'Quota exhausted — track via links below';
                } else if (registeredCount > 0) {
                    result.statusLabel = 'Registered — export again in 1 min for full data';
                } else {
                    result.statusLabel = 'Track via links below';
                }
                results.set(num, result);
            }
        }
    }

    console.log(`[TrackingFetcher] Batch complete: ${results.size} results (${trackingCache.size} cached total)`);
    return results;
}
