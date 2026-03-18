/**
 * External Tracking Fetcher Service
 * Server-side service to fetch delivery details from 17track
 * for carriers that Shopify doesn't natively track.
 *
 * STRATEGY:
 * - Uses 17track's PUBLIC web endpoint (same as t.17track.net website)
 * - No API key required, no registration quota consumed
 * - No 200-number limit — unlimited lookups
 * - Falls back to carrier detection + tracking links if unavailable
 *
 * If TRACKING_API_KEY is set in .env, we also try the official API
 * as a secondary source for richer data.
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
    source: 'shopify' | '17track' | '17track_web' | 'detection_only';
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

/**
 * 17track package status codes (used by both web and API endpoints):
 * 0 = Not Found
 * 10 = In Transit
 * 20 = Expired
 * 30 = Pick Up
 * 35 = Undelivered (attempted, failed)
 * 40 = Delivered
 * 50 = Alert / Exception
 */
function normalize17TrackStatusCode(code: number): ExternalTrackingResult['status'] {
    switch (code) {
        case 40: return 'delivered';
        case 10: return 'in_transit';
        case 30: return 'out_for_delivery';
        case 0: return 'pending';
        case 20:
        case 35:
        case 50: return 'exception';
        default: return 'unknown';
    }
}

function normalize17TrackStatusString(statusStr: string): ExternalTrackingResult['status'] {
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
// 17TRACK PUBLIC WEB ENDPOINT (NO API KEY NEEDED)
// This is the same endpoint used by the 17track.net website
// =====================================================================

interface ParsedWebTrackData {
    status: ExternalTrackingResult['status'];
    statusLabel: string;
    events: ExternalTrackingEvent[];
    deliveredAt?: string;
    carrierName?: string;
}

/**
 * Parse the response from 17track's public web endpoint.
 * The web endpoint returns a different structure than the official API.
 */
function parseWebTrackResponse(trackData: any): ParsedWebTrackData | null {
    try {
        // The web endpoint returns tracking info in a nested structure
        // with z0 (origin country tracking) and z2 (destination country tracking)
        const track = trackData.track;
        if (!track) return null;

        const events: ExternalTrackingEvent[] = [];

        // z1 = primary/latest tracking info, z2 = destination tracking, z0 = origin tracking
        // Process all available tracking sources
        const trackSources = [track.z2, track.z1, track.z0].filter(Boolean);

        for (const source of trackSources) {
            if (Array.isArray(source)) {
                for (const evt of source) {
                    const timestamp = evt.a || evt.time || '';
                    const description = evt.z || evt.desc || evt.description || '';
                    const location = evt.c || evt.location || '';

                    if (timestamp || description) {
                        // Avoid duplicate events (same timestamp + description)
                        const isDuplicate = events.some(
                            e => e.timestamp === timestamp && e.description === description
                        );
                        if (!isDuplicate) {
                            events.push({
                                timestamp,
                                status: '',
                                description,
                                location,
                            });
                        }
                    }
                }
            }
        }

        // Package state from the response
        // e = package state code (0=NotFound, 10=InTransit, 30=PickUp, 40=Delivered, etc.)
        const packageState = trackData.e || 0;
        const normalizedStatus = normalize17TrackStatusCode(packageState);

        // Delivered timestamp
        let deliveredAt: string | undefined;
        if (normalizedStatus === 'delivered' && events.length > 0) {
            deliveredAt = events[0].timestamp;
        }

        // Carrier name
        const carrierName = trackData.track?.ln1 || trackData.track?.ln2 || undefined;

        return {
            status: normalizedStatus,
            statusLabel: getStatusLabel(normalizedStatus),
            events,
            deliveredAt,
            carrierName,
        };
    } catch (error: any) {
        console.error(`[TrackingFetcher] Error parsing web track response:`, error.message);
        return null;
    }
}

/**
 * Fetch tracking data using 17track's public web endpoint.
 * This is the same endpoint the 17track.net website uses.
 * No API key required, no registration quota consumed.
 *
 * Supports up to 40 tracking numbers per request.
 */
async function fetchViaWebEndpoint(
    trackingNumbers: string[]
): Promise<Map<string, ParsedWebTrackData>> {
    const data = new Map<string, ParsedWebTrackData>();

    if (trackingNumbers.length === 0) return data;

    try {
        const body = {
            data: trackingNumbers.map(num => ({ num, fc: 0, sc: 0 })),
            guid: '',
            apiKey: '',
        };

        const response = await fetch('https://t.17track.net/restapi/track', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://t.17track.net',
                'Referer': 'https://t.17track.net/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) {
            console.log(`[TrackingFetcher] Web endpoint HTTP ${response.status}`);
            return data;
        }

        const result = await response.json();

        // The web endpoint returns data in result.dat array
        const items = result?.dat || [];

        for (const item of items) {
            const trackingNumber = item.no;
            if (!trackingNumber) continue;

            const parsed = parseWebTrackResponse(item);
            if (parsed) {
                data.set(trackingNumber, parsed);
            }
        }

        console.log(`[TrackingFetcher] Web endpoint: got data for ${data.size}/${trackingNumbers.length} tracking numbers`);
    } catch (error: any) {
        console.log(`[TrackingFetcher] Web endpoint failed: ${error.message}`);
    }

    return data;
}

// =====================================================================
// 17TRACK OFFICIAL API (BACKUP - uses API key if available)
// =====================================================================

interface Parsed17TrackData {
    status: string;
    statusLabel: string;
    events: ExternalTrackingEvent[];
    deliveredAt?: string;
}

function parse17TrackInfo(trackInfo: any): Parsed17TrackData {
    const latestStatusStr = trackInfo.latest_status?.status
        || trackInfo.package_status
        || trackInfo.status
        || '';
    const latestEvent = trackInfo.latest_event;
    const providers = trackInfo.tracking?.providers || [];
    const events: ExternalTrackingEvent[] = [];

    for (const provider of providers) {
        const providerEvents = provider.events || provider.trackinfo || [];
        if (Array.isArray(providerEvents)) {
            for (const evt of providerEvents) {
                const timestamp = evt.time_iso || evt.time_utc || evt.time || evt.time_raw || '';
                const status = evt.sub_status || evt.stage || evt.status || '';
                const description = evt.description || evt.Details || evt.context || evt.message || status || '';
                const location = evt.location || evt.address?.city || evt.address || '';

                if (timestamp || description) {
                    events.push({ timestamp, status, description, location });
                }
            }
        }
    }

    // Fallback: use latest_event if no provider events
    if (events.length === 0 && latestEvent) {
        const timestamp = latestEvent.time_iso || latestEvent.time_utc || latestEvent.time || '';
        const description = latestEvent.description || latestEvent.context || '';
        const location = latestEvent.location || latestEvent.address?.city || '';

        if (timestamp || description) {
            events.push({ timestamp, status: latestStatusStr, description, location });
        }
    }

    const normalizedStatus = normalize17TrackStatusString(latestStatusStr);
    let deliveredAt: string | undefined;
    if (normalizedStatus === 'delivered') {
        deliveredAt = latestEvent?.time_iso || latestEvent?.time_utc || latestEvent?.time
            || (events.length > 0 ? events[0].timestamp : undefined);
    }

    return {
        status: latestStatusStr,
        statusLabel: getStatusLabel(normalizedStatus),
        events,
        deliveredAt,
    };
}

/**
 * Try official API gettrackinfo (free for already-registered numbers).
 * Only used as a backup if web endpoint fails.
 */
async function tryOfficialApiGetTrackInfo(
    trackingNumbers: string[],
    apiKey: string
): Promise<Map<string, Parsed17TrackData>> {
    const data = new Map<string, Parsed17TrackData>();

    try {
        const body = trackingNumbers.map(num => ({ number: num, carrier: 0 }));
        const response = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', '17token': apiKey },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) return data;

        const result = await response.json();

        for (const item of (result?.data?.accepted || [])) {
            if (item.track_info) {
                data.set(item.number, parse17TrackInfo(item.track_info));
            }
        }

        console.log(`[TrackingFetcher] Official API: ${data.size} results`);
    } catch (error: any) {
        console.log(`[TrackingFetcher] Official API failed: ${error.message}`);
    }

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
    webData?: ParsedWebTrackData,
    apiData?: Parsed17TrackData
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

    // Prefer web data (same source as 17track.net website)
    if (webData) {
        result.source = '17track_web';
        result.status = webData.status;
        result.statusLabel = webData.statusLabel;
        result.events = webData.events;
        if (webData.deliveredAt) result.deliveredAt = webData.deliveredAt;
        if (webData.carrierName && result.carrier === 'Unknown Carrier') {
            result.carrier = webData.carrierName;
        }
    }
    // Fall back to official API data
    else if (apiData) {
        result.source = '17track';
        result.status = normalize17TrackStatusString(apiData.status);
        result.statusLabel = apiData.statusLabel;
        result.events = apiData.events;
        if (apiData.deliveredAt) result.deliveredAt = apiData.deliveredAt;
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

    // Primary: Use web endpoint (no API key needed, no quota)
    const webData = await fetchViaWebEndpoint([trackingNumber]);

    if (webData.has(trackingNumber)) {
        const result = buildResult(
            trackingNumber, shopifyCarrierName, shopifyTrackingUrl,
            '17track_web', webData.get(trackingNumber)
        );
        setCachedResult(trackingNumber, result);
        return result;
    }

    // Backup: Try official API if key is available
    const apiKey = process.env.TRACKING_API_KEY || process.env.SEVENTEENTRACK_API_KEY || '';
    if (apiKey) {
        const apiData = await tryOfficialApiGetTrackInfo([trackingNumber], apiKey);
        if (apiData.has(trackingNumber)) {
            const result = buildResult(
                trackingNumber, shopifyCarrierName, shopifyTrackingUrl,
                '17track', undefined, apiData.get(trackingNumber)
            );
            setCachedResult(trackingNumber, result);
            return result;
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
 * 2. Use 17track web endpoint for all non-cached numbers (FREE, no quota, no API key)
 * 3. For any that didn't return data via web, try official API (if key available)
 * 4. For any remaining, provide detection-only results with tracking links
 *
 * Net result: NO quota consumed. Unlimited tracking lookups.
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

    if (needsFetch.length === 0) {
        return results;
    }

    console.log(`[TrackingFetcher] Fetching ${needsFetch.length} external tracking numbers...`);

    // Build a lookup map for carrier/url info
    const infoMap = new Map(needsFetch.map(tn => [tn.number, tn]));
    const allNums = needsFetch.map(t => t.number);

    // Step 1: Use web endpoint (FREE, no quota, no API key needed)
    const BATCH_SIZE = 40;
    const missingFromWeb: string[] = [];

    for (let i = 0; i < allNums.length; i += BATCH_SIZE) {
        const batch = allNums.slice(i, i + BATCH_SIZE);
        const webData = await fetchViaWebEndpoint(batch);

        for (const num of batch) {
            if (webData.has(num)) {
                const info = infoMap.get(num);
                const result = buildResult(num, info?.carrier, info?.url, '17track_web', webData.get(num));
                results.set(num, result);
                setCachedResult(num, result);
            } else {
                missingFromWeb.push(num);
            }
        }

        // Small delay between batches to be polite
        if (i + BATCH_SIZE < allNums.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Step 2: For numbers not found via web, try official API (if key available)
    if (missingFromWeb.length > 0 && apiKey) {
        console.log(`[TrackingFetcher] ${missingFromWeb.length} numbers not found via web endpoint, trying official API...`);

        for (let i = 0; i < missingFromWeb.length; i += BATCH_SIZE) {
            const batch = missingFromWeb.slice(i, i + BATCH_SIZE);
            const apiData = await tryOfficialApiGetTrackInfo(batch, apiKey);

            for (const [num, trackData] of apiData) {
                const info = infoMap.get(num);
                const result = buildResult(num, info?.carrier, info?.url, '17track', undefined, trackData);
                results.set(num, result);
                setCachedResult(num, result);
            }
        }
    }

    // Step 3: Detection-only results for any remaining
    for (const num of allNums) {
        if (!results.has(num)) {
            const info = infoMap.get(num);
            const result = buildResult(num, info?.carrier, info?.url, 'detection_only');
            result.status = 'pending';
            result.statusLabel = 'Track via links below';
            results.set(num, result);
        }
    }

    console.log(`[TrackingFetcher] Batch complete: ${results.size} results (${trackingCache.size} cached total)`);
    return results;
}
