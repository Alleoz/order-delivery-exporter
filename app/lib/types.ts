/**
 * Order Delivery Exporter - Type Definitions
 * Comprehensive types for Shopify order data
 */

// Money representation
export interface Money {
    amount: string;
    currencyCode: string;
}

export interface MoneyBag {
    shopMoney: Money;
    presentmentMoney: Money;
}

// Line Item types
export interface LineItem {
    id: string;
    title: string;
    variantTitle: string | null;
    sku: string | null;
    quantity: number;
    originalUnitPriceSet: MoneyBag;
    discountedTotalSet: MoneyBag;
    image: {
        url: string;
        altText: string | null;
    } | null;
    product: {
        id: string;
        title: string;
    } | null;
    variant: {
        id: string;
        title: string;
    } | null;
}

// Tracking information
export interface TrackingInfo {
    company: string | null;
    number: string | null;
    url: string | null;
}

// Fulfillment types
export interface Fulfillment {
    id: string;
    status: string;
    displayStatus: string | null;
    createdAt: string;
    deliveredAt: string | null;
    estimatedDeliveryAt: string | null;
    inTransitAt: string | null;
    trackingInfo: TrackingInfo[];
    fulfillmentLineItems: {
        nodes: Array<{
            id: string;
            quantity: number;
            lineItem: {
                id: string;
                title: string;
            };
        }>;
    };
}

// Customer types
export interface Customer {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    numberOfOrders: string;
}

// Address types
export interface Address {
    firstName: string | null;
    lastName: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    provinceCode: string | null;
    country: string | null;
    countryCode: string | null;
    zip: string | null;
    phone: string | null;
    company: string | null;
}

// Main Order type
export interface Order {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    cancelledAt: string | null;
    processedAt: string | null;
    displayFinancialStatus: string | null;
    displayFulfillmentStatus: string | null;
    confirmed: boolean;
    fullyPaid: boolean;
    note: string | null;
    tags: string[];

    // Totals
    totalPriceSet: MoneyBag;
    subtotalPriceSet: MoneyBag;
    totalShippingPriceSet: MoneyBag;
    totalTaxSet: MoneyBag;
    totalDiscountsSet: MoneyBag;
    totalRefundedSet: MoneyBag;

    // Customer & Addresses
    customer: Customer | null;
    shippingAddress: Address | null;
    billingAddress: Address | null;

    // Line Items
    lineItems: {
        nodes: LineItem[];
    };

    // Fulfillments
    fulfillments: Fulfillment[];
}

// Filter types for the order table
export interface OrderFilters {
    query: string;
    status: string;
    fulfillmentStatus: string;
    deliveryStatus: string;
    dateFrom: string;
    dateTo: string;
}

// Pagination cursor info
export interface PageInfo {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
}

// Orders response with pagination
export interface OrdersResponse {
    orders: Order[];
    pageInfo: PageInfo;
    totalCount: number;
}

// Export options
export interface ExportOptions {
    format: 'xlsx' | 'csv';
    includeLineItems: boolean;
    includeFulfillments: boolean;
    includeAddresses: boolean;
}

// Sort configuration
export interface SortConfig {
    column: string;
    direction: 'asc' | 'desc';
}
