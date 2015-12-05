import CursorPosition = require('./CursorPosition')

interface CursorRange {
    start: CursorPosition;
    end: CursorPosition;
}

export = CursorRange;