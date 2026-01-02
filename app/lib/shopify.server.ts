/**
 * Order Delivery Exporter - Shopify API Service
 * Server-side functions for fetching order data
 */

import { authenticate } from "~/shopify.server";
import { GraphqlQueryError } from "@shopify/shopify-api";
import { ORDERS_QUERY, ORDER_BY_ID_QUERY, ORDERS_COUNT_QUERY, buildOrderQueryString } from "./queries";
import type { Order, OrdersResponse, PageInfo } from "./types";

export interface FetchOrdersParams {
    request: Request;
    first?: number;
    after?: string;
    orderId?: string;
    dateFrom?: string;
    dateTo?: string;
    fulfillmentStatus?: string;
    financialStatus?: string;
    status?: string;
    sortKey?: string;
    reverse?: boolean;
}

export interface FetchOrderByIdParams {
    request: Request;
    orderId: string;
}

/**
 * Transform raw GraphQL order data to our Order type
 */
function transformOrder(rawOrder: any): Order {
    return {
        id: rawOrder.id,
        name: rawOrder.name,
        createdAt: rawOrder.createdAt,
        updatedAt: rawOrder.updatedAt,
        closedAt: rawOrder.closedAt,
        cancelledAt: rawOrder.cancelledAt,
        processedAt: rawOrder.processedAt,
        displayFinancialStatus: rawOrder.displayFinancialStatus,
        displayFulfillmentStatus: rawOrder.displayFulfillmentStatus,
        confirmed: rawOrder.confirmed,
        fullyPaid: rawOrder.fullyPaid,
        note: rawOrder.note,
        tags: rawOrder.tags || [],

        totalPriceSet: rawOrder.totalPriceSet,
        subtotalPriceSet: rawOrder.subtotalPriceSet,
        totalShippingPriceSet: rawOrder.totalShippingPriceSet,
        totalTaxSet: rawOrder.totalTaxSet,
        totalDiscountsSet: rawOrder.totalDiscountsSet,
        totalRefundedSet: rawOrder.totalRefundedSet,

        customer: rawOrder.customer ? {
            id: rawOrder.customer.id,
            email: rawOrder.customer.email,
            firstName: rawOrder.customer.firstName,
            lastName: rawOrder.customer.lastName,
            phone: rawOrder.customer.phone,
            numberOfOrders: rawOrder.customer.numberOfOrders,
        } : null,

        shippingAddress: rawOrder.shippingAddress ? {
            firstName: rawOrder.shippingAddress.firstName,
            lastName: rawOrder.shippingAddress.lastName,
            address1: rawOrder.shippingAddress.address1,
            address2: rawOrder.shippingAddress.address2,
            city: rawOrder.shippingAddress.city,
            province: rawOrder.shippingAddress.province,
            provinceCode: rawOrder.shippingAddress.provinceCode,
            country: rawOrder.shippingAddress.country,
            countryCode: rawOrder.shippingAddress.countryCodeV2,
            zip: rawOrder.shippingAddress.zip,
            phone: rawOrder.shippingAddress.phone,
            company: rawOrder.shippingAddress.company,
        } : null,

        billingAddress: rawOrder.billingAddress ? {
            firstName: rawOrder.billingAddress.firstName,
            lastName: rawOrder.billingAddress.lastName,
            address1: rawOrder.billingAddress.address1,
            address2: rawOrder.billingAddress.address2,
            city: rawOrder.billingAddress.city,
            province: rawOrder.billingAddress.province,
            provinceCode: rawOrder.billingAddress.provinceCode,
            country: rawOrder.billingAddress.country,
            countryCode: rawOrder.billingAddress.countryCodeV2,
            zip: rawOrder.billingAddress.zip,
            phone: rawOrder.billingAddress.phone,
            company: rawOrder.billingAddress.company,
        } : null,

        lineItems: {
            nodes: (rawOrder.lineItems?.nodes || []).map((item: any) => ({
                id: item.id,
                title: item.title,
                variantTitle: item.variantTitle,
                sku: item.sku,
                quantity: item.quantity,
                originalUnitPriceSet: item.originalUnitPriceSet,
                discountedTotalSet: item.discountedTotalSet,
                image: item.image,
                product: item.product,
                variant: item.variant,
            })),
        },

        fulfillments: (rawOrder.fulfillments || []).map((fulfillment: any) => ({
            id: fulfillment.id,
            status: fulfillment.status,
            displayStatus: fulfillment.displayStatus,
            createdAt: fulfillment.createdAt,
            deliveredAt: fulfillment.deliveredAt,
            estimatedDeliveryAt: fulfillment.estimatedDeliveryAt,
            inTransitAt: fulfillment.inTransitAt,
            trackingInfo: (fulfillment.trackingInfo || []).map((info: any) => ({
                company: info.company,
                number: info.number,
                url: info.url,
            })),
            fulfillmentLineItems: {
                nodes: fulfillment.fulfillmentLineItems?.nodes || [],
            },
        })),
    };
}



/**
 * Fetch orders with optional filters and pagination
 */
export async function fetchOrders(params: FetchOrdersParams): Promise<OrdersResponse> {
    const { admin } = await authenticate.admin(params.request);

    const queryString = buildOrderQueryString({
        orderId: params.orderId,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        fulfillmentStatus: params.fulfillmentStatus,
        financialStatus: params.financialStatus,
        status: params.status,
    });

    const sortKeyMap: Record<string, string> = {
        name: 'ORDER_NUMBER',
        createdAt: 'CREATED_AT',
        updatedAt: 'UPDATED_AT',
        totalPrice: 'TOTAL_PRICE',
        customer: 'CUSTOMER_NAME',
    };

    try {
        // Run both queries in parallel
        const [ordersResponse, countResponse] = await Promise.all([
            admin.graphql(ORDERS_QUERY, {
                variables: {
                    first: params.first || 50,
                    after: params.after || null,
                    query: queryString || null,
                    sortKey: sortKeyMap[params.sortKey || 'createdAt'] || 'CREATED_AT',
                    reverse: params.reverse ?? true,
                },
            }),
            admin.graphql(ORDERS_COUNT_QUERY, {
                variables: {
                    query: queryString || null,
                },
            }),
        ]);

        const data: any = await ordersResponse.json();
        const countData: any = await countResponse.json();

        if (data.errors) {
            console.error('GraphQL Errors:', JSON.stringify(data.errors, null, 2));
            throw new Error(`Failed to fetch orders: ${data.errors.map((e: any) => e.message).join(', ')}`);
        }

        const orders = data.data.orders.edges.map((edge: any) => transformOrder(edge.node));
        const pageInfo: PageInfo = data.data.orders.pageInfo;

        // Use the count from the separate query, fallback to orders length if failed (though Promise.all would reject)
        const totalCount = countData.data?.ordersCount?.count ?? orders.length;

        return {
            orders,
            pageInfo,
            totalCount,
        };
    } catch (error: any) {
        console.error('Error fetching orders:', error.message);

        // Check if it's a GraphQL query error from Shopify
        if (error instanceof GraphqlQueryError) {
            console.error('GraphQL Query Error - body.errors:', JSON.stringify(error.body?.errors, null, 2));
            throw new Error(`Failed to fetch orders: ${JSON.stringify(error.body?.errors)}`);
        }

        // Log other error details
        console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

        // If GraphQL errors exist in the error object, log them
        if (error.graphQLErrors) {
            console.error('GraphQL Errors array:', JSON.stringify(error.graphQLErrors, null, 2));
        }
        if (error.body?.errors) {
            console.error('Error body.errors:', JSON.stringify(error.body.errors, null, 2));
        }

        throw error;
    }
}

/**
 * Fetch a single order by its GraphQL ID
 */
export async function fetchOrderById(params: FetchOrderByIdParams): Promise<Order | null> {
    const { admin } = await authenticate.admin(params.request);

    const response = await admin.graphql(ORDER_BY_ID_QUERY, {
        variables: {
            id: params.orderId,
        },
    });

    const data: any = await response.json();

    if (data.errors) {
        console.error('GraphQL Errors:', data.errors);
        throw new Error('Failed to fetch order');
    }

    if (!data.data.order) {
        return null;
    }

    return transformOrder(data.data.order);
}

/**
 * Fetch multiple orders by their IDs
 */
export async function fetchOrdersByIds(request: Request, orderIds: string[]): Promise<Order[]> {
    const orders: Order[] = [];

    for (const orderId of orderIds) {
        const order = await fetchOrderById({ request, orderId });
        if (order) {
            orders.push(order);
        }
    }

    return orders;
}
