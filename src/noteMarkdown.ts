// ---------------------------------------------------------------------------
// The one security decision in a note card
// ---------------------------------------------------------------------------
//
// Note cards are little markdown panes floating over the canvas in Etch, Mesh
// and Volt. Each app renders them by running a handful of regexes over the
// text and handing the result to `dangerouslySetInnerHTML`, which is fine for
// everything except the one construct that puts *user text inside an HTML
// attribute*: `[label](url)` becomes `<a href="url">`.
//
// Escaping `&`, `<` and `>` — which is all the three parsers used to do — does
// not close that hole. A quote is not an angle bracket:
//
//     [x](" onmouseover="alert(1))
//
// ends the href early and lands an event handler on the anchor, and
//
//     [x](javascript:alert(1))
//
// needs no quote at all. Neither is theoretical here: note cards are written
// by MCP agents and travel inside saved and shared documents, so the text is
// not always the operator's own.
//
// The styling of a note card stays in each app — they do not agree on link
// colour and there is no reason they should. What lives here is the decision
// about what may become an href at all, because that is the part where three
// slightly different answers means two of them are wrong.
// ---------------------------------------------------------------------------

/** Schemes a note-card link may use. Everything else is not a link. */
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

/** Escapes text for use inside a double-quoted HTML attribute. */
export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The value to put in `href="…"` for a note-card link, or null when the target
 * is not something a note card may link to — in which case the caller should
 * render the link as plain text rather than emitting an anchor.
 *
 * Returns the value already escaped for an attribute in double quotes.
 */
export function sanitizeNoteUrl(raw: string): string | null {
  // Strip control characters first, including the tab and newline a browser
  // drops out of `java<TAB>script:` before it resolves the scheme.
  // eslint-disable-next-line no-control-regex
  const url = raw.replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!url) return null;

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (scheme) {
    if (!SAFE_SCHEMES.includes(scheme[1].toLowerCase() + ':')) return null;
    return escapeAttribute(url);
  }

  if (url.startsWith('//')) {
    // Protocol-relative: whatever the page is served over, which is https.
    return escapeAttribute(url);
  }

  if (/^[./#?]/.test(url)) return escapeAttribute(url);

  // No scheme and no path-like start — "example.com/docs". A bare domain is
  // what people actually type, and a relative link inside a single-page app
  // has nothing useful to point at, so read it as a host.
  return escapeAttribute('https://' + url);
}
