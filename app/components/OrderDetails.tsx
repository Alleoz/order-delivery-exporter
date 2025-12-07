/**
 * Order Delivery Exporter - Order Details Modal
 * Displays comprehensive order details in a modal
 */

import {
    Modal,
    BlockStack,
    InlineStack,
    Text,
    Badge,
    Divider,
    Card,
    Thumbnail,
    Link,
    Box,
    InlineGrid,
    List,
} from '@shopify/polaris';
import type { Order, Fulfillment, TrackingInfo, LineItem } from '~/lib/types';

interface OrderDetailsProps {
    order: Order | null;
    open: boolean;
    onClose: () => void;
}

/**
 * Format date for display
 */
function formatDateTime(dateString: string | null): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
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
 * Format address for display
 */
function formatAddress(address: Order['shippingAddress']): string[] {
    if (!address) return ['No address provided'];
    const lines: string[] = [];

    if (address.firstName || address.lastName) {
        lines.push(`${address.firstName || ''} ${address.lastName || ''}`.trim());
    }
    if (address.company) lines.push(address.company);
    if (address.address1) lines.push(address.address1);
    if (address.address2) lines.push(address.address2);
    if (address.city || address.province || address.zip) {
        lines.push(`${address.city || ''}, ${address.province || ''} ${address.zip || ''}`.trim());
    }
    if (address.country) lines.push(address.country);
    if (address.phone) lines.push(`Phone: ${address.phone}`);

    return lines.length > 0 ? lines : ['No address provided'];
}

export function OrderDetails({ order, open, onClose }: OrderDetailsProps) {
    if (!order) return null;

    const currency = order.totalPriceSet?.shopMoney?.currencyCode || 'USD';

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`Order ${order.name}`}
            size="large"
            primaryAction={{
                content: 'Close',
                onAction: onClose,
            }}
        >
            <Modal.Section>
                <BlockStack gap="500">
                    {/* Order Summary */}
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingMd" as="h3">Order Summary</Text>

                            <InlineGrid columns={3} gap="400">
                                <BlockStack gap="200">
                                    <Text variant="bodySm" tone="subdued" as="p">Created</Text>
                                    <Text variant="bodyMd" as="p">{formatDateTime(order.createdAt)}</Text>
                                </BlockStack>

                                <BlockStack gap="200">
                                    <Text variant="bodySm" tone="subdued" as="p">Updated</Text>
                                    <Text variant="bodyMd" as="p">{formatDateTime(order.updatedAt)}</Text>
                                </BlockStack>

                                <BlockStack gap="200">
                                    <Text variant="bodySm" tone="subdued" as="p">Status</Text>
                                    <InlineStack gap="200">
                                        <Badge tone={order.displayFinancialStatus === 'PAID' ? 'success' : 'warning'}>
                                            {order.displayFinancialStatus || 'Pending'}
                                        </Badge>
                                        <Badge tone={order.displayFulfillmentStatus === 'FULFILLED' ? 'success' : 'attention'}>
                                            {order.displayFulfillmentStatus || 'Unfulfilled'}
                                        </Badge>
                                    </InlineStack>
                                </BlockStack>
                            </InlineGrid>
                        </BlockStack>
                    </Card>

                    {/* Customer Info */}
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingMd" as="h3">Customer Information</Text>

                            <InlineGrid columns={2} gap="400">
                                <BlockStack gap="200">
                                    <Text variant="bodySm" tone="subdued" as="p">Customer</Text>
                                    {order.customer ? (
                                        <BlockStack gap="100">
                                            <Text variant="bodyMd" as="p">
                                                {`${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim() || 'Guest'}
                                            </Text>
                                            {order.customer.email && (
                                                <Link url={`mailto:${order.customer.email}`}>{order.customer.email}</Link>
                                            )}
                                            {order.customer.phone && (
                                                <Text variant="bodySm" as="p">{order.customer.phone}</Text>
                                            )}
                                        </BlockStack>
                                    ) : (
                                        <Text variant="bodyMd" as="p">Guest checkout</Text>
                                    )}
                                </BlockStack>

                                <BlockStack gap="200">
                                    <Text variant="bodySm" tone="subdued" as="p">Shipping Address</Text>
                                    {formatAddress(order.shippingAddress).map((line, i) => (
                                        <Text key={i} variant="bodyMd" as="p">{line}</Text>
                                    ))}
                                </BlockStack>
                            </InlineGrid>
                        </BlockStack>
                    </Card>

                    {/* Delivery & Tracking */}
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingMd" as="h3">Delivery & Tracking</Text>

                            {order.fulfillments.length > 0 ? (
                                order.fulfillments.map((fulfillment: Fulfillment, index: number) => (
                                    <Card key={fulfillment.id}>
                                        <BlockStack gap="300">
                                            <InlineStack gap="300" align="space-between">
                                                <Text variant="headingSm" as="h4">
                                                    Shipment {index + 1}
                                                </Text>
                                                <Badge tone={fulfillment.displayStatus === 'DELIVERED' ? 'success' : 'info'}>
                                                    {fulfillment.displayStatus?.replace(/_/g, ' ') || fulfillment.status}
                                                </Badge>
                                            </InlineStack>

                                            <InlineGrid columns={2} gap="400">
                                                <BlockStack gap="200">
                                                    <Text variant="bodySm" tone="subdued" as="p">Fulfilled At</Text>
                                                    <Text variant="bodyMd" as="p">{formatDateTime(fulfillment.createdAt)}</Text>
                                                </BlockStack>

                                                {fulfillment.estimatedDeliveryAt && (
                                                    <BlockStack gap="200">
                                                        <Text variant="bodySm" tone="subdued" as="p">Estimated Delivery</Text>
                                                        <Text variant="bodyMd" as="p">{formatDateTime(fulfillment.estimatedDeliveryAt)}</Text>
                                                    </BlockStack>
                                                )}

                                                {fulfillment.deliveredAt && (
                                                    <BlockStack gap="200">
                                                        <Text variant="bodySm" tone="subdued" as="p">Delivered At</Text>
                                                        <Text variant="bodyMd" as="p">{formatDateTime(fulfillment.deliveredAt)}</Text>
                                                    </BlockStack>
                                                )}
                                            </InlineGrid>

                                            {fulfillment.trackingInfo.length > 0 && (
                                                <BlockStack gap="200">
                                                    <Text variant="bodySm" tone="subdued" as="p">Tracking</Text>
                                                    {fulfillment.trackingInfo.map((tracking: TrackingInfo, trackIndex: number) => (
                                                        <InlineStack key={trackIndex} gap="200">
                                                            {tracking.company && (
                                                                <Text variant="bodyMd" fontWeight="semibold" as="span">
                                                                    {tracking.company}:
                                                                </Text>
                                                            )}
                                                            {tracking.url ? (
                                                                <Link url={tracking.url} target="_blank">
                                                                    {tracking.number || 'Track shipment'}
                                                                </Link>
                                                            ) : (
                                                                <Text variant="bodyMd" as="span">{tracking.number}</Text>
                                                            )}
                                                        </InlineStack>
                                                    ))}
                                                </BlockStack>
                                            )}
                                        </BlockStack>
                                    </Card>
                                ))
                            ) : (
                                <Text variant="bodyMd" tone="subdued" as="p">
                                    No shipments yet. This order has not been fulfilled.
                                </Text>
                            )}
                        </BlockStack>
                    </Card>

                    {/* Line Items */}
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingMd" as="h3">Items</Text>

                            {order.lineItems.nodes.map((item: LineItem) => (
                                <InlineStack key={item.id} gap="400" align="space-between" blockAlign="center">
                                    <InlineStack gap="300">
                                        {item.image && (
                                            <Thumbnail
                                                source={item.image.url}
                                                alt={item.image.altText || item.title}
                                                size="small"
                                            />
                                        )}
                                        <BlockStack gap="100">
                                            <Text variant="bodyMd" fontWeight="semibold" as="p">
                                                {item.title}
                                            </Text>
                                            {item.variantTitle && (
                                                <Text variant="bodySm" tone="subdued" as="p">
                                                    {item.variantTitle}
                                                </Text>
                                            )}
                                            {item.sku && (
                                                <Text variant="bodySm" tone="subdued" as="p">
                                                    SKU: {item.sku}
                                                </Text>
                                            )}
                                        </BlockStack>
                                    </InlineStack>

                                    <InlineStack gap="400">
                                        <Text variant="bodyMd" as="span">× {item.quantity}</Text>
                                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                                            {formatCurrency(
                                                item.discountedTotalSet?.shopMoney?.amount,
                                                item.discountedTotalSet?.shopMoney?.currencyCode
                                            )}
                                        </Text>
                                    </InlineStack>
                                </InlineStack>
                            ))}

                            <Divider />

                            {/* Totals */}
                            <BlockStack gap="200">
                                <InlineStack align="space-between">
                                    <Text variant="bodyMd" as="p">Subtotal</Text>
                                    <Text variant="bodyMd" as="p">
                                        {formatCurrency(order.subtotalPriceSet?.shopMoney?.amount, currency)}
                                    </Text>
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text variant="bodyMd" as="p">Shipping</Text>
                                    <Text variant="bodyMd" as="p">
                                        {formatCurrency(order.totalShippingPriceSet?.shopMoney?.amount, currency)}
                                    </Text>
                                </InlineStack>

                                {parseFloat(order.totalDiscountsSet?.shopMoney?.amount || '0') > 0 && (
                                    <InlineStack align="space-between">
                                        <Text variant="bodyMd" as="p">Discounts</Text>
                                        <Text variant="bodyMd" tone="critical" as="p">
                                            -{formatCurrency(order.totalDiscountsSet?.shopMoney?.amount, currency)}
                                        </Text>
                                    </InlineStack>
                                )}

                                <InlineStack align="space-between">
                                    <Text variant="bodyMd" as="p">Tax</Text>
                                    <Text variant="bodyMd" as="p">
                                        {formatCurrency(order.totalTaxSet?.shopMoney?.amount, currency)}
                                    </Text>
                                </InlineStack>

                                <Divider />

                                <InlineStack align="space-between">
                                    <Text variant="headingSm" as="p">Total</Text>
                                    <Text variant="headingSm" as="p">
                                        {formatCurrency(order.totalPriceSet?.shopMoney?.amount, currency)}
                                    </Text>
                                </InlineStack>
                            </BlockStack>
                        </BlockStack>
                    </Card>

                    {/* Notes */}
                    {order.note && (
                        <Card>
                            <BlockStack gap="300">
                                <Text variant="headingMd" as="h3">Notes</Text>
                                <Text variant="bodyMd" as="p">{order.note}</Text>
                            </BlockStack>
                        </Card>
                    )}

                    {/* Tags */}
                    {order.tags.length > 0 && (
                        <Card>
                            <BlockStack gap="300">
                                <Text variant="headingMd" as="h3">Tags</Text>
                                <InlineStack gap="200">
                                    {order.tags.map((tag: string, i: number) => (
                                        <Badge key={i}>{tag}</Badge>
                                    ))}
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    )}
                </BlockStack>
            </Modal.Section>
        </Modal>
    );
}
