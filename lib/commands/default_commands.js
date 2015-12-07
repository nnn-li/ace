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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdF9jb21tYW5kcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jb21tYW5kcy9kZWZhdWx0X2NvbW1hbmRzLnRzIl0sIm5hbWVzIjpbImJpbmRLZXkiXSwibWFwcGluZ3MiOiJPQThCTyxFQUFDLFlBQVksRUFBRSxjQUFjLEVBQUUsZUFBZSxFQUFDLE1BQU0sYUFBYTtPQUNsRSxFQUFDLFVBQVUsRUFBQyxNQUFNLFdBQVc7T0FDN0IsS0FBSyxNQUFNLFVBQVU7QUFJNUIsaUJBQWlCLEdBQVcsRUFBRSxHQUFXO0lBQ3JDQSxNQUFNQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxDQUFDQTtBQUNsQ0EsQ0FBQ0E7QUFNRCxJQUFJLFFBQVEsR0FBYyxDQUFDO1FBQ3ZCLElBQUksRUFBRSxrQkFBa0I7UUFDeEIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDO1FBQ3ZDLElBQUksRUFBRSxVQUFTLE1BQU07WUFDakIsVUFBVSxDQUFDLHVCQUF1QixFQUFFLFVBQVMsTUFBTTtnQkFDL0MsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDcEIsTUFBTSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDOUIsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBQ0QsUUFBUSxFQUFFLElBQUk7S0FDakIsRUFBRTtRQUNLLElBQUksRUFBRSxlQUFlO1FBQ3JCLE9BQU8sRUFBRSxPQUFPLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQztRQUNuQyxJQUFJLEVBQUUsVUFBUyxNQUFNO1lBQ2pCLFVBQVUsQ0FBQyxzQkFBc0IsRUFBRSxVQUFTLE1BQU07Z0JBQzlDLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3RDLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUNELGNBQWMsRUFBRSxTQUFTO1FBQ3pC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RUFBRSxDQUFDO1lBRXhCLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ3hDLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNuRCxDQUFDO1FBQ0wsQ0FBQztRQUNELFFBQVEsRUFBRSxJQUFJO1FBQ2QsY0FBYyxFQUFFLE1BQU07S0FDekIsQ0FBQyxDQUFDO0FBRVAsZUFBZSxRQUFRLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqIFxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQge3N0cmluZ1JlcGVhdCwgc3RyaW5nVHJpbUxlZnQsIHN0cmluZ1RyaW1SaWdodH0gZnJvbSBcIi4uL2xpYi9sYW5nXCI7XG5pbXBvcnQge2xvYWRNb2R1bGV9IGZyb20gXCIuLi9jb25maWdcIjtcbmltcG9ydCBSYW5nZSBmcm9tIFwiLi4vUmFuZ2VcIjtcbmltcG9ydCBDb21tYW5kIGZyb20gJy4vQ29tbWFuZCc7XG5pbXBvcnQgRWRpdG9yIGZyb20gJy4uL0VkaXRvcic7XG5cbmZ1bmN0aW9uIGJpbmRLZXkod2luOiBzdHJpbmcsIG1hYzogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHsgd2luOiB3aW4sIG1hYzogbWFjIH07XG59XG5cbi8qXG4gICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwifFwiZm9yRWFjaExpbmVcInxmdW5jdGlvbnx1bmRlZmluZWQsXG4gICAgc2Nyb2xsSW50b1ZpZXc6IHRydWV8XCJjdXJzb3JcInxcImNlbnRlclwifFwic2VsZWN0aW9uUGFydFwiXG4qL1xudmFyIGNvbW1hbmRzOiBDb21tYW5kW10gPSBbe1xuICAgIG5hbWU6IFwic2hvd1NldHRpbmdzTWVudVwiLFxuICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLSxcIiwgXCJDb21tYW5kLSxcIiksXG4gICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7XG4gICAgICAgIGxvYWRNb2R1bGUoXCJhY2UvZXh0L3NldHRpbmdzX21lbnVcIiwgZnVuY3Rpb24obW9kdWxlKSB7XG4gICAgICAgICAgICBtb2R1bGUuaW5pdChlZGl0b3IpO1xuICAgICAgICAgICAgZWRpdG9yLnNob3dTZXR0aW5nc01lbnUoKTtcbiAgICAgICAgfSk7XG4gICAgfSxcbiAgICByZWFkT25seTogdHJ1ZVxufSwge1xuICAgICAgICBuYW1lOiBcImdvVG9OZXh0RXJyb3JcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1FXCIsIFwiQ3RybC1FXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IvKjogRWRpdG9yKi8pIHtcbiAgICAgICAgICAgIGxvYWRNb2R1bGUoXCJhY2UvZXh0L2Vycm9yX21hcmtlclwiLCBmdW5jdGlvbihtb2R1bGUpIHtcbiAgICAgICAgICAgICAgICBtb2R1bGUuc2hvd0Vycm9yTWFya2VyKGVkaXRvciwgMSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiYW5pbWF0ZVwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb1RvUHJldmlvdXNFcnJvclwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LVNoaWZ0LUVcIiwgXCJDdHJsLVNoaWZ0LUVcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykge1xuICAgICAgICAgICAgbG9hZE1vZHVsZShcImFjZS9leHQvZXJyb3JfbWFya2VyXCIsIGZ1bmN0aW9uKG1vZHVsZSkge1xuICAgICAgICAgICAgICAgIG1vZHVsZS5zaG93RXJyb3JNYXJrZXIoZWRpdG9yLCAtMSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiYW5pbWF0ZVwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3RhbGxcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtQVwiLCBcIkNvbW1hbmQtQVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5zZWxlY3RBbGwoKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiY2VudGVyc2VsZWN0aW9uXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkobnVsbCwgXCJDdHJsLUxcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3IuY2VudGVyU2VsZWN0aW9uKCk7IH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImdvdG9saW5lXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUxcIiwgXCJDb21tYW5kLUxcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBwYXJzZUludChwcm9tcHQoXCJFbnRlciBsaW5lIG51bWJlcjpcIiksIDEwKTtcbiAgICAgICAgICAgIGlmICghaXNOYU4obGluZSkpIHtcbiAgICAgICAgICAgICAgICBlZGl0b3IuZ290b0xpbmUobGluZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImZvbGRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1MfEN0cmwtRjFcIiwgXCJDb21tYW5kLUFsdC1MfENvbW1hbmQtRjFcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3Iuc2Vzc2lvbi50b2dnbGVGb2xkKGZhbHNlKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY2VudGVyXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInVuZm9sZFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LVNoaWZ0LUx8Q3RybC1TaGlmdC1GMVwiLCBcIkNvbW1hbmQtQWx0LVNoaWZ0LUx8Q29tbWFuZC1TaGlmdC1GMVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5zZXNzaW9uLnRvZ2dsZUZvbGQodHJ1ZSk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ0b2dnbGVGb2xkV2lkZ2V0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJGMlwiLCBcIkYyXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IvKjogRWRpdG9yKi8pIHsgZWRpdG9yLnNlc3Npb24udG9nZ2xlRm9sZFdpZGdldCgpOyB9LFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjZW50ZXJcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidG9nZ2xlUGFyZW50Rm9sZFdpZGdldFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LUYyXCIsIFwiQWx0LUYyXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IvKjogRWRpdG9yKi8pIHsgZWRpdG9yLnNlc3Npb24udG9nZ2xlRm9sZFdpZGdldCh0cnVlKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY2VudGVyXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImZvbGRhbGxcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtQWx0LTBcIiwgXCJDdHJsLUNvbW1hbmQtT3B0aW9uLTBcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3Iuc2Vzc2lvbi5mb2xkQWxsKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJmb2xkT3RoZXJcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC0wXCIsIFwiQ29tbWFuZC1PcHRpb24tMFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7XG4gICAgICAgICAgICBlZGl0b3Iuc2Vzc2lvbi5mb2xkQWxsKCk7XG4gICAgICAgICAgICBlZGl0b3Iuc2Vzc2lvbi51bmZvbGQoZWRpdG9yLnNlbGVjdGlvbi5nZXRBbGxSYW5nZXMoKSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ1bmZvbGRhbGxcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC0wXCIsIFwiQ29tbWFuZC1PcHRpb24tU2hpZnQtMFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5zZXNzaW9uLnVuZm9sZCgpOyB9LFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjZW50ZXJcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZmluZG5leHRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtS1wiLCBcIkNvbW1hbmQtR1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5maW5kTmV4dCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImNlbnRlclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJmaW5kcHJldmlvdXNcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtS1wiLCBcIkNvbW1hbmQtU2hpZnQtR1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLyo6IEVkaXRvciovKSB7IGVkaXRvci5maW5kUHJldmlvdXMoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjZW50ZXJcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0T3JGaW5kTmV4dFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LUtcIiwgXCJDdHJsLUdcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykge1xuICAgICAgICAgICAgaWYgKGVkaXRvci5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RXb3JkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBlZGl0b3IuZmluZE5leHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0T3JGaW5kUHJldmlvdXNcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC1LXCIsIFwiQ3RybC1TaGlmdC1HXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IvKjogRWRpdG9yKi8pIHtcbiAgICAgICAgICAgIGlmIChlZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2VsZWN0V29yZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLmZpbmRQcmV2aW91cygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJmaW5kXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUZcIiwgXCJDb21tYW5kLUZcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykge1xuICAgICAgICAgICAgbG9hZE1vZHVsZShcImFjZS9leHQvc2VhcmNoYm94XCIsIGZ1bmN0aW9uKGUpIHsgZS5TZWFyY2goZWRpdG9yKSB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwib3ZlcndyaXRlXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJJbnNlcnRcIiwgXCJJbnNlcnRcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3IudG9nZ2xlT3ZlcndyaXRlKCk7IH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHRvc3RhcnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtSG9tZVwiLCBcIkNvbW1hbmQtU2hpZnQtVXBcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvci8qOiBFZGl0b3IqLykgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0RmlsZVN0YXJ0KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWUsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImFuaW1hdGVcIixcbiAgICAgICAgYWNlQ29tbWFuZEdyb3VwOiBcImZpbGVKdW1wXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b3N0YXJ0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUhvbWVcIiwgXCJDb21tYW5kLUhvbWV8Q29tbWFuZC1VcFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5uYXZpZ2F0ZUZpbGVTdGFydCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJhbmltYXRlXCIsXG4gICAgICAgIGFjZUNvbW1hbmRHcm91cDogXCJmaWxlSnVtcFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHVwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJTaGlmdC1VcFwiLCBcIlNoaWZ0LVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdFVwKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ29saW5ldXBcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlVwXCIsIFwiVXB8Q3RybC1QXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IsIGFyZ3MpIHsgZWRpdG9yLm5hdmlnYXRlVXAoYXJncy50aW1lcyk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0dG9lbmRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtRW5kXCIsIFwiQ29tbWFuZC1TaGlmdC1Eb3duXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdEZpbGVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiYW5pbWF0ZVwiLFxuICAgICAgICBhY2VDb21tYW5kR3JvdXA6IFwiZmlsZUp1bXBcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvZW5kXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUVuZFwiLCBcIkNvbW1hbmQtRW5kfENvbW1hbmQtRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5uYXZpZ2F0ZUZpbGVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiYW5pbWF0ZVwiLFxuICAgICAgICBhY2VDb21tYW5kR3JvdXA6IFwiZmlsZUp1bXBcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3Rkb3duXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJTaGlmdC1Eb3duXCIsIFwiU2hpZnQtRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3REb3duKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImdvbGluZWRvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkRvd25cIiwgXCJEb3dufEN0cmwtTlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLCBhcmdzKSB7IGVkaXRvci5uYXZpZ2F0ZURvd24oYXJncy50aW1lcyk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHdvcmRsZWZ0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LUxlZnRcIiwgXCJPcHRpb24tU2hpZnQtTGVmdFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RXb3JkTGVmdCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3Rvd29yZGxlZnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtTGVmdFwiLCBcIk9wdGlvbi1MZWZ0XCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLm5hdmlnYXRlV29yZExlZnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0dG9saW5lc3RhcnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC1MZWZ0XCIsIFwiQ29tbWFuZC1TaGlmdC1MZWZ0XCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdExpbmVTdGFydCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvbGluZXN0YXJ0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtTGVmdHxIb21lXCIsIFwiQ29tbWFuZC1MZWZ0fEhvbWV8Q3RybC1BXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLm5hdmlnYXRlTGluZVN0YXJ0KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdGxlZnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlNoaWZ0LUxlZnRcIiwgXCJTaGlmdC1MZWZ0XCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdExlZnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b2xlZnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkxlZnRcIiwgXCJMZWZ0fEN0cmwtQlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLCBhcmdzKSB7IGVkaXRvci5uYXZpZ2F0ZUxlZnQoYXJncy50aW1lcyk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHdvcmRyaWdodFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1TaGlmdC1SaWdodFwiLCBcIk9wdGlvbi1TaGlmdC1SaWdodFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RXb3JkUmlnaHQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b3dvcmRyaWdodFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1SaWdodFwiLCBcIk9wdGlvbi1SaWdodFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5uYXZpZ2F0ZVdvcmRSaWdodCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3R0b2xpbmVlbmRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC1SaWdodFwiLCBcIkNvbW1hbmQtU2hpZnQtUmlnaHRcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0TGluZUVuZCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvbGluZWVuZFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LVJpZ2h0fEVuZFwiLCBcIkNvbW1hbmQtUmlnaHR8RW5kfEN0cmwtRVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5uYXZpZ2F0ZUxpbmVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0cmlnaHRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlNoaWZ0LVJpZ2h0XCIsIFwiU2hpZnQtUmlnaHRcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuc2VsZWN0UmlnaHQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZ290b3JpZ2h0XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJSaWdodFwiLCBcIlJpZ2h0fEN0cmwtRlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yLCBhcmdzKSB7IGVkaXRvci5uYXZpZ2F0ZVJpZ2h0KGFyZ3MudGltZXMpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3RwYWdlZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBcIlNoaWZ0LVBhZ2VEb3duXCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3Iuc2VsZWN0UGFnZURvd24oKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicGFnZWRvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShudWxsLCBcIk9wdGlvbi1QYWdlRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5zY3JvbGxQYWdlRG93bigpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvcGFnZWRvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlBhZ2VEb3duXCIsIFwiUGFnZURvd258Q3RybC1WXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdvdG9QYWdlRG93bigpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzZWxlY3RwYWdldXBcIixcbiAgICAgICAgYmluZEtleTogXCJTaGlmdC1QYWdlVXBcIixcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5zZWxlY3RQYWdlVXAoKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicGFnZXVwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkobnVsbCwgXCJPcHRpb24tUGFnZVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnNjcm9sbFBhZ2VVcCgpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJnb3RvcGFnZXVwXCIsXG4gICAgICAgIGJpbmRLZXk6IFwiUGFnZVVwXCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuZ290b1BhZ2VVcCgpOyB9LFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJzY3JvbGx1cFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1VcFwiLCBudWxsKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZSkgeyBlLnJlbmRlcmVyLnNjcm9sbEJ5KDAsIC0yICogZS5yZW5kZXJlci5sYXllckNvbmZpZy5saW5lSGVpZ2h0KTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2Nyb2xsZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1Eb3duXCIsIG51bGwpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlKSB7IGUucmVuZGVyZXIuc2Nyb2xsQnkoMCwgMiAqIGUucmVuZGVyZXIubGF5ZXJDb25maWcubGluZUhlaWdodCk7IH0sXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdGxpbmVzdGFydFwiLFxuICAgICAgICBiaW5kS2V5OiBcIlNoaWZ0LUhvbWVcIixcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5nZXRTZWxlY3Rpb24oKS5zZWxlY3RMaW5lU3RhcnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic2VsZWN0bGluZWVuZFwiLFxuICAgICAgICBiaW5kS2V5OiBcIlNoaWZ0LUVuZFwiLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmdldFNlbGVjdGlvbigpLnNlbGVjdExpbmVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidG9nZ2xlcmVjb3JkaW5nXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUFsdC1FXCIsIFwiQ29tbWFuZC1PcHRpb24tRVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5jb21tYW5kcy50b2dnbGVSZWNvcmRpbmcoZWRpdG9yKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicmVwbGF5bWFjcm9cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtRVwiLCBcIkNvbW1hbmQtU2hpZnQtRVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5jb21tYW5kcy5yZXBsYXkoZWRpdG9yKTsgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwianVtcHRvbWF0Y2hpbmdcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtUFwiLCBcIkN0cmwtUFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5qdW1wVG9NYXRjaGluZygpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNlbGVjdHRvbWF0Y2hpbmdcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtUFwiLCBcIkN0cmwtU2hpZnQtUFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5qdW1wVG9NYXRjaGluZyh0cnVlKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJwYXNzS2V5c1RvQnJvd3NlclwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwibnVsbFwiLCBcIm51bGxcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKCkgeyB9LFxuICAgICAgICBwYXNzRXZlbnQ6IHRydWUsXG4gICAgICAgIHJlYWRPbmx5OiB0cnVlXG4gICAgfSxcblxuICAgIC8vIGNvbW1hbmRzIGRpc2FibGVkIGluIHJlYWRPbmx5IG1vZGVcbiAgICB7XG4gICAgICAgIG5hbWU6IFwiY3V0XCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgICAgICBlZGl0b3IuX2VtaXQoXCJjdXRcIiwgcmFuZ2UpO1xuXG4gICAgICAgICAgICBpZiAoIWVkaXRvci5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgICAgICAgICBlZGl0b3IuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJyZW1vdmVsaW5lXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLURcIiwgXCJDb21tYW5kLURcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IucmVtb3ZlTGluZXMoKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCIsXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hMaW5lXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZHVwbGljYXRlU2VsZWN0aW9uXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LURcIiwgXCJDb21tYW5kLVNoaWZ0LURcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuZHVwbGljYXRlU2VsZWN0aW9uKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiLFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwic29ydGxpbmVzXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUFsdC1TXCIsIFwiQ29tbWFuZC1BbHQtU1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5zb3J0TGluZXMoKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uXCIsXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hMaW5lXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidG9nZ2xlY29tbWVudFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC0vXCIsIFwiQ29tbWFuZC0vXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnRvZ2dsZUNvbW1lbnRMaW5lcygpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoTGluZVwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJzZWxlY3Rpb25QYXJ0XCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidG9nZ2xlQmxvY2tDb21tZW50XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LS9cIiwgXCJDb21tYW5kLVNoaWZ0LS9cIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IudG9nZ2xlQmxvY2tDb21tZW50KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uUGFydFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm1vZGlmeU51bWJlclVwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LVVwXCIsIFwiQWx0LVNoaWZ0LVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLm1vZGlmeU51bWJlcigxKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm1vZGlmeU51bWJlckRvd25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtU2hpZnQtRG93blwiLCBcIkFsdC1TaGlmdC1Eb3duXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLm1vZGlmeU51bWJlcigtMSk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJyZXBsYWNlXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLUhcIiwgXCJDb21tYW5kLU9wdGlvbi1GXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHtcbiAgICAgICAgICAgIGxvYWRNb2R1bGUoXCJhY2UvZXh0L3NlYXJjaGJveFwiLCBmdW5jdGlvbihlKSB7IGUuU2VhcmNoKGVkaXRvciwgdHJ1ZSkgfSk7XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwidW5kb1wiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1aXCIsIFwiQ29tbWFuZC1aXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnVuZG8oKTsgfVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJyZWRvXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LVp8Q3RybC1ZXCIsIFwiQ29tbWFuZC1TaGlmdC1afENvbW1hbmQtWVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5yZWRvKCk7IH1cbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiY29weWxpbmVzdXBcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1TaGlmdC1VcFwiLCBcIkNvbW1hbmQtT3B0aW9uLVVwXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmNvcHlMaW5lc1VwKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm1vdmVsaW5lc3VwXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJBbHQtVXBcIiwgXCJPcHRpb24tVXBcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IubW92ZUxpbmVzVXAoKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiY29weWxpbmVzZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LVNoaWZ0LURvd25cIiwgXCJDb21tYW5kLU9wdGlvbi1Eb3duXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmNvcHlMaW5lc0Rvd24oKTsgfSxcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwibW92ZWxpbmVzZG93blwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LURvd25cIiwgXCJPcHRpb24tRG93blwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5tb3ZlTGluZXNEb3duKCk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImRlbFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiRGVsZXRlXCIsIFwiRGVsZXRlfEN0cmwtRHxTaGlmdC1EZWxldGVcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IucmVtb3ZlKFwicmlnaHRcIik7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiYmFja3NwYWNlXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXG4gICAgICAgICAgICBcIlNoaWZ0LUJhY2tzcGFjZXxCYWNrc3BhY2VcIixcbiAgICAgICAgICAgIFwiQ3RybC1CYWNrc3BhY2V8U2hpZnQtQmFja3NwYWNlfEJhY2tzcGFjZXxDdHJsLUhcIlxuICAgICAgICApLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnJlbW92ZShcImxlZnRcIik7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiY3V0X29yX2RlbGV0ZVwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiU2hpZnQtRGVsZXRlXCIsIG51bGwpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHtcbiAgICAgICAgICAgIGlmIChlZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgICAgIGVkaXRvci5yZW1vdmUoXCJsZWZ0XCIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwicmVtb3ZldG9saW5lc3RhcnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkFsdC1CYWNrc3BhY2VcIiwgXCJDb21tYW5kLUJhY2tzcGFjZVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5yZW1vdmVUb0xpbmVTdGFydCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInJlbW92ZXRvbGluZWVuZFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQWx0LURlbGV0ZVwiLCBcIkN0cmwtS1wiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5yZW1vdmVUb0xpbmVFbmQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJyZW1vdmV3b3JkbGVmdFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1CYWNrc3BhY2VcIiwgXCJBbHQtQmFja3NwYWNlfEN0cmwtQWx0LUJhY2tzcGFjZVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5yZW1vdmVXb3JkTGVmdCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInJlbW92ZXdvcmRyaWdodFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1EZWxldGVcIiwgXCJBbHQtRGVsZXRlXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnJlbW92ZVdvcmRSaWdodCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcIm91dGRlbnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIlNoaWZ0LVRhYlwiLCBcIlNoaWZ0LVRhYlwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5ibG9ja091dGRlbnQoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJzZWxlY3Rpb25QYXJ0XCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiaW5kZW50XCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJUYWJcIiwgXCJUYWJcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IuaW5kZW50KCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwic2VsZWN0aW9uUGFydFwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcImJsb2Nrb3V0ZGVudFwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1bXCIsIFwiQ3RybC1bXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLmJsb2NrT3V0ZGVudCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoTGluZVwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJzZWxlY3Rpb25QYXJ0XCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiYmxvY2tpbmRlbnRcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtXVwiLCBcIkN0cmwtXVwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci5ibG9ja0luZGVudCgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoTGluZVwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJzZWxlY3Rpb25QYXJ0XCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiaW5zZXJ0c3RyaW5nXCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvciwgc3RyKSB7IGVkaXRvci5pbnNlcnQoc3RyKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJpbnNlcnR0ZXh0XCIsXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvciwgYXJncykge1xuICAgICAgICAgICAgZWRpdG9yLmluc2VydChzdHJpbmdSZXBlYXQoYXJncy50ZXh0IHx8IFwiXCIsIGFyZ3MudGltZXMgfHwgMSkpO1xuICAgICAgICB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInNwbGl0bGluZVwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KG51bGwsIFwiQ3RybC1PXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnNwbGl0TGluZSgpOyB9LFxuICAgICAgICBtdWx0aVNlbGVjdEFjdGlvbjogXCJmb3JFYWNoXCIsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInRyYW5zcG9zZWxldHRlcnNcIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShcIkN0cmwtVFwiLCBcIkN0cmwtVFwiKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7IGVkaXRvci50cmFuc3Bvc2VMZXR0ZXJzKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnRyYW5zcG9zZVNlbGVjdGlvbnMoMSk7IH0sXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcImN1cnNvclwiXG4gICAgfSwge1xuICAgICAgICBuYW1lOiBcInRvdXBwZXJjYXNlXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVVcIiwgXCJDdHJsLVVcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikgeyBlZGl0b3IudG9VcHBlckNhc2UoKTsgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIlxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJ0b2xvd2VyY2FzZVwiLFxuICAgICAgICBiaW5kS2V5OiBiaW5kS2V5KFwiQ3RybC1TaGlmdC1VXCIsIFwiQ3RybC1TaGlmdC1VXCIpLFxuICAgICAgICBleGVjOiBmdW5jdGlvbihlZGl0b3IpIHsgZWRpdG9yLnRvTG93ZXJDYXNlKCk7IH0sXG4gICAgICAgIG11bHRpU2VsZWN0QWN0aW9uOiBcImZvckVhY2hcIixcbiAgICAgICAgc2Nyb2xsSW50b1ZpZXc6IFwiY3Vyc29yXCJcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiZXhwYW5kdG9saW5lXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkoXCJDdHJsLVNoaWZ0LUxcIiwgXCJDb21tYW5kLVNoaWZ0LUxcIiksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuXG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSByYW5nZS5lbmQuY29sdW1uID0gMDtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3crKztcbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2V0UmFuZ2UocmFuZ2UsIGZhbHNlKTtcbiAgICAgICAgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICBzY3JvbGxJbnRvVmlldzogXCJjdXJzb3JcIixcbiAgICAgICAgcmVhZE9ubHk6IHRydWVcbiAgICB9LCB7XG4gICAgICAgIG5hbWU6IFwiam9pbmxpbmVzXCIsXG4gICAgICAgIGJpbmRLZXk6IGJpbmRLZXkobnVsbCwgbnVsbCksXG4gICAgICAgIGV4ZWM6IGZ1bmN0aW9uKGVkaXRvcikge1xuICAgICAgICAgICAgdmFyIGlzQmFja3dhcmRzID0gZWRpdG9yLnNlbGVjdGlvbi5pc0JhY2t3YXJkcygpO1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvblN0YXJ0ID0gaXNCYWNrd2FyZHMgPyBlZGl0b3Iuc2VsZWN0aW9uLmdldFNlbGVjdGlvbkxlYWQoKSA6IGVkaXRvci5zZWxlY3Rpb24uZ2V0U2VsZWN0aW9uQW5jaG9yKCk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uRW5kID0gaXNCYWNrd2FyZHMgPyBlZGl0b3Iuc2VsZWN0aW9uLmdldFNlbGVjdGlvbkFuY2hvcigpIDogZWRpdG9yLnNlbGVjdGlvbi5nZXRTZWxlY3Rpb25MZWFkKCk7XG4gICAgICAgICAgICB2YXIgZmlyc3RMaW5lRW5kQ29sID0gZWRpdG9yLnNlc3Npb24uZG9jLmdldExpbmUoc2VsZWN0aW9uU3RhcnQucm93KS5sZW5ndGhcbiAgICAgICAgICAgIHZhciBzZWxlY3RlZFRleHQgPSBlZGl0b3Iuc2Vzc2lvbi5kb2MuZ2V0VGV4dFJhbmdlKGVkaXRvci5zZWxlY3Rpb24uZ2V0UmFuZ2UoKSk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0ZWRDb3VudCA9IHNlbGVjdGVkVGV4dC5yZXBsYWNlKC9cXG5cXHMqLywgXCIgXCIpLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciBpbnNlcnRMaW5lID0gZWRpdG9yLnNlc3Npb24uZG9jLmdldExpbmUoc2VsZWN0aW9uU3RhcnQucm93KTtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHNlbGVjdGlvblN0YXJ0LnJvdyArIDE7IGkgPD0gc2VsZWN0aW9uRW5kLnJvdyArIDE7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBjdXJMaW5lID0gc3RyaW5nVHJpbUxlZnQoc3RyaW5nVHJpbVJpZ2h0KGVkaXRvci5zZXNzaW9uLmRvYy5nZXRMaW5lKGkpKSk7XG4gICAgICAgICAgICAgICAgaWYgKGN1ckxpbmUubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGN1ckxpbmUgPSBcIiBcIiArIGN1ckxpbmU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGluc2VydExpbmUgKz0gY3VyTGluZTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChzZWxlY3Rpb25FbmQucm93ICsgMSA8IChlZGl0b3Iuc2Vzc2lvbi5kb2MuZ2V0TGVuZ3RoKCkgLSAxKSkge1xuICAgICAgICAgICAgICAgIC8vIERvbid0IGluc2VydCBhIG5ld2xpbmUgYXQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnRcbiAgICAgICAgICAgICAgICBpbnNlcnRMaW5lICs9IGVkaXRvci5zZXNzaW9uLmRvYy5nZXROZXdMaW5lQ2hhcmFjdGVyKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVkaXRvci5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICAgICAgZWRpdG9yLnNlc3Npb24uZG9jLnJlcGxhY2UobmV3IFJhbmdlKHNlbGVjdGlvblN0YXJ0LnJvdywgMCwgc2VsZWN0aW9uRW5kLnJvdyArIDIsIDApLCBpbnNlcnRMaW5lKTtcblxuICAgICAgICAgICAgaWYgKHNlbGVjdGVkQ291bnQgPiAwKSB7XG4gICAgICAgICAgICAgICAgLy8gU2VsZWN0IHRoZSB0ZXh0IHRoYXQgd2FzIHByZXZpb3VzbHkgc2VsZWN0ZWRcbiAgICAgICAgICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLm1vdmVDdXJzb3JUbyhzZWxlY3Rpb25TdGFydC5yb3csIHNlbGVjdGlvblN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RUbyhzZWxlY3Rpb25TdGFydC5yb3csIHNlbGVjdGlvblN0YXJ0LmNvbHVtbiArIHNlbGVjdGVkQ291bnQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgam9pbmVkIGxpbmUgaGFkIHNvbWV0aGluZyBpbiBpdCwgc3RhcnQgdGhlIGN1cnNvciBhdCB0aGF0IHNvbWV0aGluZ1xuICAgICAgICAgICAgICAgIGZpcnN0TGluZUVuZENvbCA9IGVkaXRvci5zZXNzaW9uLmRvYy5nZXRMaW5lKHNlbGVjdGlvblN0YXJ0LnJvdykubGVuZ3RoID4gZmlyc3RMaW5lRW5kQ29sID8gKGZpcnN0TGluZUVuZENvbCArIDEpIDogZmlyc3RMaW5lRW5kQ29sO1xuICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24ubW92ZUN1cnNvclRvKHNlbGVjdGlvblN0YXJ0LnJvdywgZmlyc3RMaW5lRW5kQ29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgbXVsdGlTZWxlY3RBY3Rpb246IFwiZm9yRWFjaFwiLFxuICAgICAgICByZWFkT25seTogdHJ1ZVxuICAgIH0sIHtcbiAgICAgICAgbmFtZTogXCJpbnZlcnRTZWxlY3Rpb25cIixcbiAgICAgICAgYmluZEtleTogYmluZEtleShudWxsLCBudWxsKSxcbiAgICAgICAgZXhlYzogZnVuY3Rpb24oZWRpdG9yKSB7XG4gICAgICAgICAgICB2YXIgZW5kUm93ID0gZWRpdG9yLnNlc3Npb24uZG9jLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgICAgIHZhciBlbmRDb2wgPSBlZGl0b3Iuc2Vzc2lvbi5kb2MuZ2V0TGluZShlbmRSb3cpLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciByYW5nZXMgPSBlZGl0b3Iuc2VsZWN0aW9uLnJhbmdlTGlzdC5yYW5nZXM7XG4gICAgICAgICAgICB2YXIgbmV3UmFuZ2VzID0gW107XG5cbiAgICAgICAgICAgIC8vIElmIG11bHRpcGxlIHNlbGVjdGlvbnMgZG9uJ3QgZXhpc3QsIHJhbmdlTGlzdCB3aWxsIHJldHVybiAwIHNvIHJlcGxhY2Ugd2l0aCBzaW5nbGUgcmFuZ2VcbiAgICAgICAgICAgIGlmIChyYW5nZXMubGVuZ3RoIDwgMSkge1xuICAgICAgICAgICAgICAgIHJhbmdlcyA9IFtlZGl0b3Iuc2VsZWN0aW9uLmdldFJhbmdlKCldO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChpID09IChyYW5nZXMubGVuZ3RoIC0gMSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGxhc3Qgc2VsZWN0aW9uIG11c3QgY29ubmVjdCB0byB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudCwgdW5sZXNzIGl0IGFscmVhZHkgZG9lc1xuICAgICAgICAgICAgICAgICAgICBpZiAoIShyYW5nZXNbaV0uZW5kLnJvdyA9PT0gZW5kUm93ICYmIHJhbmdlc1tpXS5lbmQuY29sdW1uID09PSBlbmRDb2wpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdSYW5nZXMucHVzaChuZXcgUmFuZ2UocmFuZ2VzW2ldLmVuZC5yb3csIHJhbmdlc1tpXS5lbmQuY29sdW1uLCBlbmRSb3csIGVuZENvbCkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGZpcnN0IHNlbGVjdGlvbiBtdXN0IGNvbm5lY3QgdG8gdGhlIHN0YXJ0IG9mIHRoZSBkb2N1bWVudCwgdW5sZXNzIGl0IGFscmVhZHkgZG9lc1xuICAgICAgICAgICAgICAgICAgICBpZiAoIShyYW5nZXNbaV0uc3RhcnQucm93ID09PSAwICYmIHJhbmdlc1tpXS5zdGFydC5jb2x1bW4gPT09IDApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdSYW5nZXMucHVzaChuZXcgUmFuZ2UoMCwgMCwgcmFuZ2VzW2ldLnN0YXJ0LnJvdywgcmFuZ2VzW2ldLnN0YXJ0LmNvbHVtbikpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3UmFuZ2VzLnB1c2gobmV3IFJhbmdlKHJhbmdlc1tpIC0gMV0uZW5kLnJvdywgcmFuZ2VzW2kgLSAxXS5lbmQuY29sdW1uLCByYW5nZXNbaV0uc3RhcnQucm93LCByYW5nZXNbaV0uc3RhcnQuY29sdW1uKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBlZGl0b3IuZXhpdE11bHRpU2VsZWN0TW9kZSgpO1xuICAgICAgICAgICAgZWRpdG9yLmNsZWFyU2VsZWN0aW9uKCk7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbmV3UmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5hZGRSYW5nZShuZXdSYW5nZXNbaV0sIGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcmVhZE9ubHk6IHRydWUsXG4gICAgICAgIHNjcm9sbEludG9WaWV3OiBcIm5vbmVcIlxuICAgIH1dO1xuXG5leHBvcnQgZGVmYXVsdCBjb21tYW5kcztcbiJdfQ==