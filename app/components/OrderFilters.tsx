/**
 * Order Delivery Exporter - Order Filters Component
 * Provides filtering controls for orders
 */

import { useCallback, useState } from 'react';
import {
    InlineStack,
    TextField,
    Button,
    Popover,
    BlockStack,
    Icon,
    Box,
    ChoiceList,
} from '@shopify/polaris';
import { SearchIcon } from '@shopify/polaris-icons';
import type { OrderFilters } from '~/lib/types';

interface OrderFiltersProps {
    filters: OrderFilters;
    onFiltersChange: (filters: OrderFilters) => void;
    onSearch: () => void;
    onReset: () => void;
    loading?: boolean;
}

export function OrderFiltersComponent({
    filters,
    onFiltersChange,
    onSearch,
    onReset,
    loading = false,
}: OrderFiltersProps) {
    const [statusPopoverActive, setStatusPopoverActive] = useState(false);
    const [fulfillmentPopoverActive, setFulfillmentPopoverActive] = useState(false);

    const handleQueryChange = useCallback((value: string) => {
        onFiltersChange({ ...filters, query: value });
    }, [filters, onFiltersChange]);

    const handleStatusChange = useCallback((value: string[]) => {
        onFiltersChange({ ...filters, status: value.length > 0 ? value.join(',') : 'all' });
    }, [filters, onFiltersChange]);

    const handleFulfillmentStatusChange = useCallback((value: string[]) => {
        onFiltersChange({ ...filters, fulfillmentStatus: value.length > 0 ? value.join(',') : 'all' });
    }, [filters, onFiltersChange]);

    const handleDeliveryStatusChange = useCallback((value: string[]) => {
        onFiltersChange({ ...filters, deliveryStatus: value.length > 0 ? value.join(',') : 'all' });
    }, [filters, onFiltersChange]);

    const handleDateFromChange = useCallback((value: string) => {
        onFiltersChange({ ...filters, dateFrom: value });
    }, [filters, onFiltersChange]);

    const handleDateToChange = useCallback((value: string) => {
        onFiltersChange({ ...filters, dateTo: value });
    }, [filters, onFiltersChange]);

    const statusOptions = [
        { label: 'Open', value: 'open' },
        { label: 'Closed', value: 'closed' },
        { label: 'Cancelled', value: 'cancelled' },
    ];

    const fulfillmentOptions = [
        { label: 'Fulfilled', value: 'fulfilled' },
        { label: 'Unfulfilled', value: 'unfulfilled' },
        { label: 'Partially Fulfilled', value: 'partial' },
        { label: 'Scheduled', value: 'scheduled' },
        { label: 'On Hold', value: 'on_hold' },
    ];

    const deliveryOptions = [
        { label: 'Scheduled', value: 'scheduled' },
        { label: 'In Transit', value: 'in_transit' },
        { label: 'Out for Delivery', value: 'out_for_delivery' },
        { label: 'Delivered', value: 'delivered' },
        { label: 'Delivery Failed', value: 'failure' },
        { label: 'Attempted Delivery', value: 'attempted_delivery' },
        { label: 'Ready for Pickup', value: 'ready_for_pickup' },
        { label: 'Picked Up', value: 'picked_up' },
        { label: 'Label Printed', value: 'label_printed' },
        { label: 'Label Purchased', value: 'label_purchased' },
    ];

    const hasActiveFilters =
        filters.query !== '' ||
        filters.status !== 'all' ||
        filters.fulfillmentStatus !== 'all' ||
        filters.deliveryStatus !== 'all' ||
        filters.dateFrom !== '' ||
        filters.dateTo !== '';

    const toggleStatusPopover = useCallback(() => setStatusPopoverActive((active) => !active), []);
    const toggleFulfillmentPopover = useCallback(() => setFulfillmentPopoverActive((active) => !active), []);
    const [deliveryPopoverActive, setDeliveryPopoverActive] = useState(false);
    const toggleDeliveryPopover = useCallback(() => setDeliveryPopoverActive((active) => !active), []);

    return (
        <BlockStack gap="400">
            <InlineStack gap="400" align="start" blockAlign="end">
                <div style={{ flex: '1 1 300px' }}>
                    <TextField
                        label="Search"
                        placeholder="Order #, customer name, email..."
                        value={filters.query}
                        onChange={handleQueryChange}
                        prefix={<Icon source={SearchIcon} />}
                        autoComplete="off"
                        clearButton
                        onClearButtonClick={() => handleQueryChange('')}
                    />
                </div>

                <Box minWidth="150px">
                    <Popover
                        active={statusPopoverActive}
                        activator={
                            <Button onClick={toggleStatusPopover} disclosure>
                                Order Status {filters.status !== 'all' ? `(${filters.status.split(',').length})` : ''}
                            </Button>
                        }
                        onClose={toggleStatusPopover}
                        fullWidth
                    >
                        <Box minWidth="320px" padding="400">
                            <ChoiceList
                                title="Order Status"
                                titleHidden
                                choices={statusOptions}
                                selected={filters.status === 'all' ? [] : filters.status.split(',')}
                                onChange={handleStatusChange}
                                allowMultiple
                            />
                        </Box>
                    </Popover>
                </Box>

                <Box minWidth="150px">
                    <Popover
                        active={fulfillmentPopoverActive}
                        activator={
                            <Button onClick={toggleFulfillmentPopover} disclosure>
                                Fulfillment {filters.fulfillmentStatus !== 'all' ? `(${filters.fulfillmentStatus.split(',').length})` : ''}
                            </Button>
                        }
                        onClose={toggleFulfillmentPopover}
                        fullWidth
                    >
                        <Box minWidth="320px" padding="400">
                            <ChoiceList
                                title="Fulfillment"
                                titleHidden
                                choices={fulfillmentOptions}
                                selected={filters.fulfillmentStatus === 'all' ? [] : filters.fulfillmentStatus.split(',')}
                                onChange={handleFulfillmentStatusChange}
                                allowMultiple
                            />
                        </Box>
                    </Popover>
                </Box>

                <Box minWidth="150px">
                    <Popover
                        active={deliveryPopoverActive}
                        activator={
                            <Button onClick={toggleDeliveryPopover} disclosure>
                                Delivery {filters.deliveryStatus !== 'all' ? `(${filters.deliveryStatus.split(',').length})` : ''}
                            </Button>
                        }
                        onClose={toggleDeliveryPopover}
                        fullWidth
                    >
                        <Box minWidth="320px" padding="400">
                            <ChoiceList
                                title="Delivery Status"
                                titleHidden
                                choices={deliveryOptions}
                                selected={filters.deliveryStatus === 'all' ? [] : filters.deliveryStatus.split(',')}
                                onChange={handleDeliveryStatusChange}
                                allowMultiple
                            />
                        </Box>
                    </Popover>
                </Box>
            </InlineStack>

            <InlineStack gap="400" align="start" blockAlign="end">
                <div style={{ flex: '1 1 150px' }}>
                    <TextField
                        label="Date From"
                        type="date"
                        value={filters.dateFrom}
                        onChange={handleDateFromChange}
                        autoComplete="off"
                    />
                </div>

                <div style={{ flex: '1 1 150px' }}>
                    <TextField
                        label="Date To"
                        type="date"
                        value={filters.dateTo}
                        onChange={handleDateToChange}
                        autoComplete="off"
                    />
                </div>

                <InlineStack gap="200" align="end">
                    <Button
                        variant="primary"
                        onClick={onSearch}
                        loading={loading}
                    >
                        Apply Filters
                    </Button>

                    {hasActiveFilters && (
                        <Button
                            variant="plain"
                            onClick={onReset}
                            disabled={loading}
                        >
                            Reset
                        </Button>
                    )}
                </InlineStack>
            </InlineStack>
        </BlockStack>
    );
}
