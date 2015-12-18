//
// ace.d.ts
//
// This file was created manually in order to support the Ace library.
// These declarations are appropriate wne using the library through a system loader.
// These declarations are appropriate when using the library through the global
// variable, 'Ace'.
//

/**
 * Browser Code Editor targeting ES6 written in TypeScript.
 * The name 'Ace' will be reported in compiler diagnostics.
 * e.g. Module 'Ace' has no exported member ...
 */
declare module Ace {

    class Document {
        constructor(text: string | string[]);
    }

    class EditSession {
        constructor(doc: Document);
        setMode(modeName: string): void;
        setUndoManager(undoManager: UndoManager): void;
    }

    class Editor {
        container: HTMLElement;
        constructor(renderer: VirtualRenderer, session: EditSession);
        getSession(): EditSession;
        on(eventName: string, callback): void;
        resize(force?: boolean): void;
        setFontSize(fontSize: string): void;
    }

    class Range {
        constructor(startRow: number, startColumn: number, endRow: number, endColumn);
    }

    class UndoManager {
        constructor();
    }

    class VirtualRenderer {
        constructor(container: HTMLElement);
        addCssClass(cssClass: string): void;
        setPadding(padding: number): void;
        setThemeCss(cssClass: string, href: string): void;
    }
}

// This is the AMD module name.
declare module 'ace'
{
    export default Ace;
}
