export function extend(destination: Record<string, any>, ...sources: Record<string, any>[]): Record<string, any> {
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) destination[key] = source[key]
    }
  }
  return destination
}

export function repeat(character: string, count: number): string {
  return Array(count + 1).join(character)
}

export function trimLeadingNewlines(string: string): string {
  return string.replace(/^\n*/, '')
}

export function trimTrailingNewlines(string: string): string {
  // avoid match-at-end regexp bottleneck, see #370
  let indexEnd = string.length
  while (indexEnd > 0 && string[indexEnd - 1] === '\n') indexEnd--
  return string.substring(0, indexEnd)
}

export function trimNewlines(string: string): string {
  return trimTrailingNewlines(trimLeadingNewlines(string))
}

export const blockElements: string[] = [
  'ADDRESS', 'ARTICLE', 'ASIDE', 'AUDIO', 'BLOCKQUOTE', 'BODY', 'CANVAS',
  'CENTER', 'DD', 'DIR', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'FORM', 'FRAMESET', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER',
  'HGROUP', 'HR', 'HTML', 'ISINDEX', 'LI', 'MAIN', 'MENU', 'NAV', 'NOFRAMES',
  'NOSCRIPT', 'OL', 'OUTPUT', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD',
  'TFOOT', 'TH', 'THEAD', 'TR', 'UL'
]

export function isBlock(node: { nodeName: string }): boolean {
  return is(node, blockElements)
}

export const voidElements: string[] = [
  'AREA', 'BASE', 'BR', 'COL', 'COMMAND', 'EMBED', 'HR', 'IMG', 'INPUT',
  'KEYGEN', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'
]

export function isVoid(node: { nodeName: string }): boolean {
  return is(node, voidElements)
}

export function hasVoid(node: any): boolean {
  return has(node, voidElements)
}

const meaningfulWhenBlankElements: string[] = [
  'A', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TH', 'TD', 'IFRAME', 'SCRIPT',
  'AUDIO', 'VIDEO'
]

export function isMeaningfulWhenBlank(node: { nodeName: string }): boolean {
  return is(node, meaningfulWhenBlankElements)
}

export function hasMeaningfulWhenBlank(node: any): boolean {
  return has(node, meaningfulWhenBlankElements)
}

function is(node: { nodeName: string }, tagNames: string[]): boolean {
  return tagNames.indexOf(node.nodeName) >= 0
}

function has(node: any, tagNames: string[]): boolean {
  return (
    node.getElementsByTagName &&
    tagNames.some(function (tagName: string) {
      return node.getElementsByTagName(tagName).length
    })
  )
}

const markdownEscapes: [RegExp, string][] = [
  [/\\/g, '\\\\'],
  [/\*/g, '\\*'],
  [/^-/g, '\\-'],
  [/^\+ /g, '\\+ '],
  [/^(=+)/g, '\\$1'],
  [/^(#{1,6}) /g, '\\$1 '],
  [/`/g, '\\`'],
  [/^~~~/g, '\\~~~'],
  [/\[/g, '\\['],
  [/\]/g, '\\]'],
  [/^>/g, '\\>'],
  [/_/g, '\\_'],
  [/^(\d+)\. /g, '$1\\. ']
]

export function escapeMarkdown(string: string): string {
  return markdownEscapes.reduce(function (accumulator: string, escape: [RegExp, string]) {
    return accumulator.replace(escape[0], escape[1])
  }, string)
}
