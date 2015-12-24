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
        exec: function (editor) { editor.getSession().toggleFold(false); },
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "unfold",
        bindKey: bindKey("Alt-Shift-L|Ctrl-Shift-F1", "Command-Alt-Shift-L|Command-Shift-F1"),
        exec: function (editor) { editor.getSession().toggleFold(true); },
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "toggleFoldWidget",
        bindKey: bindKey("F2", "F2"),
        exec: function (editor) { editor.getSession().toggleFoldWidget(); },
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "toggleParentFoldWidget",
        bindKey: bindKey("Alt-F2", "Alt-F2"),
        exec: function (editor) { editor.getSession().toggleFoldWidget(true); },
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "foldall",
        bindKey: bindKey("Ctrl-Alt-0", "Ctrl-Command-Option-0"),
        exec: function (editor) { editor.getSession().foldAll(); },
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "foldOther",
        bindKey: bindKey("Alt-0", "Command-Option-0"),
        exec: function (editor) {
            editor.getSession().foldAll();
        },
        scrollIntoView: "center",
        readOnly: true
    }, {
        name: "unfoldall",
        bindKey: bindKey("Alt-Shift-0", "Command-Option-Shift-0"),
        exec: function (editor) { editor.getSession().unfold(); },
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
                editor.getSession().remove(range);
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
        multiSelectAction: function (editor) { },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdF9jb21tYW5kcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImRlZmF1bHRfY29tbWFuZHMudHMiXSwibmFtZXMiOlsiYmluZEtleSJdLCJtYXBwaW5ncyI6IkFBb0RBLFlBQVksQ0FBQztPQUVOLEVBQUMsWUFBWSxFQUFFLGNBQWMsRUFBRSxlQUFlLEVBQUMsTUFBTSxhQUFhO09BQ2xFLEVBQUMsVUFBVSxFQUFDLE1BQU0sV0FBVztPQUM3QixLQUFLLE1BQU0sVUFBVTtBQUk1QixpQkFBaUIsR0FBVyxFQUFFLEdBQVc7SUFDckNBLE1BQU1BLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBO0FBQ2xDQSxDQUFDQTtBQU1ELElBQUksUUFBUSxHQUFjLENBQUM7UUFDdkIsSUFBSSxFQUFFLGtCQUFrQjtRQUN4QixPQUFPLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUM7UUFDdkMsSUFBSSxFQUFFLFVBQVMsTUFBYztZQUN6QixVQUFVLENBQUMsdUJBQXVCLEVBQUUsVUFBUyxNQUFNO2dCQUMvQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBR3hCLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUNELFFBQVEsRUFBRSxJQUFJO0tBQ2pCLEVBQUU7UUFDSyxJQUFJLEVBQUUsZUFBZTtRQUNyQixPQUFPLEVBQUUsT0FBTyxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUM7UUFDbkMsSUFBSSxFQUFFLFVBQVMsTUFBYztZQUN6QixVQUFVLENBQUMsc0JBQXNCLEVBQUUsVUFBUyxNQUFNO2dCQUM5QyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN0QyxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFDRCxjQUFjLEVBQUUsU0FBUztRQUN6QixRQUFRLEVBQUUsSUFBSTtLQUNqQixFQUFFO1FBQ0MsSUFBSSxF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LENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDbkQsQ0FBQztRQUNMLENBQUM7UUFDRCxRQUFRLEVBQUUsSUFBSTtRQUNkLGNBQWMsRUFBRSxNQUFNO0tBQ3pCLENBQUMsQ0FBQztBQUVQLGVBQWUsUUFBUSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0LTIwMTYgRGF2aWQgR2VvIEhvbG1lcyA8ZGF2aWQuZ2VvLmhvbG1lc0BnbWFpbC5jb20+XG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuICogY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXG4gKiBTT0ZUV0FSRS5cbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG4vKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqIFxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCB7c3RyaW5nUmVwZWF0LCBzdHJpbmdUcmltTGVmdCwgc3RyaW5nVHJpbVJpZ2h0fSBmcm9tIFwiLi4vbGliL2xhbmdcIjtcbmltcG9ydCB7bG9hZE1vZHVsZX0gZnJvbSBcIi4uL2NvbmZpZ1wiO1xuaW1wb3J0IFJhbmdlIGZyb20gXCIuLi9SYW5nZVwiO1xuaW1wb3J0IENvbW1hbmQgZnJvbSAnLi9Db21tYW5kJztcbmltcG9ydCBFZGl0b3IgZnJvbSAnLi4vRWRpdG9yJztcblxuZnVuY3Rpb24gYmluZEtleSh3aW46IHN0cmluZywgbWFjOiBzdHJpbmcpIHtcbiAgICByZXR1cm4geyB3aW46IHdpbiwgbWFjOiBtYWMgfTtcbn1cblxuLypcbiAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCJ8XCJmb3JFYWNoTGluZVwifGZ1bmN0aW9ufHVuZGVmaW5lZCxcbiAgICBzY3JvbGxJbnRvVmlldzogdHJ1ZXxcImN1cnNvclwifFwiY2VudGVyXCJ8XCJzZWxlY3Rpb25QYXJ0XCJcbiovXG52YXIgY29tbWFuZHM6IENvbW1hbmRbXSA9IFt7XG4gICAgbmFtZTogXCJzaG93U2V0dGluZ3NNZW51XCIsXG4gICAgYmluZEtleTogYmluZEtleShcIkN0cmwtLFwiLCBcIkNvbW1hbmQtLFwiKSxcbiAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICBsb2FkTW9kdWxlKFwiYWNlL2V4dC9zZXR0aW5nc19tZW51XCIsIGZ1bmN0aW9uKG1vZHVsZSkge1xuICAgICAgICAgICAgbW9kdWxlLmluaXQoZWRpdG9yKTtcbiAgICAgICAgICAgIC8vIFxuICAgICAgICAgICAgLy8gZWRpdG9yLnNob3dTZXR0aW5nc01lbnUoKTtcbiAgICAgICAgfSk7XG4gICAgfSxcbiAgICByZWFkT25seTogdHJ1ZVxufSwge1xuICAgICAgICBuYW1lOiBcImdvVG9OZXh0RXJyb3JcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1FXCIsIFwiQ3RybC1FXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICAgICAgbG9hZE1vZHVsZShcImFjZS9leHQvZXJyb3JfbWFya2VyXCIsIGZ1bmN0aW9uKG1vZHVsZSkge1xuICAgICAgICAgICAgICAgIG1vZHVsZS5zaG93RXJyb3JNYXJrZXIoZWRpdG9yLCAxKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJhbmltYXRlXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImdvVG9QcmV2aW91c0Vycm9yXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtU2hpZnQtRVwiLCBcIkN0cmwtU2hpZnQtRVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgICAgIGxvYWRNb2R1bGUoXCJhY2UvZXh0L2Vycm9yX21hcmtlclwiLCBmdW5jdGlvbihtb2R1bGUpIHtcbiAgICAgICAgICAgICAgICBtb2R1bGUuc2hvd0Vycm9yTWFya2VyKGVkaXRvciwgLTEpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImFuaW1hdGVcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0YWxsXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUFcIiwgXCJDb21tYW5kLUFcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5zZWxlY3RBbGwoKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiY2VudGVyc2VsZWN0aW9uXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkobnVsbCwgXCJDdHJsLUxcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5jZW50ZXJTZWxlY3Rpb24oKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b2xpbmVcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtTFwiLCBcIkNvbW1hbmQtTFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gcGFyc2VJbnQocHJvbXB0KFwiRW50ZXIgbGluZSBudW1iZXI6XCIpLCAxMCk7XG4gICAgICAgICAgICBpZiAoIWlzTmFOKGxpbmUpKSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLmdvdG9MaW5lKGxpbmUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJmb2xkXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtTHxDdHJsLUYxXCIsIFwiQ29tbWFuZC1BbHQtTHxDb21tYW5kLUYxXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuZ2V0U2Vzc2lvbigpLnRvZ2dsZUZvbGQoZmFsc2UpOyB9LFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjZW50ZXJcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidW5mb2xkXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtU2hpZnQtTHxDdHJsLVNoaWZ0LUYxXCIsIFwiQ29tbWFuZC1BbHQtU2hpZnQtTHxDb21tYW5kLVNoaWZ0LUYxXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuZ2V0U2Vzc2lvbigpLnRvZ2dsZUZvbGQodHJ1ZSk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ0b2dnbGVGb2xkV2lkZ2V0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJGMlwiLCBcIkYyXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuZ2V0U2Vzc2lvbigpLnRvZ2dsZUZvbGRXaWRnZXQoKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY2VudGVyXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInRvZ2dsZVBhcmVudEZvbGRXaWRnZXRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1GMlwiLCBcIkFsdC1GMlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLmdldFNlc3Npb24oKS50b2dnbGVGb2xkV2lkZ2V0KHRydWUpOyB9LFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjZW50ZXJcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZm9sZGFsbFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1BbHQtMFwiLCBcIkN0cmwtQ29tbWFuZC1PcHRpb24tMFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLmdldFNlc3Npb24oKS5mb2xkQWxsKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJmb2xkT3RoZXJcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC0wXCIsIFwiQ29tbWFuZC1PcHRpb24tMFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgICAgIGVkaXRvci5nZXRTZXNzaW9uKCkuZm9sZEFsbCgpO1xuICAgICAgICAgICAgLy8gRklYTUVcbiAgICAgICAgICAgIC8vZWRpdG9yLmdldFNlc3Npb24oKS51bmZvbGQoZWRpdG9yLnNlbGVjdGlvbi5nZXRBbGxSYW5nZXMoKSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ1bmZvbGRhbGxcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC0wXCIsIFwiQ29tbWFuZC1PcHRpb24tU2hpZnQtMFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLmdldFNlc3Npb24oKS51bmZvbGQoKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY2VudGVyXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImZpbmRuZXh0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUtcIiwgXCJDb21tYW5kLUdcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5maW5kTmV4dCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJmaW5kcHJldmlvdXNcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtS1wiLCBcIkNvbW1hbmQtU2hpZnQtR1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLmZpbmRQcmV2aW91cygpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3RPckZpbmROZXh0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtS1wiLCBcIkN0cmwtR1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgICAgIGlmIChlZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2VsZWN0V29yZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLmZpbmROZXh0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdE9yRmluZFByZXZpb3VzXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtU2hpZnQtS1wiLCBcIkN0cmwtU2hpZnQtR1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgICAgIGlmIChlZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2VsZWN0V29yZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLmZpbmRQcmV2aW91cygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJmaW5kXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUZcIiwgXCJDb21tYW5kLUZcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgICAgICBsb2FkTW9kdWxlKFwiYWNlL2V4dC9zZWFyY2hib3hcIiwgZnVuY3Rpb24oZSkgeyBlLlNlYXJjaChlZGl0b3IpIH0pO1xuICAgICAgICB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJvdmVyd3JpdGVcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkluc2VydFwiLCBcIkluc2VydFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLnRvZ2dsZU92ZXJ3cml0ZSgpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3R0b3N0YXJ0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LUhvbWVcIiwgXCJDb21tYW5kLVNoaWZ0LVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0RmlsZVN0YXJ0KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWUsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImFuaW1hdGVcIixcbiAgICAgICAgYWNlQ29tbWFuZEdyb3VwOiBcImZpbGVKdW1wXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b3N0YXJ0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUhvbWVcIiwgXCJDb21tYW5kLUhvbWV8Q29tbWFuZC1VcFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLm5hdmlnYXRlRmlsZVN0YXJ0KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWUsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImFuaW1hdGVcIixcbiAgICAgICAgYWNlQ29tbWFuZEdyb3VwOiBcImZpbGVKdW1wXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0dXBcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlNoaWZ0LVVwXCIsIFwiU2hpZnQtVXBcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RVcCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImdvbGluZXVwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJVcFwiLCBcIlVwfEN0cmwtUFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IsIGFyZ3M6IHsgdGltZXM6IG51bWJlciB9KSB7IGVkaXRvci5uYXZpZ2F0ZVVwKGFyZ3MudGltZXMpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHRvZW5kXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LUVuZFwiLCBcIkNvbW1hbmQtU2hpZnQtRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdEZpbGVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiYW5pbWF0ZVwiLFxuICAgICAgICBhY2VDb21tYW5kR3JvdXA6IFwiZmlsZUp1bXBcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvZW5kXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUVuZFwiLCBcIkNvbW1hbmQtRW5kfENvbW1hbmQtRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLm5hdmlnYXRlRmlsZUVuZCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJhbmltYXRlXCIsXG4gICAgICAgIGFjZUNvbW1hbmRHcm91cDogXCJmaWxlSnVtcFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdGRvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlNoaWZ0LURvd25cIiwgXCJTaGlmdC1Eb3duXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0RG93bigpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb2xpbmVkb3duXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJEb3duXCIsIFwiRG93bnxDdHJsLU5cIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yLCBhcmdzOiB7IHRpbWVzOiBudW1iZXIgfSkgeyBlZGl0b3IubmF2aWdhdGVEb3duKGFyZ3MudGltZXMpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3R3b3JkbGVmdFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1TaGlmdC1MZWZ0XCIsIFwiT3B0aW9uLVNoaWZ0LUxlZnRcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RXb3JkTGVmdCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3Rvd29yZGxlZnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtTGVmdFwiLCBcIk9wdGlvbi1MZWZ0XCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IubmF2aWdhdGVXb3JkTGVmdCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3R0b2xpbmVzdGFydFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LVNoaWZ0LUxlZnRcIiwgXCJDb21tYW5kLVNoaWZ0LUxlZnRcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RMaW5lU3RhcnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b2xpbmVzdGFydFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LUxlZnR8SG9tZVwiLCBcIkNvbW1hbmQtTGVmdHxIb21lfEN0cmwtQVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLm5hdmlnYXRlTGluZVN0YXJ0KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdGxlZnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlNoaWZ0LUxlZnRcIiwgXCJTaGlmdC1MZWZ0XCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0TGVmdCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvbGVmdFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiTGVmdFwiLCBcIkxlZnR8Q3RybC1CXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvciwgYXJnczogeyB0aW1lczogbnVtYmVyIH0pIHsgZWRpdG9yLm5hdmlnYXRlTGVmdChhcmdzLnRpbWVzKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0d29yZHJpZ2h0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LVJpZ2h0XCIsIFwiT3B0aW9uLVNoaWZ0LVJpZ2h0XCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0V29yZFJpZ2h0KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImdvdG93b3JkcmlnaHRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtUmlnaHRcIiwgXCJPcHRpb24tUmlnaHRcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5uYXZpZ2F0ZVdvcmRSaWdodCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3R0b2xpbmVlbmRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC1SaWdodFwiLCBcIkNvbW1hbmQtU2hpZnQtUmlnaHRcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RMaW5lRW5kKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImdvdG9saW5lZW5kXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtUmlnaHR8RW5kXCIsIFwiQ29tbWFuZC1SaWdodHxFbmR8Q3RybC1FXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IubmF2aWdhdGVMaW5lRW5kKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHJpZ2h0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJTaGlmdC1SaWdodFwiLCBcIlNoaWZ0LVJpZ2h0XCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0UmlnaHQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b3JpZ2h0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJSaWdodFwiLCBcIlJpZ2h0fEN0cmwtRlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IsIGFyZ3M6IHsgdGltZXM6IG51bWJlciB9KSB7IGVkaXRvci5uYXZpZ2F0ZVJpZ2h0KGFyZ3MudGltZXMpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3RwYWdlZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBcIlNoaWZ0LVBhZ2VEb3duXCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5zZWxlY3RQYWdlRG93bigpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJwYWdlZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KG51bGwsIFwiT3B0aW9uLVBhZ2VEb3duXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3Iuc2Nyb2xsUGFnZURvd24oKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b3BhZ2Vkb3duXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJQYWdlRG93blwiLCBcIlBhZ2VEb3dufEN0cmwtVlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLmdvdG9QYWdlRG93bigpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3RwYWdldXBcIixcbiAgICAgICAgYmluZEtleTogXCJTaGlmdC1QYWdlVXBcIixcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLnNlbGVjdFBhZ2VVcCgpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJwYWdldXBcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShudWxsLCBcIk9wdGlvbi1QYWdlVXBcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5zY3JvbGxQYWdlVXAoKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b3BhZ2V1cFwiLFxuICAgICAgICBiaW5kS2V5OiBcIlBhZ2VVcFwiLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuZ290b1BhZ2VVcCgpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzY3JvbGx1cFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1VcFwiLCBudWxsKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZTogRWRpdG9yKSB7IGUucmVuZGVyZXIuc2Nyb2xsQnkoMCwgLTIgKiBlLnJlbmRlcmVyLmxheWVyQ29uZmlnLmxpbmVIZWlnaHQpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzY3JvbGxkb3duXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLURvd25cIiwgbnVsbCksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGU6IEVkaXRvcikgeyBlLnJlbmRlcmVyLnNjcm9sbEJ5KDAsIDIgKiBlLnJlbmRlcmVyLmxheWVyQ29uZmlnLmxpbmVIZWlnaHQpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3RsaW5lc3RhcnRcIixcbiAgICAgICAgYmluZEtleTogXCJTaGlmdC1Ib21lXCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RMaW5lU3RhcnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0bGluZWVuZFwiLFxuICAgICAgICBiaW5kS2V5OiBcIlNoaWZ0LUVuZFwiLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0TGluZUVuZCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ0b2dnbGVyZWNvcmRpbmdcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtQWx0LUVcIiwgXCJDb21tYW5kLU9wdGlvbi1FXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuY29tbWFuZHMudG9nZ2xlUmVjb3JkaW5nKGVkaXRvcik7IH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInJlcGxheW1hY3JvXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LUVcIiwgXCJDb21tYW5kLVNoaWZ0LUVcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5jb21tYW5kcy5yZXBsYXkoZWRpdG9yKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwianVtcHRvbWF0Y2hpbmdcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtUFwiLCBcIkN0cmwtUFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLmp1bXBUb01hdGNoaW5nKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0dG9tYXRjaGluZ1wiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1TaGlmdC1QXCIsIFwiQ3RybC1TaGlmdC1QXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuanVtcFRvTWF0Y2hpbmcodHJ1ZSk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicGFzc0tleXNUb0Jyb3dzZXJcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIm51bGxcIiwgXCJudWxsXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbigpIHsgfSxcbiAgICAgICAgcGFzc0V2ZW50OiB0cnVlLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sXG5cbiAgICAvLyBjb21tYW5kcyBkaXNhYmxlZCBpbiByZWFkT25seSBtb2RlXG4gICAge1xuICAgICAgICBuYW1lOiBcImN1dFwiLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgICAgICBlZGl0b3IuX2VtaXQoXCJjdXRcIiwgcmFuZ2UpO1xuXG4gICAgICAgICAgICBpZiAoIWVkaXRvci5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLmdldFNlc3Npb24oKS5yZW1vdmUocmFuZ2UpO1xuICAgICAgICAgICAgICAgIGVkaXRvci5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInJlbW92ZWxpbmVcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtRFwiLCBcIkNvbW1hbmQtRFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLnJlbW92ZUxpbmVzKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoTGluZVwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImR1cGxpY2F0ZVNlbGVjdGlvblwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1TaGlmdC1EXCIsIFwiQ29tbWFuZC1TaGlmdC1EXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuZHVwbGljYXRlU2VsZWN0aW9uKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic29ydGxpbmVzXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUFsdC1TXCIsIFwiQ29tbWFuZC1BbHQtU1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLnNvcnRMaW5lcygpOyB9LFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJzZWxlY3Rpb25cIixcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaExpbmVcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ0b2dnbGVjb21tZW50XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLS9cIiwgXCJDb21tYW5kLS9cIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci50b2dnbGVDb21tZW50TGluZXMoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaExpbmVcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uUGFydFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInRvZ2dsZUJsb2NrQ29tbWVudFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1TaGlmdC0vXCIsIFwiQ29tbWFuZC1TaGlmdC0vXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IudG9nZ2xlQmxvY2tDb21tZW50KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uUGFydFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm1vZGlmeU51bWJlclVwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LVVwXCIsIFwiQWx0LVNoaWZ0LVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IubW9kaWZ5TnVtYmVyKDEpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwibW9kaWZ5TnVtYmVyRG93blwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1TaGlmdC1Eb3duXCIsIFwiQWx0LVNoaWZ0LURvd25cIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5tb2RpZnlOdW1iZXIoLTEpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicmVwbGFjZVwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1IXCIsIFwiQ29tbWFuZC1PcHRpb24tRlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgICAgIGxvYWRNb2R1bGUoXCJhY2UvZXh0L3NlYXJjaGJveFwiLCBmdW5jdGlvbihlKSB7IGUuU2VhcmNoKGVkaXRvciwgdHJ1ZSkgfSk7XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidW5kb1wiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1aXCIsIFwiQ29tbWFuZC1aXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IudW5kbygpOyB9XG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInJlZG9cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtWnxDdHJsLVlcIiwgXCJDb21tYW5kLVNoaWZ0LVp8Q29tbWFuZC1ZXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IucmVkbygpOyB9XG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImNvcHlsaW5lc3VwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtU2hpZnQtVXBcIiwgXCJDb21tYW5kLU9wdGlvbi1VcFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLmNvcHlMaW5lc1VwKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm1vdmVsaW5lc3VwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtVXBcIiwgXCJPcHRpb24tVXBcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5tb3ZlTGluZXNVcCgpOyB9LFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJjb3B5bGluZXNkb3duXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtU2hpZnQtRG93blwiLCBcIkNvbW1hbmQtT3B0aW9uLURvd25cIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5jb3B5TGluZXNEb3duKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm1vdmVsaW5lc2Rvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1Eb3duXCIsIFwiT3B0aW9uLURvd25cIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5tb3ZlTGluZXNEb3duKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImRlbFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiRGVsZXRlXCIsIFwiRGVsZXRlfEN0cmwtRHxTaGlmdC1EZWxldGVcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5yZW1vdmUoXCJyaWdodFwiKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJiYWNrc3BhY2VcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcbiAgICAgICAgICAgIFwiU2hpZnQtQmFja3NwYWNlfEJhY2tzcGFjZVwiLFxuICAgICAgICAgICAgXCJDdHJsLUJhY2tzcGFjZXxTaGlmdC1CYWNrc3BhY2V8QmFja3NwYWNlfEN0cmwtSFwiXG4gICAgICAgICksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5yZW1vdmUoXCJsZWZ0XCIpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImN1dF9vcl9kZWxldGVcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlNoaWZ0LURlbGV0ZVwiLCBudWxsKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgICAgIGlmIChlZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgICAgIGVkaXRvci5yZW1vdmUoXCJsZWZ0XCIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicmVtb3ZldG9saW5lc3RhcnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1CYWNrc3BhY2VcIiwgXCJDb21tYW5kLUJhY2tzcGFjZVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgZWRpdG9yLnJlbW92ZVRvTGluZVN0YXJ0KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicmVtb3ZldG9saW5lZW5kXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtRGVsZXRlXCIsIFwiQ3RybC1LXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IucmVtb3ZlVG9MaW5lRW5kKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicmVtb3Zld29yZGxlZnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtQmFja3NwYWNlXCIsIFwiQWx0LUJhY2tzcGFjZXxDdHJsLUFsdC1CYWNrc3BhY2VcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yKSB7IGVkaXRvci5yZW1vdmVXb3JkTGVmdCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInJlbW92ZXdvcmRyaWdodFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1EZWxldGVcIiwgXCJBbHQtRGVsZXRlXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IucmVtb3ZlV29yZFJpZ2h0KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwib3V0ZGVudFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiU2hpZnQtVGFiXCIsIFwiU2hpZnQtVGFiXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuYmxvY2tPdXRkZW50KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uUGFydFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImluZGVudFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiVGFiXCIsIFwiVGFiXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuaW5kZW50KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uUGFydFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImJsb2Nrb3V0ZGVudFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1bXCIsIFwiQ3RybC1bXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuYmxvY2tPdXRkZW50KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hMaW5lXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcInNlbGVjdGlvblBhcnRcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJibG9ja2luZGVudFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1dXCIsIFwiQ3RybC1dXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IuYmxvY2tJbmRlbnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaExpbmVcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uUGFydFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImluc2VydHN0cmluZ1wiLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvciwgc3RyOiBzdHJpbmcpIHsgZWRpdG9yLmluc2VydChzdHIpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImluc2VydHRleHRcIixcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IsIGFyZ3M6IHsgdGV4dD86IHN0cmluZzsgdGltZXM/OiBudW1iZXIgfSkge1xuICAgICAgICAgICAgZWRpdG9yLmluc2VydChzdHJpbmdSZXBlYXQoYXJncy50ZXh0IHx8IFwiXCIsIGFyZ3MudGltZXMgfHwgMSkpO1xuICAgICAgICB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNwbGl0bGluZVwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KG51bGwsIFwiQ3RybC1PXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3Iuc3BsaXRMaW5lKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidHJhbnNwb3NlbGV0dGVyc1wiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1UXCIsIFwiQ3RybC1UXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IudHJhbnNwb3NlTGV0dGVycygpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHsgLyplZGl0b3IudHJhbnNwb3NlU2VsZWN0aW9ucygxKTsqLyB9LFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ0b3VwcGVyY2FzZVwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1VXCIsIFwiQ3RybC1VXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IudG9VcHBlckNhc2UoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ0b2xvd2VyY2FzZVwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1TaGlmdC1VXCIsIFwiQ3RybC1TaGlmdC1VXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikgeyBlZGl0b3IudG9Mb3dlckNhc2UoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJleHBhbmR0b2xpbmVcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtTFwiLCBcIkNvbW1hbmQtU2hpZnQtTFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcblxuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gcmFuZ2UuZW5kLmNvbHVtbiA9IDA7XG4gICAgICAgICAgICByYW5nZS5lbmQucm93Kys7XG4gICAgICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLnNldFJhbmdlKHJhbmdlLCBmYWxzZSk7XG4gICAgICAgIH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImpvaW5saW5lc1wiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KG51bGwsIG51bGwpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICAgICAgdmFyIGlzQmFja3dhcmRzID0gZWRpdG9yLnNlbGVjdGlvbi5pc0JhY2t3YXJkcygpO1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvblN0YXJ0ID0gaXNCYWNrd2FyZHMgPyBlZGl0b3Iuc2VsZWN0aW9uLmdldFNlbGVjdGlvbkxlYWQoKSA6IGVkaXRvci5zZWxlY3Rpb24uZ2V0U2VsZWN0aW9uQW5jaG9yKCk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uRW5kID0gaXNCYWNrd2FyZHMgPyBlZGl0b3Iuc2VsZWN0aW9uLmdldFNlbGVjdGlvbkFuY2hvcigpIDogZWRpdG9yLnNlbGVjdGlvbi5nZXRTZWxlY3Rpb25MZWFkKCk7XG4gICAgICAgICAgICB2YXIgZmlyc3RMaW5lRW5kQ29sID0gZWRpdG9yLnNlc3Npb24uZG9jLmdldExpbmUoc2VsZWN0aW9uU3RhcnQucm93KS5sZW5ndGhcbiAgICAgICAgICAgIHZhciBzZWxlY3RlZFRleHQgPSBlZGl0b3Iuc2Vzc2lvbi5kb2MuZ2V0VGV4dFJhbmdlKGVkaXRvci5zZWxlY3Rpb24uZ2V0UmFuZ2UoKSk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0ZWRDb3VudCA9IHNlbGVjdGVkVGV4dC5yZXBsYWNlKC9cXG5cXHMqLywgXCIgXCIpLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciBpbnNlcnRMaW5lID0gZWRpdG9yLnNlc3Npb24uZG9jLmdldExpbmUoc2VsZWN0aW9uU3RhcnQucm93KTtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHNlbGVjdGlvblN0YXJ0LnJvdyArIDE7IGkgPD0gc2VsZWN0aW9uRW5kLnJvdyArIDE7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBjdXJMaW5lID0gc3RyaW5nVHJpbUxlZnQoc3RyaW5nVHJpbVJpZ2h0KGVkaXRvci5zZXNzaW9uLmRvYy5nZXRMaW5lKGkpKSk7XG4gICAgICAgICAgICAgICAgaWYgKGN1ckxpbmUubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGN1ckxpbmUgPSBcIiBcIiArIGN1ckxpbmU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGluc2VydExpbmUgKz0gY3VyTGluZTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChzZWxlY3Rpb25FbmQucm93ICsgMSA8IChlZGl0b3Iuc2Vzc2lvbi5kb2MuZ2V0TGVuZ3RoKCkgLSAxKSkge1xuICAgICAgICAgICAgICAgIC8vIERvbid0IGluc2VydCBhIG5ld2xpbmUgYXQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnRcbiAgICAgICAgICAgICAgICBpbnNlcnRMaW5lICs9IGVkaXRvci5zZXNzaW9uLmRvYy5nZXROZXdMaW5lQ2hhcmFjdGVyKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVkaXRvci5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICAgICAgZWRpdG9yLnNlc3Npb24uZG9jLnJlcGxhY2UobmV3IFJhbmdlKHNlbGVjdGlvblN0YXJ0LnJvdywgMCwgc2VsZWN0aW9uRW5kLnJvdyArIDIsIDApLCBpbnNlcnRMaW5lKTtcblxuICAgICAgICAgICAgaWYgKHNlbGVjdGVkQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgICAgLy8gU2VsZWN0IHRoZSB0ZXh0IHRoYXQgd2FzIHByZXZpb3VzbHkgc2VsZWN0ZWRcbiAgICAgICAgICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLm1vdmVDdXJzb3JUbyhzZWxlY3Rpb25TdGFydC5yb3csIHNlbGVjdGlvblN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RUbyhzZWxlY3Rpb25TdGFydC5yb3csIHNlbGVjdGlvblN0YXJ0LmNvbHVtbiArIHNlbGVjdGVkQ291bnQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgam9pbmVkIGxpbmUgaGFkIHNvbWV0aGluZyBpbiBpdCwgc3RhcnQgdGhlIGN1cnNvciBhdCB0aGF0IHNvbWV0aGluZ1xuICAgICAgICAgICAgICAgIGZpcnN0TGluZUVuZENvbCA9IGVkaXRvci5zZXNzaW9uLmRvYy5nZXRMaW5lKHNlbGVjdGlvblN0YXJ0LnJvdykubGVuZ3RoID4gZmlyc3RMaW5lRW5kQ29sID8gKGZpcnN0TGluZUVuZENvbCArIDEpIDogZmlyc3RMaW5lRW5kQ29sO1xuICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24ubW92ZUN1cnNvclRvKHNlbGVjdGlvblN0YXJ0LnJvdywgZmlyc3RMaW5lRW5kQ29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJpbnZlcnRTZWxlY3Rpb25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShudWxsLCBudWxsKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgICAgIHZhciBlbmRSb3cgPSBlZGl0b3Iuc2Vzc2lvbi5kb2MuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgICAgICAgICAgdmFyIGVuZENvbCA9IGVkaXRvci5zZXNzaW9uLmRvYy5nZXRMaW5lKGVuZFJvdykubGVuZ3RoO1xuICAgICAgICAgICAgdmFyIHJhbmdlcyA9IGVkaXRvci5zZWxlY3Rpb24ucmFuZ2VMaXN0LnJhbmdlcztcbiAgICAgICAgICAgIHZhciBuZXdSYW5nZXM6IFJhbmdlW10gPSBbXTtcblxuICAgICAgICAgICAgLy8gSWYgbXVsdGlwbGUgc2VsZWN0aW9ucyBkb24ndCBleGlzdCwgcmFuZ2VMaXN0IHdpbGwgcmV0dXJuIDAgc28gcmVwbGFjZSB3aXRoIHNpbmdsZSByYW5nZVxuICAgICAgICAgICAgaWYgKHJhbmdlcy5sZW5ndGggPCAxKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2VzID0gW2VkaXRvci5zZWxlY3Rpb24uZ2V0UmFuZ2UoKV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPT0gKHJhbmdlcy5sZW5ndGggLSAxKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgbGFzdCBzZWxlY3Rpb24gbXVzdCBjb25uZWN0IHRvIHRoZSBlbmQgb2YgdGhlIGRvY3VtZW50LCB1bmxlc3MgaXQgYWxyZWFkeSBkb2VzXG4gICAgICAgICAgICAgICAgICAgIGlmICghKHJhbmdlc1tpXS5lbmQucm93ID09PSBlbmRSb3cgJiYgcmFuZ2VzW2ldLmVuZC5jb2x1bW4gPT09IGVuZENvbCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld1Jhbmdlcy5wdXNoKG5ldyBSYW5nZShyYW5nZXNbaV0uZW5kLnJvdywgcmFuZ2VzW2ldLmVuZC5jb2x1bW4sIGVuZFJvdywgZW5kQ29sKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgZmlyc3Qgc2VsZWN0aW9uIG11c3QgY29ubmVjdCB0byB0aGUgc3RhcnQgb2YgdGhlIGRvY3VtZW50LCB1bmxlc3MgaXQgYWxyZWFkeSBkb2VzXG4gICAgICAgICAgICAgICAgICAgIGlmICghKHJhbmdlc1tpXS5zdGFydC5yb3cgPT09IDAgJiYgcmFuZ2VzW2ldLnN0YXJ0LmNvbHVtbiA9PT0gMCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld1Jhbmdlcy5wdXNoKG5ldyBSYW5nZSgwLCAwLCByYW5nZXNbaV0uc3RhcnQucm93LCByYW5nZXNbaV0uc3RhcnQuY29sdW1uKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBuZXdSYW5nZXMucHVzaChuZXcgUmFuZ2UocmFuZ2VzW2kgLSAxXS5lbmQucm93LCByYW5nZXNbaSAtIDFdLmVuZC5jb2x1bW4sIHJhbmdlc1tpXS5zdGFydC5yb3csIHJhbmdlc1tpXS5zdGFydC5jb2x1bW4pKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVkaXRvci5leGl0TXVsdGlTZWxlY3RNb2RlKCk7XG4gICAgICAgICAgICBlZGl0b3IuY2xlYXJTZWxlY3Rpb24oKTtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuZXdSYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLmFkZFJhbmdlKG5ld1Jhbmdlc1tpXSwgZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwibm9uZVwiXG4gICAgfV07XG5cbmV4cG9ydCBkZWZhdWx0IGNvbW1hbmRzO1xuIl19