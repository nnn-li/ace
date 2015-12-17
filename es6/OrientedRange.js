"use strict";
import Range from "./Range";
export default class OrientedRange extends Range {
    constructor(startRow, startColumn, endRow, endColumn, cursor, desiredColumn) {
        super(startRow, startColumn, endRow, endColumn);
        this.cursor = cursor;
        this.desiredColumn = desiredColumn;
    }
}
