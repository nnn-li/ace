"use strict";
import Mirror from "../worker/Mirror";
import SAXParser from "./html/SAXParser";
var errorTypes = {
    "expected-doctype-but-got-start-tag": "info",
    "expected-doctype-but-got-chars": "info",
    "non-html-root": "info",
};
export default class HtmlWorker extends Mirror {
    constructor(sender) {
        super(sender);
        this.setOptions();
        sender.emit('initAfter');
    }
    setOptions(options) {
        if (options) {
            this.context = options.context;
        }
        else {
            this.context = void 0;
        }
        this.doc.getValue() && this.deferredUpdate.schedule(100);
    }
    onUpdate() {
        var value = this.doc.getValue();
        if (!value) {
            return;
        }
        var errors = [];
        var parser = new SAXParser();
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
    }
}
