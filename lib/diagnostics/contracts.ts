export const DIAGNOSTIC_MIGRATIONS = [
  { version: '20261010110000', name: 'remote_public_schema_baseline' },
  { version: '20261010111000', name: 'restore_payment_voucher_rpc' },
  { version: '20261010112000', name: 'restore_receipt_voucher_rpc' },
  { version: '20261010120000', name: 'rpc_sync_operation_idempotency' },
] as const;

export const SYNC_IDEMPOTENT_RPCS = [
  'rpc_close_pos_shift',
  'rpc_process_receipt_voucher',
  'rpc_process_payment_voucher',
  'rpc_process_stock_transfer',
  'rpc_process_inventory_adjustment',
  'rpc_settle_fleet_trip',
  'rpc_process_sales_invoice',
  'rpc_process_purchase_invoice',
  'rpc_close_financial_period',
] as const;
