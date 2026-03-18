/**
 * Order Delivery Exporter - Export Utilities
 * Server-side functions for exporting orders to Excel/CSV
 * Enhanced with external tracking data for non-native carriers
 */

import * as XLSX from 'xlsx';
import type { Order, Fulfillment } from '~/lib/types';
import { detectCarrier, isShopifyNativeCarrier, getUniversalTrackingUrls } from '~/utils/carrier-detection';
import { fetchExternalTracking, fetchExternalTrackingBatch, type ExternalTrackingResult } from '~/utils/tracking-fetcher.server';

export interface ExportOptions {
    format: 'xlsx' | 'csv';
    includeLineItems: boolean;
    includeFulfillments: boolean;
    includeAddresses: boolean;
}

/**
 * Format date for display
 */
function formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Format currency for display
 */
function formatCurrency(amount: string | undefined, currency: string | undefined): string {
    if (!amount) return '';
    const num = parseFloat(amount);
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
    }).format(num);
}

/**
 * Get full address string
 */
function formatAddress(address: Order['shippingAddress']): string {
    if (!address) return '';
    const parts = [
        address.firstName,
        address.lastName,
        address.company,
        address.address1,
        address.address2,
        address.city,
        address.province,
        address.zip,
        address.country,
    ].filter(Boolean);
    return parts.join(', ');
}

/**
 * Known dummy/generic carrier names that Shopify might store
 * but aren't real, useful carrier identifiers.
 */
const GENERIC_CARRIER_NAMES = [
    'one', 'other', 'custom', 'default', 'none', 'manual',
    'shopify', 'unknown', 'carrier', 'shipping', 'n/a', 'na',
];

/**
 * Check if a carrier name from Shopify is a real, useful name
 * or a generic/dummy value that should be replaced by detection.
 */
function isGenericCarrierName(name: string | null | undefined): boolean {
    if (!name) return true;
    const normalized = name.toLowerCase().trim();
    if (normalized.length <= 2) return true; // Too short to be useful
    return GENERIC_CARRIER_NAMES.includes(normalized);
}

/**
 * Get tracking info summary — enhanced with carrier detection
 * Now handles generic carrier names (like "One") by replacing
 * them with detected carrier names.
 */
function getTrackingInfo(order: Order): { carriers: string; trackingNumbers: string; trackingUrls: string } {
    const carriers: string[] = [];
    const trackingNumbers: string[] = [];
    const trackingUrls: string[] = [];

    for (const fulfillment of order.fulfillments) {
        for (const tracking of fulfillment.trackingInfo) {
            if (tracking.number) trackingNumbers.push(tracking.number);

            // Decide on carrier name
            if (tracking.company && !isGenericCarrierName(tracking.company)) {
                // Real carrier name from Shopify — use it
                carriers.push(tracking.company);
            } else if (tracking.number) {
                // Generic/missing carrier name — detect from tracking number
                const detected = detectCarrier(tracking.number);
                if (detected.carrier !== 'Unknown Carrier') {
                    carriers.push(detected.carrier);
                } else {
                    carriers.push(tracking.company || 'International Carrier');
                }
            }

            // Decide on tracking URL
            if (tracking.url && tracking.url.startsWith('http')) {
                trackingUrls.push(tracking.url);
            } else if (tracking.number) {
                // Generate tracking URL from carrier detection
                const detected = detectCarrier(tracking.number);
                trackingUrls.push(detected.trackingUrl);
            }
        }
    }

    return {
        carriers: [...new Set(carriers)].join(', '),
        trackingNumbers: [...new Set(trackingNumbers)].join(', '),
        trackingUrls: [...new Set(trackingUrls)].join('\n'),
    };
}

/**
 * Get latest tracking update string from Shopify fulfillment events
 */
function getLatestTrackingUpdate(order: Order): string {
    const updates: string[] = [];

    for (const fulfillment of order.fulfillments) {
        if (fulfillment.events?.nodes && fulfillment.events.nodes.length > 0) {
            const event = fulfillment.events.nodes[0];
            const locationParts = [event.city, event.province, event.country, event.zip].filter(Boolean);
            const location = locationParts.length > 0 ? locationParts.join(', ') : '';

            const parts = [
                formatDate(event.happenedAt),
                location,
                event.status.replace(/_/g, ' '),
                event.message
            ].filter(Boolean);

            updates.push(parts.join(', '));
        }
    }

    return updates.join('\n');
}

/**
 * Get delivery status from fulfillments
 */
function getDeliveryStatus(order: Order): { status: string; deliveredAt: string; estimatedDelivery: string } {
    let latestStatus = 'Unfulfilled';
    let latestDeliveredAt = '';
    let latestEstimatedDelivery = '';

    for (const fulfillment of order.fulfillments) {
        if (fulfillment.displayStatus) {
            latestStatus = fulfillment.displayStatus.replace(/_/g, ' ');
        }
        if (fulfillment.deliveredAt) {
            latestDeliveredAt = formatDate(fulfillment.deliveredAt);
        }
        if (fulfillment.estimatedDeliveryAt) {
            latestEstimatedDelivery = formatDate(fulfillment.estimatedDeliveryAt);
        }
    }

    return {
        status: latestStatus,
        deliveredAt: latestDeliveredAt,
        estimatedDelivery: latestEstimatedDelivery,
    };
}

/**
 * Collect all tracking numbers from an order that need external lookups
 */
function getTrackingNumbersForExternalLookup(order: Order): Array<{
    number: string;
    carrier: string | null;
    url: string | null;
}> {
    const items: Array<{ number: string; carrier: string | null; url: string | null }> = [];

    for (const fulfillment of order.fulfillments) {
        for (const tracking of fulfillment.trackingInfo) {
            if (tracking.number) {
                // Check if this is a non-native carrier that needs external lookup
                const isNative = isShopifyNativeCarrier(tracking.number, tracking.company || undefined);
                const hasShopifyEvents = fulfillment.events?.nodes && fulfillment.events.nodes.length > 0;
                const hasDeliveryDate = !!fulfillment.deliveredAt;

                // Only look up externally if Shopify doesn't already have good data
                if (!isNative && !hasShopifyEvents && !hasDeliveryDate) {
                    items.push({
                        number: tracking.number,
                        carrier: tracking.company,
                        url: tracking.url,
                    });
                }
            }
        }
    }

    return items;
}

/**
 * Fetch external tracking data for all orders that need it.
 * Returns a map keyed by tracking number.
 */
async function fetchExternalTrackingForOrders(
    orders: Order[]
): Promise<Map<string, ExternalTrackingResult>> {
    const allTrackingNumbers: Array<{ number: string; carrier: string | null; url: string | null }> = [];

    for (const order of orders) {
        const items = getTrackingNumbersForExternalLookup(order);
        allTrackingNumbers.push(...items);
    }

    // Remove duplicates
    const uniqueMap = new Map<string, { number: string; carrier: string | null; url: string | null }>();
    for (const item of allTrackingNumbers) {
        uniqueMap.set(item.number, item);
    }
    const unique = Array.from(uniqueMap.values());

    if (unique.length === 0) {
        return new Map();
    }

    console.log(`[Export] Fetching external tracking for ${unique.length} tracking numbers...`);

    // Use batch fetcher for efficiency (single API call for up to 40 numbers)
    const results = await fetchExternalTrackingBatch(unique);

    console.log(`[Export] Got external tracking data for ${results.size} tracking numbers`);
    return results;
}

/**
 * Build enhanced tracking info for export by combining
 * Shopify data with external tracking results.
 */
function buildEnhancedTrackingInfo(order: Order, externalData: Map<string, ExternalTrackingResult>): {
    latestTrackingInfo: string;
    deliveredAt: string;
    estimatedDelivery: string;
    deliveryStatus: string;
} {
    // Start with Shopify's data
    const shopifyDelivery = getDeliveryStatus(order);
    const shopifyTracking = getLatestTrackingUpdate(order);

    let latestTrackingInfo = shopifyTracking;
    let deliveredAt = shopifyDelivery.deliveredAt;
    let estimatedDelivery = shopifyDelivery.estimatedDelivery;
    let deliveryStatus = shopifyDelivery.status;

    // If Shopify data is empty, try to supplement with external data
    for (const fulfillment of order.fulfillments) {
        for (const tracking of fulfillment.trackingInfo) {
            if (tracking.number && externalData.has(tracking.number)) {
                const ext = externalData.get(tracking.number)!;

                // Supplement delivery date — use actual timestamp from 17track
                if (!deliveredAt && ext.deliveredAt) {
                    deliveredAt = formatDate(ext.deliveredAt);
                } else if (!deliveredAt && ext.status === 'delivered' && ext.events.length > 0) {
                    // If deliveredAt not set but status is delivered, use latest event
                    deliveredAt = formatDate(ext.events[0].timestamp);
                }

                if (!estimatedDelivery && ext.estimatedDelivery) {
                    estimatedDelivery = ext.estimatedDelivery;
                }

                // Build tracking info text from external data
                if (!latestTrackingInfo && ext.source === '17track') {
                    const infoParts: string[] = [];

                    // Status first
                    infoParts.push(ext.statusLabel);

                    // Latest event details
                    if (ext.events.length > 0) {
                        const lastEvent = ext.events[0];
                        if (lastEvent.description) {
                            infoParts.push(lastEvent.description);
                        }
                        if (lastEvent.location) {
                            infoParts.push(lastEvent.location);
                        }
                        if (lastEvent.timestamp) {
                            infoParts.push(formatDate(lastEvent.timestamp));
                        }
                    }

                    latestTrackingInfo = infoParts.join(' | ');
                } else if (!latestTrackingInfo) {
                    // No 17track data — provide tracking links for manual lookup
                    const urls = ext.universalTrackingUrls;
                    if (urls.length > 0) {
                        latestTrackingInfo = urls.map(u => `${u.name}: ${u.url}`).join(' | ');
                    }
                }

                // Update delivery status from external if Shopify has none
                if (deliveryStatus === 'Unfulfilled' || deliveryStatus === 'FULFILLED') {
                    deliveryStatus = ext.statusLabel;
                }
            }
        }
    }

    // If we still have no tracking info, provide helpful tracking links
    if (!latestTrackingInfo) {
        const trackingLinks: string[] = [];
        for (const fulfillment of order.fulfillments) {
            for (const tracking of fulfillment.trackingInfo) {
                if (tracking.number) {
                    const universalUrls = getUniversalTrackingUrls(tracking.number);
                    trackingLinks.push(
                        `${tracking.number}: ${universalUrls.map(u => `${u.name}: ${u.url}`).join(' | ')}`
                    );
                }
            }
        }
        if (trackingLinks.length > 0) {
            latestTrackingInfo = trackingLinks.join('\n');
        }
    }

    return {
        latestTrackingInfo,
        deliveredAt,
        estimatedDelivery,
        deliveryStatus,
    };
}

/**
 * Transform orders to flat rows for export
 * Now includes external tracking data for non-native carriers
 */
function transformOrdersToRows(
    orders: Order[],
    options: ExportOptions,
    externalTrackingData: Map<string, ExternalTrackingResult>
): any[] {
    const rows: any[] = [];

    for (const order of orders) {
        const tracking = getTrackingInfo(order);
        const enhanced = buildEnhancedTrackingInfo(order, externalTrackingData);
        const currency = order.totalPriceSet?.shopMoney?.currencyCode || 'USD';

        // Base order row
        const baseRow: Record<string, any> = {
            'Order Number': order.name,
            'Order ID': order.id.replace('gid://shopify/Order/', ''),
            'Created At': formatDate(order.createdAt),
            'Updated At': formatDate(order.updatedAt),
            'Financial Status': order.displayFinancialStatus || '',
            'Fulfillment Status': order.displayFulfillmentStatus || '',
            'Delivery Status': enhanced.deliveryStatus,
            'Total': formatCurrency(order.totalPriceSet?.shopMoney?.amount, currency),
            'Subtotal': formatCurrency(order.subtotalPriceSet?.shopMoney?.amount, currency),
            'Shipping': formatCurrency(order.totalShippingPriceSet?.shopMoney?.amount, currency),
            'Tax': formatCurrency(order.totalTaxSet?.shopMoney?.amount, currency),
            'Discounts': formatCurrency(order.totalDiscountsSet?.shopMoney?.amount, currency),
            'Refunded': formatCurrency(order.totalRefundedSet?.shopMoney?.amount, currency),
        };

        // Customer info
        if (order.customer) {
            baseRow['Customer Email'] = order.customer.email || '';
            baseRow['Customer Name'] = `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim();
            baseRow['Customer Phone'] = order.customer.phone || '';
        } else {
            baseRow['Customer Email'] = '';
            baseRow['Customer Name'] = '';
            baseRow['Customer Phone'] = '';
        }

        // Shipping/Delivery info
        if (options.includeAddresses) {
            baseRow['Shipping Address'] = formatAddress(order.shippingAddress);
            baseRow['Billing Address'] = formatAddress(order.billingAddress);
        }

        // Tracking info — enhanced
        if (options.includeFulfillments) {
            baseRow['Carrier'] = tracking.carriers;
            baseRow['Tracking Numbers'] = tracking.trackingNumbers;
            baseRow['Tracking URLs'] = tracking.trackingUrls;
            baseRow['Delivered At'] = enhanced.deliveredAt;
            baseRow['Estimated Delivery'] = enhanced.estimatedDelivery;
            baseRow['Latest Tracking Info'] = enhanced.latestTrackingInfo;
        }

        // Line items
        if (options.includeLineItems && order.lineItems.nodes.length > 0) {
            for (const item of order.lineItems.nodes) {
                const itemPrice = formatCurrency(
                    item.originalUnitPriceSet?.shopMoney?.amount,
                    item.originalUnitPriceSet?.shopMoney?.currencyCode
                );

                rows.push({
                    ...baseRow,
                    'Item Title': item.title,
                    'Item Variant': item.variantTitle || '',
                    'Item SKU': item.sku || '',
                    'Item Quantity': item.quantity,
                    'Item Unit Price': itemPrice,
                    'Item Total': formatCurrency(
                        item.discountedTotalSet?.shopMoney?.amount,
                        item.discountedTotalSet?.shopMoney?.currencyCode
                    ),
                });
            }
        } else {
            // Single row per order
            const lineItemsSummary = order.lineItems.nodes
                .map(item => `${item.quantity}x ${item.title}`)
                .join('; ');
            baseRow['Line Items'] = lineItemsSummary;
            rows.push(baseRow);
        }

        // Notes and tags
        baseRow['Notes'] = order.note || '';
        baseRow['Tags'] = order.tags.join(', ');
    }

    return rows;
}

/**
 * Generate Excel file from orders — now with external tracking enrichment
 */
export async function generateExcelFile(orders: Order[], options: ExportOptions): Promise<Buffer> {
    // Fetch external tracking data for non-native carriers
    let externalTrackingData = new Map<string, ExternalTrackingResult>();

    if (options.includeFulfillments) {
        try {
            externalTrackingData = await fetchExternalTrackingForOrders(orders);
        } catch (error: any) {
            console.error('[Export] Failed to fetch external tracking data:', error.message);
            // Continue without external data — Shopify data will still be used
        }
    }

    const rows = transformOrdersToRows(orders, options, externalTrackingData);

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Auto-width columns
    const columnWidths = Object.keys(rows[0] || {}).map((key) => ({
        wch: Math.max(
            key.length,
            ...rows.map((row) => String(row[key] || '').length)
        ),
    }));
    worksheet['!cols'] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');

    // Generate buffer based on format
    if (options.format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        return Buffer.from(csv, 'utf-8');
    }

    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

/**
 * Get filename for export
 */
export function getExportFilename(format: 'xlsx' | 'csv'): string {
    const timestamp = new Date().toISOString().split('T')[0];
    return `shopify-orders-${timestamp}.${format}`;
}

/**
 * Get content type for export format
 */
export function getContentType(format: 'xlsx' | 'csv'): string {
    if (format === 'csv') {
        return 'text/csv';
    }
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}
