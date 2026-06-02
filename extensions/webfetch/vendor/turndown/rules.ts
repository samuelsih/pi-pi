/**
 * Manages a collection of rules used to convert HTML to Markdown
 */

export interface Rule {
  filter: string | string[] | ((node: any, options: TurndownOptions) => boolean)
  replacement: (content: string, node: any, options: TurndownOptions) => string
  append?: (options: TurndownOptions) => string
  references?: string[]
}

export interface TurndownOptions {
  rules: Record<string, Rule>
  headingStyle: 'setext' | 'atx'
  hr: string
  bulletListMarker: '-' | '*' | '+'
  codeBlockStyle: 'indented' | 'fenced'
  fence: string
  emDelimiter: '_' | '*'
  strongDelimiter: '__' | '**'
  linkStyle: 'inlined' | 'referenced'
  linkReferenceStyle: 'full' | 'collapsed' | 'shortcut'
  br: string
  preformattedCode: boolean
  blankReplacement: (content: string, node: any) => string
  keepReplacement: (content: string, node: any) => string
  defaultReplacement: (content: string, node: any) => string
}

export default class Rules {
  options: TurndownOptions
  _keep: Rule[]
  _remove: Rule[]
  blankRule: { replacement: (content: string, node: any) => string }
  keepReplacement: (content: string, node: any) => string
  defaultRule: { replacement: (content: string, node: any) => string }
  array: Rule[]

  constructor(options: TurndownOptions) {
    this.options = options
    this._keep = []
    this._remove = []

    this.blankRule = {
      replacement: options.blankReplacement
    }

    this.keepReplacement = options.keepReplacement

    this.defaultRule = {
      replacement: options.defaultReplacement
    }

    this.array = []
    for (const key in options.rules) this.array.push(options.rules[key])
  }

  add(key: string, rule: Rule): void {
    this.array.unshift(rule)
  }

  keep(filter: string | string[] | ((node: any, options: TurndownOptions) => boolean)): void {
    this._keep.unshift({
      filter,
      replacement: this.keepReplacement
    })
  }

  remove(filter: string | string[] | ((node: any, options: TurndownOptions) => boolean)): void {
    this._remove.unshift({
      filter,
      replacement: function () {
        return ''
      }
    })
  }

  forNode(node: any): { replacement: (content: string, node: any, options?: TurndownOptions) => string } {
    if (node.isBlank) return this.blankRule
    let rule: Rule | undefined

    if ((rule = findRule(this.array, node, this.options))) return rule
    if ((rule = findRule(this._keep, node, this.options))) return rule
    if ((rule = findRule(this._remove, node, this.options))) return rule

    return this.defaultRule
  }

  forEach(fn: (rule: Rule, index: number) => void): void {
    for (let i = 0; i < this.array.length; i++) fn(this.array[i], i)
  }
}

function findRule(rules: Rule[], node: any, options: TurndownOptions): Rule | undefined {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    if (filterValue(rule, node, options)) return rule
  }
  return undefined
}

function filterValue(rule: Rule, node: any, options: TurndownOptions): boolean {
  const filter = rule.filter
  if (typeof filter === 'string') {
    if (filter === node.nodeName.toLowerCase()) return true
  } else if (Array.isArray(filter)) {
    if (filter.indexOf(node.nodeName.toLowerCase()) > -1) return true
  } else if (typeof filter === 'function') {
    if (filter.call(rule, node, options)) return true
  } else {
    throw new TypeError('`filter` needs to be a string, array, or function')
  }
  return false
}
