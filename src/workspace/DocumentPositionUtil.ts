"use strict";

import Document from '../Document';
import Position from '../Position';

export function getLinesChars(lines: string[]): number {
    var count = 0;
    lines.forEach(function(line) {
        count += line.length + 1;
        return;
    });
    return count;
}

export function getChars(doc: Document, pos: Position): number {
    return getLinesChars(doc.getLines(0, pos.row - 1)) + pos.column;
}

export function getPosition(doc: Document, chars: number): Position {
    var i;
    var line: string;

    var lines: string[] = doc.getAllLines();
    var count = 0;
    var row = 0;

    for (i in lines) {
        line = lines[i];
        if (chars < (count + (line.length + 1))) {
            return { 'row': row, 'column': chars - count };
        }
        count += line.length + 1;
        row += 1;
    }
    return { 'row': row, 'column': chars - count };
}
