import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type PluggableList } from "unified";
import { rehypeAlerts } from "./plugins/alerts";
import { rehypeShiki } from "./plugins/highlight";
import { rehypeLocalImages } from "./plugins/localImages";
import { sanitizeSchema } from "./plugins/schema";
import { rehypeSourceLines } from "./plugins/sourceLines";

/**
 * The markdown → HTML pipeline, in order. Adding a feature (math, Mermaid,
 * front matter…) means adding a plugin to this list:
 *
 * - remark plugins work on the markdown tree (before `remarkRehype`);
 * - rehype plugins before `rehypeSanitize` see untrusted HTML;
 * - rehype plugins after it only ever see sanitised HTML, and may add
 *   markup of their own (alerts, highlighting).
 */
export const pipeline: PluggableList = [
  remarkGfm, // tables, task lists, strikethrough, autolinks, footnotes
  [remarkRehype, { allowDangerousHtml: true, clobberPrefix: "" }],
  rehypeRaw, // parse raw HTML in the document, so it can be sanitised like GitHub does
  rehypeSourceLines, // data-line on blocks, for synced scroll
  [rehypeSanitize, sanitizeSchema], // GitHub's schema: no scripts, ever
  rehypeAlerts, // > [!NOTE] …
  rehypeShiki, // code blocks
  rehypeLocalImages, // relative images through the asset protocol
];

const processor = unified().use(remarkParse).use(pipeline).use(rehypeStringify).freeze();

export interface RenderOptions {
  /** Folder of the document, for relative images. */
  baseDir?: string;
}

/** Render markdown to sanitised HTML. */
export async function renderMarkdown(markdown: string, options: RenderOptions = {}): Promise<string> {
  const file = await processor.process({ value: markdown, data: { baseDir: options.baseDir } });
  return String(file);
}
