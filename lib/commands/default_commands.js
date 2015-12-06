import { stringRepeat, stringTrimLeft, stringTrimRight } from "../lib/lang";
import { loadModule } from "../config";
import { Range } from "../range";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdF9jb21tYW5kcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jb21tYW5kcy9kZWZhdWx0X2NvbW1hbmRzLnRzIl0sIm5hbWVzIjpbImJpbmRLZXkiXSwibWFwcGluZ3MiOiJPQThCTyxFQUFDLFlBQVksRUFBRSxjQUFjLEVBQUUsZUFBZSxFQUFDLE1BQU0sYUFBYTtPQUNsRSxFQUFDLFVBQVUsRUFBQyxNQUFNLFdBQVc7T0FDN0IsRUFBQyxLQUFLLEVBQUMsTUFBTSxVQUFVO0FBSTlCLGlCQUFpQixHQUFXLEVBQUUsR0FBVztJQUNyQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsQ0FBQ0E7QUFDbENBLENBQUNBO0FBTUQsSUFBSSxRQUFRLEdBQWMsQ0FBQztRQUN2QixJQUFJLEVBQUUsa0JBQWtCO1FBQ3hCLE9BQU8sRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQztRQUN2QyxJQUFJLEVBQUUsVUFBUyxNQUFNO1lBQ2pCLFVBQVUsQ0FBQyx1QkFBdUIsRUFBRSxVQUFTLE1BQU07Z0JBQy9DLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3BCLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzlCLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUNELFFBQVEsRUFBRSxJQUFJO0tBQ2pCLEVBQUU7UUFDSyxJQUFJLEVBQUUsZUFBZTtRQUNyQixPQUFPLEVBQUUsT0FBTyxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUM7UUFDbkMsSUFBSSxFQUFFLFVBQVMsTUFBTTtZQUNqQixVQUFVLENBQUMsc0JBQXNCLEVBQUUsVUFBUyxNQUFNO2dCQUM5QyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN0QyxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFDRCxjQUFjLEVBQUUs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Q0FBQyxjQUFjLEVBQUUsQ0FBQztZQUV4QixHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUN4QyxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDbkQsQ0FBQztRQUNMLENBQUM7UUFDRCxRQUFRLEVBQUUsSUFBSTtRQUNkLGNBQWMsRUFBRSxNQUFNO0tBQ3pCLENBQUMsQ0FBQztBQUVQLGVBQWUsUUFBUSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKiBcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblxuaW1wb3J0IHtzdHJpbmdSZXBlYXQsIHN0cmluZ1RyaW1MZWZ0LCBzdHJpbmdUcmltUmlnaHR9IGZyb20gXCIuLi9saWIvbGFuZ1wiO1xuaW1wb3J0IHtsb2FkTW9kdWxlfSBmcm9tIFwiLi4vY29uZmlnXCI7XG5pbXBvcnQge1JhbmdlfSBmcm9tIFwiLi4vcmFuZ2VcIjtcbmltcG9ydCBDb21tYW5kIGZyb20gJy4vQ29tbWFuZCc7XG5pbXBvcnQgRWRpdG9yIGZyb20gJy4uL0VkaXRvcic7XG5cbmZ1bmN0aW9uIGJpbmRLZXkod2luOiBzdHJpbmcsIG1hYzogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHsgd2luOiB3aW4sIG1hYzogbWFjIH07XG59XG5cbi8qXG4gICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwifFwiZm9yRWFjaExpbmVcInxmdW5jdGlvbnx1bmRlZmluZWQsXG4gICAgc2Nyb2xsSW50b1ZpZXc6IHRydWV8XCJjdXJzb3JcInxcImNlbnRlclwifFwic2VsZWN0aW9uUGFydFwiXG4qL1xudmFyIGNvbW1hbmRzOiBDb21tYW5kW10gPSBbe1xuICAgIG5hbWU6IFwic2hvd1NldHRpbmdzTWVudVwiLFxuICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLSxcIiwgXCJDb21tYW5kLSxcIiksXG4gICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7XG4gICAgICAgIGxvYWRNb2R1bGUoXCJhY2UvZXh0L3NldHRpbmdzX21lbnVcIiwgZnVuY3Rpb24obW9kdWxlKSB7XG4gICAgICAgICAgICBtb2R1bGUuaW5pdChlZGl0b3IpO1xuICAgICAgICAgICAgZWRpdG9yLnNob3dTZXR0aW5nc01lbnUoKTtcbiAgICAgICAgfSk7XG4gICAgfSxcbiAgICByZWFkT25seTogdHJ1ZVxufSwge1xuICAgICAgICBuYW1lOiBcImdvVG9OZXh0RXJyb3JcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1FXCIsIFwiQ3RybC1FXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IvKjogRWRpdG9yKi8pIHtcbiAgICAgICAgICAgIGxvYWRNb2R1bGUoXCJhY2UvZXh0L2Vycm9yX21hcmtlclwiLCBmdW5jdGlvbihtb2R1bGUpIHtcbiAgICAgICAgICAgICAgICBtb2R1bGUuc2hvd0Vycm9yTWFya2VyKGVkaXRvciwgMSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiYW5pbWF0ZVwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb1RvUHJldmlvdXNFcnJvclwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LVNoaWZ0LUVcIiwgXCJDdHJsLVNoaWZ0LUVcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykge1xuICAgICAgICAgICAgbG9hZE1vZHVsZShcImFjZS9leHQvZXJyb3JfbWFya2VyXCIsIGZ1bmN0aW9uKG1vZHVsZSkge1xuICAgICAgICAgICAgICAgIG1vZHVsZS5zaG93RXJyb3JNYXJrZXIoZWRpdG9yLCAtMSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiYW5pbWF0ZVwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3RhbGxcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtQVwiLCBcIkNvbW1hbmQtQVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5zZWxlY3RBbGwoKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiY2VudGVyc2VsZWN0aW9uXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkobnVsbCwgXCJDdHJsLUxcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3IuY2VudGVyU2VsZWN0aW9uKCk7IH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImdvdG9saW5lXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUxcIiwgXCJDb21tYW5kLUxcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBwYXJzZUludChwcm9tcHQoXCJFbnRlciBsaW5lIG51bWJlcjpcIiksIDEwKTtcbiAgICAgICAgICAgIGlmICghaXNOYU4obGluZSkpIHtcbiAgICAgICAgICAgICAgICBlZGl0b3IuZ290b0xpbmUobGluZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImZvbGRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1MfEN0cmwtRjFcIiwgXCJDb21tYW5kLUFsdC1MfENvbW1hbmQtRjFcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3Iuc2Vzc2lvbi50b2dnbGVGb2xkKGZhbHNlKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY2VudGVyXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInVuZm9sZFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LVNoaWZ0LUx8Q3RybC1TaGlmdC1GMVwiLCBcIkNvbW1hbmQtQWx0LVNoaWZ0LUx8Q29tbWFuZC1TaGlmdC1GMVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5zZXNzaW9uLnRvZ2dsZUZvbGQodHJ1ZSk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ0b2dnbGVGb2xkV2lkZ2V0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJGMlwiLCBcIkYyXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IvKjogRWRpdG9yKi8pIHsgZWRpdG9yLnNlc3Npb24udG9nZ2xlRm9sZFdpZGdldCgpOyB9LFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjZW50ZXJcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidG9nZ2xlUGFyZW50Rm9sZFdpZGdldFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LUYyXCIsIFwiQWx0LUYyXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IvKjogRWRpdG9yKi8pIHsgZWRpdG9yLnNlc3Npb24udG9nZ2xlRm9sZFdpZGdldCh0cnVlKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY2VudGVyXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImZvbGRhbGxcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtQWx0LTBcIiwgXCJDdHJsLUNvbW1hbmQtT3B0aW9uLTBcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3Iuc2Vzc2lvbi5mb2xkQWxsKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJmb2xkT3RoZXJcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC0wXCIsIFwiQ29tbWFuZC1PcHRpb24tMFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7XG4gICAgICAgICAgICBlZGl0b3Iuc2Vzc2lvbi5mb2xkQWxsKCk7XG4gICAgICAgICAgICBlZGl0b3Iuc2Vzc2lvbi51bmZvbGQoZWRpdG9yLnNlbGVjdGlvbi5nZXRBbGxSYW5nZXMoKSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ1bmZvbGRhbGxcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC0wXCIsIFwiQ29tbWFuZC1PcHRpb24tU2hpZnQtMFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5zZXNzaW9uLnVuZm9sZCgpOyB9LFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjZW50ZXJcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZmluZG5leHRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtS1wiLCBcIkNvbW1hbmQtR1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5maW5kTmV4dCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJmaW5kcHJldmlvdXNcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtS1wiLCBcIkNvbW1hbmQtU2hpZnQtR1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5maW5kUHJldmlvdXMoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjZW50ZXJcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0T3JGaW5kTmV4dFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LUtcIiwgXCJDdHJsLUdcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykge1xuICAgICAgICAgICAgaWYgKGVkaXRvci5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RXb3JkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBlZGl0b3IuZmluZE5leHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0T3JGaW5kUHJldmlvdXNcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC1LXCIsIFwiQ3RybC1TaGlmdC1HXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IvKjogRWRpdG9yKi8pIHtcbiAgICAgICAgICAgIGlmIChlZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2VsZWN0V29yZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLmZpbmRQcmV2aW91cygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJmaW5kXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUZcIiwgXCJDb21tYW5kLUZcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykge1xuICAgICAgICAgICAgbG9hZE1vZHVsZShcImFjZS9leHQvc2VhcmNoYm94XCIsIGZ1bmN0aW9uKGUpIHsgZS5TZWFyY2goZWRpdG9yKSB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwib3ZlcndyaXRlXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJJbnNlcnRcIiwgXCJJbnNlcnRcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3IudG9nZ2xlT3ZlcndyaXRlKCk7IH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHRvc3RhcnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtSG9tZVwiLCBcIkNvbW1hbmQtU2hpZnQtVXBcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0RmlsZVN0YXJ0KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWUsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImFuaW1hdGVcIixcbiAgICAgICAgYWNlQ29tbWFuZEdyb3VwOiBcImZpbGVKdW1wXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b3N0YXJ0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUhvbWVcIiwgXCJDb21tYW5kLUhvbWV8Q29tbWFuZC1VcFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5uYXZpZ2F0ZUZpbGVTdGFydCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJhbmltYXRlXCIsXG4gICAgICAgIGFjZUNvbW1hbmRHcm91cDogXCJmaWxlSnVtcFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHVwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJTaGlmdC1VcFwiLCBcIlNoaWZ0LVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdFVwKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ29saW5ldXBcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlVwXCIsIFwiVXB8Q3RybC1QXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IsIGFyZ3MpIHsgZWRpdG9yLm5hdmlnYXRlVXAoYXJncy50aW1lcyk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0dG9lbmRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtRW5kXCIsIFwiQ29tbWFuZC1TaGlmdC1Eb3duXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdEZpbGVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiYW5pbWF0ZVwiLFxuICAgICAgICBhY2VDb21tYW5kR3JvdXA6IFwiZmlsZUp1bXBcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvZW5kXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUVuZFwiLCBcIkNvbW1hbmQtRW5kfENvbW1hbmQtRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5uYXZpZ2F0ZUZpbGVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiYW5pbWF0ZVwiLFxuICAgICAgICBhY2VDb21tYW5kR3JvdXA6IFwiZmlsZUp1bXBcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3Rkb3duXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJTaGlmdC1Eb3duXCIsIFwiU2hpZnQtRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3REb3duKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImdvbGluZWRvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkRvd25cIiwgXCJEb3dufEN0cmwtTlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLCBhcmdzKSB7IGVkaXRvci5uYXZpZ2F0ZURvd24oYXJncy50aW1lcyk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHdvcmRsZWZ0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LUxlZnRcIiwgXCJPcHRpb24tU2hpZnQtTGVmdFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RXb3JkTGVmdCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3Rvd29yZGxlZnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtTGVmdFwiLCBcIk9wdGlvbi1MZWZ0XCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLm5hdmlnYXRlV29yZExlZnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0dG9saW5lc3RhcnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC1MZWZ0XCIsIFwiQ29tbWFuZC1TaGlmdC1MZWZ0XCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdExpbmVTdGFydCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvbGluZXN0YXJ0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtTGVmdHxIb21lXCIsIFwiQ29tbWFuZC1MZWZ0fEhvbWV8Q3RybC1BXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLm5hdmlnYXRlTGluZVN0YXJ0KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdGxlZnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlNoaWZ0LUxlZnRcIiwgXCJTaGlmdC1MZWZ0XCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdExlZnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b2xlZnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkxlZnRcIiwgXCJMZWZ0fEN0cmwtQlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLCBhcmdzKSB7IGVkaXRvci5uYXZpZ2F0ZUxlZnQoYXJncy50aW1lcyk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHdvcmRyaWdodFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1TaGlmdC1SaWdodFwiLCBcIk9wdGlvbi1TaGlmdC1SaWdodFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RXb3JkUmlnaHQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b3dvcmRyaWdodFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1SaWdodFwiLCBcIk9wdGlvbi1SaWdodFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5uYXZpZ2F0ZVdvcmRSaWdodCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3R0b2xpbmVlbmRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC1SaWdodFwiLCBcIkNvbW1hbmQtU2hpZnQtUmlnaHRcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0TGluZUVuZCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvbGluZWVuZFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LVJpZ2h0fEVuZFwiLCBcIkNvbW1hbmQtUmlnaHR8RW5kfEN0cmwtRVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5uYXZpZ2F0ZUxpbmVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0cmlnaHRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlNoaWZ0LVJpZ2h0XCIsIFwiU2hpZnQtUmlnaHRcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0UmlnaHQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b3JpZ2h0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJSaWdodFwiLCBcIlJpZ2h0fEN0cmwtRlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLCBhcmdzKSB7IGVkaXRvci5uYXZpZ2F0ZVJpZ2h0KGFyZ3MudGltZXMpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3RwYWdlZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBcIlNoaWZ0LVBhZ2VEb3duXCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3Iuc2VsZWN0UGFnZURvd24oKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicGFnZWRvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShudWxsLCBcIk9wdGlvbi1QYWdlRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5zY3JvbGxQYWdlRG93bigpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvcGFnZWRvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlBhZ2VEb3duXCIsIFwiUGFnZURvd258Q3RybC1WXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdvdG9QYWdlRG93bigpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3RwYWdldXBcIixcbiAgICAgICAgYmluZEtleTogXCJTaGlmdC1QYWdlVXBcIixcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5zZWxlY3RQYWdlVXAoKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicGFnZXVwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkobnVsbCwgXCJPcHRpb24tUGFnZVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnNjcm9sbFBhZ2VVcCgpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvcGFnZXVwXCIsXG4gICAgICAgIGJpbmRLZXk6IFwiUGFnZVVwXCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuZ290b1BhZ2VVcCgpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzY3JvbGx1cFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1VcFwiLCBudWxsKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZSkgeyBlLnJlbmRlcmVyLnNjcm9sbEJ5KDAsIC0yICogZS5yZW5kZXJlci5sYXllckNvbmZpZy5saW5lSGVpZ2h0KTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2Nyb2xsZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1Eb3duXCIsIG51bGwpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlKSB7IGUucmVuZGVyZXIuc2Nyb2xsQnkoMCwgMiAqIGUucmVuZGVyZXIubGF5ZXJDb25maWcubGluZUhlaWdodCk7IH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdGxpbmVzdGFydFwiLFxuICAgICAgICBiaW5kS2V5OiBcIlNoaWZ0LUhvbWVcIixcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RMaW5lU3RhcnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0bGluZWVuZFwiLFxuICAgICAgICBiaW5kS2V5OiBcIlNoaWZ0LUVuZFwiLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdExpbmVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidG9nZ2xlcmVjb3JkaW5nXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUFsdC1FXCIsIFwiQ29tbWFuZC1PcHRpb24tRVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5jb21tYW5kcy50b2dnbGVSZWNvcmRpbmcoZWRpdG9yKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicmVwbGF5bWFjcm9cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtRVwiLCBcIkNvbW1hbmQtU2hpZnQtRVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5jb21tYW5kcy5yZXBsYXkoZWRpdG9yKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwianVtcHRvbWF0Y2hpbmdcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtUFwiLCBcIkN0cmwtUFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5qdW1wVG9NYXRjaGluZygpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHRvbWF0Y2hpbmdcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtUFwiLCBcIkN0cmwtU2hpZnQtUFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5qdW1wVG9NYXRjaGluZyh0cnVlKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJwYXNzS2V5c1RvQnJvd3NlclwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwibnVsbFwiLCBcIm51bGxcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKCkgeyB9LFxuICAgICAgICBwYXNzRXZlbnQ6IHRydWUsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSxcblxuICAgIC8vIGNvbW1hbmRzIGRpc2FibGVkIGluIHJlYWRPbmx5IG1vZGVcbiAgICB7XG4gICAgICAgIG5hbWU6IFwiY3V0XCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgICAgICBlZGl0b3IuX2VtaXQoXCJjdXRcIiwgcmFuZ2UpO1xuXG4gICAgICAgICAgICBpZiAoIWVkaXRvci5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgICAgICAgICBlZGl0b3IuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJyZW1vdmVsaW5lXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLURcIiwgXCJDb21tYW5kLURcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IucmVtb3ZlTGluZXMoKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hMaW5lXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZHVwbGljYXRlU2VsZWN0aW9uXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LURcIiwgXCJDb21tYW5kLVNoaWZ0LURcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuZHVwbGljYXRlU2VsZWN0aW9uKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic29ydGxpbmVzXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUFsdC1TXCIsIFwiQ29tbWFuZC1BbHQtU1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5zb3J0TGluZXMoKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uXCIsXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hMaW5lXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidG9nZ2xlY29tbWVudFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC0vXCIsIFwiQ29tbWFuZC0vXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnRvZ2dsZUNvbW1lbnRMaW5lcygpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoTGluZVwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJzZWxlY3Rpb25QYXJ0XCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidG9nZ2xlQmxvY2tDb21tZW50XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LS9cIiwgXCJDb21tYW5kLVNoaWZ0LS9cIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IudG9nZ2xlQmxvY2tDb21tZW50KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uUGFydFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm1vZGlmeU51bWJlclVwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LVVwXCIsIFwiQWx0LVNoaWZ0LVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLm1vZGlmeU51bWJlcigxKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm1vZGlmeU51bWJlckRvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtRG93blwiLCBcIkFsdC1TaGlmdC1Eb3duXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLm1vZGlmeU51bWJlcigtMSk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJyZXBsYWNlXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUhcIiwgXCJDb21tYW5kLU9wdGlvbi1GXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHtcbiAgICAgICAgICAgIGxvYWRNb2R1bGUoXCJhY2UvZXh0L3NlYXJjaGJveFwiLCBmdW5jdGlvbihlKSB7IGUuU2VhcmNoKGVkaXRvciwgdHJ1ZSkgfSk7XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidW5kb1wiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1aXCIsIFwiQ29tbWFuZC1aXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnVuZG8oKTsgfVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJyZWRvXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LVp8Q3RybC1ZXCIsIFwiQ29tbWFuZC1TaGlmdC1afENvbW1hbmQtWVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5yZWRvKCk7IH1cbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiY29weWxpbmVzdXBcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC1VcFwiLCBcIkNvbW1hbmQtT3B0aW9uLVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmNvcHlMaW5lc1VwKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm1vdmVsaW5lc3VwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtVXBcIiwgXCJPcHRpb24tVXBcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IubW92ZUxpbmVzVXAoKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiY29weWxpbmVzZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LVNoaWZ0LURvd25cIiwgXCJDb21tYW5kLU9wdGlvbi1Eb3duXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmNvcHlMaW5lc0Rvd24oKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwibW92ZWxpbmVzZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LURvd25cIiwgXCJPcHRpb24tRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5tb3ZlTGluZXNEb3duKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImRlbFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiRGVsZXRlXCIsIFwiRGVsZXRlfEN0cmwtRHxTaGlmdC1EZWxldGVcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IucmVtb3ZlKFwicmlnaHRcIik7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiYmFja3NwYWNlXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXG4gICAgICAgICAgICBcIlNoaWZ0LUJhY2tzcGFjZXxCYWNrc3BhY2VcIixcbiAgICAgICAgICAgIFwiQ3RybC1CYWNrc3BhY2V8U2hpZnQtQmFja3NwYWNlfEJhY2tzcGFjZXxDdHJsLUhcIlxuICAgICAgICApLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnJlbW92ZShcImxlZnRcIik7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiY3V0X29yX2RlbGV0ZVwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiU2hpZnQtRGVsZXRlXCIsIG51bGwpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHtcbiAgICAgICAgICAgIGlmIChlZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgICAgIGVkaXRvci5yZW1vdmUoXCJsZWZ0XCIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicmVtb3ZldG9saW5lc3RhcnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1CYWNrc3BhY2VcIiwgXCJDb21tYW5kLUJhY2tzcGFjZVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5yZW1vdmVUb0xpbmVTdGFydCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInJlbW92ZXRvbGluZWVuZFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LURlbGV0ZVwiLCBcIkN0cmwtS1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5yZW1vdmVUb0xpbmVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJyZW1vdmV3b3JkbGVmdFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1CYWNrc3BhY2VcIiwgXCJBbHQtQmFja3NwYWNlfEN0cmwtQWx0LUJhY2tzcGFjZVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5yZW1vdmVXb3JkTGVmdCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInJlbW92ZXdvcmRyaWdodFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1EZWxldGVcIiwgXCJBbHQtRGVsZXRlXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnJlbW92ZVdvcmRSaWdodCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm91dGRlbnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlNoaWZ0LVRhYlwiLCBcIlNoaWZ0LVRhYlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5ibG9ja091dGRlbnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJzZWxlY3Rpb25QYXJ0XCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiaW5kZW50XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJUYWJcIiwgXCJUYWJcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuaW5kZW50KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uUGFydFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImJsb2Nrb3V0ZGVudFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1bXCIsIFwiQ3RybC1bXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmJsb2NrT3V0ZGVudCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoTGluZVwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJzZWxlY3Rpb25QYXJ0XCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiYmxvY2tpbmRlbnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtXVwiLCBcIkN0cmwtXVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5ibG9ja0luZGVudCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoTGluZVwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJzZWxlY3Rpb25QYXJ0XCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiaW5zZXJ0c3RyaW5nXCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvciwgc3RyKSB7IGVkaXRvci5pbnNlcnQoc3RyKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJpbnNlcnR0ZXh0XCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvciwgYXJncykge1xuICAgICAgICAgICAgZWRpdG9yLmluc2VydChzdHJpbmdSZXBlYXQoYXJncy50ZXh0IHx8IFwiXCIsIGFyZ3MudGltZXMgfHwgMSkpO1xuICAgICAgICB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNwbGl0bGluZVwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KG51bGwsIFwiQ3RybC1PXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnNwbGl0TGluZSgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInRyYW5zcG9zZWxldHRlcnNcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtVFwiLCBcIkN0cmwtVFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci50cmFuc3Bvc2VMZXR0ZXJzKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnRyYW5zcG9zZVNlbGVjdGlvbnMoMSk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInRvdXBwZXJjYXNlXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVVcIiwgXCJDdHJsLVVcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IudG9VcHBlckNhc2UoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ0b2xvd2VyY2FzZVwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1TaGlmdC1VXCIsIFwiQ3RybC1TaGlmdC1VXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnRvTG93ZXJDYXNlKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZXhwYW5kdG9saW5lXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LUxcIiwgXCJDb21tYW5kLVNoaWZ0LUxcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuXG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSByYW5nZS5lbmQuY29sdW1uID0gMDtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3crKztcbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2V0UmFuZ2UocmFuZ2UsIGZhbHNlKTtcbiAgICAgICAgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiam9pbmxpbmVzXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkobnVsbCwgbnVsbCksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikge1xuICAgICAgICAgICAgdmFyIGlzQmFja3dhcmRzID0gZWRpdG9yLnNlbGVjdGlvbi5pc0JhY2t3YXJkcygpO1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvblN0YXJ0ID0gaXNCYWNrd2FyZHMgPyBlZGl0b3Iuc2VsZWN0aW9uLmdldFNlbGVjdGlvbkxlYWQoKSA6IGVkaXRvci5zZWxlY3Rpb24uZ2V0U2VsZWN0aW9uQW5jaG9yKCk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uRW5kID0gaXNCYWNrd2FyZHMgPyBlZGl0b3Iuc2VsZWN0aW9uLmdldFNlbGVjdGlvbkFuY2hvcigpIDogZWRpdG9yLnNlbGVjdGlvbi5nZXRTZWxlY3Rpb25MZWFkKCk7XG4gICAgICAgICAgICB2YXIgZmlyc3RMaW5lRW5kQ29sID0gZWRpdG9yLnNlc3Npb24uZG9jLmdldExpbmUoc2VsZWN0aW9uU3RhcnQucm93KS5sZW5ndGhcbiAgICAgICAgICAgIHZhciBzZWxlY3RlZFRleHQgPSBlZGl0b3Iuc2Vzc2lvbi5kb2MuZ2V0VGV4dFJhbmdlKGVkaXRvci5zZWxlY3Rpb24uZ2V0UmFuZ2UoKSk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0ZWRDb3VudCA9IHNlbGVjdGVkVGV4dC5yZXBsYWNlKC9cXG5cXHMqLywgXCIgXCIpLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciBpbnNlcnRMaW5lID0gZWRpdG9yLnNlc3Npb24uZG9jLmdldExpbmUoc2VsZWN0aW9uU3RhcnQucm93KTtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHNlbGVjdGlvblN0YXJ0LnJvdyArIDE7IGkgPD0gc2VsZWN0aW9uRW5kLnJvdyArIDE7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBjdXJMaW5lID0gc3RyaW5nVHJpbUxlZnQoc3RyaW5nVHJpbVJpZ2h0KGVkaXRvci5zZXNzaW9uLmRvYy5nZXRMaW5lKGkpKSk7XG4gICAgICAgICAgICAgICAgaWYgKGN1ckxpbmUubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGN1ckxpbmUgPSBcIiBcIiArIGN1ckxpbmU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGluc2VydExpbmUgKz0gY3VyTGluZTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChzZWxlY3Rpb25FbmQucm93ICsgMSA8IChlZGl0b3Iuc2Vzc2lvbi5kb2MuZ2V0TGVuZ3RoKCkgLSAxKSkge1xuICAgICAgICAgICAgICAgIC8vIERvbid0IGluc2VydCBhIG5ld2xpbmUgYXQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnRcbiAgICAgICAgICAgICAgICBpbnNlcnRMaW5lICs9IGVkaXRvci5zZXNzaW9uLmRvYy5nZXROZXdMaW5lQ2hhcmFjdGVyKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVkaXRvci5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICAgICAgZWRpdG9yLnNlc3Npb24uZG9jLnJlcGxhY2UobmV3IFJhbmdlKHNlbGVjdGlvblN0YXJ0LnJvdywgMCwgc2VsZWN0aW9uRW5kLnJvdyArIDIsIDApLCBpbnNlcnRMaW5lKTtcblxuICAgICAgICAgICAgaWYgKHNlbGVjdGVkQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgICAgLy8gU2VsZWN0IHRoZSB0ZXh0IHRoYXQgd2FzIHByZXZpb3VzbHkgc2VsZWN0ZWRcbiAgICAgICAgICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLm1vdmVDdXJzb3JUbyhzZWxlY3Rpb25TdGFydC5yb3csIHNlbGVjdGlvblN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RUbyhzZWxlY3Rpb25TdGFydC5yb3csIHNlbGVjdGlvblN0YXJ0LmNvbHVtbiArIHNlbGVjdGVkQ291bnQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgam9pbmVkIGxpbmUgaGFkIHNvbWV0aGluZyBpbiBpdCwgc3RhcnQgdGhlIGN1cnNvciBhdCB0aGF0IHNvbWV0aGluZ1xuICAgICAgICAgICAgICAgIGZpcnN0TGluZUVuZENvbCA9IGVkaXRvci5zZXNzaW9uLmRvYy5nZXRMaW5lKHNlbGVjdGlvblN0YXJ0LnJvdykubGVuZ3RoID4gZmlyc3RMaW5lRW5kQ29sID8gKGZpcnN0TGluZUVuZENvbCArIDEpIDogZmlyc3RMaW5lRW5kQ29sO1xuICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24ubW92ZUN1cnNvclRvKHNlbGVjdGlvblN0YXJ0LnJvdywgZmlyc3RMaW5lRW5kQ29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJpbnZlcnRTZWxlY3Rpb25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShudWxsLCBudWxsKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7XG4gICAgICAgICAgICB2YXIgZW5kUm93ID0gZWRpdG9yLnNlc3Npb24uZG9jLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgICAgIHZhciBlbmRDb2wgPSBlZGl0b3Iuc2Vzc2lvbi5kb2MuZ2V0TGluZShlbmRSb3cpLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciByYW5nZXMgPSBlZGl0b3Iuc2VsZWN0aW9uLnJhbmdlTGlzdC5yYW5nZXM7XG4gICAgICAgICAgICB2YXIgbmV3UmFuZ2VzID0gW107XG5cbiAgICAgICAgICAgIC8vIElmIG11bHRpcGxlIHNlbGVjdGlvbnMgZG9uJ3QgZXhpc3QsIHJhbmdlTGlzdCB3aWxsIHJldHVybiAwIHNvIHJlcGxhY2Ugd2l0aCBzaW5nbGUgcmFuZ2VcbiAgICAgICAgICAgIGlmIChyYW5nZXMubGVuZ3RoIDwgMSkge1xuICAgICAgICAgICAgICAgIHJhbmdlcyA9IFtlZGl0b3Iuc2VsZWN0aW9uLmdldFJhbmdlKCldO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChpID09IChyYW5nZXMubGVuZ3RoIC0gMSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGxhc3Qgc2VsZWN0aW9uIG11c3QgY29ubmVjdCB0byB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudCwgdW5sZXNzIGl0IGFscmVhZHkgZG9lc1xuICAgICAgICAgICAgICAgICAgICBpZiAoIShyYW5nZXNbaV0uZW5kLnJvdyA9PT0gZW5kUm93ICYmIHJhbmdlc1tpXS5lbmQuY29sdW1uID09PSBlbmRDb2wpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdSYW5nZXMucHVzaChuZXcgUmFuZ2UocmFuZ2VzW2ldLmVuZC5yb3csIHJhbmdlc1tpXS5lbmQuY29sdW1uLCBlbmRSb3csIGVuZENvbCkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGZpcnN0IHNlbGVjdGlvbiBtdXN0IGNvbm5lY3QgdG8gdGhlIHN0YXJ0IG9mIHRoZSBkb2N1bWVudCwgdW5sZXNzIGl0IGFscmVhZHkgZG9lc1xuICAgICAgICAgICAgICAgICAgICBpZiAoIShyYW5nZXNbaV0uc3RhcnQucm93ID09PSAwICYmIHJhbmdlc1tpXS5zdGFydC5jb2x1bW4gPT09IDApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdSYW5nZXMucHVzaChuZXcgUmFuZ2UoMCwgMCwgcmFuZ2VzW2ldLnN0YXJ0LnJvdywgcmFuZ2VzW2ldLnN0YXJ0LmNvbHVtbikpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3UmFuZ2VzLnB1c2gobmV3IFJhbmdlKHJhbmdlc1tpIC0gMV0uZW5kLnJvdywgcmFuZ2VzW2kgLSAxXS5lbmQuY29sdW1uLCByYW5nZXNbaV0uc3RhcnQucm93LCByYW5nZXNbaV0uc3RhcnQuY29sdW1uKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlZGl0b3IuZXhpdE11bHRpU2VsZWN0TW9kZSgpO1xuICAgICAgICAgICAgZWRpdG9yLmNsZWFyU2VsZWN0aW9uKCk7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbmV3UmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5hZGRSYW5nZShuZXdSYW5nZXNbaV0sIGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWUsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcIm5vbmVcIlxuICAgIH1dO1xuXG5leHBvcnQgZGVmYXVsdCBjb21tYW5kcztcbiJdfQ==