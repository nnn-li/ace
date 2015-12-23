"use strict";
import { stringRepeat, stringTrimLeft, stringTrimRight } from "../lib/lang";
import { loadModule } from "../config";
import Range from "../Range";
function bindKey(win, mac) {
    return { win: win, mac: mac };
}
var commands = [{
        name: "showSettingsMenu",
        bindKey: bindKey("Ctrl-,", "Command-,"),
        exec: function (editor) {
            loadModule("ace/ext/settings_menu", function (module) {
                module.init(editor);
                editor.showSettingsMenu();
            });
        },
        readOnly: true
    }, {
        name: "goToNextError",
        bindKey: bindKey("Alt-E", "Ctrl-E"),
        exec: function (editor) {
            loadModule("ace/ext/error_marker", function (module) {
                module.showErrorMarker(editor, 1);
            });
        },
        scrollIntoView: "animate",
        readOnly: true
    }, {
        name: "goToPreviousError",
        bindKey: bindKey("Alt-Shift-E", "Ctrl-Shift-E"),
        exec: function (editor) {
            loadModule("ace/ext/error_marker", function (module) {
                module.showErrorMarker(editor, -1);
            });
        },
        scrollIntoView: "animate",
        readOnly: true
    }, {
        name: "selectall",
        bindKey: bindKey("Ctrl-A", "Command-A"),
        exec: function (editor) { editor.selectAll(); },
        readOnly: true
    }, {
        name: "centerselection",
        bindKey: bindKey(null, "Ctrl-L"),
        exec: function (editor) { editor.centerSelection(); },
        readOnly: true
    }, {
        name: "gotoline",
        bindKey: bindKey("Ctrl-L", "Command-L"),
        exec: function (editor) {
            var line = parseInt(prompt("Enter line number:"), 10);
            if (!isNaN(line)) {
                editor.gotoLine(line);
            }
        },
        readOnly: true
    }, {
        name: "fold",
        bindKey: bindKey("Alt-L|Ctrl-F1", "Command-Alt-L|Command-F1"),
        exec: function (editor) { editor.session.toggleFold(false); },
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "unfold",
        bindKey: bindKey("Alt-Shift-L|Ctrl-Shift-F1", "Command-Alt-Shift-L|Command-Shift-F1"),
        exec: function (editor) { editor.session.toggleFold(true); },
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "toggleFoldWidget",
        bindKey: bindKey("F2", "F2"),
        exec: function (editor) { editor.session.toggleFoldWidget(); },
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "toggleParentFoldWidget",
        bindKey: bindKey("Alt-F2", "Alt-F2"),
        exec: function (editor) { editor.session.toggleFoldWidget(true); },
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "foldall",
        bindKey: bindKey("Ctrl-Alt-0", "Ctrl-Command-Option-0"),
        exec: function (editor) { editor.session.foldAll(); },
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "foldOther",
        bindKey: bindKey("Alt-0", "Command-Option-0"),
        exec: function (editor) {
            editor.session.foldAll();
            editor.session.unfold(editor.selection.getAllRanges());
        },
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "unfoldall",
        bindKey: bindKey("Alt-Shift-0", "Command-Option-Shift-0"),
        exec: function (editor) { editor.session.unfold(); },
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "findnext",
        bindKey: bindKey("Ctrl-K", "Command-G"),
        exec: function (editor) { editor.findNext(); },
        multiSelectAction: "forEach",
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "findprevious",
        bindKey: bindKey("Ctrl-Shift-K", "Command-Shift-G"),
        exec: function (editor) { editor.findPrevious(); },
        multiSelectAction: "forEach",
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "selectOrFindNext",
        bindKey: bindKey("Alt-K", "Ctrl-G"),
        exec: function (editor) {
            if (editor.selection.isEmpty()) {
                editor.selection.selectWord();
            }
            else {
                editor.findNext();
            }
        },
        readOnly: true
    }, {
        name: "selectOrFindPrevious",
        bindKey: bindKey("Alt-Shift-K", "Ctrl-Shift-G"),
        exec: function (editor) {
            if (editor.selection.isEmpty()) {
                editor.selection.selectWord();
            }
            else {
                editor.findPrevious();
            }
        },
        readOnly: true
    }, {
        name: "find",
        bindKey: bindKey("Ctrl-F", "Command-F"),
        exec: function (editor) {
            loadModule("ace/ext/searchbox", function (e) { e.Search(editor); });
        },
        readOnly: true
    }, {
        name: "overwrite",
        bindKey: bindKey("Insert", "Insert"),
        exec: function (editor) { editor.toggleOverwrite(); },
        readOnly: true
    }, {
        name: "selecttostart",
        bindKey: bindKey("Ctrl-Shift-Home", "Command-Shift-Up"),
        exec: function (editor) { editor.getSelection().selectFileStart(); },
        multiSelectAction: "forEach",
        readOnly: true,
        scrollIntoView: "animate",
        aceCommandGroup: "fileJump"
    }, {
        name: "gotostart",
        bindKey: bindKey("Ctrl-Home", "Command-Home|Command-Up"),
        exec: function (editor) { editor.navigateFileStart(); },
        multiSelectAction: "forEach",
        readOnly: true,
        scrollIntoView: "animate",
        aceCommandGroup: "fileJump"
    }, {
        name: "selectup",
        bindKey: bindKey("Shift-Up", "Shift-Up"),
        exec: function (editor) { editor.getSelection().selectUp(); },
        multiSelectAction: "forEach",
        readOnly: true
    }, {
        name: "golineup",
        bindKey: bindKey("Up", "Up|Ctrl-P"),
        exec: function (editor, args) { editor.navigateUp(args.times); },
        multiSelectAction: "forEach",
        readOnly: true
    }, {
        name: "selecttoend",
        bindKey: bindKey("Ctrl-Shift-End", "Command-Shift-Down"),
        exec: function (editor) { editor.getSelection().selectFileEnd(); },
        multiSelectAction: "forEach",
        readOnly: true,
        scrollIntoView: "animate",
        aceCommandGroup: "fileJump"
    }, {
        name: "gotoend",
        bindKey: bindKey("Ctrl-End", "Command-End|Command-Down"),
        exec: function (editor) { editor.navigateFileEnd(); },
        multiSelectAction: "forEach",
        readOnly: true,
        scrollIntoView: "animate",
        aceCommandGroup: "fileJump"
    }, {
        name: "selectdown",
        bindKey: bindKey("Shift-Down", "Shift-Down"),
        exec: function (editor) { editor.getSelection().selectDown(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "golinedown",
        bindKey: bindKey("Down", "Down|Ctrl-N"),
        exec: function (editor, args) { editor.navigateDown(args.times); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "selectwordleft",
        bindKey: bindKey("Ctrl-Shift-Left", "Option-Shift-Left"),
        exec: function (editor) { editor.getSelection().selectWordLeft(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "gotowordleft",
        bindKey: bindKey("Ctrl-Left", "Option-Left"),
        exec: function (editor) { editor.navigateWordLeft(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "selecttolinestart",
        bindKey: bindKey("Alt-Shift-Left", "Command-Shift-Left"),
        exec: function (editor) { editor.getSelection().selectLineStart(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "gotolinestart",
        bindKey: bindKey("Alt-Left|Home", "Command-Left|Home|Ctrl-A"),
        exec: function (editor) { editor.navigateLineStart(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "selectleft",
        bindKey: bindKey("Shift-Left", "Shift-Left"),
        exec: function (editor) { editor.getSelection().selectLeft(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "gotoleft",
        bindKey: bindKey("Left", "Left|Ctrl-B"),
        exec: function (editor, args) { editor.navigateLeft(args.times); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "selectwordright",
        bindKey: bindKey("Ctrl-Shift-Right", "Option-Shift-Right"),
        exec: function (editor) { editor.getSelection().selectWordRight(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "gotowordright",
        bindKey: bindKey("Ctrl-Right", "Option-Right"),
        exec: function (editor) { editor.navigateWordRight(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "selecttolineend",
        bindKey: bindKey("Alt-Shift-Right", "Command-Shift-Right"),
        exec: function (editor) { editor.getSelection().selectLineEnd(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "gotolineend",
        bindKey: bindKey("Alt-Right|End", "Command-Right|End|Ctrl-E"),
        exec: function (editor) { editor.navigateLineEnd(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "selectright",
        bindKey: bindKey("Shift-Right", "Shift-Right"),
        exec: function (editor) { editor.getSelection().selectRight(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "gotoright",
        bindKey: bindKey("Right", "Right|Ctrl-F"),
        exec: function (editor, args) { editor.navigateRight(args.times); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "selectpagedown",
        bindKey: "Shift-PageDown",
        exec: function (editor) { editor.selectPageDown(); },
        readOnly: true
    }, {
        name: "pagedown",
        bindKey: bindKey(null, "Option-PageDown"),
        exec: function (editor) { editor.scrollPageDown(); },
        readOnly: true
    }, {
        name: "gotopagedown",
        bindKey: bindKey("PageDown", "PageDown|Ctrl-V"),
        exec: function (editor) { editor.gotoPageDown(); },
        readOnly: true
    }, {
        name: "selectpageup",
        bindKey: "Shift-PageUp",
        exec: function (editor) { editor.selectPageUp(); },
        readOnly: true
    }, {
        name: "pageup",
        bindKey: bindKey(null, "Option-PageUp"),
        exec: function (editor) { editor.scrollPageUp(); },
        readOnly: true
    }, {
        name: "gotopageup",
        bindKey: "PageUp",
        exec: function (editor) { editor.gotoPageUp(); },
        readOnly: true
    }, {
        name: "scrollup",
        bindKey: bindKey("Ctrl-Up", null),
        exec: function (e) { e.renderer.scrollBy(0, -2 * e.renderer.layerConfig.lineHeight); },
        readOnly: true
    }, {
        name: "scrolldown",
        bindKey: bindKey("Ctrl-Down", null),
        exec: function (e) { e.renderer.scrollBy(0, 2 * e.renderer.layerConfig.lineHeight); },
        readOnly: true
    }, {
        name: "selectlinestart",
        bindKey: "Shift-Home",
        exec: function (editor) { editor.getSelection().selectLineStart(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "selectlineend",
        bindKey: "Shift-End",
        exec: function (editor) { editor.getSelection().selectLineEnd(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "togglerecording",
        bindKey: bindKey("Ctrl-Alt-E", "Command-Option-E"),
        exec: function (editor) { editor.commands.toggleRecording(editor); },
        readOnly: true
    }, {
        name: "replaymacro",
        bindKey: bindKey("Ctrl-Shift-E", "Command-Shift-E"),
        exec: function (editor) { editor.commands.replay(editor); },
        readOnly: true
    }, {
        name: "jumptomatching",
        bindKey: bindKey("Ctrl-P", "Ctrl-P"),
        exec: function (editor) { editor.jumpToMatching(); },
        multiSelectAction: "forEach",
        readOnly: true
    }, {
        name: "selecttomatching",
        bindKey: bindKey("Ctrl-Shift-P", "Ctrl-Shift-P"),
        exec: function (editor) { editor.jumpToMatching(true); },
        multiSelectAction: "forEach",
        readOnly: true
    }, {
        name: "passKeysToBrowser",
        bindKey: bindKey("null", "null"),
        exec: function () { },
        passEvent: true,
        readOnly: true
    },
    {
        name: "cut",
        exec: function (editor) {
            var range = editor.getSelectionRange();
            editor._emit("cut", range);
            if (!editor.selection.isEmpty()) {
                editor.session.remove(range);
                editor.clearSelection();
            }
        },
        scrollIntoView: "cursor",
        multiSelectAction: "forEach"
    }, {
        name: "removeline",
        bindKey: bindKey("Ctrl-D", "Command-D"),
        exec: function (editor) { editor.removeLines(); },
        scrollIntoView: "cursor",
        multiSelectAction: "forEachLine"
    }, {
        name: "duplicateSelection",
        bindKey: bindKey("Ctrl-Shift-D", "Command-Shift-D"),
        exec: function (editor) { editor.duplicateSelection(); },
        scrollIntoView: "cursor",
        multiSelectAction: "forEach"
    }, {
        name: "sortlines",
        bindKey: bindKey("Ctrl-Alt-S", "Command-Alt-S"),
        exec: function (editor) { editor.sortLines(); },
        scrollIntoView: "selection",
        multiSelectAction: "forEachLine"
    }, {
        name: "togglecomment",
        bindKey: bindKey("Ctrl-/", "Command-/"),
        exec: function (editor) { editor.toggleCommentLines(); },
        multiSelectAction: "forEachLine",
        scrollIntoView: "selectionPart"
    }, {
        name: "toggleBlockComment",
        bindKey: bindKey("Ctrl-Shift-/", "Command-Shift-/"),
        exec: function (editor) { editor.toggleBlockComment(); },
        multiSelectAction: "forEach",
        scrollIntoView: "selectionPart"
    }, {
        name: "modifyNumberUp",
        bindKey: bindKey("Ctrl-Shift-Up", "Alt-Shift-Up"),
        exec: function (editor) { editor.modifyNumber(1); },
        multiSelectAction: "forEach"
    }, {
        name: "modifyNumberDown",
        bindKey: bindKey("Ctrl-Shift-Down", "Alt-Shift-Down"),
        exec: function (editor) { editor.modifyNumber(-1); },
        multiSelectAction: "forEach"
    }, {
        name: "replace",
        bindKey: bindKey("Ctrl-H", "Command-Option-F"),
        exec: function (editor) {
            loadModule("ace/ext/searchbox", function (e) { e.Search(editor, true); });
        }
    }, {
        name: "undo",
        bindKey: bindKey("Ctrl-Z", "Command-Z"),
        exec: function (editor) { editor.undo(); }
    }, {
        name: "redo",
        bindKey: bindKey("Ctrl-Shift-Z|Ctrl-Y", "Command-Shift-Z|Command-Y"),
        exec: function (editor) { editor.redo(); }
    }, {
        name: "copylinesup",
        bindKey: bindKey("Alt-Shift-Up", "Command-Option-Up"),
        exec: function (editor) { editor.copyLinesUp(); },
        scrollIntoView: "cursor"
    }, {
        name: "movelinesup",
        bindKey: bindKey("Alt-Up", "Option-Up"),
        exec: function (editor) { editor.moveLinesUp(); },
        scrollIntoView: "cursor"
    }, {
        name: "copylinesdown",
        bindKey: bindKey("Alt-Shift-Down", "Command-Option-Down"),
        exec: function (editor) { editor.copyLinesDown(); },
        scrollIntoView: "cursor"
    }, {
        name: "movelinesdown",
        bindKey: bindKey("Alt-Down", "Option-Down"),
        exec: function (editor) { editor.moveLinesDown(); },
        scrollIntoView: "cursor"
    }, {
        name: "del",
        bindKey: bindKey("Delete", "Delete|Ctrl-D|Shift-Delete"),
        exec: function (editor) { editor.remove("right"); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor"
    }, {
        name: "backspace",
        bindKey: bindKey("Shift-Backspace|Backspace", "Ctrl-Backspace|Shift-Backspace|Backspace|Ctrl-H"),
        exec: function (editor) { editor.remove("left"); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor"
    }, {
        name: "cut_or_delete",
        bindKey: bindKey("Shift-Delete", null),
        exec: function (editor) {
            if (editor.selection.isEmpty()) {
                editor.remove("left");
            }
            else {
                return false;
            }
        },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor"
    }, {
        name: "removetolinestart",
        bindKey: bindKey("Alt-Backspace", "Command-Backspace"),
        exec: function (editor) { editor.removeToLineStart(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor"
    }, {
        name: "removetolineend",
        bindKey: bindKey("Alt-Delete", "Ctrl-K"),
        exec: function (editor) { editor.removeToLineEnd(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor"
    }, {
        name: "removewordleft",
        bindKey: bindKey("Ctrl-Backspace", "Alt-Backspace|Ctrl-Alt-Backspace"),
        exec: function (editor) { editor.removeWordLeft(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor"
    }, {
        name: "removewordright",
        bindKey: bindKey("Ctrl-Delete", "Alt-Delete"),
        exec: function (editor) { editor.removeWordRight(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor"
    }, {
        name: "outdent",
        bindKey: bindKey("Shift-Tab", "Shift-Tab"),
        exec: function (editor) { editor.blockOutdent(); },
        multiSelectAction: "forEach",
        scrollIntoView: "selectionPart"
    }, {
        name: "indent",
        bindKey: bindKey("Tab", "Tab"),
        exec: function (editor) { editor.indent(); },
        multiSelectAction: "forEach",
        scrollIntoView: "selectionPart"
    }, {
        name: "blockoutdent",
        bindKey: bindKey("Ctrl-[", "Ctrl-["),
        exec: function (editor) { editor.blockOutdent(); },
        multiSelectAction: "forEachLine",
        scrollIntoView: "selectionPart"
    }, {
        name: "blockindent",
        bindKey: bindKey("Ctrl-]", "Ctrl-]"),
        exec: function (editor) { editor.blockIndent(); },
        multiSelectAction: "forEachLine",
        scrollIntoView: "selectionPart"
    }, {
        name: "insertstring",
        exec: function (editor, str) { editor.insert(str); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor"
    }, {
        name: "inserttext",
        exec: function (editor, args) {
            editor.insert(stringRepeat(args.text || "", args.times || 1));
        },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor"
    }, {
        name: "splitline",
        bindKey: bindKey(null, "Ctrl-O"),
        exec: function (editor) { editor.splitLine(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor"
    }, {
        name: "transposeletters",
        bindKey: bindKey("Ctrl-T", "Ctrl-T"),
        exec: function (editor) { editor.transposeLetters(); },
        multiSelectAction: function (editor) { editor.transposeSelections(1); },
        scrollIntoView: "cursor"
    }, {
        name: "touppercase",
        bindKey: bindKey("Ctrl-U", "Ctrl-U"),
        exec: function (editor) { editor.toUpperCase(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor"
    }, {
        name: "tolowercase",
        bindKey: bindKey("Ctrl-Shift-U", "Ctrl-Shift-U"),
        exec: function (editor) { editor.toLowerCase(); },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor"
    }, {
        name: "expandtoline",
        bindKey: bindKey("Ctrl-Shift-L", "Command-Shift-L"),
        exec: function (editor) {
            var range = editor.selection.getRange();
            range.start.column = range.end.column = 0;
            range.end.row++;
            editor.selection.setRange(range, false);
        },
        multiSelectAction: "forEach",
        scrollIntoView: "cursor",
        readOnly: true
    }, {
        name: "joinlines",
        bindKey: bindKey(null, null),
        exec: function (editor) {
            var isBackwards = editor.selection.isBackwards();
            var selectionStart = isBackwards ? editor.selection.getSelectionLead() : editor.selection.getSelectionAnchor();
            var selectionEnd = isBackwards ? editor.selection.getSelectionAnchor() : editor.selection.getSelectionLead();
            var firstLineEndCol = editor.session.doc.getLine(selectionStart.row).length;
            var selectedText = editor.session.doc.getTextRange(editor.selection.getRange());
            var selectedCount = selectedText.replace(/\n\s*/, " ").length;
            var insertLine = editor.session.doc.getLine(selectionStart.row);
            for (var i = selectionStart.row + 1; i <= selectionEnd.row + 1; i++) {
                var curLine = stringTrimLeft(stringTrimRight(editor.session.doc.getLine(i)));
                if (curLine.length !== 0) {
                    curLine = " " + curLine;
                }
                insertLine += curLine;
            }
            ;
            if (selectionEnd.row + 1 < (editor.session.doc.getLength() - 1)) {
                insertLine += editor.session.doc.getNewLineCharacter();
            }
            editor.clearSelection();
            editor.session.doc.replace(new Range(selectionStart.row, 0, selectionEnd.row + 2, 0), insertLine);
            if (selectedCount > 0) {
                editor.selection.moveCursorTo(selectionStart.row, selectionStart.column);
                editor.selection.selectTo(selectionStart.row, selectionStart.column + selectedCount);
            }
            else {
                firstLineEndCol = editor.session.doc.getLine(selectionStart.row).length > firstLineEndCol ? (firstLineEndCol + 1) : firstLineEndCol;
                editor.selection.moveCursorTo(selectionStart.row, firstLineEndCol);
            }
        },
        multiSelectAction: "forEach",
        readOnly: true
    }, {
        name: "invertSelection",
        bindKey: bindKey(null, null),
        exec: function (editor) {
            var endRow = editor.session.doc.getLength() - 1;
            var endCol = editor.session.doc.getLine(endRow).length;
            var ranges = editor.selection.rangeList.ranges;
            var newRanges = [];
            if (ranges.length < 1) {
                ranges = [editor.selection.getRange()];
            }
            for (var i = 0; i < ranges.length; i++) {
                if (i == (ranges.length - 1)) {
                    if (!(ranges[i].end.row === endRow && ranges[i].end.column === endCol)) {
                        newRanges.push(new Range(ranges[i].end.row, ranges[i].end.column, endRow, endCol));
                    }
                }
                if (i === 0) {
                    if (!(ranges[i].start.row === 0 && ranges[i].start.column === 0)) {
                        newRanges.push(new Range(0, 0, ranges[i].start.row, ranges[i].start.column));
                    }
                }
                else {
                    newRanges.push(new Range(ranges[i - 1].end.row, ranges[i - 1].end.column, ranges[i].start.row, ranges[i].start.column));
                }
            }
            editor.exitMultiSelectMode();
            editor.clearSelection();
            for (var i = 0; i < newRanges.length; i++) {
                editor.selection.addRange(newRanges[i], false);
            }
        },
        readOnly: true,
        scrollIntoView: "none"
    }];
export default commands;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdF9jb21tYW5kcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImRlZmF1bHRfY29tbWFuZHMudHMiXSwibmFtZXMiOlsiYmluZEtleSJdLCJtYXBwaW5ncyI6IkFBb0RBLFlBQVksQ0FBQztPQUVOLEVBQUMsWUFBWSxFQUFFLGNBQWMsRUFBRSxlQUFlLEVBQUMsTUFBTSxhQUFhO09BQ2xFLEVBQUMsVUFBVSxFQUFDLE1BQU0sV0FBVztPQUM3QixLQUFLLE1BQU0sVUFBVTtBQUk1QixpQkFBaUIsR0FBVyxFQUFFLEdBQVc7SUFDckNBLE1BQU1BLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBO0FBQ2xDQSxDQUFDQTtBQU1ELElBQUksUUFBUSxHQUFjLENBQUM7UUFDdkIsSUFBSSxFQUFFLGtCQUFrQjtRQUN4QixPQUFPLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUM7UUFDdkMsSUFBSSxFQUFFLFVBQVMsTUFBTTtZQUNqQixVQUFVLENBQUMsdUJBQXVCLEVBQUUsVUFBUyxNQUFNO2dCQUMvQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNwQixNQUFNLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUM5QixDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFDRCxRQUFRLEVBQUUsSUFBSTtLQUNqQixFQUFFO1FBQ0ssSUFBSSxFQUFFLGVBQWU7UUFDckIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDO1FBQ25DLElBQUksRUFBRSxVQUFTLE1BQU07WUFDakIsVUFBVSxDQUFDLHNCQUFzQixFQUFFLFVBQVMsTUFBTTtnQkFDOUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdEMsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBQ0QsY0FBYyxFQUFFLFNBQVM7UUFDekIsUUFB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LENBQUM7WUFFeEIsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDeEMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ25ELENBQUM7UUFDTCxDQUFDO1FBQ0QsUUFBUSxFQUFFLElBQUk7UUFDZCxjQUFjLEVBQUUsTUFBTTtLQUN6QixDQUFDLENBQUM7QUFFUCxlQUFlLFFBQVEsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKiBcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblwidXNlIHN0cmljdFwiO1xuXG5pbXBvcnQge3N0cmluZ1JlcGVhdCwgc3RyaW5nVHJpbUxlZnQsIHN0cmluZ1RyaW1SaWdodH0gZnJvbSBcIi4uL2xpYi9sYW5nXCI7XG5pbXBvcnQge2xvYWRNb2R1bGV9IGZyb20gXCIuLi9jb25maWdcIjtcbmltcG9ydCBSYW5nZSBmcm9tIFwiLi4vUmFuZ2VcIjtcbmltcG9ydCBDb21tYW5kIGZyb20gJy4vQ29tbWFuZCc7XG5pbXBvcnQgRWRpdG9yIGZyb20gJy4uL0VkaXRvcic7XG5cbmZ1bmN0aW9uIGJpbmRLZXkod2luOiBzdHJpbmcsIG1hYzogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHsgd2luOiB3aW4sIG1hYzogbWFjIH07XG59XG5cbi8qXG4gICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwifFwiZm9yRWFjaExpbmVcInxmdW5jdGlvbnx1bmRlZmluZWQsXG4gICAgc2Nyb2xsSW50b1ZpZXc6IHRydWV8XCJjdXJzb3JcInxcImNlbnRlclwifFwic2VsZWN0aW9uUGFydFwiXG4qL1xudmFyIGNvbW1hbmRzOiBDb21tYW5kW10gPSBbe1xuICAgIG5hbWU6IFwic2hvd1NldHRpbmdzTWVudVwiLFxuICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLSxcIiwgXCJDb21tYW5kLSxcIiksXG4gICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7XG4gICAgICAgIGxvYWRNb2R1bGUoXCJhY2UvZXh0L3NldHRpbmdzX21lbnVcIiwgZnVuY3Rpb24obW9kdWxlKSB7XG4gICAgICAgICAgICBtb2R1bGUuaW5pdChlZGl0b3IpO1xuICAgICAgICAgICAgZWRpdG9yLnNob3dTZXR0aW5nc01lbnUoKTtcbiAgICAgICAgfSk7XG4gICAgfSxcbiAgICByZWFkT25seTogdHJ1ZVxufSwge1xuICAgICAgICBuYW1lOiBcImdvVG9OZXh0RXJyb3JcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1FXCIsIFwiQ3RybC1FXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IvKjogRWRpdG9yKi8pIHtcbiAgICAgICAgICAgIGxvYWRNb2R1bGUoXCJhY2UvZXh0L2Vycm9yX21hcmtlclwiLCBmdW5jdGlvbihtb2R1bGUpIHtcbiAgICAgICAgICAgICAgICBtb2R1bGUuc2hvd0Vycm9yTWFya2VyKGVkaXRvciwgMSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiYW5pbWF0ZVwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb1RvUHJldmlvdXNFcnJvclwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LVNoaWZ0LUVcIiwgXCJDdHJsLVNoaWZ0LUVcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykge1xuICAgICAgICAgICAgbG9hZE1vZHVsZShcImFjZS9leHQvZXJyb3JfbWFya2VyXCIsIGZ1bmN0aW9uKG1vZHVsZSkge1xuICAgICAgICAgICAgICAgIG1vZHVsZS5zaG93RXJyb3JNYXJrZXIoZWRpdG9yLCAtMSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiYW5pbWF0ZVwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3RhbGxcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtQVwiLCBcIkNvbW1hbmQtQVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5zZWxlY3RBbGwoKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiY2VudGVyc2VsZWN0aW9uXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkobnVsbCwgXCJDdHJsLUxcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3IuY2VudGVyU2VsZWN0aW9uKCk7IH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImdvdG9saW5lXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUxcIiwgXCJDb21tYW5kLUxcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBwYXJzZUludChwcm9tcHQoXCJFbnRlciBsaW5lIG51bWJlcjpcIiksIDEwKTtcbiAgICAgICAgICAgIGlmICghaXNOYU4obGluZSkpIHtcbiAgICAgICAgICAgICAgICBlZGl0b3IuZ290b0xpbmUobGluZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImZvbGRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1MfEN0cmwtRjFcIiwgXCJDb21tYW5kLUFsdC1MfENvbW1hbmQtRjFcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3Iuc2Vzc2lvbi50b2dnbGVGb2xkKGZhbHNlKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY2VudGVyXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInVuZm9sZFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LVNoaWZ0LUx8Q3RybC1TaGlmdC1GMVwiLCBcIkNvbW1hbmQtQWx0LVNoaWZ0LUx8Q29tbWFuZC1TaGlmdC1GMVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5zZXNzaW9uLnRvZ2dsZUZvbGQodHJ1ZSk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ0b2dnbGVGb2xkV2lkZ2V0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJGMlwiLCBcIkYyXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IvKjogRWRpdG9yKi8pIHsgZWRpdG9yLnNlc3Npb24udG9nZ2xlRm9sZFdpZGdldCgpOyB9LFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjZW50ZXJcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidG9nZ2xlUGFyZW50Rm9sZFdpZGdldFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LUYyXCIsIFwiQWx0LUYyXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IvKjogRWRpdG9yKi8pIHsgZWRpdG9yLnNlc3Npb24udG9nZ2xlRm9sZFdpZGdldCh0cnVlKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY2VudGVyXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImZvbGRhbGxcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtQWx0LTBcIiwgXCJDdHJsLUNvbW1hbmQtT3B0aW9uLTBcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3Iuc2Vzc2lvbi5mb2xkQWxsKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJmb2xkT3RoZXJcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC0wXCIsIFwiQ29tbWFuZC1PcHRpb24tMFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7XG4gICAgICAgICAgICBlZGl0b3Iuc2Vzc2lvbi5mb2xkQWxsKCk7XG4gICAgICAgICAgICBlZGl0b3Iuc2Vzc2lvbi51bmZvbGQoZWRpdG9yLnNlbGVjdGlvbi5nZXRBbGxSYW5nZXMoKSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ1bmZvbGRhbGxcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC0wXCIsIFwiQ29tbWFuZC1PcHRpb24tU2hpZnQtMFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5zZXNzaW9uLnVuZm9sZCgpOyB9LFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjZW50ZXJcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZmluZG5leHRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtS1wiLCBcIkNvbW1hbmQtR1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5maW5kTmV4dCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJmaW5kcHJldmlvdXNcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtS1wiLCBcIkNvbW1hbmQtU2hpZnQtR1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5maW5kUHJldmlvdXMoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjZW50ZXJcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0T3JGaW5kTmV4dFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LUtcIiwgXCJDdHJsLUdcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykge1xuICAgICAgICAgICAgaWYgKGVkaXRvci5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RXb3JkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBlZGl0b3IuZmluZE5leHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0T3JGaW5kUHJldmlvdXNcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC1LXCIsIFwiQ3RybC1TaGlmdC1HXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IvKjogRWRpdG9yKi8pIHtcbiAgICAgICAgICAgIGlmIChlZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2VsZWN0V29yZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLmZpbmRQcmV2aW91cygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJmaW5kXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUZcIiwgXCJDb21tYW5kLUZcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykge1xuICAgICAgICAgICAgbG9hZE1vZHVsZShcImFjZS9leHQvc2VhcmNoYm94XCIsIGZ1bmN0aW9uKGUpIHsgZS5TZWFyY2goZWRpdG9yKSB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwib3ZlcndyaXRlXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJJbnNlcnRcIiwgXCJJbnNlcnRcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3IudG9nZ2xlT3ZlcndyaXRlKCk7IH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHRvc3RhcnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtSG9tZVwiLCBcIkNvbW1hbmQtU2hpZnQtVXBcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0RmlsZVN0YXJ0KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWUsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImFuaW1hdGVcIixcbiAgICAgICAgYWNlQ29tbWFuZEdyb3VwOiBcImZpbGVKdW1wXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b3N0YXJ0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUhvbWVcIiwgXCJDb21tYW5kLUhvbWV8Q29tbWFuZC1VcFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5uYXZpZ2F0ZUZpbGVTdGFydCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJhbmltYXRlXCIsXG4gICAgICAgIGFjZUNvbW1hbmRHcm91cDogXCJmaWxlSnVtcFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHVwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJTaGlmdC1VcFwiLCBcIlNoaWZ0LVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdFVwKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ29saW5ldXBcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlVwXCIsIFwiVXB8Q3RybC1QXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IsIGFyZ3MpIHsgZWRpdG9yLm5hdmlnYXRlVXAoYXJncy50aW1lcyk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0dG9lbmRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtRW5kXCIsIFwiQ29tbWFuZC1TaGlmdC1Eb3duXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdEZpbGVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiYW5pbWF0ZVwiLFxuICAgICAgICBhY2VDb21tYW5kR3JvdXA6IFwiZmlsZUp1bXBcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvZW5kXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUVuZFwiLCBcIkNvbW1hbmQtRW5kfENvbW1hbmQtRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5uYXZpZ2F0ZUZpbGVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiYW5pbWF0ZVwiLFxuICAgICAgICBhY2VDb21tYW5kR3JvdXA6IFwiZmlsZUp1bXBcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3Rkb3duXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJTaGlmdC1Eb3duXCIsIFwiU2hpZnQtRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3REb3duKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImdvbGluZWRvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkRvd25cIiwgXCJEb3dufEN0cmwtTlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLCBhcmdzKSB7IGVkaXRvci5uYXZpZ2F0ZURvd24oYXJncy50aW1lcyk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHdvcmRsZWZ0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LUxlZnRcIiwgXCJPcHRpb24tU2hpZnQtTGVmdFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RXb3JkTGVmdCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3Rvd29yZGxlZnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtTGVmdFwiLCBcIk9wdGlvbi1MZWZ0XCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLm5hdmlnYXRlV29yZExlZnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0dG9saW5lc3RhcnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC1MZWZ0XCIsIFwiQ29tbWFuZC1TaGlmdC1MZWZ0XCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdExpbmVTdGFydCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvbGluZXN0YXJ0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtTGVmdHxIb21lXCIsIFwiQ29tbWFuZC1MZWZ0fEhvbWV8Q3RybC1BXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLm5hdmlnYXRlTGluZVN0YXJ0KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdGxlZnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlNoaWZ0LUxlZnRcIiwgXCJTaGlmdC1MZWZ0XCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdExlZnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b2xlZnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkxlZnRcIiwgXCJMZWZ0fEN0cmwtQlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLCBhcmdzKSB7IGVkaXRvci5uYXZpZ2F0ZUxlZnQoYXJncy50aW1lcyk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHdvcmRyaWdodFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1TaGlmdC1SaWdodFwiLCBcIk9wdGlvbi1TaGlmdC1SaWdodFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RXb3JkUmlnaHQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b3dvcmRyaWdodFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1SaWdodFwiLCBcIk9wdGlvbi1SaWdodFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5uYXZpZ2F0ZVdvcmRSaWdodCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3R0b2xpbmVlbmRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC1SaWdodFwiLCBcIkNvbW1hbmQtU2hpZnQtUmlnaHRcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0TGluZUVuZCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvbGluZWVuZFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LVJpZ2h0fEVuZFwiLCBcIkNvbW1hbmQtUmlnaHR8RW5kfEN0cmwtRVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5uYXZpZ2F0ZUxpbmVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0cmlnaHRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlNoaWZ0LVJpZ2h0XCIsIFwiU2hpZnQtUmlnaHRcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0UmlnaHQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b3JpZ2h0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJSaWdodFwiLCBcIlJpZ2h0fEN0cmwtRlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLCBhcmdzKSB7IGVkaXRvci5uYXZpZ2F0ZVJpZ2h0KGFyZ3MudGltZXMpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3RwYWdlZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBcIlNoaWZ0LVBhZ2VEb3duXCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3Iuc2VsZWN0UGFnZURvd24oKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicGFnZWRvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShudWxsLCBcIk9wdGlvbi1QYWdlRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5zY3JvbGxQYWdlRG93bigpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvcGFnZWRvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlBhZ2VEb3duXCIsIFwiUGFnZURvd258Q3RybC1WXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdvdG9QYWdlRG93bigpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3RwYWdldXBcIixcbiAgICAgICAgYmluZEtleTogXCJTaGlmdC1QYWdlVXBcIixcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5zZWxlY3RQYWdlVXAoKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicGFnZXVwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkobnVsbCwgXCJPcHRpb24tUGFnZVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnNjcm9sbFBhZ2VVcCgpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvcGFnZXVwXCIsXG4gICAgICAgIGJpbmRLZXk6IFwiUGFnZVVwXCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuZ290b1BhZ2VVcCgpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzY3JvbGx1cFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1VcFwiLCBudWxsKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZSkgeyBlLnJlbmRlcmVyLnNjcm9sbEJ5KDAsIC0yICogZS5yZW5kZXJlci5sYXllckNvbmZpZy5saW5lSGVpZ2h0KTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2Nyb2xsZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1Eb3duXCIsIG51bGwpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlKSB7IGUucmVuZGVyZXIuc2Nyb2xsQnkoMCwgMiAqIGUucmVuZGVyZXIubGF5ZXJDb25maWcubGluZUhlaWdodCk7IH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdGxpbmVzdGFydFwiLFxuICAgICAgICBiaW5kS2V5OiBcIlNoaWZ0LUhvbWVcIixcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RMaW5lU3RhcnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0bGluZWVuZFwiLFxuICAgICAgICBiaW5kS2V5OiBcIlNoaWZ0LUVuZFwiLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdExpbmVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidG9nZ2xlcmVjb3JkaW5nXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUFsdC1FXCIsIFwiQ29tbWFuZC1PcHRpb24tRVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5jb21tYW5kcy50b2dnbGVSZWNvcmRpbmcoZWRpdG9yKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicmVwbGF5bWFjcm9cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtRVwiLCBcIkNvbW1hbmQtU2hpZnQtRVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5jb21tYW5kcy5yZXBsYXkoZWRpdG9yKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwianVtcHRvbWF0Y2hpbmdcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtUFwiLCBcIkN0cmwtUFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5qdW1wVG9NYXRjaGluZygpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHRvbWF0Y2hpbmdcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtUFwiLCBcIkN0cmwtU2hpZnQtUFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5qdW1wVG9NYXRjaGluZyh0cnVlKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJwYXNzS2V5c1RvQnJvd3NlclwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwibnVsbFwiLCBcIm51bGxcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKCkgeyB9LFxuICAgICAgICBwYXNzRXZlbnQ6IHRydWUsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSxcblxuICAgIC8vIGNvbW1hbmRzIGRpc2FibGVkIGluIHJlYWRPbmx5IG1vZGVcbiAgICB7XG4gICAgICAgIG5hbWU6IFwiY3V0XCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgICAgICBlZGl0b3IuX2VtaXQoXCJjdXRcIiwgcmFuZ2UpO1xuXG4gICAgICAgICAgICBpZiAoIWVkaXRvci5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgICAgICAgICBlZGl0b3IuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJyZW1vdmVsaW5lXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLURcIiwgXCJDb21tYW5kLURcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IucmVtb3ZlTGluZXMoKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hMaW5lXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZHVwbGljYXRlU2VsZWN0aW9uXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LURcIiwgXCJDb21tYW5kLVNoaWZ0LURcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuZHVwbGljYXRlU2VsZWN0aW9uKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic29ydGxpbmVzXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUFsdC1TXCIsIFwiQ29tbWFuZC1BbHQtU1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5zb3J0TGluZXMoKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uXCIsXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hMaW5lXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidG9nZ2xlY29tbWVudFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC0vXCIsIFwiQ29tbWFuZC0vXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnRvZ2dsZUNvbW1lbnRMaW5lcygpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoTGluZVwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJzZWxlY3Rpb25QYXJ0XCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidG9nZ2xlQmxvY2tDb21tZW50XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LS9cIiwgXCJDb21tYW5kLVNoaWZ0LS9cIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IudG9nZ2xlQmxvY2tDb21tZW50KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uUGFydFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm1vZGlmeU51bWJlclVwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LVVwXCIsIFwiQWx0LVNoaWZ0LVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLm1vZGlmeU51bWJlcigxKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm1vZGlmeU51bWJlckRvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtRG93blwiLCBcIkFsdC1TaGlmdC1Eb3duXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLm1vZGlmeU51bWJlcigtMSk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJyZXBsYWNlXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUhcIiwgXCJDb21tYW5kLU9wdGlvbi1GXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHtcbiAgICAgICAgICAgIGxvYWRNb2R1bGUoXCJhY2UvZXh0L3NlYXJjaGJveFwiLCBmdW5jdGlvbihlKSB7IGUuU2VhcmNoKGVkaXRvciwgdHJ1ZSkgfSk7XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidW5kb1wiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1aXCIsIFwiQ29tbWFuZC1aXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnVuZG8oKTsgfVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJyZWRvXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LVp8Q3RybC1ZXCIsIFwiQ29tbWFuZC1TaGlmdC1afENvbW1hbmQtWVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5yZWRvKCk7IH1cbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiY29weWxpbmVzdXBcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC1VcFwiLCBcIkNvbW1hbmQtT3B0aW9uLVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmNvcHlMaW5lc1VwKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm1vdmVsaW5lc3VwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtVXBcIiwgXCJPcHRpb24tVXBcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IubW92ZUxpbmVzVXAoKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiY29weWxpbmVzZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LVNoaWZ0LURvd25cIiwgXCJDb21tYW5kLU9wdGlvbi1Eb3duXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmNvcHlMaW5lc0Rvd24oKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwibW92ZWxpbmVzZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LURvd25cIiwgXCJPcHRpb24tRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5tb3ZlTGluZXNEb3duKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImRlbFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiRGVsZXRlXCIsIFwiRGVsZXRlfEN0cmwtRHxTaGlmdC1EZWxldGVcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IucmVtb3ZlKFwicmlnaHRcIik7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiYmFja3NwYWNlXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXG4gICAgICAgICAgICBcIlNoaWZ0LUJhY2tzcGFjZXxCYWNrc3BhY2VcIixcbiAgICAgICAgICAgIFwiQ3RybC1CYWNrc3BhY2V8U2hpZnQtQmFja3NwYWNlfEJhY2tzcGFjZXxDdHJsLUhcIlxuICAgICAgICApLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnJlbW92ZShcImxlZnRcIik7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiY3V0X29yX2RlbGV0ZVwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiU2hpZnQtRGVsZXRlXCIsIG51bGwpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHtcbiAgICAgICAgICAgIGlmIChlZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgICAgIGVkaXRvci5yZW1vdmUoXCJsZWZ0XCIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicmVtb3ZldG9saW5lc3RhcnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1CYWNrc3BhY2VcIiwgXCJDb21tYW5kLUJhY2tzcGFjZVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5yZW1vdmVUb0xpbmVTdGFydCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInJlbW92ZXRvbGluZWVuZFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LURlbGV0ZVwiLCBcIkN0cmwtS1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5yZW1vdmVUb0xpbmVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJyZW1vdmV3b3JkbGVmdFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1CYWNrc3BhY2VcIiwgXCJBbHQtQmFja3NwYWNlfEN0cmwtQWx0LUJhY2tzcGFjZVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5yZW1vdmVXb3JkTGVmdCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInJlbW92ZXdvcmRyaWdodFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1EZWxldGVcIiwgXCJBbHQtRGVsZXRlXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnJlbW92ZVdvcmRSaWdodCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm91dGRlbnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlNoaWZ0LVRhYlwiLCBcIlNoaWZ0LVRhYlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5ibG9ja091dGRlbnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJzZWxlY3Rpb25QYXJ0XCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiaW5kZW50XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJUYWJcIiwgXCJUYWJcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuaW5kZW50KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uUGFydFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImJsb2Nrb3V0ZGVudFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1bXCIsIFwiQ3RybC1bXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmJsb2NrT3V0ZGVudCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoTGluZVwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJzZWxlY3Rpb25QYXJ0XCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiYmxvY2tpbmRlbnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtXVwiLCBcIkN0cmwtXVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5ibG9ja0luZGVudCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoTGluZVwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJzZWxlY3Rpb25QYXJ0XCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiaW5zZXJ0c3RyaW5nXCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvciwgc3RyKSB7IGVkaXRvci5pbnNlcnQoc3RyKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJpbnNlcnR0ZXh0XCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvciwgYXJncykge1xuICAgICAgICAgICAgZWRpdG9yLmluc2VydChzdHJpbmdSZXBlYXQoYXJncy50ZXh0IHx8IFwiXCIsIGFyZ3MudGltZXMgfHwgMSkpO1xuICAgICAgICB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNwbGl0bGluZVwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KG51bGwsIFwiQ3RybC1PXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnNwbGl0TGluZSgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInRyYW5zcG9zZWxldHRlcnNcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtVFwiLCBcIkN0cmwtVFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci50cmFuc3Bvc2VMZXR0ZXJzKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnRyYW5zcG9zZVNlbGVjdGlvbnMoMSk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInRvdXBwZXJjYXNlXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVVcIiwgXCJDdHJsLVVcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IudG9VcHBlckNhc2UoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ0b2xvd2VyY2FzZVwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1TaGlmdC1VXCIsIFwiQ3RybC1TaGlmdC1VXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnRvTG93ZXJDYXNlKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZXhwYW5kdG9saW5lXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LUxcIiwgXCJDb21tYW5kLVNoaWZ0LUxcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuXG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSByYW5nZS5lbmQuY29sdW1uID0gMDtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3crKztcbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2V0UmFuZ2UocmFuZ2UsIGZhbHNlKTtcbiAgICAgICAgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiam9pbmxpbmVzXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkobnVsbCwgbnVsbCksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikge1xuICAgICAgICAgICAgdmFyIGlzQmFja3dhcmRzID0gZWRpdG9yLnNlbGVjdGlvbi5pc0JhY2t3YXJkcygpO1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvblN0YXJ0ID0gaXNCYWNrd2FyZHMgPyBlZGl0b3Iuc2VsZWN0aW9uLmdldFNlbGVjdGlvbkxlYWQoKSA6IGVkaXRvci5zZWxlY3Rpb24uZ2V0U2VsZWN0aW9uQW5jaG9yKCk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uRW5kID0gaXNCYWNrd2FyZHMgPyBlZGl0b3Iuc2VsZWN0aW9uLmdldFNlbGVjdGlvbkFuY2hvcigpIDogZWRpdG9yLnNlbGVjdGlvbi5nZXRTZWxlY3Rpb25MZWFkKCk7XG4gICAgICAgICAgICB2YXIgZmlyc3RMaW5lRW5kQ29sID0gZWRpdG9yLnNlc3Npb24uZG9jLmdldExpbmUoc2VsZWN0aW9uU3RhcnQucm93KS5sZW5ndGhcbiAgICAgICAgICAgIHZhciBzZWxlY3RlZFRleHQgPSBlZGl0b3Iuc2Vzc2lvbi5kb2MuZ2V0VGV4dFJhbmdlKGVkaXRvci5zZWxlY3Rpb24uZ2V0UmFuZ2UoKSk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0ZWRDb3VudCA9IHNlbGVjdGVkVGV4dC5yZXBsYWNlKC9cXG5cXHMqLywgXCIgXCIpLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciBpbnNlcnRMaW5lID0gZWRpdG9yLnNlc3Npb24uZG9jLmdldExpbmUoc2VsZWN0aW9uU3RhcnQucm93KTtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHNlbGVjdGlvblN0YXJ0LnJvdyArIDE7IGkgPD0gc2VsZWN0aW9uRW5kLnJvdyArIDE7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBjdXJMaW5lID0gc3RyaW5nVHJpbUxlZnQoc3RyaW5nVHJpbVJpZ2h0KGVkaXRvci5zZXNzaW9uLmRvYy5nZXRMaW5lKGkpKSk7XG4gICAgICAgICAgICAgICAgaWYgKGN1ckxpbmUubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGN1ckxpbmUgPSBcIiBcIiArIGN1ckxpbmU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGluc2VydExpbmUgKz0gY3VyTGluZTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChzZWxlY3Rpb25FbmQucm93ICsgMSA8IChlZGl0b3Iuc2Vzc2lvbi5kb2MuZ2V0TGVuZ3RoKCkgLSAxKSkge1xuICAgICAgICAgICAgICAgIC8vIERvbid0IGluc2VydCBhIG5ld2xpbmUgYXQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnRcbiAgICAgICAgICAgICAgICBpbnNlcnRMaW5lICs9IGVkaXRvci5zZXNzaW9uLmRvYy5nZXROZXdMaW5lQ2hhcmFjdGVyKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVkaXRvci5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICAgICAgZWRpdG9yLnNlc3Npb24uZG9jLnJlcGxhY2UobmV3IFJhbmdlKHNlbGVjdGlvblN0YXJ0LnJvdywgMCwgc2VsZWN0aW9uRW5kLnJvdyArIDIsIDApLCBpbnNlcnRMaW5lKTtcblxuICAgICAgICAgICAgaWYgKHNlbGVjdGVkQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgICAgLy8gU2VsZWN0IHRoZSB0ZXh0IHRoYXQgd2FzIHByZXZpb3VzbHkgc2VsZWN0ZWRcbiAgICAgICAgICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLm1vdmVDdXJzb3JUbyhzZWxlY3Rpb25TdGFydC5yb3csIHNlbGVjdGlvblN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RUbyhzZWxlY3Rpb25TdGFydC5yb3csIHNlbGVjdGlvblN0YXJ0LmNvbHVtbiArIHNlbGVjdGVkQ291bnQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgam9pbmVkIGxpbmUgaGFkIHNvbWV0aGluZyBpbiBpdCwgc3RhcnQgdGhlIGN1cnNvciBhdCB0aGF0IHNvbWV0aGluZ1xuICAgICAgICAgICAgICAgIGZpcnN0TGluZUVuZENvbCA9IGVkaXRvci5zZXNzaW9uLmRvYy5nZXRMaW5lKHNlbGVjdGlvblN0YXJ0LnJvdykubGVuZ3RoID4gZmlyc3RMaW5lRW5kQ29sID8gKGZpcnN0TGluZUVuZENvbCArIDEpIDogZmlyc3RMaW5lRW5kQ29sO1xuICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24ubW92ZUN1cnNvclRvKHNlbGVjdGlvblN0YXJ0LnJvdywgZmlyc3RMaW5lRW5kQ29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJpbnZlcnRTZWxlY3Rpb25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShudWxsLCBudWxsKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7XG4gICAgICAgICAgICB2YXIgZW5kUm93ID0gZWRpdG9yLnNlc3Npb24uZG9jLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgICAgIHZhciBlbmRDb2wgPSBlZGl0b3Iuc2Vzc2lvbi5kb2MuZ2V0TGluZShlbmRSb3cpLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciByYW5nZXMgPSBlZGl0b3Iuc2VsZWN0aW9uLnJhbmdlTGlzdC5yYW5nZXM7XG4gICAgICAgICAgICB2YXIgbmV3UmFuZ2VzID0gW107XG5cbiAgICAgICAgICAgIC8vIElmIG11bHRpcGxlIHNlbGVjdGlvbnMgZG9uJ3QgZXhpc3QsIHJhbmdlTGlzdCB3aWxsIHJldHVybiAwIHNvIHJlcGxhY2Ugd2l0aCBzaW5nbGUgcmFuZ2VcbiAgICAgICAgICAgIGlmIChyYW5nZXMubGVuZ3RoIDwgMSkge1xuICAgICAgICAgICAgICAgIHJhbmdlcyA9IFtlZGl0b3Iuc2VsZWN0aW9uLmdldFJhbmdlKCldO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChpID09IChyYW5nZXMubGVuZ3RoIC0gMSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGxhc3Qgc2VsZWN0aW9uIG11c3QgY29ubmVjdCB0byB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudCwgdW5sZXNzIGl0IGFscmVhZHkgZG9lc1xuICAgICAgICAgICAgICAgICAgICBpZiAoIShyYW5nZXNbaV0uZW5kLnJvdyA9PT0gZW5kUm93ICYmIHJhbmdlc1tpXS5lbmQuY29sdW1uID09PSBlbmRDb2wpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdSYW5nZXMucHVzaChuZXcgUmFuZ2UocmFuZ2VzW2ldLmVuZC5yb3csIHJhbmdlc1tpXS5lbmQuY29sdW1uLCBlbmRSb3csIGVuZENvbCkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGZpcnN0IHNlbGVjdGlvbiBtdXN0IGNvbm5lY3QgdG8gdGhlIHN0YXJ0IG9mIHRoZSBkb2N1bWVudCwgdW5sZXNzIGl0IGFscmVhZHkgZG9lc1xuICAgICAgICAgICAgICAgICAgICBpZiAoIShyYW5nZXNbaV0uc3RhcnQucm93ID09PSAwICYmIHJhbmdlc1tpXS5zdGFydC5jb2x1bW4gPT09IDApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdSYW5nZXMucHVzaChuZXcgUmFuZ2UoMCwgMCwgcmFuZ2VzW2ldLnN0YXJ0LnJvdywgcmFuZ2VzW2ldLnN0YXJ0LmNvbHVtbikpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3UmFuZ2VzLnB1c2gobmV3IFJhbmdlKHJhbmdlc1tpIC0gMV0uZW5kLnJvdywgcmFuZ2VzW2kgLSAxXS5lbmQuY29sdW1uLCByYW5nZXNbaV0uc3RhcnQucm93LCByYW5nZXNbaV0uc3RhcnQuY29sdW1uKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlZGl0b3IuZXhpdE11bHRpU2VsZWN0TW9kZSgpO1xuICAgICAgICAgICAgZWRpdG9yLmNsZWFyU2VsZWN0aW9uKCk7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbmV3UmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5hZGRSYW5nZShuZXdSYW5nZXNbaV0sIGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWUsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcIm5vbmVcIlxuICAgIH1dO1xuXG5leHBvcnQgZGVmYXVsdCBjb21tYW5kcztcbiJdfQ==