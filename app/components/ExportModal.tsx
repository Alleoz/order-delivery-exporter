/**
 * Order Delivery Exporter - Export Modal Component
 * Modal for configuring and triggering order exports
 */

import { useState, useCallback } from 'react';
import {
    Modal,
    BlockStack,
    InlineStack,
    Text,
    Checkbox,
    RadioButton,
    Button,
    Banner,
    ProgressBar,
} from '@shopify/polaris';

interface ExportModalProps {
    open: boolean;
    onClose: () => void;
    selectedCount: number;
    onExport: (options: ExportOptions) => void;
    exporting: boolean;
    exportProgress?: number;
}

export interface ExportOptions {
    format: 'xlsx' | 'csv';
    includeLineItems: boolean;
    includeFulfillments: boolean;
    includeAddresses: boolean;
}

export function ExportModal({
    open,
    onClose,
    selectedCount,
    onExport,
    exporting,
    exportProgress,
}: ExportModalProps) {
    const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
    const [includeLineItems, setIncludeLineItems] = useState(true);
    const [includeFulfillments, setIncludeFulfillments] = useState(true);
    const [includeAddresses, setIncludeAddresses] = useState(true);

    const handleExport = useCallback(() => {
        onExport({
            format,
            includeLineItems,
            includeFulfillments,
            includeAddresses,
        });
    }, [format, includeLineItems, includeFulfillments, includeAddresses, onExport]);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Export Orders"
            primaryAction={{
                content: exporting ? 'Exporting...' : 'Export',
                onAction: handleExport,
                loading: exporting,
                disabled: selectedCount === 0,
            }}
            secondaryActions={[
                {
                    content: 'Cancel',
                    onAction: onClose,
                    disabled: exporting,
                },
            ]}
        >
            <Modal.Section>
                <BlockStack gap="500">
                    {selectedCount === 0 ? (
                        <Banner tone="warning">
                            <p>No orders selected. Please select at least one order to export.</p>
                        </Banner>
                    ) : (
                        <Banner tone="info">
                            <p>{selectedCount} order{selectedCount !== 1 ? 's' : ''} will be exported.</p>
                        </Banner>
                    )}

                    {/* Format Selection */}
                    <BlockStack gap="300">
                        <Text variant="headingMd" as="h3">Export Format</Text>
                        <InlineStack gap="400">
                            <RadioButton
                                label="Excel (.xlsx)"
                                helpText="Best for data analysis and manipulation"
                                checked={format === 'xlsx'}
                                id="format-xlsx"
                                name="format"
                                onChange={() => setFormat('xlsx')}
                            />
                            <RadioButton
                                label="CSV (.csv)"
                                helpText="Universal format, works with any spreadsheet app"
                                checked={format === 'csv'}
                                id="format-csv"
                                name="format"
                                onChange={() => setFormat('csv')}
                            />
                        </InlineStack>
                    </BlockStack>

                    {/* Include Options */}
                    <BlockStack gap="300">
                        <Text variant="headingMd" as="h3">Include Data</Text>
                        <BlockStack gap="200">
                            <Checkbox
                                label="Line Items"
                                helpText="Include individual product details (creates one row per item)"
                                checked={includeLineItems}
                                onChange={setIncludeLineItems}
                            />
                            <Checkbox
                                label="Fulfillment & Tracking"
                                helpText="Include carrier, tracking numbers, and delivery status"
                                checked={includeFulfillments}
                                onChange={setIncludeFulfillments}
                            />
                            <Checkbox
                                label="Addresses"
                                helpText="Include shipping and billing addresses"
                                checked={includeAddresses}
                                onChange={setIncludeAddresses}
                            />
                        </BlockStack>
                    </BlockStack>

                    {/* Progress */}
                    {exporting && exportProgress !== undefined && (
                        <BlockStack gap="200">
                            <Text variant="bodyMd" as="p">Preparing export...</Text>
                            <ProgressBar progress={exportProgress} size="small" />
                        </BlockStack>
                    )}
                </BlockStack>
            </Modal.Section>
        </Modal>
    );
}
