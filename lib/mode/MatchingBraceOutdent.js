"use strict";
import Range from "../Range";
export default class MatchingBraceOutdent {
    constructor() {
    }
    checkOutdent(line, text) {
        if (!/^\s+$/.test(line)) {
            return false;
        }
        return /^\s*\}/.test(text);
    }
    autoOutdent(session, row) {
        var line = session.getLine(row);
        var match = line.match(/^(\s*\})/);
        if (!match)
            return 0;
        var column = match[1].length;
        var openBracePos = session.findMatchingBracket({ row: row, column: column });
        if (!openBracePos || openBracePos.row == row)
            return 0;
        var indent = this.$getIndent(session.getLine(openBracePos.row));
        session.replace(new Range(row, 0, row, column - 1), indent);
    }
    $getIndent(line) {
        return line.match(/^\s*/)[0];
    }
}
