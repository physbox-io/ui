import { describe, expect, it } from 'vitest';
import { escapeAttribute, sanitizeNoteUrl } from '../src/noteMarkdown';

describe('sanitizeNoteUrl', () => {
  it('passes an ordinary link through', () => {
    expect(sanitizeNoteUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(sanitizeNoteUrl('mailto:someone@example.com')).toBe('mailto:someone@example.com');
  });

  it('reads a bare domain as a host, which is what people type', () => {
    expect(sanitizeNoteUrl('example.com/docs')).toBe('https://example.com/docs');
  });

  it('refuses a scheme that executes', () => {
    expect(sanitizeNoteUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeNoteUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(sanitizeNoteUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeNoteUrl('vbscript:msgbox(1)')).toBeNull();
  });

  it('refuses a scheme hidden behind the control characters a browser strips', () => {
    // A browser drops the tab before it resolves the scheme, so a check that
    // trusted the raw string would see "java\tscript:" and let it past.
    expect(sanitizeNoteUrl('java\tscript:alert(1)')).toBeNull();
    expect(sanitizeNoteUrl('java\nscript:alert(1)')).toBeNull();
  });

  it('cannot end the attribute it is put in', () => {
    // The original bug: `[x](" onmouseover="alert(1))` closed href early and
    // landed an event handler on the anchor.
    const href = sanitizeNoteUrl('" onmouseover="alert(1)');
    expect(href).not.toBeNull();
    expect(href).not.toContain('"');
    expect(href).toContain('&quot;');
  });

  it('is empty-safe', () => {
    expect(sanitizeNoteUrl('')).toBeNull();
    expect(sanitizeNoteUrl('   ')).toBeNull();
  });
});

describe('escapeAttribute', () => {
  it('escapes the ampersand before the rest, not after', () => {
    // Escaping quotes first and ampersands second would turn `"` into
    // `&amp;quot;` and print the entity instead of the character.
    expect(escapeAttribute('a&b"c<d>')).toBe('a&amp;b&quot;c&lt;d&gt;');
  });
});
