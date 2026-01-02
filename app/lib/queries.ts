/**
 * Order Delivery Exporter - GraphQL Queries
 * Full queries for fetching comprehensive order data from Shopify Admin API
 */

// Full query to fetch orders with all necessary fields
export const ORDERS_QUERY = `
  query GetOrders($first: Int!, $after: String, $query: String, $sortKey: OrderSortKeys, $reverse: Boolean) {
    orders(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
      edges {
        cursor
        node {
          id
          name
          createdAt
          updatedAt
          closedAt
          cancelledAt
          displayFinancialStatus
          displayFulfillmentStatus
          confirmed
          fullyPaid
          note
          tags
          
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalTaxSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalDiscountsSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          
          customer {
            id
            email
            firstName
            lastName
            phone
          }
          
          shippingAddress {
            firstName
            lastName
            address1
            address2
            city
            province
            provinceCode
            country
            countryCodeV2
            zip
            phone
            company
          }
          
          billingAddress {
            firstName
            lastName
            address1
            address2
            city
            province
            provinceCode
            country
            countryCodeV2
            zip
            phone
            company
          }
          
          lineItems(first: 50) {
            nodes {
              id
              title
              variantTitle
              sku
              quantity
              originalUnitPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              discountedTotalSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              image {
                url
                altText
              }
            }
          }
          
          fulfillments {
            id
            status
            displayStatus
            createdAt
            deliveredAt
            estimatedDeliveryAt
            inTransitAt
            trackingInfo {
              company
              number
              url
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

// Query to fetch a single order by ID with full details
export const ORDER_BY_ID_QUERY = `
  query GetOrderById($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      updatedAt
      displayFinancialStatus
      displayFulfillmentStatus
      note
      tags
      
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      subtotalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalShippingPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalTaxSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      
      customer {
        id
        email
        firstName
        lastName
        phone
      }
      
      shippingAddress {
        firstName
        lastName
        address1
        address2
        city
        province
        country
        zip
        phone
        company
      }
      
      billingAddress {
        firstName
        lastName
        address1
        address2
        city
        province
        country
        zip
        phone
        company
      }
      
      lineItems(first: 50) {
        nodes {
          id
          title
          variantTitle
          sku
          quantity
          originalUnitPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
      
      fulfillments {
        id
        status
        displayStatus
        createdAt
        deliveredAt
        estimatedDeliveryAt
        trackingInfo {
          company
          number
          url
        }
      }
    }
  }
`;

// Query to get the total count of orders matching a filter
export const ORDERS_COUNT_QUERY = `
  query GetOrdersCount($query: String) {
    ordersCount(query: $query) {
      count
      precision
    }
  }
`;

// Build query string for order filtering
export function buildOrderQueryString(filters: {
  orderId?: string;
  dateFrom?: string;
  dateTo?: string;
  fulfillmentStatus?: string;
  financialStatus?: string;
  status?: string;
}): string {
  const queryParts: string[] = [];

  if (filters.orderId) {
    // Search by order name (e.g., "1001" matches "#1001")
    queryParts.push(`name:*${filters.orderId}*`);
  }

  if (filters.dateFrom) {
    queryParts.push(`created_at:>=${filters.dateFrom}`);
  }

  if (filters.dateTo) {
    queryParts.push(`created_at:<=${filters.dateTo}`);
  }

  if (filters.fulfillmentStatus && filters.fulfillmentStatus !== 'all') {
    const statuses = filters.fulfillmentStatus.split(',');
    if (statuses.length > 1) {
      const orParts = statuses.map(s => `fulfillment_status:${s}`).join(' OR ');
      queryParts.push(`(${orParts})`);
    } else {
      queryParts.push(`fulfillment_status:${filters.fulfillmentStatus}`);
    }
  }

  if (filters.financialStatus && filters.financialStatus !== 'all') {
    const statuses = filters.financialStatus.split(',');
    if (statuses.length > 1) {
      const orParts = statuses.map(s => `financial_status:${s}`).join(' OR ');
      queryParts.push(`(${orParts})`);
    } else {
      queryParts.push(`financial_status:${filters.financialStatus}`);
    }
  }

  if (filters.status && filters.status !== 'all') {
    const statuses = filters.status.split(',');
    if (statuses.length > 1) {
      const orParts = statuses.map(s => `status:${s}`).join(' OR ');
      queryParts.push(`(${orParts})`);
    } else {
      queryParts.push(`status:${filters.status}`);
    }
  }

  return queryParts.join(' AND ');
}
