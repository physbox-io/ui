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

## Roadmap

1. Design tokens (this release).
2. Duplicated primitives (`NumberInput`, `CloudSaveStatus`, tooltip components,
   etc.) migrated in one at a time as each app adopts this package.
3. Structural patterns (settings panel vs. modal, job-pause banner vs. modal)
   unified into one shared component.

## Release

Publishing happens from a `vX.Y.Z` tag via `.github/workflows/publish.yml`.
