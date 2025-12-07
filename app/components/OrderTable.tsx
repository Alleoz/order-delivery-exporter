/**
 * Order Delivery Exporter - Order Table Component
 * Displays orders in a sortable, filterable Polaris DataTable
 */

import { useCallback, useState } from 'react';
import {
    Card,
    DataTable,
    Badge,
    Button,
    Link,
    Text,
    InlineStack,
    BlockStack,
    Checkbox,
    Thumbnail,
    Box,
    Tooltip,
} from '@shopify/polaris';
import type { Order, SortConfig } from '~/lib/types';

interface OrderTableProps {
    orders: Order[];
    selectedOrderIds: string[];
    onSelectionChange: (selectedIds: string[]) => void;
    onViewDetails: (order: Order) => void;
    sortConfig: SortConfig;
    onSortChange: (config: SortConfig) => void;
    loading?: boolean;
}

/**
 * Format date for display
 */
function formatDate(dateString: string | null): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

/**
 * Format time for display
 */
function formatDateTime(dateString: string | null): string {
    if (!dateString) return '-';
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
    if (!amount) return '-';
    const num = parseFloat(amount);
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
    }).format(num);
}

/**
 * Get badge for financial status
 */
function getFinancialBadge(status: string | null) {
    if (!status) return null;

    const statusMap: Record<string, { tone: 'success' | 'warning' | 'attention' | 'info' | 'critical'; label: string }> = {
        PAID: { tone: 'success', label: 'Paid' },
        PARTIALLY_PAID: { tone: 'warning', label: 'Partially Paid' },
        PENDING: { tone: 'attention', label: 'Pending' },
        AUTHORIZED: { tone: 'info', label: 'Authorized' },
        REFUNDED: { tone: 'warning', label: 'Refunded' },
        PARTIALLY_REFUNDED: { tone: 'warning', label: 'Partially Refunded' },
        VOIDED: { tone: 'critical', label: 'Voided' },
    };

    const config = statusMap[status] || { tone: 'info' as const, label: status };
    return <Badge tone={config.tone}>{config.label}</Badge>;
}

/**
 * Get badge for fulfillment status
 */
function getFulfillmentBadge(status: string | null) {
    if (!status) return <Badge>Unfulfilled</Badge>;

    const statusMap: Record<string, { tone: 'success' | 'warning' | 'attention' | 'info' | 'critical'; label: string }> = {
        FULFILLED: { tone: 'success', label: 'Fulfilled' },
        UNFULFILLED: { tone: 'attention', label: 'Unfulfilled' },
        PARTIALLY_FULFILLED: { tone: 'warning', label: 'Partial' },
        SCHEDULED: { tone: 'info', label: 'Scheduled' },
        ON_HOLD: { tone: 'warning', label: 'On Hold' },
    };

    const config = statusMap[status] || { tone: 'info' as const, label: status };
    return <Badge tone={config.tone}>{config.label}</Badge>;
}

/**
 * Get delivery status badge
 */
function getDeliveryBadge(order: Order) {
    const fulfillment = order.fulfillments?.[0];
    if (!fulfillment) return <Badge>Not Shipped</Badge>;

    const status = fulfillment.displayStatus;
    if (!status) return <Badge tone="info">Processing</Badge>;

    const statusMap: Record<string, { tone: 'success' | 'warning' | 'attention' | 'info' | 'critical'; label: string }> = {
        DELIVERED: { tone: 'success', label: 'Delivered' },
        IN_TRANSIT: { tone: 'info', label: 'In Transit' },
        OUT_FOR_DELIVERY: { tone: 'info', label: 'Out for Delivery' },
        ATTEMPTED_DELIVERY: { tone: 'warning', label: 'Attempted' },
        READY_FOR_PICKUP: { tone: 'attention', label: 'Ready for Pickup' },
        PICKED_UP: { tone: 'success', label: 'Picked Up' },
        CONFIRMED: { tone: 'info', label: 'Confirmed' },
        LABEL_PRINTED: { tone: 'info', label: 'Label Printed' },
        LABEL_PURCHASED: { tone: 'info', label: 'Label Purchased' },
        FAILURE: { tone: 'critical', label: 'Delivery Failed' },
        CANCELED: { tone: 'critical', label: 'Canceled' },
    };

    const config = statusMap[status] || { tone: 'info' as const, label: status.replace(/_/g, ' ') };
    return <Badge tone={config.tone}>{config.label}</Badge>;
}

/**
 * Get tracking info from order
 */
function getTrackingInfo(order: Order): { carrier: string; trackingNumber: string; trackingUrl: string | null } | null {
    for (const fulfillment of order.fulfillments || []) {
        for (const tracking of fulfillment.trackingInfo || []) {
            if (tracking.number) {
                return {
                    carrier: tracking.company || 'Unknown Carrier',
                    trackingNumber: tracking.number,
                    trackingUrl: tracking.url,
                };
            }
        }
    }
    return null;
}

export function OrderTable({
    orders,
    selectedOrderIds,
    onSelectionChange,
    onViewDetails,
    sortConfig,
    onSortChange,
    loading = false,
}: OrderTableProps) {
    const handleSelectAll = useCallback((checked: boolean) => {
        if (checked) {
            onSelectionChange(orders.map(o => o.id));
        } else {
            onSelectionChange([]);
        }
    }, [orders, onSelectionChange]);

    const handleSelectOne = useCallback((orderId: string, checked: boolean) => {
        if (checked) {
            onSelectionChange([...selectedOrderIds, orderId]);
        } else {
            onSelectionChange(selectedOrderIds.filter(id => id !== orderId));
        }
    }, [selectedOrderIds, onSelectionChange]);

    const allSelected = orders.length > 0 && selectedOrderIds.length === orders.length;
    const someSelected = selectedOrderIds.length > 0 && selectedOrderIds.length < orders.length;

    const handleSort = useCallback((headingIndex: number) => {
        const columnKeys = ['', 'name', 'createdAt', 'customer', 'totalPrice', '', '', '', ''];
        const key = columnKeys[headingIndex];
        if (!key) return;

        const newDirection = sortConfig.column === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
        onSortChange({ column: key, direction: newDirection });
    }, [sortConfig, onSortChange]);

    const rows = orders.map((order) => {
        const tracking = getTrackingInfo(order);
        const isSelected = selectedOrderIds.includes(order.id);
        const currency = order.totalPriceSet?.shopMoney?.currencyCode;

        return [
            // Checkbox
            <Checkbox
                label=""
                labelHidden
                checked={isSelected}
                onChange={(checked) => handleSelectOne(order.id, checked)}
            />,
            // Order Number
            <Link
                monochrome
                removeUnderline
                onClick={() => onViewDetails(order)}
            >
                <Text variant="bodyMd" fontWeight="semibold" as="span">
                    {order.name}
                </Text>
            </Link>,
            // Date
            <Tooltip content={formatDateTime(order.createdAt)}>
                <Text variant="bodyMd" as="span">
                    {formatDate(order.createdAt)}
                </Text>
            </Tooltip>,
            // Customer
            <BlockStack gap="100">
                <Text variant="bodyMd" as="span">
                    {order.customer
                        ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim() || 'Guest'
                        : 'Guest'}
                </Text>
                {order.customer?.email && (
                    <Text variant="bodySm" tone="subdued" as="span">
                        {order.customer.email}
                    </Text>
                )}
            </BlockStack>,
            // Total
            <Text variant="bodyMd" fontWeight="semibold" as="span">
                {formatCurrency(order.totalPriceSet?.shopMoney?.amount, currency)}
            </Text>,
            // Financial Status
            getFinancialBadge(order.displayFinancialStatus),
            // Fulfillment Status
            getFulfillmentBadge(order.displayFulfillmentStatus),
            // Delivery Status
            <BlockStack gap="100">
                {getDeliveryBadge(order)}
                {tracking && (
                    <InlineStack gap="100" wrap={false}>
                        <Text variant="bodySm" tone="subdued" as="span">
                            {tracking.carrier}
                        </Text>
                        {tracking.trackingUrl ? (
                            <Link url={tracking.trackingUrl} target="_blank" removeUnderline>
                                <Text variant="bodySm" as="span">
                                    {tracking.trackingNumber.length > 12
                                        ? `${tracking.trackingNumber.slice(0, 12)}...`
                                        : tracking.trackingNumber}
                                </Text>
                            </Link>
                        ) : (
                            <Text variant="bodySm" as="span">
                                {tracking.trackingNumber}
                            </Text>
                        )}
                    </InlineStack>
                )}
            </BlockStack>,
            // Actions
            <Button
                variant="plain"
                onClick={() => onViewDetails(order)}
            >
                View
            </Button>,
        ];
    });

    return (
        <Card padding="0">
            <DataTable
                columnContentTypes={[
                    'text', // Checkbox
                    'text', // Order
                    'text', // Date
                    'text', // Customer
                    'numeric', // Total
                    'text', // Financial
                    'text', // Fulfillment
                    'text', // Delivery
                    'text', // Actions
                ]}
                headings={[
                    <Checkbox
                        label=""
                        labelHidden
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={handleSelectAll}
                    />,
                    'Order',
                    'Date',
                    'Customer',
                    'Total',
                    'Payment',
                    'Fulfillment',
                    'Delivery',
                    '',
                ]}
                rows={rows}
                sortable={[false, true, true, true, true, false, false, false, false]}
                defaultSortDirection={sortConfig.direction === 'asc' ? 'ascending' : 'descending'}
                initialSortColumnIndex={
                    ['', 'name', 'createdAt', 'customer', 'totalPrice'].indexOf(sortConfig.column)
                }
                onSort={handleSort}
                hoverable
                footerContent={
                    orders.length > 0
                        ? `Showing ${orders.length} order${orders.length !== 1 ? 's' : ''}`
                        : undefined
                }
            />
        </Card>
    );
}
