# @physbox-io/ui

Shared design tokens and (eventually) UI primitives for [Mesh](https://github.com/physbox-io/mesh), [Etch](https://github.com/physbox-io/etch), and [Volt](https://github.com/physbox-io/volt).

Each app currently rolls its own copy of common components and hardcodes its own
spacing/radius/font values, which drift out of sync over time. This package is
the shared home for what should be common across all three, added incrementally.

## Install

Published to GitHub Packages. Add to `.npmrc`:

```
@physbox-io:registry=https://npm.pkg.github.com
```

Then:

```
npm install @physbox-io/ui
```

## What's here so far

- `tokens` — radius scale, font stack, glass-panel styles shared across apps.
- `tailwind-preset` — a Tailwind preset each app extends via
  `presets: [require('@physbox-io/ui/tailwind-preset')]` so radius/typography
  stay in sync without hardcoding per app. Accent colors stay per-app.
- `NumberInput` — a numeric text field. Etch, Mesh, and Volt each had their
  own copy with different edit semantics (Etch: accept any typed value,
  clamp/fall back on blur, plus `onCommit`/`fallbackOnBlur`; Mesh/Volt:
  reject an out-of-range or invalid keystroke outright). Unified on Etch's
  clamp-on-blur behavior everywhere; Mesh's `integer` option (parseInt +
  round instead of parseFloat) is preserved as a prop.

## Roadmap

1. Design tokens — done.
2. Duplicated primitives, migrated in one at a time as each app adopts this
   package: `NumberInput` — done. Still to do: `CloudSaveStatus`, tooltip
   components (`InfoTooltip`/`InfoTip`), `NoteCardOverlay`, `GuestListModal`,
   `UserProfileButton`, `TeknoBoxPicker`.
3. Structural patterns (settings panel vs. modal, job-pause banner vs. modal)
   unified into one shared component.

## Release

Publishing happens from a `vX.Y.Z` tag via `.github/workflows/publish.yml`.
