
    /**
     * Given the current `EditorRange`, this function converts those starting and ending points into screen positions, and then returns a new `EditorRange` object.
     * @param {EditSession} session The `EditSession` to retrieve coordinates from
     *
     *
     * @returns {EditorRange}
    **/
    function toScreenRange(session: esm.EditSession) {

        var screenPosStart = session.documentToScreenPosition(this.start.row, this.start.column);
        var screenPosEnd = session.documentToScreenPosition(this.end.row, this.end.column);

        return new Range(screenPosStart.row, screenPosStart.column, screenPosEnd.row, screenPosEnd.column);
    }
