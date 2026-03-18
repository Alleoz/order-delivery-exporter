/**
 * Carrier Detection Utility
 * Detects carrier from tracking number patterns and generates tracking URLs.
 * Supports major global carriers plus Chinese/international logistics carriers
 * commonly using alphanumeric tracking formats (e.g. ZC, LP, LS prefixes).
 */

export interface CarrierInfo {
    carrier: string;
    carrierCode: string;
    trackingUrl: string;
    /** Universal fallback tracking URLs (17track, parcelsapp, etc.) */
    universalTrackingUrls: string[];
}

interface CarrierPattern {
    name: string;
    code: string;
    /** Regex patterns to match tracking numbers */
    patterns: RegExp[];
    /** Function to generate the carrier-specific tracking URL */
    trackingUrlTemplate: (trackingNumber: string) => string;
}

/**
 * Known carrier patterns with their tracking URLs.
 * Order matters — more specific patterns should come first.
 */
const CARRIER_PATTERNS: CarrierPattern[] = [
    // ── USPS ──
    {
        name: 'USPS',
        code: 'usps',
        patterns: [
            /^(94|93|92|94|95)\d{20,22}$/,        // USPS with service code prefix
            /^(420)\d{27,31}$/,                     // USPS with ZIP
            /^(7\d|03|23|13)\d{18,20}$/,           // Priority Mail, etc.
            /^\d{20,22}$/,                          // Generic 20-22 digit USPS
        ],
        trackingUrlTemplate: (tn) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`,
    },
    // ── UPS ──
    {
        name: 'UPS',
        code: 'ups',
        patterns: [
            /^1Z[A-Z0-9]{16}$/i,
            /^T\d{10}$/,
            /^K\d{10}$/,
        ],
        trackingUrlTemplate: (tn) => `https://www.ups.com/track?tracknum=${tn}`,
    },
    // ── FedEx ──
    {
        name: 'FedEx',
        code: 'fedex',
        patterns: [
            /^\d{12,15}$/,
            /^\d{20,22}$/,
            /^(96\d{2})\d{16}$/,
            /^(6129)\d{16}$/,
        ],
        trackingUrlTemplate: (tn) => `https://www.fedex.com/fedextrack/?trknbr=${tn}`,
    },
    // ── DHL ──
    {
        name: 'DHL',
        code: 'dhl',
        patterns: [
            /^\d{10,11}$/,
            /^[A-Z]{3}\d{7}$/,
            /^(JD)\d{18}$/,
            /^(JVGL)\d{16}$/,
        ],
        trackingUrlTemplate: (tn) => `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`,
    },
    // ── China Post / ePacket / Yanwen ──
    {
        name: 'China Post',
        code: 'china_post',
        patterns: [
            /^[A-Z]{2}\d{9}CN$/i,                   // Standard China Post (e.g. RA123456789CN)
        ],
        trackingUrlTemplate: (tn) => `https://t.17track.net/en#nums=${tn}`,
    },
    // ── Cainiao / AliExpress Logistics ──
    {
        name: 'Cainiao',
        code: 'cainiao',
        patterns: [
            /^LP\d{14,18}$/i,                       // LP prefix (AliExpress Standard)
            /^CAINIAO\d+$/i,
        ],
        trackingUrlTemplate: (tn) => `https://global.cainiao.com/detail.htm?mailNoList=${tn}`,
    },
    // ── YunExpress ──
    {
        name: 'YunExpress',
        code: 'yunexpress',
        patterns: [
            /^YT\d{16}$/i,
        ],
        trackingUrlTemplate: (tn) => `https://www.yuntrack.com/Track/Detail/${tn}`,
    },
    // ── 4PX ──
    {
        name: '4PX',
        code: '4px',
        patterns: [
            /^(4PX|FPXE)\d{10,16}$/i,
        ],
        trackingUrlTemplate: (tn) => `https://track.4px.com/#/result/0/${tn}`,
    },
    // ── ZC / ZA / ZS prefix (Chinese logistics — multi-carrier) ──
    // This covers your new courier with tracking like ZC59068455199
    {
        name: 'International Logistics',
        code: 'intl_logistics',
        patterns: [
            /^Z[A-Z]\d{8,14}$/i,                    // ZC, ZA, ZS, etc. prefix
            /^LS\d{8,14}$/i,                         // LS prefix (common CNY logistics)
            /^LZ\d{8,14}$/i,                         // LZ prefix
        ],
        trackingUrlTemplate: (tn) => `https://t.17track.net/en#nums=${tn}`,
    },
    // ── Wish Post ──
    {
        name: 'Wish Post',
        code: 'wish_post',
        patterns: [
            /^WP\d{12,16}$/i,
        ],
        trackingUrlTemplate: (tn) => `https://t.17track.net/en#nums=${tn}`,
    },
    // ── J&T Express ──
    {
        name: 'J&T Express',
        code: 'jnt',
        patterns: [
            /^(JT|JP|JO|JI)\d{12,15}$/i,
        ],
        trackingUrlTemplate: (tn) => `https://www.jtexpress.ph/trajectoryQuery?waybillNo=${tn}`,
    },
    // ── SunYou ──
    {
        name: 'SunYou',
        code: 'sunyou',
        patterns: [
            /^SY\d{8,12}$/i,
        ],
        trackingUrlTemplate: (tn) => `https://www.sypost.net/queryTrack?toSearch=${tn}`,
    },
    // ── Royal Mail (UK) ──
    {
        name: 'Royal Mail',
        code: 'royal_mail',
        patterns: [
            /^[A-Z]{2}\d{9}GB$/i,
        ],
        trackingUrlTemplate: (tn) => `https://www.royalmail.com/track-your-item#/tracking-results/${tn}`,
    },
    // ── Canada Post ──
    {
        name: 'Canada Post',
        code: 'canada_post',
        patterns: [
            /^\d{16}$/,
            /^[A-Z]{2}\d{9}CA$/i,
        ],
        trackingUrlTemplate: (tn) => `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${tn}`,
    },
];

/**
 * Universal tracking platforms as fallbacks.
 * These work with almost any tracking number worldwide.
 */
const UNIVERSAL_TRACKING_PLATFORMS = [
    {
        name: '17track',
        urlTemplate: (tn: string) => `https://t.17track.net/en#nums=${tn}`,
    },
    {
        name: 'ParcelsApp',
        urlTemplate: (tn: string) => `https://parcelsapp.com/en/tracking/${tn}`,
    },
    {
        name: 'TrackingMore',
        urlTemplate: (tn: string) => `https://www.trackingmore.com/track/en/${tn}`,
    },
];

/**
 * Detect the carrier from a tracking number.
 * Returns carrier info with tracking URL, or a universal fallback if unrecognized.
 */
export function detectCarrier(trackingNumber: string): CarrierInfo {
    const cleanNumber = trackingNumber.trim().toUpperCase();

    for (const carrier of CARRIER_PATTERNS) {
        for (const pattern of carrier.patterns) {
            if (pattern.test(cleanNumber)) {
                return {
                    carrier: carrier.name,
                    carrierCode: carrier.code,
                    trackingUrl: carrier.trackingUrlTemplate(cleanNumber),
                    universalTrackingUrls: UNIVERSAL_TRACKING_PLATFORMS.map(
                        (p) => p.urlTemplate(cleanNumber)
                    ),
                };
            }
        }
    }

    // Fallback: unknown carrier — use universal tracking
    return {
        carrier: 'Unknown Carrier',
        carrierCode: 'unknown',
        trackingUrl: `https://t.17track.net/en#nums=${cleanNumber}`,
        universalTrackingUrls: UNIVERSAL_TRACKING_PLATFORMS.map(
            (p) => p.urlTemplate(cleanNumber)
        ),
    };
}

/**
 * Generate a tracking URL for a given tracking number.
 * Uses the detected carrier's URL, or a universal fallback.
 * Optionally accepts a preferred carrier name to override detection.
 */
export function getTrackingUrl(trackingNumber: string, preferredCarrier?: string): string {
    const cleanNumber = trackingNumber.trim();

    // If a preferred carrier is provided and we know it, use that
    if (preferredCarrier) {
        const normalizedCarrier = preferredCarrier.toLowerCase().trim();
        const matched = CARRIER_PATTERNS.find(
            (c) =>
                c.code === normalizedCarrier ||
                c.name.toLowerCase() === normalizedCarrier
        );
        if (matched) {
            return matched.trackingUrlTemplate(cleanNumber);
        }
    }

    // Otherwise, detect from the number pattern
    const info = detectCarrier(cleanNumber);
    return info.trackingUrl;
}

/**
 * Check if the tracking number is from a carrier that Shopify
 * natively integrates with (i.e. will have fulfillment events).
 */
export function isShopifyNativeCarrier(trackingNumber: string, carrierName?: string): boolean {
    const nativeCarriers = ['usps', 'ups', 'fedex', 'dhl', 'canada_post', 'royal_mail'];

    if (carrierName) {
        const normalizedName = carrierName.toLowerCase().trim();
        if (nativeCarriers.some((c) => normalizedName.includes(c.replace('_', ' ')) || normalizedName.includes(c))) {
            return true;
        }
    }

    const detected = detectCarrier(trackingNumber);
    return nativeCarriers.includes(detected.carrierCode);
}

/**
 * Get all universal tracking URLs for a given tracking number.
 */
export function getUniversalTrackingUrls(trackingNumber: string): Array<{ name: string; url: string }> {
    const cleanNumber = trackingNumber.trim();
    return UNIVERSAL_TRACKING_PLATFORMS.map((p) => ({
        name: p.name,
        url: p.urlTemplate(cleanNumber),
    }));
}
