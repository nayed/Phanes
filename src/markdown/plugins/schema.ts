import { defaultSchema, type Options as Schema } from "rehype-sanitize";

/**
 * GitHub's sanitisation schema (rehype-sanitize's default), plus the
 * `data-line` attribute used for synced scroll. Scripts, event handlers,
 * iframes, styles and javascript: URLs never survive.
 *
 * Alerts and Shiki highlighting run after sanitising, on trusted output,
 * so the schema does not need to allow their classes or inline styles.
 */
export const sanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "dataLine"],
  },
};
