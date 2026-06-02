import { isBlock, isVoid, hasVoid, isMeaningfulWhenBlank, hasMeaningfulWhenBlank } from './utilities'

export interface TurndownNode extends Node {
  isBlock: boolean
  isCode: boolean
  isBlank: boolean
  flankingWhitespace: { leading: string; trailing: string }
  nodeName: string
  nodeValue: string | null
  nodeType: number
  parentNode: TurndownNode
  previousSibling: TurndownNode | null
  nextSibling: TurndownNode | null
  firstChild: TurndownNode | null
  lastChild: TurndownNode | null
  childNodes: NodeListOf<ChildNode>
  textContent: string | null
  outerHTML: string
  cloneNode(deep?: boolean): TurndownNode
}

export interface TurndownOptions {
  preformattedCode?: boolean
}

export default function TurndownNode(node: any, options: TurndownOptions): TurndownNode {
  const n = node as TurndownNode
  n.isBlock = isBlock(node)
  n.isCode = node.nodeName === 'CODE' || (node.parentNode && node.parentNode.isCode)
  n.isBlank = isBlank(node)
  n.flankingWhitespace = flankingWhitespace(n, options)
  return n
}

function isBlank(node: any): boolean {
  return (
    !isVoid(node) &&
    !isMeaningfulWhenBlank(node) &&
    /^\s*$/i.test(node.textContent) &&
    !hasVoid(node) &&
    !hasMeaningfulWhenBlank(node)
  )
}

function flankingWhitespace(node: TurndownNode, options: TurndownOptions): { leading: string; trailing: string } {
  if (node.isBlock || (options.preformattedCode && node.isCode)) {
    return { leading: '', trailing: '' }
  }

  const edges = edgeWhitespace(node.textContent || '')

  // abandon leading ASCII WS if left-flanked by ASCII WS
  if (edges.leadingAscii && isFlankedByWhitespace('left', node, options)) {
    edges.leading = edges.leadingNonAscii
  }

  // abandon trailing ASCII WS if right-flanked by ASCII WS
  if (edges.trailingAscii && isFlankedByWhitespace('right', node, options)) {
    edges.trailing = edges.trailingNonAscii
  }

  return { leading: edges.leading, trailing: edges.trailing }
}

function edgeWhitespace(string: string): {
  leading: string
  leadingAscii: string
  leadingNonAscii: string
  trailing: string
  trailingNonAscii: string
  trailingAscii: string
} {
  const m = string.match(/^(([ \t\r\n]*)(\s*))(?:(?=\S)[\s\S]*\S)?((\s*?)([ \t\r\n]*))$/)
  if (!m) {
    return {
      leading: '',
      leadingAscii: '',
      leadingNonAscii: '',
      trailing: '',
      trailingNonAscii: '',
      trailingAscii: ''
    }
  }
  return {
    leading: m[1],
    leadingAscii: m[2],
    leadingNonAscii: m[3],
    trailing: m[4],
    trailingNonAscii: m[5],
    trailingAscii: m[6]
  }
}

function isFlankedByWhitespace(side: 'left' | 'right', node: TurndownNode, options: TurndownOptions): boolean {
  let sibling: TurndownNode | null
  let regExp: RegExp

  if (side === 'left') {
    sibling = node.previousSibling
    regExp = / $/
  } else {
    sibling = node.nextSibling
    regExp = /^ /
  }

  if (sibling) {
    if (sibling.nodeType === 3) {
      return regExp.test(sibling.nodeValue || '')
    } else if (options.preformattedCode && sibling.nodeName === 'CODE') {
      return false
    } else if (sibling.nodeType === 1 && !isBlock(sibling)) {
      return regExp.test(sibling.textContent || '')
    }
  }
  return false
}
