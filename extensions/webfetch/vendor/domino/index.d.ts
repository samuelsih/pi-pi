declare module "../domino/index.js" {
  function createDOMImplementation(): DOMImplementation;
  function createDocument(html?: string, force?: boolean): Document;
  function createWindow(html?: string, address?: string): Window;
  
  const _default: {
    createDOMImplementation: typeof createDOMImplementation;
    createDocument: typeof createDocument;
    createWindow: typeof createWindow;
  };
  export default _default;
}
