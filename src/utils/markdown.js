/**
 * Lightweight markdown helpers for note content.
 *
 * Notes are stored as plain text with a small, portable markdown subset:
 *   # Heading 1 / ## Heading 2 / ### Heading 3
 *   - bullet items / 1. ordered items
 *   > blockquote
 *   **bold**, *italic*, `code`, [text](https://url)
 *
 * Keeping content as plain text means PDF / DOCX / TXT / Markdown exports
 * (Part 2 backend) can consume the exact same stored value.
 */

const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

/** Strips markdown syntax to produce a clean plain-text preview. */
export function stripMarkdown(content = '') {
  return String(content)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns a short single-line excerpt suitable for cards and lists. */
export function excerpt(content = '', maxLength = 150) {
  const text = stripMarkdown(content);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

/** True when the note body contains no meaningful content. */
export function isBlankContent(content = '') {
  return stripMarkdown(content).length === 0;
}

/**
 * Parses note content into a small array of renderable blocks.
 * The React <NoteContent/> component maps these to semantic elements —
 * no dangerouslySetInnerHTML anywhere.
 */
export function parseNoteContent(content = '') {
  const lines = String(content).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      flushAll();
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2].trim() });
      continue;
    }

    const bulletMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { type: 'list', ordered: false, items: [] };
      }
      list.items.push(bulletMatch[1].trim());
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { type: 'list', ordered: true, items: [] };
      }
      list.items.push(orderedMatch[1].trim());
      continue;
    }

    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) {
      flushAll();
      blocks.push({ type: 'quote', text: quoteMatch[1].trim() });
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushAll();
  return blocks;
}

/** Renders inline markdown (bold/italic/code/links) into React elements. */
export function parseInline(text = '') {
  const nodes = [];
  const parts = String(text).split(INLINE_RE);

  parts.forEach((part, index) => {
    if (!part) return;

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push({ type: 'strong', text: part.slice(2, -2), key: index });
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      nodes.push({ type: 'em', text: part.slice(1, -1), key: index });
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      nodes.push({ type: 'code', text: part.slice(1, -1), key: index });
    } else if (/^\[[^\]]+\]\([^)]+\)$/.test(part)) {
      const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const url = match[2];
      const safeUrl = /^(https?:|mailto:|#|\/)/i.test(url) ? url : null;
      nodes.push({ type: 'link', text: match[1], url: safeUrl, key: index });
    } else {
      nodes.push({ type: 'text', text: part, key: index });
    }
  });

  return nodes;
}
