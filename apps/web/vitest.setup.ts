import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library unmounts rendered trees automatically only when Vitest globals are on;
// without this, a previous test's DOM would leak into the next one.
afterEach(() => {
  cleanup();
});
