/**
 * Order Delivery Exporter - Order Filters Component
 * Provides filtering controls for orders
 */

import { useCallback, useState } from 'react';
import {
    Card,
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

    const hasActiveFilters =
        filters.query !== '' ||
        filters.status !== 'all' ||
        filters.fulfillmentStatus !== 'all' ||
        filters.dateFrom !== '' ||
        filters.dateTo !== '';

    const toggleStatusPopover = useCallback(() => setStatusPopoverActive((active) => !active), []);
    const toggleFulfillmentPopover = useCallback(() => setFulfillmentPopoverActive((active) => !active), []);

    return (
        <Card>
            <BlockStack gap="400">
                <InlineStack gap="400" wrap align="start" blockAlign="end">
                    <Box minWidth="200px">
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
                    </Box>

                    <Box minWidth="160px">
                        <Popover
                            active={statusPopoverActive}
                            activator={
                                <Button onClick={toggleStatusPopover} disclosure>
                                    Order Status {filters.status !== 'all' ? `(${filters.status.split(',').length})` : ''}
                                </Button>
                            }
                            onClose={toggleStatusPopover}
                        >
                            <Box padding="400">
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

                    <Box minWidth="180px">
                        <Popover
                            active={fulfillmentPopoverActive}
                            activator={
                                <Button onClick={toggleFulfillmentPopover} disclosure>
                                    Fulfillment {filters.fulfillmentStatus !== 'all' ? `(${filters.fulfillmentStatus.split(',').length})` : ''}
                                </Button>
                            }
                            onClose={toggleFulfillmentPopover}
                        >
                            <Box padding="400">
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
                        <TextField
                            label="Date From"
                            type="date"
                            value={filters.dateFrom}
                            onChange={handleDateFromChange}
                            autoComplete="off"
                        />
                    </Box>

                    <Box minWidth="150px">
                        <TextField
                            label="Date To"
                            type="date"
                            value={filters.dateTo}
                            onChange={handleDateToChange}
                            autoComplete="off"
                        />
                    </Box>
                </InlineStack>

                <InlineStack gap="300">
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
                            Reset Filters
                        </Button>
                    )}
                </InlineStack>
            </BlockStack>
        </Card>
    );
}
