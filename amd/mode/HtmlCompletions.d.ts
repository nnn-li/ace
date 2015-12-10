import EditSession from "../EditSession";
export default class HtmlCompletions {
    constructor();
    getCompletions(state: string, session: EditSession, pos: {
        row: number;
        column: number;
    }, prefix: string): any;
    getTagCompletions(state: string, session: EditSession, pos: {
        row: number;
        column: number;
    }, prefix: string): {
        value: string;
        meta: string;
        score: number;
    }[];
    getAttributeCompetions(state: string, session: EditSession, pos: {
        row: number;
        column: number;
    }, prefix: string): {
        caption: string;
        snippet: string;
        meta: string;
        score: number;
    }[];
}
