import { useCallback } from 'react';
import {
    Card,
    IndexTable,
    Badge,
    Button,
    Link,
    Text,
    InlineStack,
    BlockStack,
    Box,
    Tooltip,
} from '@shopify/polaris';
import type { Order, SortConfig } from '~/lib/types';
import { ViewIcon } from '@shopify/polaris-icons';

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
 * Helper to capitalize text
 */
function capitalize(str: string | null): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase().replace(/_/g, ' ');
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

    const config = statusMap[status] || { tone: 'info' as const, label: capitalize(status) };
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

    const config = statusMap[status] || { tone: 'info' as const, label: capitalize(status) };
    return <Badge tone={config.tone}>{config.label}</Badge>;
}

/**
 * Get delivery status badge
 */
function getDeliveryBadge(order: Order) {
    const fulfillment = order.fulfillments?.[0];
    if (!fulfillment) return <Badge>Not Shipped</Badge>;

    const status = fulfillment.displayStatus;
    // Default to processing if no display status but exists
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
        FAILURE: { tone: 'critical', label: 'Failed' },
        CANCELED: { tone: 'critical', label: 'Canceled' },
    };

    const config = statusMap[status] || { tone: 'info' as const, label: capitalize(status) };
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
                    carrier: tracking.company || 'Carrier',
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
    const resourceName = {
        singular: 'order',
        plural: 'orders',
    };

    const handleSort = useCallback((headingIndex: number, direction: 'ascending' | 'descending') => {
        const columnKeys = ['name', 'createdAt', 'customer', 'totalPrice'];
        const key = columnKeys[headingIndex];
        if (!key) return;

        const newDirection = direction === 'ascending' ? 'asc' : 'desc';
        onSortChange({ column: key, direction: newDirection });
    }, [onSortChange]);

    const handleSelection = useCallback((
        selectionType: string,
        isSelecting: boolean,
        selection?: string | [number, number]
    ) => {
        if (selectionType === 'all' || selectionType === 'page') {
            onSelectionChange(isSelecting ? orders.map(o => o.id) : []);
        } else if (selectionType === 'single') {
            const id = selection as string;
            const newSelection = isSelecting
                ? [...selectedOrderIds, id]
                : selectedOrderIds.filter(x => x !== id);
            onSelectionChange(newSelection);
        } else if (selectionType === 'multi') {
            if (!selection) return;
            const selectionList = selection as string[] | [number, number];

            if (Array.isArray(selectionList) && selectionList.length > 0) {
                // Check if it's a Range (numbers)
                if (typeof selectionList[0] === 'number') {
                    const [start, end] = selectionList as [number, number];
                    const rangeIds = orders.slice(start, end + 1).map(o => o.id);
                    const others = selectedOrderIds.filter(id => !rangeIds.includes(id));
                    onSelectionChange(isSelecting ? [...others, ...rangeIds] : others);
                } else {
                    // It's a list of IDs (strings)
                    const ids = selectionList as string[];
                    const others = selectedOrderIds.filter(id => !ids.includes(id));
                    onSelectionChange(isSelecting ? [...others, ...ids] : others);
                }
            }
        }
    }, [selectedOrderIds, orders, onSelectionChange]);

    const rowMarkup = orders.map((order, index) => {
        const tracking = getTrackingInfo(order);
        const currency = order.totalPriceSet?.shopMoney?.currencyCode;

        return (
            <IndexTable.Row
                id={order.id}
                key={order.id}
                selected={selectedOrderIds.includes(order.id)}
                position={index}
            >
                <IndexTable.Cell>
                    <Link
                        monochrome
                        removeUnderline
                        onClick={() => onViewDetails(order)}
                    >
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                            {order.name}
                        </Text>
                    </Link>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Tooltip content={formatDateTime(order.createdAt)}>
                        <Text variant="bodyMd" as="span">
                            {formatDate(order.createdAt)}
                        </Text>
                    </Tooltip>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <BlockStack gap="050">
                        <Text variant="bodyMd" as="span" fontWeight="medium">
                            {order.customer
                                ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim() || 'Guest'
                                : 'Guest'}
                        </Text>
                        {order.customer?.email && (
                            <Text variant="bodySm" tone="subdued" as="span">
                                {order.customer.email}
                            </Text>
                        )}
                    </BlockStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text variant="bodyMd" as="span" alignment="end">
                        {formatCurrency(order.totalPriceSet?.shopMoney?.amount, currency)}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{getFinancialBadge(order.displayFinancialStatus)}</IndexTable.Cell>
                <IndexTable.Cell>{getFulfillmentBadge(order.displayFulfillmentStatus)}</IndexTable.Cell>
                <IndexTable.Cell>
                    <BlockStack gap="100">
                        <Box>{getDeliveryBadge(order)}</Box>
                        {tracking && (
                            <InlineStack gap="100" wrap={false} align="start" blockAlign="center">
                                <Text variant="bodySm" tone="subdued" as="span">
                                    {tracking.carrier}
                                </Text>
                                {tracking.trackingUrl ? (
                                    <Link url={tracking.trackingUrl} target="_blank" removeUnderline>
                                        <Text variant="bodySm" as="span" tone="magic">
                                            {tracking.trackingNumber}
                                        </Text>
                                    </Link>
                                ) : (
                                    <Text variant="bodySm" as="span" tone="subdued">
                                        {tracking.trackingNumber}
                                    </Text>
                                )}
                            </InlineStack>
                        )}
                    </BlockStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Button variant="plain" icon={ViewIcon} onClick={() => onViewDetails(order)} accessibilityLabel="View Details" />
                </IndexTable.Cell>
            </IndexTable.Row>
        );
    });

    return (
        <Card padding="0">
            <IndexTable
                resourceName={resourceName}
                itemCount={orders.length}
                selectedItemsCount={
                    selectedOrderIds.length === orders.length ? 'All' : selectedOrderIds.length
                }
                onSelectionChange={handleSelection}
                headings={[
                    { title: 'Order' },
                    { title: 'Date' },
                    { title: 'Customer' },
                    { title: 'Total', alignment: 'end' },
                    { title: 'Payment' },
                    { title: 'Fulfillment' },
                    { title: 'Delivery' },
                    { title: '' },
                ]}
                sortable={[true, true, true, true, false, false, false, false]}
                sortDirection={sortConfig.direction === 'asc' ? 'ascending' : 'descending'}
                sortColumnIndex={['name', 'createdAt', 'customer', 'totalPrice'].indexOf(sortConfig.column)}
                onSort={handleSort}
                loading={loading}
                selectable
            >
                {rowMarkup}
            </IndexTable>
        </Card>
    );
}
