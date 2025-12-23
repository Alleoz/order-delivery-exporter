# Railway Environment Variables Update Guide

## ⚠️ IMPORTANT: Your app is using the wrong API credentials!

Your Railway deployment is currently configured for "OrderStatus" app, but you need it configured for "Order Data Export" app.

## 🔧 Steps to Fix:

### 1. Get the Correct API Secret from Shopify Partner Dashboard

1. Go to: https://partners.shopify.com/
2. Navigate to: **Apps** → **Order Data Export**
3. Click on: **App setup** or **Configuration**
4. Find: **API credentials** section
5. Copy the **Client secret** value

### 2. Update Railway Environment Variables

1. Go to: https://railway.app
2. Open project: **innovative-enjoyment-production**
3. Click on your service/deployment
4. Click on: **Variables** tab
5. Update these variables:

#### Required Changes:

| Variable | OLD Value (Wrong) | NEW Value (Correct) |
|----------|-------------------|---------------------|
| `SHOPIFY_API_KEY` | `8370fd2d95b42d3399d48d42f82c428a` | `8370fd2d95b42d3399d40d42f02c428a` |
| `SHOPIFY_API_SECRET` | [old secret] | [get from Step 1 above] |

#### Keep These As-Is:

| Variable | Value |
|----------|-------|
| `SHOPIFY_APP_URL` | `https://innovative-enjoyment-production.up.railway.app` |
| `SCOPES` | `read_customers,read_fulfillments,read_orders,read_shipping` |
| `DATABASE_URL` | [leave as configured by Railway] |

### 3. After Updating

1. Railway will automatically redeploy with the new variables
2. Wait 2-5 minutes for deployment to complete
3. Share this installation link with your client:

```
https://admin.shopify.com/oauth/install?client_id=8370fd2d95b42d3399d40d42f02c428a
```

## ✅ Verification

After your client installs the app:
- The app should load without a blank white screen
- They should see the Order Delivery Exporter dashboard
- They can view and export orders

## 🆘 If Issues Persist

1. Check Railway deployment logs for errors
2. Verify the URLs in Shopify Partner Dashboard match:
   - App URL: `https://innovative-enjoyment-production.up.railway.app`
   - Redirect URL: `https://innovative-enjoyment-production.up.railway.app/auth/callback`
3. Ensure the app distribution is set to "Custom" or "Public" in Partner Dashboard
