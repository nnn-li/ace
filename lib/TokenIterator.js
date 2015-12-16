"use strict";
export default class TokenIterator {
    constructor(session, initialRow, initialColumn) {
        this.session = session;
        this.$row = initialRow;
        this.$rowTokens = session.getTokens(initialRow);
        var token = session.getTokenAt(initialRow, initialColumn);
        this.$tokenIndex = token ? token.index : -1;
    }
    stepBackward() {
        this.$tokenIndex -= 1;
        while (this.$tokenIndex < 0) {
            this.$row -= 1;
            if (this.$row < 0) {
                this.$row = 0;
                return null;
            }
            this.$rowTokens = this.session.getTokens(this.$row);
            this.$tokenIndex = this.$rowTokens.length - 1;
        }
        return this.$rowTokens[this.$tokenIndex];
    }
    stepForward() {
        this.$tokenIndex += 1;
        var rowCount;
        while (this.$tokenIndex >= this.$rowTokens.length) {
            this.$row += 1;
            if (!rowCount) {
                rowCount = this.session.getLength();
            }
            if (this.$row >= rowCount) {
                this.$row = rowCount - 1;
                return null;
            }
            this.$rowTokens = this.session.getTokens(this.$row);
            this.$tokenIndex = 0;
        }
        return this.$rowTokens[this.$tokenIndex];
    }
    getCurrentToken() {
        return this.$rowTokens[this.$tokenIndex];
    }
    getCurrentTokenRow() {
        return this.$row;
    }
    getCurrentTokenColumn() {
        var rowTokens = this.$rowTokens;
        var tokenIndex = this.$tokenIndex;
        var column = rowTokens[tokenIndex].start;
        if (column !== undefined)
            return column;
        column = 0;
        while (tokenIndex > 0) {
            tokenIndex -= 1;
            column += rowTokens[tokenIndex].value.length;
        }
        return column;
    }
}