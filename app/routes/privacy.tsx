import { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const privacyPolicy = `
# Privacy Policy for Order Delivery Exporter

**Last Updated: December 7, 2025**

## Introduction
This Privacy Policy describes how Order Delivery Exporter ("we", "our", or "the App") collects, uses, and protects information when you use our Shopify application.

## Information We Collect

### Data from Shopify
When you install our App, we access the following data from your Shopify store:
- Order Information: Order numbers, dates, status, totals
- Customer Information: Names, email addresses, phone numbers (for export purposes only)
- Shipping Information: Shipping and billing addresses
- Fulfillment Information: Fulfillment status, tracking numbers, delivery dates
- Line Items: Product names, SKUs, quantities, prices

### Session Data
We store minimal session data to maintain your authentication with Shopify.

## How We Use Your Data
We use the collected data solely for order export functionality. We do NOT sell your data to third parties or use it for marketing purposes.

## Data Storage and Security
- All data transmission uses HTTPS/SSL encryption
- Database connections are encrypted
- Access tokens are stored securely

## Contact Us
Email: jhurelsulit@gmail.com
Website: https://innovative-enjoyment-production.up.railway.app

For full privacy policy, visit: https://github.com/Alleoz/order-delivery-exporter/blob/main/PRIVACY_POLICY.md
`;

    return new Response(privacyPolicy, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
        },
    });
};
