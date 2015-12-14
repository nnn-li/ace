"use strict";

import Editor from "./Editor";
import EditSession from "./EditSession";
import Position from "./Position";
import Range from "./Range";
import Tokenizer from "./Tokenizer";
import WorkerClient from "./worker/WorkerClient";
import FoldMode from "./mode/folding/FoldMode"

/**
 * @class LanguageMode
 */
interface LanguageMode {

    /**
     * @property $id
     * @type string
     */
    $id: string;

    /**
     * @property indentWithTabs
     * @type boolean
     */
    $indentWithTabs: boolean;

    /**
     * @property foldingRules
     * @type FoldMode
     */
    foldingRules: FoldMode;
    modes: LanguageMode[];
    nonTokenRe: RegExp;
    tokenRe: RegExp;
    autoOutdent(state: string, session: EditSession, row: number): number;
    checkOutdent(state: string, line: string, text: string): boolean;
    createWorker(session: EditSession): WorkerClient;
    getCompletions(state: string, session: EditSession, pos, prefix);
    getMatching(session: EditSession): Range;
    getNextLineIndent(state: string, line: string, tab: string): string;
    getTokenizer(): Tokenizer;
    toggleCommentLines(state: string, session: EditSession, startRow: number, endRow: number);
    toggleBlockComment(state: string, session: EditSession, range: Range, cursor: Position);
    transformAction(state: string, action: string, editor: Editor, session: EditSession, param: string | Range);
}

export default LanguageMode;