import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AssetPageQuery } from '@/graphql/gql/graphql';
import { AssetDetails } from './asset-details';

type AssetDetail = NonNullable<AssetPageQuery['asset']>;

const asset = (overrides: Partial<AssetDetail['currentVersion']>): AssetDetail => ({
  id: '019a7a5e-8b1c-7c3d-9e4f-000000000001',
  title: 'Wooden chair',
  tags: ['chair', 'wood'],
  status: 'READY',
  createdAt: '2026-11-12T09:00:00.000Z',
  updatedAt: '2026-11-12T09:05:00.000Z',
  currentVersion: {
    id: '019a7a5e-8b1c-7c3d-9e4f-0000000000a1',
    number: 2,
    status: 'READY',
    failureReason: null,
    createdAt: '2026-11-12T09:00:00.000Z',
    processedAt: '2026-11-12T09:05:00.000Z',
    original: {
      sizeBytes: 20_971_520,
      contentType: 'model/gltf-binary',
    },
    originalDownloadUrl: null,
    stats: {
      triangleCount: 12_345,
      vertexCount: 6_789,
      meshCount: 3,
      textureCount: 2,
    },
    ...overrides,
  },
});

describe('AssetDetails', () => {
  it('shows the file, version and model statistics', () => {
    render(<AssetDetails asset={asset({})} />);

    expect(screen.getByRole('heading', { name: 'Wooden chair' })).toBeDefined();
    expect(screen.getByText('v2')).toBeDefined();
    expect(screen.getByText('21.0 MB · model/gltf-binary')).toBeDefined();
    expect(screen.getByText('12,345')).toBeDefined();
    expect(screen.getByText('3 / 2')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains a failed processing and omits statistics that do not exist yet', () => {
    render(
      <AssetDetails
        asset={asset({
          status: 'FAILED',
          failureReason: 'Not a valid glTF binary',
          stats: null,
        })}
      />,
    );

    expect(screen.getByRole('alert').textContent).toBe(
      'Processing failed: Not a valid glTF binary',
    );
    expect(screen.queryByText('Triangles')).toBeNull();
  });
});
