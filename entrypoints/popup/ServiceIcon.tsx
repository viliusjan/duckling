import { useEffect, useState } from 'preact/hooks';
import type { Code } from '@/lib/otp/code';
import { iconFor, type IconIndex } from '@/lib/ui/icons';

let indexPromise: Promise<IconIndex> | undefined;

/** The icon index ships inside the extension (public/icons/index.json); no network. */
export const loadIconIndex = (): Promise<IconIndex> =>
  (indexPromise ??= fetch('/icons/index.json')
    .then((r) => r.json() as Promise<IconIndex>)
    .catch(() => ({})));

export function useIconIndex(): IconIndex | undefined {
  const [index, setIndex] = useState<IconIndex>();
  useEffect(() => void loadIconIndex().then(setIndex), []);
  return index;
}

export function ServiceIcon({ code, index, dark }: { code: Code; index: IconIndex | undefined; dark: boolean }) {
  if (!index) return <span class="svc" aria-hidden="true" />;
  const icon = iconFor(code, index, dark);
  // Same origin as the popup (moz-extension://<id>/), so a plain path works.
  const url = (path: string) => `/icons/${path}`;
  switch (icon.kind) {
    case 'mono':
      return (
        <span class="svc" aria-hidden="true">
          <span
            class="mono"
            style={{ backgroundColor: icon.color, maskImage: `url("${url(icon.path)}")` }}
          />
        </span>
      );
    case 'image':
      return (
        <span class="svc" aria-hidden="true">
          <img src={url(icon.path)} alt="" loading="lazy" decoding="async" />
        </span>
      );
    case 'letter':
      return (
        <span class="svc letter" style={{ backgroundColor: icon.color }} aria-hidden="true">
          {icon.letter}
        </span>
      );
    case 'none':
      return <span class="svc" aria-hidden="true" />;
  }
}
