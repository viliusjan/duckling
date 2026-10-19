import { useState } from 'preact/hooks';
import type { Ref } from 'preact';
import { Glyph } from './Glyph';

/**
 * Forms use noValidate and show their own messages: Firefox doesn't display
 * native validation bubbles inside extension popups, so a blocked submit would
 * otherwise look like nothing happened.
 */

export function Brand({ subtitle }: { subtitle: string }) {
  return (
    <header class="brand">
      <img src="/icon/128.png" alt="" width={56} height={56} />
      <h1>Duckling</h1>
      <p>{subtitle}</p>
    </header>
  );
}

export function Disclaimer() {
  return <p class="disclaimer">Unofficial · not affiliated with Ente</p>;
}

interface SecretProps {
  label: string;
  value: string;
  onInput: (v: string) => void;
  autocomplete: string;
  error?: string;
  numeric?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
}

/** Password/PIN field with a show/hide button and a Caps Lock warning. */
export function SecretInput(p: SecretProps) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const id = `f-${p.label.replace(/\W/g, '')}`;
  const onKey = (e: KeyboardEvent) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);
  return (
    <label class="field" for={id}>
      <span>{p.label}</span>
      <div class="input-wrap">
        <input
          id={id}
          ref={p.inputRef}
          class={p.numeric ? 'code-input' : ''}
          // Switches between password and text. Preact's types tie each input
          // type to its ARIA roles and can't express that, hence the cast.
          type={(visible ? 'text' : 'password') as 'password'}
          inputMode={p.numeric ? 'numeric' : undefined}
          autocomplete={p.autocomplete}
          autoFocus={p.autoFocus}
          placeholder={p.placeholder}
          spellcheck={false}
          aria-invalid={p.error ? 'true' : undefined}
          aria-describedby={p.error ? `${id}-err` : undefined}
          value={p.value}
          onInput={(e) => p.onInput(p.numeric ? e.currentTarget.value.replace(/\D/g, '') : e.currentTarget.value)}
          onKeyDown={onKey}
          onKeyUp={onKey}
        />
        <button
          type="button"
          class="icon-btn"
          aria-label={visible ? `Hide ${p.label.toLowerCase()}` : `Show ${p.label.toLowerCase()}`}
          title={visible ? 'Hide' : 'Show'}
          onClick={() => setVisible(!visible)}
        >
          <Glyph name={visible ? 'eyeOff' : 'eye'} />
        </button>
      </div>
      {p.error ? (
        <span class="field-error" id={`${id}-err`}>
          {p.error}
        </span>
      ) : (
        capsLock && !p.numeric && <span class="hint">Caps Lock is on</span>
      )}
    </label>
  );
}

export function Working({ text }: { text: string }) {
  return (
    <p class="working" role="status">
      <span class="spinner" />
      {text}
    </p>
  );
}
