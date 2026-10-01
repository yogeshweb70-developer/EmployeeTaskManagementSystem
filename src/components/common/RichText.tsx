import React, { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

// Open every link in a new tab without giving the target page access to this one
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer nofollow')
  }
})

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li']
const ALLOWED_ATTR = ['href', 'target', 'rel']
const URL_PATTERN = /\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]'"])/gi

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Plain text -> HTML with web addresses turned into links
function linkifyText(text: string): string {
  return escapeHtml(text).replace(URL_PATTERN, (url) => {
    const href = url.startsWith('www.') ? `https://${url}` : url
    return `<a href="${href}">${url}</a>`
  })
}

function looksLikeHtml(value: string): boolean {
  return /^\s*<(p|ul|ol)[\s>]/i.test(value)
}

export function toSafeHtml(value: string): string {
  const html = looksLikeHtml(value) ? value : linkifyText(value).replace(/\n/g, '<br>')
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}

// Strip formatting for search and short previews
export function richTextToPlain(value: string | null | undefined): string {
  if (!value) return ''
  if (!looksLikeHtml(value)) return value
  const doc = new DOMParser().parseFromString(DOMPurify.sanitize(value), 'text/html')
  return doc.body.textContent || ''
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const MARK_CLASS = 'rounded-sm bg-[#0055ff14] px-0.5 text-inherit'

// Wrap every case-insensitive match of `query` in <mark>, touching only text (never tags or link URLs)
export function highlightHtml(html: string, query?: string): string {
  const q = query?.trim()
  if (!q) return html
  const pattern = new RegExp(escapeRegExp(q), 'gi')
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

  for (const node of textNodes) {
    const text = node.nodeValue || ''
    pattern.lastIndex = 0
    if (!pattern.test(text)) continue
    pattern.lastIndex = 0
    const frag = doc.createDocumentFragment()
    let last = 0
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0
      if (start > last) frag.appendChild(doc.createTextNode(text.slice(last, start)))
      const mark = doc.createElement('mark')
      mark.className = MARK_CLASS
      mark.textContent = match[0]
      frag.appendChild(mark)
      last = start + match[0].length
    }
    if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)))
    node.parentNode?.replaceChild(frag, node)
  }
  return root.innerHTML
}

// Plain text with matches highlighted (names, emails)
export const Highlight: React.FC<{ text: string; query?: string; className?: string }> = ({ text, query, className }) => {
  const q = query?.trim()
  if (!q) return <span className={className}>{text}</span>
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'))
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className={MARK_CLASS}>
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </span>
  )
}

interface RichTextProps {
  value: string
  className?: string
  as?: 'div' | 'span'
  highlight?: string
}

// Renders a task description (formatted HTML or legacy plain text) safely, with clickable links
export const RichText: React.FC<RichTextProps> = ({ value, className, as = 'div', highlight }) => {
  const html = useMemo(() => highlightHtml(toSafeHtml(value), highlight), [value, highlight])
  const Tag = as
  return (
    <Tag
      className={cn('rich-text', className)}
      // Clicking a link should not also trigger the row's own click handler
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')) e.stopPropagation()
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// Renders a single line (task name) with any web address made clickable
export const LinkifiedText: React.FC<{ value: string; className?: string; highlight?: string }> = ({
  value,
  className,
  highlight,
}) => {
  const html = useMemo(
    () => highlightHtml(DOMPurify.sanitize(linkifyText(value), { ALLOWED_TAGS: ['a'], ALLOWED_ATTR }), highlight),
    [value, highlight]
  )
  return <span className={cn('rich-text', className)} dangerouslySetInnerHTML={{ __html: html }} />
}
