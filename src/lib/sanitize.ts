import DOMPurify from 'dompurify';

export const sanitizeHtml = (dirty: string): string => {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'b', 'i',
      'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li',
      'span', 'div', 'font', 'sub', 'sup', 'blockquote',
    ],
    ALLOWED_ATTR: ['style', 'class', 'dir', 'color', 'face', 'size'],
    KEEP_CONTENT: true,
  });
};
