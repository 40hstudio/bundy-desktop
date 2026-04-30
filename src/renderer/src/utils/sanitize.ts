import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'h1','h2','h3','h4','h5','h6','p','br','hr',
  'strong','b','em','i','u','del','s',
  'code','pre','blockquote','ul','ol','li',
  'a','img','span','div',
  // Task lists (Tiptap @tiptap/extension-task-list)
  'label','input',
  // Tables (Tiptap @tiptap/extension-table)
  'table','thead','tbody','tr','th','td','colgroup','col',
]

const ALLOWED_ATTR = [
  'href','target','rel','style',
  'src','alt','width','height','class',
  // Tiptap dataset markers — required for task list rendering and our CSS
  'data-type','data-checked','data-list-type',
  // Form controls used by task lists
  'type','checked','disabled',
  // Table cells
  'colspan','rowspan',
]

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}
