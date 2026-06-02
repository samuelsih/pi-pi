/*
 * Parsing HTML strings - uses vendored domino for Node.js environment
 */

// Use require for CommonJS domino module (jiti handles this interop)
const domino = require('../domino/index.js')

function createHTMLParser(): { new(): { parseFromString(string: string, mimeType: string): Document } } {
  const Parser = function (this: any) {} as any

  Parser.prototype.parseFromString = function (string: string): Document {
    return domino.createDocument(string)
  }

  return Parser
}

export default createHTMLParser()
