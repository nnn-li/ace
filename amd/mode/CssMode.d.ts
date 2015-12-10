import TextMode from "./Mode";
import MatchingBraceOutdent from "./MatchingBraceOutdent";
import WorkerClient from "../worker/WorkerClient";
import EditSession from "../EditSession";
export default class CssMode extends TextMode {
    $id: string;
    $outdent: MatchingBraceOutdent;
    blockComment: {
        start: string;
        end: string;
    };
    constructor();
    getNextLineIndent(state: string, line: string, tab: string): string;
    checkOutdent(state: string, line: string, text: string): boolean;
    autoOutdent(state: string, session: EditSession, row: number): number;
    createWorker(session: EditSession): WorkerClient;
}
