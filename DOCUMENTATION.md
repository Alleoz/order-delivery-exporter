# Shopify Order Status & Export App - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Features](#features)
3. [Technical Architecture](#technical-architecture)
4. [User Guide](#user-guide)
5. [API Reference](#api-reference)
6. [Data Model](#data-model)
7. [Export Functionality](#export-functionality)
8. [Deployment](#deployment)

---

## Overview

**Order Status & Export** is a Shopify embedded app that provides merchants with powerful tools to view, filter, search, and export their order data. Built with modern web technologies, it offers a seamless experience for managing order delivery information and generating detailed reports.

### Key Capabilities
- **Real-time Order Viewing**: Browse all orders with pagination
- **Advanced Filtering**: Multi-criteria search and filtering
- **Bulk Export**: Export selected orders or all matching results to Excel/CSV
- **Delivery Tracking**: View carrier information and tracking links
- **Detailed Order Views**: Comprehensive order information in modal dialogs

---

## Features

### 1. Order Management Dashboard

#### Order Table Display
The main interface presents orders in a sortable, selectable table with the following columns:

| Column | Description | Sortable |
|--------|-------------|----------|
| **Order** | Order number (clickable link to details) | ✓ |
| **Date** | Order creation date with hover tooltip for full timestamp | ✓ |
| **Customer** | Customer name and email | ✓ |
| **Total** | Order total amount in shop currency | ✓ |
| **Payment** | Financial status badge (Paid, Pending, Refunded, etc.) | ✗ |
| **Fulfillment** | Fulfillment status badge (Fulfilled, Unfulfilled, Partial) | ✗ |
| **Delivery** | Delivery status with carrier and tracking info | ✗ |
| **Actions** | View details button | ✗ |

**Status Badges**:
- **Financial Status**: Color-coded badges (Green=Paid, Yellow=Pending, Red=Voided)
- **Fulfillment Status**: Visual indicators for fulfillment progress
- **Delivery Status**: Real-time tracking status from carriers

**Interactive Features**:
- Click order number to view full details
- Click tracking number to open carrier tracking page
- Hover over dates for full timestamp
- Select multiple orders via checkboxes
- Select all orders on current page

### 2. Advanced Search & Filtering

#### Search Bar
- **Order Number**: Search by exact or partial order number
- **Customer Name**: Find orders by customer first/last name
- **Email**: Search by customer email address
- **Multi-Order Search**: Enter comma-separated order numbers (e.g., "1001, 1002, 1003")

#### Filter Options

**Order Status** (Multi-select):
- Open
- Closed
- Cancelled

**Fulfillment Status** (Multi-select):
- Fulfilled
- Unfulfilled
- Partially Fulfilled
- Scheduled
- On Hold

**Delivery Status** (Multi-select):
- Scheduled
- In Transit
- Out for Delivery
- Delivered
- Delivery Failed
- Attempted Delivery
- Ready for Pickup
- Picked Up
- Label Printed
- Label Purchased

**Date Range**:
- Date From: Filter orders created after this date
- Date To: Filter orders created before this date

**Filter Actions**:
- **Apply Filters**: Execute the current filter criteria
- **Reset**: Clear all filters and return to unfiltered view

### 3. Export Functionality

#### Export Modes

**Selected Orders Export**:
- Export only the orders you've selected via checkboxes
- Useful for specific order sets
- Minimum: 1 order required

**Export All Matching Orders** (NEW):
- Export ALL orders that match your current search/filter criteria
- Automatically handles pagination (fetches all pages)
- Bypasses the 50-order-per-page display limit
- Maximum: 2000 orders (safety limit)
- Example: If you filter for "Fulfilled" status and get 400 results, all 400 will be exported

#### Export Configuration

**Format Options**:
- **Excel (.xlsx)**: Best for data analysis, manipulation, and pivot tables
- **CSV (.csv)**: Universal format compatible with all spreadsheet applications

**Data Inclusion Options**:

1. **Line Items**
   - When enabled: Creates one row per product in each order
   - Includes: Item title, variant, SKU, quantity, unit price, total
   - When disabled: Shows line items as summary text in single row

2. **Fulfillment & Tracking**
   - Carrier names
   - Tracking numbers (clickable links in Excel)
   - Tracking URLs
   - Delivery status
   - Delivered date
   - Estimated delivery date

3. **Addresses**
   - Full shipping address
   - Full billing address
   - Formatted as comma-separated values

#### Export Data Fields

**Always Included**:
- Order Number
- Order ID (Shopify internal ID)
- Created At
- Updated At
- Financial Status
- Fulfillment Status
- Delivery Status
- Total, Subtotal, Shipping, Tax, Discounts, Refunded amounts
- Customer Email, Name, Phone
- Notes
- Tags

**Conditionally Included** (based on options):
- Item-level details (title, variant, SKU, quantity, prices)
- Carrier and tracking information
- Shipping and billing addresses

### 4. Order Details Modal

Click any order number or "View Details" button to open a comprehensive modal showing:

**Order Summary**:
- Created date/time
- Last updated date/time
- Financial and fulfillment status badges

**Customer Information**:
- Full name
- Email (clickable mailto link)
- Phone number
- Shipping address (formatted)

**Delivery & Tracking**:
- Multiple shipments (if applicable)
- Shipment status for each
- Fulfillment date
- Estimated delivery date
- Actual delivery date (if delivered)
- Carrier name and tracking number (clickable link)

**Line Items**:
- Product thumbnail images
- Product title and variant
- SKU
- Quantity
- Unit price
- Line total

**Order Totals**:
- Subtotal
- Shipping
- Discounts (if any)
- Tax
- **Grand Total**

**Additional Information**:
- Order notes (if any)
- Order tags (if any)

---

## Technical Architecture

### Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Framework** | Remix | 2.16.7 |
| **UI Library** | Shopify Polaris | 12.0.0 |
| **API** | Shopify Admin GraphQL API | Latest |
| **Authentication** | @shopify/shopify-app-remix | 3.7.0 |
| **Database** | SQLite + Prisma | 6.2.1 |
| **Excel Export** | xlsx (SheetJS) | 0.18.5 |
| **Runtime** | Node.js | 18.20+ / 20.10+ |

### Project Structure

```
order-status/
├── app/
│   ├── components/          # React components
│   │   ├── OrderTable.tsx       # Main table with selection
│   │   ├── OrderFilters.tsx     # Filter controls
│   │   ├── OrderDetails.tsx     # Order details modal
│   │   └── ExportModal.tsx      # Export configuration modal
│   ├── lib/
│   │   ├── types.ts             # TypeScript definitions
│   │   ├── queries.ts           # GraphQL queries
│   │   └── shopify.server.ts    # Shopify API client
│   ├── routes/
│   │   ├── app._index.tsx       # Dashboard home
│   │   ├── app.orders.tsx       # Orders page (main)
│   │   └── app.tsx              # App layout
│   ├── utils/
│   │   └── export.server.ts     # Export utilities
│   └── shopify.server.ts        # Auth configuration
├── prisma/
│   └── schema.prisma            # Database schema
└── package.json
```

### Data Flow

```
User Action → Remix Route (Loader/Action)
    ↓
Shopify GraphQL API (via admin.graphql)
    ↓
Data Transformation (transformOrder)
    ↓
React Component Rendering
    ↓
User Interface (Polaris Components)
```

### Authentication Flow

1. User installs app from Shopify App Store
2. OAuth flow initiated via Shopify App Bridge
3. Session stored in SQLite database via Prisma
4. Subsequent requests authenticated via session tokens
5. GraphQL requests include shop-specific authentication

---

## User Guide

### Getting Started

1. **Installation**:
   - Install the app from your Shopify Admin
   - Grant required permissions (read_orders, read_fulfillments, read_shipping)
   - App appears in your Shopify Admin sidebar

2. **First Use**:
   - Navigate to the app from your admin
   - Orders automatically load (most recent first)
   - Total order count displayed in header

### Common Workflows

#### Workflow 1: Export All Fulfilled Orders from Last Month

1. Set **Date From**: First day of last month
2. Set **Date To**: Last day of last month
3. Select **Fulfillment Status**: Fulfilled
4. Click **Apply Filters**
5. Click **Export Selected** button (enabled even with no selection)
6. Choose **"All orders matching search (X)"**
7. Select format (Excel or CSV)
8. Enable desired data options
9. Click **Export**
10. File downloads automatically

#### Workflow 2: Find and Export Specific Orders

1. Enter order numbers in search: "1001, 1002, 1003"
2. Click **Apply Filters**
3. Review results in table
4. Select individual orders or use "Select All"
5. Click **Export Selected**
6. Choose **"Selected orders (3)"**
7. Configure export options
8. Click **Export**

#### Workflow 3: Track Delivery Status

1. Filter by **Delivery Status**: In Transit
2. Click **Apply Filters**
3. View tracking information in Delivery column
4. Click tracking number to open carrier website
5. Or click order number to view full details in modal

### Tips & Best Practices

**Performance**:
- Use date range filters to limit results for faster loading
- Export in batches if dealing with >1000 orders
- CSV format is faster for very large exports

**Data Accuracy**:
- Refresh page to get latest order updates
- Export timestamps are in your local timezone
- Currency formatting matches shop settings

**Filtering**:
- Combine multiple filters for precise results
- Use "Reset" to clear all filters quickly
- Multi-select allows OR logic (e.g., "Fulfilled OR Partial")

---

## API Reference

### GraphQL Queries

#### ORDERS_QUERY
Fetches orders with comprehensive data including line items, fulfillments, and customer info.

**Variables**:
- `first`: Number of orders to fetch (max 50)
- `after`: Pagination cursor
- `query`: Search/filter query string
- `sortKey`: Sort field (ORDER_NUMBER, CREATED_AT, etc.)
- `reverse`: Sort direction (boolean)

**Returns**:
- Order edges with full order data
- PageInfo for pagination
- Total count via separate query

#### ORDERS_COUNT_QUERY
Gets total count of orders matching filter criteria.

**Variables**:
- `query`: Search/filter query string

**Returns**:
- `count`: Total number of matching orders
- `precision`: Count precision indicator

### Server Functions

#### fetchOrders(params)
Fetches a single page of orders (up to 50).

**Parameters**:
```typescript
{
  request: Request;
  first?: number;
  after?: string;
  orderId?: string;
  dateFrom?: string;
  dateTo?: string;
  fulfillmentStatus?: string;
  deliveryStatus?: string;
  status?: string;
  sortKey?: string;
  reverse?: boolean;
}
```

**Returns**: `OrdersResponse` with orders, pageInfo, and totalCount

#### fetchAllOrders(params)
Fetches ALL orders matching criteria by automatically paginating.

**Parameters**: Same as `fetchOrders`

**Returns**: `Order[]` (array of all matching orders)

**Behavior**:
- Loops through all pages using cursor-based pagination
- Safety limit: 2000 orders maximum
- Logs progress to console
- Throws error if GraphQL query fails

#### generateExcelFile(orders, options)
Generates Excel or CSV file from order data.

**Parameters**:
```typescript
orders: Order[]
options: {
  format: 'xlsx' | 'csv';
  includeLineItems: boolean;
  includeFulfillments: boolean;
  includeAddresses: boolean;
}
```

**Returns**: `Buffer` containing file data

---

## Data Model

### Order Type
```typescript
interface Order {
  id: string;                    // Shopify GID
  name: string;                  // Order number (#1001)
  createdAt: string;             // ISO timestamp
  updatedAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  
  totalPriceSet: MoneyBag;
  subtotalPriceSet: MoneyBag;
  totalShippingPriceSet: MoneyBag;
  totalTaxSet: MoneyBag;
  totalDiscountsSet: MoneyBag;
  
  customer: Customer | null;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  lineItems: { nodes: LineItem[] };
  fulfillments: Fulfillment[];
  
  note: string | null;
  tags: string[];
}
```

### Fulfillment Type
```typescript
interface Fulfillment {
  id: string;
  status: string;
  displayStatus: string | null;
  createdAt: string;
  deliveredAt: string | null;
  estimatedDeliveryAt: string | null;
  trackingInfo: TrackingInfo[];
}
```

### LineItem Type
```typescript
interface LineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  originalUnitPriceSet: MoneyBag;
  discountedTotalSet: MoneyBag;
  image: { url: string; altText: string | null } | null;
}
```

---

## Export Functionality

### Export Process Flow

1. **User Selection**:
   - User selects export mode (Selected vs All)
   - Configures format and data options

2. **Data Fetching**:
   - **Selected Mode**: Uses already-loaded order data
   - **All Mode**: Calls `fetchAllOrders()` with current filters

3. **Data Transformation**:
   - Orders converted to flat rows
   - Nested data (line items, fulfillments) flattened
   - Dates formatted to locale
   - Currency formatted with symbols

4. **File Generation**:
   - XLSX: Binary workbook with auto-sized columns
   - CSV: UTF-8 encoded text

5. **Download**:
   - Buffer converted to base64
   - Sent to client via JSON
   - Client creates Blob and triggers download

### Export Limits

| Limit Type | Value | Reason |
|------------|-------|--------|
| Max orders per export | 2000 | Prevent timeout/memory issues |
| Max orders per page | 50 | Shopify API limit |
| File size | ~10MB typical | Depends on data included |

---

## Deployment

### Environment Variables

Required variables (auto-configured by Shopify CLI):
```bash
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=https://your-app-url.com
SCOPES=read_orders,read_fulfillments,read_shipping
DATABASE_URL=file:./dev.db
```

### Deployment Platforms

**Supported**:
- Railway (recommended)
- Vercel
- Heroku
- Fly.io
- Any Node.js hosting with SQLite support

**Deployment Steps**:
1. Build the app: `npm run build`
2. Set environment variables on platform
3. Deploy built files
4. Run database migrations: `npm run setup`
5. Update app URL in Shopify Partner Dashboard

### Production Considerations

**Database**:
- SQLite works for development
- Consider PostgreSQL for production (update Prisma schema)
- Session cleanup recommended for long-running apps

**Performance**:
- Enable caching for GraphQL responses
- Implement rate limiting for exports
- Monitor API usage to stay within Shopify limits

**Security**:
- Keep dependencies updated
- Use HTTPS only
- Validate all user inputs
- Sanitize export data

---

## Troubleshooting

### Common Issues

**"Failed to fetch orders"**:
- Verify app has correct scopes
- Check shop is active
- Re-authenticate by reinstalling app

**Export button disabled**:
- Ensure at least one order exists
- Check filters aren't too restrictive
- Verify totalCount > 0

**Export timeout**:
- Reduce number of orders (use date filters)
- Export in smaller batches
- Consider using CSV instead of Excel

**Missing tracking information**:
- Ensure fulfillments exist for order
- Verify carrier provides tracking data
- Check "Include Fulfillments" is enabled

---

## Support & Resources

**Documentation**:
- [Shopify Admin API](https://shopify.dev/docs/api/admin-graphql)
- [Polaris Components](https://polaris.shopify.com/)
- [Remix Framework](https://remix.run/docs)

**Development**:
- GitHub Repository: [Your Repo URL]
- Issue Tracker: [Your Issues URL]
- Changelog: See `CHANGELOG.md`

**Contact**:
- Developer: Dong
- Email: [Your Email]
