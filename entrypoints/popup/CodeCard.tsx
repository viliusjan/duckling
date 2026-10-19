import { useMemo } from 'preact/hooks';
import { generateOTPs, type Code } from '@/lib/otp/code';
import type { IconIndex } from '@/lib/ui/icons';
import { formatOTP, maskOTP } from '@/lib/ui/list';
import { Glyph } from './Glyph';
import { ServiceIcon } from './ServiceIcon';

export interface CardProps {
  code: Code;
  domId: string;
  offset: number;
  now: number;
  active: boolean;
  /** Keyboard selection reveals a hidden code; hover always does. */
  reveal: boolean;
  copied: 'current' | 'next' | undefined;
  masked: boolean;
  compact: boolean;
  showNext: boolean;
  dark: boolean;
  index: IconIndex | undefined;
  onCopy: (code: Code, which: 'current' | 'next') => void;
  onHover: () => void;
}

/**
 * One code, laid out like the official app's card (code_widget.dart):
 * progress bar on top (purple, orange in the last 40 %), issuer and account,
 * the code, and the next code on the right.
 */
export function CodeCard(p: CardProps) {
  const { code } = p;
  const periodMs = code.period * 1000;
  // Start the CSS countdown at the right point; it then runs by itself.
  const delay = useMemo(() => -(((Date.now() + p.offset) % periodMs) / 1000), [code.id, periodMs, p.offset]);

  let otp: string;
  let next: string;
  try {
    [otp, next] = generateOTPs(code, p.offset, p.now);
  } catch {
    return (
      <div class="card" role="option" id={p.domId} aria-selected={p.active} aria-disabled="true">
        <div class="card-top" style={{ paddingBottom: 10 }}>
          <ServiceIcon code={code} index={p.index} dark={p.dark} />
          <div class="names">
            <span class="issuer">{code.issuer || 'Unknown'}</span>
            <span class="account" style={{ color: 'var(--error)' }}>This entry has an invalid secret</span>
          </div>
        </div>
      </div>
    );
  }

  const isTotp = code.type !== 'hotp';
  const formatted = formatOTP(otp);
  const nextFormatted = formatOTP(next);
  const account = code.account && code.account !== code.issuer ? code.account : undefined;
  const label = [code.issuer, account].filter(Boolean).join(', ');
  const classes = [
    'card',
    p.active && 'active',
    p.reveal && 'reveal',
    p.masked && 'masked',
    code.codeDisplay?.pinned && 'pinned',
  ]
    .filter(Boolean)
    .join(' ');

  const otpView = (
    <span class="otp" dir="ltr">
      <span class="real">{formatted}</span>
      <span class="mask">{maskOTP(formatted)}</span>
    </span>
  );
  const nextView = p.showNext && isTotp && (
    <button
      type="button"
      class="next"
      title="Copy the next code"
      aria-label={`Copy next code for ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        p.onCopy(code, 'next');
      }}
    >
      <span class="label">next</span>
      <span class="value" dir="ltr">{p.masked ? maskOTP(nextFormatted) : nextFormatted}</span>
    </button>
  );

  return (
    <div
      class={classes}
      role="option"
      id={p.domId}
      aria-selected={p.active}
      aria-label={`${label}. Code ${otp.split('').join(' ')}`}
      title={code.codeDisplay?.note ? `Note: ${code.codeDisplay.note}` : undefined}
      onClick={() => p.onCopy(code, 'current')}
      onMouseEnter={p.onHover}
    >
      {code.codeDisplay?.pinned && <Glyph name="pin" class="pin" />}
      {isTotp ? (
        <div class="bar" aria-hidden="true">
          <span style={{ animationDuration: `${code.period}s`, animationDelay: `${delay}s` }} />
        </div>
      ) : (
        <div class="bar" aria-hidden="true" />
      )}
      {p.compact ? (
        <div class="card-row">
          <ServiceIcon code={code} index={p.index} dark={p.dark} />
          <div class="names">
            <span class="issuer">{code.issuer || account || 'Unknown'}</span>
            {account && code.issuer && <span class="account">{account}</span>}
          </div>
          {otpView}
          {nextView}
        </div>
      ) : (
        <>
          <div class="card-top">
            <ServiceIcon code={code} index={p.index} dark={p.dark} />
            <div class="names">
              <span class="issuer">{code.issuer || account || 'Unknown'}</span>
              {account && code.issuer && <span class="account">{account}</span>}
            </div>
            {code.codeDisplay?.note && <Glyph name="note" class="note" />}
          </div>
          <div class="card-bottom">
            {otpView}
            {p.active && !p.copied && <span class="enter-hint" aria-hidden="true">↵ copy</span>}
            {nextView}
          </div>
        </>
      )}
      {p.copied && (
        <div class="copied-overlay" aria-hidden="true">
          <Glyph name="check" />
          {p.copied === 'next' ? 'Next code copied' : 'Copied'}
        </div>
      )}
    </div>
  );
}
