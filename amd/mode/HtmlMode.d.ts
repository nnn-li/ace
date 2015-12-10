import TextMode from "./Mode";
import HtmlCompletions from "./HtmlCompletions";
import WorkerClient from "../worker/WorkerClient";
import EditSession from "../EditSession";
/**
 * @class HtmlMode
 */
export default class HtmlMode extends TextMode {
    protected blockComment: {
        start: string;
        end: string;
    };
    private voidElements;
    $id: string;
    /**
     * The name of the element for fragment parsing.
     */
    private fragmentContext;
    $completer: HtmlCompletions;
    /**
     * @class HtmlMode
     * @constructor
     */
    constructor(options?: {
        fragmentContext: string;
    });
    getNextLineIndent(state: string, line: string, tab: string): string;
    checkOutdent(state: string, line: string, text: string): boolean;
    getCompletions(state: string, session: EditSession, pos: {
        row: number;
        column: number;
    }, prefix: string): any;
    createWorker(session: EditSession): WorkerClient;
}
