import Range from "./Range";

export default class OrientedRange extends Range {
    public cursor;
    public desiredColumn;
    constructor(startRow: number, startColumn: number, endRow: number, endColumn: number, cursor, desiredColumn) {
        super(startRow, startColumn, endRow, endColumn);
        this.cursor = cursor;
        this.desiredColumn = desiredColumn;
    }
}
