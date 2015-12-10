import Tokenizer from "../Tokenizer";
import Behaviour from "./Behaviour";
import Range from "../Range";
import EditSession from '../EditSession';
import Editor from '../Editor';
import WorkerClient from "../worker/WorkerClient";
/**
 * @class Mode
 */
export default class Mode {
    /**
     * Used when loading snippets for zero or more modes?
     */
    modes: Mode[];
    protected HighlightRules: any;
    protected $behaviour: Behaviour;
    tokenRe: RegExp;
    nonTokenRe: RegExp;
    protected lineCommentStart: any;
    protected blockComment: any;
    $id: string;
    private $tokenizer;
    private $highlightRules;
    private $keywordList;
    private $embeds;
    private $modes;
    private completionKeywords;
    $indentWithTabs: boolean;
    foldingRules: any;
    getMatching: (session: EditSession) => Range;
    constructor();
    getTokenizer(): Tokenizer;
    toggleCommentLines(state: any, session: EditSession, startRow: number, endRow: number): boolean;
    toggleBlockComment(state: any, session: EditSession, range: Range, cursor: {
        row: number;
        column: number;
    }): void;
    getNextLineIndent(state: string, line: string, tab: string): string;
    checkOutdent(state: string, line: string, text: string): boolean;
    autoOutdent(state: string, session: EditSession, row: number): number;
    $getIndent(line: string): string;
    createWorker(session: EditSession): WorkerClient;
    createModeDelegates(mapping: any): void;
    $delegator(method: any, args: any, defaultHandler: any): any;
    transformAction(state: any, action: any, editor: Editor, session: EditSession, param: any): any;
    getKeywords(append: boolean): any;
    $createKeywordList(): any;
    getCompletions(state: any, session: EditSession, pos: any, prefix: any): any;
}
