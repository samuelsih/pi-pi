import collapseWhitespace from './collapse-whitespace'
import HTMLParser from './html-parser'
import { isBlock, isVoid } from './utilities'

export default function RootNode(input: string | Node, options: { preformattedCode?: boolean }): any {
  let root: any
  if (typeof input === 'string') {
    const parser = new HTMLParser()
    const doc = parser.parseFromString(
      // DOM parsers arrange elements in the <head> and <body>.
      // Wrapping in a custom element ensures elements are reliably arranged in
      // a single element.
      '<x-turndown id="turndown-root">' + input + '</x-turndown>',
      'text/html'
    )
    root = doc.getElementById('turndown-root')
  } else {
    root = (input as Node).cloneNode(true)
  }
  collapseWhitespace({
    element: root,
    isBlock,
    isVoid,
    isPre: options.preformattedCode ? isPreOrCode : null
  })

  return root
}

function isPreOrCode(node: any): boolean {
  return node.nodeName === 'PRE' || node.nodeName === 'CODE'
}
