import COMMONMARK_RULES from './commonmark-rules'
import Rules from './rules'
import type { Rule, TurndownOptions } from './rules'
import { escapeMarkdown, extend, trimLeadingNewlines, trimTrailingNewlines } from './utilities'
import RootNode from './root-node'
import TurndownNodeWrapper from './node'

const reduce = Array.prototype.reduce

interface TurndownServiceOptions {
  headingStyle?: 'setext' | 'atx'
  hr?: string
  bulletListMarker?: '-' | '*' | '+'
  codeBlockStyle?: 'indented' | 'fenced'
  fence?: string
  emDelimiter?: '_' | '*'
  strongDelimiter?: '__' | '**'
  linkStyle?: 'inlined' | 'referenced'
  linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut'
  br?: string
  preformattedCode?: boolean
  blankReplacement?: (content: string, node: any) => string
  keepReplacement?: (content: string, node: any) => string
  defaultReplacement?: (content: string, node: any) => string
}

export default class TurndownService {
  options: TurndownOptions
  rules: Rules

  constructor(options?: TurndownServiceOptions) {
    const defaults: TurndownOptions = {
      rules: COMMONMARK_RULES,
      headingStyle: 'setext',
      hr: '* * *',
      bulletListMarker: '*',
      codeBlockStyle: 'indented',
      fence: '```',
      emDelimiter: '_',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full',
      br: '  ',
      preformattedCode: false,
      blankReplacement: function (content: string, node: any): string {
        return node.isBlock ? '\n\n' : ''
      },
      keepReplacement: function (content: string, node: any): string {
        return node.isBlock ? '\n\n' + node.outerHTML + '\n\n' : node.outerHTML
      },
      defaultReplacement: function (content: string, node: any): string {
        return node.isBlock ? '\n\n' + content + '\n\n' : content
      }
    }
    this.options = extend({}, defaults, options || {}) as TurndownOptions
    this.rules = new Rules(this.options)
  }

  /**
   * The entry point for converting a string or DOM node to Markdown
   */
  turndown(input: string | Node): string {
    if (!canConvert(input)) {
      throw new TypeError(
        input + ' is not a string, or an element/document/fragment node.'
      )
    }

    if (input === '') return ''

    const output = processNode.call(this, new RootNode(input, this.options))
    return postProcess.call(this, output)
  }

  /**
   * Add one or more plugins
   */
  use(plugin: ((service: TurndownService) => void) | ((service: TurndownService) => void)[]): TurndownService {
    if (Array.isArray(plugin)) {
      for (let i = 0; i < plugin.length; i++) this.use(plugin[i])
    } else if (typeof plugin === 'function') {
      plugin(this)
    } else {
      throw new TypeError('plugin must be a Function or an Array of Functions')
    }
    return this
  }

  /**
   * Adds a rule
   */
  addRule(key: string, rule: Rule): TurndownService {
    this.rules.add(key, rule)
    return this
  }

  /**
   * Keep a node (as HTML) that matches the filter
   */
  keep(filter: string | string[] | ((node: any, options: TurndownOptions) => boolean)): TurndownService {
    this.rules.keep(filter)
    return this
  }

  /**
   * Remove a node that matches the filter
   */
  remove(filter: string | string[] | ((node: any, options: TurndownOptions) => boolean)): TurndownService {
    this.rules.remove(filter)
    return this
  }

  /**
   * Escapes Markdown syntax
   */
  escape(string: string): string {
    return escapeMarkdown(string)
  }
}

/**
 * Reduces a DOM node down to its Markdown string equivalent
 */
function processNode(this: TurndownService, parentNode: any): string {
  const self = this
  return reduce.call(parentNode.childNodes, function (output: string, node: any) {
    node = new TurndownNodeWrapper(node, self.options)

    let replacement = ''
    if (node.nodeType === 3) {
      replacement = node.isCode ? node.nodeValue : self.escape(node.nodeValue)
    } else if (node.nodeType === 1) {
      replacement = replacementForNode.call(self, node)
    }

    return join(output, replacement)
  }, '')
}

/**
 * Appends strings as each rule requires and trims the output
 */
function postProcess(this: TurndownService, output: string): string {
  const self = this
  this.rules.forEach(function (rule: Rule) {
    if (typeof rule.append === 'function') {
      output = join(output, rule.append(self.options))
    }
  })

  return output.replace(/^[\t\r\n]+/, '').replace(/[\t\r\n\s]+$/, '')
}

/**
 * Converts an element node to its Markdown equivalent
 */
function replacementForNode(this: TurndownService, node: any): string {
  const rule = this.rules.forNode(node)
  let content = processNode.call(this, node)
  const whitespace = node.flankingWhitespace
  if (whitespace.leading || whitespace.trailing) content = content.trim()
  return (
    whitespace.leading +
    rule.replacement(content, node, this.options) +
    whitespace.trailing
  )
}

/**
 * Joins replacement to the current output with appropriate number of new lines
 */
function join(output: string, replacement: string): string {
  const s1 = trimTrailingNewlines(output)
  const s2 = trimLeadingNewlines(replacement)
  const nls = Math.max(output.length - s1.length, replacement.length - s2.length)
  const separator = '\n\n'.substring(0, nls)

  return s1 + separator + s2
}

/**
 * Determines whether an input can be converted
 */
function canConvert(input: any): boolean {
  return (
    input != null && (
      typeof input === 'string' ||
      (input.nodeType && (
        input.nodeType === 1 || input.nodeType === 9 || input.nodeType === 11
      ))
    )
  )
}
