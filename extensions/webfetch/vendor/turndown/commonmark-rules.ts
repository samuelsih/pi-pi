import { escapeMarkdown, repeat, trimNewlines } from './utilities'
import type { Rule, TurndownOptions } from './rules'

interface RulesMap {
  [key: string]: Rule
}

const rules: RulesMap = {}

rules.paragraph = {
  filter: 'p',

  replacement: function (content: string): string {
    return '\n\n' + content + '\n\n'
  }
}

rules.lineBreak = {
  filter: 'br',

  replacement: function (content: string, node: any, options: TurndownOptions): string {
    return options.br + '\n'
  }
}

rules.heading = {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],

  replacement: function (content: string, node: any, options: TurndownOptions): string {
    const hLevel = Number(node.nodeName.charAt(1))

    if (options.headingStyle === 'setext' && hLevel < 3) {
      const underline = repeat((hLevel === 1 ? '=' : '-'), content.length)
      return (
        '\n\n' + content + '\n' + underline + '\n\n'
      )
    } else {
      return '\n\n' + repeat('#', hLevel) + ' ' + content + '\n\n'
    }
  }
}

rules.blockquote = {
  filter: 'blockquote',

  replacement: function (content: string): string {
    content = trimNewlines(content).replace(/^/gm, '> ')
    return '\n\n' + content + '\n\n'
  }
}

rules.list = {
  filter: ['ul', 'ol'],

  replacement: function (content: string, node: any): string {
    const parent = node.parentNode
    if (parent.nodeName === 'LI' && parent.lastElementChild === node) {
      return '\n' + content
    } else {
      return '\n\n' + content + '\n\n'
    }
  }
}

rules.listItem = {
  filter: 'li',

  replacement: function (content: string, node: any, options: TurndownOptions): string {
    let prefix = options.bulletListMarker + '   '
    const parent = node.parentNode
    if (parent.nodeName === 'OL') {
      const start = parent.getAttribute('start')
      const index = Array.prototype.indexOf.call(parent.children, node)
      prefix = (start ? Number(start) + index : index + 1) + '.  '
    }
    const isParagraph = /\n$/.test(content)
    content = trimNewlines(content) + (isParagraph ? '\n' : '')
    content = content.replace(/\n/gm, '\n' + ' '.repeat(prefix.length)) // indent
    return (
      prefix + content + (node.nextSibling ? '\n' : '')
    )
  }
}

rules.indentedCodeBlock = {
  filter: function (node: any, options: TurndownOptions): boolean {
    return (
      options.codeBlockStyle === 'indented' &&
      node.nodeName === 'PRE' &&
      node.firstChild &&
      node.firstChild.nodeName === 'CODE'
    )
  },

  replacement: function (content: string, node: any): string {
    return (
      '\n\n    ' +
      node.firstChild.textContent.replace(/\n/g, '\n    ') +
      '\n\n'
    )
  }
}

rules.fencedCodeBlock = {
  filter: function (node: any, options: TurndownOptions): boolean {
    return (
      options.codeBlockStyle === 'fenced' &&
      node.nodeName === 'PRE' &&
      node.firstChild &&
      node.firstChild.nodeName === 'CODE'
    )
  },

  replacement: function (content: string, node: any, options: TurndownOptions): string {
    const className = node.firstChild.getAttribute('class') || ''
    const language = (className.match(/language-(\S+)/) || [null, ''])[1]
    const code = node.firstChild.textContent

    const fenceChar = options.fence.charAt(0)
    let fenceSize = 3
    const fenceInCodeRegex = new RegExp('^' + fenceChar + '{3,}', 'gm')

    let match
    while ((match = fenceInCodeRegex.exec(code))) {
      if (match[0].length >= fenceSize) {
        fenceSize = match[0].length + 1
      }
    }

    const fence = repeat(fenceChar, fenceSize)

    return (
      '\n\n' + fence + language + '\n' +
      code.replace(/\n$/, '') +
      '\n' + fence + '\n\n'
    )
  }
}

rules.horizontalRule = {
  filter: 'hr',

  replacement: function (content: string, node: any, options: TurndownOptions): string {
    return '\n\n' + options.hr + '\n\n'
  }
}

rules.inlineLink = {
  filter: function (node: any, options: TurndownOptions): boolean {
    return (
      options.linkStyle === 'inlined' &&
      node.nodeName === 'A' &&
      node.getAttribute('href')
    )
  },

  replacement: function (content: string, node: any): string {
    const href = escapeLinkDestination(node.getAttribute('href'))
    const title = escapeLinkTitle(cleanAttribute(node.getAttribute('title')))
    const titlePart = title ? ' "' + title + '"' : ''
    return '[' + content + '](' + href + titlePart + ')'
  }
}

rules.referenceLink = {
  filter: function (node: any, options: TurndownOptions): boolean {
    return (
      options.linkStyle === 'referenced' &&
      node.nodeName === 'A' &&
      node.getAttribute('href')
    )
  },

  replacement: function (content: string, node: any, options: TurndownOptions): string {
    const href = escapeLinkDestination(node.getAttribute('href'))
    let title = cleanAttribute(node.getAttribute('title'))
    if (title) title = ' "' + escapeLinkTitle(title) + '"'
    let replacementStr: string
    let reference: string

    switch (options.linkReferenceStyle) {
      case 'collapsed':
        replacementStr = '[' + content + '][]'
        reference = '[' + content + ']: ' + href + title
        break
      case 'shortcut':
        replacementStr = '[' + content + ']'
        reference = '[' + content + ']: ' + href + title
        break
      default:
        var id = (this as any).references.length + 1
        replacementStr = '[' + content + '][' + id + ']'
        reference = '[' + id + ']: ' + href + title
    }

    ;(this as any).references.push(reference)
    return replacementStr
  },

  references: [] as string[],

  append: function (options: TurndownOptions): string {
    let references = ''
    if ((this as any).references.length) {
      references = '\n\n' + (this as any).references.join('\n') + '\n\n'
      ;(this as any).references = [] // Reset references
    }
    return references
  }
}

rules.emphasis = {
  filter: ['em', 'i'],

  replacement: function (content: string, node: any, options: TurndownOptions): string {
    if (!content.trim()) return ''
    return options.emDelimiter + content + options.emDelimiter
  }
}

rules.strong = {
  filter: ['strong', 'b'],

  replacement: function (content: string, node: any, options: TurndownOptions): string {
    if (!content.trim()) return ''
    return options.strongDelimiter + content + options.strongDelimiter
  }
}

rules.code = {
  filter: function (node: any): boolean {
    const hasSiblings = node.previousSibling || node.nextSibling
    const isCodeBlock = node.parentNode.nodeName === 'PRE' && !hasSiblings

    return node.nodeName === 'CODE' && !isCodeBlock
  },

  replacement: function (content: string): string {
    if (!content) return ''
    content = content.replace(/\r?\n|\r/g, ' ')

    const extraSpace = /^`|^ .*?[^ ].* $|`$/.test(content) ? ' ' : ''
    let delimiter = '`'
    const matches = content.match(/`+/gm) || []
    while (matches.indexOf(delimiter) !== -1) delimiter = delimiter + '`'

    return delimiter + extraSpace + content + extraSpace + delimiter
  }
}

rules.image = {
  filter: 'img',

  replacement: function (content: string, node: any): string {
    const alt = escapeMarkdown(cleanAttribute(node.getAttribute('alt')))
    const src = escapeLinkDestination(node.getAttribute('src') || '')
    const title = cleanAttribute(node.getAttribute('title'))
    const titlePart = title ? ' "' + escapeLinkTitle(title) + '"' : ''
    return src ? '![' + alt + ']' + '(' + src + titlePart + ')' : ''
  }
}

function cleanAttribute(attribute: string | null): string {
  return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : ''
}

function escapeLinkDestination(destination: string): string {
  const escaped = destination.replace(/([<>()])/g, '\\$1')
  return escaped.indexOf(' ') >= 0 ? '<' + escaped + '>' : escaped
}

function escapeLinkTitle(title: string): string {
  return title.replace(/"/g, '\\"')
}

export default rules
