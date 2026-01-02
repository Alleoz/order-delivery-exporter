/**
 * Order Delivery Exporter - Orders Page
 * Main page for viewing, filtering, and exporting orders
 */

import { useCallback, useState, useEffect } from 'react';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useActionData, useSubmit, useNavigation } from '@remix-run/react';
import {
    Page,
    Layout,
    BlockStack,
    InlineStack,
    Text,
    Button,
    Banner,
    Card,
    Spinner,
    EmptyState,
    Pagination,
    Toast,
    Frame,
    Badge,
} from '@shopify/polaris';
import { ExportIcon, RefreshIcon } from '@shopify/polaris-icons';

import { authenticate } from '~/shopify.server';
import { fetchOrders } from '~/lib/shopify.server';
import { generateExcelFile, getExportFilename, getContentType } from '~/utils/export.server';
import { OrderTable } from '~/components/OrderTable';
import { OrderFiltersComponent } from '~/components/OrderFilters';
import { OrderDetails } from '~/components/OrderDetails';
import { ExportModal, type ExportOptions } from '~/components/ExportModal';
import type { Order, OrderFilters, SortConfig, PageInfo } from '~/lib/types';

// Loader to fetch orders
export async function loader({ request }: LoaderFunctionArgs) {
    await authenticate.admin(request);

    const url = new URL(request.url);
    const query = url.searchParams.get('query') || '';
    const status = url.searchParams.get('status') || 'all';
    const fulfillmentStatus = url.searchParams.get('fulfillmentStatus') || 'all';
    const dateFrom = url.searchParams.get('dateFrom') || '';
    const dateTo = url.searchParams.get('dateTo') || '';
    const after = url.searchParams.get('after') || undefined;
    const sortKey = url.searchParams.get('sortKey') || 'createdAt';
    const sortDir = url.searchParams.get('sortDir') || 'desc';

    try {
        const result = await fetchOrders({
            request,
            first: 50,
            after,
            orderId: query,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            fulfillmentStatus: fulfillmentStatus !== 'all' ? fulfillmentStatus : undefined,
            status: status !== 'all' ? status : undefined,
            sortKey,
            reverse: sortDir === 'desc',
        });

        return json({
            orders: result.orders,
            pageInfo: result.pageInfo,
            totalCount: result.totalCount,
            filters: { query, status, fulfillmentStatus, dateFrom, dateTo },
            sortConfig: { column: sortKey, direction: sortDir },
            lastSynced: new Date().toISOString(),
            error: null,
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        return json({
            orders: [],
            pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
            totalCount: 0,
            filters: { query, status, fulfillmentStatus, dateFrom, dateTo },
            sortConfig: { column: sortKey, direction: sortDir },
            lastSynced: new Date().toISOString(),
            error: 'Failed to fetch orders. Please try again.',
        });
    }
}

// Action for export
export async function action({ request }: ActionFunctionArgs) {
    await authenticate.admin(request);

    const formData = await request.formData();
    const actionType = formData.get('action');

    if (actionType === 'export') {
        const orderIds = JSON.parse(formData.get('orderIds') as string || '[]');
        const format = formData.get('format') as 'xlsx' | 'csv';
        const includeLineItems = formData.get('includeLineItems') === 'true';
        const includeFulfillments = formData.get('includeFulfillments') === 'true';
        const includeAddresses = formData.get('includeAddresses') === 'true';

        try {
            // We need to fetch these orders - for now we'll pass them from client
            const ordersData = JSON.parse(formData.get('ordersData') as string || '[]');

            const buffer = generateExcelFile(ordersData, {
                format,
                includeLineItems,
                includeFulfillments,
                includeAddresses,
            });

            const filename = getExportFilename(format);
            const contentType = getContentType(format);

            // Convert buffer to base64 for client-side download
            const base64Data = Buffer.from(buffer).toString('base64');

            return json({
                success: true,
                data: base64Data,
                filename,
                contentType,
            });
        } catch (error) {
            console.error('Export error:', error);
            return json({ error: 'Failed to export orders', success: false }, { status: 500 });
        }
    }

    return json({ error: 'Invalid action', success: false }, { status: 400 });
}

export default function OrdersPage() {
    const loaderData = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const submit = useSubmit();
    const navigation = useNavigation();

    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [toastError, setToastError] = useState(false);

    const [filters, setFilters] = useState<OrderFilters>({
        query: loaderData.filters.query,
        status: loaderData.filters.status,
        fulfillmentStatus: loaderData.filters.fulfillmentStatus,
        dateFrom: loaderData.filters.dateFrom,
        dateTo: loaderData.filters.dateTo,
    });

    const [sortConfig, setSortConfig] = useState<SortConfig>({
        column: loaderData.sortConfig.column,
        direction: loaderData.sortConfig.direction as 'asc' | 'desc',
    });

    const isLoading = navigation.state === 'loading' || navigation.state === 'submitting';

    // Handle actionData for file download
    useEffect(() => {
        if (actionData && 'success' in actionData && actionData.success && 'data' in actionData) {
            // Create a blob from the base64 data
            const byteCharacters = atob(actionData.data as string);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: actionData.contentType as string });

            // Create download link and click it
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = actionData.filename as string;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            setToastMessage('Export completed successfully!');
            setToastError(false);
        } else if (actionData && 'error' in actionData) {
            setToastMessage(actionData.error as string);
            setToastError(true);
        }
    }, [actionData]);

    // Handle search/filter
    const handleSearch = useCallback(() => {
        const params = new URLSearchParams();
        if (filters.query) params.set('query', filters.query);
        if (filters.status !== 'all') params.set('status', filters.status);
        if (filters.fulfillmentStatus !== 'all') params.set('fulfillmentStatus', filters.fulfillmentStatus);
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
        params.set('sortKey', sortConfig.column);
        params.set('sortDir', sortConfig.direction);

        submit(params, { method: 'get' });
    }, [filters, sortConfig, submit]);

    // Handle filter reset
    const handleResetFilters = useCallback(() => {
        setFilters({
            query: '',
            status: 'all',
            fulfillmentStatus: 'all',
            dateFrom: '',
            dateTo: '',
        });
        submit(new URLSearchParams(), { method: 'get' });
    }, [submit]);

    // Handle sort change
    const handleSortChange = useCallback((config: SortConfig) => {
        setSortConfig(config);
        const params = new URLSearchParams();
        if (filters.query) params.set('query', filters.query);
        if (filters.status !== 'all') params.set('status', filters.status);
        if (filters.fulfillmentStatus !== 'all') params.set('fulfillmentStatus', filters.fulfillmentStatus);
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
        params.set('sortKey', config.column);
        params.set('sortDir', config.direction);
        submit(params, { method: 'get' });
    }, [filters, submit]);

    // Handle pagination
    const handleNextPage = useCallback(() => {
        if (loaderData.pageInfo.endCursor) {
            const params = new URLSearchParams(window.location.search);
            params.set('after', loaderData.pageInfo.endCursor);
            submit(params, { method: 'get' });
        }
    }, [loaderData.pageInfo.endCursor, submit]);

    // Handle view details
    const handleViewDetails = useCallback((order: Order) => {
        setSelectedOrder(order);
        setShowDetailsModal(true);
    }, []);

    // Handle export
    const handleExport = useCallback((options: ExportOptions) => {
        const selectedOrders = loaderData.orders.filter((o) => o && selectedOrderIds.includes(o.id));

        if (selectedOrders.length === 0) {
            setToastMessage('Please select at least one order to export');
            setToastError(true);
            return;
        }

        const formData = new FormData();
        formData.set('action', 'export');
        formData.set('orderIds', JSON.stringify(selectedOrderIds));
        formData.set('ordersData', JSON.stringify(selectedOrders));
        formData.set('format', options.format);
        formData.set('includeLineItems', String(options.includeLineItems));
        formData.set('includeFulfillments', String(options.includeFulfillments));
        formData.set('includeAddresses', String(options.includeAddresses));

        // Use submit from Remix which maintains the authentication context
        submit(formData, { method: 'post' });

        setShowExportModal(false);
        setToastMessage(`Exporting ${selectedOrders.length} order(s)...`);
        setToastError(false);
    }, [selectedOrderIds, loaderData.orders, submit]);

    // Handle select all
    const handleSelectAll = useCallback(() => {
        if (selectedOrderIds.length === loaderData.orders.length) {
            setSelectedOrderIds([]);
        } else {
            setSelectedOrderIds(loaderData.orders.filter((o) => o !== null).map((o) => o!.id));
        }
    }, [selectedOrderIds.length, loaderData.orders]);

    // Format last synced time
    const formatLastSynced = (isoString: string) => {
        return new Date(isoString).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <Frame>
            <Page
                title="Order Delivery Exporter"
                subtitle="View and export order delivery data"
                primaryAction={{
                    content: 'Export Selected',
                    icon: ExportIcon,
                    disabled: selectedOrderIds.length === 0,
                    onAction: () => setShowExportModal(true),
                }}
                secondaryActions={[
                    {
                        content: 'Refresh',
                        icon: RefreshIcon,
                        onAction: handleSearch,
                        loading: isLoading,
                    },
                ]}
            >
                <BlockStack gap="500">
                    {/* Error Banner */}
                    {loaderData.error && (
                        <Banner tone="critical" onDismiss={() => { }}>
                            <p>{loaderData.error}</p>
                        </Banner>
                    )}

                    {/* Stats Bar */}
                    <Card>
                        <InlineStack gap="400" align="space-between" blockAlign="center">
                            <InlineStack gap="400">
                                <BlockStack gap="100">
                                    <Text variant="bodySm" tone="subdued" as="p">Total Orders</Text>
                                    <Text variant="headingLg" as="p">{loaderData.totalCount.toLocaleString()}</Text>
                                </BlockStack>

                                <BlockStack gap="100">
                                    <Text variant="bodySm" tone="subdued" as="p">Selected</Text>
                                    <Text variant="headingLg" as="p">{selectedOrderIds.length}</Text>
                                </BlockStack>
                            </InlineStack>

                            <InlineStack gap="200" blockAlign="center">
                                <Text variant="bodySm" tone="subdued" as="span">
                                    Last synced: {formatLastSynced(loaderData.lastSynced)}
                                </Text>
                                <Badge tone="success">Live</Badge>
                            </InlineStack>
                        </InlineStack>
                    </Card>

                    {/* Filters */}
                    <OrderFiltersComponent
                        filters={filters}
                        onFiltersChange={setFilters}
                        onSearch={handleSearch}
                        onReset={handleResetFilters}
                        loading={isLoading}
                    />

                    {/* Selection Actions */}
                    {selectedOrderIds.length > 0 && (
                        <Card>
                            <InlineStack gap="300" align="space-between" blockAlign="center">
                                <InlineStack gap="300">
                                    <Text variant="bodyMd" as="span">
                                        {selectedOrderIds.length} order{selectedOrderIds.length !== 1 ? 's' : ''} selected
                                    </Text>
                                    <Button variant="plain" onClick={() => setSelectedOrderIds([])}>
                                        Clear selection
                                    </Button>
                                </InlineStack>

                                <InlineStack gap="300">
                                    <Button onClick={handleSelectAll}>
                                        {selectedOrderIds.length === loaderData.orders.length ? 'Deselect All' : 'Select All'}
                                    </Button>
                                    <Button variant="primary" onClick={() => setShowExportModal(true)}>
                                        Export Selected
                                    </Button>
                                </InlineStack>
                            </InlineStack>
                        </Card>
                    )}

                    {/* Loading State */}
                    {isLoading && (
                        <Card>
                            <InlineStack align="center" blockAlign="center" gap="300">
                                <Spinner size="small" />
                                <Text variant="bodyMd" as="p">Loading orders...</Text>
                            </InlineStack>
                        </Card>
                    )}

                    {/* Orders Table */}
                    {!isLoading && loaderData.orders.length > 0 && (
                        <OrderTable
                            orders={loaderData.orders as Order[]}
                            selectedOrderIds={selectedOrderIds}
                            onSelectionChange={setSelectedOrderIds}
                            onViewDetails={handleViewDetails}
                            sortConfig={sortConfig}
                            onSortChange={handleSortChange}
                        />
                    )}

                    {/* Empty State */}
                    {!isLoading && loaderData.orders.length === 0 && (
                        <Card>
                            <EmptyState
                                heading="No orders found"
                                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                            >
                                <p>Try adjusting your filters or check back later for new orders.</p>
                            </EmptyState>
                        </Card>
                    )}

                    {/* Pagination */}
                    {(loaderData.pageInfo.hasNextPage || loaderData.pageInfo.hasPreviousPage) && (
                        <InlineStack align="center">
                            <Pagination
                                hasPrevious={loaderData.pageInfo.hasPreviousPage}
                                hasNext={loaderData.pageInfo.hasNextPage}
                                onNext={handleNextPage}
                                onPrevious={() => {
                                    const params = new URLSearchParams(window.location.search);
                                    params.delete('after');
                                    params.delete('before');
                                    submit(params, { method: 'get' });
                                }}
                            />
                        </InlineStack>
                    )}
                </BlockStack>

                {/* Order Details Modal */}
                <OrderDetails
                    order={selectedOrder}
                    open={showDetailsModal}
                    onClose={() => setShowDetailsModal(false)}
                />

                {/* Export Modal */}
                <ExportModal
                    open={showExportModal}
                    onClose={() => setShowExportModal(false)}
                    selectedCount={selectedOrderIds.length}
                    onExport={handleExport}
                    exporting={false}
                />

                {/* Toast */}
                {toastMessage && (
                    <Toast
                        content={toastMessage}
                        error={toastError}
                        onDismiss={() => setToastMessage(null)}
                        duration={3000}
                    />
                )}
            </Page>
        </Frame>
    );
}
