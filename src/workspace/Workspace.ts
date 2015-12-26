import Completion from '../Completion';
import Delta from '../Delta';
import Marker from '../Marker';
import Editor from '../Editor';
import EditorPosition from './EditorPosition';

export default class Workspace {

    private editors: { [fileName: string]: Editor } = {};
    private refMarkers: number[] = [];
    private errorMarkers: number[] = [];

    constructor() {
        console.log("Workspace constructor");
    }

    putEditor(fileName: string, editor: Editor): void {
        this.editors[fileName] = editor;
    }

    editScript(fileName: string, start: number, end: number, text: string) {
        console.log(`Workspace.editScript(${fileName}) (TODO)`);
    }

    getCompletionsAtPosition(fileName: string, position: number, memberMode: boolean): Promise<Completion[]> {
        throw new Error("TODO");
    }

    /**
     * Updates the file in the workspace using the (captured) fileName and change event.
     */
    updateWorkspaceFile(fileName: string, delta: Delta): void {
        var editor = this.editors[fileName];
        var action = delta.action;
        var range = delta.range;
        var end: number;
        var start: number = EditorPosition.getPositionChars(editor, range.start);
        if (action === "insertText") {
            this.editScript(fileName, start, start, delta.text);
        }
        else if (action === "removeText") {
            end = start + delta.text.length;
            this.editScript(fileName, start, end, "");
        }
        else if (action === "insertLines") {
            var text = delta.lines.map(function(line) { return line + '\n'; }).join('');
            this.editScript(fileName, start, start, text);
        }
        else if (action === "removeLines") {
            var len = EditorPosition.getLinesChars(delta.lines);
            end = start + len;
            this.editScript(fileName, start, end, "");
        }
        else {
            console.warn(`updateWorkspaceFile(${fileName}, ${JSON.stringify(delta)})`);
        }
    }

    updateMarkerModels(fileName: string, delta: Delta): void {
        var editor = this.editors[fileName];
        var action = delta.action;
        var range = delta.range;
        var markers: { [id: number]: Marker } = editor.getSession().getMarkers(true);
        var line_count = 0;
        var isNewLine = editor.getSession().getDocument().isNewLine;
        if (action === "insertText") {
            if (isNewLine(delta.text)) {
                line_count = 1;
            }
        }
        else if (action === "insertLines") {
            line_count = delta.lines.length;
        }
        else if (action === "removeText") {
            if (isNewLine(delta.text)) {
                line_count = -1;
            }
        }
        else if (action === "removeLines") {
            line_count = -delta.lines.length;
        }
        else {
            console.warn(`updateMarkerModels(${fileName}, ${JSON.stringify(delta)})`);
        }
        if (line_count !== 0) {
            var markerUpdate = function(id: number) {
                var marker: Marker = markers[id];
                var row = range.start.row;
                if (line_count > 0) {
                    row = +1;
                }
                if (marker && marker.range.start.row > row) {
                    marker.range.start.row += line_count;
                    marker.range.end.row += line_count;
                }
            };
            this.errorMarkers.forEach(markerUpdate);
            this.refMarkers.forEach(markerUpdate);
            editor.updateFrontMarkers();
        }
    }
}