# Order Delivery Exporter - Shopify App

A Shopify embedded app built with Remix that allows merchants to view, filter, and export order delivery data to Excel or CSV.

## Features

### 1. Shopify Order Fetching
- Connect to Shopify Admin API (GraphQL, latest stable version)
- Fetch comprehensive order details including:
  - Order ID and name
  - Financial status (paid, pending, refunded, etc.)
  - Fulfillment status (fulfilled, unfulfilled, partial, etc.)
  - Delivery status (in transit, delivered, attempted, etc.)
  - Delivery details (address, estimated date, carrier, tracking numbers)
  - Courier tracking links
  - Line items with product details
  - Customer information
  - Timestamps (created, updated, fulfilled)

### 2. Order Display
- Clean, sortable table view with Polaris DataTable
- Status badges for financial, fulfillment, and delivery status
- Direct tracking links to carrier websites
- Click to view full order details in a modal
- Pagination for large order lists

### 3. Filtering
- Search by order ID, customer name, or email
- Filter by order status (open, closed, cancelled)
- Filter by fulfillment status
- Date range filters
- Real-time filter application

### 4. Export to Excel/CSV
- Select individual orders or "Select All"
- Export to Excel (.xlsx) or CSV format
- Configurable export options:
  - Include line items (one row per item)
  - Include fulfillment & tracking data
  - Include shipping/billing addresses
- Automatic file download

## Project Structure

```
order-status/
├── app/
│   ├── components/
│   │   ├── index.ts              # Component exports
│   │   ├── OrderTable.tsx        # Main orders table with selection
│   │   ├── OrderFilters.tsx      # Filter controls
│   │   ├── OrderDetails.tsx      # Order details modal
│   │   └── ExportModal.tsx       # Export configuration modal
│   ├── lib/
│   │   ├── types.ts              # TypeScript type definitions
│   │   ├── queries.ts            # GraphQL queries
│   │   └── shopify.server.ts     # Shopify API service
│   ├── routes/
│   │   ├── app._index.tsx        # Dashboard home page
│   │   ├── app.orders.tsx        # Orders page with filters/export
│   │   └── app.tsx               # App layout with navigation
│   ├── utils/
│   │   └── export.server.ts      # Excel/CSV export utilities
│   └── shopify.server.ts         # Shopify authentication setup
├── prisma/
│   └── schema.prisma             # Database schema for sessions
├── shopify.app.toml              # Shopify app configuration
└── package.json
```

## Environment Variables

Create a `.env` file with the following variables (automatically managed by Shopify CLI):

```bash
# Shopify App Credentials (auto-populated by Shopify CLI)
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret

# App URL (set during development)
SHOPIFY_APP_URL=https://your-tunnel-url.ngrok.io

# Scopes
SCOPES=read_orders,read_fulfillments,read_shipping

# Database
DATABASE_URL="file:./dev.db"
```

## Required Scopes

The app requires the following OAuth scopes:

- `read_orders` - Read order data
- `read_fulfillments` - Read fulfillment and tracking information
- `read_shipping` - Read shipping information

## Installation & Development

### Prerequisites
- Node.js 18.20+ or 20.10+
- npm or yarn
- Shopify Partner account
- Development store

### Setup

1. **Install dependencies:**
   ```bash
   cd order-status
   npm install
   ```

2. **Set up the database:**
   ```bash
   npm run setup
   ```

3. **Start development:**
   ```bash
   npm run dev
   ```

4. **Follow the Shopify CLI prompts to:**
   - Connect to your Partner account
   - Select/create an app
   - Connect to a development store

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with Shopify CLI |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run setup` | Generate Prisma client and run migrations |
| `npm run lint` | Run ESLint |
| `npm run deploy` | Deploy app to Shopify |

## Usage

### Viewing Orders

1. Navigate to the "Orders" tab in the app
2. Orders are displayed in a sortable table
3. Click on any order to view full details
4. Use the filters to narrow down orders

### Exporting Orders

1. Select orders by clicking the checkboxes
2. Click "Export Selected" button
3. Choose export format (Excel or CSV)
4. Configure what data to include:
   - Line items (creates one row per product)
   - Fulfillment & tracking data
   - Shipping/billing addresses
5. Click Export to download the file

### Filtering Orders

- **Search**: Type order number, customer name, or email
- **Order Status**: Filter by open, closed, or cancelled
- **Fulfillment Status**: Filter by fulfilled, unfulfilled, partial
- **Date Range**: Select start and end dates
- Click "Apply Filters" to update results

## Technology Stack

- **Framework**: [Remix](https://remix.run/)
- **UI Components**: [Shopify Polaris](https://polaris.shopify.com/)
- **API**: [Shopify Admin GraphQL API](https://shopify.dev/docs/api/admin-graphql)
- **Authentication**: [@shopify/shopify-app-remix](https://www.npmjs.com/package/@shopify/shopify-app-remix)
- **Database**: SQLite with [Prisma](https://www.prisma.io/)
- **Excel Export**: [xlsx](https://sheetjs.com/)

## API Reference

### GraphQL Queries

The app uses the following main GraphQL queries:

- `GetOrders` - Fetch orders with filtering and pagination
- `GetOrderById` - Fetch a single order by ID

See `app/lib/queries.ts` for full query definitions.

### Data Types

See `app/lib/types.ts` for TypeScript type definitions including:

- `Order` - Complete order data structure
- `LineItem` - Order line item
- `Fulfillment` - Fulfillment with tracking
- `Customer` - Customer information
- `Address` - Shipping/billing address

## Troubleshooting

### Common Issues

1. **"Failed to fetch orders"**
   - Ensure the app has `read_orders` scope
   - Re-authenticate by reinstalling the app

2. **Export not working**
   - Check browser allows downloads
   - Ensure orders are selected

3. **OAuth errors**
   - Run `npm run dev` with fresh session
   - Clear app data in development store

### Logs

Check server logs for detailed error information:
```bash
npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting: `npm run lint`
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
