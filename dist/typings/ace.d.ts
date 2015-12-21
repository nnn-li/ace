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

    interface Annotation {

        /**
         *
         */
        html?: string;

        /**
         *
         */
        row: number;

        /**
         *
         */
        column?: number;

        /**
         *
         */
        text: string;
        /**
         * "error", "info", or "warning".
         */
        type: string;
    }

    interface Command {
    }

    class Document implements EventBus<Document> {
        constructor(text: string | string[]);
        on(eventName: string, callback: (event: any, source: Document) => any, capturing?: boolean): void;
        off(eventName: string, callback: (event: any, source: Document) => any): void;
    }

    class EditSession implements EventBus<EditSession> {
        constructor(doc: Document);
        clearAnnotations(): void;
        getDocument(): Document;
        on(eventName: string, callback: (event: any, source: EditSession) => any, capturing?: boolean): void;
        off(eventName: string, callback: (event: any, source: EditSession) => any): void;
        setAnnotations(annotations: Annotation[]): void;
        setLanguageMode(mode: LanguageMode): void;
        setMode(modeName: string): void;
        setUndoManager(undoManager: UndoManager): void;
    }

    class Editor implements EventBus<Editor> {
        container: HTMLElement;
        constructor(renderer: VirtualRenderer, session: EditSession);
        blockIndent(): void;
        clearSelection(): void;
        getCursorPosition(): Position;
        getCursorPositionScreen(): Position;
        getFontSize(): string;
        getKeyboardHandler(): HashHandler;
        getSelectionRange(): Range;
        getSession(): EditSession;
        getValue(): string;
        indent(): void;
        insert(text: string, pasted?: boolean): void;
        jumpToMatching(select: boolean);
        moveCursorToPosition(position: Position): void;
        on(eventName: string, callback: (event: any, source: Editor) => any, capturing?: boolean): void;
        off(eventName: string, callback: (event: any, source: Editor) => any): void;
        remove(direction: string);
        resize(force?: boolean): void;
        selectAll(): void;
        setFontSize(fontSize: string): void;
        setKeyboardHandler(keyboardHandler: string | HashHandler): void;
        setSession(session: EditSession): void;
        setValue(text: string, cursorPos?: number): void;
        splitLine(): void;
        toggleBlockComment(): void;
        toggleCommentLines(): void;
    }

    interface EventBus<T> {
        on(eventName: string, callback: (event: any, source: T) => any, capturing?: boolean): void;
        off(eventName: string, callback: (event: any, source: T) => any): void;
    }

    class HashHandler {
        constructor(config?: {}, platform?: string);
        addCommand(command: Command): void;
    }

    interface LanguageMode {
    }

    interface Position {

    }

    class Range {
        constructor(startRow: number, startColumn: number, endRow: number, endColumn);
    }

    class UndoManager {
        constructor();
    }

    class VirtualRenderer implements EventBus<VirtualRenderer> {
        constructor(container: HTMLElement);
        addCssClass(cssClass: string): void;
        setPadding(padding: number): void;
        setThemeCss(cssClass: string, href: string): void;
        on(eventName: string, callback: (event: MessageEvent, source: VirtualRenderer) => any): void;
        off(eventName: string, callback: (event: MessageEvent, source: VirtualRenderer) => any): void;
    }

    class WorkerClient implements EventBus<WorkerClient> {
        constructor(workerUrl: string);
        attachToDocument(doc: Document): void;
        init(scriptImports: string[], moduleName: string, className: string): void;
        on(eventName: string, callback: (event: MessageEvent, source: WorkerClient) => any): void;
        off(eventName: string, callback: (event: MessageEvent, source: WorkerClient) => any): void;
    }

    class CssMode extends TextMode {
        constructor(workerUrl: string, scriptImports: string[]);
    }

    class HtmlMode extends TextMode {
        constructor(workerUrl: string, scriptImports: string[]);
    }

    class TextMode implements LanguageMode {
        protected workerUrl: string;
        protected scriptImports: string[];
        constructor(workerUrl: string, scriptImports: string[]);
    }

    class JavaScriptMode extends TextMode {
        constructor(workerUrl: string, scriptImports: string[]);
    }

    class TypeScriptMode extends TextMode {
        constructor(workerUrl: string, scriptImports: string[]);
    }
}

// This is the AMD module name.
declare module 'ace'
{
    export default Ace;
}
