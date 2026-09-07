/**
 * Shared design tokens for Mesh, Etch, and Volt.
 *
 * Radius and font values are the canonical ones two of the three apps
 * (Etch, Volt) already used; Mesh is the outlier being brought in line.
 * Accent color stays per-app (each app keeps its own identity) and is not
 * exported here.
 */

export const radius = {
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  full: '9999px',
} as const;

export const fontFamily = {
  sans: [
    'Outfit',
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    'Roboto',
    'sans-serif',
  ],
} as const;

export const glassPanel = {
  light: {
    background: 'rgba(255, 255, 255, 0.85)',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.06)',
  },
  dark: {
    background: 'rgba(15, 23, 42, 0.85)',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2), 0 4px 16px rgba(0, 0, 0, 0.3)',
  },
} as const;
