# Deployment Guide for Order Delivery Exporter

This guide covers how to deploy your Shopify app so other merchants can use it.

## Deployment Options

### Option A: Custom/Unlisted App (Quick Start)
Share an install link with specific merchants without App Store review.

### Option B: Public App (Shopify App Store)
List your app for all merchants to discover and install.

---

## Step 1: Set Up Production Hosting

### Recommended: Fly.io (Free Tier Available)

1. **Install Fly CLI**
   ```powershell
   # On Windows PowerShell (as Admin)
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **Sign up and login**
   ```powershell
   fly auth signup
   # or
   fly auth login
   ```

3. **Launch your app**
   ```powershell
   cd order-status
   fly launch
   ```
   - Say "Yes" to copy config
   - Choose a unique app name
   - Select a region close to you
   - Say "Yes" to create a Postgres database

4. **Set environment variables**
   ```powershell
   fly secrets set SHOPIFY_API_KEY=your_api_key
   fly secrets set SHOPIFY_API_SECRET=your_api_secret
   fly secrets set SCOPES=read_orders,read_fulfillments,read_shipping,read_customers
   ```

5. **Deploy**
   ```powershell
   fly deploy
   ```

### Alternative: Railway.app

1. Go to [railway.app](https://railway.app)
2. Connect your GitHub repository
3. Add environment variables
4. Deploy automatically on push

### Alternative: Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel`
3. Add environment variables in Vercel dashboard

---

## Step 2: Update Shopify App Configuration

After hosting is set up, you'll have a production URL (e.g., `https://your-app.fly.dev`).

### Update shopify.app.toml

```toml
application_url = "https://your-app.fly.dev"

[auth]
redirect_urls = [
  "https://your-app.fly.dev/auth/callback",
  "https://your-app.fly.dev/auth/shopify/callback",
  "https://your-app.fly.dev/api/auth/callback"
]
```

### Deploy configuration to Shopify

```powershell
shopify app deploy
```

---

## Step 3: Complete Protected Customer Data Requirements

For your app to access order data on other stores, you must complete the data protection questionnaire.

1. Go to [Shopify Partner Dashboard](https://partners.shopify.com)
2. Select your app → **API access requests**
3. Under **Protected customer data access**:
   - Complete all 16 questions in Step 2
   - Describe your data handling practices
   - Submit for review

---

## Step 4: Get Your Install Link

### For Custom/Unlisted Apps:

1. Go to Partner Dashboard → Your App → **Distribution**
2. Keep **Custom distribution** selected
3. Generate an install link:
   ```
   https://admin.shopify.com/oauth/install?client_id=YOUR_CLIENT_ID
   ```

### Share this link with merchants!

When merchants click the link, they'll:
1. Be prompted to select their store
2. See the permissions your app requests
3. Click "Install" to add your app

---

## Step 5: For Public App Store Listing (Optional)

If you want to list on the Shopify App Store:

1. **Partner Dashboard** → Your App → **Distribution**
2. Select **Public distribution**
3. Click **Create listing**
4. Fill in:
   - App name and description
   - Screenshots (at least 3)
   - App icon (1200x1200 px)
   - Support contact info
   - Privacy policy URL
   - Category selection

5. Submit for review (takes 5-10 business days)

---

## Environment Variables for Production

Set these in your hosting platform:

| Variable | Description |
|----------|-------------|
| `SHOPIFY_API_KEY` | Your app's Client ID |
| `SHOPIFY_API_SECRET` | Your app's Client Secret |
| `SCOPES` | `read_orders,read_fulfillments,read_shipping,read_customers` |
| `DATABASE_URL` | PostgreSQL connection string |
| `NODE_ENV` | `production` |

---

## Database Setup

For production, use PostgreSQL instead of SQLite:

1. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. Run migration:
   ```powershell
   npx prisma migrate deploy
   ```

---

## Checklist Before Going Live

- [ ] App is hosted and accessible
- [ ] Environment variables are set
- [ ] Database is configured (PostgreSQL for production)
- [ ] Protected customer data access is approved
- [ ] App configuration is deployed (`shopify app deploy`)
- [ ] Tested install flow on a test store
- [ ] Tested core functionality (view orders, export)

---

## Getting Help

- [Shopify App Deployment Docs](https://shopify.dev/docs/apps/deployment)
- [Shopify Partners Community](https://community.shopify.com/c/shopify-apps/bd-p/shopify-apps)
