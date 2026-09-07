import { radius, fontFamily } from './tokens';

/**
 * Tailwind preset each app extends via `presets: [require('@physbox-io/ui/tailwind-preset')]`.
 * Holds only what should be shared (radius scale, font stack) — accent
 * colors stay per-app in each app's own config.
 */
export const preset = {
  theme: {
    extend: {
      borderRadius: radius,
      fontFamily,
    },
  },
};

export default preset;
