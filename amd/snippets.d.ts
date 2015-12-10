import EventEmitterClass from "./lib/event_emitter";
import Editor from './Editor';
export declare class SnippetManager extends EventEmitterClass {
    snippetMap: {};
    private snippetNameMap;
    private variables;
    constructor();
    private static $tokenizer;
    private getTokenizer();
    private tokenizeTmSnippet(str, startState?);
    private $getDefaultValue(editor, name);
    private getVariableValue(editor, varName);
    tmStrFormat(str: any, ch: any, editor?: any): any;
    private resolveVariables(snippet, editor);
    private insertSnippetForSelection(editor, snippetText);
    insertSnippet(editor: Editor, snippetText: any, unused?: any): void;
    private $getScope(editor);
    getActiveScopes(editor: Editor): string[];
    expandWithTab(editor: Editor, options?: any): boolean;
    private expandSnippetForSelection(editor, options);
    private findMatchingSnippet(snippetList, before, after);
    register(snippets: any, scope: any): void;
    private unregister(snippets, scope?);
    parseSnippetFile(str: any): any[];
    private getSnippetByName(name, editor);
}
export declare var snippetManager: SnippetManager;
