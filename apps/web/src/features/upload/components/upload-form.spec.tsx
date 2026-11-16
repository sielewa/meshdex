import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GatewayEndpointContext } from '@/graphql/gateway-endpoint-context';
import { UploadForm } from '@/features/upload/components/upload-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const renderForm = (): void => {
  render(
    <GatewayEndpointContext value="http://gateway.test/graphql">
      <QueryClientProvider client={new QueryClient()}>
        <UploadForm />
      </QueryClientProvider>
    </GatewayEndpointContext>,
  );
};

describe('UploadForm', () => {
  it('asks for a title and a .glb file before sending anything', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(screen.getByText('Give the model a title')).toBeDefined();
    expect(screen.getByText('Choose a .glb file')).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('rejects files that are not binary glTF', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Chair' } });
    fireEvent.change(screen.getByLabelText('Model (.glb)'), {
      target: { files: [new File(['solid'], 'chair.obj')] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(screen.getByText('Only .glb files (binary glTF) are supported')).toBeDefined();
  });
});
