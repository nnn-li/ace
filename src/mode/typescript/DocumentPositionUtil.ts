import EditorDocument from '../../EditorDocument';

export function getLinesChars(lines: string[]): number {
    var count = 0;
    lines.forEach(function(line) {
        count += line.length + 1;
        return;
    });
    return count;
}

export function getChars(doc: EditorDocument, pos: { row: number; column: number }): number {
    return getLinesChars(doc.getLines(0, pos.row - 1)) + pos.column;
};

export function getPosition(doc: EditorDocument, chars: number): { row: number; column: number } {
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
};
