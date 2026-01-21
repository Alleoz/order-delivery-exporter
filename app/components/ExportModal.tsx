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
    totalMatches: number;
    onExport: (options: ExportOptions) => void;
    exporting: boolean;
    exportProgress?: number;
}

export interface ExportOptions {
    format: 'xlsx' | 'csv';
    includeLineItems: boolean;
    includeFulfillments: boolean;
    includeAddresses: boolean;
    exportMode: 'selected' | 'all';
}

export function ExportModal({
    open,
    onClose,
    selectedCount,
    totalMatches,
    onExport,
    exporting,
    exportProgress,
}: ExportModalProps) {
    const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
    const [includeLineItems, setIncludeLineItems] = useState(true);
    const [includeFulfillments, setIncludeFulfillments] = useState(true);
    const [includeAddresses, setIncludeAddresses] = useState(true);
    const [exportMode, setExportMode] = useState<'selected' | 'all'>(selectedCount > 0 ? 'selected' : 'all');

    // Update export mode when modal opens or counts change
    // If no orders selected, force 'all'
    if (selectedCount === 0 && exportMode === 'selected') {
        setExportMode('all');
    }

    const handleExport = useCallback(() => {
        onExport({
            format,
            includeLineItems,
            includeFulfillments,
            includeAddresses,
            exportMode,
        });
    }, [format, includeLineItems, includeFulfillments, includeAddresses, exportMode, onExport]);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Export Orders"
            primaryAction={{
                content: exporting ? 'Exporting...' : 'Export',
                onAction: handleExport,
                loading: exporting,
                disabled: exportMode === 'selected' && selectedCount === 0,
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
                    {/* Scope Selection */}
                    <BlockStack gap="300">
                        <Text variant="headingMd" as="h3">Orders to Export</Text>
                        <BlockStack gap="200">
                            <RadioButton
                                label={`Selected orders (${selectedCount})`}
                                checked={exportMode === 'selected'}
                                id="scope-selected"
                                name="exportScope"
                                onChange={() => setExportMode('selected')}
                                disabled={selectedCount === 0}
                            />
                            <RadioButton
                                label={`All orders matching search (${totalMatches})`}
                                checked={exportMode === 'all'}
                                id="scope-all"
                                name="exportScope"
                                onChange={() => setExportMode('all')}
                            />
                        </BlockStack>
                    </BlockStack>

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
