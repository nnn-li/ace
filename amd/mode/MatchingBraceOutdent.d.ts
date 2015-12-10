import EditSession from "../EditSession";
export default class MatchingBraceOutdent {
    constructor();
    checkOutdent(line: string, text: string): boolean;
    autoOutdent(session: EditSession, row: number): number;
    $getIndent(line: string): string;
}
