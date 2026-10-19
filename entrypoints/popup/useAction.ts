import { useState } from 'preact/hooks';
import { RemoteError } from '@/lib/messages';

/** Runs an async action with busy and error state for a form. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof RemoteError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, setError, run };
}
