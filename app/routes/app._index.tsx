/**
 * Order Delivery Exporter - Home Page
 * Dashboard with quick actions and app overview
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link as RemixLink } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Icon,
  Box,
  Banner,
  Divider,
  InlineGrid,
} from "@shopify/polaris";
import {
  OrderIcon,
  ExportIcon,
  RefreshIcon,
  DeliveryIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { fetchOrders } from "~/lib/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  try {
    // Fetch recent orders for dashboard stats
    const result = await fetchOrders({
      request,
      first: 10,
    });

    // Calculate stats - handle various Shopify status naming conventions
    const stats = {
      totalOrders: result.totalCount,
      recentOrders: result.orders.length,
      fulfilledCount: result.orders.filter(
        (o) => o.displayFulfillmentStatus === "FULFILLED"
      ).length,
      // Pending includes unfulfilled, partially fulfilled, in progress, or null statuses
      pendingCount: result.orders.filter(
        (o) =>
          o.displayFulfillmentStatus === "UNFULFILLED" ||
          o.displayFulfillmentStatus === "PARTIALLY_FULFILLED" ||
          o.displayFulfillmentStatus === "IN_PROGRESS" ||
          o.displayFulfillmentStatus === "PENDING" ||
          o.displayFulfillmentStatus === "OPEN" ||
          !o.displayFulfillmentStatus
      ).length,
      // In Transit - check fulfillments array OR the main status
      inTransitCount: result.orders.filter((o) => {
        // Check if any fulfillment is in transit
        const hasFulfillmentInTransit = o.fulfillments?.some(
          (f) =>
            f.displayStatus === "IN_TRANSIT" ||
            f.displayStatus === "OUT_FOR_DELIVERY" ||
            f.status === "IN_TRANSIT" ||
            f.status === "OUT_FOR_DELIVERY"
        );
        // Also count fulfilled orders with tracking but not delivered as "in transit"
        const isFulfilledWithTracking =
          o.displayFulfillmentStatus === "FULFILLED" &&
          o.fulfillments?.some((f) => f.trackingInfo && f.trackingInfo.length > 0) &&
          !o.fulfillments?.some((f) => f.displayStatus === "DELIVERED" || f.deliveredAt);

        return hasFulfillmentInTransit || isFulfilledWithTracking;
      }).length,
      // Delivered - check fulfillments array for delivered status
      deliveredCount: result.orders.filter((o) =>
        o.fulfillments?.some(
          (f) =>
            f.displayStatus === "DELIVERED" ||
            f.status === "DELIVERED" ||
            f.deliveredAt !== null
        )
      ).length,
    };

    return json({ stats, error: null });
  } catch (error) {
    console.error("Dashboard load error:", error);
    return json({
      stats: {
        totalOrders: 0,
        recentOrders: 0,
        fulfilledCount: 0,
        pendingCount: 0,
        inTransitCount: 0,
        deliveredCount: 0,
      },
      error: "Unable to load dashboard data. Please try again.",
    });
  }
};

export default function Index() {
  const { stats, error } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="Order Delivery Exporter" />
      <BlockStack gap="500">
        {/* Welcome Banner */}
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="400" align="space-between" blockAlign="center">
              <BlockStack gap="200">
                <Text as="h1" variant="headingLg">
                  Order Delivery Exporter
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Fetch, view, and export order delivery data with tracking
                  information to Excel or CSV.
                </Text>
              </BlockStack>
              <RemixLink to="/app/orders" style={{ textDecoration: "none" }}>
                <Button variant="primary" icon={OrderIcon}>
                  View Orders
                </Button>
              </RemixLink>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Error Banner */}
        {error && (
          <Banner tone="warning">
            <p>{error}</p>
          </Banner>
        )}

        {/* Stats Grid */}
        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
              {/* Total Orders */}
              <Card>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <div
                      style={{
                        padding: "8px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(0, 128, 96, 0.1)",
                      }}
                    >
                      <Icon source={OrderIcon} tone="success" />
                    </div>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Total Orders
                    </Text>
                  </InlineStack>
                  <Text as="p" variant="headingXl">
                    {stats.totalOrders.toLocaleString()}
                  </Text>
                </BlockStack>
              </Card>

              {/* Pending */}
              <Card>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <div
                      style={{
                        padding: "8px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(255, 184, 0, 0.1)",
                      }}
                    >
                      <Icon source={RefreshIcon} tone="warning" />
                    </div>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Pending
                    </Text>
                  </InlineStack>
                  <Text as="p" variant="headingXl">
                    {stats.pendingCount}
                  </Text>
                </BlockStack>
              </Card>

              {/* In Transit */}
              <Card>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <div
                      style={{
                        padding: "8px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(0, 111, 238, 0.1)",
                      }}
                    >
                      <Icon source={DeliveryIcon} tone="info" />
                    </div>
                    <Text as="span" variant="bodySm" tone="subdued">
                      In Transit
                    </Text>
                  </InlineStack>
                  <Text as="p" variant="headingXl">
                    {stats.inTransitCount}
                  </Text>
                </BlockStack>
              </Card>

              {/* Delivered */}
              <Card>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <div
                      style={{
                        padding: "8px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(0, 128, 96, 0.1)",
                      }}
                    >
                      <Icon source={ExportIcon} tone="success" />
                    </div>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Delivered
                    </Text>
                  </InlineStack>
                  <Text as="p" variant="headingXl">
                    {stats.deliveredCount}
                  </Text>
                </BlockStack>
              </Card>
            </InlineGrid>
          </Layout.Section>
        </Layout>

        {/* Features Section */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Features
                </Text>
                <Divider />

                <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                  <Box
                    padding="400"
                    borderRadius="200"
                    background="bg-surface-secondary"
                  >
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={OrderIcon} tone="base" />
                        <Text as="h3" variant="headingSm">
                          Comprehensive Order Data
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Fetch order details including financial status,
                        fulfillment status, customer info, line items, and
                        complete delivery information.
                      </Text>
                    </BlockStack>
                  </Box>

                  <Box
                    padding="400"
                    borderRadius="200"
                    background="bg-surface-secondary"
                  >
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={DeliveryIcon} tone="base" />
                        <Text as="h3" variant="headingSm">
                          Delivery Tracking
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        View carrier information, tracking numbers with direct
                        links, estimated delivery dates, and real-time delivery
                        status updates.
                      </Text>
                    </BlockStack>
                  </Box>

                  <Box
                    padding="400"
                    borderRadius="200"
                    background="bg-surface-secondary"
                  >
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={ExportIcon} tone="base" />
                        <Text as="h3" variant="headingSm">
                          Excel & CSV Export
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Export selected orders to Excel (.xlsx) or CSV format
                        with customizable data options including line items and
                        addresses.
                      </Text>
                    </BlockStack>
                  </Box>

                  <Box
                    padding="400"
                    borderRadius="200"
                    background="bg-surface-secondary"
                  >
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Icon source={RefreshIcon} tone="base" />
                        <Text as="h3" variant="headingSm">
                          Smart Filtering
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Filter orders by date range, fulfillment status,
                        financial status, or search by order number and customer
                        details.
                      </Text>
                    </BlockStack>
                  </Box>
                </InlineGrid>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Quick Actions */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Quick Actions
                </Text>
                <Divider />
                <InlineStack gap="300">
                  <RemixLink to="/app/orders" style={{ textDecoration: "none" }}>
                    <Button icon={OrderIcon}>View All Orders</Button>
                  </RemixLink>
                  <RemixLink
                    to="/app/orders?fulfillmentStatus=unfulfilled"
                    style={{ textDecoration: "none" }}
                  >
                    <Button icon={RefreshIcon}>View Unfulfilled Orders</Button>
                  </RemixLink>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
