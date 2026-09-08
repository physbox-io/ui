import React, { useState, useEffect } from 'react';

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | undefined | null;
  onChange: (val: number | undefined) => void;
  onCommit?: () => void;
  min?: number;
  max?: number;
  /** Parse with parseInt instead of parseFloat, and round the clamped result. */
  integer?: boolean;
  fallbackOnBlur?: number;
  allowEmpty?: boolean;
}

/**
 * Numeric field that lets you type.
 *
 * Deliberately unclamped while typing: a half-typed number is not out of
 * range, it is unfinished. Clamping per keystroke turns "300" into the
 * minimum on its first character and writes values nobody typed. Blur is
 * where the number is complete and where the range gets enforced — an empty
 * or unparsable box falls back to `fallbackOnBlur`, or the value already in
 * force, or `min`.
 */
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  onCommit,
  min,
  max,
  integer,
  fallbackOnBlur,
  allowEmpty = false,
  onBlur,
  className,
  ...props
}) => {
  const [localVal, setLocalVal] = useState<string>(
    value !== undefined && value !== null && !isNaN(value) ? String(value) : ''
  );
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalVal(value !== undefined && value !== null && !isNaN(value) ? String(value) : '');
    }
  }, [value, isFocused]);

  const clamp = (n: number) => {
    let c = n;
    if (min !== undefined && c < min) c = min;
    if (max !== undefined && c > max) c = max;
    return integer ? Math.round(c) : c;
  };

  const parse = (raw: string): number => (integer ? parseInt(raw, 10) : parseFloat(raw));

  /**
   * Report a value only when it is actually different.
   *
   * Callers commit an undo entry per change, and the store can only dedupe
   * documents it recognises by identity — a transient update rebuilds the
   * object either way. So focusing a field and leaving it untouched must not
   * reach `onChange` at all, or it lands in the history as an edit.
   */
  const emit = (next: number | undefined) => {
    if (next !== value) onChange(next);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalVal(raw);

    if (raw === '') {
      if (allowEmpty) emit(undefined);
      return;
    }

    const num = parse(raw);
    if (!isNaN(num)) emit(num);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);

    const num = localVal === '' ? NaN : parse(localVal);
    if (isNaN(num)) {
      if (allowEmpty) {
        emit(undefined);
        setLocalVal('');
      } else {
        // Nothing usable was left in the box, so fall back to what the caller
        // named, or failing that to the value it already had.
        const fb =
          fallbackOnBlur ??
          (value !== undefined && value !== null && !isNaN(value) ? value : min ?? 0);
        emit(fb);
        setLocalVal(String(fb));
      }
    } else {
      const clamped = clamp(num);
      emit(clamped);
      setLocalVal(String(clamped));
    }

    if (onBlur) onBlur(e);
    if (onCommit) onCommit();
  };

  return (
    <input
      {...props}
      type="number"
      min={min}
      max={max}
      value={localVal}
      onFocus={() => setIsFocused(true)}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
    />
  );
};
