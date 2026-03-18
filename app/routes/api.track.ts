/**
 * API Route: Track Package
 * Server-side endpoint for fetching external tracking details.
 * Called by the frontend when Shopify's native tracking data is insufficient.
 */

import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { fetchExternalTracking } from '~/utils/tracking-fetcher.server';

export async function action({ request }: ActionFunctionArgs) {
    // Authenticate - ensure only legitimate app users can call this
    await authenticate.admin(request);

    const formData = await request.formData();
    const trackingNumber = formData.get('trackingNumber') as string;
    const carrier = formData.get('carrier') as string | null;
    const trackingUrl = formData.get('trackingUrl') as string | null;

    if (!trackingNumber) {
        return json({ error: 'Tracking number is required' }, { status: 400 });
    }

    try {
        const result = await fetchExternalTracking(trackingNumber, carrier, trackingUrl);
        return json({ success: true, tracking: result });
    } catch (error: any) {
        console.error('[api.track] Error fetching tracking:', error.message);
        return json(
            { error: 'Failed to fetch tracking details', success: false },
            { status: 500 }
        );
    }
}
