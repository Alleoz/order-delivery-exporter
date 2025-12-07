/**
 * Order Delivery Exporter - Export Utilities
 * Server-side functions for exporting orders to Excel/CSV
 */

import * as XLSX from 'xlsx';
import type { Order } from '~/lib/types';

export interface ExportOptions {
    format: 'xlsx' | 'csv';
    includeLineItems: boolean;
    includeFulfillments: boolean;
    includeAddresses: boolean;
}

/**
 * Format date for display
 */
function formatDate(dateString: string | null): string {
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
 * Get tracking info summary
 */
function getTrackingInfo(order: Order): { carriers: string; trackingNumbers: string; trackingUrls: string } {
    const carriers: string[] = [];
    const trackingNumbers: string[] = [];
    const trackingUrls: string[] = [];

    for (const fulfillment of order.fulfillments) {
        for (const tracking of fulfillment.trackingInfo) {
            if (tracking.company) carriers.push(tracking.company);
            if (tracking.number) trackingNumbers.push(tracking.number);
            if (tracking.url) trackingUrls.push(tracking.url);
        }
    }

    return {
        carriers: [...new Set(carriers)].join(', '),
        trackingNumbers: [...new Set(trackingNumbers)].join(', '),
        trackingUrls: [...new Set(trackingUrls)].join('\n'),
    };
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
 * Transform orders to flat rows for export
 */
function transformOrdersToRows(orders: Order[], options: ExportOptions): any[] {
    const rows: any[] = [];

    for (const order of orders) {
        const tracking = getTrackingInfo(order);
        const delivery = getDeliveryStatus(order);
        const currency = order.totalPriceSet?.shopMoney?.currencyCode || 'USD';

        // Base order row
        const baseRow: Record<string, any> = {
            'Order Number': order.name,
            'Order ID': order.id.replace('gid://shopify/Order/', ''),
            'Created At': formatDate(order.createdAt),
            'Updated At': formatDate(order.updatedAt),
            'Financial Status': order.displayFinancialStatus || '',
            'Fulfillment Status': order.displayFulfillmentStatus || '',
            'Delivery Status': delivery.status,
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

        // Tracking info
        if (options.includeFulfillments) {
            baseRow['Carrier'] = tracking.carriers;
            baseRow['Tracking Numbers'] = tracking.trackingNumbers;
            baseRow['Tracking URLs'] = tracking.trackingUrls;
            baseRow['Delivered At'] = delivery.deliveredAt;
            baseRow['Estimated Delivery'] = delivery.estimatedDelivery;
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
 * Generate Excel file from orders
 */
export function generateExcelFile(orders: Order[], options: ExportOptions): Buffer {
    const rows = transformOrdersToRows(orders, options);

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
