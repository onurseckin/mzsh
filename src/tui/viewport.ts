export type TuiViewportProfileName =
  | 'large-desktop'
  | 'standard-laptop'
  | 'tablet-split'
  | 'mobile-compact';

export interface TuiViewportDimensions {
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
}

export interface TuiViewportProfile extends TuiViewportDimensions {
  readonly name: TuiViewportProfileName;
  readonly label: string;
  readonly isCompact: boolean;
  readonly isMobile: boolean;
}

export const TUI_VIEWPORT_PROFILES: Record<TuiViewportProfileName, TuiViewportProfile> = {
  'large-desktop': {
    name: 'large-desktop',
    label: 'Large Desktop (1920x1080)',
    width: 1920,
    height: 1080,
    columns: 240,
    rows: 60,
    isCompact: false,
    isMobile: false,
  },
  'standard-laptop': {
    name: 'standard-laptop',
    label: 'Standard Laptop (1440x900)',
    width: 1440,
    height: 900,
    columns: 180,
    rows: 45,
    isCompact: false,
    isMobile: false,
  },
  'tablet-split': {
    name: 'tablet-split',
    label: 'Tablet / Split-pane (768x1024)',
    width: 768,
    height: 1024,
    columns: 96,
    rows: 50,
    isCompact: true,
    isMobile: false,
  },
  'mobile-compact': {
    name: 'mobile-compact',
    label: 'Mobile / Compact (390x844)',
    width: 390,
    height: 844,
    columns: 48,
    rows: 35,
    isCompact: true,
    isMobile: true,
  },
};

export function resolveViewportProfile(
  input?: Partial<TuiViewportDimensions> | TuiViewportProfileName
): TuiViewportProfile {
  if (typeof input === 'string' && input in TUI_VIEWPORT_PROFILES) {
    return TUI_VIEWPORT_PROFILES[input];
  }
  const columns =
    typeof input === 'object' && input !== null && input.columns !== undefined
      ? input.columns
      : typeof process !== 'undefined' && process.stdout && process.stdout.columns
        ? process.stdout.columns
        : 180;
  const rows =
    typeof input === 'object' && input !== null && input.rows !== undefined
      ? input.rows
      : typeof process !== 'undefined' && process.stdout && process.stdout.rows
        ? process.stdout.rows
        : 45;
  const width =
    typeof input === 'object' && input !== null && input.width !== undefined
      ? input.width
      : columns * 8;
  const height =
    typeof input === 'object' && input !== null && input.height !== undefined
      ? input.height
      : rows * 20;
  const isMobile = columns <= 48;
  const isCompact = columns <= 96;
  const name: TuiViewportProfileName =
    columns >= 200
      ? 'large-desktop'
      : columns >= 120
        ? 'standard-laptop'
        : columns > 48
          ? 'tablet-split'
          : 'mobile-compact';
  const label =
    name === 'large-desktop'
      ? 'Large Desktop (1920x1080)'
      : name === 'standard-laptop'
        ? 'Standard Laptop (1440x900)'
        : name === 'tablet-split'
          ? 'Tablet / Split-pane (768x1024)'
          : 'Mobile / Compact (390x844)';

  return { name, label, width, height, columns, rows, isCompact, isMobile };
}
