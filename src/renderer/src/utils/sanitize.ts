import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 'del', 's',
  'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'a', 'img',
  'span', 'div',
]

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'style',
  'src', 'alt', 'width', 'height',
  'class',
]

/**
 * Sanitize HTML before injecting via dangerouslySetInnerHTML.
 * Defense-in-depth: the markdown renderers already escape < > &,
 * but this ensures any bypass in the regex chain can't execute scripts.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  })
}
