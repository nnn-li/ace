import { ForeignAttributeMap, MATHMLAttributeMap, SVGAttributeMap, SVGTagMap } from './constants';
import CharacterBuffer from './CharacterBuffer';
import ElementStack from './ElementStack';
import formatMessage from './formatMessage';
import getAttribute from './getAttribute';
import isWhitespace from './isWhitespace';
import isAllWhitespace from './isAllWhitespace';
import isAllWhitespaceOrReplacementCharacters from './isAllWhitespaceOrReplacementCharacters';
import messages from './messages';
import StackItem from './StackItem';
import Tokenizer from './Tokenizer';
var Marker = {};
export default class TreeBuilder {
    constructor() {
        this.tokenizer = null;
        this.errorHandler = null;
        this.scriptingEnabled = false;
        this.document = null;
        this.head = null;
        this.form = null;
        this.openElements = new ElementStack();
        this.activeFormattingElements = [];
        this.insertionMode = null;
        this.insertionModeName = "";
        this.originalInsertionMode = "";
        this.inQuirksMode = false;
        this.compatMode = "no quirks";
        this.framesetOk = true;
        this.redirectAttachToFosterParent = false;
        this.selfClosingFlagAcknowledged = false;
        this.context = "";
        this.pendingTableCharacters = [];
        this.shouldSkipLeadingNewline = false;
        var tree = this;
        var modes = this.insertionModes = {};
        modes.base = {
            end_tag_handlers: { "-default": 'endTagOther' },
            start_tag_handlers: { "-default": 'startTagOther' },
            processEOF: function () {
                tree.generateImpliedEndTags();
                if (tree.openElements.length > 2) {
                    tree.parseError('expected-closing-tag-but-got-eof');
                }
                else if (tree.openElements.length == 2 &&
                    tree.openElements.item(1).localName != 'body') {
                    tree.parseError('expected-closing-tag-but-got-eof');
                }
                else if (tree.context && tree.openElements.length > 1) {
                }
            },
            processComment: function (data) {
                tree.insertComment(data, tree.currentStackItem().node);
            },
            processDoctype: function (name, publicId, systemId, forceQuirks) {
                tree.parseError('unexpected-doctype');
            },
            processStartTag: function (name, attributes, selfClosing) {
                if (this[this.start_tag_handlers[name]]) {
                    this[this.start_tag_handlers[name]](name, attributes, selfClosing);
                }
                else if (this[this.start_tag_handlers["-default"]]) {
                    this[this.start_tag_handlers["-default"]](name, attributes, selfClosing);
                }
                else {
                    throw (new Error("No handler found for " + name));
                }
            },
            processEndTag: function (name) {
                if (this[this.end_tag_handlers[name]]) {
                    this[this.end_tag_handlers[name]](name);
                }
                else if (this[this.end_tag_handlers["-default"]]) {
                    this[this.end_tag_handlers["-default"]](name);
                }
                else {
                    throw (new Error("No handler found for " + name));
                }
            },
            startTagHtml: function (name, attributes) {
                modes.inBody.startTagHtml(name, attributes);
            }
        };
        modes.initial = Object.create(modes.base);
        modes.initial.processEOF = function () {
            tree.parseError("expected-doctype-but-got-eof");
            this.anythingElse();
            tree.insertionMode.processEOF();
        };
        modes.initial.processComment = function (data) {
            tree.insertComment(data, tree.document);
        };
        modes.initial.processDoctype = function (name, publicId, systemId, forceQuirks) {
            tree.insertDoctype(name || '', publicId || '', systemId || '');
            if (forceQuirks || name != 'html' || (publicId != null && ([
                "+//silmaril//dtd html pro v0r11 19970101//",
                "-//advasoft ltd//dtd html 3.0 aswedit + extensions//",
                "-//as//dtd html 3.0 aswedit + extensions//",
                "-//ietf//dtd html 2.0 level 1//",
                "-//ietf//dtd html 2.0 level 2//",
                "-//ietf//dtd html 2.0 strict level 1//",
                "-//ietf//dtd html 2.0 strict level 2//",
                "-//ietf//dtd html 2.0 strict//",
                "-//ietf//dtd html 2.0//",
                "-//ietf//dtd html 2.1e//",
                "-//ietf//dtd html 3.0//",
                "-//ietf//dtd html 3.0//",
                "-//ietf//dtd html 3.2 final//",
                "-//ietf//dtd html 3.2//",
                "-//ietf//dtd html 3//",
                "-//ietf//dtd html level 0//",
                "-//ietf//dtd html level 0//",
                "-//ietf//dtd html level 1//",
                "-//ietf//dtd html level 1//",
                "-//ietf//dtd html level 2//",
                "-//ietf//dtd html level 2//",
                "-//ietf//dtd html level 3//",
                "-//ietf//dtd html level 3//",
                "-//ietf//dtd html strict level 0//",
                "-//ietf//dtd html strict level 0//",
                "-//ietf//dtd html strict level 1//",
                "-//ietf//dtd html strict level 1//",
                "-//ietf//dtd html strict level 2//",
                "-//ietf//dtd html strict level 2//",
                "-//ietf//dtd html strict level 3//",
                "-//ietf//dtd html strict level 3//",
                "-//ietf//dtd html strict//",
                "-//ietf//dtd html strict//",
                "-//ietf//dtd html strict//",
                "-//ietf//dtd html//",
                "-//ietf//dtd html//",
                "-//ietf//dtd html//",
                "-//metrius//dtd metrius presentational//",
                "-//microsoft//dtd internet explorer 2.0 html strict//",
                "-//microsoft//dtd internet explorer 2.0 html//",
                "-//microsoft//dtd internet explorer 2.0 tables//",
                "-//microsoft//dtd internet explorer 3.0 html strict//",
                "-//microsoft//dtd internet explorer 3.0 html//",
                "-//microsoft//dtd internet explorer 3.0 tables//",
                "-//netscape comm. corp.//dtd html//",
                "-//netscape comm. corp.//dtd strict html//",
                "-//o'reilly and associates//dtd html 2.0//",
                "-//o'reilly and associates//dtd html extended 1.0//",
                "-//spyglass//dtd html 2.0 extended//",
                "-//sq//dtd html 2.0 hotmetal + extensions//",
                "-//sun microsystems corp.//dtd hotjava html//",
                "-//sun microsystems corp.//dtd hotjava strict html//",
                "-//w3c//dtd html 3 1995-03-24//",
                "-//w3c//dtd html 3.2 draft//",
                "-//w3c//dtd html 3.2 final//",
                "-//w3c//dtd html 3.2//",
                "-//w3c//dtd html 3.2s draft//",
                "-//w3c//dtd html 4.0 frameset//",
                "-//w3c//dtd html 4.0 transitional//",
                "-//w3c//dtd html experimental 19960712//",
                "-//w3c//dtd html experimental 970421//",
                "-//w3c//dtd w3 html//",
                "-//w3o//dtd w3 html 3.0//",
                "-//webtechs//dtd mozilla html 2.0//",
                "-//webtechs//dtd mozilla html//",
                "html"
            ].some(publicIdStartsWith)
                || [
                    "-//w3o//dtd w3 html strict 3.0//en//",
                    "-/w3c/dtd html 4.0 transitional/en",
                    "html"
                ].indexOf(publicId.toLowerCase()) > -1
                || (systemId == null && [
                    "-//w3c//dtd html 4.01 transitional//",
                    "-//w3c//dtd html 4.01 frameset//"
                ].some(publicIdStartsWith))))
                || (systemId != null && (systemId.toLowerCase() == "http://www.ibm.com/data/dtd/v11/ibmxhtml1-transitional.dtd"))) {
                tree.compatMode = "quirks";
                tree.parseError("quirky-doctype");
            }
            else if (publicId != null && ([
                "-//w3c//dtd xhtml 1.0 transitional//",
                "-//w3c//dtd xhtml 1.0 frameset//"
            ].some(publicIdStartsWith)
                || (systemId != null && [
                    "-//w3c//dtd html 4.01 transitional//",
                    "-//w3c//dtd html 4.01 frameset//"
                ].indexOf(publicId.toLowerCase()) > -1))) {
                tree.compatMode = "limited quirks";
                tree.parseError("almost-standards-doctype");
            }
            else {
                if ((publicId == "-//W3C//DTD HTML 4.0//EN" && (systemId == null || systemId == "http://www.w3.org/TR/REC-html40/strict.dtd"))
                    || (publicId == "-//W3C//DTD HTML 4.01//EN" && (systemId == null || systemId == "http://www.w3.org/TR/html4/strict.dtd"))
                    || (publicId == "-//W3C//DTD XHTML 1.0 Strict//EN" && (systemId == "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"))
                    || (publicId == "-//W3C//DTD XHTML 1.1//EN" && (systemId == "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"))) {
                }
                else if (!((systemId == null || systemId == "about:legacy-compat") && publicId == null)) {
                    tree.parseError("unknown-doctype");
                }
            }
            tree.setInsertionMode('beforeHTML');
            function publicIdStartsWith(string) {
                return publicId.toLowerCase().indexOf(string) === 0;
            }
        };
        modes.initial.processCharacters = function (buffer) {
            buffer.skipLeadingWhitespace();
            if (!buffer.length)
                return;
            tree.parseError('expected-doctype-but-got-chars');
            this.anythingElse();
            tree.insertionMode.processCharacters(buffer);
        };
        modes.initial.processStartTag = function (name, attributes, selfClosing) {
            tree.parseError('expected-doctype-but-got-start-tag', { name: name });
            this.anythingElse();
            tree.insertionMode.processStartTag(name, attributes, selfClosing);
        };
        modes.initial.processEndTag = function (name) {
            tree.parseError('expected-doctype-but-got-end-tag', { name: name });
            this.anythingElse();
            tree.insertionMode.processEndTag(name);
        };
        modes.initial.anythingElse = function () {
            tree.compatMode = 'quirks';
            tree.setInsertionMode('beforeHTML');
        };
        modes.beforeHTML = Object.create(modes.base);
        modes.beforeHTML.start_tag_handlers = {
            html: 'startTagHtml',
            '-default': 'startTagOther'
        };
        modes.beforeHTML.processEOF = function () {
            this.anythingElse();
            tree.insertionMode.processEOF();
        };
        modes.beforeHTML.processComment = function (data) {
            tree.insertComment(data, tree.document);
        };
        modes.beforeHTML.processCharacters = function (buffer) {
            buffer.skipLeadingWhitespace();
            if (!buffer.length)
                return;
            this.anythingElse();
            tree.insertionMode.processCharacters(buffer);
        };
        modes.beforeHTML.startTagHtml = function (name, attributes, selfClosing) {
            tree.insertHtmlElement(attributes);
            tree.setInsertionMode('beforeHead');
        };
        modes.beforeHTML.startTagOther = function (name, attributes, selfClosing) {
            this.anythingElse();
            tree.insertionMode.processStartTag(name, attributes, selfClosing);
        };
        modes.beforeHTML.processEndTag = function (name) {
            this.anythingElse();
            tree.insertionMode.processEndTag(name);
        };
        modes.beforeHTML.anythingElse = function () {
            tree.insertHtmlElement();
            tree.setInsertionMode('beforeHead');
        };
        modes.afterAfterBody = Object.create(modes.base);
        modes.afterAfterBody.start_tag_handlers = {
            html: 'startTagHtml',
            '-default': 'startTagOther'
        };
        modes.afterAfterBody.processComment = function (data) {
            tree.insertComment(data, tree.document);
        };
        modes.afterAfterBody.processDoctype = function (data) {
            modes.inBody.processDoctype(data);
        };
        modes.afterAfterBody.startTagHtml = function (data, attributes) {
            modes.inBody.startTagHtml(data, attributes);
        };
        modes.afterAfterBody.startTagOther = function (name, attributes, selfClosing) {
            tree.parseError('unexpected-start-tag', { name: name });
            tree.setInsertionMode('inBody');
            tree.insertionMode.processStartTag(name, attributes, selfClosing);
        };
        modes.afterAfterBody.endTagOther = function (name) {
            tree.parseError('unexpected-end-tag', { name: name });
            tree.setInsertionMode('inBody');
            tree.insertionMode.processEndTag(name);
        };
        modes.afterAfterBody.processCharacters = function (data) {
            if (!isAllWhitespace(data.characters)) {
                tree.parseError('unexpected-char-after-body');
                tree.setInsertionMode('inBody');
                return tree.insertionMode.processCharacters(data);
            }
            modes.inBody.processCharacters(data);
        };
        modes.afterBody = Object.create(modes.base);
        modes.afterBody.end_tag_handlers = {
            html: 'endTagHtml',
            '-default': 'endTagOther'
        };
        modes.afterBody.processComment = function (data) {
            tree.insertComment(data, tree.openElements.rootNode);
        };
        modes.afterBody.processCharacters = function (data) {
            if (!isAllWhitespace(data.characters)) {
                tree.parseError('unexpected-char-after-body');
                tree.setInsertionMode('inBody');
                return tree.insertionMode.processCharacters(data);
            }
            modes.inBody.processCharacters(data);
        };
        modes.afterBody.processStartTag = function (name, attributes, selfClosing) {
            tree.parseError('unexpected-start-tag-after-body', { name: name });
            tree.setInsertionMode('inBody');
            tree.insertionMode.processStartTag(name, attributes, selfClosing);
        };
        modes.afterBody.endTagHtml = function (name) {
            if (tree.context) {
                tree.parseError('end-html-in-innerhtml');
            }
            else {
                tree.setInsertionMode('afterAfterBody');
            }
        };
        modes.afterBody.endTagOther = function (name) {
            tree.parseError('unexpected-end-tag-after-body', { name: name });
            tree.setInsertionMode('inBody');
            tree.insertionMode.processEndTag(name);
        };
        modes.afterFrameset = Object.create(modes.base);
        modes.afterFrameset.start_tag_handlers = {
            html: 'startTagHtml',
            noframes: 'startTagNoframes',
            '-default': 'startTagOther'
        };
        modes.afterFrameset.end_tag_handlers = {
            html: 'endTagHtml',
            '-default': 'endTagOther'
        };
        modes.afterFrameset.processCharacters = function (buffer) {
            var characters = buffer.takeRemaining();
            var whitespace = "";
            for (var i = 0; i < characters.length; i++) {
                var ch = characters[i];
                if (isWhitespace(ch))
                    whitespace += ch;
            }
            if (whitespace) {
                tree.insertText(whitespace);
            }
            if (whitespace.length < characters.length)
                tree.parseError('expected-eof-but-got-char');
        };
        modes.afterFrameset.startTagNoframes = function (name, attributes) {
            modes.inHead.processStartTag(name, attributes);
        };
        modes.afterFrameset.startTagOther = function (name, attributes) {
            tree.parseError("unexpected-start-tag-after-frameset", { name: name });
        };
        modes.afterFrameset.endTagHtml = function (name) {
            tree.setInsertionMode('afterAfterFrameset');
        };
        modes.afterFrameset.endTagOther = function (name) {
            tree.parseError("unexpected-end-tag-after-frameset", { name: name });
        };
        modes.beforeHead = Object.create(modes.base);
        modes.beforeHead.start_tag_handlers = {
            html: 'startTagHtml',
            head: 'startTagHead',
            '-default': 'startTagOther'
        };
        modes.beforeHead.end_tag_handlers = {
            html: 'endTagImplyHead',
            head: 'endTagImplyHead',
            body: 'endTagImplyHead',
            br: 'endTagImplyHead',
            '-default': 'endTagOther'
        };
        modes.beforeHead.processEOF = function () {
            this.startTagHead('head', []);
            tree.insertionMode.processEOF();
        };
        modes.beforeHead.processCharacters = function (buffer) {
            buffer.skipLeadingWhitespace();
            if (!buffer.length)
                return;
            this.startTagHead('head', []);
            tree.insertionMode.processCharacters(buffer);
        };
        modes.beforeHead.startTagHead = function (name, attributes) {
            tree.insertHeadElement(attributes);
            tree.setInsertionMode('inHead');
        };
        modes.beforeHead.startTagOther = function (name, attributes, selfClosing) {
            this.startTagHead('head', []);
            tree.insertionMode.processStartTag(name, attributes, selfClosing);
        };
        modes.beforeHead.endTagImplyHead = function (name) {
            this.startTagHead('head', []);
            tree.insertionMode.processEndTag(name);
        };
        modes.beforeHead.endTagOther = function (name) {
            tree.parseError('end-tag-after-implied-root', { name: name });
        };
        modes.inHead = Object.create(modes.base);
        modes.inHead.start_tag_handlers = {
            html: 'startTagHtml',
            head: 'startTagHead',
            title: 'startTagTitle',
            script: 'startTagScript',
            style: 'startTagNoFramesStyle',
            noscript: 'startTagNoScript',
            noframes: 'startTagNoFramesStyle',
            base: 'startTagBaseBasefontBgsoundLink',
            basefont: 'startTagBaseBasefontBgsoundLink',
            bgsound: 'startTagBaseBasefontBgsoundLink',
            link: 'startTagBaseBasefontBgsoundLink',
            meta: 'startTagMeta',
            "-default": 'startTagOther'
        };
        modes.inHead.end_tag_handlers = {
            head: 'endTagHead',
            html: 'endTagHtmlBodyBr',
            body: 'endTagHtmlBodyBr',
            br: 'endTagHtmlBodyBr',
            "-default": 'endTagOther'
        };
        modes.inHead.processEOF = function () {
            var name = tree.currentStackItem().localName;
            if (['title', 'style', 'script'].indexOf(name) != -1) {
                tree.parseError("expected-named-closing-tag-but-got-eof", { name: name });
                tree.popElement();
            }
            this.anythingElse();
            tree.insertionMode.processEOF();
        };
        modes.inHead.processCharacters = function (buffer) {
            var leadingWhitespace = buffer.takeLeadingWhitespace();
            if (leadingWhitespace)
                tree.insertText(leadingWhitespace);
            if (!buffer.length)
                return;
            this.anythingElse();
            tree.insertionMode.processCharacters(buffer);
        };
        modes.inHead.startTagHtml = function (name, attributes) {
            modes.inBody.processStartTag(name, attributes);
        };
        modes.inHead.startTagHead = function (name, attributes) {
            tree.parseError('two-heads-are-not-better-than-one');
        };
        modes.inHead.startTagTitle = function (name, attributes) {
            tree.processGenericRCDATAStartTag(name, attributes);
        };
        modes.inHead.startTagNoScript = function (name, attributes) {
            if (tree.scriptingEnabled)
                return tree.processGenericRawTextStartTag(name, attributes);
            tree.insertElement(name, attributes);
            tree.setInsertionMode('inHeadNoscript');
        };
        modes.inHead.startTagNoFramesStyle = function (name, attributes) {
            tree.processGenericRawTextStartTag(name, attributes);
        };
        modes.inHead.startTagScript = function (name, attributes) {
            tree.insertElement(name, attributes);
            tree.tokenizer.setState(Tokenizer.SCRIPT_DATA);
            tree.originalInsertionMode = tree.insertionModeName;
            tree.setInsertionMode('text');
        };
        modes.inHead.startTagBaseBasefontBgsoundLink = function (name, attributes) {
            tree.insertSelfClosingElement(name, attributes);
        };
        modes.inHead.startTagMeta = function (name, attributes) {
            tree.insertSelfClosingElement(name, attributes);
        };
        modes.inHead.startTagOther = function (name, attributes, selfClosing) {
            this.anythingElse();
            tree.insertionMode.processStartTag(name, attributes, selfClosing);
        };
        modes.inHead.endTagHead = function (name) {
            if (tree.openElements.item(tree.openElements.length - 1).localName == 'head') {
                tree.openElements.pop();
            }
            else {
                tree.parseError('unexpected-end-tag', { name: 'head' });
            }
            tree.setInsertionMode('afterHead');
        };
        modes.inHead.endTagHtmlBodyBr = function (name) {
            this.anythingElse();
            tree.insertionMode.processEndTag(name);
        };
        modes.inHead.endTagOther = function (name) {
            tree.parseError('unexpected-end-tag', { name: name });
        };
        modes.inHead.anythingElse = function () {
            this.endTagHead('head');
        };
        modes.afterHead = Object.create(modes.base);
        modes.afterHead.start_tag_handlers = {
            html: 'startTagHtml',
            head: 'startTagHead',
            body: 'startTagBody',
            frameset: 'startTagFrameset',
            base: 'startTagFromHead',
            link: 'startTagFromHead',
            meta: 'startTagFromHead',
            script: 'startTagFromHead',
            style: 'startTagFromHead',
            title: 'startTagFromHead',
            "-default": 'startTagOther'
        };
        modes.afterHead.end_tag_handlers = {
            body: 'endTagBodyHtmlBr',
            html: 'endTagBodyHtmlBr',
            br: 'endTagBodyHtmlBr',
            "-default": 'endTagOther'
        };
        modes.afterHead.processEOF = function () {
            this.anythingElse();
            tree.insertionMode.processEOF();
        };
        modes.afterHead.processCharacters = function (buffer) {
            var leadingWhitespace = buffer.takeLeadingWhitespace();
            if (leadingWhitespace)
                tree.insertText(leadingWhitespace);
            if (!buffer.length)
                return;
            this.anythingElse();
            tree.insertionMode.processCharacters(buffer);
        };
        modes.afterHead.startTagHtml = function (name, attributes) {
            modes.inBody.processStartTag(name, attributes);
        };
        modes.afterHead.startTagBody = function (name, attributes) {
            tree.framesetOk = false;
            tree.insertBodyElement(attributes);
            tree.setInsertionMode('inBody');
        };
        modes.afterHead.startTagFrameset = function (name, attributes) {
            tree.insertElement(name, attributes);
            tree.setInsertionMode('inFrameset');
        };
        modes.afterHead.startTagFromHead = function (name, attributes, selfClosing) {
            tree.parseError("unexpected-start-tag-out-of-my-head", { name: name });
            tree.openElements.push(tree.head);
            modes.inHead.processStartTag(name, attributes, selfClosing);
            tree.openElements.remove(tree.head);
        };
        modes.afterHead.startTagHead = function (name, attributes, selfClosing) {
            tree.parseError('unexpected-start-tag', { name: name });
        };
        modes.afterHead.startTagOther = function (name, attributes, selfClosing) {
            this.anythingElse();
            tree.insertionMode.processStartTag(name, attributes, selfClosing);
        };
        modes.afterHead.endTagBodyHtmlBr = function (name) {
            this.anythingElse();
            tree.insertionMode.processEndTag(name);
        };
        modes.afterHead.endTagOther = function (name) {
            tree.parseError('unexpected-end-tag', { name: name });
        };
        modes.afterHead.anythingElse = function () {
            tree.insertBodyElement([]);
            tree.setInsertionMode('inBody');
            tree.framesetOk = true;
        };
        modes.inBody = Object.create(modes.base);
        modes.inBody.start_tag_handlers = {
            html: 'startTagHtml',
            head: 'startTagMisplaced',
            base: 'startTagProcessInHead',
            basefont: 'startTagProcessInHead',
            bgsound: 'startTagProcessInHead',
            link: 'startTagProcessInHead',
            meta: 'startTagProcessInHead',
            noframes: 'startTagProcessInHead',
            script: 'startTagProcessInHead',
            style: 'startTagProcessInHead',
            title: 'startTagProcessInHead',
            body: 'startTagBody',
            form: 'startTagForm',
            plaintext: 'startTagPlaintext',
            a: 'startTagA',
            button: 'startTagButton',
            xmp: 'startTagXmp',
            table: 'startTagTable',
            hr: 'startTagHr',
            image: 'startTagImage',
            input: 'startTagInput',
            textarea: 'startTagTextarea',
            select: 'startTagSelect',
            isindex: 'startTagIsindex',
            applet: 'startTagAppletMarqueeObject',
            marquee: 'startTagAppletMarqueeObject',
            object: 'startTagAppletMarqueeObject',
            li: 'startTagListItem',
            dd: 'startTagListItem',
            dt: 'startTagListItem',
            address: 'startTagCloseP',
            article: 'startTagCloseP',
            aside: 'startTagCloseP',
            blockquote: 'startTagCloseP',
            center: 'startTagCloseP',
            details: 'startTagCloseP',
            dir: 'startTagCloseP',
            div: 'startTagCloseP',
            dl: 'startTagCloseP',
            fieldset: 'startTagCloseP',
            figcaption: 'startTagCloseP',
            figure: 'startTagCloseP',
            footer: 'startTagCloseP',
            header: 'startTagCloseP',
            hgroup: 'startTagCloseP',
            main: 'startTagCloseP',
            menu: 'startTagCloseP',
            nav: 'startTagCloseP',
            ol: 'startTagCloseP',
            p: 'startTagCloseP',
            section: 'startTagCloseP',
            summary: 'startTagCloseP',
            ul: 'startTagCloseP',
            listing: 'startTagPreListing',
            pre: 'startTagPreListing',
            b: 'startTagFormatting',
            big: 'startTagFormatting',
            code: 'startTagFormatting',
            em: 'startTagFormatting',
            font: 'startTagFormatting',
            i: 'startTagFormatting',
            s: 'startTagFormatting',
            small: 'startTagFormatting',
            strike: 'startTagFormatting',
            strong: 'startTagFormatting',
            tt: 'startTagFormatting',
            u: 'startTagFormatting',
            nobr: 'startTagNobr',
            area: 'startTagVoidFormatting',
            br: 'startTagVoidFormatting',
            embed: 'startTagVoidFormatting',
            img: 'startTagVoidFormatting',
            keygen: 'startTagVoidFormatting',
            wbr: 'startTagVoidFormatting',
            param: 'startTagParamSourceTrack',
            source: 'startTagParamSourceTrack',
            track: 'startTagParamSourceTrack',
            iframe: 'startTagIFrame',
            noembed: 'startTagRawText',
            noscript: 'startTagRawText',
            h1: 'startTagHeading',
            h2: 'startTagHeading',
            h3: 'startTagHeading',
            h4: 'startTagHeading',
            h5: 'startTagHeading',
            h6: 'startTagHeading',
            caption: 'startTagMisplaced',
            col: 'startTagMisplaced',
            colgroup: 'startTagMisplaced',
            frame: 'startTagMisplaced',
            frameset: 'startTagFrameset',
            tbody: 'startTagMisplaced',
            td: 'startTagMisplaced',
            tfoot: 'startTagMisplaced',
            th: 'startTagMisplaced',
            thead: 'startTagMisplaced',
            tr: 'startTagMisplaced',
            option: 'startTagOptionOptgroup',
            optgroup: 'startTagOptionOptgroup',
            math: 'startTagMath',
            svg: 'startTagSVG',
            rt: 'startTagRpRt',
            rp: 'startTagRpRt',
            "-default": 'startTagOther'
        };
        modes.inBody.end_tag_handlers = {
            p: 'endTagP',
            body: 'endTagBody',
            html: 'endTagHtml',
            address: 'endTagBlock',
            article: 'endTagBlock',
            aside: 'endTagBlock',
            blockquote: 'endTagBlock',
            button: 'endTagBlock',
            center: 'endTagBlock',
            details: 'endTagBlock',
            dir: 'endTagBlock',
            div: 'endTagBlock',
            dl: 'endTagBlock',
            fieldset: 'endTagBlock',
            figcaption: 'endTagBlock',
            figure: 'endTagBlock',
            footer: 'endTagBlock',
            header: 'endTagBlock',
            hgroup: 'endTagBlock',
            listing: 'endTagBlock',
            main: 'endTagBlock',
            menu: 'endTagBlock',
            nav: 'endTagBlock',
            ol: 'endTagBlock',
            pre: 'endTagBlock',
            section: 'endTagBlock',
            summary: 'endTagBlock',
            ul: 'endTagBlock',
            form: 'endTagForm',
            applet: 'endTagAppletMarqueeObject',
            marquee: 'endTagAppletMarqueeObject',
            object: 'endTagAppletMarqueeObject',
            dd: 'endTagListItem',
            dt: 'endTagListItem',
            li: 'endTagListItem',
            h1: 'endTagHeading',
            h2: 'endTagHeading',
            h3: 'endTagHeading',
            h4: 'endTagHeading',
            h5: 'endTagHeading',
            h6: 'endTagHeading',
            a: 'endTagFormatting',
            b: 'endTagFormatting',
            big: 'endTagFormatting',
            code: 'endTagFormatting',
            em: 'endTagFormatting',
            font: 'endTagFormatting',
            i: 'endTagFormatting',
            nobr: 'endTagFormatting',
            s: 'endTagFormatting',
            small: 'endTagFormatting',
            strike: 'endTagFormatting',
            strong: 'endTagFormatting',
            tt: 'endTagFormatting',
            u: 'endTagFormatting',
            br: 'endTagBr',
            "-default": 'endTagOther'
        };
        modes.inBody.processCharacters = function (buffer) {
            if (tree.shouldSkipLeadingNewline) {
                tree.shouldSkipLeadingNewline = false;
                buffer.skipAtMostOneLeadingNewline();
            }
            tree.reconstructActiveFormattingElements();
            var characters = buffer.takeRemaining();
            characters = characters.replace(/\u0000/g, function (match, index) {
                tree.parseError("invalid-codepoint");
                return '';
            });
            if (!characters)
                return;
            tree.insertText(characters);
            if (tree.framesetOk && !isAllWhitespaceOrReplacementCharacters(characters))
                tree.framesetOk = false;
        };
        modes.inBody.startTagHtml = function (name, attributes) {
            tree.parseError('non-html-root');
            tree.addAttributesToElement(tree.openElements.rootNode, attributes);
        };
        modes.inBody.startTagProcessInHead = function (name, attributes) {
            modes.inHead.processStartTag(name, attributes);
        };
        modes.inBody.startTagBody = function (name, attributes) {
            tree.parseError('unexpected-start-tag', { name: 'body' });
            if (tree.openElements.length == 1 ||
                tree.openElements.item(1).localName != 'body') {
            }
            else {
                tree.framesetOk = false;
                tree.addAttributesToElement(tree.openElements.bodyElement, attributes);
            }
        };
        modes.inBody.startTagFrameset = function (name, attributes) {
            tree.parseError('unexpected-start-tag', { name: 'frameset' });
            if (tree.openElements.length == 1 ||
                tree.openElements.item(1).localName != 'body') {
            }
            else if (tree.framesetOk) {
                tree.detachFromParent(tree.openElements.bodyElement);
                while (tree.openElements.length > 1)
                    tree.openElements.pop();
                tree.insertElement(name, attributes);
                tree.setInsertionMode('inFrameset');
            }
        };
        modes.inBody.startTagCloseP = function (name, attributes) {
            if (tree.openElements.inButtonScope('p'))
                this.endTagP('p');
            tree.insertElement(name, attributes);
        };
        modes.inBody.startTagPreListing = function (name, attributes) {
            if (tree.openElements.inButtonScope('p'))
                this.endTagP('p');
            tree.insertElement(name, attributes);
            tree.framesetOk = false;
            tree.shouldSkipLeadingNewline = true;
        };
        modes.inBody.startTagForm = function (name, attributes) {
            if (tree.form) {
                tree.parseError('unexpected-start-tag', { name: name });
            }
            else {
                if (tree.openElements.inButtonScope('p'))
                    this.endTagP('p');
                tree.insertElement(name, attributes);
                tree.form = tree.currentStackItem();
            }
        };
        modes.inBody.startTagRpRt = function (name, attributes) {
            if (tree.openElements.inScope('ruby')) {
                tree.generateImpliedEndTags();
                if (tree.currentStackItem().localName != 'ruby') {
                    tree.parseError('unexpected-start-tag', { name: name });
                }
            }
            tree.insertElement(name, attributes);
        };
        modes.inBody.startTagListItem = function (name, attributes) {
            var stopNames = { li: ['li'], dd: ['dd', 'dt'], dt: ['dd', 'dt'] };
            var stopName = stopNames[name];
            var els = tree.openElements;
            for (var i = els.length - 1; i >= 0; i--) {
                var node = els.item(i);
                if (stopName.indexOf(node.localName) != -1) {
                    tree.insertionMode.processEndTag(node.localName);
                    break;
                }
                if (node.isSpecial() && node.localName !== 'p' && node.localName !== 'address' && node.localName !== 'div')
                    break;
            }
            if (tree.openElements.inButtonScope('p'))
                this.endTagP('p');
            tree.insertElement(name, attributes);
            tree.framesetOk = false;
        };
        modes.inBody.startTagPlaintext = function (name, attributes) {
            if (tree.openElements.inButtonScope('p'))
                this.endTagP('p');
            tree.insertElement(name, attributes);
            tree.tokenizer.setState(Tokenizer.PLAINTEXT);
        };
        modes.inBody.startTagHeading = function (name, attributes) {
            if (tree.openElements.inButtonScope('p'))
                this.endTagP('p');
            if (tree.currentStackItem().isNumberedHeader()) {
                tree.parseError('unexpected-start-tag', { name: name });
                tree.popElement();
            }
            tree.insertElement(name, attributes);
        };
        modes.inBody.startTagA = function (name, attributes) {
            var activeA = tree.elementInActiveFormattingElements('a');
            if (activeA) {
                tree.parseError("unexpected-start-tag-implies-end-tag", { startName: "a", endName: "a" });
                tree.adoptionAgencyEndTag('a');
                if (tree.openElements.contains(activeA))
                    tree.openElements.remove(activeA);
                tree.removeElementFromActiveFormattingElements(activeA);
            }
            tree.reconstructActiveFormattingElements();
            tree.insertFormattingElement(name, attributes);
        };
        modes.inBody.startTagFormatting = function (name, attributes) {
            tree.reconstructActiveFormattingElements();
            tree.insertFormattingElement(name, attributes);
        };
        modes.inBody.startTagNobr = function (name, attributes) {
            tree.reconstructActiveFormattingElements();
            if (tree.openElements.inScope('nobr')) {
                tree.parseError("unexpected-start-tag-implies-end-tag", { startName: 'nobr', endName: 'nobr' });
                this.processEndTag('nobr');
                tree.reconstructActiveFormattingElements();
            }
            tree.insertFormattingElement(name, attributes);
        };
        modes.inBody.startTagButton = function (name, attributes) {
            if (tree.openElements.inScope('button')) {
                tree.parseError('unexpected-start-tag-implies-end-tag', { startName: 'button', endName: 'button' });
                this.processEndTag('button');
                tree.insertionMode.processStartTag(name, attributes);
            }
            else {
                tree.framesetOk = false;
                tree.reconstructActiveFormattingElements();
                tree.insertElement(name, attributes);
            }
        };
        modes.inBody.startTagAppletMarqueeObject = function (name, attributes) {
            tree.reconstructActiveFormattingElements();
            tree.insertElement(name, attributes);
            tree.activeFormattingElements.push(Marker);
            tree.framesetOk = false;
        };
        modes.inBody.endTagAppletMarqueeObject = function (name) {
            if (!tree.openElements.inScope(name)) {
                tree.parseError("unexpected-end-tag", { name: name });
            }
            else {
                tree.generateImpliedEndTags();
                if (tree.currentStackItem().localName != name) {
                    tree.parseError('end-tag-too-early', { name: name });
                }
                tree.openElements.popUntilPopped(name);
                tree.clearActiveFormattingElements();
            }
        };
        modes.inBody.startTagXmp = function (name, attributes) {
            if (tree.openElements.inButtonScope('p'))
                this.processEndTag('p');
            tree.reconstructActiveFormattingElements();
            tree.processGenericRawTextStartTag(name, attributes);
            tree.framesetOk = false;
        };
        modes.inBody.startTagTable = function (name, attributes) {
            if (tree.compatMode !== "quirks")
                if (tree.openElements.inButtonScope('p'))
                    this.processEndTag('p');
            tree.insertElement(name, attributes);
            tree.setInsertionMode('inTable');
            tree.framesetOk = false;
        };
        modes.inBody.startTagVoidFormatting = function (name, attributes) {
            tree.reconstructActiveFormattingElements();
            tree.insertSelfClosingElement(name, attributes);
            tree.framesetOk = false;
        };
        modes.inBody.startTagParamSourceTrack = function (name, attributes) {
            tree.insertSelfClosingElement(name, attributes);
        };
        modes.inBody.startTagHr = function (name, attributes) {
            if (tree.openElements.inButtonScope('p'))
                this.endTagP('p');
            tree.insertSelfClosingElement(name, attributes);
            tree.framesetOk = false;
        };
        modes.inBody.startTagImage = function (name, attributes) {
            tree.parseError('unexpected-start-tag-treated-as', { originalName: 'image', newName: 'img' });
            this.processStartTag('img', attributes);
        };
        modes.inBody.startTagInput = function (name, attributes) {
            var currentFramesetOk = tree.framesetOk;
            this.startTagVoidFormatting(name, attributes);
            for (var key in attributes) {
                if (attributes[key].nodeName == 'type') {
                    if (attributes[key].nodeValue.toLowerCase() == 'hidden')
                        tree.framesetOk = currentFramesetOk;
                    break;
                }
            }
        };
        modes.inBody.startTagIsindex = function (name, attributes) {
            tree.parseError('deprecated-tag', { name: 'isindex' });
            tree.selfClosingFlagAcknowledged = true;
            if (tree.form)
                return;
            var formAttributes = [];
            var inputAttributes = [];
            var prompt = "This is a searchable index. Enter search keywords: ";
            for (var key in attributes) {
                switch (attributes[key].nodeName) {
                    case 'action':
                        formAttributes.push({
                            nodeName: 'action',
                            nodeValue: attributes[key].nodeValue
                        });
                        break;
                    case 'prompt':
                        prompt = attributes[key].nodeValue;
                        break;
                    case 'name':
                        break;
                    default:
                        inputAttributes.push({
                            nodeName: attributes[key].nodeName,
                            nodeValue: attributes[key].nodeValue
                        });
                }
            }
            inputAttributes.push({ nodeName: 'name', nodeValue: 'isindex' });
            this.processStartTag('form', formAttributes);
            this.processStartTag('hr');
            this.processStartTag('label');
            this.processCharacters(new CharacterBuffer(prompt));
            this.processStartTag('input', inputAttributes);
            this.processEndTag('label');
            this.processStartTag('hr');
            this.processEndTag('form');
        };
        modes.inBody.startTagTextarea = function (name, attributes) {
            tree.insertElement(name, attributes);
            tree.tokenizer.setState(Tokenizer.RCDATA);
            tree.originalInsertionMode = tree.insertionModeName;
            tree.shouldSkipLeadingNewline = true;
            tree.framesetOk = false;
            tree.setInsertionMode('text');
        };
        modes.inBody.startTagIFrame = function (name, attributes) {
            tree.framesetOk = false;
            this.startTagRawText(name, attributes);
        };
        modes.inBody.startTagRawText = function (name, attributes) {
            tree.processGenericRawTextStartTag(name, attributes);
        };
        modes.inBody.startTagSelect = function (name, attributes) {
            tree.reconstructActiveFormattingElements();
            tree.insertElement(name, attributes);
            tree.framesetOk = false;
            var insertionModeName = tree.insertionModeName;
            if (insertionModeName == 'inTable' ||
                insertionModeName == 'inCaption' ||
                insertionModeName == 'inColumnGroup' ||
                insertionModeName == 'inTableBody' ||
                insertionModeName == 'inRow' ||
                insertionModeName == 'inCell') {
                tree.setInsertionMode('inSelectInTable');
            }
            else {
                tree.setInsertionMode('inSelect');
            }
        };
        modes.inBody.startTagMisplaced = function (name, attributes) {
            tree.parseError('unexpected-start-tag-ignored', { name: name });
        };
        modes.inBody.endTagMisplaced = function (name) {
            tree.parseError("unexpected-end-tag", { name: name });
        };
        modes.inBody.endTagBr = function (name) {
            tree.parseError("unexpected-end-tag-treated-as", { originalName: "br", newName: "br element" });
            tree.reconstructActiveFormattingElements();
            tree.insertElement(name, []);
            tree.popElement();
        };
        modes.inBody.startTagOptionOptgroup = function (name, attributes) {
            if (tree.currentStackItem().localName == 'option')
                tree.popElement();
            tree.reconstructActiveFormattingElements();
            tree.insertElement(name, attributes);
        };
        modes.inBody.startTagOther = function (name, attributes) {
            tree.reconstructActiveFormattingElements();
            tree.insertElement(name, attributes);
        };
        modes.inBody.endTagOther = function (name) {
            var node;
            for (var i = tree.openElements.length - 1; i > 0; i--) {
                node = tree.openElements.item(i);
                if (node.localName == name) {
                    tree.generateImpliedEndTags(name);
                    if (tree.currentStackItem().localName != name)
                        tree.parseError('unexpected-end-tag', { name: name });
                    tree.openElements.remove_openElements_until(function (x) { return x === node; });
                    break;
                }
                if (node.isSpecial()) {
                    tree.parseError('unexpected-end-tag', { name: name });
                    break;
                }
            }
        };
        modes.inBody.startTagMath = function (name, attributes, selfClosing) {
            tree.reconstructActiveFormattingElements();
            attributes = tree.adjustMathMLAttributes(attributes);
            attributes = tree.adjustForeignAttributes(attributes);
            tree.insertForeignElement(name, attributes, "http://www.w3.org/1998/Math/MathML", selfClosing);
        };
        modes.inBody.startTagSVG = function (name, attributes, selfClosing) {
            tree.reconstructActiveFormattingElements();
            attributes = tree.adjustSVGAttributes(attributes);
            attributes = tree.adjustForeignAttributes(attributes);
            tree.insertForeignElement(name, attributes, "http://www.w3.org/2000/svg", selfClosing);
        };
        modes.inBody.endTagP = function (name) {
            if (!tree.openElements.inButtonScope('p')) {
                tree.parseError('unexpected-end-tag', { name: 'p' });
                this.startTagCloseP('p', []);
                this.endTagP('p');
            }
            else {
                tree.generateImpliedEndTags('p');
                if (tree.currentStackItem().localName != 'p')
                    tree.parseError('unexpected-implied-end-tag', { name: 'p' });
                tree.openElements.popUntilPopped(name);
            }
        };
        modes.inBody.endTagBody = function (name) {
            if (!tree.openElements.inScope('body')) {
                tree.parseError('unexpected-end-tag', { name: name });
                return;
            }
            if (tree.currentStackItem().localName != 'body') {
                tree.parseError('expected-one-end-tag-but-got-another', {
                    expectedName: tree.currentStackItem().localName,
                    gotName: name
                });
            }
            tree.setInsertionMode('afterBody');
        };
        modes.inBody.endTagHtml = function (name) {
            if (!tree.openElements.inScope('body')) {
                tree.parseError('unexpected-end-tag', { name: name });
                return;
            }
            if (tree.currentStackItem().localName != 'body') {
                tree.parseError('expected-one-end-tag-but-got-another', {
                    expectedName: tree.currentStackItem().localName,
                    gotName: name
                });
            }
            tree.setInsertionMode('afterBody');
            tree.insertionMode.processEndTag(name);
        };
        modes.inBody.endTagBlock = function (name) {
            if (!tree.openElements.inScope(name)) {
                tree.parseError('unexpected-end-tag', { name: name });
            }
            else {
                tree.generateImpliedEndTags();
                if (tree.currentStackItem().localName != name) {
                    tree.parseError('end-tag-too-early', { name: name });
                }
                tree.openElements.popUntilPopped(name);
            }
        };
        modes.inBody.endTagForm = function (name) {
            var node = tree.form;
            tree.form = null;
            if (!node || !tree.openElements.inScope(name)) {
                tree.parseError('unexpected-end-tag', { name: name });
            }
            else {
                tree.generateImpliedEndTags();
                if (tree.currentStackItem() != node) {
                    tree.parseError('end-tag-too-early-ignored', { name: 'form' });
                }
                tree.openElements.remove(node);
            }
        };
        modes.inBody.endTagListItem = function (name) {
            if (!tree.openElements.inListItemScope(name)) {
                tree.parseError('unexpected-end-tag', { name: name });
            }
            else {
                tree.generateImpliedEndTags(name);
                if (tree.currentStackItem().localName != name)
                    tree.parseError('end-tag-too-early', { name: name });
                tree.openElements.popUntilPopped(name);
            }
        };
        modes.inBody.endTagHeading = function (name) {
            if (!tree.openElements.hasNumberedHeaderElementInScope()) {
                tree.parseError('unexpected-end-tag', { name: name });
                return;
            }
            tree.generateImpliedEndTags();
            if (tree.currentStackItem().localName != name)
                tree.parseError('end-tag-too-early', { name: name });
            tree.openElements.remove_openElements_until(function (e) {
                return e.isNumberedHeader();
            });
        };
        modes.inBody.endTagFormatting = function (name, attributes) {
            if (!tree.adoptionAgencyEndTag(name))
                this.endTagOther(name, attributes);
        };
        modes.inCaption = Object.create(modes.base);
        modes.inCaption.start_tag_handlers = {
            html: 'startTagHtml',
            caption: 'startTagTableElement',
            col: 'startTagTableElement',
            colgroup: 'startTagTableElement',
            tbody: 'startTagTableElement',
            td: 'startTagTableElement',
            tfoot: 'startTagTableElement',
            thead: 'startTagTableElement',
            tr: 'startTagTableElement',
            '-default': 'startTagOther'
        };
        modes.inCaption.end_tag_handlers = {
            caption: 'endTagCaption',
            table: 'endTagTable',
            body: 'endTagIgnore',
            col: 'endTagIgnore',
            colgroup: 'endTagIgnore',
            html: 'endTagIgnore',
            tbody: 'endTagIgnore',
            td: 'endTagIgnore',
            tfood: 'endTagIgnore',
            thead: 'endTagIgnore',
            tr: 'endTagIgnore',
            '-default': 'endTagOther'
        };
        modes.inCaption.processCharacters = function (data) {
            modes.inBody.processCharacters(data);
        };
        modes.inCaption.startTagTableElement = function (name, attributes) {
            tree.parseError('unexpected-end-tag', { name: name });
            var ignoreEndTag = !tree.openElements.inTableScope('caption');
            tree.insertionMode.processEndTag('caption');
            if (!ignoreEndTag)
                tree.insertionMode.processStartTag(name, attributes);
        };
        modes.inCaption.startTagOther = function (name, attributes, selfClosing) {
            modes.inBody.processStartTag(name, attributes, selfClosing);
        };
        modes.inCaption.endTagCaption = function (name) {
            if (!tree.openElements.inTableScope('caption')) {
                tree.parseError('unexpected-end-tag', { name: name });
            }
            else {
                tree.generateImpliedEndTags();
                if (tree.currentStackItem().localName != 'caption') {
                    tree.parseError('expected-one-end-tag-but-got-another', {
                        gotName: "caption",
                        expectedName: tree.currentStackItem().localName
                    });
                }
                tree.openElements.popUntilPopped('caption');
                tree.clearActiveFormattingElements();
                tree.setInsertionMode('inTable');
            }
        };
        modes.inCaption.endTagTable = function (name) {
            tree.parseError("unexpected-end-table-in-caption");
            var ignoreEndTag = !tree.openElements.inTableScope('caption');
            tree.insertionMode.processEndTag('caption');
            if (!ignoreEndTag)
                tree.insertionMode.processEndTag(name);
        };
        modes.inCaption.endTagIgnore = function (name) {
            tree.parseError('unexpected-end-tag', { name: name });
        };
        modes.inCaption.endTagOther = function (name) {
            modes.inBody.processEndTag(name);
        };
        modes.inCell = Object.create(modes.base);
        modes.inCell.start_tag_handlers = {
            html: 'startTagHtml',
            caption: 'startTagTableOther',
            col: 'startTagTableOther',
            colgroup: 'startTagTableOther',
            tbody: 'startTagTableOther',
            td: 'startTagTableOther',
            tfoot: 'startTagTableOther',
            th: 'startTagTableOther',
            thead: 'startTagTableOther',
            tr: 'startTagTableOther',
            '-default': 'startTagOther'
        };
        modes.inCell.end_tag_handlers = {
            td: 'endTagTableCell',
            th: 'endTagTableCell',
            body: 'endTagIgnore',
            caption: 'endTagIgnore',
            col: 'endTagIgnore',
            colgroup: 'endTagIgnore',
            html: 'endTagIgnore',
            table: 'endTagImply',
            tbody: 'endTagImply',
            tfoot: 'endTagImply',
            thead: 'endTagImply',
            tr: 'endTagImply',
            '-default': 'endTagOther'
        };
        modes.inCell.processCharacters = function (data) {
            modes.inBody.processCharacters(data);
        };
        modes.inCell.startTagTableOther = function (name, attributes, selfClosing) {
            if (tree.openElements.inTableScope('td') || tree.openElements.inTableScope('th')) {
                this.closeCell();
                tree.insertionMode.processStartTag(name, attributes, selfClosing);
            }
            else {
                tree.parseError('unexpected-start-tag', { name: name });
            }
        };
        modes.inCell.startTagOther = function (name, attributes, selfClosing) {
            modes.inBody.processStartTag(name, attributes, selfClosing);
        };
        modes.inCell.endTagTableCell = function (name) {
            if (tree.openElements.inTableScope(name)) {
                tree.generateImpliedEndTags(name);
                if (tree.currentStackItem().localName != name.toLowerCase()) {
                    tree.parseError('unexpected-cell-end-tag', { name: name });
                    tree.openElements.popUntilPopped(name);
                }
                else {
                    tree.popElement();
                }
                tree.clearActiveFormattingElements();
                tree.setInsertionMode('inRow');
            }
            else {
                tree.parseError('unexpected-end-tag', { name: name });
            }
        };
        modes.inCell.endTagIgnore = function (name) {
            tree.parseError('unexpected-end-tag', { name: name });
        };
        modes.inCell.endTagImply = function (name) {
            if (tree.openElements.inTableScope(name)) {
                this.closeCell();
                tree.insertionMode.processEndTag(name);
            }
            else {
                tree.parseError('unexpected-end-tag', { name: name });
            }
        };
        modes.inCell.endTagOther = function (name) {
            modes.inBody.processEndTag(name);
        };
        modes.inCell.closeCell = function () {
            if (tree.openElements.inTableScope('td')) {
                this.endTagTableCell('td');
            }
            else if (tree.openElements.inTableScope('th')) {
                this.endTagTableCell('th');
            }
        };
        modes.inColumnGroup = Object.create(modes.base);
        modes.inColumnGroup.start_tag_handlers = {
            html: 'startTagHtml',
            col: 'startTagCol',
            '-default': 'startTagOther'
        };
        modes.inColumnGroup.end_tag_handlers = {
            colgroup: 'endTagColgroup',
            col: 'endTagCol',
            '-default': 'endTagOther'
        };
        modes.inColumnGroup.ignoreEndTagColgroup = function () {
            return tree.currentStackItem().localName == 'html';
        };
        modes.inColumnGroup.processCharacters = function (buffer) {
            var leadingWhitespace = buffer.takeLeadingWhitespace();
            if (leadingWhitespace)
                tree.insertText(leadingWhitespace);
            if (!buffer.length)
                return;
            var ignoreEndTag = this.ignoreEndTagColgroup();
            this.endTagColgroup('colgroup');
            if (!ignoreEndTag)
                tree.insertionMode.processCharacters(buffer);
        };
        modes.inColumnGroup.startTagCol = function (name, attributes) {
            tree.insertSelfClosingElement(name, attributes);
        };
        modes.inColumnGroup.startTagOther = function (name, attributes, selfClosing) {
            var ignoreEndTag = this.ignoreEndTagColgroup();
            this.endTagColgroup('colgroup');
            if (!ignoreEndTag)
                tree.insertionMode.processStartTag(name, attributes, selfClosing);
        };
        modes.inColumnGroup.endTagColgroup = function (name) {
            if (this.ignoreEndTagColgroup()) {
                tree.parseError('unexpected-end-tag', { name: name });
            }
            else {
                tree.popElement();
                tree.setInsertionMode('inTable');
            }
        };
        modes.inColumnGroup.endTagCol = function (name) {
            tree.parseError("no-end-tag", { name: 'col' });
        };
        modes.inColumnGroup.endTagOther = function (name) {
            var ignoreEndTag = this.ignoreEndTagColgroup();
            this.endTagColgroup('colgroup');
            if (!ignoreEndTag)
                tree.insertionMode.processEndTag(name);
        };
        modes.inForeignContent = Object.create(modes.base);
        modes.inForeignContent.processStartTag = function (name, attributes, selfClosing) {
            if (['b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'embed', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img', 'li', 'listing', 'menu', 'meta', 'nobr', 'ol', 'p', 'pre', 'ruby', 's', 'small', 'span', 'strong', 'strike', 'sub', 'sup', 'table', 'tt', 'u', 'ul', 'var'].indexOf(name) != -1
                || (name == 'font' && attributes.some(function (attr) { return ['color', 'face', 'size'].indexOf(attr.nodeName) >= 0; }))) {
                tree.parseError('unexpected-html-element-in-foreign-content', { name: name });
                while (tree.currentStackItem().isForeign()
                    && !tree.currentStackItem().isHtmlIntegrationPoint()
                    && !tree.currentStackItem().isMathMLTextIntegrationPoint()) {
                    tree.openElements.pop();
                }
                tree.insertionMode.processStartTag(name, attributes, selfClosing);
                return;
            }
            if (tree.currentStackItem().namespaceURI == "http://www.w3.org/1998/Math/MathML") {
                attributes = tree.adjustMathMLAttributes(attributes);
            }
            if (tree.currentStackItem().namespaceURI == "http://www.w3.org/2000/svg") {
                name = tree.adjustSVGTagNameCase(name);
                attributes = tree.adjustSVGAttributes(attributes);
            }
            attributes = tree.adjustForeignAttributes(attributes);
            tree.insertForeignElement(name, attributes, tree.currentStackItem().namespaceURI, selfClosing);
        };
        modes.inForeignContent.processEndTag = function (name) {
            var node = tree.currentStackItem();
            var index = tree.openElements.length - 1;
            if (node.localName.toLowerCase() != name)
                tree.parseError("unexpected-end-tag", { name: name });
            while (true) {
                if (index === 0)
                    break;
                if (node.localName.toLowerCase() == name) {
                    while (tree.openElements.pop() != node)
                        ;
                    break;
                }
                index -= 1;
                node = tree.openElements.item(index);
                if (node.isForeign()) {
                    continue;
                }
                else {
                    tree.insertionMode.processEndTag(name);
                    break;
                }
            }
        };
        modes.inForeignContent.processCharacters = function (buffer) {
            var characters = buffer.takeRemaining();
            characters = characters.replace(/\u0000/g, function (match, index) {
                tree.parseError('invalid-codepoint');
                return '\uFFFD';
            });
            if (tree.framesetOk && !isAllWhitespaceOrReplacementCharacters(characters))
                tree.framesetOk = false;
            tree.insertText(characters);
        };
        modes.inHeadNoscript = Object.create(modes.base);
        modes.inHeadNoscript.start_tag_handlers = {
            html: 'startTagHtml',
            basefont: 'startTagBasefontBgsoundLinkMetaNoframesStyle',
            bgsound: 'startTagBasefontBgsoundLinkMetaNoframesStyle',
            link: 'startTagBasefontBgsoundLinkMetaNoframesStyle',
            meta: 'startTagBasefontBgsoundLinkMetaNoframesStyle',
            noframes: 'startTagBasefontBgsoundLinkMetaNoframesStyle',
            style: 'startTagBasefontBgsoundLinkMetaNoframesStyle',
            head: 'startTagHeadNoscript',
            noscript: 'startTagHeadNoscript',
            "-default": 'startTagOther'
        };
        modes.inHeadNoscript.end_tag_handlers = {
            noscript: 'endTagNoscript',
            br: 'endTagBr',
            '-default': 'endTagOther'
        };
        modes.inHeadNoscript.processCharacters = function (buffer) {
            var leadingWhitespace = buffer.takeLeadingWhitespace();
            if (leadingWhitespace)
                tree.insertText(leadingWhitespace);
            if (!buffer.length)
                return;
            tree.parseError("unexpected-char-in-frameset");
            this.anythingElse();
            tree.insertionMode.processCharacters(buffer);
        };
        modes.inHeadNoscript.processComment = function (data) {
            modes.inHead.processComment(data);
        };
        modes.inHeadNoscript.startTagBasefontBgsoundLinkMetaNoframesStyle = function (name, attributes) {
            modes.inHead.processStartTag(name, attributes);
        };
        modes.inHeadNoscript.startTagHeadNoscript = function (name, attributes) {
            tree.parseError("unexpected-start-tag-in-frameset", { name: name });
        };
        modes.inHeadNoscript.startTagOther = function (name, attributes) {
            tree.parseError("unexpected-start-tag-in-frameset", { name: name });
            this.anythingElse();
            tree.insertionMode.processStartTag(name, attributes);
        };
        modes.inHeadNoscript.endTagBr = function (name, attributes) {
            tree.parseError("unexpected-end-tag-in-frameset", { name: name });
            this.anythingElse();
            tree.insertionMode.processEndTag(name, attributes);
        };
        modes.inHeadNoscript.endTagNoscript = function (name, attributes) {
            tree.popElement();
            tree.setInsertionMode('inHead');
        };
        modes.inHeadNoscript.endTagOther = function (name, attributes) {
            tree.parseError("unexpected-end-tag-in-frameset", { name: name });
        };
        modes.inHeadNoscript.anythingElse = function () {
            tree.popElement();
            tree.setInsertionMode('inHead');
        };
        modes.inFrameset = Object.create(modes.base);
        modes.inFrameset.start_tag_handlers = {
            html: 'startTagHtml',
            frameset: 'startTagFrameset',
            frame: 'startTagFrame',
            noframes: 'startTagNoframes',
            "-default": 'startTagOther'
        };
        modes.inFrameset.end_tag_handlers = {
            frameset: 'endTagFrameset',
            noframes: 'endTagNoframes',
            '-default': 'endTagOther'
        };
        modes.inFrameset.processCharacters = function (data) {
            tree.parseError("unexpected-char-in-frameset");
        };
        modes.inFrameset.startTagFrameset = function (name, attributes) {
            tree.insertElement(name, attributes);
        };
        modes.inFrameset.startTagFrame = function (name, attributes) {
            tree.insertSelfClosingElement(name, attributes);
        };
        modes.inFrameset.startTagNoframes = function (name, attributes) {
            modes.inBody.processStartTag(name, attributes);
        };
        modes.inFrameset.startTagOther = function (name, attributes) {
            tree.parseError("unexpected-start-tag-in-frameset", { name: name });
        };
        modes.inFrameset.endTagFrameset = function (name, attributes) {
            if (tree.currentStackItem().localName == 'html') {
                tree.parseError("unexpected-frameset-in-frameset-innerhtml");
            }
            else {
                tree.popElement();
            }
            if (!tree.context && tree.currentStackItem().localName != 'frameset') {
                tree.setInsertionMode('afterFrameset');
            }
        };
        modes.inFrameset.endTagNoframes = function (name) {
            modes.inBody.processEndTag(name);
        };
        modes.inFrameset.endTagOther = function (name) {
            tree.parseError("unexpected-end-tag-in-frameset", { name: name });
        };
        modes.inTable = Object.create(modes.base);
        modes.inTable.start_tag_handlers = {
            html: 'startTagHtml',
            caption: 'startTagCaption',
            colgroup: 'startTagColgroup',
            col: 'startTagCol',
            table: 'startTagTable',
            tbody: 'startTagRowGroup',
            tfoot: 'startTagRowGroup',
            thead: 'startTagRowGroup',
            td: 'startTagImplyTbody',
            th: 'startTagImplyTbody',
            tr: 'startTagImplyTbody',
            style: 'startTagStyleScript',
            script: 'startTagStyleScript',
            input: 'startTagInput',
            form: 'startTagForm',
            '-default': 'startTagOther'
        };
        modes.inTable.end_tag_handlers = {
            table: 'endTagTable',
            body: 'endTagIgnore',
            caption: 'endTagIgnore',
            col: 'endTagIgnore',
            colgroup: 'endTagIgnore',
            html: 'endTagIgnore',
            tbody: 'endTagIgnore',
            td: 'endTagIgnore',
            tfoot: 'endTagIgnore',
            th: 'endTagIgnore',
            thead: 'endTagIgnore',
            tr: 'endTagIgnore',
            '-default': 'endTagOther'
        };
        modes.inTable.processCharacters = function (data) {
            if (tree.currentStackItem().isFosterParenting()) {
                var originalInsertionMode = tree.insertionModeName;
                tree.setInsertionMode('inTableText');
                tree.originalInsertionMode = originalInsertionMode;
                tree.insertionMode.processCharacters(data);
            }
            else {
                tree.redirectAttachToFosterParent = true;
                modes.inBody.processCharacters(data);
                tree.redirectAttachToFosterParent = false;
            }
        };
        modes.inTable.startTagCaption = function (name, attributes) {
            tree.openElements.popUntilTableScopeMarker();
            tree.activeFormattingElements.push(Marker);
            tree.insertElement(name, attributes);
            tree.setInsertionMode('inCaption');
        };
        modes.inTable.startTagColgroup = function (name, attributes) {
            tree.openElements.popUntilTableScopeMarker();
            tree.insertElement(name, attributes);
            tree.setInsertionMode('inColumnGroup');
        };
        modes.inTable.startTagCol = function (name, attributes) {
            this.startTagColgroup('colgroup', []);
            tree.insertionMode.processStartTag(name, attributes);
        };
        modes.inTable.startTagRowGroup = function (name, attributes) {
            tree.openElements.popUntilTableScopeMarker();
            tree.insertElement(name, attributes);
            tree.setInsertionMode('inTableBody');
        };
        modes.inTable.startTagImplyTbody = function (name, attributes) {
            this.startTagRowGroup('tbody', []);
            tree.insertionMode.processStartTag(name, attributes);
        };
        modes.inTable.startTagTable = function (name, attributes) {
            tree.parseError("unexpected-start-tag-implies-end-tag", { startName: "table", endName: "table" });
            tree.insertionMode.processEndTag('table');
            if (!tree.context)
                tree.insertionMode.processStartTag(name, attributes);
        };
        modes.inTable.startTagStyleScript = function (name, attributes) {
            modes.inHead.processStartTag(name, attributes);
        };
        modes.inTable.startTagInput = function (name, attributes) {
            for (var key in attributes) {
                if (attributes[key].nodeName.toLowerCase() == 'type') {
                    if (attributes[key].nodeValue.toLowerCase() == 'hidden') {
                        tree.parseError("unexpected-hidden-input-in-table");
                        tree.insertElement(name, attributes);
                        tree.openElements.pop();
                        return;
                    }
                    break;
                }
            }
            this.startTagOther(name, attributes);
        };
        modes.inTable.startTagForm = function (name, attributes) {
            tree.parseError("unexpected-form-in-table");
            if (!tree.form) {
                tree.insertElement(name, attributes);
                tree.form = tree.currentStackItem();
                tree.openElements.pop();
            }
        };
        modes.inTable.startTagOther = function (name, attributes, selfClosing) {
            tree.parseError("unexpected-start-tag-implies-table-voodoo", { name: name });
            tree.redirectAttachToFosterParent = true;
            modes.inBody.processStartTag(name, attributes, selfClosing);
            tree.redirectAttachToFosterParent = false;
        };
        modes.inTable.endTagTable = function (name) {
            if (tree.openElements.inTableScope(name)) {
                tree.generateImpliedEndTags();
                if (tree.currentStackItem().localName != name) {
                    tree.parseError("end-tag-too-early-named", { gotName: 'table', expectedName: tree.currentStackItem().localName });
                }
                tree.openElements.popUntilPopped('table');
                tree.resetInsertionMode();
            }
            else {
                tree.parseError('unexpected-end-tag', { name: name });
            }
        };
        modes.inTable.endTagIgnore = function (name) {
            tree.parseError("unexpected-end-tag", { name: name });
        };
        modes.inTable.endTagOther = function (name) {
            tree.parseError("unexpected-end-tag-implies-table-voodoo", { name: name });
            tree.redirectAttachToFosterParent = true;
            modes.inBody.processEndTag(name);
            tree.redirectAttachToFosterParent = false;
        };
        modes.inTableText = Object.create(modes.base);
        modes.inTableText.flushCharacters = function () {
            var characters = tree.pendingTableCharacters.join('');
            if (!isAllWhitespace(characters)) {
                tree.redirectAttachToFosterParent = true;
                tree.reconstructActiveFormattingElements();
                tree.insertText(characters);
                tree.framesetOk = false;
                tree.redirectAttachToFosterParent = false;
            }
            else {
                tree.insertText(characters);
            }
            tree.pendingTableCharacters = [];
        };
        modes.inTableText.processComment = function (data) {
            this.flushCharacters();
            tree.setInsertionMode(tree.originalInsertionMode);
            tree.insertionMode.processComment(data);
        };
        modes.inTableText.processEOF = function (data) {
            this.flushCharacters();
            tree.setInsertionMode(tree.originalInsertionMode);
            tree.insertionMode.processEOF();
        };
        modes.inTableText.processCharacters = function (buffer) {
            var characters = buffer.takeRemaining();
            characters = characters.replace(/\u0000/g, function (match, index) {
                tree.parseError("invalid-codepoint");
                return '';
            });
            if (!characters)
                return;
            tree.pendingTableCharacters.push(characters);
        };
        modes.inTableText.processStartTag = function (name, attributes, selfClosing) {
            this.flushCharacters();
            tree.setInsertionMode(tree.originalInsertionMode);
            tree.insertionMode.processStartTag(name, attributes, selfClosing);
        };
        modes.inTableText.processEndTag = function (name, attributes) {
            this.flushCharacters();
            tree.setInsertionMode(tree.originalInsertionMode);
            tree.insertionMode.processEndTag(name, attributes);
        };
        modes.inTableBody = Object.create(modes.base);
        modes.inTableBody.start_tag_handlers = {
            html: 'startTagHtml',
            tr: 'startTagTr',
            td: 'startTagTableCell',
            th: 'startTagTableCell',
            caption: 'startTagTableOther',
            col: 'startTagTableOther',
            colgroup: 'startTagTableOther',
            tbody: 'startTagTableOther',
            tfoot: 'startTagTableOther',
            thead: 'startTagTableOther',
            '-default': 'startTagOther'
        };
        modes.inTableBody.end_tag_handlers = {
            table: 'endTagTable',
            tbody: 'endTagTableRowGroup',
            tfoot: 'endTagTableRowGroup',
            thead: 'endTagTableRowGroup',
            body: 'endTagIgnore',
            caption: 'endTagIgnore',
            col: 'endTagIgnore',
            colgroup: 'endTagIgnore',
            html: 'endTagIgnore',
            td: 'endTagIgnore',
            th: 'endTagIgnore',
            tr: 'endTagIgnore',
            '-default': 'endTagOther'
        };
        modes.inTableBody.processCharacters = function (data) {
            modes.inTable.processCharacters(data);
        };
        modes.inTableBody.startTagTr = function (name, attributes) {
            tree.openElements.popUntilTableBodyScopeMarker();
            tree.insertElement(name, attributes);
            tree.setInsertionMode('inRow');
        };
        modes.inTableBody.startTagTableCell = function (name, attributes) {
            tree.parseError("unexpected-cell-in-table-body", { name: name });
            this.startTagTr('tr', []);
            tree.insertionMode.processStartTag(name, attributes);
        };
        modes.inTableBody.startTagTableOther = function (name, attributes) {
            if (tree.openElements.inTableScope('tbody') || tree.openElements.inTableScope('thead') || tree.openElements.inTableScope('tfoot')) {
                tree.openElements.popUntilTableBodyScopeMarker();
                this.endTagTableRowGroup(tree.currentStackItem().localName);
                tree.insertionMode.processStartTag(name, attributes);
            }
            else {
                tree.parseError('unexpected-start-tag', { name: name });
            }
        };
        modes.inTableBody.startTagOther = function (name, attributes) {
            modes.inTable.processStartTag(name, attributes);
        };
        modes.inTableBody.endTagTableRowGroup = function (name) {
            if (tree.openElements.inTableScope(name)) {
                tree.openElements.popUntilTableBodyScopeMarker();
                tree.popElement();
                tree.setInsertionMode('inTable');
            }
            else {
                tree.parseError('unexpected-end-tag-in-table-body', { name: name });
            }
        };
        modes.inTableBody.endTagTable = function (name) {
            if (tree.openElements.inTableScope('tbody') || tree.openElements.inTableScope('thead') || tree.openElements.inTableScope('tfoot')) {
                tree.openElements.popUntilTableBodyScopeMarker();
                this.endTagTableRowGroup(tree.currentStackItem().localName);
                tree.insertionMode.processEndTag(name);
            }
            else {
                tree.parseError('unexpected-end-tag', { name: name });
            }
        };
        modes.inTableBody.endTagIgnore = function (name) {
            tree.parseError("unexpected-end-tag-in-table-body", { name: name });
        };
        modes.inTableBody.endTagOther = function (name) {
            modes.inTable.processEndTag(name);
        };
        modes.inSelect = Object.create(modes.base);
        modes.inSelect.start_tag_handlers = {
            html: 'startTagHtml',
            option: 'startTagOption',
            optgroup: 'startTagOptgroup',
            select: 'startTagSelect',
            input: 'startTagInput',
            keygen: 'startTagInput',
            textarea: 'startTagInput',
            script: 'startTagScript',
            '-default': 'startTagOther'
        };
        modes.inSelect.end_tag_handlers = {
            option: 'endTagOption',
            optgroup: 'endTagOptgroup',
            select: 'endTagSelect',
            caption: 'endTagTableElements',
            table: 'endTagTableElements',
            tbody: 'endTagTableElements',
            tfoot: 'endTagTableElements',
            thead: 'endTagTableElements',
            tr: 'endTagTableElements',
            td: 'endTagTableElements',
            th: 'endTagTableElements',
            '-default': 'endTagOther'
        };
        modes.inSelect.processCharacters = function (buffer) {
            var data = buffer.takeRemaining();
            data = data.replace(/\u0000/g, function (match, index) {
                tree.parseError("invalid-codepoint");
                return '';
            });
            if (!data)
                return;
            tree.insertText(data);
        };
        modes.inSelect.startTagOption = function (name, attributes) {
            if (tree.currentStackItem().localName == 'option')
                tree.popElement();
            tree.insertElement(name, attributes);
        };
        modes.inSelect.startTagOptgroup = function (name, attributes) {
            if (tree.currentStackItem().localName == 'option')
                tree.popElement();
            if (tree.currentStackItem().localName == 'optgroup')
                tree.popElement();
            tree.insertElement(name, attributes);
        };
        modes.inSelect.endTagOption = function (name) {
            if (tree.currentStackItem().localName !== 'option') {
                tree.parseError('unexpected-end-tag-in-select', { name: name });
                return;
            }
            tree.popElement();
        };
        modes.inSelect.endTagOptgroup = function (name) {
            if (tree.currentStackItem().localName == 'option' && tree.openElements.item(tree.openElements.length - 2).localName == 'optgroup') {
                tree.popElement();
            }
            if (tree.currentStackItem().localName == 'optgroup') {
                tree.popElement();
            }
            else {
                tree.parseError('unexpected-end-tag-in-select', { name: 'optgroup' });
            }
        };
        modes.inSelect.startTagSelect = function (name) {
            tree.parseError("unexpected-select-in-select");
            this.endTagSelect('select');
        };
        modes.inSelect.endTagSelect = function (name) {
            if (tree.openElements.inTableScope('select')) {
                tree.openElements.popUntilPopped('select');
                tree.resetInsertionMode();
            }
            else {
                tree.parseError('unexpected-end-tag', { name: name });
            }
        };
        modes.inSelect.startTagInput = function (name, attributes) {
            tree.parseError("unexpected-input-in-select");
            if (tree.openElements.inSelectScope('select')) {
                this.endTagSelect('select');
                tree.insertionMode.processStartTag(name, attributes);
            }
        };
        modes.inSelect.startTagScript = function (name, attributes) {
            modes.inHead.processStartTag(name, attributes);
        };
        modes.inSelect.endTagTableElements = function (name) {
            tree.parseError('unexpected-end-tag-in-select', { name: name });
            if (tree.openElements.inTableScope(name)) {
                this.endTagSelect('select');
                tree.insertionMode.processEndTag(name);
            }
        };
        modes.inSelect.startTagOther = function (name, attributes) {
            tree.parseError("unexpected-start-tag-in-select", { name: name });
        };
        modes.inSelect.endTagOther = function (name) {
            tree.parseError('unexpected-end-tag-in-select', { name: name });
        };
        modes.inSelectInTable = Object.create(modes.base);
        modes.inSelectInTable.start_tag_handlers = {
            caption: 'startTagTable',
            table: 'startTagTable',
            tbody: 'startTagTable',
            tfoot: 'startTagTable',
            thead: 'startTagTable',
            tr: 'startTagTable',
            td: 'startTagTable',
            th: 'startTagTable',
            '-default': 'startTagOther'
        };
        modes.inSelectInTable.end_tag_handlers = {
            caption: 'endTagTable',
            table: 'endTagTable',
            tbody: 'endTagTable',
            tfoot: 'endTagTable',
            thead: 'endTagTable',
            tr: 'endTagTable',
            td: 'endTagTable',
            th: 'endTagTable',
            '-default': 'endTagOther'
        };
        modes.inSelectInTable.processCharacters = function (data) {
            modes.inSelect.processCharacters(data);
        };
        modes.inSelectInTable.startTagTable = function (name, attributes) {
            tree.parseError("unexpected-table-element-start-tag-in-select-in-table", { name: name });
            this.endTagOther("select");
            tree.insertionMode.processStartTag(name, attributes);
        };
        modes.inSelectInTable.startTagOther = function (name, attributes, selfClosing) {
            modes.inSelect.processStartTag(name, attributes, selfClosing);
        };
        modes.inSelectInTable.endTagTable = function (name) {
            tree.parseError("unexpected-table-element-end-tag-in-select-in-table", { name: name });
            if (tree.openElements.inTableScope(name)) {
                this.endTagOther("select");
                tree.insertionMode.processEndTag(name);
            }
        };
        modes.inSelectInTable.endTagOther = function (name) {
            modes.inSelect.processEndTag(name);
        };
        modes.inRow = Object.create(modes.base);
        modes.inRow.start_tag_handlers = {
            html: 'startTagHtml',
            td: 'startTagTableCell',
            th: 'startTagTableCell',
            caption: 'startTagTableOther',
            col: 'startTagTableOther',
            colgroup: 'startTagTableOther',
            tbody: 'startTagTableOther',
            tfoot: 'startTagTableOther',
            thead: 'startTagTableOther',
            tr: 'startTagTableOther',
            '-default': 'startTagOther'
        };
        modes.inRow.end_tag_handlers = {
            tr: 'endTagTr',
            table: 'endTagTable',
            tbody: 'endTagTableRowGroup',
            tfoot: 'endTagTableRowGroup',
            thead: 'endTagTableRowGroup',
            body: 'endTagIgnore',
            caption: 'endTagIgnore',
            col: 'endTagIgnore',
            colgroup: 'endTagIgnore',
            html: 'endTagIgnore',
            td: 'endTagIgnore',
            th: 'endTagIgnore',
            '-default': 'endTagOther'
        };
        modes.inRow.processCharacters = function (data) {
            modes.inTable.processCharacters(data);
        };
        modes.inRow.startTagTableCell = function (name, attributes) {
            tree.openElements.popUntilTableRowScopeMarker();
            tree.insertElement(name, attributes);
            tree.setInsertionMode('inCell');
            tree.activeFormattingElements.push(Marker);
        };
        modes.inRow.startTagTableOther = function (name, attributes) {
            var ignoreEndTag = this.ignoreEndTagTr();
            this.endTagTr('tr');
            if (!ignoreEndTag)
                tree.insertionMode.processStartTag(name, attributes);
        };
        modes.inRow.startTagOther = function (name, attributes, selfClosing) {
            modes.inTable.processStartTag(name, attributes, selfClosing);
        };
        modes.inRow.endTagTr = function (name) {
            if (this.ignoreEndTagTr()) {
                tree.parseError('unexpected-end-tag', { name: name });
            }
            else {
                tree.openElements.popUntilTableRowScopeMarker();
                tree.popElement();
                tree.setInsertionMode('inTableBody');
            }
        };
        modes.inRow.endTagTable = function (name) {
            var ignoreEndTag = this.ignoreEndTagTr();
            this.endTagTr('tr');
            if (!ignoreEndTag)
                tree.insertionMode.processEndTag(name);
        };
        modes.inRow.endTagTableRowGroup = function (name) {
            if (tree.openElements.inTableScope(name)) {
                this.endTagTr('tr');
                tree.insertionMode.processEndTag(name);
            }
            else {
                tree.parseError('unexpected-end-tag', { name: name });
            }
        };
        modes.inRow.endTagIgnore = function (name) {
            tree.parseError("unexpected-end-tag-in-table-row", { name: name });
        };
        modes.inRow.endTagOther = function (name) {
            modes.inTable.processEndTag(name);
        };
        modes.inRow.ignoreEndTagTr = function () {
            return !tree.openElements.inTableScope('tr');
        };
        modes.afterAfterFrameset = Object.create(modes.base);
        modes.afterAfterFrameset.start_tag_handlers = {
            html: 'startTagHtml',
            noframes: 'startTagNoFrames',
            '-default': 'startTagOther'
        };
        modes.afterAfterFrameset.processEOF = function () { };
        modes.afterAfterFrameset.processComment = function (data) {
            tree.insertComment(data, tree.document);
        };
        modes.afterAfterFrameset.processCharacters = function (buffer) {
            var characters = buffer.takeRemaining();
            var whitespace = "";
            for (var i = 0; i < characters.length; i++) {
                var ch = characters[i];
                if (isWhitespace(ch))
                    whitespace += ch;
            }
            if (whitespace) {
                tree.reconstructActiveFormattingElements();
                tree.insertText(whitespace);
            }
            if (whitespace.length < characters.length)
                tree.parseError('expected-eof-but-got-char');
        };
        modes.afterAfterFrameset.startTagNoFrames = function (name, attributes) {
            modes.inHead.processStartTag(name, attributes);
        };
        modes.afterAfterFrameset.startTagOther = function (name, attributes, selfClosing) {
            tree.parseError('expected-eof-but-got-start-tag', { name: name });
        };
        modes.afterAfterFrameset.processEndTag = function (name, attributes) {
            tree.parseError('expected-eof-but-got-end-tag', { name: name });
        };
        modes.text = Object.create(modes.base);
        modes.text.start_tag_handlers = {
            '-default': 'startTagOther'
        };
        modes.text.end_tag_handlers = {
            script: 'endTagScript',
            '-default': 'endTagOther'
        };
        modes.text.processCharacters = function (buffer) {
            if (tree.shouldSkipLeadingNewline) {
                tree.shouldSkipLeadingNewline = false;
                buffer.skipAtMostOneLeadingNewline();
            }
            var data = buffer.takeRemaining();
            if (!data)
                return;
            tree.insertText(data);
        };
        modes.text.processEOF = function () {
            tree.parseError("expected-named-closing-tag-but-got-eof", { name: tree.currentStackItem().localName });
            tree.openElements.pop();
            tree.setInsertionMode(tree.originalInsertionMode);
            tree.insertionMode.processEOF();
        };
        modes.text.startTagOther = function (name) {
            throw "Tried to process start tag " + name + " in RCDATA/RAWTEXT mode";
        };
        modes.text.endTagScript = function (name) {
            var node = tree.openElements.pop();
            tree.setInsertionMode(tree.originalInsertionMode);
        };
        modes.text.endTagOther = function (name) {
            tree.openElements.pop();
            tree.setInsertionMode(tree.originalInsertionMode);
        };
    }
    setInsertionMode(name) {
        this.insertionMode = this.insertionModes[name];
        this.insertionModeName = name;
    }
    adoptionAgencyEndTag(name) {
        var outerIterationLimit = 8;
        var innerIterationLimit = 3;
        var formattingElement;
        function isActiveFormattingElement(el) {
            return el === formattingElement;
        }
        var outerLoopCounter = 0;
        while (outerLoopCounter++ < outerIterationLimit) {
            formattingElement = this.elementInActiveFormattingElements(name);
            if (!formattingElement || (this.openElements.contains(formattingElement) && !this.openElements.inScope(formattingElement.localName))) {
                this.parseError('adoption-agency-1.1', { name: name });
                return false;
            }
            if (!this.openElements.contains(formattingElement)) {
                this.parseError('adoption-agency-1.2', { name: name });
                this.removeElementFromActiveFormattingElements(formattingElement);
                return true;
            }
            if (!this.openElements.inScope(formattingElement.localName)) {
                this.parseError('adoption-agency-4.4', { name: name });
            }
            if (formattingElement != this.currentStackItem()) {
                this.parseError('adoption-agency-1.3', { name: name });
            }
            var furthestBlock = this.openElements.furthestBlockForFormattingElement(formattingElement.node);
            if (!furthestBlock) {
                this.openElements.remove_openElements_until(isActiveFormattingElement);
                this.removeElementFromActiveFormattingElements(formattingElement);
                return true;
            }
            var afeIndex = this.openElements.elements.indexOf(formattingElement);
            var commonAncestor = this.openElements.item(afeIndex - 1);
            var bookmark = this.activeFormattingElements.indexOf(formattingElement);
            var node = furthestBlock;
            var lastNode = furthestBlock;
            var index = this.openElements.elements.indexOf(node);
            var innerLoopCounter = 0;
            while (innerLoopCounter++ < innerIterationLimit) {
                index -= 1;
                node = this.openElements.item(index);
                if (this.activeFormattingElements.indexOf(node) < 0) {
                    this.openElements.elements.splice(index, 1);
                    continue;
                }
                if (node == formattingElement)
                    break;
                if (lastNode == furthestBlock)
                    bookmark = this.activeFormattingElements.indexOf(node) + 1;
                var clone = this.createElement(node.namespaceURI, node.localName, node.attributes);
                var newNode = new StackItem(node.namespaceURI, node.localName, node.attributes, clone);
                this.activeFormattingElements[this.activeFormattingElements.indexOf(node)] = newNode;
                this.openElements.elements[this.openElements.elements.indexOf(node)] = newNode;
                node = newNode;
                this.detachFromParent(lastNode.node);
                this.attachNode(lastNode.node, node.node);
                lastNode = node;
            }
            this.detachFromParent(lastNode.node);
            if (commonAncestor.isFosterParenting()) {
                this.insertIntoFosterParent(lastNode.node);
            }
            else {
                this.attachNode(lastNode.node, commonAncestor.node);
            }
            var clone = this.createElement("http://www.w3.org/1999/xhtml", formattingElement.localName, formattingElement.attributes);
            var formattingClone = new StackItem(formattingElement.namespaceURI, formattingElement.localName, formattingElement.attributes, clone);
            this.reparentChildren(furthestBlock.node, clone);
            this.attachNode(clone, furthestBlock.node);
            this.removeElementFromActiveFormattingElements(formattingElement);
            this.activeFormattingElements.splice(Math.min(bookmark, this.activeFormattingElements.length), 0, formattingClone);
            this.openElements.remove(formattingElement);
            this.openElements.elements.splice(this.openElements.elements.indexOf(furthestBlock) + 1, 0, formattingClone);
        }
        return true;
    }
    start(tokenizer) {
        throw "Not implemented";
    }
    startTokenization(tokenizer) {
        this.tokenizer = tokenizer;
        this.compatMode = "no quirks";
        this.originalInsertionMode = "initial";
        this.framesetOk = true;
        this.openElements = new ElementStack();
        this.activeFormattingElements = [];
        this.start(tokenizer);
        if (this.context) {
            switch (this.context) {
                case 'title':
                case 'textarea':
                    this.tokenizer.setState(Tokenizer.RCDATA);
                    break;
                case 'style':
                case 'xmp':
                case 'iframe':
                case 'noembed':
                case 'noframes':
                    this.tokenizer.setState(Tokenizer.RAWTEXT);
                    break;
                case 'script':
                    this.tokenizer.setState(Tokenizer.SCRIPT_DATA);
                    break;
                case 'noscript':
                    if (this.scriptingEnabled)
                        this.tokenizer.setState(Tokenizer.RAWTEXT);
                    break;
                case 'plaintext':
                    this.tokenizer.setState(Tokenizer.PLAINTEXT);
                    break;
            }
            this.insertHtmlElement();
            this.resetInsertionMode();
        }
        else {
            this.setInsertionMode('initial');
        }
    }
    processToken(token) {
        this.selfClosingFlagAcknowledged = false;
        var currentNode = this.openElements.top || null;
        var insertionMode;
        if (!currentNode || !currentNode.isForeign() ||
            (currentNode.isMathMLTextIntegrationPoint() &&
                ((token.type == 'StartTag' &&
                    !(token.name in { mglyph: 0, malignmark: 0 })) ||
                    (token.type === 'Characters'))) ||
            (currentNode.namespaceURI == "http://www.w3.org/1998/Math/MathML" &&
                currentNode.localName == 'annotation-xml' &&
                token.type == 'StartTag' && token.name == 'svg') ||
            (currentNode.isHtmlIntegrationPoint() &&
                token.type in { StartTag: 0, Characters: 0 }) ||
            token.type == 'EOF') {
            insertionMode = this.insertionMode;
        }
        else {
            insertionMode = this.insertionModes.inForeignContent;
        }
        switch (token.type) {
            case 'Characters':
                var buffer = new CharacterBuffer(token.data);
                insertionMode.processCharacters(buffer);
                break;
            case 'Comment':
                insertionMode.processComment(token.data);
                break;
            case 'StartTag':
                insertionMode.processStartTag(token.name, token.data, token.selfClosing);
                break;
            case 'EndTag':
                insertionMode.processEndTag(token.name);
                break;
            case 'Doctype':
                insertionMode.processDoctype(token.name, token.publicId, token.systemId, token.forceQuirks);
                break;
            case 'EOF':
                insertionMode.processEOF();
                break;
        }
    }
    isCdataSectionAllowed() {
        return this.openElements.length > 0 && this.currentStackItem().isForeign();
    }
    isSelfClosingFlagAcknowledged() {
        return this.selfClosingFlagAcknowledged;
    }
    createElement(namespaceURI, localName, attributes) {
        throw new Error("Not implemented");
    }
    attachNode(child, parent) {
        throw new Error("Not implemented");
    }
    attachNodeToFosterParent(child, table, stackParent) {
        throw new Error("Not implemented");
    }
    detachFromParent(node) {
        throw new Error("Not implemented");
    }
    addAttributesToElement(element, attributes) {
        throw new Error("Not implemented");
    }
    insertHtmlElement(attributes) {
        var root = this.createElement("http://www.w3.org/1999/xhtml", 'html', attributes);
        this.attachNode(root, this.document);
        this.openElements.pushHtmlElement(new StackItem("http://www.w3.org/1999/xhtml", 'html', attributes, root));
        return root;
    }
    insertHeadElement(attributes) {
        var element = this.createElement("http://www.w3.org/1999/xhtml", "head", attributes);
        this.head = new StackItem("http://www.w3.org/1999/xhtml", "head", attributes, element);
        this.attachNode(element, this.openElements.top.node);
        this.openElements.pushHeadElement(this.head);
        return element;
    }
    insertBodyElement(attributes) {
        var element = this.createElement("http://www.w3.org/1999/xhtml", "body", attributes);
        this.attachNode(element, this.openElements.top.node);
        this.openElements.pushBodyElement(new StackItem("http://www.w3.org/1999/xhtml", "body", attributes, element));
        return element;
    }
    insertIntoFosterParent(node) {
        var tableIndex = this.openElements.findIndex('table');
        var tableElement = this.openElements.item(tableIndex).node;
        if (tableIndex === 0)
            return this.attachNode(node, tableElement);
        this.attachNodeToFosterParent(node, tableElement, this.openElements.item(tableIndex - 1).node);
    }
    insertElement(name, attributes, namespaceURI, selfClosing) {
        if (!namespaceURI)
            namespaceURI = "http://www.w3.org/1999/xhtml";
        var element = this.createElement(namespaceURI, name, attributes);
        if (this.shouldFosterParent())
            this.insertIntoFosterParent(element);
        else
            this.attachNode(element, this.openElements.top.node);
        if (!selfClosing)
            this.openElements.push(new StackItem(namespaceURI, name, attributes, element));
    }
    insertFormattingElement(name, attributes) {
        this.insertElement(name, attributes, "http://www.w3.org/1999/xhtml");
        this.appendElementToActiveFormattingElements(this.currentStackItem());
    }
    insertSelfClosingElement(name, attributes) {
        this.selfClosingFlagAcknowledged = true;
        this.insertElement(name, attributes, "http://www.w3.org/1999/xhtml", true);
    }
    insertForeignElement(name, attributes, namespaceURI, selfClosing) {
        if (selfClosing)
            this.selfClosingFlagAcknowledged = true;
        this.insertElement(name, attributes, namespaceURI, selfClosing);
    }
    insertComment(data, parent) {
        throw new Error("Not implemented");
    }
    insertDoctype(name, publicId, systemId) {
        throw new Error("Not implemented");
    }
    insertText(data) {
        throw new Error("Not implemented");
    }
    currentStackItem() {
        return this.openElements.top;
    }
    popElement() {
        return this.openElements.pop();
    }
    shouldFosterParent() {
        return this.redirectAttachToFosterParent && this.currentStackItem().isFosterParenting();
    }
    generateImpliedEndTags(exclude) {
        var name = this.openElements.top.localName;
        if (['dd', 'dt', 'li', 'option', 'optgroup', 'p', 'rp', 'rt'].indexOf(name) != -1 && name != exclude) {
            this.popElement();
            this.generateImpliedEndTags(exclude);
        }
    }
    reconstructActiveFormattingElements() {
        if (this.activeFormattingElements.length === 0)
            return;
        var i = this.activeFormattingElements.length - 1;
        var entry = this.activeFormattingElements[i];
        if (entry == Marker || this.openElements.contains(entry))
            return;
        while (entry != Marker && !this.openElements.contains(entry)) {
            i -= 1;
            entry = this.activeFormattingElements[i];
            if (!entry)
                break;
        }
        while (true) {
            i += 1;
            entry = this.activeFormattingElements[i];
            this.insertElement(entry.localName, entry.attributes);
            var element = this.currentStackItem();
            this.activeFormattingElements[i] = element;
            if (element == this.activeFormattingElements[this.activeFormattingElements.length - 1])
                break;
        }
    }
    ensureNoahsArkCondition(item) {
        var kNoahsArkCapacity = 3;
        if (this.activeFormattingElements.length < kNoahsArkCapacity)
            return;
        var candidates = [];
        var newItemAttributeCount = item.attributes.length;
        for (var i = this.activeFormattingElements.length - 1; i >= 0; i--) {
            var candidate = this.activeFormattingElements[i];
            if (candidate === Marker)
                break;
            if (item.localName !== candidate.localName || item.namespaceURI !== candidate.namespaceURI)
                continue;
            if (candidate.attributes.length != newItemAttributeCount)
                continue;
            candidates.push(candidate);
        }
        if (candidates.length < kNoahsArkCapacity)
            return;
        var remainingCandidates = [];
        var attributes = item.attributes;
        for (var i = 0; i < attributes.length; i++) {
            var attribute = attributes[i];
            for (var j = 0; j < candidates.length; j++) {
                var candidate = candidates[j];
                var candidateAttribute = getAttribute(candidate, attribute.nodeName);
                if (candidateAttribute && candidateAttribute.nodeValue === attribute.nodeValue)
                    remainingCandidates.push(candidate);
            }
            if (remainingCandidates.length < kNoahsArkCapacity)
                return;
            candidates = remainingCandidates;
            remainingCandidates = [];
        }
        for (var i = kNoahsArkCapacity - 1; i < candidates.length; i++)
            this.removeElementFromActiveFormattingElements(candidates[i]);
    }
    appendElementToActiveFormattingElements(item) {
        this.ensureNoahsArkCondition(item);
        this.activeFormattingElements.push(item);
    }
    removeElementFromActiveFormattingElements(item) {
        var index = this.activeFormattingElements.indexOf(item);
        if (index >= 0)
            this.activeFormattingElements.splice(index, 1);
    }
    elementInActiveFormattingElements(name) {
        var els = this.activeFormattingElements;
        for (var i = els.length - 1; i >= 0; i--) {
            if (els[i] == Marker)
                break;
            if (els[i].localName == name)
                return els[i];
        }
        return false;
    }
    clearActiveFormattingElements() {
        while (!(this.activeFormattingElements.length === 0 || this.activeFormattingElements.pop() == Marker))
            ;
    }
    reparentChildren(oldParent, newParent) {
        throw new Error("Not implemented");
    }
    setFragmentContext(context) {
        this.context = context;
    }
    parseError(code, args) {
        if (!this.errorHandler)
            return;
        var message = formatMessage(messages[code], args);
        this.errorHandler.error(message, this.tokenizer._inputStream.location(), code);
    }
    resetInsertionMode() {
        var last = false;
        var node = null;
        for (var i = this.openElements.length - 1; i >= 0; i--) {
            node = this.openElements.item(i);
            if (i === 0) {
                last = true;
                node = new StackItem("http://www.w3.org/1999/xhtml", this.context, [], null);
            }
            if (node.namespaceURI === "http://www.w3.org/1999/xhtml") {
                if (node.localName === 'select')
                    return this.setInsertionMode('inSelect');
                if (node.localName === 'td' || node.localName === 'th')
                    return this.setInsertionMode('inCell');
                if (node.localName === 'tr')
                    return this.setInsertionMode('inRow');
                if (node.localName === 'tbody' || node.localName === 'thead' || node.localName === 'tfoot')
                    return this.setInsertionMode('inTableBody');
                if (node.localName === 'caption')
                    return this.setInsertionMode('inCaption');
                if (node.localName === 'colgroup')
                    return this.setInsertionMode('inColumnGroup');
                if (node.localName === 'table')
                    return this.setInsertionMode('inTable');
                if (node.localName === 'head' && !last)
                    return this.setInsertionMode('inHead');
                if (node.localName === 'body')
                    return this.setInsertionMode('inBody');
                if (node.localName === 'frameset')
                    return this.setInsertionMode('inFrameset');
                if (node.localName === 'html')
                    if (!this.openElements.headElement)
                        return this.setInsertionMode('beforeHead');
                    else
                        return this.setInsertionMode('afterHead');
            }
            if (last)
                return this.setInsertionMode('inBody');
        }
    }
    processGenericRCDATAStartTag(name, attributes) {
        this.insertElement(name, attributes);
        this.tokenizer.setState(Tokenizer.RCDATA);
        this.originalInsertionMode = this.insertionModeName;
        this.setInsertionMode('text');
    }
    processGenericRawTextStartTag(name, attributes) {
        this.insertElement(name, attributes);
        this.tokenizer.setState(Tokenizer.RAWTEXT);
        this.originalInsertionMode = this.insertionModeName;
        this.setInsertionMode('text');
    }
    adjustMathMLAttributes(attributes) {
        attributes.forEach(function (a) {
            a.namespaceURI = "http://www.w3.org/1998/Math/MathML";
            if (MATHMLAttributeMap[a.nodeName])
                a.nodeName = MATHMLAttributeMap[a.nodeName];
        });
        return attributes;
    }
    adjustSVGTagNameCase(name) {
        return SVGTagMap[name] || name;
    }
    adjustSVGAttributes(attributes) {
        attributes.forEach(function (a) {
            a.namespaceURI = "http://www.w3.org/2000/svg";
            if (SVGAttributeMap[a.nodeName])
                a.nodeName = SVGAttributeMap[a.nodeName];
        });
        return attributes;
    }
    adjustForeignAttributes(attributes) {
        for (var i = 0; i < attributes.length; i++) {
            var attribute = attributes[i];
            var adjusted = ForeignAttributeMap[attribute.nodeName];
            if (adjusted) {
                attribute.nodeName = adjusted.localName;
                attribute.prefix = adjusted.prefix;
                attribute.namespaceURI = adjusted.namespaceURI;
            }
        }
        return attributes;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVHJlZUJ1aWxkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbW9kZS9odG1sL1RyZWVCdWlsZGVyLnRzIl0sIm5hbWVzIjpbIlRyZWVCdWlsZGVyIiwiVHJlZUJ1aWxkZXIuY29uc3RydWN0b3IiLCJwdWJsaWNJZFN0YXJ0c1dpdGgiLCJUcmVlQnVpbGRlci5zZXRJbnNlcnRpb25Nb2RlIiwiVHJlZUJ1aWxkZXIuYWRvcHRpb25BZ2VuY3lFbmRUYWciLCJUcmVlQnVpbGRlci5hZG9wdGlvbkFnZW5jeUVuZFRhZy5pc0FjdGl2ZUZvcm1hdHRpbmdFbGVtZW50IiwiVHJlZUJ1aWxkZXIuc3RhcnQiLCJUcmVlQnVpbGRlci5zdGFydFRva2VuaXphdGlvbiIsIlRyZWVCdWlsZGVyLnByb2Nlc3NUb2tlbiIsIlRyZWVCdWlsZGVyLmlzQ2RhdGFTZWN0aW9uQWxsb3dlZCIsIlRyZWVCdWlsZGVyLmlzU2VsZkNsb3NpbmdGbGFnQWNrbm93bGVkZ2VkIiwiVHJlZUJ1aWxkZXIuY3JlYXRlRWxlbWVudCIsIlRyZWVCdWlsZGVyLmF0dGFjaE5vZGUiLCJUcmVlQnVpbGRlci5hdHRhY2hOb2RlVG9Gb3N0ZXJQYXJlbnQiLCJUcmVlQnVpbGRlci5kZXRhY2hGcm9tUGFyZW50IiwiVHJlZUJ1aWxkZXIuYWRkQXR0cmlidXRlc1RvRWxlbWVudCIsIlRyZWVCdWlsZGVyLmluc2VydEh0bWxFbGVtZW50IiwiVHJlZUJ1aWxkZXIuaW5zZXJ0SGVhZEVsZW1lbnQiLCJUcmVlQnVpbGRlci5pbnNlcnRCb2R5RWxlbWVudCIsIlRyZWVCdWlsZGVyLmluc2VydEludG9Gb3N0ZXJQYXJlbnQiLCJUcmVlQnVpbGRlci5pbnNlcnRFbGVtZW50IiwiVHJlZUJ1aWxkZXIuaW5zZXJ0Rm9ybWF0dGluZ0VsZW1lbnQiLCJUcmVlQnVpbGRlci5pbnNlcnRTZWxmQ2xvc2luZ0VsZW1lbnQiLCJUcmVlQnVpbGRlci5pbnNlcnRGb3JlaWduRWxlbWVudCIsIlRyZWVCdWlsZGVyLmluc2VydENvbW1lbnQiLCJUcmVlQnVpbGRlci5pbnNlcnREb2N0eXBlIiwiVHJlZUJ1aWxkZXIuaW5zZXJ0VGV4dCIsIlRyZWVCdWlsZGVyLmN1cnJlbnRTdGFja0l0ZW0iLCJUcmVlQnVpbGRlci5wb3BFbGVtZW50IiwiVHJlZUJ1aWxkZXIuc2hvdWxkRm9zdGVyUGFyZW50IiwiVHJlZUJ1aWxkZXIuZ2VuZXJhdGVJbXBsaWVkRW5kVGFncyIsIlRyZWVCdWlsZGVyLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzIiwiVHJlZUJ1aWxkZXIuZW5zdXJlTm9haHNBcmtDb25kaXRpb24iLCJUcmVlQnVpbGRlci5hcHBlbmRFbGVtZW50VG9BY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMiLCJUcmVlQnVpbGRlci5yZW1vdmVFbGVtZW50RnJvbUFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cyIsIlRyZWVCdWlsZGVyLmVsZW1lbnRJbkFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cyIsIlRyZWVCdWlsZGVyLmNsZWFyQWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzIiwiVHJlZUJ1aWxkZXIucmVwYXJlbnRDaGlsZHJlbiIsIlRyZWVCdWlsZGVyLnNldEZyYWdtZW50Q29udGV4dCIsIlRyZWVCdWlsZGVyLnBhcnNlRXJyb3IiLCJUcmVlQnVpbGRlci5yZXNldEluc2VydGlvbk1vZGUiLCJUcmVlQnVpbGRlci5wcm9jZXNzR2VuZXJpY1JDREFUQVN0YXJ0VGFnIiwiVHJlZUJ1aWxkZXIucHJvY2Vzc0dlbmVyaWNSYXdUZXh0U3RhcnRUYWciLCJUcmVlQnVpbGRlci5hZGp1c3RNYXRoTUxBdHRyaWJ1dGVzIiwiVHJlZUJ1aWxkZXIuYWRqdXN0U1ZHVGFnTmFtZUNhc2UiLCJUcmVlQnVpbGRlci5hZGp1c3RTVkdBdHRyaWJ1dGVzIiwiVHJlZUJ1aWxkZXIuYWRqdXN0Rm9yZWlnbkF0dHJpYnV0ZXMiXSwibWFwcGluZ3MiOiJPQUFPLEVBQUMsbUJBQW1CLEVBQUUsa0JBQWtCLEVBQUUsZUFBZSxFQUFF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QUFFQSxLQUFLQSxpQkFBaUJBLENBQUNBO1FBQ3BDQSxDQUFDQTtRQUVERCxJQUFJQSxnQkFBZ0JBLEdBQUdBLENBQUNBLENBQUNBO1FBRXpCQSxPQUFPQSxnQkFBZ0JBLEVBQUVBLEdBQUdBLG1CQUFtQkEsRUFBRUEsQ0FBQ0E7WUFFOUNBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUNBQWlDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUVqRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsaUJBQWlCQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxRQUFRQSxDQUFDQSxpQkFBaUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25JQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxxQkFBcUJBLEVBQUVBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBO2dCQUN2REEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDakJBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLFFBQVFBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pEQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxxQkFBcUJBLEVBQUVBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBO2dCQUN2REEsSUFBSUEsQ0FBQ0EseUNBQXlDQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBO2dCQUNsRUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsU0FBU0EsQ0FB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QkEsQ0FBQ0E7Z0JBQ3JEQSxRQUFRQSxDQUFDQTtZQUNiQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUMvQkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsR0FBR0EsaUJBQWlCQSxDQUFDQTtZQUN0Q0EsTUFBTUEsQ0FBQ0E7UUFFWEEsSUFBSUEsbUJBQW1CQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUM3QkEsSUFBSUEsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFDakNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFVBQVVBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3pDQSxJQUFJQSxTQUFTQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUU5QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQ3pDQSxJQUFJQSxTQUFTQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOUJBLElBQUlBLGtCQUFrQkEsR0FBR0EsWUFBWUEsQ0FBQ0EsU0FBU0EsRUFBRUEsU0FBU0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JFQSxFQUFFQSxDQUFDQSxDQUFDQSxrQkFBa0JBLElBQUlBLGtCQUFrQkEsQ0FBQ0EsU0FBU0EsS0FBS0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0E7b0JBQzNFQSxtQkFBbUJBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQzVDQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxtQkFBbUJBLENBQUNBLE1BQU1BLEdBQUdBLGlC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LEVBQUVBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFlBQVlBLENBQUNBLFFBQVFBLEVBQUVBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQ25GQSxDQUFDQTtJQUtEdkMsa0JBQWtCQTtRQUNkd0MsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDakJBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2hCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUNyREEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUVWQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDWkEsSUFBSUEsR0FBR0EsSUFBSUEsU0FBU0EsQ0FBQ0EsOEJBQThCQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxFQUFFQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNqRkEsQ0FBQ0E7WUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsS0FBS0EsOEJBQThCQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFFdkRBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLFFBQVFBLENBQUNBO29CQUU1QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtnQkFDN0NBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLElBQUlBLENBQUNBO29CQUNuREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFDM0NBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLElBQUlBLENBQUNBO29CQUN4QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtnQkFDMUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLE9BQU9BLElBQUlBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLE9BQU9BLElBQUlBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLE9BQU9BLENBQUNBO29CQUN2RkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtnQkFDaERBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLFNBQVNBLENBQUNBO29CQUM3QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtnQkFDOUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLFVBQVVBLENBQUNBO29CQUM5QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQTtnQkFDbERBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLE9BQU9BLENBQUNBO29CQUMzQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtnQkFDNUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLENBQUNBO29CQUNuQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxR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ZUFBZSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDNUIsQ0FBQyxDQUFDLFFBQVEsR0FBRyxlQUFlLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2pELENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDSEEsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7SUFDdEJBLENBQUNBO0lBRUQ3Qyx1QkFBdUJBLENBQUNBLFVBQVVBO1FBQzlCOEMsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDekNBLElBQUlBLFNBQVNBLEdBQUdBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzlCQSxJQUFJQSxRQUFRQSxHQUFHQSxtQkFBbUJBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBQ3ZEQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWEEsU0FBU0EsQ0FBQ0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7Z0JBQ3hDQSxTQUFTQSxDQUFDQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQTtnQkFDbkNBLFNBQVNBLENBQUNBLFlBQVlBLEdBQUdBLFFBQVFBLENBQUNBLFlBQVlBLENBQUNBO1lBQ25EQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQTtJQUN0QkEsQ0FBQ0E7QUFDTDlDLENBQUNBO0FBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0ZvcmVpZ25BdHRyaWJ1dGVNYXAsIE1BVEhNTEF0dHJpYnV0ZU1hcCwgU1ZHQXR0cmlidXRlTWFwLCBTVkdUYWdNYXB9IGZyb20gJy4vY29uc3RhbnRzJztcbmltcG9ydCBDaGFyYWN0ZXJCdWZmZXIgZnJvbSAnLi9DaGFyYWN0ZXJCdWZmZXInO1xuaW1wb3J0IEVsZW1lbnRTdGFjayBmcm9tICcuL0VsZW1lbnRTdGFjayc7XG5pbXBvcnQgZm9ybWF0TWVzc2FnZSBmcm9tICcuL2Zvcm1hdE1lc3NhZ2UnO1xuaW1wb3J0IGdldEF0dHJpYnV0ZSBmcm9tICcuL2dldEF0dHJpYnV0ZSc7XG5pbXBvcnQgaXNXaGl0ZXNwYWNlIGZyb20gJy4vaXNXaGl0ZXNwYWNlJztcbmltcG9ydCBpc0FsbFdoaXRlc3BhY2UgZnJvbSAnLi9pc0FsbFdoaXRlc3BhY2UnO1xuaW1wb3J0IGlzQWxsV2hpdGVzcGFjZU9yUmVwbGFjZW1lbnRDaGFyYWN0ZXJzIGZyb20gJy4vaXNBbGxXaGl0ZXNwYWNlT3JSZXBsYWNlbWVudENoYXJhY3RlcnMnO1xuaW1wb3J0IG1lc3NhZ2VzIGZyb20gJy4vbWVzc2FnZXMnO1xuaW1wb3J0IE1vZGVzIGZyb20gJy4vTW9kZXMnO1xuaW1wb3J0IFN0YWNrSXRlbSBmcm9tICcuL1N0YWNrSXRlbSc7XG5pbXBvcnQgVG9rZW5pemVyIGZyb20gJy4vVG9rZW5pemVyJztcblxudmFyIE1hcmtlciA9IHt9O1xuXG4vKipcbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVHJlZUJ1aWxkZXIge1xuICAgIGFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cztcbiAgICBjb21wYXRNb2RlOiBzdHJpbmc7XG4gICAgY29udGV4dDtcbiAgICBkb2N1bWVudDtcbiAgICBlcnJvckhhbmRsZXI7XG4gICAgZm9ybTtcbiAgICBmcmFtZXNldE9rOiBib29sZWFuO1xuICAgIGhlYWQ7XG4gICAgaW5RdWlya3NNb2RlOiBib29sZWFuO1xuICAgIGluc2VydGlvbk1vZGU7XG4gICAgaW5zZXJ0aW9uTW9kZU5hbWU7XG4gICAgaW5zZXJ0aW9uTW9kZXM6IE1vZGVzO1xuICAgIG9wZW5FbGVtZW50cztcbiAgICBvcmlnaW5hbEluc2VydGlvbk1vZGU7XG4gICAgcGVuZGluZ1RhYmxlQ2hhcmFjdGVyc1xuICAgIHJlZGlyZWN0QXR0YWNoVG9Gb3N0ZXJQYXJlbnQ6IGJvb2xlYW47XG4gICAgdG9rZW5pemVyO1xuICAgIHNlbGZDbG9zaW5nRmxhZ0Fja25vd2xlZGdlZDogYm9vbGVhbjtcbiAgICBzY3JpcHRpbmdFbmFibGVkOiBib29sZWFuO1xuICAgIHNob3VsZFNraXBMZWFkaW5nTmV3bGluZTtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy50b2tlbml6ZXIgPSBudWxsO1xuICAgICAgICB0aGlzLmVycm9ySGFuZGxlciA9IG51bGw7XG4gICAgICAgIHRoaXMuc2NyaXB0aW5nRW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmRvY3VtZW50ID0gbnVsbDtcbiAgICAgICAgdGhpcy5oZWFkID0gbnVsbDtcbiAgICAgICAgdGhpcy5mb3JtID0gbnVsbDtcbiAgICAgICAgdGhpcy5vcGVuRWxlbWVudHMgPSBuZXcgRWxlbWVudFN0YWNrKCk7XG4gICAgICAgIHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzID0gW107XG4gICAgICAgIHRoaXMuaW5zZXJ0aW9uTW9kZSA9IG51bGw7XG4gICAgICAgIHRoaXMuaW5zZXJ0aW9uTW9kZU5hbWUgPSBcIlwiO1xuICAgICAgICB0aGlzLm9yaWdpbmFsSW5zZXJ0aW9uTW9kZSA9IFwiXCI7XG4gICAgICAgIHRoaXMuaW5RdWlya3NNb2RlID0gZmFsc2U7IC8vIFRPRE8gcXVpcmtzIG1vZGVcbiAgICAgICAgdGhpcy5jb21wYXRNb2RlID0gXCJubyBxdWlya3NcIjtcbiAgICAgICAgdGhpcy5mcmFtZXNldE9rID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5yZWRpcmVjdEF0dGFjaFRvRm9zdGVyUGFyZW50ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuc2VsZkNsb3NpbmdGbGFnQWNrbm93bGVkZ2VkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuY29udGV4dCA9IFwiXCI7XG4gICAgICAgIHRoaXMucGVuZGluZ1RhYmxlQ2hhcmFjdGVycyA9IFtdO1xuICAgICAgICB0aGlzLnNob3VsZFNraXBMZWFkaW5nTmV3bGluZSA9IGZhbHNlO1xuXG4gICAgICAgIHZhciB0cmVlID0gdGhpcztcbiAgICAgICAgdmFyIG1vZGVzOiBNb2RlcyA9IHRoaXMuaW5zZXJ0aW9uTW9kZXMgPSA8TW9kZXM+e307XG4gICAgICAgIG1vZGVzLmJhc2UgPSB7XG4gICAgICAgICAgICBlbmRfdGFnX2hhbmRsZXJzOiB7IFwiLWRlZmF1bHRcIjogJ2VuZFRhZ090aGVyJyB9LFxuICAgICAgICAgICAgc3RhcnRfdGFnX2hhbmRsZXJzOiB7IFwiLWRlZmF1bHRcIjogJ3N0YXJ0VGFnT3RoZXInIH0sXG4gICAgICAgICAgICBwcm9jZXNzRU9GOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0cmVlLmdlbmVyYXRlSW1wbGllZEVuZFRhZ3MoKTtcbiAgICAgICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2V4cGVjdGVkLWNsb3NpbmctdGFnLWJ1dC1nb3QtZW9mJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0cmVlLm9wZW5FbGVtZW50cy5sZW5ndGggPT0gMiAmJlxuICAgICAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5pdGVtKDEpLmxvY2FsTmFtZSAhPSAnYm9keScpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBoYXBwZW5zIGZvciBmcmFtZXNldHMgb3Igc29tZXRoaW5nP1xuICAgICAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2V4cGVjdGVkLWNsb3NpbmctdGFnLWJ1dC1nb3QtZW9mJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0cmVlLmNvbnRleHQgJiYgdHJlZS5vcGVuRWxlbWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBYWFggVGhpcyBpcyBub3Qgd2hhdCB0aGUgc3BlY2lmaWNhdGlvbiBzYXlzLiBOb3Qgc3VyZSB3aGF0IHRvIGRvIGhlcmUuXG4gICAgICAgICAgICAgICAgICAgIC8vdHJlZS5wYXJzZUVycm9yKCdlb2YtaW4taW5uZXJodG1sJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByb2Nlc3NDb21tZW50OiBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICAgICAgLy8gRm9yIG1vc3QgcGhhc2VzIHRoZSBmb2xsb3dpbmcgaXMgZm9yY2VRdWlya3MuIFdoZXJlIGl0J3Mgbm90IGl0IHdpbGwgYmVcbiAgICAgICAgICAgICAgICAvLyBvdmVycmlkZGVuLlxuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0Q29tbWVudChkYXRhLCB0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5ub2RlKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwcm9jZXNzRG9jdHlwZTogZnVuY3Rpb24obmFtZSwgcHVibGljSWQsIHN5c3RlbUlkLCBmb3JjZVF1aXJrcykge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1kb2N0eXBlJyk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcHJvY2Vzc1N0YXJ0VGFnOiBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzW3RoaXMuc3RhcnRfdGFnX2hhbmRsZXJzW25hbWVdXSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzW3RoaXMuc3RhcnRfdGFnX2hhbmRsZXJzW25hbWVdXShuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzW3RoaXMuc3RhcnRfdGFnX2hhbmRsZXJzW1wiLWRlZmF1bHRcIl1dKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXNbdGhpcy5zdGFydF90YWdfaGFuZGxlcnNbXCItZGVmYXVsdFwiXV0obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IChuZXcgRXJyb3IoXCJObyBoYW5kbGVyIGZvdW5kIGZvciBcIiArIG5hbWUpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcHJvY2Vzc0VuZFRhZzogZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzW3RoaXMuZW5kX3RhZ19oYW5kbGVyc1tuYW1lXV0pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpc1t0aGlzLmVuZF90YWdfaGFuZGxlcnNbbmFtZV1dKG5hbWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpc1t0aGlzLmVuZF90YWdfaGFuZGxlcnNbXCItZGVmYXVsdFwiXV0pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpc1t0aGlzLmVuZF90YWdfaGFuZGxlcnNbXCItZGVmYXVsdFwiXV0obmFtZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgKG5ldyBFcnJvcihcIk5vIGhhbmRsZXIgZm91bmQgZm9yIFwiICsgbmFtZSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzdGFydFRhZ0h0bWw6IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdIdG1sKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluaXRpYWwgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmluaXRpYWwucHJvY2Vzc0VPRiA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwiZXhwZWN0ZWQtZG9jdHlwZS1idXQtZ290LWVvZlwiKTtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VPRigpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluaXRpYWwucHJvY2Vzc0NvbW1lbnQgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICB0cmVlLmluc2VydENvbW1lbnQoZGF0YSwgdHJlZS5kb2N1bWVudCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5pdGlhbC5wcm9jZXNzRG9jdHlwZSA9IGZ1bmN0aW9uKG5hbWUsIHB1YmxpY0lkLCBzeXN0ZW1JZCwgZm9yY2VRdWlya3MpIHtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0RG9jdHlwZShuYW1lIHx8ICcnLCBwdWJsaWNJZCB8fCAnJywgc3lzdGVtSWQgfHwgJycpO1xuXG4gICAgICAgICAgICBpZiAoZm9yY2VRdWlya3MgfHwgbmFtZSAhPSAnaHRtbCcgfHwgKHB1YmxpY0lkICE9IG51bGwgJiYgKFtcbiAgICAgICAgICAgICAgICBcIisvL3NpbG1hcmlsLy9kdGQgaHRtbCBwcm8gdjByMTEgMTk5NzAxMDEvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vYWR2YXNvZnQgbHRkLy9kdGQgaHRtbCAzLjAgYXN3ZWRpdCArIGV4dGVuc2lvbnMvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vYXMvL2R0ZCBodG1sIDMuMCBhc3dlZGl0ICsgZXh0ZW5zaW9ucy8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCAyLjAgbGV2ZWwgMS8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCAyLjAgbGV2ZWwgMi8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCAyLjAgc3RyaWN0IGxldmVsIDEvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgMi4wIHN0cmljdCBsZXZlbCAyLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIDIuMCBzdHJpY3QvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgMi4wLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIDIuMWUvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgMy4wLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIDMuMC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCAzLjIgZmluYWwvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgMy4yLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIDMvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgbGV2ZWwgMC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBsZXZlbCAwLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIGxldmVsIDEvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgbGV2ZWwgMS8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBsZXZlbCAyLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIGxldmVsIDIvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgbGV2ZWwgMy8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBsZXZlbCAzLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIHN0cmljdCBsZXZlbCAwLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIHN0cmljdCBsZXZlbCAwLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIHN0cmljdCBsZXZlbCAxLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIHN0cmljdCBsZXZlbCAxLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIHN0cmljdCBsZXZlbCAyLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIHN0cmljdCBsZXZlbCAyLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIHN0cmljdCBsZXZlbCAzLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIHN0cmljdCBsZXZlbCAzLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIHN0cmljdC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBzdHJpY3QvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgc3RyaWN0Ly9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL21ldHJpdXMvL2R0ZCBtZXRyaXVzIHByZXNlbnRhdGlvbmFsLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL21pY3Jvc29mdC8vZHRkIGludGVybmV0IGV4cGxvcmVyIDIuMCBodG1sIHN0cmljdC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9taWNyb3NvZnQvL2R0ZCBpbnRlcm5ldCBleHBsb3JlciAyLjAgaHRtbC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9taWNyb3NvZnQvL2R0ZCBpbnRlcm5ldCBleHBsb3JlciAyLjAgdGFibGVzLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL21pY3Jvc29mdC8vZHRkIGludGVybmV0IGV4cGxvcmVyIDMuMCBodG1sIHN0cmljdC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9taWNyb3NvZnQvL2R0ZCBpbnRlcm5ldCBleHBsb3JlciAzLjAgaHRtbC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9taWNyb3NvZnQvL2R0ZCBpbnRlcm5ldCBleHBsb3JlciAzLjAgdGFibGVzLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL25ldHNjYXBlIGNvbW0uIGNvcnAuLy9kdGQgaHRtbC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9uZXRzY2FwZSBjb21tLiBjb3JwLi8vZHRkIHN0cmljdCBodG1sLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL28ncmVpbGx5IGFuZCBhc3NvY2lhdGVzLy9kdGQgaHRtbCAyLjAvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vbydyZWlsbHkgYW5kIGFzc29jaWF0ZXMvL2R0ZCBodG1sIGV4dGVuZGVkIDEuMC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9zcHlnbGFzcy8vZHRkIGh0bWwgMi4wIGV4dGVuZGVkLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL3NxLy9kdGQgaHRtbCAyLjAgaG90bWV0YWwgKyBleHRlbnNpb25zLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL3N1biBtaWNyb3N5c3RlbXMgY29ycC4vL2R0ZCBob3RqYXZhIGh0bWwvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vc3VuIG1pY3Jvc3lzdGVtcyBjb3JwLi8vZHRkIGhvdGphdmEgc3RyaWN0IGh0bWwvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vdzNjLy9kdGQgaHRtbCAzIDE5OTUtMDMtMjQvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vdzNjLy9kdGQgaHRtbCAzLjIgZHJhZnQvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vdzNjLy9kdGQgaHRtbCAzLjIgZmluYWwvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vdzNjLy9kdGQgaHRtbCAzLjIvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vdzNjLy9kdGQgaHRtbCAzLjJzIGRyYWZ0Ly9cIixcbiAgICAgICAgICAgICAgICBcIi0vL3czYy8vZHRkIGh0bWwgNC4wIGZyYW1lc2V0Ly9cIixcbiAgICAgICAgICAgICAgICBcIi0vL3czYy8vZHRkIGh0bWwgNC4wIHRyYW5zaXRpb25hbC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy93M2MvL2R0ZCBodG1sIGV4cGVyaW1lbnRhbCAxOTk2MDcxMi8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy93M2MvL2R0ZCBodG1sIGV4cGVyaW1lbnRhbCA5NzA0MjEvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vdzNjLy9kdGQgdzMgaHRtbC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy93M28vL2R0ZCB3MyBodG1sIDMuMC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy93ZWJ0ZWNocy8vZHRkIG1vemlsbGEgaHRtbCAyLjAvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vd2VidGVjaHMvL2R0ZCBtb3ppbGxhIGh0bWwvL1wiLFxuICAgICAgICAgICAgICAgIFwiaHRtbFwiXG4gICAgICAgICAgICBdLnNvbWUocHVibGljSWRTdGFydHNXaXRoKVxuICAgICAgICAgICAgICAgIHx8IFtcbiAgICAgICAgICAgICAgICAgICAgXCItLy93M28vL2R0ZCB3MyBodG1sIHN0cmljdCAzLjAvL2VuLy9cIixcbiAgICAgICAgICAgICAgICAgICAgXCItL3czYy9kdGQgaHRtbCA0LjAgdHJhbnNpdGlvbmFsL2VuXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaHRtbFwiXG4gICAgICAgICAgICAgICAgXS5pbmRleE9mKHB1YmxpY0lkLnRvTG93ZXJDYXNlKCkpID4gLTFcbiAgICAgICAgICAgICAgICB8fCAoc3lzdGVtSWQgPT0gbnVsbCAmJiBbXG4gICAgICAgICAgICAgICAgICAgIFwiLS8vdzNjLy9kdGQgaHRtbCA0LjAxIHRyYW5zaXRpb25hbC8vXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiLS8vdzNjLy9kdGQgaHRtbCA0LjAxIGZyYW1lc2V0Ly9cIlxuICAgICAgICAgICAgICAgIF0uc29tZShwdWJsaWNJZFN0YXJ0c1dpdGgpKSlcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICB8fCAoc3lzdGVtSWQgIT0gbnVsbCAmJiAoc3lzdGVtSWQudG9Mb3dlckNhc2UoKSA9PSBcImh0dHA6Ly93d3cuaWJtLmNvbS9kYXRhL2R0ZC92MTEvaWJteGh0bWwxLXRyYW5zaXRpb25hbC5kdGRcIikpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICB0cmVlLmNvbXBhdE1vZGUgPSBcInF1aXJrc1wiO1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInF1aXJreS1kb2N0eXBlXCIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwdWJsaWNJZCAhPSBudWxsICYmIChbXG4gICAgICAgICAgICAgICAgXCItLy93M2MvL2R0ZCB4aHRtbCAxLjAgdHJhbnNpdGlvbmFsLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL3czYy8vZHRkIHhodG1sIDEuMCBmcmFtZXNldC8vXCJcbiAgICAgICAgICAgIF0uc29tZShwdWJsaWNJZFN0YXJ0c1dpdGgpXG4gICAgICAgICAgICAgICAgfHwgKHN5c3RlbUlkICE9IG51bGwgJiYgW1xuICAgICAgICAgICAgICAgICAgICBcIi0vL3czYy8vZHRkIGh0bWwgNC4wMSB0cmFuc2l0aW9uYWwvL1wiLFxuICAgICAgICAgICAgICAgICAgICBcIi0vL3czYy8vZHRkIGh0bWwgNC4wMSBmcmFtZXNldC8vXCJcbiAgICAgICAgICAgICAgICBdLmluZGV4T2YocHVibGljSWQudG9Mb3dlckNhc2UoKSkgPiAtMSkpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICB0cmVlLmNvbXBhdE1vZGUgPSBcImxpbWl0ZWQgcXVpcmtzXCI7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwiYWxtb3N0LXN0YW5kYXJkcy1kb2N0eXBlXCIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoKHB1YmxpY0lkID09IFwiLS8vVzNDLy9EVEQgSFRNTCA0LjAvL0VOXCIgJiYgKHN5c3RlbUlkID09IG51bGwgfHwgc3lzdGVtSWQgPT0gXCJodHRwOi8vd3d3LnczLm9yZy9UUi9SRUMtaHRtbDQwL3N0cmljdC5kdGRcIikpXG4gICAgICAgICAgICAgICAgICAgIHx8IChwdWJsaWNJZCA9PSBcIi0vL1czQy8vRFREIEhUTUwgNC4wMS8vRU5cIiAmJiAoc3lzdGVtSWQgPT0gbnVsbCB8fCBzeXN0ZW1JZCA9PSBcImh0dHA6Ly93d3cudzMub3JnL1RSL2h0bWw0L3N0cmljdC5kdGRcIikpXG4gICAgICAgICAgICAgICAgICAgIHx8IChwdWJsaWNJZCA9PSBcIi0vL1czQy8vRFREIFhIVE1MIDEuMCBTdHJpY3QvL0VOXCIgJiYgKHN5c3RlbUlkID09IFwiaHR0cDovL3d3dy53My5vcmcvVFIveGh0bWwxL0RURC94aHRtbDEtc3RyaWN0LmR0ZFwiKSlcbiAgICAgICAgICAgICAgICAgICAgfHwgKHB1YmxpY0lkID09IFwiLS8vVzNDLy9EVEQgWEhUTUwgMS4xLy9FTlwiICYmIChzeXN0ZW1JZCA9PSBcImh0dHA6Ly93d3cudzMub3JnL1RSL3hodG1sMTEvRFREL3hodG1sMTEuZHRkXCIpKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgICAvLyB3YXJuaW5nXG4gICAgICAgICAgICAgICAgICAgIC8vdHJlZS53YXJuKFwib2Jzb2xldGUtZG9jdHlwZVwiKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCEoKHN5c3RlbUlkID09IG51bGwgfHwgc3lzdGVtSWQgPT0gXCJhYm91dDpsZWdhY3ktY29tcGF0XCIpICYmIHB1YmxpY0lkID09IG51bGwpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVua25vd24tZG9jdHlwZVwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2JlZm9yZUhUTUwnKTtcbiAgICAgICAgICAgIGZ1bmN0aW9uIHB1YmxpY0lkU3RhcnRzV2l0aChzdHJpbmcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHVibGljSWQudG9Mb3dlckNhc2UoKS5pbmRleE9mKHN0cmluZykgPT09IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5pdGlhbC5wcm9jZXNzQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKGJ1ZmZlcikge1xuICAgICAgICAgICAgYnVmZmVyLnNraXBMZWFkaW5nV2hpdGVzcGFjZSgpO1xuICAgICAgICAgICAgaWYgKCFidWZmZXIubGVuZ3RoKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcignZXhwZWN0ZWQtZG9jdHlwZS1idXQtZ290LWNoYXJzJyk7XG4gICAgICAgICAgICB0aGlzLmFueXRoaW5nRWxzZSgpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NDaGFyYWN0ZXJzKGJ1ZmZlcik7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5pdGlhbC5wcm9jZXNzU3RhcnRUYWcgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdleHBlY3RlZC1kb2N0eXBlLWJ1dC1nb3Qtc3RhcnQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluaXRpYWwucHJvY2Vzc0VuZFRhZyA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcignZXhwZWN0ZWQtZG9jdHlwZS1idXQtZ290LWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB0aGlzLmFueXRoaW5nRWxzZSgpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5pdGlhbC5hbnl0aGluZ0Vsc2UgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRyZWUuY29tcGF0TW9kZSA9ICdxdWlya3MnO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdiZWZvcmVIVE1MJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYmVmb3JlSFRNTCA9IE9iamVjdC5jcmVhdGUobW9kZXMuYmFzZSk7XG5cbiAgICAgICAgbW9kZXMuYmVmb3JlSFRNTC5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdzdGFydFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhUTUwucHJvY2Vzc0VPRiA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRU9GKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYmVmb3JlSFRNTC5wcm9jZXNzQ29tbWVudCA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0Q29tbWVudChkYXRhLCB0cmVlLmRvY3VtZW50KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5iZWZvcmVIVE1MLnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gICAgICAgICAgICBidWZmZXIuc2tpcExlYWRpbmdXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICBpZiAoIWJ1ZmZlci5sZW5ndGgpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzQ2hhcmFjdGVycyhidWZmZXIpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhUTUwuc3RhcnRUYWdIdG1sID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0SHRtbEVsZW1lbnQoYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2JlZm9yZUhlYWQnKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5iZWZvcmVIVE1MLnN0YXJ0VGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhUTUwucHJvY2Vzc0VuZFRhZyA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5iZWZvcmVIVE1MLmFueXRoaW5nRWxzZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRIdG1sRWxlbWVudCgpO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdiZWZvcmVIZWFkJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJBZnRlckJvZHkgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQWZ0ZXJCb2R5LnN0YXJ0X3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGh0bWw6ICdzdGFydFRhZ0h0bWwnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJBZnRlckJvZHkucHJvY2Vzc0NvbW1lbnQgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICB0cmVlLmluc2VydENvbW1lbnQoZGF0YSwgdHJlZS5kb2N1bWVudCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJBZnRlckJvZHkucHJvY2Vzc0RvY3R5cGUgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICBtb2Rlcy5pbkJvZHkucHJvY2Vzc0RvY3R5cGUoZGF0YSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJBZnRlckJvZHkuc3RhcnRUYWdIdG1sID0gZnVuY3Rpb24oZGF0YSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnSHRtbChkYXRhLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckFmdGVyQm9keS5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1zdGFydC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luQm9keScpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJBZnRlckJvZHkuZW5kVGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5Cb2R5Jyk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckFmdGVyQm9keS5wcm9jZXNzQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIGlmICghaXNBbGxXaGl0ZXNwYWNlKGRhdGEuY2hhcmFjdGVycykpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtY2hhci1hZnRlci1ib2R5Jyk7XG4gICAgICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpbkJvZHknKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NDaGFyYWN0ZXJzKGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnByb2Nlc3NDaGFyYWN0ZXJzKGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQm9keSA9IE9iamVjdC5jcmVhdGUobW9kZXMuYmFzZSk7XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJCb2R5LmVuZF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnZW5kVGFnSHRtbCcsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnZW5kVGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJCb2R5LnByb2Nlc3NDb21tZW50ID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgLy8gVGhpcyBpcyBuZWVkZWQgYmVjYXVzZSBkYXRhIGlzIHRvIGJlIGFwcGVuZGVkIHRvIHRoZSBodG1sIGVsZW1lbnQgaGVyZVxuICAgICAgICAgICAgLy8gYW5kIG5vdCB0byB3aGF0ZXZlciBpcyBjdXJyZW50bHkgb3Blbi5cbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0Q29tbWVudChkYXRhLCB0cmVlLm9wZW5FbGVtZW50cy5yb290Tm9kZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJCb2R5LnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgaWYgKCFpc0FsbFdoaXRlc3BhY2UoZGF0YS5jaGFyYWN0ZXJzKSkge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1jaGFyLWFmdGVyLWJvZHknKTtcbiAgICAgICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luQm9keScpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0NoYXJhY3RlcnMoZGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtb2Rlcy5pbkJvZHkucHJvY2Vzc0NoYXJhY3RlcnMoZGF0YSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJCb2R5LnByb2Nlc3NTdGFydFRhZyA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtc3RhcnQtdGFnLWFmdGVyLWJvZHknLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luQm9keScpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJCb2R5LmVuZFRhZ0h0bWwgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5jb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdlbmQtaHRtbC1pbi1pbm5lcmh0bWwnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gWFhYIFRoaXMgbWF5IG5lZWQgdG8gYmUgZG9uZSwgbm90IHN1cmVcbiAgICAgICAgICAgICAgICAvLyBEb24ndCBzZXQgbGFzdF9waGFzZSB0byB0aGUgY3VycmVudCBwaGFzZSBidXQgdG8gdGhlIGluQm9keSBwaGFzZVxuICAgICAgICAgICAgICAgIC8vIGluc3RlYWQuIE5vIG5lZWQgZm9yIGV4dHJhIHBhcnNlRXJyb3JzIGlmIHRoZXJlJ3Mgc29tZXRoaW5nIGFmdGVyXG4gICAgICAgICAgICAgICAgLy8gPC9odG1sPi5cbiAgICAgICAgICAgICAgICAvLyBUcnkgPCFkb2N0eXBlIGh0bWw+WDwvaHRtbD5YIGZvciBpbnN0YW5jZVxuICAgICAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnYWZ0ZXJBZnRlckJvZHknKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckJvZHkuZW5kVGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZy1hZnRlci1ib2R5JywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpbkJvZHknKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyRnJhbWVzZXQgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmFmdGVyRnJhbWVzZXQuc3RhcnRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgaHRtbDogJ3N0YXJ0VGFnSHRtbCcsXG4gICAgICAgICAgICBub2ZyYW1lczogJ3N0YXJ0VGFnTm9mcmFtZXMnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJGcmFtZXNldC5lbmRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgaHRtbDogJ2VuZFRhZ0h0bWwnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ2VuZFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyRnJhbWVzZXQucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBjaGFyYWN0ZXJzID0gYnVmZmVyLnRha2VSZW1haW5pbmcoKTtcbiAgICAgICAgICAgIHZhciB3aGl0ZXNwYWNlID0gXCJcIjtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2hhcmFjdGVycy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBjaCA9IGNoYXJhY3RlcnNbaV07XG4gICAgICAgICAgICAgICAgaWYgKGlzV2hpdGVzcGFjZShjaCkpXG4gICAgICAgICAgICAgICAgICAgIHdoaXRlc3BhY2UgKz0gY2g7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAod2hpdGVzcGFjZSkge1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0VGV4dCh3aGl0ZXNwYWNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh3aGl0ZXNwYWNlLmxlbmd0aCA8IGNoYXJhY3RlcnMubGVuZ3RoKVxuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcignZXhwZWN0ZWQtZW9mLWJ1dC1nb3QtY2hhcicpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyRnJhbWVzZXQuc3RhcnRUYWdOb2ZyYW1lcyA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIG1vZGVzLmluSGVhZC5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJGcmFtZXNldC5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1zdGFydC10YWctYWZ0ZXItZnJhbWVzZXRcIiwgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyRnJhbWVzZXQuZW5kVGFnSHRtbCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnYWZ0ZXJBZnRlckZyYW1lc2V0Jyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJGcmFtZXNldC5lbmRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtZW5kLXRhZy1hZnRlci1mcmFtZXNldFwiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYmVmb3JlSGVhZCA9IE9iamVjdC5jcmVhdGUobW9kZXMuYmFzZSk7XG5cbiAgICAgICAgbW9kZXMuYmVmb3JlSGVhZC5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgIGhlYWQ6ICdzdGFydFRhZ0hlYWQnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYmVmb3JlSGVhZC5lbmRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgaHRtbDogJ2VuZFRhZ0ltcGx5SGVhZCcsXG4gICAgICAgICAgICBoZWFkOiAnZW5kVGFnSW1wbHlIZWFkJyxcbiAgICAgICAgICAgIGJvZHk6ICdlbmRUYWdJbXBseUhlYWQnLFxuICAgICAgICAgICAgYnI6ICdlbmRUYWdJbXBseUhlYWQnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ2VuZFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhlYWQucHJvY2Vzc0VPRiA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5zdGFydFRhZ0hlYWQoJ2hlYWQnLCBbXSk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VPRigpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhlYWQucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5za2lwTGVhZGluZ1doaXRlc3BhY2UoKTtcbiAgICAgICAgICAgIGlmICghYnVmZmVyLmxlbmd0aClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0aGlzLnN0YXJ0VGFnSGVhZCgnaGVhZCcsIFtdKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzQ2hhcmFjdGVycyhidWZmZXIpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhlYWQuc3RhcnRUYWdIZWFkID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRIZWFkRWxlbWVudChhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5IZWFkJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYmVmb3JlSGVhZC5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRUYWdIZWFkKCdoZWFkJywgW10pO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYmVmb3JlSGVhZC5lbmRUYWdJbXBseUhlYWQgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0VGFnSGVhZCgnaGVhZCcsIFtdKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhlYWQuZW5kVGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2VuZC10YWctYWZ0ZXItaW1wbGllZC1yb290JywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZCA9IE9iamVjdC5jcmVhdGUobW9kZXMuYmFzZSk7XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkLnN0YXJ0X3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGh0bWw6ICdzdGFydFRhZ0h0bWwnLFxuICAgICAgICAgICAgaGVhZDogJ3N0YXJ0VGFnSGVhZCcsXG4gICAgICAgICAgICB0aXRsZTogJ3N0YXJ0VGFnVGl0bGUnLFxuICAgICAgICAgICAgc2NyaXB0OiAnc3RhcnRUYWdTY3JpcHQnLFxuICAgICAgICAgICAgc3R5bGU6ICdzdGFydFRhZ05vRnJhbWVzU3R5bGUnLFxuICAgICAgICAgICAgbm9zY3JpcHQ6ICdzdGFydFRhZ05vU2NyaXB0JyxcbiAgICAgICAgICAgIG5vZnJhbWVzOiAnc3RhcnRUYWdOb0ZyYW1lc1N0eWxlJyxcbiAgICAgICAgICAgIGJhc2U6ICdzdGFydFRhZ0Jhc2VCYXNlZm9udEJnc291bmRMaW5rJyxcbiAgICAgICAgICAgIGJhc2Vmb250OiAnc3RhcnRUYWdCYXNlQmFzZWZvbnRCZ3NvdW5kTGluaycsXG4gICAgICAgICAgICBiZ3NvdW5kOiAnc3RhcnRUYWdCYXNlQmFzZWZvbnRCZ3NvdW5kTGluaycsXG4gICAgICAgICAgICBsaW5rOiAnc3RhcnRUYWdCYXNlQmFzZWZvbnRCZ3NvdW5kTGluaycsXG4gICAgICAgICAgICBtZXRhOiAnc3RhcnRUYWdNZXRhJyxcbiAgICAgICAgICAgIFwiLWRlZmF1bHRcIjogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkLmVuZF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBoZWFkOiAnZW5kVGFnSGVhZCcsXG4gICAgICAgICAgICBodG1sOiAnZW5kVGFnSHRtbEJvZHlCcicsXG4gICAgICAgICAgICBib2R5OiAnZW5kVGFnSHRtbEJvZHlCcicsXG4gICAgICAgICAgICBicjogJ2VuZFRhZ0h0bWxCb2R5QnInLFxuICAgICAgICAgICAgXCItZGVmYXVsdFwiOiAnZW5kVGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkLnByb2Nlc3NFT0YgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciBuYW1lID0gdHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lO1xuICAgICAgICAgICAgaWYgKFsndGl0bGUnLCAnc3R5bGUnLCAnc2NyaXB0J10uaW5kZXhPZihuYW1lKSAhPSAtMSkge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcImV4cGVjdGVkLW5hbWVkLWNsb3NpbmctdGFnLWJ1dC1nb3QtZW9mXCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgICAgICB0cmVlLnBvcEVsZW1lbnQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcblxuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFT0YoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWQucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBsZWFkaW5nV2hpdGVzcGFjZSA9IGJ1ZmZlci50YWtlTGVhZGluZ1doaXRlc3BhY2UoKTtcbiAgICAgICAgICAgIGlmIChsZWFkaW5nV2hpdGVzcGFjZSlcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydFRleHQobGVhZGluZ1doaXRlc3BhY2UpO1xuICAgICAgICAgICAgaWYgKCFidWZmZXIubGVuZ3RoKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0NoYXJhY3RlcnMoYnVmZmVyKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWQuc3RhcnRUYWdIdG1sID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWQuc3RhcnRUYWdIZWFkID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd0d28taGVhZHMtYXJlLW5vdC1iZXR0ZXItdGhhbi1vbmUnKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWQuc3RhcnRUYWdUaXRsZSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucHJvY2Vzc0dlbmVyaWNSQ0RBVEFTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWQuc3RhcnRUYWdOb1NjcmlwdCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLnNjcmlwdGluZ0VuYWJsZWQpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRyZWUucHJvY2Vzc0dlbmVyaWNSYXdUZXh0U3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luSGVhZE5vc2NyaXB0Jyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkLnN0YXJ0VGFnTm9GcmFtZXNTdHlsZSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIC8vIFhYWCBOZWVkIHRvIGRlY2lkZSB3aGV0aGVyIHRvIGltcGxlbWVudCB0aGUgc2NyaXB0aW5nIGRpc2FibGVkIGNhc2VcbiAgICAgICAgICAgIHRyZWUucHJvY2Vzc0dlbmVyaWNSYXdUZXh0U3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkLnN0YXJ0VGFnU2NyaXB0ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS50b2tlbml6ZXIuc2V0U3RhdGUoVG9rZW5pemVyLlNDUklQVF9EQVRBKTtcbiAgICAgICAgICAgIHRyZWUub3JpZ2luYWxJbnNlcnRpb25Nb2RlID0gdHJlZS5pbnNlcnRpb25Nb2RlTmFtZTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgndGV4dCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZC5zdGFydFRhZ0Jhc2VCYXNlZm9udEJnc291bmRMaW5rID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRTZWxmQ2xvc2luZ0VsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkLnN0YXJ0VGFnTWV0YSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0U2VsZkNsb3NpbmdFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgLy8gQHRvZG8gcHJvY2VzcyBjaGFyc2V0IGF0dHJpYnV0ZXNcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWQuc3RhcnRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICB0aGlzLmFueXRoaW5nRWxzZSgpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkLmVuZFRhZ0hlYWQgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaXRlbSh0cmVlLm9wZW5FbGVtZW50cy5sZW5ndGggLSAxKS5sb2NhbE5hbWUgPT0gJ2hlYWQnKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiAnaGVhZCcgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2FmdGVySGVhZCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZC5lbmRUYWdIdG1sQm9keUJyID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZC5lbmRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZC5hbnl0aGluZ0Vsc2UgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuZW5kVGFnSGVhZCgnaGVhZCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVySGVhZCA9IE9iamVjdC5jcmVhdGUobW9kZXMuYmFzZSk7XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJIZWFkLnN0YXJ0X3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGh0bWw6ICdzdGFydFRhZ0h0bWwnLFxuICAgICAgICAgICAgaGVhZDogJ3N0YXJ0VGFnSGVhZCcsXG4gICAgICAgICAgICBib2R5OiAnc3RhcnRUYWdCb2R5JyxcbiAgICAgICAgICAgIGZyYW1lc2V0OiAnc3RhcnRUYWdGcmFtZXNldCcsXG4gICAgICAgICAgICBiYXNlOiAnc3RhcnRUYWdGcm9tSGVhZCcsXG4gICAgICAgICAgICBsaW5rOiAnc3RhcnRUYWdGcm9tSGVhZCcsXG4gICAgICAgICAgICBtZXRhOiAnc3RhcnRUYWdGcm9tSGVhZCcsXG4gICAgICAgICAgICBzY3JpcHQ6ICdzdGFydFRhZ0Zyb21IZWFkJyxcbiAgICAgICAgICAgIC8vIFhYWCBub2ZyYW1lczogJ3N0YXJ0VGFnRnJvbUhlYWQnID9cbiAgICAgICAgICAgIHN0eWxlOiAnc3RhcnRUYWdGcm9tSGVhZCcsXG4gICAgICAgICAgICB0aXRsZTogJ3N0YXJ0VGFnRnJvbUhlYWQnLFxuICAgICAgICAgICAgXCItZGVmYXVsdFwiOiAnc3RhcnRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckhlYWQuZW5kX3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGJvZHk6ICdlbmRUYWdCb2R5SHRtbEJyJyxcbiAgICAgICAgICAgIGh0bWw6ICdlbmRUYWdCb2R5SHRtbEJyJyxcbiAgICAgICAgICAgIGJyOiAnZW5kVGFnQm9keUh0bWxCcicsXG4gICAgICAgICAgICBcIi1kZWZhdWx0XCI6ICdlbmRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckhlYWQucHJvY2Vzc0VPRiA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRU9GKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJIZWFkLnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgbGVhZGluZ1doaXRlc3BhY2UgPSBidWZmZXIudGFrZUxlYWRpbmdXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICBpZiAobGVhZGluZ1doaXRlc3BhY2UpXG4gICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRUZXh0KGxlYWRpbmdXaGl0ZXNwYWNlKTtcbiAgICAgICAgICAgIGlmICghYnVmZmVyLmxlbmd0aClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0aGlzLmFueXRoaW5nRWxzZSgpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NDaGFyYWN0ZXJzKGJ1ZmZlcik7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJIZWFkLnN0YXJ0VGFnSHRtbCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIG1vZGVzLmluQm9keS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJIZWFkLnN0YXJ0VGFnQm9keSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUuZnJhbWVzZXRPayA9IGZhbHNlO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRCb2R5RWxlbWVudChhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5Cb2R5Jyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJIZWFkLnN0YXJ0VGFnRnJhbWVzZXQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luRnJhbWVzZXQnKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckhlYWQuc3RhcnRUYWdGcm9tSGVhZCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLXN0YXJ0LXRhZy1vdXQtb2YtbXktaGVhZFwiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICAvLyBGSVhNRSBoZWFkIHBvaW50ZXJcbiAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnB1c2godHJlZS5oZWFkKTtcbiAgICAgICAgICAgIG1vZGVzLmluSGVhZC5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucmVtb3ZlKHRyZWUuaGVhZCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJIZWFkLnN0YXJ0VGFnSGVhZCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtc3RhcnQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVySGVhZC5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckhlYWQuZW5kVGFnQm9keUh0bWxCciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckhlYWQuZW5kVGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckhlYWQuYW55dGhpbmdFbHNlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0cmVlLmluc2VydEJvZHlFbGVtZW50KFtdKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5Cb2R5Jyk7XG4gICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5ID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgaHRtbDogJ3N0YXJ0VGFnSHRtbCcsXG4gICAgICAgICAgICBoZWFkOiAnc3RhcnRUYWdNaXNwbGFjZWQnLFxuICAgICAgICAgICAgYmFzZTogJ3N0YXJ0VGFnUHJvY2Vzc0luSGVhZCcsXG4gICAgICAgICAgICBiYXNlZm9udDogJ3N0YXJ0VGFnUHJvY2Vzc0luSGVhZCcsXG4gICAgICAgICAgICBiZ3NvdW5kOiAnc3RhcnRUYWdQcm9jZXNzSW5IZWFkJyxcbiAgICAgICAgICAgIGxpbms6ICdzdGFydFRhZ1Byb2Nlc3NJbkhlYWQnLFxuICAgICAgICAgICAgbWV0YTogJ3N0YXJ0VGFnUHJvY2Vzc0luSGVhZCcsXG4gICAgICAgICAgICBub2ZyYW1lczogJ3N0YXJ0VGFnUHJvY2Vzc0luSGVhZCcsXG4gICAgICAgICAgICBzY3JpcHQ6ICdzdGFydFRhZ1Byb2Nlc3NJbkhlYWQnLFxuICAgICAgICAgICAgc3R5bGU6ICdzdGFydFRhZ1Byb2Nlc3NJbkhlYWQnLFxuICAgICAgICAgICAgdGl0bGU6ICdzdGFydFRhZ1Byb2Nlc3NJbkhlYWQnLFxuICAgICAgICAgICAgYm9keTogJ3N0YXJ0VGFnQm9keScsXG4gICAgICAgICAgICBmb3JtOiAnc3RhcnRUYWdGb3JtJyxcbiAgICAgICAgICAgIHBsYWludGV4dDogJ3N0YXJ0VGFnUGxhaW50ZXh0JyxcbiAgICAgICAgICAgIGE6ICdzdGFydFRhZ0EnLFxuICAgICAgICAgICAgYnV0dG9uOiAnc3RhcnRUYWdCdXR0b24nLFxuICAgICAgICAgICAgeG1wOiAnc3RhcnRUYWdYbXAnLFxuICAgICAgICAgICAgdGFibGU6ICdzdGFydFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIGhyOiAnc3RhcnRUYWdIcicsXG4gICAgICAgICAgICBpbWFnZTogJ3N0YXJ0VGFnSW1hZ2UnLFxuICAgICAgICAgICAgaW5wdXQ6ICdzdGFydFRhZ0lucHV0JyxcbiAgICAgICAgICAgIHRleHRhcmVhOiAnc3RhcnRUYWdUZXh0YXJlYScsXG4gICAgICAgICAgICBzZWxlY3Q6ICdzdGFydFRhZ1NlbGVjdCcsXG4gICAgICAgICAgICBpc2luZGV4OiAnc3RhcnRUYWdJc2luZGV4JyxcbiAgICAgICAgICAgIGFwcGxldDogJ3N0YXJ0VGFnQXBwbGV0TWFycXVlZU9iamVjdCcsXG4gICAgICAgICAgICBtYXJxdWVlOiAnc3RhcnRUYWdBcHBsZXRNYXJxdWVlT2JqZWN0JyxcbiAgICAgICAgICAgIG9iamVjdDogJ3N0YXJ0VGFnQXBwbGV0TWFycXVlZU9iamVjdCcsXG4gICAgICAgICAgICBsaTogJ3N0YXJ0VGFnTGlzdEl0ZW0nLFxuICAgICAgICAgICAgZGQ6ICdzdGFydFRhZ0xpc3RJdGVtJyxcbiAgICAgICAgICAgIGR0OiAnc3RhcnRUYWdMaXN0SXRlbScsXG4gICAgICAgICAgICBhZGRyZXNzOiAnc3RhcnRUYWdDbG9zZVAnLFxuICAgICAgICAgICAgYXJ0aWNsZTogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIGFzaWRlOiAnc3RhcnRUYWdDbG9zZVAnLFxuICAgICAgICAgICAgYmxvY2txdW90ZTogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIGNlbnRlcjogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIGRldGFpbHM6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBkaXI6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBkaXY6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBkbDogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIGZpZWxkc2V0OiAnc3RhcnRUYWdDbG9zZVAnLFxuICAgICAgICAgICAgZmlnY2FwdGlvbjogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIGZpZ3VyZTogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIGZvb3RlcjogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIGhlYWRlcjogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIGhncm91cDogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIG1haW46ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBtZW51OiAnc3RhcnRUYWdDbG9zZVAnLFxuICAgICAgICAgICAgbmF2OiAnc3RhcnRUYWdDbG9zZVAnLFxuICAgICAgICAgICAgb2w6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBwOiAnc3RhcnRUYWdDbG9zZVAnLFxuICAgICAgICAgICAgc2VjdGlvbjogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIHN1bW1hcnk6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICB1bDogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIGxpc3Rpbmc6ICdzdGFydFRhZ1ByZUxpc3RpbmcnLFxuICAgICAgICAgICAgcHJlOiAnc3RhcnRUYWdQcmVMaXN0aW5nJyxcbiAgICAgICAgICAgIGI6ICdzdGFydFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgYmlnOiAnc3RhcnRUYWdGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIGNvZGU6ICdzdGFydFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgZW06ICdzdGFydFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgZm9udDogJ3N0YXJ0VGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBpOiAnc3RhcnRUYWdGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIHM6ICdzdGFydFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgc21hbGw6ICdzdGFydFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgc3RyaWtlOiAnc3RhcnRUYWdGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIHN0cm9uZzogJ3N0YXJ0VGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICB0dDogJ3N0YXJ0VGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICB1OiAnc3RhcnRUYWdGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIG5vYnI6ICdzdGFydFRhZ05vYnInLFxuICAgICAgICAgICAgYXJlYTogJ3N0YXJ0VGFnVm9pZEZvcm1hdHRpbmcnLFxuICAgICAgICAgICAgYnI6ICdzdGFydFRhZ1ZvaWRGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIGVtYmVkOiAnc3RhcnRUYWdWb2lkRm9ybWF0dGluZycsXG4gICAgICAgICAgICBpbWc6ICdzdGFydFRhZ1ZvaWRGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIGtleWdlbjogJ3N0YXJ0VGFnVm9pZEZvcm1hdHRpbmcnLFxuICAgICAgICAgICAgd2JyOiAnc3RhcnRUYWdWb2lkRm9ybWF0dGluZycsXG4gICAgICAgICAgICBwYXJhbTogJ3N0YXJ0VGFnUGFyYW1Tb3VyY2VUcmFjaycsXG4gICAgICAgICAgICBzb3VyY2U6ICdzdGFydFRhZ1BhcmFtU291cmNlVHJhY2snLFxuICAgICAgICAgICAgdHJhY2s6ICdzdGFydFRhZ1BhcmFtU291cmNlVHJhY2snLFxuICAgICAgICAgICAgaWZyYW1lOiAnc3RhcnRUYWdJRnJhbWUnLFxuICAgICAgICAgICAgbm9lbWJlZDogJ3N0YXJ0VGFnUmF3VGV4dCcsXG4gICAgICAgICAgICBub3NjcmlwdDogJ3N0YXJ0VGFnUmF3VGV4dCcsXG4gICAgICAgICAgICBoMTogJ3N0YXJ0VGFnSGVhZGluZycsXG4gICAgICAgICAgICBoMjogJ3N0YXJ0VGFnSGVhZGluZycsXG4gICAgICAgICAgICBoMzogJ3N0YXJ0VGFnSGVhZGluZycsXG4gICAgICAgICAgICBoNDogJ3N0YXJ0VGFnSGVhZGluZycsXG4gICAgICAgICAgICBoNTogJ3N0YXJ0VGFnSGVhZGluZycsXG4gICAgICAgICAgICBoNjogJ3N0YXJ0VGFnSGVhZGluZycsXG4gICAgICAgICAgICBjYXB0aW9uOiAnc3RhcnRUYWdNaXNwbGFjZWQnLFxuICAgICAgICAgICAgY29sOiAnc3RhcnRUYWdNaXNwbGFjZWQnLFxuICAgICAgICAgICAgY29sZ3JvdXA6ICdzdGFydFRhZ01pc3BsYWNlZCcsXG4gICAgICAgICAgICBmcmFtZTogJ3N0YXJ0VGFnTWlzcGxhY2VkJyxcbiAgICAgICAgICAgIGZyYW1lc2V0OiAnc3RhcnRUYWdGcmFtZXNldCcsXG4gICAgICAgICAgICB0Ym9keTogJ3N0YXJ0VGFnTWlzcGxhY2VkJyxcbiAgICAgICAgICAgIHRkOiAnc3RhcnRUYWdNaXNwbGFjZWQnLFxuICAgICAgICAgICAgdGZvb3Q6ICdzdGFydFRhZ01pc3BsYWNlZCcsXG4gICAgICAgICAgICB0aDogJ3N0YXJ0VGFnTWlzcGxhY2VkJyxcbiAgICAgICAgICAgIHRoZWFkOiAnc3RhcnRUYWdNaXNwbGFjZWQnLFxuICAgICAgICAgICAgdHI6ICdzdGFydFRhZ01pc3BsYWNlZCcsXG4gICAgICAgICAgICBvcHRpb246ICdzdGFydFRhZ09wdGlvbk9wdGdyb3VwJyxcbiAgICAgICAgICAgIG9wdGdyb3VwOiAnc3RhcnRUYWdPcHRpb25PcHRncm91cCcsXG4gICAgICAgICAgICBtYXRoOiAnc3RhcnRUYWdNYXRoJyxcbiAgICAgICAgICAgIHN2ZzogJ3N0YXJ0VGFnU1ZHJyxcbiAgICAgICAgICAgIHJ0OiAnc3RhcnRUYWdScFJ0JyxcbiAgICAgICAgICAgIHJwOiAnc3RhcnRUYWdScFJ0JyxcbiAgICAgICAgICAgIFwiLWRlZmF1bHRcIjogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LmVuZF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBwOiAnZW5kVGFnUCcsXG4gICAgICAgICAgICBib2R5OiAnZW5kVGFnQm9keScsXG4gICAgICAgICAgICBodG1sOiAnZW5kVGFnSHRtbCcsXG4gICAgICAgICAgICBhZGRyZXNzOiAnZW5kVGFnQmxvY2snLFxuICAgICAgICAgICAgYXJ0aWNsZTogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGFzaWRlOiAnZW5kVGFnQmxvY2snLFxuICAgICAgICAgICAgYmxvY2txdW90ZTogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGJ1dHRvbjogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGNlbnRlcjogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGRldGFpbHM6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBkaXI6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBkaXY6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBkbDogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGZpZWxkc2V0OiAnZW5kVGFnQmxvY2snLFxuICAgICAgICAgICAgZmlnY2FwdGlvbjogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGZpZ3VyZTogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGZvb3RlcjogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGhlYWRlcjogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGhncm91cDogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGxpc3Rpbmc6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBtYWluOiAnZW5kVGFnQmxvY2snLFxuICAgICAgICAgICAgbWVudTogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIG5hdjogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIG9sOiAnZW5kVGFnQmxvY2snLFxuICAgICAgICAgICAgcHJlOiAnZW5kVGFnQmxvY2snLFxuICAgICAgICAgICAgc2VjdGlvbjogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIHN1bW1hcnk6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICB1bDogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGZvcm06ICdlbmRUYWdGb3JtJyxcbiAgICAgICAgICAgIGFwcGxldDogJ2VuZFRhZ0FwcGxldE1hcnF1ZWVPYmplY3QnLFxuICAgICAgICAgICAgbWFycXVlZTogJ2VuZFRhZ0FwcGxldE1hcnF1ZWVPYmplY3QnLFxuICAgICAgICAgICAgb2JqZWN0OiAnZW5kVGFnQXBwbGV0TWFycXVlZU9iamVjdCcsXG4gICAgICAgICAgICBkZDogJ2VuZFRhZ0xpc3RJdGVtJyxcbiAgICAgICAgICAgIGR0OiAnZW5kVGFnTGlzdEl0ZW0nLFxuICAgICAgICAgICAgbGk6ICdlbmRUYWdMaXN0SXRlbScsXG4gICAgICAgICAgICBoMTogJ2VuZFRhZ0hlYWRpbmcnLFxuICAgICAgICAgICAgaDI6ICdlbmRUYWdIZWFkaW5nJyxcbiAgICAgICAgICAgIGgzOiAnZW5kVGFnSGVhZGluZycsXG4gICAgICAgICAgICBoNDogJ2VuZFRhZ0hlYWRpbmcnLFxuICAgICAgICAgICAgaDU6ICdlbmRUYWdIZWFkaW5nJyxcbiAgICAgICAgICAgIGg2OiAnZW5kVGFnSGVhZGluZycsXG4gICAgICAgICAgICBhOiAnZW5kVGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBiOiAnZW5kVGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBiaWc6ICdlbmRUYWdGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIGNvZGU6ICdlbmRUYWdGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIGVtOiAnZW5kVGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBmb250OiAnZW5kVGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBpOiAnZW5kVGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBub2JyOiAnZW5kVGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBzOiAnZW5kVGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBzbWFsbDogJ2VuZFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgc3RyaWtlOiAnZW5kVGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBzdHJvbmc6ICdlbmRUYWdGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIHR0OiAnZW5kVGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICB1OiAnZW5kVGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBicjogJ2VuZFRhZ0JyJyxcbiAgICAgICAgICAgIFwiLWRlZmF1bHRcIjogJ2VuZFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5wcm9jZXNzQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKGJ1ZmZlcikge1xuICAgICAgICAgICAgaWYgKHRyZWUuc2hvdWxkU2tpcExlYWRpbmdOZXdsaW5lKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5zaG91bGRTa2lwTGVhZGluZ05ld2xpbmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBidWZmZXIuc2tpcEF0TW9zdE9uZUxlYWRpbmdOZXdsaW5lKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICB2YXIgY2hhcmFjdGVycyA9IGJ1ZmZlci50YWtlUmVtYWluaW5nKCk7XG4gICAgICAgICAgICBjaGFyYWN0ZXJzID0gY2hhcmFjdGVycy5yZXBsYWNlKC9cXHUwMDAwL2csIGZ1bmN0aW9uKG1hdGNoLCBpbmRleCkge1xuICAgICAgICAgICAgICAgIC8vIEB0b2RvIHBvc2l0aW9uXG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwiaW52YWxpZC1jb2RlcG9pbnRcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoIWNoYXJhY3RlcnMpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRUZXh0KGNoYXJhY3RlcnMpO1xuICAgICAgICAgICAgaWYgKHRyZWUuZnJhbWVzZXRPayAmJiAhaXNBbGxXaGl0ZXNwYWNlT3JSZXBsYWNlbWVudENoYXJhY3RlcnMoY2hhcmFjdGVycykpXG4gICAgICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gZmFsc2U7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnSHRtbCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcignbm9uLWh0bWwtcm9vdCcpO1xuICAgICAgICAgICAgdHJlZS5hZGRBdHRyaWJ1dGVzVG9FbGVtZW50KHRyZWUub3BlbkVsZW1lbnRzLnJvb3ROb2RlLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdQcm9jZXNzSW5IZWFkID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgbW9kZXMuaW5IZWFkLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdCb2R5ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLXN0YXJ0LXRhZycsIHsgbmFtZTogJ2JvZHknIH0pO1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmxlbmd0aCA9PSAxIHx8XG4gICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMuaXRlbSgxKS5sb2NhbE5hbWUgIT0gJ2JvZHknKSB7XG4gICAgICAgICAgICAgICAgLy8gVE9ETzogYXNzZXJ0Lm9rKHRyZWUuY29udGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0cmVlLmFkZEF0dHJpYnV0ZXNUb0VsZW1lbnQodHJlZS5vcGVuRWxlbWVudHMuYm9keUVsZW1lbnQsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ0ZyYW1lc2V0ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLXN0YXJ0LXRhZycsIHsgbmFtZTogJ2ZyYW1lc2V0JyB9KTtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5sZW5ndGggPT0gMSB8fFxuICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLml0ZW0oMSkubG9jYWxOYW1lICE9ICdib2R5Jykge1xuICAgICAgICAgICAgICAgIC8vIFRPRE86IGFzc2VydC5vayh0cmVlLmNvbnRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodHJlZS5mcmFtZXNldE9rKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5kZXRhY2hGcm9tUGFyZW50KHRyZWUub3BlbkVsZW1lbnRzLmJvZHlFbGVtZW50KTtcbiAgICAgICAgICAgICAgICB3aGlsZSAodHJlZS5vcGVuRWxlbWVudHMubGVuZ3RoID4gMSlcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wKCk7XG4gICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5GcmFtZXNldCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ0Nsb3NlUCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pbkJ1dHRvblNjb3BlKCdwJykpXG4gICAgICAgICAgICAgICAgdGhpcy5lbmRUYWdQKCdwJyk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnUHJlTGlzdGluZyA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pbkJ1dHRvblNjb3BlKCdwJykpXG4gICAgICAgICAgICAgICAgdGhpcy5lbmRUYWdQKCdwJyk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSBmYWxzZTtcbiAgICAgICAgICAgIHRyZWUuc2hvdWxkU2tpcExlYWRpbmdOZXdsaW5lID0gdHJ1ZTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdGb3JtID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgaWYgKHRyZWUuZm9ybSkge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1zdGFydC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pbkJ1dHRvblNjb3BlKCdwJykpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnUCgncCcpO1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgICAgICB0cmVlLmZvcm0gPSB0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdScFJ0ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluU2NvcGUoJ3J1YnknKSkge1xuICAgICAgICAgICAgICAgIHRyZWUuZ2VuZXJhdGVJbXBsaWVkRW5kVGFncygpO1xuICAgICAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgIT0gJ3J1YnknKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1zdGFydC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ0xpc3RJdGVtID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgLy8vIEB0b2RvOiBGaXggYWNjb3JkaW5nIHRvIGN1cnJlbnQgc3BlYy4gaHR0cDovL3d3dy53My5vcmcvVFIvaHRtbDUvdHJlZS1jb25zdHJ1Y3Rpb24uaHRtbCNwYXJzaW5nLW1haW4taW5ib2R5XG4gICAgICAgICAgICB2YXIgc3RvcE5hbWVzID0geyBsaTogWydsaSddLCBkZDogWydkZCcsICdkdCddLCBkdDogWydkZCcsICdkdCddIH07XG4gICAgICAgICAgICB2YXIgc3RvcE5hbWUgPSBzdG9wTmFtZXNbbmFtZV07XG5cbiAgICAgICAgICAgIHZhciBlbHMgPSB0cmVlLm9wZW5FbGVtZW50cztcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSBlbHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICB2YXIgbm9kZSA9IGVscy5pdGVtKGkpO1xuICAgICAgICAgICAgICAgIGlmIChzdG9wTmFtZS5pbmRleE9mKG5vZGUubG9jYWxOYW1lKSAhPSAtMSkge1xuICAgICAgICAgICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhub2RlLmxvY2FsTmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHRvZG8gaXNTY29waW5nKClcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5pc1NwZWNpYWwoKSAmJiBub2RlLmxvY2FsTmFtZSAhPT0gJ3AnICYmIG5vZGUubG9jYWxOYW1lICE9PSAnYWRkcmVzcycgJiYgbm9kZS5sb2NhbE5hbWUgIT09ICdkaXYnKVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pbkJ1dHRvblNjb3BlKCdwJykpXG4gICAgICAgICAgICAgICAgdGhpcy5lbmRUYWdQKCdwJyk7XG5cbiAgICAgICAgICAgIC8vIEFsd2F5cyBpbnNlcnQgYW4gPGxpPiBlbGVtZW50XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSBmYWxzZTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdQbGFpbnRleHQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5CdXR0b25TY29wZSgncCcpKVxuICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnUCgncCcpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS50b2tlbml6ZXIuc2V0U3RhdGUoVG9rZW5pemVyLlBMQUlOVEVYVCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnSGVhZGluZyA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pbkJ1dHRvblNjb3BlKCdwJykpXG4gICAgICAgICAgICAgICAgdGhpcy5lbmRUYWdQKCdwJyk7XG4gICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkuaXNOdW1iZXJlZEhlYWRlcigpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLXN0YXJ0LXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgICAgICB0cmVlLnBvcEVsZW1lbnQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdBID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdmFyIGFjdGl2ZUEgPSB0cmVlLmVsZW1lbnRJbkFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cygnYScpO1xuICAgICAgICAgICAgaWYgKGFjdGl2ZUEpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLXN0YXJ0LXRhZy1pbXBsaWVzLWVuZC10YWdcIiwgeyBzdGFydE5hbWU6IFwiYVwiLCBlbmROYW1lOiBcImFcIiB9KTtcbiAgICAgICAgICAgICAgICB0cmVlLmFkb3B0aW9uQWdlbmN5RW5kVGFnKCdhJyk7XG4gICAgICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmNvbnRhaW5zKGFjdGl2ZUEpKVxuICAgICAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5yZW1vdmUoYWN0aXZlQSk7XG4gICAgICAgICAgICAgICAgdHJlZS5yZW1vdmVFbGVtZW50RnJvbUFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cyhhY3RpdmVBKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyZWUucmVjb25zdHJ1Y3RBY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0Rm9ybWF0dGluZ0VsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnRm9ybWF0dGluZyA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucmVjb25zdHJ1Y3RBY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0Rm9ybWF0dGluZ0VsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnTm9iciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucmVjb25zdHJ1Y3RBY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoKTtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pblNjb3BlKCdub2JyJykpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLXN0YXJ0LXRhZy1pbXBsaWVzLWVuZC10YWdcIiwgeyBzdGFydE5hbWU6ICdub2JyJywgZW5kTmFtZTogJ25vYnInIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzc0VuZFRhZygnbm9icicpO1xuICAgICAgICAgICAgICAgIC8vIFhYWCBOZWVkIHRlc3RzIHRoYXQgdHJpZ2dlciB0aGUgZm9sbG93aW5nXG4gICAgICAgICAgICAgICAgdHJlZS5yZWNvbnN0cnVjdEFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJlZS5pbnNlcnRGb3JtYXR0aW5nRWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdCdXR0b24gPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5TY29wZSgnYnV0dG9uJykpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtc3RhcnQtdGFnLWltcGxpZXMtZW5kLXRhZycsIHsgc3RhcnROYW1lOiAnYnV0dG9uJywgZW5kTmFtZTogJ2J1dHRvbicgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy5wcm9jZXNzRW5kVGFnKCdidXR0b24nKTtcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ0FwcGxldE1hcnF1ZWVPYmplY3QgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cy5wdXNoKE1hcmtlcik7XG4gICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSBmYWxzZTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuZW5kVGFnQXBwbGV0TWFycXVlZU9iamVjdCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICghdHJlZS5vcGVuRWxlbWVudHMuaW5TY29wZShuYW1lKSkge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtZW5kLXRhZ1wiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyZWUuZ2VuZXJhdGVJbXBsaWVkRW5kVGFncygpO1xuICAgICAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgIT0gbmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2VuZC10YWctdG9vLWVhcmx5JywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3BVbnRpbFBvcHBlZChuYW1lKTtcbiAgICAgICAgICAgICAgICB0cmVlLmNsZWFyQWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnWG1wID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluQnV0dG9uU2NvcGUoJ3AnKSlcbiAgICAgICAgICAgICAgICB0aGlzLnByb2Nlc3NFbmRUYWcoJ3AnKTtcbiAgICAgICAgICAgIHRyZWUucmVjb25zdHJ1Y3RBY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoKTtcbiAgICAgICAgICAgIHRyZWUucHJvY2Vzc0dlbmVyaWNSYXdUZXh0U3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSBmYWxzZTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdUYWJsZSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLmNvbXBhdE1vZGUgIT09IFwicXVpcmtzXCIpXG4gICAgICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluQnV0dG9uU2NvcGUoJ3AnKSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wcm9jZXNzRW5kVGFnKCdwJyk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luVGFibGUnKTtcbiAgICAgICAgICAgIHRyZWUuZnJhbWVzZXRPayA9IGZhbHNlO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ1ZvaWRGb3JtYXR0aW5nID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5yZWNvbnN0cnVjdEFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cygpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRTZWxmQ2xvc2luZ0VsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSBmYWxzZTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdQYXJhbVNvdXJjZVRyYWNrID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRTZWxmQ2xvc2luZ0VsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnSHIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5CdXR0b25TY29wZSgncCcpKVxuICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnUCgncCcpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRTZWxmQ2xvc2luZ0VsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSBmYWxzZTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdJbWFnZSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIC8vIE5vLCByZWFsbHkuLi5cbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1zdGFydC10YWctdHJlYXRlZC1hcycsIHsgb3JpZ2luYWxOYW1lOiAnaW1hZ2UnLCBuZXdOYW1lOiAnaW1nJyB9KTtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc1N0YXJ0VGFnKCdpbWcnLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdJbnB1dCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHZhciBjdXJyZW50RnJhbWVzZXRPayA9IHRyZWUuZnJhbWVzZXRPaztcbiAgICAgICAgICAgIHRoaXMuc3RhcnRUYWdWb2lkRm9ybWF0dGluZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICAgICAgLy8gaW5wdXQgdHlwZT1oaWRkZW4gZG9lc24ndCBjaGFuZ2UgZnJhbWVzZXRPa1xuICAgICAgICAgICAgICAgIGlmIChhdHRyaWJ1dGVzW2tleV0ubm9kZU5hbWUgPT0gJ3R5cGUnKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhdHRyaWJ1dGVzW2tleV0ubm9kZVZhbHVlLnRvTG93ZXJDYXNlKCkgPT0gJ2hpZGRlbicpXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSBjdXJyZW50RnJhbWVzZXRPaztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ0lzaW5kZXggPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2RlcHJlY2F0ZWQtdGFnJywgeyBuYW1lOiAnaXNpbmRleCcgfSk7XG4gICAgICAgICAgICB0cmVlLnNlbGZDbG9zaW5nRmxhZ0Fja25vd2xlZGdlZCA9IHRydWU7XG4gICAgICAgICAgICBpZiAodHJlZS5mb3JtKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHZhciBmb3JtQXR0cmlidXRlcyA9IFtdO1xuICAgICAgICAgICAgdmFyIGlucHV0QXR0cmlidXRlcyA9IFtdO1xuICAgICAgICAgICAgdmFyIHByb21wdCA9IFwiVGhpcyBpcyBhIHNlYXJjaGFibGUgaW5kZXguIEVudGVyIHNlYXJjaCBrZXl3b3JkczogXCI7XG4gICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gYXR0cmlidXRlcykge1xuICAgICAgICAgICAgICAgIHN3aXRjaCAoYXR0cmlidXRlc1trZXldLm5vZGVOYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2FjdGlvbic6XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JtQXR0cmlidXRlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlTmFtZTogJ2FjdGlvbicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVZhbHVlOiBhdHRyaWJ1dGVzW2tleV0ubm9kZVZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdwcm9tcHQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvbXB0ID0gYXR0cmlidXRlc1trZXldLm5vZGVWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICduYW1lJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXRBdHRyaWJ1dGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVOYW1lOiBhdHRyaWJ1dGVzW2tleV0ubm9kZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVZhbHVlOiBhdHRyaWJ1dGVzW2tleV0ubm9kZVZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpbnB1dEF0dHJpYnV0ZXMucHVzaCh7IG5vZGVOYW1lOiAnbmFtZScsIG5vZGVWYWx1ZTogJ2lzaW5kZXgnIH0pO1xuICAgICAgICAgICAgdGhpcy5wcm9jZXNzU3RhcnRUYWcoJ2Zvcm0nLCBmb3JtQXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NTdGFydFRhZygnaHInKTtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc1N0YXJ0VGFnKCdsYWJlbCcpO1xuICAgICAgICAgICAgdGhpcy5wcm9jZXNzQ2hhcmFjdGVycyhuZXcgQ2hhcmFjdGVyQnVmZmVyKHByb21wdCkpO1xuICAgICAgICAgICAgdGhpcy5wcm9jZXNzU3RhcnRUYWcoJ2lucHV0JywgaW5wdXRBdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc0VuZFRhZygnbGFiZWwnKTtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc1N0YXJ0VGFnKCdocicpO1xuICAgICAgICAgICAgdGhpcy5wcm9jZXNzRW5kVGFnKCdmb3JtJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnVGV4dGFyZWEgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICAvLyBYWFggRm9ybSBlbGVtZW50IHBvaW50ZXIgY2hlY2tpbmcgaGVyZSBhcyB3ZWxsLi4uXG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLnRva2VuaXplci5zZXRTdGF0ZShUb2tlbml6ZXIuUkNEQVRBKTtcbiAgICAgICAgICAgIHRyZWUub3JpZ2luYWxJbnNlcnRpb25Nb2RlID0gdHJlZS5pbnNlcnRpb25Nb2RlTmFtZTtcbiAgICAgICAgICAgIHRyZWUuc2hvdWxkU2tpcExlYWRpbmdOZXdsaW5lID0gdHJ1ZTtcbiAgICAgICAgICAgIHRyZWUuZnJhbWVzZXRPayA9IGZhbHNlO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCd0ZXh0Jyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnSUZyYW1lID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0VGFnUmF3VGV4dChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdSYXdUZXh0ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5wcm9jZXNzR2VuZXJpY1Jhd1RleHRTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdTZWxlY3QgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSBmYWxzZTtcbiAgICAgICAgICAgIHZhciBpbnNlcnRpb25Nb2RlTmFtZSA9IHRyZWUuaW5zZXJ0aW9uTW9kZU5hbWU7XG4gICAgICAgICAgICBpZiAoaW5zZXJ0aW9uTW9kZU5hbWUgPT0gJ2luVGFibGUnIHx8XG4gICAgICAgICAgICAgICAgaW5zZXJ0aW9uTW9kZU5hbWUgPT0gJ2luQ2FwdGlvbicgfHxcbiAgICAgICAgICAgICAgICBpbnNlcnRpb25Nb2RlTmFtZSA9PSAnaW5Db2x1bW5Hcm91cCcgfHxcbiAgICAgICAgICAgICAgICBpbnNlcnRpb25Nb2RlTmFtZSA9PSAnaW5UYWJsZUJvZHknIHx8XG4gICAgICAgICAgICAgICAgaW5zZXJ0aW9uTW9kZU5hbWUgPT0gJ2luUm93JyB8fFxuICAgICAgICAgICAgICAgIGluc2VydGlvbk1vZGVOYW1lID09ICdpbkNlbGwnKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpblNlbGVjdEluVGFibGUnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpblNlbGVjdCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ01pc3BsYWNlZCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1zdGFydC10YWctaWdub3JlZCcsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuZW5kVGFnTWlzcGxhY2VkID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgLy8gVGhpcyBoYW5kbGVzIGVsZW1lbnRzIHdpdGggZW5kIHRhZ3MgaW4gb3RoZXIgaW5zZXJ0aW9uIG1vZGVzLlxuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1lbmQtdGFnXCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuZW5kVGFnQnIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWVuZC10YWctdHJlYXRlZC1hc1wiLCB7IG9yaWdpbmFsTmFtZTogXCJiclwiLCBuZXdOYW1lOiBcImJyIGVsZW1lbnRcIiB9KTtcbiAgICAgICAgICAgIHRyZWUucmVjb25zdHJ1Y3RBY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBbXSk7XG4gICAgICAgICAgICB0cmVlLnBvcEVsZW1lbnQoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdPcHRpb25PcHRncm91cCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgPT0gJ29wdGlvbicpXG4gICAgICAgICAgICAgICAgdHJlZS5wb3BFbGVtZW50KCk7XG4gICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LmVuZFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdmFyIG5vZGU7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gdHJlZS5vcGVuRWxlbWVudHMubGVuZ3RoIC0gMTsgaSA+IDA7IGktLSkge1xuICAgICAgICAgICAgICAgIG5vZGUgPSB0cmVlLm9wZW5FbGVtZW50cy5pdGVtKGkpO1xuICAgICAgICAgICAgICAgIGlmIChub2RlLmxvY2FsTmFtZSA9PSBuYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyZWUuZ2VuZXJhdGVJbXBsaWVkRW5kVGFncyhuYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZSAhPSBuYW1lKVxuICAgICAgICAgICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIC8vIHRvZG8gb3B0aW1pemVcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucmVtb3ZlX29wZW5FbGVtZW50c191bnRpbChmdW5jdGlvbih4KSB7IHJldHVybiB4ID09PSBub2RlOyB9KTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChub2RlLmlzU3BlY2lhbCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnTWF0aCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICBhdHRyaWJ1dGVzID0gdHJlZS5hZGp1c3RNYXRoTUxBdHRyaWJ1dGVzKGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgYXR0cmlidXRlcyA9IHRyZWUuYWRqdXN0Rm9yZWlnbkF0dHJpYnV0ZXMoYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEZvcmVpZ25FbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMsIFwiaHR0cDovL3d3dy53My5vcmcvMTk5OC9NYXRoL01hdGhNTFwiLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgICAgICAvLyBOZWVkIHRvIGdldCB0aGUgcGFyc2UgZXJyb3IgcmlnaHQgZm9yIHRoZSBjYXNlIHdoZXJlIHRoZSB0b2tlblxuICAgICAgICAgICAgLy8gaGFzIGEgbmFtZXNwYWNlIG5vdCBlcXVhbCB0byB0aGUgeG1sbnMgYXR0cmlidXRlXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnU1ZHID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgIHRyZWUucmVjb25zdHJ1Y3RBY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoKTtcbiAgICAgICAgICAgIGF0dHJpYnV0ZXMgPSB0cmVlLmFkanVzdFNWR0F0dHJpYnV0ZXMoYXR0cmlidXRlcyk7XG4gICAgICAgICAgICBhdHRyaWJ1dGVzID0gdHJlZS5hZGp1c3RGb3JlaWduQXR0cmlidXRlcyhhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0Rm9yZWlnbkVsZW1lbnQobmFtZSwgYXR0cmlidXRlcywgXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgICAgICAvLyBOZWVkIHRvIGdldCB0aGUgcGFyc2UgZXJyb3IgcmlnaHQgZm9yIHRoZSBjYXNlIHdoZXJlIHRoZSB0b2tlblxuICAgICAgICAgICAgLy8gaGFzIGEgbmFtZXNwYWNlIG5vdCBlcXVhbCB0byB0aGUgeG1sbnMgYXR0cmlidXRlXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LmVuZFRhZ1AgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBpZiAoIXRyZWUub3BlbkVsZW1lbnRzLmluQnV0dG9uU2NvcGUoJ3AnKSkge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiAncCcgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydFRhZ0Nsb3NlUCgncCcsIFtdKTtcbiAgICAgICAgICAgICAgICB0aGlzLmVuZFRhZ1AoJ3AnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJlZS5nZW5lcmF0ZUltcGxpZWRFbmRUYWdzKCdwJyk7XG4gICAgICAgICAgICAgICAgaWYgKHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZSAhPSAncCcpXG4gICAgICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1pbXBsaWVkLWVuZC10YWcnLCB7IG5hbWU6ICdwJyB9KTtcbiAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3BVbnRpbFBvcHBlZChuYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuZW5kVGFnQm9keSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICghdHJlZS5vcGVuRWxlbWVudHMuaW5TY29wZSgnYm9keScpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLy8gQHRvZG8gRW1pdCBwYXJzZSBlcnJvciBvbiBlbmQgdGFncyBvdGhlciB0aGFuIHRoZSBvbmVzIGxpc3RlZCBpbiBodHRwOi8vd3d3LnczLm9yZy9UUi9odG1sNS90cmVlLWNvbnN0cnVjdGlvbi5odG1sI3BhcnNpbmctbWFpbi1pbmJvZHlcbiAgICAgICAgICAgIC8vIFsnZGQnLCAnZHQnLCAnbGknLCAnb3B0Z3JvdXAnLCAnb3B0aW9uJywgJ3AnLCAncnAnLCAncnQnLCAndGJvZHknLCAndGQnLCAndGZvb3QnLCAndGgnLCAndGhlYWQnLCAndHInLCAnYm9keScsICdodG1sJ11cbiAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgIT0gJ2JvZHknKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdleHBlY3RlZC1vbmUtZW5kLXRhZy1idXQtZ290LWFub3RoZXInLCB7XG4gICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkTmFtZTogdHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lLFxuICAgICAgICAgICAgICAgICAgICBnb3ROYW1lOiBuYW1lXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2FmdGVyQm9keScpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5lbmRUYWdIdG1sID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKCF0cmVlLm9wZW5FbGVtZW50cy5pblNjb3BlKCdib2R5JykpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vLyBAdG9kbyBFbWl0IHBhcnNlIGVycm9yIG9uIGVuZCB0YWdzIG90aGVyIHRoYW4gdGhlIG9uZXMgbGlzdGVkIGluIGh0dHA6Ly93d3cudzMub3JnL1RSL2h0bWw1L3RyZWUtY29uc3RydWN0aW9uLmh0bWwjcGFyc2luZy1tYWluLWluYm9keVxuICAgICAgICAgICAgLy8gWydkZCcsICdkdCcsICdsaScsICdvcHRncm91cCcsICdvcHRpb24nLCAncCcsICdycCcsICdydCcsICd0Ym9keScsICd0ZCcsICd0Zm9vdCcsICd0aCcsICd0aGVhZCcsICd0cicsICdib2R5JywgJ2h0bWwnXVxuICAgICAgICAgICAgaWYgKHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZSAhPSAnYm9keScpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2V4cGVjdGVkLW9uZS1lbmQtdGFnLWJ1dC1nb3QtYW5vdGhlcicsIHtcbiAgICAgICAgICAgICAgICAgICAgZXhwZWN0ZWROYW1lOiB0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGdvdE5hbWU6IG5hbWVcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnYWZ0ZXJCb2R5Jyk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuZW5kVGFnQmxvY2sgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBpZiAoIXRyZWUub3BlbkVsZW1lbnRzLmluU2NvcGUobmFtZSkpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJlZS5nZW5lcmF0ZUltcGxpZWRFbmRUYWdzKCk7XG4gICAgICAgICAgICAgICAgaWYgKHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZSAhPSBuYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcignZW5kLXRhZy10b28tZWFybHknLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcFVudGlsUG9wcGVkKG5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5lbmRUYWdGb3JtID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdmFyIG5vZGUgPSB0cmVlLmZvcm07XG4gICAgICAgICAgICB0cmVlLmZvcm0gPSBudWxsO1xuICAgICAgICAgICAgaWYgKCFub2RlIHx8ICF0cmVlLm9wZW5FbGVtZW50cy5pblNjb3BlKG5hbWUpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyZWUuZ2VuZXJhdGVJbXBsaWVkRW5kVGFncygpO1xuICAgICAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKSAhPSBub2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcignZW5kLXRhZy10b28tZWFybHktaWdub3JlZCcsIHsgbmFtZTogJ2Zvcm0nIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5yZW1vdmUobm9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LmVuZFRhZ0xpc3RJdGVtID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKCF0cmVlLm9wZW5FbGVtZW50cy5pbkxpc3RJdGVtU2NvcGUobmFtZSkpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJlZS5nZW5lcmF0ZUltcGxpZWRFbmRUYWdzKG5hbWUpO1xuICAgICAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgIT0gbmFtZSlcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdlbmQtdGFnLXRvby1lYXJseScsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3BVbnRpbFBvcHBlZChuYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuZW5kVGFnSGVhZGluZyA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICghdHJlZS5vcGVuRWxlbWVudHMuaGFzTnVtYmVyZWRIZWFkZXJFbGVtZW50SW5TY29wZSgpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJlZS5nZW5lcmF0ZUltcGxpZWRFbmRUYWdzKCk7XG4gICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lICE9IG5hbWUpXG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdlbmQtdGFnLXRvby1lYXJseScsIHsgbmFtZTogbmFtZSB9KTtcblxuICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucmVtb3ZlX29wZW5FbGVtZW50c191bnRpbChmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGUuaXNOdW1iZXJlZEhlYWRlcigpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LmVuZFRhZ0Zvcm1hdHRpbmcgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBpZiAoIXRyZWUuYWRvcHRpb25BZ2VuY3lFbmRUYWcobmFtZSkpXG4gICAgICAgICAgICAgICAgdGhpcy5lbmRUYWdPdGhlcihuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNhcHRpb24gPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmluQ2FwdGlvbi5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgIGNhcHRpb246ICdzdGFydFRhZ1RhYmxlRWxlbWVudCcsXG4gICAgICAgICAgICBjb2w6ICdzdGFydFRhZ1RhYmxlRWxlbWVudCcsXG4gICAgICAgICAgICBjb2xncm91cDogJ3N0YXJ0VGFnVGFibGVFbGVtZW50JyxcbiAgICAgICAgICAgIHRib2R5OiAnc3RhcnRUYWdUYWJsZUVsZW1lbnQnLFxuICAgICAgICAgICAgdGQ6ICdzdGFydFRhZ1RhYmxlRWxlbWVudCcsXG4gICAgICAgICAgICB0Zm9vdDogJ3N0YXJ0VGFnVGFibGVFbGVtZW50JyxcbiAgICAgICAgICAgIHRoZWFkOiAnc3RhcnRUYWdUYWJsZUVsZW1lbnQnLFxuICAgICAgICAgICAgdHI6ICdzdGFydFRhZ1RhYmxlRWxlbWVudCcsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnc3RhcnRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNhcHRpb24uZW5kX3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGNhcHRpb246ICdlbmRUYWdDYXB0aW9uJyxcbiAgICAgICAgICAgIHRhYmxlOiAnZW5kVGFnVGFibGUnLFxuICAgICAgICAgICAgYm9keTogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICBjb2w6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgY29sZ3JvdXA6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgaHRtbDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0Ym9keTogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0ZDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0Zm9vZDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0aGVhZDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0cjogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnZW5kVGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5DYXB0aW9uLnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnByb2Nlc3NDaGFyYWN0ZXJzKGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ2FwdGlvbi5zdGFydFRhZ1RhYmxlRWxlbWVudCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgdmFyIGlnbm9yZUVuZFRhZyA9ICF0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUoJ2NhcHRpb24nKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKCdjYXB0aW9uJyk7XG4gICAgICAgICAgICBpZiAoIWlnbm9yZUVuZFRhZykgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNhcHRpb24uc3RhcnRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICBtb2Rlcy5pbkJvZHkucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNhcHRpb24uZW5kVGFnQ2FwdGlvbiA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICghdHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKCdjYXB0aW9uJykpIHtcbiAgICAgICAgICAgICAgICAvLyBjb250ZXh0IGNhc2VcbiAgICAgICAgICAgICAgICAvLyBUT0RPIGFzc2VydC5vayh0cmVlLmNvbnRleHQpO1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gQVQgdGhpcyBjb2RlIGlzIHF1aXRlIHNpbWlsYXIgdG8gZW5kVGFnVGFibGUgaW4gaW5UYWJsZVxuICAgICAgICAgICAgICAgIHRyZWUuZ2VuZXJhdGVJbXBsaWVkRW5kVGFncygpO1xuICAgICAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgIT0gJ2NhcHRpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEB0b2RvIHRoaXMgaXMgY29uZnVzaW5nIGZvciBpbXBsaWVkIGVuZCB0YWdcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdleHBlY3RlZC1vbmUtZW5kLXRhZy1idXQtZ290LWFub3RoZXInLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBnb3ROYW1lOiBcImNhcHRpb25cIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkTmFtZTogdHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3BVbnRpbFBvcHBlZCgnY2FwdGlvbicpO1xuICAgICAgICAgICAgICAgIHRyZWUuY2xlYXJBY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoKTtcbiAgICAgICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luVGFibGUnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNhcHRpb24uZW5kVGFnVGFibGUgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWVuZC10YWJsZS1pbi1jYXB0aW9uXCIpO1xuICAgICAgICAgICAgdmFyIGlnbm9yZUVuZFRhZyA9ICF0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUoJ2NhcHRpb24nKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKCdjYXB0aW9uJyk7XG4gICAgICAgICAgICBpZiAoIWlnbm9yZUVuZFRhZykgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5DYXB0aW9uLmVuZFRhZ0lnbm9yZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ2FwdGlvbi5lbmRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIG1vZGVzLmluQm9keS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ2VsbCA9IE9iamVjdC5jcmVhdGUobW9kZXMuYmFzZSk7XG5cbiAgICAgICAgbW9kZXMuaW5DZWxsLnN0YXJ0X3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGh0bWw6ICdzdGFydFRhZ0h0bWwnLFxuICAgICAgICAgICAgY2FwdGlvbjogJ3N0YXJ0VGFnVGFibGVPdGhlcicsXG4gICAgICAgICAgICBjb2w6ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgY29sZ3JvdXA6ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgdGJvZHk6ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgdGQ6ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgdGZvb3Q6ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgdGg6ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgdGhlYWQ6ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgdHI6ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5DZWxsLmVuZF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICB0ZDogJ2VuZFRhZ1RhYmxlQ2VsbCcsXG4gICAgICAgICAgICB0aDogJ2VuZFRhZ1RhYmxlQ2VsbCcsXG4gICAgICAgICAgICBib2R5OiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIGNhcHRpb246ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgY29sOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIGNvbGdyb3VwOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIGh0bWw6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgdGFibGU6ICdlbmRUYWdJbXBseScsXG4gICAgICAgICAgICB0Ym9keTogJ2VuZFRhZ0ltcGx5JyxcbiAgICAgICAgICAgIHRmb290OiAnZW5kVGFnSW1wbHknLFxuICAgICAgICAgICAgdGhlYWQ6ICdlbmRUYWdJbXBseScsXG4gICAgICAgICAgICB0cjogJ2VuZFRhZ0ltcGx5JyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdlbmRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNlbGwucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICBtb2Rlcy5pbkJvZHkucHJvY2Vzc0NoYXJhY3RlcnMoZGF0YSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5DZWxsLnN0YXJ0VGFnVGFibGVPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKCd0ZCcpIHx8IHRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZSgndGgnKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2xvc2VDZWxsKCk7XG4gICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGNvbnRleHQgY2FzZVxuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1zdGFydC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5DZWxsLnN0YXJ0VGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5DZWxsLmVuZFRhZ1RhYmxlQ2VsbCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUobmFtZSkpIHtcbiAgICAgICAgICAgICAgICB0cmVlLmdlbmVyYXRlSW1wbGllZEVuZFRhZ3MobmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZSAhPSBuYW1lLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWNlbGwtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxQb3BwZWQobmFtZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5wb3BFbGVtZW50KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRyZWUuY2xlYXJBY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoKTtcbiAgICAgICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luUm93Jyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ2VsbC5lbmRUYWdJZ25vcmUgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNlbGwuZW5kVGFnSW1wbHkgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKG5hbWUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jbG9zZUNlbGwoKTtcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gc29tZXRpbWVzIGNvbnRleHQgY2FzZVxuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ2VsbC5lbmRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIG1vZGVzLmluQm9keS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ2VsbC5jbG9zZUNlbGwgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUoJ3RkJykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVuZFRhZ1RhYmxlQ2VsbCgndGQnKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKCd0aCcpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbmRUYWdUYWJsZUNlbGwoJ3RoJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cblxuICAgICAgICBtb2Rlcy5pbkNvbHVtbkdyb3VwID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5pbkNvbHVtbkdyb3VwLnN0YXJ0X3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGh0bWw6ICdzdGFydFRhZ0h0bWwnLFxuICAgICAgICAgICAgY29sOiAnc3RhcnRUYWdDb2wnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Db2x1bW5Hcm91cC5lbmRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgY29sZ3JvdXA6ICdlbmRUYWdDb2xncm91cCcsXG4gICAgICAgICAgICBjb2w6ICdlbmRUYWdDb2wnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ2VuZFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ29sdW1uR3JvdXAuaWdub3JlRW5kVGFnQ29sZ3JvdXAgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgPT0gJ2h0bWwnO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ29sdW1uR3JvdXAucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBsZWFkaW5nV2hpdGVzcGFjZSA9IGJ1ZmZlci50YWtlTGVhZGluZ1doaXRlc3BhY2UoKTtcbiAgICAgICAgICAgIGlmIChsZWFkaW5nV2hpdGVzcGFjZSlcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydFRleHQobGVhZGluZ1doaXRlc3BhY2UpO1xuICAgICAgICAgICAgaWYgKCFidWZmZXIubGVuZ3RoKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHZhciBpZ25vcmVFbmRUYWcgPSB0aGlzLmlnbm9yZUVuZFRhZ0NvbGdyb3VwKCk7XG4gICAgICAgICAgICB0aGlzLmVuZFRhZ0NvbGdyb3VwKCdjb2xncm91cCcpO1xuICAgICAgICAgICAgaWYgKCFpZ25vcmVFbmRUYWcpIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzQ2hhcmFjdGVycyhidWZmZXIpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ29sdW1uR3JvdXAuc3RhcnRUYWdDb2wgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLmluc2VydFNlbGZDbG9zaW5nRWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNvbHVtbkdyb3VwLnN0YXJ0VGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgdmFyIGlnbm9yZUVuZFRhZyA9IHRoaXMuaWdub3JlRW5kVGFnQ29sZ3JvdXAoKTtcbiAgICAgICAgICAgIHRoaXMuZW5kVGFnQ29sZ3JvdXAoJ2NvbGdyb3VwJyk7XG4gICAgICAgICAgICBpZiAoIWlnbm9yZUVuZFRhZykgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Db2x1bW5Hcm91cC5lbmRUYWdDb2xncm91cCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmlnbm9yZUVuZFRhZ0NvbGdyb3VwKCkpIHtcbiAgICAgICAgICAgICAgICAvLyBjb250ZXh0IGNhc2VcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBhc3NlcnQub2sodHJlZS5jb250ZXh0KTtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wb3BFbGVtZW50KCk7XG4gICAgICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpblRhYmxlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Db2x1bW5Hcm91cC5lbmRUYWdDb2wgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJuby1lbmQtdGFnXCIsIHsgbmFtZTogJ2NvbCcgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Db2x1bW5Hcm91cC5lbmRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHZhciBpZ25vcmVFbmRUYWcgPSB0aGlzLmlnbm9yZUVuZFRhZ0NvbGdyb3VwKCk7XG4gICAgICAgICAgICB0aGlzLmVuZFRhZ0NvbGdyb3VwKCdjb2xncm91cCcpO1xuICAgICAgICAgICAgaWYgKCFpZ25vcmVFbmRUYWcpIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluRm9yZWlnbkNvbnRlbnQgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmluRm9yZWlnbkNvbnRlbnQucHJvY2Vzc1N0YXJ0VGFnID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgIGlmIChbJ2InLCAnYmlnJywgJ2Jsb2NrcXVvdGUnLCAnYm9keScsICdicicsICdjZW50ZXInLCAnY29kZScsICdkZCcsICdkaXYnLCAnZGwnLCAnZHQnLCAnZW0nLCAnZW1iZWQnLCAnaDEnLCAnaDInLCAnaDMnLCAnaDQnLCAnaDUnLCAnaDYnLCAnaGVhZCcsICdocicsICdpJywgJ2ltZycsICdsaScsICdsaXN0aW5nJywgJ21lbnUnLCAnbWV0YScsICdub2JyJywgJ29sJywgJ3AnLCAncHJlJywgJ3J1YnknLCAncycsICdzbWFsbCcsICdzcGFuJywgJ3N0cm9uZycsICdzdHJpa2UnLCAnc3ViJywgJ3N1cCcsICd0YWJsZScsICd0dCcsICd1JywgJ3VsJywgJ3ZhciddLmluZGV4T2YobmFtZSkgIT0gLTFcbiAgICAgICAgICAgICAgICB8fCAobmFtZSA9PSAnZm9udCcgJiYgYXR0cmlidXRlcy5zb21lKGZ1bmN0aW9uKGF0dHIpIHsgcmV0dXJuIFsnY29sb3InLCAnZmFjZScsICdzaXplJ10uaW5kZXhPZihhdHRyLm5vZGVOYW1lKSA+PSAwIH0pKSkge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1odG1sLWVsZW1lbnQtaW4tZm9yZWlnbi1jb250ZW50JywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgICAgIHdoaWxlICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5pc0ZvcmVpZ24oKVxuICAgICAgICAgICAgICAgICAgICAmJiAhdHJlZS5jdXJyZW50U3RhY2tJdGVtKCkuaXNIdG1sSW50ZWdyYXRpb25Qb2ludCgpXG4gICAgICAgICAgICAgICAgICAgICYmICF0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5pc01hdGhNTFRleHRJbnRlZ3JhdGlvblBvaW50KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5uYW1lc3BhY2VVUkkgPT0gXCJodHRwOi8vd3d3LnczLm9yZy8xOTk4L01hdGgvTWF0aE1MXCIpIHtcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGVzID0gdHJlZS5hZGp1c3RNYXRoTUxBdHRyaWJ1dGVzKGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLm5hbWVzcGFjZVVSSSA9PSBcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIpIHtcbiAgICAgICAgICAgICAgICBuYW1lID0gdHJlZS5hZGp1c3RTVkdUYWdOYW1lQ2FzZShuYW1lKTtcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGVzID0gdHJlZS5hZGp1c3RTVkdBdHRyaWJ1dGVzKGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXR0cmlidXRlcyA9IHRyZWUuYWRqdXN0Rm9yZWlnbkF0dHJpYnV0ZXMoYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEZvcmVpZ25FbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMsIHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLm5hbWVzcGFjZVVSSSwgc2VsZkNsb3NpbmcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluRm9yZWlnbkNvbnRlbnQucHJvY2Vzc0VuZFRhZyA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHZhciBub2RlID0gdHJlZS5jdXJyZW50U3RhY2tJdGVtKCk7XG4gICAgICAgICAgICB2YXIgaW5kZXggPSB0cmVlLm9wZW5FbGVtZW50cy5sZW5ndGggLSAxO1xuICAgICAgICAgICAgaWYgKG5vZGUubG9jYWxOYW1lLnRvTG93ZXJDYXNlKCkgIT0gbmFtZSlcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWVuZC10YWdcIiwgeyBuYW1lOiBuYW1lIH0pO1xuXG4gICAgICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgICAgIGlmIChpbmRleCA9PT0gMClcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUubG9jYWxOYW1lLnRvTG93ZXJDYXNlKCkgPT0gbmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB3aGlsZSAodHJlZS5vcGVuRWxlbWVudHMucG9wKCkgIT0gbm9kZSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpbmRleCAtPSAxO1xuICAgICAgICAgICAgICAgIG5vZGUgPSB0cmVlLm9wZW5FbGVtZW50cy5pdGVtKGluZGV4KTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5pc0ZvcmVpZ24oKSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluRm9yZWlnbkNvbnRlbnQucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBjaGFyYWN0ZXJzID0gYnVmZmVyLnRha2VSZW1haW5pbmcoKTtcbiAgICAgICAgICAgIGNoYXJhY3RlcnMgPSBjaGFyYWN0ZXJzLnJlcGxhY2UoL1xcdTAwMDAvZywgZnVuY3Rpb24obWF0Y2gsIGluZGV4KSB7XG4gICAgICAgICAgICAgICAgLy8gQHRvZG8gcG9zaXRpb25cbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2ludmFsaWQtY29kZXBvaW50Jyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICdcXHVGRkZEJztcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKHRyZWUuZnJhbWVzZXRPayAmJiAhaXNBbGxXaGl0ZXNwYWNlT3JSZXBsYWNlbWVudENoYXJhY3RlcnMoY2hhcmFjdGVycykpXG4gICAgICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gZmFsc2U7XG4gICAgICAgICAgICB0cmVlLmluc2VydFRleHQoY2hhcmFjdGVycyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkTm9zY3JpcHQgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmluSGVhZE5vc2NyaXB0LnN0YXJ0X3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGh0bWw6ICdzdGFydFRhZ0h0bWwnLFxuICAgICAgICAgICAgYmFzZWZvbnQ6ICdzdGFydFRhZ0Jhc2Vmb250Qmdzb3VuZExpbmtNZXRhTm9mcmFtZXNTdHlsZScsXG4gICAgICAgICAgICBiZ3NvdW5kOiAnc3RhcnRUYWdCYXNlZm9udEJnc291bmRMaW5rTWV0YU5vZnJhbWVzU3R5bGUnLFxuICAgICAgICAgICAgbGluazogJ3N0YXJ0VGFnQmFzZWZvbnRCZ3NvdW5kTGlua01ldGFOb2ZyYW1lc1N0eWxlJyxcbiAgICAgICAgICAgIG1ldGE6ICdzdGFydFRhZ0Jhc2Vmb250Qmdzb3VuZExpbmtNZXRhTm9mcmFtZXNTdHlsZScsXG4gICAgICAgICAgICBub2ZyYW1lczogJ3N0YXJ0VGFnQmFzZWZvbnRCZ3NvdW5kTGlua01ldGFOb2ZyYW1lc1N0eWxlJyxcbiAgICAgICAgICAgIHN0eWxlOiAnc3RhcnRUYWdCYXNlZm9udEJnc291bmRMaW5rTWV0YU5vZnJhbWVzU3R5bGUnLFxuICAgICAgICAgICAgaGVhZDogJ3N0YXJ0VGFnSGVhZE5vc2NyaXB0JyxcbiAgICAgICAgICAgIG5vc2NyaXB0OiAnc3RhcnRUYWdIZWFkTm9zY3JpcHQnLFxuICAgICAgICAgICAgXCItZGVmYXVsdFwiOiAnc3RhcnRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWROb3NjcmlwdC5lbmRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgbm9zY3JpcHQ6ICdlbmRUYWdOb3NjcmlwdCcsXG4gICAgICAgICAgICBicjogJ2VuZFRhZ0JyJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdlbmRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWROb3NjcmlwdC5wcm9jZXNzQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGxlYWRpbmdXaGl0ZXNwYWNlID0gYnVmZmVyLnRha2VMZWFkaW5nV2hpdGVzcGFjZSgpO1xuICAgICAgICAgICAgaWYgKGxlYWRpbmdXaGl0ZXNwYWNlKVxuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0VGV4dChsZWFkaW5nV2hpdGVzcGFjZSk7XG4gICAgICAgICAgICBpZiAoIWJ1ZmZlci5sZW5ndGgpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgLy8gRklYTUUgZXJyb3IgbWVzc2FnZVxuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1jaGFyLWluLWZyYW1lc2V0XCIpO1xuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzQ2hhcmFjdGVycyhidWZmZXIpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZE5vc2NyaXB0LnByb2Nlc3NDb21tZW50ID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgbW9kZXMuaW5IZWFkLnByb2Nlc3NDb21tZW50KGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZE5vc2NyaXB0LnN0YXJ0VGFnQmFzZWZvbnRCZ3NvdW5kTGlua01ldGFOb2ZyYW1lc1N0eWxlID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgbW9kZXMuaW5IZWFkLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWROb3NjcmlwdC5zdGFydFRhZ0hlYWROb3NjcmlwdCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIC8vIEZJWE1FIGVycm9yIG1lc3NhZ2VcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtc3RhcnQtdGFnLWluLWZyYW1lc2V0XCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWROb3NjcmlwdC5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgLy8gRklYTUUgZXJyb3IgbWVzc2FnZVxuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1zdGFydC10YWctaW4tZnJhbWVzZXRcIiwgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkTm9zY3JpcHQuZW5kVGFnQnIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICAvLyBGSVhNRSBlcnJvciBtZXNzYWdlXG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWVuZC10YWctaW4tZnJhbWVzZXRcIiwgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZE5vc2NyaXB0LmVuZFRhZ05vc2NyaXB0ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5wb3BFbGVtZW50KCk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luSGVhZCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZE5vc2NyaXB0LmVuZFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgLy8gRklYTUUgZXJyb3IgbWVzc2FnZVxuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1lbmQtdGFnLWluLWZyYW1lc2V0XCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWROb3NjcmlwdC5hbnl0aGluZ0Vsc2UgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRyZWUucG9wRWxlbWVudCgpO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpbkhlYWQnKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIG1vZGVzLmluRnJhbWVzZXQgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmluRnJhbWVzZXQuc3RhcnRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgaHRtbDogJ3N0YXJ0VGFnSHRtbCcsXG4gICAgICAgICAgICBmcmFtZXNldDogJ3N0YXJ0VGFnRnJhbWVzZXQnLFxuICAgICAgICAgICAgZnJhbWU6ICdzdGFydFRhZ0ZyYW1lJyxcbiAgICAgICAgICAgIG5vZnJhbWVzOiAnc3RhcnRUYWdOb2ZyYW1lcycsXG4gICAgICAgICAgICBcIi1kZWZhdWx0XCI6ICdzdGFydFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluRnJhbWVzZXQuZW5kX3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGZyYW1lc2V0OiAnZW5kVGFnRnJhbWVzZXQnLFxuICAgICAgICAgICAgbm9mcmFtZXM6ICdlbmRUYWdOb2ZyYW1lcycsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnZW5kVGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5GcmFtZXNldC5wcm9jZXNzQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtY2hhci1pbi1mcmFtZXNldFwiKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkZyYW1lc2V0LnN0YXJ0VGFnRnJhbWVzZXQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5GcmFtZXNldC5zdGFydFRhZ0ZyYW1lID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRTZWxmQ2xvc2luZ0VsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5GcmFtZXNldC5zdGFydFRhZ05vZnJhbWVzID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkZyYW1lc2V0LnN0YXJ0VGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLXN0YXJ0LXRhZy1pbi1mcmFtZXNldFwiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5GcmFtZXNldC5lbmRUYWdGcmFtZXNldCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgPT0gJ2h0bWwnKSB7XG4gICAgICAgICAgICAgICAgLy8gY29udGV4dCBjYXNlXG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1mcmFtZXNldC1pbi1mcmFtZXNldC1pbm5lcmh0bWxcIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyZWUucG9wRWxlbWVudCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIXRyZWUuY29udGV4dCAmJiB0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgIT0gJ2ZyYW1lc2V0Jykge1xuICAgICAgICAgICAgICAgIC8vIElmIHdlJ3JlIG5vdCBpbiBjb250ZXh0IG1vZGUgYW4gdGhlIGN1cnJlbnQgbm9kZSBpcyBub3QgYSBcImZyYW1lc2V0XCIgZWxlbWVudCAoYW55bW9yZSkgdGhlbiBzd2l0Y2hcbiAgICAgICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2FmdGVyRnJhbWVzZXQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkZyYW1lc2V0LmVuZFRhZ05vZnJhbWVzID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5GcmFtZXNldC5lbmRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtZW5kLXRhZy1pbi1mcmFtZXNldFwiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZSA9IE9iamVjdC5jcmVhdGUobW9kZXMuYmFzZSk7XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZS5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgIGNhcHRpb246ICdzdGFydFRhZ0NhcHRpb24nLFxuICAgICAgICAgICAgY29sZ3JvdXA6ICdzdGFydFRhZ0NvbGdyb3VwJyxcbiAgICAgICAgICAgIGNvbDogJ3N0YXJ0VGFnQ29sJyxcbiAgICAgICAgICAgIHRhYmxlOiAnc3RhcnRUYWdUYWJsZScsXG4gICAgICAgICAgICB0Ym9keTogJ3N0YXJ0VGFnUm93R3JvdXAnLFxuICAgICAgICAgICAgdGZvb3Q6ICdzdGFydFRhZ1Jvd0dyb3VwJyxcbiAgICAgICAgICAgIHRoZWFkOiAnc3RhcnRUYWdSb3dHcm91cCcsXG4gICAgICAgICAgICB0ZDogJ3N0YXJ0VGFnSW1wbHlUYm9keScsXG4gICAgICAgICAgICB0aDogJ3N0YXJ0VGFnSW1wbHlUYm9keScsXG4gICAgICAgICAgICB0cjogJ3N0YXJ0VGFnSW1wbHlUYm9keScsXG4gICAgICAgICAgICBzdHlsZTogJ3N0YXJ0VGFnU3R5bGVTY3JpcHQnLFxuICAgICAgICAgICAgc2NyaXB0OiAnc3RhcnRUYWdTdHlsZVNjcmlwdCcsXG4gICAgICAgICAgICBpbnB1dDogJ3N0YXJ0VGFnSW5wdXQnLFxuICAgICAgICAgICAgZm9ybTogJ3N0YXJ0VGFnRm9ybScsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnc3RhcnRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlLmVuZF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICB0YWJsZTogJ2VuZFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIGJvZHk6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgY2FwdGlvbjogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICBjb2w6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgY29sZ3JvdXA6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgaHRtbDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0Ym9keTogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0ZDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0Zm9vdDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0aDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0aGVhZDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0cjogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnZW5kVGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZS5wcm9jZXNzQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5pc0Zvc3RlclBhcmVudGluZygpKSB7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWdpbmFsSW5zZXJ0aW9uTW9kZSA9IHRyZWUuaW5zZXJ0aW9uTW9kZU5hbWU7XG4gICAgICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpblRhYmxlVGV4dCcpO1xuICAgICAgICAgICAgICAgIHRyZWUub3JpZ2luYWxJbnNlcnRpb25Nb2RlID0gb3JpZ2luYWxJbnNlcnRpb25Nb2RlO1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzQ2hhcmFjdGVycyhkYXRhKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJlZS5yZWRpcmVjdEF0dGFjaFRvRm9zdGVyUGFyZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBtb2Rlcy5pbkJvZHkucHJvY2Vzc0NoYXJhY3RlcnMoZGF0YSk7XG4gICAgICAgICAgICAgICAgdHJlZS5yZWRpcmVjdEF0dGFjaFRvRm9zdGVyUGFyZW50ID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZS5zdGFydFRhZ0NhcHRpb24gPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3BVbnRpbFRhYmxlU2NvcGVNYXJrZXIoKTtcbiAgICAgICAgICAgIHRyZWUuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzLnB1c2goTWFya2VyKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5DYXB0aW9uJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZS5zdGFydFRhZ0NvbGdyb3VwID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxUYWJsZVNjb3BlTWFya2VyKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luQ29sdW1uR3JvdXAnKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlLnN0YXJ0VGFnQ29sID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdGhpcy5zdGFydFRhZ0NvbGdyb3VwKCdjb2xncm91cCcsIFtdKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZS5zdGFydFRhZ1Jvd0dyb3VwID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxUYWJsZVNjb3BlTWFya2VyKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luVGFibGVCb2R5Jyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZS5zdGFydFRhZ0ltcGx5VGJvZHkgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0VGFnUm93R3JvdXAoJ3Rib2R5JywgW10pO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlLnN0YXJ0VGFnVGFibGUgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLXN0YXJ0LXRhZy1pbXBsaWVzLWVuZC10YWdcIixcbiAgICAgICAgICAgICAgICB7IHN0YXJ0TmFtZTogXCJ0YWJsZVwiLCBlbmROYW1lOiBcInRhYmxlXCIgfSk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZygndGFibGUnKTtcbiAgICAgICAgICAgIGlmICghdHJlZS5jb250ZXh0KSB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGUuc3RhcnRUYWdTdHlsZVNjcmlwdCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIG1vZGVzLmluSGVhZC5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZS5zdGFydFRhZ0lucHV0ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgZm9yICh2YXIga2V5IGluIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgICAgICBpZiAoYXR0cmlidXRlc1trZXldLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT0gJ3R5cGUnKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhdHRyaWJ1dGVzW2tleV0ubm9kZVZhbHVlLnRvTG93ZXJDYXNlKCkgPT0gJ2hpZGRlbicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtaGlkZGVuLWlucHV0LWluLXRhYmxlXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gWFhYIGFzc29jaWF0ZSB3aXRoIGZvcm1cbiAgICAgICAgICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuc3RhcnRUYWdPdGhlcihuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlLnN0YXJ0VGFnRm9ybSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtZm9ybS1pbi10YWJsZVwiKTtcbiAgICAgICAgICAgIGlmICghdHJlZS5mb3JtKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgICAgIHRyZWUuZm9ybSA9IHRyZWUuY3VycmVudFN0YWNrSXRlbSgpO1xuICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGUuc3RhcnRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLXN0YXJ0LXRhZy1pbXBsaWVzLXRhYmxlLXZvb2Rvb1wiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB0cmVlLnJlZGlyZWN0QXR0YWNoVG9Gb3N0ZXJQYXJlbnQgPSB0cnVlO1xuICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgICAgICB0cmVlLnJlZGlyZWN0QXR0YWNoVG9Gb3N0ZXJQYXJlbnQgPSBmYWxzZTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlLmVuZFRhZ1RhYmxlID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZShuYW1lKSkge1xuICAgICAgICAgICAgICAgIHRyZWUuZ2VuZXJhdGVJbXBsaWVkRW5kVGFncygpO1xuICAgICAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgIT0gbmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJlbmQtdGFnLXRvby1lYXJseS1uYW1lZFwiLCB7IGdvdE5hbWU6ICd0YWJsZScsIGV4cGVjdGVkTmFtZTogdHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lIH0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcFVudGlsUG9wcGVkKCd0YWJsZScpO1xuICAgICAgICAgICAgICAgIHRyZWUucmVzZXRJbnNlcnRpb25Nb2RlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBUT0RPIGFzc2VydC5vayh0cmVlLmNvbnRleHQpO1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGUuZW5kVGFnSWdub3JlID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1lbmQtdGFnXCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlLmVuZFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1lbmQtdGFnLWltcGxpZXMtdGFibGUtdm9vZG9vXCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIC8vIE1ha2UgYWxsIHRoZSBzcGVjaWFsIGVsZW1lbnQgcmVhcnJhbmdpbmcgdm9vZG9vIGtpY2sgaW5cbiAgICAgICAgICAgIHRyZWUucmVkaXJlY3RBdHRhY2hUb0Zvc3RlclBhcmVudCA9IHRydWU7XG4gICAgICAgICAgICAvLyBQcm9jZXNzIHRoZSBlbmQgdGFnIGluIHRoZSBcImluIGJvZHlcIiBtb2RlXG4gICAgICAgICAgICBtb2Rlcy5pbkJvZHkucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgICAgIHRyZWUucmVkaXJlY3RBdHRhY2hUb0Zvc3RlclBhcmVudCA9IGZhbHNlO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGVUZXh0ID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlVGV4dC5mbHVzaENoYXJhY3RlcnMgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciBjaGFyYWN0ZXJzID0gdHJlZS5wZW5kaW5nVGFibGVDaGFyYWN0ZXJzLmpvaW4oJycpO1xuICAgICAgICAgICAgaWYgKCFpc0FsbFdoaXRlc3BhY2UoY2hhcmFjdGVycykpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnJlZGlyZWN0QXR0YWNoVG9Gb3N0ZXJQYXJlbnQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRyZWUucmVjb25zdHJ1Y3RBY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoKTtcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydFRleHQoY2hhcmFjdGVycyk7XG4gICAgICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdHJlZS5yZWRpcmVjdEF0dGFjaFRvRm9zdGVyUGFyZW50ID0gZmFsc2U7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0VGV4dChjaGFyYWN0ZXJzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyZWUucGVuZGluZ1RhYmxlQ2hhcmFjdGVycyA9IFtdO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGVUZXh0LnByb2Nlc3NDb21tZW50ID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgdGhpcy5mbHVzaENoYXJhY3RlcnMoKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSh0cmVlLm9yaWdpbmFsSW5zZXJ0aW9uTW9kZSk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0NvbW1lbnQoZGF0YSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZVRleHQucHJvY2Vzc0VPRiA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIHRoaXMuZmx1c2hDaGFyYWN0ZXJzKCk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUodHJlZS5vcmlnaW5hbEluc2VydGlvbk1vZGUpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFT0YoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlVGV4dC5wcm9jZXNzQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGNoYXJhY3RlcnMgPSBidWZmZXIudGFrZVJlbWFpbmluZygpO1xuICAgICAgICAgICAgY2hhcmFjdGVycyA9IGNoYXJhY3RlcnMucmVwbGFjZSgvXFx1MDAwMC9nLCBmdW5jdGlvbihtYXRjaCwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgICAvLyBAdG9kbyBwb3NpdGlvblxuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcImludmFsaWQtY29kZXBvaW50XCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKCFjaGFyYWN0ZXJzKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRyZWUucGVuZGluZ1RhYmxlQ2hhcmFjdGVycy5wdXNoKGNoYXJhY3RlcnMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGVUZXh0LnByb2Nlc3NTdGFydFRhZyA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICB0aGlzLmZsdXNoQ2hhcmFjdGVycygpO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKHRyZWUub3JpZ2luYWxJbnNlcnRpb25Nb2RlKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGVUZXh0LnByb2Nlc3NFbmRUYWcgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0aGlzLmZsdXNoQ2hhcmFjdGVycygpO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKHRyZWUub3JpZ2luYWxJbnNlcnRpb25Nb2RlKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGVCb2R5ID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlQm9keS5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgIHRyOiAnc3RhcnRUYWdUcicsXG4gICAgICAgICAgICB0ZDogJ3N0YXJ0VGFnVGFibGVDZWxsJyxcbiAgICAgICAgICAgIHRoOiAnc3RhcnRUYWdUYWJsZUNlbGwnLFxuICAgICAgICAgICAgY2FwdGlvbjogJ3N0YXJ0VGFnVGFibGVPdGhlcicsXG4gICAgICAgICAgICBjb2w6ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgY29sZ3JvdXA6ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgdGJvZHk6ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgdGZvb3Q6ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgdGhlYWQ6ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZUJvZHkuZW5kX3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIHRhYmxlOiAnZW5kVGFnVGFibGUnLFxuICAgICAgICAgICAgdGJvZHk6ICdlbmRUYWdUYWJsZVJvd0dyb3VwJyxcbiAgICAgICAgICAgIHRmb290OiAnZW5kVGFnVGFibGVSb3dHcm91cCcsXG4gICAgICAgICAgICB0aGVhZDogJ2VuZFRhZ1RhYmxlUm93R3JvdXAnLFxuICAgICAgICAgICAgYm9keTogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICBjYXB0aW9uOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIGNvbDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICBjb2xncm91cDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICBodG1sOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIHRkOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIHRoOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIHRyOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdlbmRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlQm9keS5wcm9jZXNzQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIG1vZGVzLmluVGFibGUucHJvY2Vzc0NoYXJhY3RlcnMoZGF0YSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZUJvZHkuc3RhcnRUYWdUciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcFVudGlsVGFibGVCb2R5U2NvcGVNYXJrZXIoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5Sb3cnKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlQm9keS5zdGFydFRhZ1RhYmxlQ2VsbCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtY2VsbC1pbi10YWJsZS1ib2R5XCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRUYWdUcigndHInLCBbXSk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGVCb2R5LnN0YXJ0VGFnVGFibGVPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIC8vIFhYWCBhbnkgaWRlYXMgb24gaG93IHRvIHNoYXJlIHRoaXMgd2l0aCBlbmRUYWdUYWJsZVxuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZSgndGJvZHknKSB8fCB0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUoJ3RoZWFkJykgfHwgdHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKCd0Zm9vdCcpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxUYWJsZUJvZHlTY29wZU1hcmtlcigpO1xuICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnVGFibGVSb3dHcm91cCh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUpO1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGNvbnRleHQgY2FzZVxuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1zdGFydC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZUJvZHkuc3RhcnRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIG1vZGVzLmluVGFibGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGVCb2R5LmVuZFRhZ1RhYmxlUm93R3JvdXAgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKG5hbWUpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxUYWJsZUJvZHlTY29wZU1hcmtlcigpO1xuICAgICAgICAgICAgICAgIHRyZWUucG9wRWxlbWVudCgpO1xuICAgICAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5UYWJsZScpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZy1pbi10YWJsZS1ib2R5JywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGVCb2R5LmVuZFRhZ1RhYmxlID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZSgndGJvZHknKSB8fCB0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUoJ3RoZWFkJykgfHwgdHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKCd0Zm9vdCcpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxUYWJsZUJvZHlTY29wZU1hcmtlcigpO1xuICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnVGFibGVSb3dHcm91cCh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUpO1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBjb250ZXh0IGNhc2VcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlQm9keS5lbmRUYWdJZ25vcmUgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWVuZC10YWctaW4tdGFibGUtYm9keVwiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZUJvZHkuZW5kVGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBtb2Rlcy5pblRhYmxlLnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5TZWxlY3QgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0LnN0YXJ0X3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGh0bWw6ICdzdGFydFRhZ0h0bWwnLFxuICAgICAgICAgICAgb3B0aW9uOiAnc3RhcnRUYWdPcHRpb24nLFxuICAgICAgICAgICAgb3B0Z3JvdXA6ICdzdGFydFRhZ09wdGdyb3VwJyxcbiAgICAgICAgICAgIHNlbGVjdDogJ3N0YXJ0VGFnU2VsZWN0JyxcbiAgICAgICAgICAgIGlucHV0OiAnc3RhcnRUYWdJbnB1dCcsXG4gICAgICAgICAgICBrZXlnZW46ICdzdGFydFRhZ0lucHV0JyxcbiAgICAgICAgICAgIHRleHRhcmVhOiAnc3RhcnRUYWdJbnB1dCcsXG4gICAgICAgICAgICBzY3JpcHQ6ICdzdGFydFRhZ1NjcmlwdCcsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnc3RhcnRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdC5lbmRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgb3B0aW9uOiAnZW5kVGFnT3B0aW9uJyxcbiAgICAgICAgICAgIG9wdGdyb3VwOiAnZW5kVGFnT3B0Z3JvdXAnLFxuICAgICAgICAgICAgc2VsZWN0OiAnZW5kVGFnU2VsZWN0JyxcbiAgICAgICAgICAgIGNhcHRpb246ICdlbmRUYWdUYWJsZUVsZW1lbnRzJyxcbiAgICAgICAgICAgIHRhYmxlOiAnZW5kVGFnVGFibGVFbGVtZW50cycsXG4gICAgICAgICAgICB0Ym9keTogJ2VuZFRhZ1RhYmxlRWxlbWVudHMnLFxuICAgICAgICAgICAgdGZvb3Q6ICdlbmRUYWdUYWJsZUVsZW1lbnRzJyxcbiAgICAgICAgICAgIHRoZWFkOiAnZW5kVGFnVGFibGVFbGVtZW50cycsXG4gICAgICAgICAgICB0cjogJ2VuZFRhZ1RhYmxlRWxlbWVudHMnLFxuICAgICAgICAgICAgdGQ6ICdlbmRUYWdUYWJsZUVsZW1lbnRzJyxcbiAgICAgICAgICAgIHRoOiAnZW5kVGFnVGFibGVFbGVtZW50cycsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnZW5kVGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5TZWxlY3QucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLnRha2VSZW1haW5pbmcoKTtcbiAgICAgICAgICAgIGRhdGEgPSBkYXRhLnJlcGxhY2UoL1xcdTAwMDAvZywgZnVuY3Rpb24obWF0Y2gsIGluZGV4KSB7XG4gICAgICAgICAgICAgICAgLy8gQHRvZG8gcG9zaXRpb25cbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJpbnZhbGlkLWNvZGVwb2ludFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmICghZGF0YSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0cmVlLmluc2VydFRleHQoZGF0YSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5TZWxlY3Quc3RhcnRUYWdPcHRpb24gPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICAvLyB3ZSBuZWVkIHRvIGltcGx5IDwvb3B0aW9uPiBpZiA8b3B0aW9uPiBpcyB0aGUgY3VycmVudCBub2RlXG4gICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lID09ICdvcHRpb24nKVxuICAgICAgICAgICAgICAgIHRyZWUucG9wRWxlbWVudCgpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0LnN0YXJ0VGFnT3B0Z3JvdXAgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lID09ICdvcHRpb24nKVxuICAgICAgICAgICAgICAgIHRyZWUucG9wRWxlbWVudCgpO1xuICAgICAgICAgICAgaWYgKHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZSA9PSAnb3B0Z3JvdXAnKVxuICAgICAgICAgICAgICAgIHRyZWUucG9wRWxlbWVudCgpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0LmVuZFRhZ09wdGlvbiA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgIT09ICdvcHRpb24nKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWctaW4tc2VsZWN0JywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyZWUucG9wRWxlbWVudCgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0LmVuZFRhZ09wdGdyb3VwID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgLy8gPC9vcHRncm91cD4gaW1wbGljaXRseSBjbG9zZXMgPG9wdGlvbj5cbiAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgPT0gJ29wdGlvbicgJiYgdHJlZS5vcGVuRWxlbWVudHMuaXRlbSh0cmVlLm9wZW5FbGVtZW50cy5sZW5ndGggLSAyKS5sb2NhbE5hbWUgPT0gJ29wdGdyb3VwJykge1xuICAgICAgICAgICAgICAgIHRyZWUucG9wRWxlbWVudCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpdCBhbHNvIGNsb3NlcyA8L29wdGdyb3VwPlxuICAgICAgICAgICAgaWYgKHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZSA9PSAnb3B0Z3JvdXAnKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wb3BFbGVtZW50KCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEJ1dCBub3RoaW5nIGVsc2VcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZy1pbi1zZWxlY3QnLCB7IG5hbWU6ICdvcHRncm91cCcgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5TZWxlY3Quc3RhcnRUYWdTZWxlY3QgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLXNlbGVjdC1pbi1zZWxlY3RcIik7XG4gICAgICAgICAgICB0aGlzLmVuZFRhZ1NlbGVjdCgnc2VsZWN0Jyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5TZWxlY3QuZW5kVGFnU2VsZWN0ID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZSgnc2VsZWN0JykpIHtcbiAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3BVbnRpbFBvcHBlZCgnc2VsZWN0Jyk7XG4gICAgICAgICAgICAgICAgdHJlZS5yZXNldEluc2VydGlvbk1vZGUoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gY29udGV4dCBjYXNlXG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5TZWxlY3Quc3RhcnRUYWdJbnB1dCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtaW5wdXQtaW4tc2VsZWN0XCIpO1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluU2VsZWN0U2NvcGUoJ3NlbGVjdCcpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbmRUYWdTZWxlY3QoJ3NlbGVjdCcpO1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5TZWxlY3Quc3RhcnRUYWdTY3JpcHQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBtb2Rlcy5pbkhlYWQucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0LmVuZFRhZ1RhYmxlRWxlbWVudHMgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZy1pbi1zZWxlY3QnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKG5hbWUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbmRUYWdTZWxlY3QoJ3NlbGVjdCcpO1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0LnN0YXJ0VGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLXN0YXJ0LXRhZy1pbi1zZWxlY3RcIiwgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0LmVuZFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWctaW4tc2VsZWN0JywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0SW5UYWJsZSA9IE9iamVjdC5jcmVhdGUobW9kZXMuYmFzZSk7XG5cbiAgICAgICAgbW9kZXMuaW5TZWxlY3RJblRhYmxlLnN0YXJ0X3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGNhcHRpb246ICdzdGFydFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIHRhYmxlOiAnc3RhcnRUYWdUYWJsZScsXG4gICAgICAgICAgICB0Ym9keTogJ3N0YXJ0VGFnVGFibGUnLFxuICAgICAgICAgICAgdGZvb3Q6ICdzdGFydFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIHRoZWFkOiAnc3RhcnRUYWdUYWJsZScsXG4gICAgICAgICAgICB0cjogJ3N0YXJ0VGFnVGFibGUnLFxuICAgICAgICAgICAgdGQ6ICdzdGFydFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIHRoOiAnc3RhcnRUYWdUYWJsZScsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnc3RhcnRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdEluVGFibGUuZW5kX3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGNhcHRpb246ICdlbmRUYWdUYWJsZScsXG4gICAgICAgICAgICB0YWJsZTogJ2VuZFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIHRib2R5OiAnZW5kVGFnVGFibGUnLFxuICAgICAgICAgICAgdGZvb3Q6ICdlbmRUYWdUYWJsZScsXG4gICAgICAgICAgICB0aGVhZDogJ2VuZFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIHRyOiAnZW5kVGFnVGFibGUnLFxuICAgICAgICAgICAgdGQ6ICdlbmRUYWdUYWJsZScsXG4gICAgICAgICAgICB0aDogJ2VuZFRhZ1RhYmxlJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdlbmRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdEluVGFibGUucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICBtb2Rlcy5pblNlbGVjdC5wcm9jZXNzQ2hhcmFjdGVycyhkYXRhKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdEluVGFibGUuc3RhcnRUYWdUYWJsZSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtdGFibGUtZWxlbWVudC1zdGFydC10YWctaW4tc2VsZWN0LWluLXRhYmxlXCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIHRoaXMuZW5kVGFnT3RoZXIoXCJzZWxlY3RcIik7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0SW5UYWJsZS5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgIG1vZGVzLmluU2VsZWN0LnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5TZWxlY3RJblRhYmxlLmVuZFRhZ1RhYmxlID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC10YWJsZS1lbGVtZW50LWVuZC10YWctaW4tc2VsZWN0LWluLXRhYmxlXCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUobmFtZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVuZFRhZ090aGVyKFwic2VsZWN0XCIpO1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0SW5UYWJsZS5lbmRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIG1vZGVzLmluU2VsZWN0LnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Sb3cgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmluUm93LnN0YXJ0X3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGh0bWw6ICdzdGFydFRhZ0h0bWwnLFxuICAgICAgICAgICAgdGQ6ICdzdGFydFRhZ1RhYmxlQ2VsbCcsXG4gICAgICAgICAgICB0aDogJ3N0YXJ0VGFnVGFibGVDZWxsJyxcbiAgICAgICAgICAgIGNhcHRpb246ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgY29sOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIGNvbGdyb3VwOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIHRib2R5OiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIHRmb290OiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIHRoZWFkOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIHRyOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdzdGFydFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluUm93LmVuZF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICB0cjogJ2VuZFRhZ1RyJyxcbiAgICAgICAgICAgIHRhYmxlOiAnZW5kVGFnVGFibGUnLFxuICAgICAgICAgICAgdGJvZHk6ICdlbmRUYWdUYWJsZVJvd0dyb3VwJyxcbiAgICAgICAgICAgIHRmb290OiAnZW5kVGFnVGFibGVSb3dHcm91cCcsXG4gICAgICAgICAgICB0aGVhZDogJ2VuZFRhZ1RhYmxlUm93R3JvdXAnLFxuICAgICAgICAgICAgYm9keTogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICBjYXB0aW9uOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIGNvbDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICBjb2xncm91cDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICBodG1sOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIHRkOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIHRoOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdlbmRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblJvdy5wcm9jZXNzQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIG1vZGVzLmluVGFibGUucHJvY2Vzc0NoYXJhY3RlcnMoZGF0YSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Sb3cuc3RhcnRUYWdUYWJsZUNlbGwgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3BVbnRpbFRhYmxlUm93U2NvcGVNYXJrZXIoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5DZWxsJyk7XG4gICAgICAgICAgICB0cmVlLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cy5wdXNoKE1hcmtlcik7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Sb3cuc3RhcnRUYWdUYWJsZU90aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdmFyIGlnbm9yZUVuZFRhZyA9IHRoaXMuaWdub3JlRW5kVGFnVHIoKTtcbiAgICAgICAgICAgIHRoaXMuZW5kVGFnVHIoJ3RyJyk7XG4gICAgICAgICAgICAvLyBYWFggaG93IGFyZSB3ZSBzdXJlIGl0J3MgYWx3YXlzIGlnbm9yZWQgaW4gdGhlIGNvbnRleHQgY2FzZT9cbiAgICAgICAgICAgIGlmICghaWdub3JlRW5kVGFnKSB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluUm93LnN0YXJ0VGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgbW9kZXMuaW5UYWJsZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluUm93LmVuZFRhZ1RyID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuaWdub3JlRW5kVGFnVHIoKSkge1xuICAgICAgICAgICAgICAgIC8vIFRPRE86IGFzc2VydC5vayh0cmVlLmNvbnRleHQpO1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3BVbnRpbFRhYmxlUm93U2NvcGVNYXJrZXIoKTtcbiAgICAgICAgICAgICAgICB0cmVlLnBvcEVsZW1lbnQoKTtcbiAgICAgICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luVGFibGVCb2R5Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Sb3cuZW5kVGFnVGFibGUgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB2YXIgaWdub3JlRW5kVGFnID0gdGhpcy5pZ25vcmVFbmRUYWdUcigpO1xuICAgICAgICAgICAgdGhpcy5lbmRUYWdUcigndHInKTtcbiAgICAgICAgICAgIC8vIFJlcHJvY2VzcyB0aGUgY3VycmVudCB0YWcgaWYgdGhlIHRyIGVuZCB0YWcgd2FzIG5vdCBpZ25vcmVkXG4gICAgICAgICAgICAvLyBYWFggaG93IGFyZSB3ZSBzdXJlIGl0J3MgYWx3YXlzIGlnbm9yZWQgaW4gdGhlIGNvbnRleHQgY2FzZT9cbiAgICAgICAgICAgIGlmICghaWdub3JlRW5kVGFnKSB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblJvdy5lbmRUYWdUYWJsZVJvd0dyb3VwID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZShuYW1lKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnVHIoJ3RyJyk7XG4gICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGNvbnRleHQgY2FzZVxuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluUm93LmVuZFRhZ0lnbm9yZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtZW5kLXRhZy1pbi10YWJsZS1yb3dcIiwgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluUm93LmVuZFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgbW9kZXMuaW5UYWJsZS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluUm93Lmlnbm9yZUVuZFRhZ1RyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gIXRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZSgndHInKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckFmdGVyRnJhbWVzZXQgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQWZ0ZXJGcmFtZXNldC5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgIG5vZnJhbWVzOiAnc3RhcnRUYWdOb0ZyYW1lcycsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnc3RhcnRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckFmdGVyRnJhbWVzZXQucHJvY2Vzc0VPRiA9IGZ1bmN0aW9uKCkgeyB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQWZ0ZXJGcmFtZXNldC5wcm9jZXNzQ29tbWVudCA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0Q29tbWVudChkYXRhLCB0cmVlLmRvY3VtZW50KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckFmdGVyRnJhbWVzZXQucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBjaGFyYWN0ZXJzID0gYnVmZmVyLnRha2VSZW1haW5pbmcoKTtcbiAgICAgICAgICAgIHZhciB3aGl0ZXNwYWNlID0gXCJcIjtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2hhcmFjdGVycy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBjaCA9IGNoYXJhY3RlcnNbaV07XG4gICAgICAgICAgICAgICAgaWYgKGlzV2hpdGVzcGFjZShjaCkpXG4gICAgICAgICAgICAgICAgICAgIHdoaXRlc3BhY2UgKz0gY2g7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAod2hpdGVzcGFjZSkge1xuICAgICAgICAgICAgICAgIHRyZWUucmVjb25zdHJ1Y3RBY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoKTtcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydFRleHQod2hpdGVzcGFjZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAod2hpdGVzcGFjZS5sZW5ndGggPCBjaGFyYWN0ZXJzLmxlbmd0aClcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2V4cGVjdGVkLWVvZi1idXQtZ290LWNoYXInKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckFmdGVyRnJhbWVzZXQuc3RhcnRUYWdOb0ZyYW1lcyA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIG1vZGVzLmluSGVhZC5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJBZnRlckZyYW1lc2V0LnN0YXJ0VGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdleHBlY3RlZC1lb2YtYnV0LWdvdC1zdGFydC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJBZnRlckZyYW1lc2V0LnByb2Nlc3NFbmRUYWcgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2V4cGVjdGVkLWVvZi1idXQtZ290LWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMudGV4dCA9IE9iamVjdC5jcmVhdGUobW9kZXMuYmFzZSk7XG5cbiAgICAgICAgbW9kZXMudGV4dC5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnc3RhcnRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy50ZXh0LmVuZF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBzY3JpcHQ6ICdlbmRUYWdTY3JpcHQnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ2VuZFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLnRleHQucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLnNob3VsZFNraXBMZWFkaW5nTmV3bGluZSkge1xuICAgICAgICAgICAgICAgIHRyZWUuc2hvdWxkU2tpcExlYWRpbmdOZXdsaW5lID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnNraXBBdE1vc3RPbmVMZWFkaW5nTmV3bGluZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIudGFrZVJlbWFpbmluZygpO1xuICAgICAgICAgICAgaWYgKCFkYXRhKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0VGV4dChkYXRhKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy50ZXh0LnByb2Nlc3NFT0YgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcImV4cGVjdGVkLW5hbWVkLWNsb3NpbmctdGFnLWJ1dC1nb3QtZW9mXCIsXG4gICAgICAgICAgICAgICAgeyBuYW1lOiB0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgfSk7XG4gICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3AoKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSh0cmVlLm9yaWdpbmFsSW5zZXJ0aW9uTW9kZSk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VPRigpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLnRleHQuc3RhcnRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRocm93IFwiVHJpZWQgdG8gcHJvY2VzcyBzdGFydCB0YWcgXCIgKyBuYW1lICsgXCIgaW4gUkNEQVRBL1JBV1RFWFQgbW9kZVwiO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLnRleHQuZW5kVGFnU2NyaXB0ID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdmFyIG5vZGUgPSB0cmVlLm9wZW5FbGVtZW50cy5wb3AoKTtcbiAgICAgICAgICAgIC8vIFRPRE8gYXNzZXJ0Lm9rKG5vZGUubG9jYWxOYW1lID09ICdzY3JpcHQnKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSh0cmVlLm9yaWdpbmFsSW5zZXJ0aW9uTW9kZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMudGV4dC5lbmRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcCgpO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKHRyZWUub3JpZ2luYWxJbnNlcnRpb25Nb2RlKTtcbiAgICAgICAgfTtcbiAgICB9XG5cblxuICAgIHNldEluc2VydGlvbk1vZGUobmFtZSkge1xuICAgICAgICB0aGlzLmluc2VydGlvbk1vZGUgPSB0aGlzLmluc2VydGlvbk1vZGVzW25hbWVdO1xuICAgICAgICB0aGlzLmluc2VydGlvbk1vZGVOYW1lID0gbmFtZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZG9wdGlvbiBhZ2VuY3kgYWxnb3JpdGhtIChodHRwOi8vd3d3LndoYXR3Zy5vcmcvc3BlY3Mvd2ViLWFwcHMvY3VycmVudC13b3JrL211bHRpcGFnZS90cmVlLWNvbnN0cnVjdGlvbi5odG1sI2Fkb3B0aW9uLWFnZW5jeS1hbGdvcml0aG0pXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgQSB0YWcgbmFtZSBzdWJqZWN0IGZvciB3aGljaCB0aGUgYWxnb3JpdGhtIGlzIGJlaW5nIHJ1blxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59IFJldHVybnMgZmFsc2UgaWYgdGhlIGFsZ29yaXRobSB3YXMgYWJvcnRlZFxuICAgICAqL1xuICAgIGFkb3B0aW9uQWdlbmN5RW5kVGFnKG5hbWUpIHtcbiAgICAgICAgdmFyIG91dGVySXRlcmF0aW9uTGltaXQgPSA4O1xuICAgICAgICB2YXIgaW5uZXJJdGVyYXRpb25MaW1pdCA9IDM7XG4gICAgICAgIHZhciBmb3JtYXR0aW5nRWxlbWVudDtcblxuICAgICAgICBmdW5jdGlvbiBpc0FjdGl2ZUZvcm1hdHRpbmdFbGVtZW50KGVsKSB7XG4gICAgICAgICAgICByZXR1cm4gZWwgPT09IGZvcm1hdHRpbmdFbGVtZW50O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG91dGVyTG9vcENvdW50ZXIgPSAwO1xuXG4gICAgICAgIHdoaWxlIChvdXRlckxvb3BDb3VudGVyKysgPCBvdXRlckl0ZXJhdGlvbkxpbWl0KSB7XG4gICAgICAgICAgICAvLyA0LlxuICAgICAgICAgICAgZm9ybWF0dGluZ0VsZW1lbnQgPSB0aGlzLmVsZW1lbnRJbkFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cyhuYW1lKTtcblxuICAgICAgICAgICAgaWYgKCFmb3JtYXR0aW5nRWxlbWVudCB8fCAodGhpcy5vcGVuRWxlbWVudHMuY29udGFpbnMoZm9ybWF0dGluZ0VsZW1lbnQpICYmICF0aGlzLm9wZW5FbGVtZW50cy5pblNjb3BlKGZvcm1hdHRpbmdFbGVtZW50LmxvY2FsTmFtZSkpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXJzZUVycm9yKCdhZG9wdGlvbi1hZ2VuY3ktMS4xJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghdGhpcy5vcGVuRWxlbWVudHMuY29udGFpbnMoZm9ybWF0dGluZ0VsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXJzZUVycm9yKCdhZG9wdGlvbi1hZ2VuY3ktMS4yJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRWxlbWVudEZyb21BY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoZm9ybWF0dGluZ0VsZW1lbnQpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCF0aGlzLm9wZW5FbGVtZW50cy5pblNjb3BlKGZvcm1hdHRpbmdFbGVtZW50LmxvY2FsTmFtZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnBhcnNlRXJyb3IoJ2Fkb3B0aW9uLWFnZW5jeS00LjQnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChmb3JtYXR0aW5nRWxlbWVudCAhPSB0aGlzLmN1cnJlbnRTdGFja0l0ZW0oKSkge1xuICAgICAgICAgICAgICAgIHRoaXMucGFyc2VFcnJvcignYWRvcHRpb24tYWdlbmN5LTEuMycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gU3RhcnQgb2YgdGhlIGFkb3B0aW9uIGFnZW5jeSBhbGdvcml0aG0gcHJvcGVyXG4gICAgICAgICAgICAvLyB0b2RvIEVsZW1lbnRTdGFja1xuICAgICAgICAgICAgdmFyIGZ1cnRoZXN0QmxvY2sgPSB0aGlzLm9wZW5FbGVtZW50cy5mdXJ0aGVzdEJsb2NrRm9yRm9ybWF0dGluZ0VsZW1lbnQoZm9ybWF0dGluZ0VsZW1lbnQubm9kZSk7XG5cbiAgICAgICAgICAgIGlmICghZnVydGhlc3RCbG9jaykge1xuICAgICAgICAgICAgICAgIHRoaXMub3BlbkVsZW1lbnRzLnJlbW92ZV9vcGVuRWxlbWVudHNfdW50aWwoaXNBY3RpdmVGb3JtYXR0aW5nRWxlbWVudCk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVFbGVtZW50RnJvbUFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cyhmb3JtYXR0aW5nRWxlbWVudCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBhZmVJbmRleCA9IHRoaXMub3BlbkVsZW1lbnRzLmVsZW1lbnRzLmluZGV4T2YoZm9ybWF0dGluZ0VsZW1lbnQpO1xuICAgICAgICAgICAgdmFyIGNvbW1vbkFuY2VzdG9yID0gdGhpcy5vcGVuRWxlbWVudHMuaXRlbShhZmVJbmRleCAtIDEpO1xuXG4gICAgICAgICAgICB2YXIgYm9va21hcmsgPSB0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cy5pbmRleE9mKGZvcm1hdHRpbmdFbGVtZW50KTtcblxuICAgICAgICAgICAgdmFyIG5vZGUgPSBmdXJ0aGVzdEJsb2NrO1xuICAgICAgICAgICAgdmFyIGxhc3ROb2RlID0gZnVydGhlc3RCbG9jaztcbiAgICAgICAgICAgIHZhciBpbmRleCA9IHRoaXMub3BlbkVsZW1lbnRzLmVsZW1lbnRzLmluZGV4T2Yobm9kZSk7XG5cbiAgICAgICAgICAgIHZhciBpbm5lckxvb3BDb3VudGVyID0gMDtcbiAgICAgICAgICAgIHdoaWxlIChpbm5lckxvb3BDb3VudGVyKysgPCBpbm5lckl0ZXJhdGlvbkxpbWl0KSB7XG4gICAgICAgICAgICAgICAgaW5kZXggLT0gMTtcbiAgICAgICAgICAgICAgICBub2RlID0gdGhpcy5vcGVuRWxlbWVudHMuaXRlbShpbmRleCk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzLmluZGV4T2Yobm9kZSkgPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub3BlbkVsZW1lbnRzLmVsZW1lbnRzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobm9kZSA9PSBmb3JtYXR0aW5nRWxlbWVudClcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBpZiAobGFzdE5vZGUgPT0gZnVydGhlc3RCbG9jaylcbiAgICAgICAgICAgICAgICAgICAgYm9va21hcmsgPSB0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cy5pbmRleE9mKG5vZGUpICsgMTtcblxuICAgICAgICAgICAgICAgIHZhciBjbG9uZSA9IHRoaXMuY3JlYXRlRWxlbWVudChub2RlLm5hbWVzcGFjZVVSSSwgbm9kZS5sb2NhbE5hbWUsIG5vZGUuYXR0cmlidXRlcyk7XG4gICAgICAgICAgICAgICAgdmFyIG5ld05vZGUgPSBuZXcgU3RhY2tJdGVtKG5vZGUubmFtZXNwYWNlVVJJLCBub2RlLmxvY2FsTmFtZSwgbm9kZS5hdHRyaWJ1dGVzLCBjbG9uZSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50c1t0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cy5pbmRleE9mKG5vZGUpXSA9IG5ld05vZGU7XG4gICAgICAgICAgICAgICAgdGhpcy5vcGVuRWxlbWVudHMuZWxlbWVudHNbdGhpcy5vcGVuRWxlbWVudHMuZWxlbWVudHMuaW5kZXhPZihub2RlKV0gPSBuZXdOb2RlO1xuXG4gICAgICAgICAgICAgICAgbm9kZSA9IG5ld05vZGU7XG4gICAgICAgICAgICAgICAgdGhpcy5kZXRhY2hGcm9tUGFyZW50KGxhc3ROb2RlLm5vZGUpO1xuICAgICAgICAgICAgICAgIHRoaXMuYXR0YWNoTm9kZShsYXN0Tm9kZS5ub2RlLCBub2RlLm5vZGUpO1xuICAgICAgICAgICAgICAgIGxhc3ROb2RlID0gbm9kZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5kZXRhY2hGcm9tUGFyZW50KGxhc3ROb2RlLm5vZGUpO1xuICAgICAgICAgICAgaWYgKGNvbW1vbkFuY2VzdG9yLmlzRm9zdGVyUGFyZW50aW5nKCkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmluc2VydEludG9Gb3N0ZXJQYXJlbnQobGFzdE5vZGUubm9kZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuYXR0YWNoTm9kZShsYXN0Tm9kZS5ub2RlLCBjb21tb25BbmNlc3Rvci5ub2RlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGNsb25lID0gdGhpcy5jcmVhdGVFbGVtZW50KFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbFwiLCBmb3JtYXR0aW5nRWxlbWVudC5sb2NhbE5hbWUsIGZvcm1hdHRpbmdFbGVtZW50LmF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdmFyIGZvcm1hdHRpbmdDbG9uZSA9IG5ldyBTdGFja0l0ZW0oZm9ybWF0dGluZ0VsZW1lbnQubmFtZXNwYWNlVVJJLCBmb3JtYXR0aW5nRWxlbWVudC5sb2NhbE5hbWUsIGZvcm1hdHRpbmdFbGVtZW50LmF0dHJpYnV0ZXMsIGNsb25lKTtcblxuICAgICAgICAgICAgdGhpcy5yZXBhcmVudENoaWxkcmVuKGZ1cnRoZXN0QmxvY2subm9kZSwgY2xvbmUpO1xuICAgICAgICAgICAgdGhpcy5hdHRhY2hOb2RlKGNsb25lLCBmdXJ0aGVzdEJsb2NrLm5vZGUpO1xuXG4gICAgICAgICAgICB0aGlzLnJlbW92ZUVsZW1lbnRGcm9tQWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKGZvcm1hdHRpbmdFbGVtZW50KTtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzLnNwbGljZShNYXRoLm1pbihib29rbWFyaywgdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMubGVuZ3RoKSwgMCwgZm9ybWF0dGluZ0Nsb25lKTtcblxuICAgICAgICAgICAgdGhpcy5vcGVuRWxlbWVudHMucmVtb3ZlKGZvcm1hdHRpbmdFbGVtZW50KTtcbiAgICAgICAgICAgIHRoaXMub3BlbkVsZW1lbnRzLmVsZW1lbnRzLnNwbGljZSh0aGlzLm9wZW5FbGVtZW50cy5lbGVtZW50cy5pbmRleE9mKGZ1cnRoZXN0QmxvY2spICsgMSwgMCwgZm9ybWF0dGluZ0Nsb25lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHN0YXJ0KHRva2VuaXplcikge1xuICAgICAgICB0aHJvdyBcIk5vdCBpbXBsZW1lbnRlZFwiO1xuICAgIH1cblxuICAgIHN0YXJ0VG9rZW5pemF0aW9uKHRva2VuaXplcikge1xuICAgICAgICB0aGlzLnRva2VuaXplciA9IHRva2VuaXplcjtcbiAgICAgICAgdGhpcy5jb21wYXRNb2RlID0gXCJubyBxdWlya3NcIjtcbiAgICAgICAgdGhpcy5vcmlnaW5hbEluc2VydGlvbk1vZGUgPSBcImluaXRpYWxcIjtcbiAgICAgICAgdGhpcy5mcmFtZXNldE9rID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5vcGVuRWxlbWVudHMgPSBuZXcgRWxlbWVudFN0YWNrKCk7XG4gICAgICAgIHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzID0gW107XG4gICAgICAgIHRoaXMuc3RhcnQodG9rZW5pemVyKTtcbiAgICAgICAgaWYgKHRoaXMuY29udGV4dCkge1xuICAgICAgICAgICAgc3dpdGNoICh0aGlzLmNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICBjYXNlICd0aXRsZSc6XG4gICAgICAgICAgICAgICAgY2FzZSAndGV4dGFyZWEnOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2VuaXplci5zZXRTdGF0ZShUb2tlbml6ZXIuUkNEQVRBKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnc3R5bGUnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ3htcCc6XG4gICAgICAgICAgICAgICAgY2FzZSAnaWZyYW1lJzpcbiAgICAgICAgICAgICAgICBjYXNlICdub2VtYmVkJzpcbiAgICAgICAgICAgICAgICBjYXNlICdub2ZyYW1lcyc6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9rZW5pemVyLnNldFN0YXRlKFRva2VuaXplci5SQVdURVhUKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnc2NyaXB0JzpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b2tlbml6ZXIuc2V0U3RhdGUoVG9rZW5pemVyLlNDUklQVF9EQVRBKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAnbm9zY3JpcHQnOlxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5zY3JpcHRpbmdFbmFibGVkKVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50b2tlbml6ZXIuc2V0U3RhdGUoVG9rZW5pemVyLlJBV1RFWFQpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdwbGFpbnRleHQnOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2VuaXplci5zZXRTdGF0ZShUb2tlbml6ZXIuUExBSU5URVhUKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmluc2VydEh0bWxFbGVtZW50KCk7XG4gICAgICAgICAgICB0aGlzLnJlc2V0SW5zZXJ0aW9uTW9kZSgpO1xuICAgICAgICAgICAgLy8gdG9kbyBmb3JtIHBvaW50ZXJcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2V0SW5zZXJ0aW9uTW9kZSgnaW5pdGlhbCcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJvY2Vzc1Rva2VuKHRva2VuKSB7XG4gICAgICAgIHRoaXMuc2VsZkNsb3NpbmdGbGFnQWNrbm93bGVkZ2VkID0gZmFsc2U7XG5cbiAgICAgICAgdmFyIGN1cnJlbnROb2RlID0gdGhpcy5vcGVuRWxlbWVudHMudG9wIHx8IG51bGw7XG4gICAgICAgIHZhciBpbnNlcnRpb25Nb2RlO1xuICAgICAgICBpZiAoIWN1cnJlbnROb2RlIHx8ICFjdXJyZW50Tm9kZS5pc0ZvcmVpZ24oKSB8fFxuICAgICAgICAgICAgKGN1cnJlbnROb2RlLmlzTWF0aE1MVGV4dEludGVncmF0aW9uUG9pbnQoKSAmJlxuICAgICAgICAgICAgICAgICgodG9rZW4udHlwZSA9PSAnU3RhcnRUYWcnICYmXG4gICAgICAgICAgICAgICAgICAgICEodG9rZW4ubmFtZSBpbiB7IG1nbHlwaDogMCwgbWFsaWdubWFyazogMCB9KSkgfHxcbiAgICAgICAgICAgICAgICAgICAgKHRva2VuLnR5cGUgPT09ICdDaGFyYWN0ZXJzJykpXG4gICAgICAgICAgICApIHx8XG4gICAgICAgICAgICAoY3VycmVudE5vZGUubmFtZXNwYWNlVVJJID09IFwiaHR0cDovL3d3dy53My5vcmcvMTk5OC9NYXRoL01hdGhNTFwiICYmXG4gICAgICAgICAgICAgICAgY3VycmVudE5vZGUubG9jYWxOYW1lID09ICdhbm5vdGF0aW9uLXhtbCcgJiZcbiAgICAgICAgICAgICAgICB0b2tlbi50eXBlID09ICdTdGFydFRhZycgJiYgdG9rZW4ubmFtZSA9PSAnc3ZnJ1xuICAgICAgICAgICAgKSB8fFxuICAgICAgICAgICAgKGN1cnJlbnROb2RlLmlzSHRtbEludGVncmF0aW9uUG9pbnQoKSAmJlxuICAgICAgICAgICAgICAgIHRva2VuLnR5cGUgaW4geyBTdGFydFRhZzogMCwgQ2hhcmFjdGVyczogMCB9XG4gICAgICAgICAgICApIHx8XG4gICAgICAgICAgICB0b2tlbi50eXBlID09ICdFT0YnXG4gICAgICAgICkge1xuICAgICAgICAgICAgaW5zZXJ0aW9uTW9kZSA9IHRoaXMuaW5zZXJ0aW9uTW9kZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluc2VydGlvbk1vZGUgPSB0aGlzLmluc2VydGlvbk1vZGVzLmluRm9yZWlnbkNvbnRlbnQ7XG4gICAgICAgIH1cbiAgICAgICAgc3dpdGNoICh0b2tlbi50eXBlKSB7XG4gICAgICAgICAgICBjYXNlICdDaGFyYWN0ZXJzJzpcbiAgICAgICAgICAgICAgICB2YXIgYnVmZmVyID0gbmV3IENoYXJhY3RlckJ1ZmZlcih0b2tlbi5kYXRhKTtcbiAgICAgICAgICAgICAgICBpbnNlcnRpb25Nb2RlLnByb2Nlc3NDaGFyYWN0ZXJzKGJ1ZmZlcik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdDb21tZW50JzpcbiAgICAgICAgICAgICAgICBpbnNlcnRpb25Nb2RlLnByb2Nlc3NDb21tZW50KHRva2VuLmRhdGEpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnU3RhcnRUYWcnOlxuICAgICAgICAgICAgICAgIGluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKHRva2VuLm5hbWUsIHRva2VuLmRhdGEsIHRva2VuLnNlbGZDbG9zaW5nKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0VuZFRhZyc6XG4gICAgICAgICAgICAgICAgaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKHRva2VuLm5hbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnRG9jdHlwZSc6XG4gICAgICAgICAgICAgICAgaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRG9jdHlwZSh0b2tlbi5uYW1lLCB0b2tlbi5wdWJsaWNJZCwgdG9rZW4uc3lzdGVtSWQsIHRva2VuLmZvcmNlUXVpcmtzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0VPRic6XG4gICAgICAgICAgICAgICAgaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRU9GKCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgaXNDZGF0YVNlY3Rpb25BbGxvd2VkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5vcGVuRWxlbWVudHMubGVuZ3RoID4gMCAmJiB0aGlzLmN1cnJlbnRTdGFja0l0ZW0oKS5pc0ZvcmVpZ24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgaXNTZWxmQ2xvc2luZ0ZsYWdBY2tub3dsZWRnZWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGZDbG9zaW5nRmxhZ0Fja25vd2xlZGdlZDtcbiAgICB9XG5cbiAgICBjcmVhdGVFbGVtZW50KG5hbWVzcGFjZVVSSSwgbG9jYWxOYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZFwiKTtcbiAgICB9XG5cbiAgICBhdHRhY2hOb2RlKGNoaWxkLCBwYXJlbnQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm90IGltcGxlbWVudGVkXCIpO1xuICAgIH1cblxuICAgIGF0dGFjaE5vZGVUb0Zvc3RlclBhcmVudChjaGlsZCwgdGFibGUsIHN0YWNrUGFyZW50KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZFwiKTtcbiAgICB9XG5cbiAgICBkZXRhY2hGcm9tUGFyZW50KG5vZGUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm90IGltcGxlbWVudGVkXCIpO1xuICAgIH1cblxuICAgIGFkZEF0dHJpYnV0ZXNUb0VsZW1lbnQoZWxlbWVudCwgYXR0cmlidXRlcykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWRcIik7XG4gICAgfVxuXG4gICAgaW5zZXJ0SHRtbEVsZW1lbnQoYXR0cmlidXRlcz8pIHtcbiAgICAgICAgdmFyIHJvb3QgPSB0aGlzLmNyZWF0ZUVsZW1lbnQoXCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sXCIsICdodG1sJywgYXR0cmlidXRlcyk7XG4gICAgICAgIHRoaXMuYXR0YWNoTm9kZShyb290LCB0aGlzLmRvY3VtZW50KTtcbiAgICAgICAgdGhpcy5vcGVuRWxlbWVudHMucHVzaEh0bWxFbGVtZW50KG5ldyBTdGFja0l0ZW0oXCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sXCIsICdodG1sJywgYXR0cmlidXRlcywgcm9vdCkpO1xuICAgICAgICByZXR1cm4gcm9vdDtcbiAgICB9XG5cbiAgICBpbnNlcnRIZWFkRWxlbWVudChhdHRyaWJ1dGVzKSB7XG4gICAgICAgIHZhciBlbGVtZW50ID0gdGhpcy5jcmVhdGVFbGVtZW50KFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbFwiLCBcImhlYWRcIiwgYXR0cmlidXRlcyk7XG4gICAgICAgIHRoaXMuaGVhZCA9IG5ldyBTdGFja0l0ZW0oXCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sXCIsIFwiaGVhZFwiLCBhdHRyaWJ1dGVzLCBlbGVtZW50KTtcbiAgICAgICAgdGhpcy5hdHRhY2hOb2RlKGVsZW1lbnQsIHRoaXMub3BlbkVsZW1lbnRzLnRvcC5ub2RlKTtcbiAgICAgICAgdGhpcy5vcGVuRWxlbWVudHMucHVzaEhlYWRFbGVtZW50KHRoaXMuaGVhZCk7XG4gICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgIH1cblxuICAgIGluc2VydEJvZHlFbGVtZW50KGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgdmFyIGVsZW1lbnQgPSB0aGlzLmNyZWF0ZUVsZW1lbnQoXCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sXCIsIFwiYm9keVwiLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgdGhpcy5hdHRhY2hOb2RlKGVsZW1lbnQsIHRoaXMub3BlbkVsZW1lbnRzLnRvcC5ub2RlKTtcbiAgICAgICAgdGhpcy5vcGVuRWxlbWVudHMucHVzaEJvZHlFbGVtZW50KG5ldyBTdGFja0l0ZW0oXCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sXCIsIFwiYm9keVwiLCBhdHRyaWJ1dGVzLCBlbGVtZW50KSk7XG4gICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgIH1cblxuICAgIGluc2VydEludG9Gb3N0ZXJQYXJlbnQobm9kZSkge1xuICAgICAgICB2YXIgdGFibGVJbmRleCA9IHRoaXMub3BlbkVsZW1lbnRzLmZpbmRJbmRleCgndGFibGUnKTtcbiAgICAgICAgdmFyIHRhYmxlRWxlbWVudCA9IHRoaXMub3BlbkVsZW1lbnRzLml0ZW0odGFibGVJbmRleCkubm9kZTtcbiAgICAgICAgaWYgKHRhYmxlSW5kZXggPT09IDApXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hdHRhY2hOb2RlKG5vZGUsIHRhYmxlRWxlbWVudCk7XG4gICAgICAgIHRoaXMuYXR0YWNoTm9kZVRvRm9zdGVyUGFyZW50KG5vZGUsIHRhYmxlRWxlbWVudCwgdGhpcy5vcGVuRWxlbWVudHMuaXRlbSh0YWJsZUluZGV4IC0gMSkubm9kZSk7XG4gICAgfVxuXG4gICAgaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzLCBuYW1lc3BhY2VVUkk/LCBzZWxmQ2xvc2luZz8pIHtcbiAgICAgICAgaWYgKCFuYW1lc3BhY2VVUkkpXG4gICAgICAgICAgICBuYW1lc3BhY2VVUkkgPSBcImh0dHA6Ly93d3cudzMub3JnLzE5OTkveGh0bWxcIjtcbiAgICAgICAgdmFyIGVsZW1lbnQgPSB0aGlzLmNyZWF0ZUVsZW1lbnQobmFtZXNwYWNlVVJJLCBuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgaWYgKHRoaXMuc2hvdWxkRm9zdGVyUGFyZW50KCkpXG4gICAgICAgICAgICB0aGlzLmluc2VydEludG9Gb3N0ZXJQYXJlbnQoZWxlbWVudCk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuYXR0YWNoTm9kZShlbGVtZW50LCB0aGlzLm9wZW5FbGVtZW50cy50b3Aubm9kZSk7XG4gICAgICAgIGlmICghc2VsZkNsb3NpbmcpXG4gICAgICAgICAgICB0aGlzLm9wZW5FbGVtZW50cy5wdXNoKG5ldyBTdGFja0l0ZW0obmFtZXNwYWNlVVJJLCBuYW1lLCBhdHRyaWJ1dGVzLCBlbGVtZW50KSk7XG4gICAgfVxuXG4gICAgaW5zZXJ0Rm9ybWF0dGluZ0VsZW1lbnQobmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICB0aGlzLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcywgXCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sXCIpO1xuICAgICAgICB0aGlzLmFwcGVuZEVsZW1lbnRUb0FjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cyh0aGlzLmN1cnJlbnRTdGFja0l0ZW0oKSk7XG4gICAgfVxuXG4gICAgaW5zZXJ0U2VsZkNsb3NpbmdFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgdGhpcy5zZWxmQ2xvc2luZ0ZsYWdBY2tub3dsZWRnZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcywgXCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sXCIsIHRydWUpO1xuICAgIH1cblxuICAgIGluc2VydEZvcmVpZ25FbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMsIG5hbWVzcGFjZVVSSSwgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgaWYgKHNlbGZDbG9zaW5nKVxuICAgICAgICAgICAgdGhpcy5zZWxmQ2xvc2luZ0ZsYWdBY2tub3dsZWRnZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcywgbmFtZXNwYWNlVVJJLCBzZWxmQ2xvc2luZyk7XG4gICAgfVxuXG4gICAgaW5zZXJ0Q29tbWVudChkYXRhLCBwYXJlbnQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm90IGltcGxlbWVudGVkXCIpO1xuICAgIH1cblxuICAgIGluc2VydERvY3R5cGUobmFtZSwgcHVibGljSWQsIHN5c3RlbUlkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZFwiKTtcbiAgICB9XG5cbiAgICBpbnNlcnRUZXh0KGRhdGEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm90IGltcGxlbWVudGVkXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdG9wbW9zdCBvcGVuIGVsZW1lbnRcbiAgICAgKiBAcmV0dXJuIHtTdGFja0l0ZW19XG4gICAgICovXG4gICAgY3VycmVudFN0YWNrSXRlbSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMub3BlbkVsZW1lbnRzLnRvcDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQb3B1bGF0ZXMgY3VycmVudCBvcGVuIGVsZW1lbnRcbiAgICAgKiBAcmV0dXJuIHtTdGFja0l0ZW19XG4gICAgICovXG4gICAgcG9wRWxlbWVudCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMub3BlbkVsZW1lbnRzLnBvcCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdHJ1ZSBpZiByZWRpcmVjdCBpcyByZXF1aXJlZCBhbmQgY3VycmVudCBvcGVuIGVsZW1lbnQgY2F1c2VzIGZvc3RlciBwYXJlbnRpbmdcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqL1xuICAgIHNob3VsZEZvc3RlclBhcmVudCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVkaXJlY3RBdHRhY2hUb0Zvc3RlclBhcmVudCAmJiB0aGlzLmN1cnJlbnRTdGFja0l0ZW0oKS5pc0Zvc3RlclBhcmVudGluZygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEltcGxlbWVudHMgaHR0cDovL3d3dy53aGF0d2cub3JnL3NwZWNzL3dlYi1hcHBzL2N1cnJlbnQtd29yay9tdWx0aXBhZ2UvdHJlZS1jb25zdHJ1Y3Rpb24uaHRtbCNjbG9zaW5nLWVsZW1lbnRzLXRoYXQtaGF2ZS1pbXBsaWVkLWVuZC10YWdzXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IFtleGNsdWRlXSBJZ25vcmUgc3BlY2lmaWMgdGFnIG5hbWVcbiAgICAgKi9cbiAgICBnZW5lcmF0ZUltcGxpZWRFbmRUYWdzKGV4Y2x1ZGU/KSB7XG4gICAgICAgIC8vIEZJWE1FIGdldCByaWQgb2YgdGhlIHJlY3Vyc2lvblxuICAgICAgICB2YXIgbmFtZSA9IHRoaXMub3BlbkVsZW1lbnRzLnRvcC5sb2NhbE5hbWU7XG4gICAgICAgIGlmIChbJ2RkJywgJ2R0JywgJ2xpJywgJ29wdGlvbicsICdvcHRncm91cCcsICdwJywgJ3JwJywgJ3J0J10uaW5kZXhPZihuYW1lKSAhPSAtMSAmJiBuYW1lICE9IGV4Y2x1ZGUpIHtcbiAgICAgICAgICAgIHRoaXMucG9wRWxlbWVudCgpO1xuICAgICAgICAgICAgdGhpcy5nZW5lcmF0ZUltcGxpZWRFbmRUYWdzKGV4Y2x1ZGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGVyZm9ybXMgaHR0cDovL3d3dy53aGF0d2cub3JnL3NwZWNzL3dlYi1hcHBzL2N1cnJlbnQtd29yay9tdWx0aXBhZ2UvcGFyc2luZy5odG1sI3JlY29uc3RydWN0LXRoZS1hY3RpdmUtZm9ybWF0dGluZy1lbGVtZW50c1xuICAgICAqL1xuICAgIHJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCkge1xuICAgICAgICAvLyBXaXRoaW4gdGhpcyBhbGdvcml0aG0gdGhlIG9yZGVyIG9mIHN0ZXBzIGRlY3JpYmVkIGluIHRoZSBzcGVjaWZpY2F0aW9uXG4gICAgICAgIC8vIGlzIG5vdCBxdWl0ZSB0aGUgc2FtZSBhcyB0aGUgb3JkZXIgb2Ygc3RlcHMgaW4gdGhlIGNvZGUuIEl0IHNob3VsZCBzdGlsbFxuICAgICAgICAvLyBkbyB0aGUgc2FtZSB0aG91Z2guXG5cbiAgICAgICAgLy8gU3RlcCAxOiBzdG9wIGlmIHRoZXJlJ3Mgbm90aGluZyB0byBkb1xuICAgICAgICBpZiAodGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMubGVuZ3RoID09PSAwKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIC8vIFN0ZXAgMiBhbmQgMzogc3RhcnQgd2l0aCB0aGUgbGFzdCBlbGVtZW50XG4gICAgICAgIHZhciBpID0gdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMubGVuZ3RoIC0gMTtcbiAgICAgICAgdmFyIGVudHJ5ID0gdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHNbaV07XG4gICAgICAgIGlmIChlbnRyeSA9PSBNYXJrZXIgfHwgdGhpcy5vcGVuRWxlbWVudHMuY29udGFpbnMoZW50cnkpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHdoaWxlIChlbnRyeSAhPSBNYXJrZXIgJiYgIXRoaXMub3BlbkVsZW1lbnRzLmNvbnRhaW5zKGVudHJ5KSkge1xuICAgICAgICAgICAgaSAtPSAxO1xuICAgICAgICAgICAgZW50cnkgPSB0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50c1tpXTtcbiAgICAgICAgICAgIGlmICghZW50cnkpXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgaSArPSAxO1xuICAgICAgICAgICAgZW50cnkgPSB0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50c1tpXTtcbiAgICAgICAgICAgIHRoaXMuaW5zZXJ0RWxlbWVudChlbnRyeS5sb2NhbE5hbWUsIGVudHJ5LmF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdmFyIGVsZW1lbnQgPSB0aGlzLmN1cnJlbnRTdGFja0l0ZW0oKTtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzW2ldID0gZWxlbWVudDtcbiAgICAgICAgICAgIGlmIChlbGVtZW50ID09IHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzW3RoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzLmxlbmd0aCAtIDFdKVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RhY2tJdGVtfSBpdGVtXG4gICAgICovXG4gICAgZW5zdXJlTm9haHNBcmtDb25kaXRpb24oaXRlbSkge1xuICAgICAgICB2YXIga05vYWhzQXJrQ2FwYWNpdHkgPSAzO1xuICAgICAgICBpZiAodGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMubGVuZ3RoIDwga05vYWhzQXJrQ2FwYWNpdHkpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciBjYW5kaWRhdGVzID0gW107XG4gICAgICAgIHZhciBuZXdJdGVtQXR0cmlidXRlQ291bnQgPSBpdGVtLmF0dHJpYnV0ZXMubGVuZ3RoO1xuICAgICAgICBmb3IgKHZhciBpID0gdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIHZhciBjYW5kaWRhdGUgPSB0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50c1tpXTtcbiAgICAgICAgICAgIGlmIChjYW5kaWRhdGUgPT09IE1hcmtlcilcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGlmIChpdGVtLmxvY2FsTmFtZSAhPT0gY2FuZGlkYXRlLmxvY2FsTmFtZSB8fCBpdGVtLm5hbWVzcGFjZVVSSSAhPT0gY2FuZGlkYXRlLm5hbWVzcGFjZVVSSSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIGlmIChjYW5kaWRhdGUuYXR0cmlidXRlcy5sZW5ndGggIT0gbmV3SXRlbUF0dHJpYnV0ZUNvdW50KVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgY2FuZGlkYXRlcy5wdXNoKGNhbmRpZGF0ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNhbmRpZGF0ZXMubGVuZ3RoIDwga05vYWhzQXJrQ2FwYWNpdHkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHJlbWFpbmluZ0NhbmRpZGF0ZXMgPSBbXTtcbiAgICAgICAgdmFyIGF0dHJpYnV0ZXMgPSBpdGVtLmF0dHJpYnV0ZXM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXR0cmlidXRlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXNbaV07XG5cbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY2FuZGlkYXRlcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIHZhciBjYW5kaWRhdGUgPSBjYW5kaWRhdGVzW2pdO1xuICAgICAgICAgICAgICAgIHZhciBjYW5kaWRhdGVBdHRyaWJ1dGUgPSBnZXRBdHRyaWJ1dGUoY2FuZGlkYXRlLCBhdHRyaWJ1dGUubm9kZU5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChjYW5kaWRhdGVBdHRyaWJ1dGUgJiYgY2FuZGlkYXRlQXR0cmlidXRlLm5vZGVWYWx1ZSA9PT0gYXR0cmlidXRlLm5vZGVWYWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgcmVtYWluaW5nQ2FuZGlkYXRlcy5wdXNoKGNhbmRpZGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVtYWluaW5nQ2FuZGlkYXRlcy5sZW5ndGggPCBrTm9haHNBcmtDYXBhY2l0eSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBjYW5kaWRhdGVzID0gcmVtYWluaW5nQ2FuZGlkYXRlcztcbiAgICAgICAgICAgIHJlbWFpbmluZ0NhbmRpZGF0ZXMgPSBbXTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJbmR1Y3RpdmVseSwgd2Ugc2hvdWxkbid0IHNwaW4gdGhpcyBsb29wIHZlcnkgbWFueSB0aW1lcy4gSXQncyBwb3NzaWJsZSxcbiAgICAgICAgLy8gaG93ZXZlciwgdGhhdCB3ZSB3aWwgc3BpbiB0aGUgbG9vcCBtb3JlIHRoYW4gb25jZSBiZWNhdXNlIG9mIGhvdyB0aGVcbiAgICAgICAgLy8gZm9ybWF0dGluZyBlbGVtZW50IGxpc3QgZ2V0cyBwZXJtdXRlZC5cbiAgICAgICAgZm9yICh2YXIgaSA9IGtOb2Foc0Fya0NhcGFjaXR5IC0gMTsgaSA8IGNhbmRpZGF0ZXMubGVuZ3RoOyBpKyspXG4gICAgICAgICAgICB0aGlzLnJlbW92ZUVsZW1lbnRGcm9tQWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKGNhbmRpZGF0ZXNbaV0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdGFja0l0ZW19IGl0ZW1cbiAgICAgKi9cbiAgICBhcHBlbmRFbGVtZW50VG9BY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoaXRlbSkge1xuICAgICAgICB0aGlzLmVuc3VyZU5vYWhzQXJrQ29uZGl0aW9uKGl0ZW0pO1xuICAgICAgICB0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cy5wdXNoKGl0ZW0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdGFja0l0ZW19IGl0ZW1cbiAgICAgKi9cbiAgICByZW1vdmVFbGVtZW50RnJvbUFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cyhpdGVtKSB7XG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzLmluZGV4T2YoaXRlbSk7XG4gICAgICAgIGlmIChpbmRleCA+PSAwKVxuICAgICAgICAgICAgdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICB9XG5cbiAgICBlbGVtZW50SW5BY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMobmFtZSkge1xuICAgICAgICB2YXIgZWxzID0gdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHM7XG4gICAgICAgIGZvciAodmFyIGkgPSBlbHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIGlmIChlbHNbaV0gPT0gTWFya2VyKSBicmVhaztcbiAgICAgICAgICAgIGlmIChlbHNbaV0ubG9jYWxOYW1lID09IG5hbWUpIHJldHVybiBlbHNbaV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNsZWFyQWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCkge1xuICAgICAgICB3aGlsZSAoISh0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cy5sZW5ndGggPT09IDAgfHwgdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMucG9wKCkgPT0gTWFya2VyKSk7XG4gICAgfVxuXG4gICAgcmVwYXJlbnRDaGlsZHJlbihvbGRQYXJlbnQsIG5ld1BhcmVudCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWRcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gY29udGV4dCBBIGNvbnRleHQgZWxlbWVudCBuYW1lIGZvciBmcmFnbWVudCBwYXJzaW5nXG4gICAgICovXG4gICAgc2V0RnJhZ21lbnRDb250ZXh0KGNvbnRleHQpIHtcbiAgICAgICAgLy8gU3RlcHMgNC4yLTQuNiBvZiB0aGUgSFRNTDUgRnJhZ21lbnQgQ2FzZSBwYXJzaW5nIGFsZ29yaXRobTpcbiAgICAgICAgLy8gaHR0cDovL3d3dy53aGF0d2cub3JnL3NwZWNzL3dlYi1hcHBzL2N1cnJlbnQtd29yay9tdWx0aXBhZ2UvdGhlLWVuZC5odG1sI2ZyYWdtZW50LWNhc2VcbiAgICAgICAgLy8gRm9yIGVmZmljaWVuY3ksIHdlIHNraXAgc3RlcCA0LjIgKFwiTGV0IHJvb3QgYmUgYSBuZXcgaHRtbCBlbGVtZW50IHdpdGggbm8gYXR0cmlidXRlc1wiKVxuICAgICAgICAvLyBhbmQgaW5zdGVhZCB1c2UgdGhlIERvY3VtZW50RnJhZ21lbnQgYXMgYSByb290IG5vZGUuXG4gICAgICAgIC8vbV90cmVlLm9wZW5FbGVtZW50cygpLT5wdXNoUm9vdE5vZGUoSFRNTFN0YWNrSXRlbTo6Y3JlYXRlKGZyYWdtZW50LCBIVE1MU3RhY2tJdGVtOjpJdGVtRm9yRG9jdW1lbnRGcmFnbWVudE5vZGUpKTtcbiAgICAgICAgdGhpcy5jb250ZXh0ID0gY29udGV4dDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBjb2RlXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFthcmdzXVxuICAgICAqL1xuICAgIHBhcnNlRXJyb3IoY29kZSwgYXJncz8pIHtcbiAgICAgICAgLy8gRklYTUU6IHRoaXMuZXJyb3JzLnB1c2goW3RoaXMudG9rZW5pemVyLnBvc2l0aW9uLCBjb2RlLCBkYXRhXSk7XG4gICAgICAgIGlmICghdGhpcy5lcnJvckhhbmRsZXIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciBtZXNzYWdlID0gZm9ybWF0TWVzc2FnZShtZXNzYWdlc1tjb2RlXSwgYXJncyk7XG4gICAgICAgIHRoaXMuZXJyb3JIYW5kbGVyLmVycm9yKG1lc3NhZ2UsIHRoaXMudG9rZW5pemVyLl9pbnB1dFN0cmVhbS5sb2NhdGlvbigpLCBjb2RlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXNldHMgdGhlIGluc2VydGlvbiBtb2RlIChodHRwOi8vd3d3LndoYXR3Zy5vcmcvc3BlY3Mvd2ViLWFwcHMvY3VycmVudC13b3JrL211bHRpcGFnZS9wYXJzaW5nLmh0bWwjcmVzZXQtdGhlLWluc2VydGlvbi1tb2RlLWFwcHJvcHJpYXRlbHkpXG4gICAgICovXG4gICAgcmVzZXRJbnNlcnRpb25Nb2RlKCkge1xuICAgICAgICB2YXIgbGFzdCA9IGZhbHNlO1xuICAgICAgICB2YXIgbm9kZSA9IG51bGw7XG4gICAgICAgIGZvciAodmFyIGkgPSB0aGlzLm9wZW5FbGVtZW50cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgbm9kZSA9IHRoaXMub3BlbkVsZW1lbnRzLml0ZW0oaSk7XG4gICAgICAgICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIC8vIFRPRE8gYXNzZXJ0Lm9rKHRoaXMuY29udGV4dCk7XG4gICAgICAgICAgICAgICAgbGFzdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgbm9kZSA9IG5ldyBTdGFja0l0ZW0oXCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sXCIsIHRoaXMuY29udGV4dCwgW10sIG51bGwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobm9kZS5uYW1lc3BhY2VVUkkgPT09IFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbFwiKSB7XG4gICAgICAgICAgICAgICAgLy8gVE9ETyB0ZW1wbGF0ZSB0YWdcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5sb2NhbE5hbWUgPT09ICdzZWxlY3QnKVxuICAgICAgICAgICAgICAgICAgICAvLyBGSVhNRSBoYW5kbGUgaW5TZWxlY3RJblRhYmxlXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldEluc2VydGlvbk1vZGUoJ2luU2VsZWN0Jyk7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUubG9jYWxOYW1lID09PSAndGQnIHx8IG5vZGUubG9jYWxOYW1lID09PSAndGgnKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbnNlcnRpb25Nb2RlKCdpbkNlbGwnKTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5sb2NhbE5hbWUgPT09ICd0cicpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldEluc2VydGlvbk1vZGUoJ2luUm93Jyk7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUubG9jYWxOYW1lID09PSAndGJvZHknIHx8IG5vZGUubG9jYWxOYW1lID09PSAndGhlYWQnIHx8IG5vZGUubG9jYWxOYW1lID09PSAndGZvb3QnKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbnNlcnRpb25Nb2RlKCdpblRhYmxlQm9keScpO1xuICAgICAgICAgICAgICAgIGlmIChub2RlLmxvY2FsTmFtZSA9PT0gJ2NhcHRpb24nKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbnNlcnRpb25Nb2RlKCdpbkNhcHRpb24nKTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5sb2NhbE5hbWUgPT09ICdjb2xncm91cCcpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldEluc2VydGlvbk1vZGUoJ2luQ29sdW1uR3JvdXAnKTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5sb2NhbE5hbWUgPT09ICd0YWJsZScpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldEluc2VydGlvbk1vZGUoJ2luVGFibGUnKTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5sb2NhbE5hbWUgPT09ICdoZWFkJyAmJiAhbGFzdClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5zZXJ0aW9uTW9kZSgnaW5IZWFkJyk7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUubG9jYWxOYW1lID09PSAnYm9keScpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldEluc2VydGlvbk1vZGUoJ2luQm9keScpO1xuICAgICAgICAgICAgICAgIGlmIChub2RlLmxvY2FsTmFtZSA9PT0gJ2ZyYW1lc2V0JylcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5zZXJ0aW9uTW9kZSgnaW5GcmFtZXNldCcpO1xuICAgICAgICAgICAgICAgIGlmIChub2RlLmxvY2FsTmFtZSA9PT0gJ2h0bWwnKVxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMub3BlbkVsZW1lbnRzLmhlYWRFbGVtZW50KVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5zZXJ0aW9uTW9kZSgnYmVmb3JlSGVhZCcpO1xuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbnNlcnRpb25Nb2RlKCdhZnRlckhlYWQnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGxhc3QpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5zZXJ0aW9uTW9kZSgnaW5Cb2R5Jyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcm9jZXNzR2VuZXJpY1JDREFUQVN0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgdGhpcy5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB0aGlzLnRva2VuaXplci5zZXRTdGF0ZShUb2tlbml6ZXIuUkNEQVRBKTtcbiAgICAgICAgdGhpcy5vcmlnaW5hbEluc2VydGlvbk1vZGUgPSB0aGlzLmluc2VydGlvbk1vZGVOYW1lO1xuICAgICAgICB0aGlzLnNldEluc2VydGlvbk1vZGUoJ3RleHQnKTtcbiAgICB9XG5cbiAgICBwcm9jZXNzR2VuZXJpY1Jhd1RleHRTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgIHRoaXMuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgdGhpcy50b2tlbml6ZXIuc2V0U3RhdGUoVG9rZW5pemVyLlJBV1RFWFQpO1xuICAgICAgICB0aGlzLm9yaWdpbmFsSW5zZXJ0aW9uTW9kZSA9IHRoaXMuaW5zZXJ0aW9uTW9kZU5hbWU7XG4gICAgICAgIHRoaXMuc2V0SW5zZXJ0aW9uTW9kZSgndGV4dCcpO1xuICAgIH1cblxuICAgIGFkanVzdE1hdGhNTEF0dHJpYnV0ZXMoYXR0cmlidXRlcykge1xuICAgICAgICBhdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgYS5uYW1lc3BhY2VVUkkgPSBcImh0dHA6Ly93d3cudzMub3JnLzE5OTgvTWF0aC9NYXRoTUxcIjtcbiAgICAgICAgICAgIGlmIChNQVRITUxBdHRyaWJ1dGVNYXBbYS5ub2RlTmFtZV0pXG4gICAgICAgICAgICAgICAgYS5ub2RlTmFtZSA9IE1BVEhNTEF0dHJpYnV0ZU1hcFthLm5vZGVOYW1lXTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBhdHRyaWJ1dGVzO1xuICAgIH1cblxuICAgIGFkanVzdFNWR1RhZ05hbWVDYXNlKG5hbWUpIHtcbiAgICAgICAgcmV0dXJuIFNWR1RhZ01hcFtuYW1lXSB8fCBuYW1lO1xuICAgIH1cblxuICAgIGFkanVzdFNWR0F0dHJpYnV0ZXMoYXR0cmlidXRlcykge1xuICAgICAgICBhdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24oYSkge1xuICAgICAgICAgICAgYS5uYW1lc3BhY2VVUkkgPSBcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCI7XG4gICAgICAgICAgICBpZiAoU1ZHQXR0cmlidXRlTWFwW2Eubm9kZU5hbWVdKVxuICAgICAgICAgICAgICAgIGEubm9kZU5hbWUgPSBTVkdBdHRyaWJ1dGVNYXBbYS5ub2RlTmFtZV07XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gYXR0cmlidXRlcztcbiAgICB9XG5cbiAgICBhZGp1c3RGb3JlaWduQXR0cmlidXRlcyhhdHRyaWJ1dGVzKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXR0cmlidXRlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXNbaV07XG4gICAgICAgICAgICB2YXIgYWRqdXN0ZWQgPSBGb3JlaWduQXR0cmlidXRlTWFwW2F0dHJpYnV0ZS5ub2RlTmFtZV07XG4gICAgICAgICAgICBpZiAoYWRqdXN0ZWQpIHtcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGUubm9kZU5hbWUgPSBhZGp1c3RlZC5sb2NhbE5hbWU7XG4gICAgICAgICAgICAgICAgYXR0cmlidXRlLnByZWZpeCA9IGFkanVzdGVkLnByZWZpeDtcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGUubmFtZXNwYWNlVVJJID0gYWRqdXN0ZWQubmFtZXNwYWNlVVJJO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhdHRyaWJ1dGVzO1xuICAgIH1cbn0iXX0=