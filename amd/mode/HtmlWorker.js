var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", "../worker/Mirror", "./html/SAXParser"], function (require, exports, Mirror_1, SAXParser_1) {
    var errorTypes = {
        "expected-doctype-but-got-start-tag": "info",
        "expected-doctype-but-got-chars": "info",
        "non-html-root": "info",
    };
    var HtmlWorker = (function (_super) {
        __extends(HtmlWorker, _super);
        function HtmlWorker(sender) {
            _super.call(this, sender);
            this.setOptions();
            sender.emit('initAfter');
        }
        HtmlWorker.prototype.setOptions = function (options) {
            if (options) {
                this.context = options.context;
            }
            else {
                this.context = void 0;
            }
            this.doc.getValue() && this.deferredUpdate.schedule(100);
        };
        HtmlWorker.prototype.onUpdate = function () {
            var value = this.doc.getValue();
            if (!value) {
                return;
            }
            var errors = [];
            var parser = new SAXParser_1.default();
            if (parser) {
                var noop = function () { };
                parser.contentHandler = {
                    startDocument: noop,
                    endDocument: noop,
                    startElement: noop,
                    endElement: noop,
                    characters: noop
                };
                parser.errorHandler = {
                    error: function (message, location, code) {
                        errors.push({
                            row: location.line,
                            column: location.column,
                            text: message,
                            type: errorTypes[code] || "error"
                        });
                    }
                };
                if (this.context) {
                    parser.parseFragment(value, this.context);
                }
                else {
                    parser.parse(value);
                }
            }
            this.sender.emit("error", errors);
        };
        return HtmlWorker;
    })(Mirror_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = HtmlWorker;
});
