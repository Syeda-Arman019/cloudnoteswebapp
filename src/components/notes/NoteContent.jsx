/**
 * NoteContent — renders stored note text (headings, paragraphs, lists,
 * quotes, inline links/formatting) as semantic React elements.
 * Content is never injected as raw HTML.
 */

import { Fragment } from 'react';
import { parseInline, parseNoteContent } from '@/utils/markdown';

function Inline({ text }) {
  return (
    <>
      {parseInline(text).map((node) => {
        if (node.type === 'strong') return <strong key={node.key}>{node.text}</strong>;
        if (node.type === 'em') return <em key={node.key}>{node.text}</em>;
        if (node.type === 'code') return <code key={node.key}>{node.text}</code>;
        if (node.type === 'link' && node.url) {
          return (
            <a key={node.key} href={node.url} target="_blank" rel="noopener noreferrer">
              {node.text}
            </a>
          );
        }
        return <Fragment key={node.key}>{node.text}</Fragment>;
      })}
    </>
  );
}

export default function NoteContent({ content = '', className = '' }) {
  const blocks = parseNoteContent(content);

  if (!blocks.length) {
    return <p className="text-muted-custom">This note has no content yet.</p>;
  }

  return (
    <div className={`note-content ${className}`.trim()}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;

        if (block.type === 'heading') {
          const Tag = `h${Math.min(block.level + 1, 4)}`;
          return (
            <Tag key={key}>
              <Inline text={block.text} />
            </Tag>
          );
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>
                  <Inline text={item} />
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={key}>
              <Inline text={block.text} />
            </blockquote>
          );
        }

        return (
          <p key={key}>
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
