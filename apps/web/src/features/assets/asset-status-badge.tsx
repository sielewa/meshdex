import type { ReactNode } from 'react';
import type { AssetStatus } from '@/graphql/gql/graphql';

const STYLES: Record<AssetStatus, { label: string; className: string }> = {
  UPLOADING: {
    label: 'Uploading',
    className: 'bg-sky-950 text-sky-300',
  },
  UPLOADED: {
    label: 'Uploaded',
    className: 'bg-neutral-800 text-neutral-300',
  },
  PROCESSING: {
    label: 'Processing',
    className: 'bg-amber-950 text-amber-300',
  },
  READY: {
    label: 'Ready',
    className: 'bg-emerald-950 text-emerald-300',
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-red-950 text-red-300',
  },
};

/** `Record<AssetStatus, …>`: a status added to the schema fails type-checking here until styled. */
export function AssetStatusBadge({ status }: { status: AssetStatus }): ReactNode {
  const { label, className } = STYLES[status];

  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}
