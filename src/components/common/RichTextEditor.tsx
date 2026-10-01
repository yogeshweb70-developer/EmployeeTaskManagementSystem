import React, { useEffect, useState } from 'react'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  Unlink,
  Check,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Hint } from '@/components/ui/tooltip'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
  invalid?: boolean
}

// Add https:// when someone types "zeroado.com"
function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const ToolbarButton: React.FC<{
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}> = ({ onClick, active, title, children }) => (
  <Hint label={title}>
    <button
      type="button"
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 cursor-pointer',
        active && 'bg-blue-50 text-blue-600'
      )}
    >
      {children}
    </button>
  </Hint>
)

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, className, invalid }) => {
  const [isLinkInputOpen, setIsLinkInputOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: 'https',
          protocols: ['http', 'https', 'mailto'],
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'rich-text min-h-[64px] px-3 py-2 text-sm focus:outline-none',
        'data-placeholder': placeholder || '',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.isEmpty ? '' : editor.getHTML())
    },
  })

  // Keep editor in sync when the parent resets or loads a value (e.g. after submit, or opening edit)
  useEffect(() => {
    if (!editor) return
    const current = editor.isEmpty ? '' : editor.getHTML()
    if (value !== current) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
  }, [value, editor])

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold') ?? false,
      italic: editor?.isActive('italic') ?? false,
      underline: editor?.isActive('underline') ?? false,
      strike: editor?.isActive('strike') ?? false,
      bulletList: editor?.isActive('bulletList') ?? false,
      orderedList: editor?.isActive('orderedList') ?? false,
      link: editor?.isActive('link') ?? false,
      isEmpty: editor?.isEmpty ?? true,
    }),
  })

  if (!editor) return null

  const openLinkInput = () => {
    setLinkUrl(editor.getAttributes('link').href || '')
    setIsLinkInputOpen(true)
  }

  const applyLink = () => {
    const href = normalizeUrl(linkUrl)
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!href) {
      chain.unsetLink().run()
    } else if (editor.state.selection.empty && !editor.isActive('link')) {
      // Nothing selected: insert the URL itself as a link
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run()
    } else {
      chain.setLink({ href }).run()
    }
    setIsLinkInputOpen(false)
    setLinkUrl('')
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-input bg-white focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
        invalid && 'border-rose-500 ring-2 ring-rose-500/20 ring-offset-0 focus-within:ring-rose-500/30',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 px-1.5 py-1">
        <ToolbarButton title="Bold (Ctrl+B)" active={state?.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Italic (Ctrl+I)" active={state?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Underline (Ctrl+U)" active={state?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Strikethrough" active={state?.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <ToolbarButton title="Bullet list" active={state?.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Numbered list" active={state?.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <ToolbarButton title="Add link (select a word first)" active={state?.link} onClick={openLinkInput}>
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        {state?.link && (
          <ToolbarButton title="Remove link" onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}>
            <Unlink className="h-3.5 w-3.5" />
          </ToolbarButton>
        )}
      </div>

      {isLinkInputOpen && (
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5">
          <LinkIcon className="h-3.5 w-3.5 shrink-0 text-blue-600" />
          <input
            autoFocus
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink()
              }
              if (e.key === 'Escape') setIsLinkInputOpen(false)
            }}
            placeholder="Paste or type a link, e.g. zeroado.com"
            className="flex-1 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
          <Hint label="Apply link">
            <button type="button" onClick={applyLink} aria-label="Apply link" className="rounded p-1 text-blue-600 hover:bg-blue-50 cursor-pointer">
              <Check className="h-3.5 w-3.5" />
            </button>
          </Hint>
          <Hint label="Cancel">
            <button type="button" onClick={() => setIsLinkInputOpen(false)} aria-label="Cancel" className="rounded p-1 text-slate-500 hover:bg-slate-100 cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </Hint>
        </div>
      )}

      <div className="relative">
        {state?.isEmpty && placeholder && (
          <span className="pointer-events-none absolute left-3 top-2 text-sm text-slate-400">{placeholder}</span>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
