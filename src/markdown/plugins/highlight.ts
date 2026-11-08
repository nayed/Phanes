import type { Element, Root } from "hast";
import { toText } from "hast-util-to-text";
import { createHighlighterCore, type HighlighterCore, type ThemeRegistrationRaw } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages } from "shiki/langs";
import { visit } from "unist-util-visit";
import { readableTheme } from "./readableTheme";

/**
 * Code blocks highlighted by Shiki with each colorscheme's own themes. Every
 * theme is emitted as a CSS variable (--shiki-github-light, --shiki-gruvbox-dark…)
 * and preview.css picks one from the current colorscheme and mode, so
 * switching either needs no re-render. Each theme's colors are raised to 4.5:1
 * contrast on its code block background. Grammars load on demand from the
 * bundle; nothing comes from the network.
 */

const THEMES = {
  "github-light": "github-light-default",
  "github-dark": "github-dark-default",
  "gruvbox-light": "gruvbox-light-medium",
  "gruvbox-dark": "gruvbox-dark-medium",
  "catppuccin-light": "catppuccin-latte",
  "catppuccin-dark": "catppuccin-mocha",
  "everforest-light": "everforest-light",
  "everforest-dark": "everforest-dark",
} as const;

type ThemeKey = keyof typeof THEMES;

/** Each theme's module, loaded on first use. */
const THEME_MODULES: Record<ThemeKey, () => Promise<{ default: unknown }>> = {
  "github-light": () => import("shiki/themes/github-light-default.mjs"),
  "github-dark": () => import("shiki/themes/github-dark-default.mjs"),
  "gruvbox-light": () => import("shiki/themes/gruvbox-light-medium.mjs"),
  "gruvbox-dark": () => import("shiki/themes/gruvbox-dark-medium.mjs"),
  "catppuccin-light": () => import("shiki/themes/catppuccin-latte.mjs"),
  "catppuccin-dark": () => import("shiki/themes/catppuccin-mocha.mjs"),
  "everforest-light": () => import("shiki/themes/everforest-light.mjs"),
  "everforest-dark": () => import("shiki/themes/everforest-dark.mjs"),
};

/**
 * The code block background each theme is drawn on: --surface of its
 * colorscheme and mode in styles/tokens.css. Keep the two in sync.
 */
const CODE_BACKGROUNDS: Record<ThemeKey, string> = {
  "github-light": "#f6f8fa",
  "github-dark": "#151b23",
  "gruvbox-light": "#f2e5bc",
  "gruvbox-dark": "#32302f",
  "catppuccin-light": "#e6e9ef",
  "catppuccin-dark": "#181825",
  "everforest-light": "#f4f0d9",
  "everforest-dark": "#232a2e",
};

async function loadTheme(key: ThemeKey): Promise<ThemeRegistrationRaw> {
  const theme = (await THEME_MODULES[key]()).default as ThemeRegistrationRaw;
  return readableTheme(theme, CODE_BACKGROUNDS[key]);
}

let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: (Object.keys(THEMES) as ThemeKey[]).map(loadTheme),
    langs: [],
    // The JavaScript engine needs no WebAssembly (and no 'wasm-unsafe-eval' in the CSP).
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighter;
}

const failed = new Set<string>();

/** Load the grammar for a fence's language. Returns the canonical id, or null if unknown. */
async function ensureLanguage(h: HighlighterCore, lang: string): Promise<string | null> {
  const id = lang.toLowerCase();
  if (h.getLoadedLanguages().includes(id)) return id;
  if (failed.has(id)) return null;
  const load = (bundledLanguages as Record<string, (() => Promise<unknown>) | undefined>)[id];
  if (!load) {
    failed.add(id);
    return null;
  }
  try {
    await h.loadLanguage(load() as never);
    return id;
  } catch {
    failed.add(id);
    return null;
  }
}

/** Highlighted output per (language, code), so retyping elsewhere stays fast. */
const cache = new Map<string, Element>();
const CACHE_LIMIT = 500;

function languageOf(code: Element): string | null {
  const classes = (code.properties.className as string[] | undefined) ?? [];
  const cls = classes.find((c) => c.startsWith("language-"));
  return cls ? cls.slice("language-".length) : null;
}

export function rehypeShiki() {
  return async (tree: Root) => {
    const blocks: Array<{ pre: Element; code: Element; lang: string }> = [];
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "pre") return;
      const code = node.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
      const lang = code && languageOf(code);
      if (code && lang) blocks.push({ pre: node, code, lang });
    });
    if (!blocks.length) return;

    const h = await getHighlighter();
    for (const { pre, code, lang } of blocks) {
      const id = await ensureLanguage(h, lang);
      if (!id) continue;
      const text = toText(code, { whitespace: "pre" }).replace(/\n$/, "");
      const key = `${id}\u0000${text}`;
      let highlighted = cache.get(key);
      if (!highlighted) {
        const root = h.codeToHast(text, { lang: id, themes: THEMES, defaultColor: false });
        const shikiPre = root.children.find((c): c is Element => c.type === "element" && c.tagName === "pre");
        const shikiCode = shikiPre?.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
        if (!shikiCode) continue;
        highlighted = shikiCode;
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
        cache.set(key, highlighted);
      }
      // Keep our <pre> (and its data-line); swap in Shiki's highlighted <code>.
      pre.properties.className = ["shiki"];
      pre.children = [{ ...highlighted, properties: { ...highlighted.properties, className: [`language-${id}`] } }];
    }
  };
}
