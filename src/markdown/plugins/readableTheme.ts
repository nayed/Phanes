import type { ThemeRegistrationRaw } from "shiki/core";

/**
 * Make a Shiki code theme readable on a given background: every text color
 * below 4.5:1 contrast is moved toward black (light background) or white
 * (dark background), keeping its hue, until it reaches 4.5:1. Colors that
 * already pass, and tokens that paint their own background, are unchanged.
 */

const TARGET = 4.5;

type RGB = [number, number, number];

function parse(hex: string): { rgb: RGB; alpha: number } | null {
  let h = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]+$/i.test(h) || ![3, 4, 6, 8].includes(h.length)) return null;
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { rgb: [n(0), n(2), n(4)], alpha: h.length === 8 ? n(6) / 255 : 1 };
}

function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return a.map((v, i) => Math.round(v * (1 - t) + b[i] * t)) as RGB;
}

function toHex(rgb: RGB): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** The color itself if it passes, otherwise the nearest passing shade (as opaque hex). */
function readable(color: string, background: RGB): string {
  const parsed = parse(color);
  if (!parsed) return color;
  // A translucent color is seen blended over the background.
  const seen = mix(background, parsed.rgb, parsed.alpha);
  if (contrast(seen, background) >= TARGET) return color;
  const toward: RGB = luminance(background) > 0.18 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.01; t <= 1; t += 0.01) {
    const candidate = mix(seen, toward, t);
    if (contrast(candidate, background) >= TARGET) return toHex(candidate);
  }
  return toHex(toward);
}

export function readableTheme(theme: ThemeRegistrationRaw, background: string): ThemeRegistrationRaw {
  const bg = parse(background)?.rgb;
  if (!bg) return theme;
  const colors = { ...theme.colors };
  if (colors["editor.foreground"]) colors["editor.foreground"] = readable(colors["editor.foreground"], bg);
  return {
    ...theme,
    ...(theme.fg ? { fg: readable(theme.fg, bg) } : {}),
    colors,
    settings: (theme.settings ?? theme.tokenColors ?? []).map((rule) => {
      const fg = rule.settings?.foreground;
      if (!fg || rule.settings.background) return rule;
      return { ...rule, settings: { ...rule.settings, foreground: readable(fg, bg) } };
    }),
    tokenColors: undefined,
  };
}
