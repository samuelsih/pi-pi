/**
 * The collapseWhitespace function is adapted from collapse-whitespace
 * by Luc Thevenard.
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Luc Thevenard <lucthevenard@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

interface CollapseWhitespaceOptions {
  element: any
  isBlock: (node: any) => boolean
  isVoid: (node: any) => boolean
  isPre?: ((node: any) => boolean) | null
}

/**
 * collapseWhitespace(options) removes extraneous whitespace from an the given element.
 */
function collapseWhitespace(options: CollapseWhitespaceOptions): void {
  const element = options.element
  const isBlock = options.isBlock
  const isVoid = options.isVoid
  const isPre = options.isPre || function (node: any): boolean {
    return node.nodeName === 'PRE'
  }

  if (!element.firstChild || isPre(element)) return

  let prevText: any = null
  let keepLeadingWs = false

  let prev: any = null
  let node = next(prev, element, isPre)

  while (node !== element) {
    if (node.nodeType === 3 || node.nodeType === 4) { // Node.TEXT_NODE or Node.CDATA_SECTION_NODE
      let text = node.data.replace(/[ \r\n\t]+/g, ' ')

      if ((!prevText || / $/.test(prevText.data)) &&
          !keepLeadingWs && text[0] === ' ') {
        text = text.substr(1)
      }

      // `text` might be empty at this point.
      if (!text) {
        node = remove(node)
        continue
      }

      node.data = text

      prevText = node
    } else if (node.nodeType === 1) { // Node.ELEMENT_NODE
      if (isBlock(node) || node.nodeName === 'BR') {
        if (prevText) {
          prevText.data = prevText.data.replace(/ $/, '')
        }

        prevText = null
        keepLeadingWs = false
      } else if (isVoid(node) || isPre(node)) {
        // Avoid trimming space around non-block, non-BR void elements and inline PRE.
        prevText = null
        keepLeadingWs = true
      } else if (prevText) {
        // Drop protection if set previously.
        keepLeadingWs = false
      }
    } else {
      node = remove(node)
      continue
    }

    const nextNode = next(prev, node, isPre)
    prev = node
    node = nextNode
  }

  if (prevText) {
    prevText.data = prevText.data.replace(/ $/, '')
    if (!prevText.data) {
      remove(prevText)
    }
  }
}

/**
 * remove(node) removes the given node from the DOM and returns the
 * next node in the sequence.
 */
function remove(node: any): any {
  const nextNode = node.nextSibling || node.parentNode

  node.parentNode.removeChild(node)

  return nextNode
}

/**
 * next(prev, current, isPre) returns the next node in the sequence, given the
 * current and previous nodes.
 */
function next(prev: any, current: any, isPre: (node: any) => boolean): any {
  if ((prev && prev.parentNode === current) || isPre(current)) {
    return current.nextSibling || current.parentNode
  }

  return current.firstChild || current.nextSibling || current.parentNode
}

export default collapseWhitespace
