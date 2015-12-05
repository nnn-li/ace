import ttm = require('./tooltip');
import wsm = require('./workspace/workspace');

/**
 * The User Interface element leverages the existing Tooltip for consistency.
 */
class TypeInfoTooltip extends ttm.Tooltip {
    constructor(parentElement: HTMLElement) {
        super(parentElement);
    }
}

var typeInfoTip = function(doc: Document, editor, workspace: wsm.Workspace, fileNameProvider: () => string, rootElement: HTMLElement) {

    var _tooltip = new TypeInfoTooltip(editor.container);

    var _mouseMoveTimer: number;

    function _onMouseMove(event: MouseEvent) {
        _tooltip.hide();
        clearTimeout(_mouseMoveTimer);
        var elem: Element = event.srcElement;
        if (elem['className'] === 'ace_content') {
            _mouseMoveTimer = setTimeout(() => { showInfo(); }, 800);
        }
        function showInfo() {
            // TODO if (mode !== "typescript") return;

            /**
             * Gets the Position based on mouse x,y coordinates
             */
            function getDocumentPositionFromScreenOffset(x: number, y: number): { row: number; column: number } {
                var r = editor.renderer;
                // var offset = (x + r.scrollLeft - r.$padding) / r.characterWidth;
                var offset = (x - r.$padding) / r.characterWidth;

                // @BUG: Quickfix for strange issue with top
                var correction = r.scrollTop ? 7 : 0;

                var row = Math.floor((y + r.scrollTop - correction) / r.lineHeight);
                var col = Math.round(offset);
                return editor.getSession().screenToDocumentPosition(row, col);
            }
            var documentPosition = getDocumentPositionFromScreenOffset(event.offsetX, event.offsetY);
            var fileName = fileNameProvider();
            if (workspace && typeof fileName === 'string') {
                workspace.getTypeAtDocumentPosition(fileName, documentPosition, (err: any, typeInfo: ts.Type) => {
                    if (!err) {
                        if (typeInfo) {
                            _tooltip.setHtml(tipHtml())
                            _tooltip.setPosition(event.x, event.y + 10);
                            _tooltip.show();
                        }
                        else {
                            // Nothing to see here. Move along.
                        }
                    }
                    else {
                        // TODO: Report the error.
                    }
                    function tipHtml(): string {
                        var tip = "";
                        // The description is the type information from the source.
                        /* FIXME: Restore
                        if (typeInfo.description && results.description.length > 0) {
                            tip += "<h1>" + typeInfo.fullSymbolName + "</h1><section><h2>Type</h2><p><code>" + results.description + "</code></p></section>";
                            if (results.docComment && results.docComment.length > 0) {
                                // The docComment is expected to be a list of section elements.
                                tip += "<section><h2>Description</h2>" + results.docComment + "</section>";
                            }
                        }
                        */
                        if (tip.length > 0) {
                            tip = "<article class='ace_dts'>" + tip + "</article>"
                        }
                        return tip;
                    }
                });
            }
        }
    }

    var that = {
        startUp: () => { rootElement.addEventListener("mousemove", _onMouseMove) },
        tearDown: () => { rootElement.removeEventListener("mousemove", _onMouseMove) }
    };
    return that;
};
export = typeInfoTip;