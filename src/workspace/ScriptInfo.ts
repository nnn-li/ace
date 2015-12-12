
export default class ScriptInfo {
    fileName: string;
    content: string;
    version: number;
    editRanges: { length: number; textChangeRange: ts.TextChangeRange }[];
    lineMap;
    constructor(fileName: string, content: string) {
        this.fileName = fileName;
        this.version = 1;
        this.editRanges = [];
        this.setContent(content);
    }

    setContent(content: string): void {
        this.content = content;
        this.lineMap = null;
    }

    getLineMap = function() {
        if (!this.lineMap) {
//            this.lineMap = LineMap1.fromString(this.content);
        }
        return this.lineMap;
    }

    updateContent(content: string) {
        this.editRanges = [];
        this.setContent(content);
        this.version++;
    }

    editContent(minChar: number, limChar: number, newText: string) {
        // Apply edits
        var prefix: string = this.content.substring(0, minChar);
        var middle: string = newText;
        var suffix: string = this.content.substring(limChar);
        this.setContent(prefix + middle + suffix);

        // Store edit range and the length of the script.
        var length: number = this.content.length;
//        var range = new ts.TextChangeRange(TextSpan.fromBounds(minChar, limChar), newText.length);

//        this.editRanges.push({ 'length': length, 'textChangeRange': range });

        // Bump the version.
        this.version++;
    }

    getTextChangeRangeSinceVersion(version) {
        if (this.version === version) {
            // No edits.
//            return ts.TextChangeRange.unchanged;
        }

        var initialEditRangeIndex = this.editRanges.length - (this.version - version);

        var entries = this.editRanges.slice(initialEditRangeIndex);

//        return ts.TextChangeRange.collapseChangesAcrossMultipleVersions(entries.map(function(e) {
//            return e.textChangeRange;
//        }));
    }
}