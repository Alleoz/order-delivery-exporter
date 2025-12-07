/**
 * Order Delivery Exporter - Order Filters Component
 * Provides filtering controls for orders
 */

import { useCallback } from 'react';
import {
    Card,
    InlineStack,
    TextField,
    Select,
    Button,
    DatePicker,
    Popover,
    BlockStack,
    Text,
    Icon,
    Box,
} from '@shopify/polaris';
import { CalendarIcon, SearchIcon } from '@shopify/polaris-icons';
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
    const handleQueryChange = useCallback((value: string) => {
        onFiltersChange({ ...filters, query: value });
    }, [filters, onFiltersChange]);

    const handleStatusChange = useCallback((value: string) => {
        onFiltersChange({ ...filters, status: value });
    }, [filters, onFiltersChange]);

    const handleFulfillmentStatusChange = useCallback((value: string) => {
        onFiltersChange({ ...filters, fulfillmentStatus: value });
    }, [filters, onFiltersChange]);

    const handleDateFromChange = useCallback((value: string) => {
        onFiltersChange({ ...filters, dateFrom: value });
    }, [filters, onFiltersChange]);

    const handleDateToChange = useCallback((value: string) => {
        onFiltersChange({ ...filters, dateTo: value });
    }, [filters, onFiltersChange]);

    const handleKeyPress = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            onSearch();
        }
    }, [onSearch]);

    const statusOptions = [
        { label: 'All Orders', value: 'all' },
        { label: 'Open', value: 'open' },
        { label: 'Closed', value: 'closed' },
        { label: 'Cancelled', value: 'cancelled' },
    ];

    const fulfillmentOptions = [
        { label: 'All Fulfillment', value: 'all' },
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
                        <Select
                            label="Order Status"
                            options={statusOptions}
                            value={filters.status}
                            onChange={handleStatusChange}
                        />
                    </Box>

                    <Box minWidth="180px">
                        <Select
                            label="Fulfillment Status"
                            options={fulfillmentOptions}
                            value={filters.fulfillmentStatus}
                            onChange={handleFulfillmentStatusChange}
                        />
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
