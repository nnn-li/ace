import EditSession from "../EditSession";
import Range from "../Range";
/**
 * Utility service fo
 */
export default class BracketMatch {
    /**
     * Maps an opening(closing) bracket string to the corresponding closing(opening) bracket.
     */
    private $brackets;
    private $host;
    constructor(host: EditSession);
    findMatchingBracket(position: {
        row: number;
        column: number;
    }, chr: string): {
        row: number;
        column: number;
    };
    getBracketRange(pos: {
        row: number;
        column: number;
    }): Range;
    $findOpeningBracket(bracket: string, position: {
        row: number;
        column: number;
    }, typeRe?: RegExp): {
        row: number;
        column: number;
    };
    $findClosingBracket(bracket: string, position: {
        row: number;
        column: number;
    }, typeRe?: RegExp): {
        row: number;
        column: number;
    };
}
