import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { UploadForm } from '@/features/upload/components/upload-form';

export const metadata: Metadata = { title: 'Upload · Meshdex' };

export default function UploadPage(): ReactNode {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Upload a model</h1>
      <UploadForm />
    </div>
  );
}
