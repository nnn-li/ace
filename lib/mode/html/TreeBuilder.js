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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVHJlZUJ1aWxkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbW9kZS9odG1sL1RyZWVCdWlsZGVyLnRzIl0sIm5hbWVzIjpbIlRyZWVCdWlsZGVyIiwiVHJlZUJ1aWxkZXIuY29uc3RydWN0b3IiLCJwdWJsaWNJZFN0YXJ0c1dpdGgiLCJUcmVlQnVpbGRlci5zZXRJbnNlcnRpb25Nb2RlIiwiVHJlZUJ1aWxkZXIuYWRvcHRpb25BZ2VuY3lFbmRUYWciLCJUcmVlQnVpbGRlci5hZG9wdGlvbkFnZW5jeUVuZFRhZy5pc0FjdGl2ZUZvcm1hdHRpbmdFbGVtZW50IiwiVHJlZUJ1aWxkZXIuc3RhcnQiLCJUcmVlQnVpbGRlci5zdGFydFRva2VuaXphdGlvbiIsIlRyZWVCdWlsZGVyLnByb2Nlc3NUb2tlbiIsIlRyZWVCdWlsZGVyLmlzQ2RhdGFTZWN0aW9uQWxsb3dlZCIsIlRyZWVCdWlsZGVyLmlzU2VsZkNsb3NpbmdGbGFnQWNrbm93bGVkZ2VkIiwiVHJlZUJ1aWxkZXIuY3JlYXRlRWxlbWVudCIsIlRyZWVCdWlsZGVyLmF0dGFjaE5vZGUiLCJUcmVlQnVpbGRlci5hdHRhY2hOb2RlVG9Gb3N0ZXJQYXJlbnQiLCJUcmVlQnVpbGRlci5kZXRhY2hGcm9tUGFyZW50IiwiVHJlZUJ1aWxkZXIuYWRkQXR0cmlidXRlc1RvRWxlbWVudCIsIlRyZWVCdWlsZGVyLmluc2VydEh0bWxFbGVtZW50IiwiVHJlZUJ1aWxkZXIuaW5zZXJ0SGVhZEVsZW1lbnQiLCJUcmVlQnVpbGRlci5pbnNlcnRCb2R5RWxlbWVudCIsIlRyZWVCdWlsZGVyLmluc2VydEludG9Gb3N0ZXJQYXJlbnQiLCJUcmVlQnVpbGRlci5pbnNlcnRFbGVtZW50IiwiVHJlZUJ1aWxkZXIuaW5zZXJ0Rm9ybWF0dGluZ0VsZW1lbnQiLCJUcmVlQnVpbGRlci5pbnNlcnRTZWxmQ2xvc2luZ0VsZW1lbnQiLCJUcmVlQnVpbGRlci5pbnNlcnRGb3JlaWduRWxlbWVudCIsIlRyZWVCdWlsZGVyLmluc2VydENvbW1lbnQiLCJUcmVlQnVpbGRlci5pbnNlcnREb2N0eXBlIiwiVHJlZUJ1aWxkZXIuaW5zZXJ0VGV4dCIsIlRyZWVCdWlsZGVyLmN1cnJlbnRTdGFja0l0ZW0iLCJUcmVlQnVpbGRlci5wb3BFbGVtZW50IiwiVHJlZUJ1aWxkZXIuc2hvdWxkRm9zdGVyUGFyZW50IiwiVHJlZUJ1aWxkZXIuZ2VuZXJhdGVJbXBsaWVkRW5kVGFncyIsIlRyZWVCdWlsZGVyLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzIiwiVHJlZUJ1aWxkZXIuZW5zdXJlTm9haHNBcmtDb25kaXRpb24iLCJUcmVlQnVpbGRlci5hcHBlbmRFbGVtZW50VG9BY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMiLCJUcmVlQnVpbGRlci5yZW1vdmVFbGVtZW50RnJvbUFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cyIsIlRyZWVCdWlsZGVyLmVsZW1lbnRJbkFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cyIsIlRyZWVCdWlsZGVyLmNsZWFyQWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzIiwiVHJlZUJ1aWxkZXIucmVwYXJlbnRDaGlsZHJlbiIsIlRyZWVCdWlsZGVyLnNldEZyYWdtZW50Q29udGV4dCIsIlRyZWVCdWlsZGVyLnBhcnNlRXJyb3IiLCJUcmVlQnVpbGRlci5yZXNldEluc2VydGlvbk1vZGUiLCJUcmVlQnVpbGRlci5wcm9jZXNzR2VuZXJpY1JDREFUQVN0YXJ0VGFnIiwiVHJlZUJ1aWxkZXIucHJvY2Vzc0dlbmVyaWNSYXdUZXh0U3RhcnRUYWciLCJUcmVlQnVpbGRlci5hZGp1c3RNYXRoTUxBdHRyaWJ1dGVzIiwiVHJlZUJ1aWxkZXIuYWRqdXN0U1ZHVGFnTmFtZUNhc2UiLCJUcmVlQnVpbGRlci5hZGp1c3RTVkdBdHRyaWJ1dGVzIiwiVHJlZUJ1aWxkZXIuYWRqdXN0Rm9yZWlnbkF0dHJpYnV0ZXMiXSwibWFwcGluZ3MiOiJPQUFPLEVBQUMsbUJBQW1CLEVBQUUsa0JBQWtCLEVBQUUsZUFBZSxFQUFF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QUFFQSxLQUFLQSxpQkFBaUJBLENBQUNBO1FBQ3BDQSxDQUFDQTtRQUVERCxJQUFJQSxnQkFBZ0JBLEdBQUdBLENBQUNBLENBQUNBO1FBRXpCQSxPQUFPQSxnQkFBZ0JBLEVBQUVBLEdBQUdBLG1CQUFtQkEsRUFBRUEsQ0FBQ0E7WUFFOUNBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUNBQWlDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUVqRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsaUJBQWlCQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxRQUFRQSxDQUFDQSxpQkFBaUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25JQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxxQkFBcUJBLEVBQUVBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBO2dCQUN2REEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDakJBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLFFBQVFBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pEQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxxQkFBcUJBLEVBQUVBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBO2dCQUN2REEsSUFBSUEsQ0FBQ0EseUNBQXlDQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBO2dCQUNsRUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsU0FBU0EsQ0FB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QkEsQ0FBQ0E7Z0JBQ3JEQSxRQUFRQSxDQUFDQTtZQUNiQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUMvQkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsR0FBR0EsaUJBQWlCQSxDQUFDQTtZQUN0Q0EsTUFBTUEsQ0FBQ0E7UUFFWEEsSUFBSUEsbUJBQW1CQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUM3QkEsSUFBSUEsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFDakNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFVBQVVBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3pDQSxJQUFJQSxTQUFTQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUU5QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQ3pDQSxJQUFJQSxTQUFTQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOUJBLElBQUlBLGtCQUFrQkEsR0FBR0EsWUFBWUEsQ0FBQ0EsU0FBU0EsRUFBRUEsU0FBU0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JFQSxFQUFFQSxDQUFDQSxDQUFDQSxrQkFBa0JBLElBQUlBLGtCQUFrQkEsQ0FBQ0EsU0FBU0EsS0FBS0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0E7b0JBQzNFQSxtQkFBbUJBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQzVDQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxtQkFBbUJBLENBQUNBLE1BQU1BLEdBQUdBLGlC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LEVBQUVBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFlBQVlBLENBQUNBLFFBQVFBLEVBQUVBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQ25GQSxDQUFDQTtJQUtEdkMsa0JBQWtCQTtRQUNkd0MsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDakJBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2hCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUNyREEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUVWQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDWkEsSUFBSUEsR0FBR0EsSUFBSUEsU0FBU0EsQ0FBQ0EsOEJBQThCQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxFQUFFQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNqRkEsQ0FBQ0E7WUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsS0FBS0EsOEJBQThCQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFFdkRBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLFFBQVFBLENBQUNBO29CQUU1QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtnQkFDN0NBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLElBQUlBLENBQUNBO29CQUNuREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFDM0NBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLElBQUlBLENBQUNBO29CQUN4QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtnQkFDMUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLE9BQU9BLElBQUlBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLE9BQU9BLElBQUlBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLE9BQU9BLENBQUNBO29CQUN2RkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtnQkFDaERBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLFNBQVNBLENBQUNBO29CQUM3QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtnQkFDOUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLFVBQVVBLENBQUNBO29CQUM5QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQTtnQkFDbERBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLE9BQU9BLENBQUNBO29CQUMzQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtnQkFDNUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEtBQUtBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLENBQUNBO29CQUNuQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxR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ZUFBZSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDNUIsQ0FBQyxDQUFDLFFBQVEsR0FBRyxlQUFlLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2pELENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDSEEsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7SUFDdEJBLENBQUNBO0lBRUQ3Qyx1QkFBdUJBLENBQUNBLFVBQVVBO1FBQzlCOEMsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDekNBLElBQUlBLFNBQVNBLEdBQUdBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzlCQSxJQUFJQSxRQUFRQSxHQUFHQSxtQkFBbUJBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBQ3ZEQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWEEsU0FBU0EsQ0FBQ0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7Z0JBQ3hDQSxTQUFTQSxDQUFDQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQTtnQkFDbkNBLFNBQVNBLENBQUNBLFlBQVlBLEdBQUdBLFFBQVFBLENBQUNBLFlBQVlBLENBQUNBO1lBQ25EQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQTtJQUN0QkEsQ0FBQ0E7QUFDTDlDLENBQUNBO0FBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0ZvcmVpZ25BdHRyaWJ1dGVNYXAsIE1BVEhNTEF0dHJpYnV0ZU1hcCwgU1ZHQXR0cmlidXRlTWFwLCBTVkdUYWdNYXB9IGZyb20gJy4vY29uc3RhbnRzJztcbmltcG9ydCBDaGFyYWN0ZXJCdWZmZXIgZnJvbSAnLi9DaGFyYWN0ZXJCdWZmZXInO1xuaW1wb3J0IEVsZW1lbnRTdGFjayBmcm9tICcuL0VsZW1lbnRTdGFjayc7XG5pbXBvcnQgZm9ybWF0TWVzc2FnZSBmcm9tICcuL2Zvcm1hdE1lc3NhZ2UnO1xuaW1wb3J0IGdldEF0dHJpYnV0ZSBmcm9tICcuL2dldEF0dHJpYnV0ZSc7XG5pbXBvcnQgaXNXaGl0ZXNwYWNlIGZyb20gJy4vaXNXaGl0ZXNwYWNlJztcbmltcG9ydCBpc0FsbFdoaXRlc3BhY2UgZnJvbSAnLi9pc0FsbFdoaXRlc3BhY2UnO1xuaW1wb3J0IGlzQWxsV2hpdGVzcGFjZU9yUmVwbGFjZW1lbnRDaGFyYWN0ZXJzIGZyb20gJy4vaXNBbGxXaGl0ZXNwYWNlT3JSZXBsYWNlbWVudENoYXJhY3RlcnMnO1xuaW1wb3J0IG1lc3NhZ2VzIGZyb20gJy4vbWVzc2FnZXMnO1xuaW1wb3J0IE1vZGVzIGZyb20gJy4vTW9kZXMnO1xuaW1wb3J0IFN0YWNrSXRlbSBmcm9tICcuL1N0YWNrSXRlbSc7XG5pbXBvcnQgVG9rZW5pemVyIGZyb20gJy4vVG9rZW5pemVyJztcblxudmFyIE1hcmtlciA9IHt9O1xuXG4vKipcbiAqXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFRyZWVCdWlsZGVyIHtcbiAgICBhY3RpdmVGb3JtYXR0aW5nRWxlbWVudHM7XG4gICAgY29tcGF0TW9kZTogc3RyaW5nO1xuICAgIGNvbnRleHQ6IHN0cmluZztcbiAgICBkb2N1bWVudDtcbiAgICBlcnJvckhhbmRsZXI7XG4gICAgZm9ybTtcbiAgICBmcmFtZXNldE9rOiBib29sZWFuO1xuICAgIGhlYWQ7XG4gICAgaW5RdWlya3NNb2RlOiBib29sZWFuO1xuICAgIGluc2VydGlvbk1vZGU7XG4gICAgaW5zZXJ0aW9uTW9kZU5hbWU7XG4gICAgaW5zZXJ0aW9uTW9kZXM6IE1vZGVzO1xuICAgIG9wZW5FbGVtZW50cztcbiAgICBvcmlnaW5hbEluc2VydGlvbk1vZGU7XG4gICAgcGVuZGluZ1RhYmxlQ2hhcmFjdGVyc1xuICAgIHJlZGlyZWN0QXR0YWNoVG9Gb3N0ZXJQYXJlbnQ6IGJvb2xlYW47XG4gICAgdG9rZW5pemVyO1xuICAgIHNlbGZDbG9zaW5nRmxhZ0Fja25vd2xlZGdlZDogYm9vbGVhbjtcbiAgICBzY3JpcHRpbmdFbmFibGVkOiBib29sZWFuO1xuICAgIHNob3VsZFNraXBMZWFkaW5nTmV3bGluZTtcblxuICAgIC8qKlxuICAgICAqXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMudG9rZW5pemVyID0gbnVsbDtcbiAgICAgICAgdGhpcy5lcnJvckhhbmRsZXIgPSBudWxsO1xuICAgICAgICB0aGlzLnNjcmlwdGluZ0VuYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5kb2N1bWVudCA9IG51bGw7XG4gICAgICAgIHRoaXMuaGVhZCA9IG51bGw7XG4gICAgICAgIHRoaXMuZm9ybSA9IG51bGw7XG4gICAgICAgIHRoaXMub3BlbkVsZW1lbnRzID0gbmV3IEVsZW1lbnRTdGFjaygpO1xuICAgICAgICB0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cyA9IFtdO1xuICAgICAgICB0aGlzLmluc2VydGlvbk1vZGUgPSBudWxsO1xuICAgICAgICB0aGlzLmluc2VydGlvbk1vZGVOYW1lID0gXCJcIjtcbiAgICAgICAgdGhpcy5vcmlnaW5hbEluc2VydGlvbk1vZGUgPSBcIlwiO1xuICAgICAgICB0aGlzLmluUXVpcmtzTW9kZSA9IGZhbHNlOyAvLyBUT0RPIHF1aXJrcyBtb2RlXG4gICAgICAgIHRoaXMuY29tcGF0TW9kZSA9IFwibm8gcXVpcmtzXCI7XG4gICAgICAgIHRoaXMuZnJhbWVzZXRPayA9IHRydWU7XG4gICAgICAgIHRoaXMucmVkaXJlY3RBdHRhY2hUb0Zvc3RlclBhcmVudCA9IGZhbHNlO1xuICAgICAgICB0aGlzLnNlbGZDbG9zaW5nRmxhZ0Fja25vd2xlZGdlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmNvbnRleHQgPSBcIlwiO1xuICAgICAgICB0aGlzLnBlbmRpbmdUYWJsZUNoYXJhY3RlcnMgPSBbXTtcbiAgICAgICAgdGhpcy5zaG91bGRTa2lwTGVhZGluZ05ld2xpbmUgPSBmYWxzZTtcblxuICAgICAgICB2YXIgdHJlZSA9IHRoaXM7XG4gICAgICAgIHZhciBtb2RlczogTW9kZXMgPSB0aGlzLmluc2VydGlvbk1vZGVzID0gPE1vZGVzPnt9O1xuICAgICAgICBtb2Rlcy5iYXNlID0ge1xuICAgICAgICAgICAgZW5kX3RhZ19oYW5kbGVyczogeyBcIi1kZWZhdWx0XCI6ICdlbmRUYWdPdGhlcicgfSxcbiAgICAgICAgICAgIHN0YXJ0X3RhZ19oYW5kbGVyczogeyBcIi1kZWZhdWx0XCI6ICdzdGFydFRhZ090aGVyJyB9LFxuICAgICAgICAgICAgcHJvY2Vzc0VPRjogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5nZW5lcmF0ZUltcGxpZWRFbmRUYWdzKCk7XG4gICAgICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdleHBlY3RlZC1jbG9zaW5nLXRhZy1idXQtZ290LWVvZicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHJlZS5vcGVuRWxlbWVudHMubGVuZ3RoID09IDIgJiZcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMuaXRlbSgxKS5sb2NhbE5hbWUgIT0gJ2JvZHknKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgaGFwcGVucyBmb3IgZnJhbWVzZXRzIG9yIHNvbWV0aGluZz9cbiAgICAgICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdleHBlY3RlZC1jbG9zaW5nLXRhZy1idXQtZ290LWVvZicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHJlZS5jb250ZXh0ICYmIHRyZWUub3BlbkVsZW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gWFhYIFRoaXMgaXMgbm90IHdoYXQgdGhlIHNwZWNpZmljYXRpb24gc2F5cy4gTm90IHN1cmUgd2hhdCB0byBkbyBoZXJlLlxuICAgICAgICAgICAgICAgICAgICAvL3RyZWUucGFyc2VFcnJvcignZW9mLWluLWlubmVyaHRtbCcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwcm9jZXNzQ29tbWVudDogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgICAgIC8vIEZvciBtb3N0IHBoYXNlcyB0aGUgZm9sbG93aW5nIGlzIGZvcmNlUXVpcmtzLiBXaGVyZSBpdCdzIG5vdCBpdCB3aWxsIGJlXG4gICAgICAgICAgICAgICAgLy8gb3ZlcnJpZGRlbi5cbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydENvbW1lbnQoZGF0YSwgdHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubm9kZSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcHJvY2Vzc0RvY3R5cGU6IGZ1bmN0aW9uKG5hbWUsIHB1YmxpY0lkLCBzeXN0ZW1JZCwgZm9yY2VRdWlya3MpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZG9jdHlwZScpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByb2Nlc3NTdGFydFRhZzogZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpc1t0aGlzLnN0YXJ0X3RhZ19oYW5kbGVyc1tuYW1lXV0pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpc1t0aGlzLnN0YXJ0X3RhZ19oYW5kbGVyc1tuYW1lXV0obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpc1t0aGlzLnN0YXJ0X3RhZ19oYW5kbGVyc1tcIi1kZWZhdWx0XCJdXSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzW3RoaXMuc3RhcnRfdGFnX2hhbmRsZXJzW1wiLWRlZmF1bHRcIl1dKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyAobmV3IEVycm9yKFwiTm8gaGFuZGxlciBmb3VuZCBmb3IgXCIgKyBuYW1lKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByb2Nlc3NFbmRUYWc6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpc1t0aGlzLmVuZF90YWdfaGFuZGxlcnNbbmFtZV1dKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXNbdGhpcy5lbmRfdGFnX2hhbmRsZXJzW25hbWVdXShuYW1lKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXNbdGhpcy5lbmRfdGFnX2hhbmRsZXJzW1wiLWRlZmF1bHRcIl1dKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXNbdGhpcy5lbmRfdGFnX2hhbmRsZXJzW1wiLWRlZmF1bHRcIl1dKG5hbWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IChuZXcgRXJyb3IoXCJObyBoYW5kbGVyIGZvdW5kIGZvciBcIiArIG5hbWUpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc3RhcnRUYWdIdG1sOiBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnSHRtbChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbml0aWFsID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5pbml0aWFsLnByb2Nlc3NFT0YgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcImV4cGVjdGVkLWRvY3R5cGUtYnV0LWdvdC1lb2ZcIik7XG4gICAgICAgICAgICB0aGlzLmFueXRoaW5nRWxzZSgpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFT0YoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbml0aWFsLnByb2Nlc3NDb21tZW50ID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRDb21tZW50KGRhdGEsIHRyZWUuZG9jdW1lbnQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluaXRpYWwucHJvY2Vzc0RvY3R5cGUgPSBmdW5jdGlvbihuYW1lLCBwdWJsaWNJZCwgc3lzdGVtSWQsIGZvcmNlUXVpcmtzKSB7XG4gICAgICAgICAgICB0cmVlLmluc2VydERvY3R5cGUobmFtZSB8fCAnJywgcHVibGljSWQgfHwgJycsIHN5c3RlbUlkIHx8ICcnKTtcblxuICAgICAgICAgICAgaWYgKGZvcmNlUXVpcmtzIHx8IG5hbWUgIT0gJ2h0bWwnIHx8IChwdWJsaWNJZCAhPSBudWxsICYmIChbXG4gICAgICAgICAgICAgICAgXCIrLy9zaWxtYXJpbC8vZHRkIGh0bWwgcHJvIHYwcjExIDE5OTcwMTAxLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2FkdmFzb2Z0IGx0ZC8vZHRkIGh0bWwgMy4wIGFzd2VkaXQgKyBleHRlbnNpb25zLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2FzLy9kdGQgaHRtbCAzLjAgYXN3ZWRpdCArIGV4dGVuc2lvbnMvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgMi4wIGxldmVsIDEvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgMi4wIGxldmVsIDIvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgMi4wIHN0cmljdCBsZXZlbCAxLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIDIuMCBzdHJpY3QgbGV2ZWwgMi8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCAyLjAgc3RyaWN0Ly9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIDIuMC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCAyLjFlLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIDMuMC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCAzLjAvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgMy4yIGZpbmFsLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIDMuMi8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCAzLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIGxldmVsIDAvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgbGV2ZWwgMC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBsZXZlbCAxLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIGxldmVsIDEvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgbGV2ZWwgMi8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBsZXZlbCAyLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIGxldmVsIDMvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgbGV2ZWwgMy8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBzdHJpY3QgbGV2ZWwgMC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBzdHJpY3QgbGV2ZWwgMC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBzdHJpY3QgbGV2ZWwgMS8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBzdHJpY3QgbGV2ZWwgMS8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBzdHJpY3QgbGV2ZWwgMi8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBzdHJpY3QgbGV2ZWwgMi8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBzdHJpY3QgbGV2ZWwgMy8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBzdHJpY3QgbGV2ZWwgMy8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbCBzdHJpY3QvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vaWV0Zi8vZHRkIGh0bWwgc3RyaWN0Ly9cIixcbiAgICAgICAgICAgICAgICBcIi0vL2lldGYvL2R0ZCBodG1sIHN0cmljdC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9pZXRmLy9kdGQgaHRtbC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9tZXRyaXVzLy9kdGQgbWV0cml1cyBwcmVzZW50YXRpb25hbC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9taWNyb3NvZnQvL2R0ZCBpbnRlcm5ldCBleHBsb3JlciAyLjAgaHRtbCBzdHJpY3QvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vbWljcm9zb2Z0Ly9kdGQgaW50ZXJuZXQgZXhwbG9yZXIgMi4wIGh0bWwvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vbWljcm9zb2Z0Ly9kdGQgaW50ZXJuZXQgZXhwbG9yZXIgMi4wIHRhYmxlcy8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9taWNyb3NvZnQvL2R0ZCBpbnRlcm5ldCBleHBsb3JlciAzLjAgaHRtbCBzdHJpY3QvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vbWljcm9zb2Z0Ly9kdGQgaW50ZXJuZXQgZXhwbG9yZXIgMy4wIGh0bWwvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vbWljcm9zb2Z0Ly9kdGQgaW50ZXJuZXQgZXhwbG9yZXIgMy4wIHRhYmxlcy8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9uZXRzY2FwZSBjb21tLiBjb3JwLi8vZHRkIGh0bWwvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vbmV0c2NhcGUgY29tbS4gY29ycC4vL2R0ZCBzdHJpY3QgaHRtbC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9vJ3JlaWxseSBhbmQgYXNzb2NpYXRlcy8vZHRkIGh0bWwgMi4wLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL28ncmVpbGx5IGFuZCBhc3NvY2lhdGVzLy9kdGQgaHRtbCBleHRlbmRlZCAxLjAvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vc3B5Z2xhc3MvL2R0ZCBodG1sIDIuMCBleHRlbmRlZC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9zcS8vZHRkIGh0bWwgMi4wIGhvdG1ldGFsICsgZXh0ZW5zaW9ucy8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy9zdW4gbWljcm9zeXN0ZW1zIGNvcnAuLy9kdGQgaG90amF2YSBodG1sLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL3N1biBtaWNyb3N5c3RlbXMgY29ycC4vL2R0ZCBob3RqYXZhIHN0cmljdCBodG1sLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL3czYy8vZHRkIGh0bWwgMyAxOTk1LTAzLTI0Ly9cIixcbiAgICAgICAgICAgICAgICBcIi0vL3czYy8vZHRkIGh0bWwgMy4yIGRyYWZ0Ly9cIixcbiAgICAgICAgICAgICAgICBcIi0vL3czYy8vZHRkIGh0bWwgMy4yIGZpbmFsLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL3czYy8vZHRkIGh0bWwgMy4yLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL3czYy8vZHRkIGh0bWwgMy4ycyBkcmFmdC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy93M2MvL2R0ZCBodG1sIDQuMCBmcmFtZXNldC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy93M2MvL2R0ZCBodG1sIDQuMCB0cmFuc2l0aW9uYWwvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vdzNjLy9kdGQgaHRtbCBleHBlcmltZW50YWwgMTk5NjA3MTIvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vdzNjLy9kdGQgaHRtbCBleHBlcmltZW50YWwgOTcwNDIxLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL3czYy8vZHRkIHczIGh0bWwvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vdzNvLy9kdGQgdzMgaHRtbCAzLjAvL1wiLFxuICAgICAgICAgICAgICAgIFwiLS8vd2VidGVjaHMvL2R0ZCBtb3ppbGxhIGh0bWwgMi4wLy9cIixcbiAgICAgICAgICAgICAgICBcIi0vL3dlYnRlY2hzLy9kdGQgbW96aWxsYSBodG1sLy9cIixcbiAgICAgICAgICAgICAgICBcImh0bWxcIlxuICAgICAgICAgICAgXS5zb21lKHB1YmxpY0lkU3RhcnRzV2l0aClcbiAgICAgICAgICAgICAgICB8fCBbXG4gICAgICAgICAgICAgICAgICAgIFwiLS8vdzNvLy9kdGQgdzMgaHRtbCBzdHJpY3QgMy4wLy9lbi8vXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiLS93M2MvZHRkIGh0bWwgNC4wIHRyYW5zaXRpb25hbC9lblwiLFxuICAgICAgICAgICAgICAgICAgICBcImh0bWxcIlxuICAgICAgICAgICAgICAgIF0uaW5kZXhPZihwdWJsaWNJZC50b0xvd2VyQ2FzZSgpKSA+IC0xXG4gICAgICAgICAgICAgICAgfHwgKHN5c3RlbUlkID09IG51bGwgJiYgW1xuICAgICAgICAgICAgICAgICAgICBcIi0vL3czYy8vZHRkIGh0bWwgNC4wMSB0cmFuc2l0aW9uYWwvL1wiLFxuICAgICAgICAgICAgICAgICAgICBcIi0vL3czYy8vZHRkIGh0bWwgNC4wMSBmcmFtZXNldC8vXCJcbiAgICAgICAgICAgICAgICBdLnNvbWUocHVibGljSWRTdGFydHNXaXRoKSkpXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgfHwgKHN5c3RlbUlkICE9IG51bGwgJiYgKHN5c3RlbUlkLnRvTG93ZXJDYXNlKCkgPT0gXCJodHRwOi8vd3d3LmlibS5jb20vZGF0YS9kdGQvdjExL2libXhodG1sMS10cmFuc2l0aW9uYWwuZHRkXCIpKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5jb21wYXRNb2RlID0gXCJxdWlya3NcIjtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJxdWlya3ktZG9jdHlwZVwiKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHVibGljSWQgIT0gbnVsbCAmJiAoW1xuICAgICAgICAgICAgICAgIFwiLS8vdzNjLy9kdGQgeGh0bWwgMS4wIHRyYW5zaXRpb25hbC8vXCIsXG4gICAgICAgICAgICAgICAgXCItLy93M2MvL2R0ZCB4aHRtbCAxLjAgZnJhbWVzZXQvL1wiXG4gICAgICAgICAgICBdLnNvbWUocHVibGljSWRTdGFydHNXaXRoKVxuICAgICAgICAgICAgICAgIHx8IChzeXN0ZW1JZCAhPSBudWxsICYmIFtcbiAgICAgICAgICAgICAgICAgICAgXCItLy93M2MvL2R0ZCBodG1sIDQuMDEgdHJhbnNpdGlvbmFsLy9cIixcbiAgICAgICAgICAgICAgICAgICAgXCItLy93M2MvL2R0ZCBodG1sIDQuMDEgZnJhbWVzZXQvL1wiXG4gICAgICAgICAgICAgICAgXS5pbmRleE9mKHB1YmxpY0lkLnRvTG93ZXJDYXNlKCkpID4gLTEpKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5jb21wYXRNb2RlID0gXCJsaW1pdGVkIHF1aXJrc1wiO1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcImFsbW9zdC1zdGFuZGFyZHMtZG9jdHlwZVwiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKChwdWJsaWNJZCA9PSBcIi0vL1czQy8vRFREIEhUTUwgNC4wLy9FTlwiICYmIChzeXN0ZW1JZCA9PSBudWxsIHx8IHN5c3RlbUlkID09IFwiaHR0cDovL3d3dy53My5vcmcvVFIvUkVDLWh0bWw0MC9zdHJpY3QuZHRkXCIpKVxuICAgICAgICAgICAgICAgICAgICB8fCAocHVibGljSWQgPT0gXCItLy9XM0MvL0RURCBIVE1MIDQuMDEvL0VOXCIgJiYgKHN5c3RlbUlkID09IG51bGwgfHwgc3lzdGVtSWQgPT0gXCJodHRwOi8vd3d3LnczLm9yZy9UUi9odG1sNC9zdHJpY3QuZHRkXCIpKVxuICAgICAgICAgICAgICAgICAgICB8fCAocHVibGljSWQgPT0gXCItLy9XM0MvL0RURCBYSFRNTCAxLjAgU3RyaWN0Ly9FTlwiICYmIChzeXN0ZW1JZCA9PSBcImh0dHA6Ly93d3cudzMub3JnL1RSL3hodG1sMS9EVEQveGh0bWwxLXN0cmljdC5kdGRcIikpXG4gICAgICAgICAgICAgICAgICAgIHx8IChwdWJsaWNJZCA9PSBcIi0vL1czQy8vRFREIFhIVE1MIDEuMS8vRU5cIiAmJiAoc3lzdGVtSWQgPT0gXCJodHRwOi8vd3d3LnczLm9yZy9UUi94aHRtbDExL0RURC94aHRtbDExLmR0ZFwiKSlcbiAgICAgICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gd2FybmluZ1xuICAgICAgICAgICAgICAgICAgICAvL3RyZWUud2FybihcIm9ic29sZXRlLWRvY3R5cGVcIik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICghKChzeXN0ZW1JZCA9PSBudWxsIHx8IHN5c3RlbUlkID09IFwiYWJvdXQ6bGVnYWN5LWNvbXBhdFwiKSAmJiBwdWJsaWNJZCA9PSBudWxsKSkge1xuICAgICAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmtub3duLWRvY3R5cGVcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdiZWZvcmVIVE1MJyk7XG4gICAgICAgICAgICBmdW5jdGlvbiBwdWJsaWNJZFN0YXJ0c1dpdGgoc3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHB1YmxpY0lkLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihzdHJpbmcpID09PSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluaXRpYWwucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgICAgICAgIGJ1ZmZlci5za2lwTGVhZGluZ1doaXRlc3BhY2UoKTtcbiAgICAgICAgICAgIGlmICghYnVmZmVyLmxlbmd0aClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2V4cGVjdGVkLWRvY3R5cGUtYnV0LWdvdC1jaGFycycpO1xuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzQ2hhcmFjdGVycyhidWZmZXIpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluaXRpYWwucHJvY2Vzc1N0YXJ0VGFnID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcignZXhwZWN0ZWQtZG9jdHlwZS1idXQtZ290LXN0YXJ0LXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbml0aWFsLnByb2Nlc3NFbmRUYWcgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2V4cGVjdGVkLWRvY3R5cGUtYnV0LWdvdC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluaXRpYWwuYW55dGhpbmdFbHNlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0cmVlLmNvbXBhdE1vZGUgPSAncXVpcmtzJztcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnYmVmb3JlSFRNTCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhUTUwgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhUTUwuc3RhcnRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgaHRtbDogJ3N0YXJ0VGFnSHRtbCcsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnc3RhcnRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5iZWZvcmVIVE1MLnByb2Nlc3NFT0YgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VPRigpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhUTUwucHJvY2Vzc0NvbW1lbnQgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICB0cmVlLmluc2VydENvbW1lbnQoZGF0YSwgdHJlZS5kb2N1bWVudCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYmVmb3JlSFRNTC5wcm9jZXNzQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKGJ1ZmZlcikge1xuICAgICAgICAgICAgYnVmZmVyLnNraXBMZWFkaW5nV2hpdGVzcGFjZSgpO1xuICAgICAgICAgICAgaWYgKCFidWZmZXIubGVuZ3RoKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0NoYXJhY3RlcnMoYnVmZmVyKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5iZWZvcmVIVE1MLnN0YXJ0VGFnSHRtbCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICB0cmVlLmluc2VydEh0bWxFbGVtZW50KGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdiZWZvcmVIZWFkJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYmVmb3JlSFRNTC5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5iZWZvcmVIVE1MLnByb2Nlc3NFbmRUYWcgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0aGlzLmFueXRoaW5nRWxzZSgpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYmVmb3JlSFRNTC5hbnl0aGluZ0Vsc2UgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0SHRtbEVsZW1lbnQoKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnYmVmb3JlSGVhZCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQWZ0ZXJCb2R5ID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5hZnRlckFmdGVyQm9keS5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdzdGFydFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQWZ0ZXJCb2R5LnByb2Nlc3NDb21tZW50ID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRDb21tZW50KGRhdGEsIHRyZWUuZG9jdW1lbnQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQWZ0ZXJCb2R5LnByb2Nlc3NEb2N0eXBlID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnByb2Nlc3NEb2N0eXBlKGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQWZ0ZXJCb2R5LnN0YXJ0VGFnSHRtbCA9IGZ1bmN0aW9uKGRhdGEsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ0h0bWwoZGF0YSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJBZnRlckJvZHkuc3RhcnRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtc3RhcnQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpbkJvZHknKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQWZ0ZXJCb2R5LmVuZFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luQm9keScpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJBZnRlckJvZHkucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICBpZiAoIWlzQWxsV2hpdGVzcGFjZShkYXRhLmNoYXJhY3RlcnMpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWNoYXItYWZ0ZXItYm9keScpO1xuICAgICAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5Cb2R5Jyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzQ2hhcmFjdGVycyhkYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1vZGVzLmluQm9keS5wcm9jZXNzQ2hhcmFjdGVycyhkYXRhKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckJvZHkgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQm9keS5lbmRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgaHRtbDogJ2VuZFRhZ0h0bWwnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ2VuZFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQm9keS5wcm9jZXNzQ29tbWVudCA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIC8vIFRoaXMgaXMgbmVlZGVkIGJlY2F1c2UgZGF0YSBpcyB0byBiZSBhcHBlbmRlZCB0byB0aGUgaHRtbCBlbGVtZW50IGhlcmVcbiAgICAgICAgICAgIC8vIGFuZCBub3QgdG8gd2hhdGV2ZXIgaXMgY3VycmVudGx5IG9wZW4uXG4gICAgICAgICAgICB0cmVlLmluc2VydENvbW1lbnQoZGF0YSwgdHJlZS5vcGVuRWxlbWVudHMucm9vdE5vZGUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQm9keS5wcm9jZXNzQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIGlmICghaXNBbGxXaGl0ZXNwYWNlKGRhdGEuY2hhcmFjdGVycykpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtY2hhci1hZnRlci1ib2R5Jyk7XG4gICAgICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpbkJvZHknKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NDaGFyYWN0ZXJzKGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnByb2Nlc3NDaGFyYWN0ZXJzKGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQm9keS5wcm9jZXNzU3RhcnRUYWcgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLXN0YXJ0LXRhZy1hZnRlci1ib2R5JywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpbkJvZHknKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQm9keS5lbmRUYWdIdG1sID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKHRyZWUuY29udGV4dCkge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcignZW5kLWh0bWwtaW4taW5uZXJodG1sJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIFhYWCBUaGlzIG1heSBuZWVkIHRvIGJlIGRvbmUsIG5vdCBzdXJlXG4gICAgICAgICAgICAgICAgLy8gRG9uJ3Qgc2V0IGxhc3RfcGhhc2UgdG8gdGhlIGN1cnJlbnQgcGhhc2UgYnV0IHRvIHRoZSBpbkJvZHkgcGhhc2VcbiAgICAgICAgICAgICAgICAvLyBpbnN0ZWFkLiBObyBuZWVkIGZvciBleHRyYSBwYXJzZUVycm9ycyBpZiB0aGVyZSdzIHNvbWV0aGluZyBhZnRlclxuICAgICAgICAgICAgICAgIC8vIDwvaHRtbD4uXG4gICAgICAgICAgICAgICAgLy8gVHJ5IDwhZG9jdHlwZSBodG1sPlg8L2h0bWw+WCBmb3IgaW5zdGFuY2VcbiAgICAgICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2FmdGVyQWZ0ZXJCb2R5Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJCb2R5LmVuZFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWctYWZ0ZXItYm9keScsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5Cb2R5Jyk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckZyYW1lc2V0ID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5hZnRlckZyYW1lc2V0LnN0YXJ0X3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGh0bWw6ICdzdGFydFRhZ0h0bWwnLFxuICAgICAgICAgICAgbm9mcmFtZXM6ICdzdGFydFRhZ05vZnJhbWVzJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdzdGFydFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyRnJhbWVzZXQuZW5kX3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGh0bWw6ICdlbmRUYWdIdG1sJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdlbmRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckZyYW1lc2V0LnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgY2hhcmFjdGVycyA9IGJ1ZmZlci50YWtlUmVtYWluaW5nKCk7XG4gICAgICAgICAgICB2YXIgd2hpdGVzcGFjZSA9IFwiXCI7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNoYXJhY3RlcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgY2ggPSBjaGFyYWN0ZXJzW2ldO1xuICAgICAgICAgICAgICAgIGlmIChpc1doaXRlc3BhY2UoY2gpKVxuICAgICAgICAgICAgICAgICAgICB3aGl0ZXNwYWNlICs9IGNoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHdoaXRlc3BhY2UpIHtcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydFRleHQod2hpdGVzcGFjZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAod2hpdGVzcGFjZS5sZW5ndGggPCBjaGFyYWN0ZXJzLmxlbmd0aClcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2V4cGVjdGVkLWVvZi1idXQtZ290LWNoYXInKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckZyYW1lc2V0LnN0YXJ0VGFnTm9mcmFtZXMgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBtb2Rlcy5pbkhlYWQucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyRnJhbWVzZXQuc3RhcnRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtc3RhcnQtdGFnLWFmdGVyLWZyYW1lc2V0XCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckZyYW1lc2V0LmVuZFRhZ0h0bWwgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2FmdGVyQWZ0ZXJGcmFtZXNldCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyRnJhbWVzZXQuZW5kVGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWVuZC10YWctYWZ0ZXItZnJhbWVzZXRcIiwgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhlYWQgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhlYWQuc3RhcnRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgaHRtbDogJ3N0YXJ0VGFnSHRtbCcsXG4gICAgICAgICAgICBoZWFkOiAnc3RhcnRUYWdIZWFkJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdzdGFydFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhlYWQuZW5kX3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGh0bWw6ICdlbmRUYWdJbXBseUhlYWQnLFxuICAgICAgICAgICAgaGVhZDogJ2VuZFRhZ0ltcGx5SGVhZCcsXG4gICAgICAgICAgICBib2R5OiAnZW5kVGFnSW1wbHlIZWFkJyxcbiAgICAgICAgICAgIGJyOiAnZW5kVGFnSW1wbHlIZWFkJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdlbmRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5iZWZvcmVIZWFkLnByb2Nlc3NFT0YgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRUYWdIZWFkKCdoZWFkJywgW10pO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFT0YoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5iZWZvcmVIZWFkLnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gICAgICAgICAgICBidWZmZXIuc2tpcExlYWRpbmdXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICBpZiAoIWJ1ZmZlci5sZW5ndGgpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy5zdGFydFRhZ0hlYWQoJ2hlYWQnLCBbXSk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0NoYXJhY3RlcnMoYnVmZmVyKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5iZWZvcmVIZWFkLnN0YXJ0VGFnSGVhZCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0SGVhZEVsZW1lbnQoYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luSGVhZCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhlYWQuc3RhcnRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0VGFnSGVhZCgnaGVhZCcsIFtdKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmJlZm9yZUhlYWQuZW5kVGFnSW1wbHlIZWFkID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdGhpcy5zdGFydFRhZ0hlYWQoJ2hlYWQnLCBbXSk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5iZWZvcmVIZWFkLmVuZFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdlbmQtdGFnLWFmdGVyLWltcGxpZWQtcm9vdCcsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWQgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmluSGVhZC5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgIGhlYWQ6ICdzdGFydFRhZ0hlYWQnLFxuICAgICAgICAgICAgdGl0bGU6ICdzdGFydFRhZ1RpdGxlJyxcbiAgICAgICAgICAgIHNjcmlwdDogJ3N0YXJ0VGFnU2NyaXB0JyxcbiAgICAgICAgICAgIHN0eWxlOiAnc3RhcnRUYWdOb0ZyYW1lc1N0eWxlJyxcbiAgICAgICAgICAgIG5vc2NyaXB0OiAnc3RhcnRUYWdOb1NjcmlwdCcsXG4gICAgICAgICAgICBub2ZyYW1lczogJ3N0YXJ0VGFnTm9GcmFtZXNTdHlsZScsXG4gICAgICAgICAgICBiYXNlOiAnc3RhcnRUYWdCYXNlQmFzZWZvbnRCZ3NvdW5kTGluaycsXG4gICAgICAgICAgICBiYXNlZm9udDogJ3N0YXJ0VGFnQmFzZUJhc2Vmb250Qmdzb3VuZExpbmsnLFxuICAgICAgICAgICAgYmdzb3VuZDogJ3N0YXJ0VGFnQmFzZUJhc2Vmb250Qmdzb3VuZExpbmsnLFxuICAgICAgICAgICAgbGluazogJ3N0YXJ0VGFnQmFzZUJhc2Vmb250Qmdzb3VuZExpbmsnLFxuICAgICAgICAgICAgbWV0YTogJ3N0YXJ0VGFnTWV0YScsXG4gICAgICAgICAgICBcIi1kZWZhdWx0XCI6ICdzdGFydFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZC5lbmRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgaGVhZDogJ2VuZFRhZ0hlYWQnLFxuICAgICAgICAgICAgaHRtbDogJ2VuZFRhZ0h0bWxCb2R5QnInLFxuICAgICAgICAgICAgYm9keTogJ2VuZFRhZ0h0bWxCb2R5QnInLFxuICAgICAgICAgICAgYnI6ICdlbmRUYWdIdG1sQm9keUJyJyxcbiAgICAgICAgICAgIFwiLWRlZmF1bHRcIjogJ2VuZFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZC5wcm9jZXNzRU9GID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgbmFtZSA9IHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZTtcbiAgICAgICAgICAgIGlmIChbJ3RpdGxlJywgJ3N0eWxlJywgJ3NjcmlwdCddLmluZGV4T2YobmFtZSkgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJleHBlY3RlZC1uYW1lZC1jbG9zaW5nLXRhZy1idXQtZ290LWVvZlwiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICAgICAgdHJlZS5wb3BFbGVtZW50KCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG5cbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRU9GKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkLnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgbGVhZGluZ1doaXRlc3BhY2UgPSBidWZmZXIudGFrZUxlYWRpbmdXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICBpZiAobGVhZGluZ1doaXRlc3BhY2UpXG4gICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRUZXh0KGxlYWRpbmdXaGl0ZXNwYWNlKTtcbiAgICAgICAgICAgIGlmICghYnVmZmVyLmxlbmd0aClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0aGlzLmFueXRoaW5nRWxzZSgpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NDaGFyYWN0ZXJzKGJ1ZmZlcik7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkLnN0YXJ0VGFnSHRtbCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIG1vZGVzLmluQm9keS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkLnN0YXJ0VGFnSGVhZCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndHdvLWhlYWRzLWFyZS1ub3QtYmV0dGVyLXRoYW4tb25lJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkLnN0YXJ0VGFnVGl0bGUgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnByb2Nlc3NHZW5lcmljUkNEQVRBU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkLnN0YXJ0VGFnTm9TY3JpcHQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5zY3JpcHRpbmdFbmFibGVkKVxuICAgICAgICAgICAgICAgIHJldHVybiB0cmVlLnByb2Nlc3NHZW5lcmljUmF3VGV4dFN0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpbkhlYWROb3NjcmlwdCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZC5zdGFydFRhZ05vRnJhbWVzU3R5bGUgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICAvLyBYWFggTmVlZCB0byBkZWNpZGUgd2hldGhlciB0byBpbXBsZW1lbnQgdGhlIHNjcmlwdGluZyBkaXNhYmxlZCBjYXNlXG4gICAgICAgICAgICB0cmVlLnByb2Nlc3NHZW5lcmljUmF3VGV4dFN0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZC5zdGFydFRhZ1NjcmlwdCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIHRyZWUudG9rZW5pemVyLnNldFN0YXRlKFRva2VuaXplci5TQ1JJUFRfREFUQSk7XG4gICAgICAgICAgICB0cmVlLm9yaWdpbmFsSW5zZXJ0aW9uTW9kZSA9IHRyZWUuaW5zZXJ0aW9uTW9kZU5hbWU7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ3RleHQnKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWQuc3RhcnRUYWdCYXNlQmFzZWZvbnRCZ3NvdW5kTGluayA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0U2VsZkNsb3NpbmdFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZC5zdGFydFRhZ01ldGEgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLmluc2VydFNlbGZDbG9zaW5nRWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIC8vIEB0b2RvIHByb2Nlc3MgY2hhcnNldCBhdHRyaWJ1dGVzXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkLnN0YXJ0VGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZC5lbmRUYWdIZWFkID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLml0ZW0odHJlZS5vcGVuRWxlbWVudHMubGVuZ3RoIC0gMSkubG9jYWxOYW1lID09ICdoZWFkJykge1xuICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogJ2hlYWQnIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdhZnRlckhlYWQnKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWQuZW5kVGFnSHRtbEJvZHlCciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWQuZW5kVGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWQuYW55dGhpbmdFbHNlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLmVuZFRhZ0hlYWQoJ2hlYWQnKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckhlYWQgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmFmdGVySGVhZC5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgIGhlYWQ6ICdzdGFydFRhZ0hlYWQnLFxuICAgICAgICAgICAgYm9keTogJ3N0YXJ0VGFnQm9keScsXG4gICAgICAgICAgICBmcmFtZXNldDogJ3N0YXJ0VGFnRnJhbWVzZXQnLFxuICAgICAgICAgICAgYmFzZTogJ3N0YXJ0VGFnRnJvbUhlYWQnLFxuICAgICAgICAgICAgbGluazogJ3N0YXJ0VGFnRnJvbUhlYWQnLFxuICAgICAgICAgICAgbWV0YTogJ3N0YXJ0VGFnRnJvbUhlYWQnLFxuICAgICAgICAgICAgc2NyaXB0OiAnc3RhcnRUYWdGcm9tSGVhZCcsXG4gICAgICAgICAgICAvLyBYWFggbm9mcmFtZXM6ICdzdGFydFRhZ0Zyb21IZWFkJyA/XG4gICAgICAgICAgICBzdHlsZTogJ3N0YXJ0VGFnRnJvbUhlYWQnLFxuICAgICAgICAgICAgdGl0bGU6ICdzdGFydFRhZ0Zyb21IZWFkJyxcbiAgICAgICAgICAgIFwiLWRlZmF1bHRcIjogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJIZWFkLmVuZF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBib2R5OiAnZW5kVGFnQm9keUh0bWxCcicsXG4gICAgICAgICAgICBodG1sOiAnZW5kVGFnQm9keUh0bWxCcicsXG4gICAgICAgICAgICBicjogJ2VuZFRhZ0JvZHlIdG1sQnInLFxuICAgICAgICAgICAgXCItZGVmYXVsdFwiOiAnZW5kVGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJIZWFkLnByb2Nlc3NFT0YgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VPRigpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVySGVhZC5wcm9jZXNzQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGxlYWRpbmdXaGl0ZXNwYWNlID0gYnVmZmVyLnRha2VMZWFkaW5nV2hpdGVzcGFjZSgpO1xuICAgICAgICAgICAgaWYgKGxlYWRpbmdXaGl0ZXNwYWNlKVxuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0VGV4dChsZWFkaW5nV2hpdGVzcGFjZSk7XG4gICAgICAgICAgICBpZiAoIWJ1ZmZlci5sZW5ndGgpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy5hbnl0aGluZ0Vsc2UoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzQ2hhcmFjdGVycyhidWZmZXIpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVySGVhZC5zdGFydFRhZ0h0bWwgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBtb2Rlcy5pbkJvZHkucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVySGVhZC5zdGFydFRhZ0JvZHkgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSBmYWxzZTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0Qm9keUVsZW1lbnQoYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luQm9keScpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVySGVhZC5zdGFydFRhZ0ZyYW1lc2V0ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpbkZyYW1lc2V0Jyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJIZWFkLnN0YXJ0VGFnRnJvbUhlYWQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1zdGFydC10YWctb3V0LW9mLW15LWhlYWRcIiwgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgLy8gRklYTUUgaGVhZCBwb2ludGVyXG4gICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wdXNoKHRyZWUuaGVhZCk7XG4gICAgICAgICAgICBtb2Rlcy5pbkhlYWQucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKTtcbiAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnJlbW92ZSh0cmVlLmhlYWQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVySGVhZC5zdGFydFRhZ0hlYWQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLXN0YXJ0LXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckhlYWQuc3RhcnRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICB0aGlzLmFueXRoaW5nRWxzZSgpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJIZWFkLmVuZFRhZ0JvZHlIdG1sQnIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0aGlzLmFueXRoaW5nRWxzZSgpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJIZWFkLmVuZFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJIZWFkLmFueXRoaW5nRWxzZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRCb2R5RWxlbWVudChbXSk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luQm9keScpO1xuICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIG1vZGVzLmluQm9keSA9IE9iamVjdC5jcmVhdGUobW9kZXMuYmFzZSk7XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0X3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGh0bWw6ICdzdGFydFRhZ0h0bWwnLFxuICAgICAgICAgICAgaGVhZDogJ3N0YXJ0VGFnTWlzcGxhY2VkJyxcbiAgICAgICAgICAgIGJhc2U6ICdzdGFydFRhZ1Byb2Nlc3NJbkhlYWQnLFxuICAgICAgICAgICAgYmFzZWZvbnQ6ICdzdGFydFRhZ1Byb2Nlc3NJbkhlYWQnLFxuICAgICAgICAgICAgYmdzb3VuZDogJ3N0YXJ0VGFnUHJvY2Vzc0luSGVhZCcsXG4gICAgICAgICAgICBsaW5rOiAnc3RhcnRUYWdQcm9jZXNzSW5IZWFkJyxcbiAgICAgICAgICAgIG1ldGE6ICdzdGFydFRhZ1Byb2Nlc3NJbkhlYWQnLFxuICAgICAgICAgICAgbm9mcmFtZXM6ICdzdGFydFRhZ1Byb2Nlc3NJbkhlYWQnLFxuICAgICAgICAgICAgc2NyaXB0OiAnc3RhcnRUYWdQcm9jZXNzSW5IZWFkJyxcbiAgICAgICAgICAgIHN0eWxlOiAnc3RhcnRUYWdQcm9jZXNzSW5IZWFkJyxcbiAgICAgICAgICAgIHRpdGxlOiAnc3RhcnRUYWdQcm9jZXNzSW5IZWFkJyxcbiAgICAgICAgICAgIGJvZHk6ICdzdGFydFRhZ0JvZHknLFxuICAgICAgICAgICAgZm9ybTogJ3N0YXJ0VGFnRm9ybScsXG4gICAgICAgICAgICBwbGFpbnRleHQ6ICdzdGFydFRhZ1BsYWludGV4dCcsXG4gICAgICAgICAgICBhOiAnc3RhcnRUYWdBJyxcbiAgICAgICAgICAgIGJ1dHRvbjogJ3N0YXJ0VGFnQnV0dG9uJyxcbiAgICAgICAgICAgIHhtcDogJ3N0YXJ0VGFnWG1wJyxcbiAgICAgICAgICAgIHRhYmxlOiAnc3RhcnRUYWdUYWJsZScsXG4gICAgICAgICAgICBocjogJ3N0YXJ0VGFnSHInLFxuICAgICAgICAgICAgaW1hZ2U6ICdzdGFydFRhZ0ltYWdlJyxcbiAgICAgICAgICAgIGlucHV0OiAnc3RhcnRUYWdJbnB1dCcsXG4gICAgICAgICAgICB0ZXh0YXJlYTogJ3N0YXJ0VGFnVGV4dGFyZWEnLFxuICAgICAgICAgICAgc2VsZWN0OiAnc3RhcnRUYWdTZWxlY3QnLFxuICAgICAgICAgICAgaXNpbmRleDogJ3N0YXJ0VGFnSXNpbmRleCcsXG4gICAgICAgICAgICBhcHBsZXQ6ICdzdGFydFRhZ0FwcGxldE1hcnF1ZWVPYmplY3QnLFxuICAgICAgICAgICAgbWFycXVlZTogJ3N0YXJ0VGFnQXBwbGV0TWFycXVlZU9iamVjdCcsXG4gICAgICAgICAgICBvYmplY3Q6ICdzdGFydFRhZ0FwcGxldE1hcnF1ZWVPYmplY3QnLFxuICAgICAgICAgICAgbGk6ICdzdGFydFRhZ0xpc3RJdGVtJyxcbiAgICAgICAgICAgIGRkOiAnc3RhcnRUYWdMaXN0SXRlbScsXG4gICAgICAgICAgICBkdDogJ3N0YXJ0VGFnTGlzdEl0ZW0nLFxuICAgICAgICAgICAgYWRkcmVzczogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIGFydGljbGU6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBhc2lkZTogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIGJsb2NrcXVvdGU6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBjZW50ZXI6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBkZXRhaWxzOiAnc3RhcnRUYWdDbG9zZVAnLFxuICAgICAgICAgICAgZGlyOiAnc3RhcnRUYWdDbG9zZVAnLFxuICAgICAgICAgICAgZGl2OiAnc3RhcnRUYWdDbG9zZVAnLFxuICAgICAgICAgICAgZGw6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBmaWVsZHNldDogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIGZpZ2NhcHRpb246ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBmaWd1cmU6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBmb290ZXI6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBoZWFkZXI6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBoZ3JvdXA6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBtYWluOiAnc3RhcnRUYWdDbG9zZVAnLFxuICAgICAgICAgICAgbWVudTogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIG5hdjogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIG9sOiAnc3RhcnRUYWdDbG9zZVAnLFxuICAgICAgICAgICAgcDogJ3N0YXJ0VGFnQ2xvc2VQJyxcbiAgICAgICAgICAgIHNlY3Rpb246ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBzdW1tYXJ5OiAnc3RhcnRUYWdDbG9zZVAnLFxuICAgICAgICAgICAgdWw6ICdzdGFydFRhZ0Nsb3NlUCcsXG4gICAgICAgICAgICBsaXN0aW5nOiAnc3RhcnRUYWdQcmVMaXN0aW5nJyxcbiAgICAgICAgICAgIHByZTogJ3N0YXJ0VGFnUHJlTGlzdGluZycsXG4gICAgICAgICAgICBiOiAnc3RhcnRUYWdGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIGJpZzogJ3N0YXJ0VGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBjb2RlOiAnc3RhcnRUYWdGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIGVtOiAnc3RhcnRUYWdGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIGZvbnQ6ICdzdGFydFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgaTogJ3N0YXJ0VGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBzOiAnc3RhcnRUYWdGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIHNtYWxsOiAnc3RhcnRUYWdGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIHN0cmlrZTogJ3N0YXJ0VGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBzdHJvbmc6ICdzdGFydFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgdHQ6ICdzdGFydFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgdTogJ3N0YXJ0VGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBub2JyOiAnc3RhcnRUYWdOb2JyJyxcbiAgICAgICAgICAgIGFyZWE6ICdzdGFydFRhZ1ZvaWRGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIGJyOiAnc3RhcnRUYWdWb2lkRm9ybWF0dGluZycsXG4gICAgICAgICAgICBlbWJlZDogJ3N0YXJ0VGFnVm9pZEZvcm1hdHRpbmcnLFxuICAgICAgICAgICAgaW1nOiAnc3RhcnRUYWdWb2lkRm9ybWF0dGluZycsXG4gICAgICAgICAgICBrZXlnZW46ICdzdGFydFRhZ1ZvaWRGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIHdicjogJ3N0YXJ0VGFnVm9pZEZvcm1hdHRpbmcnLFxuICAgICAgICAgICAgcGFyYW06ICdzdGFydFRhZ1BhcmFtU291cmNlVHJhY2snLFxuICAgICAgICAgICAgc291cmNlOiAnc3RhcnRUYWdQYXJhbVNvdXJjZVRyYWNrJyxcbiAgICAgICAgICAgIHRyYWNrOiAnc3RhcnRUYWdQYXJhbVNvdXJjZVRyYWNrJyxcbiAgICAgICAgICAgIGlmcmFtZTogJ3N0YXJ0VGFnSUZyYW1lJyxcbiAgICAgICAgICAgIG5vZW1iZWQ6ICdzdGFydFRhZ1Jhd1RleHQnLFxuICAgICAgICAgICAgbm9zY3JpcHQ6ICdzdGFydFRhZ1Jhd1RleHQnLFxuICAgICAgICAgICAgaDE6ICdzdGFydFRhZ0hlYWRpbmcnLFxuICAgICAgICAgICAgaDI6ICdzdGFydFRhZ0hlYWRpbmcnLFxuICAgICAgICAgICAgaDM6ICdzdGFydFRhZ0hlYWRpbmcnLFxuICAgICAgICAgICAgaDQ6ICdzdGFydFRhZ0hlYWRpbmcnLFxuICAgICAgICAgICAgaDU6ICdzdGFydFRhZ0hlYWRpbmcnLFxuICAgICAgICAgICAgaDY6ICdzdGFydFRhZ0hlYWRpbmcnLFxuICAgICAgICAgICAgY2FwdGlvbjogJ3N0YXJ0VGFnTWlzcGxhY2VkJyxcbiAgICAgICAgICAgIGNvbDogJ3N0YXJ0VGFnTWlzcGxhY2VkJyxcbiAgICAgICAgICAgIGNvbGdyb3VwOiAnc3RhcnRUYWdNaXNwbGFjZWQnLFxuICAgICAgICAgICAgZnJhbWU6ICdzdGFydFRhZ01pc3BsYWNlZCcsXG4gICAgICAgICAgICBmcmFtZXNldDogJ3N0YXJ0VGFnRnJhbWVzZXQnLFxuICAgICAgICAgICAgdGJvZHk6ICdzdGFydFRhZ01pc3BsYWNlZCcsXG4gICAgICAgICAgICB0ZDogJ3N0YXJ0VGFnTWlzcGxhY2VkJyxcbiAgICAgICAgICAgIHRmb290OiAnc3RhcnRUYWdNaXNwbGFjZWQnLFxuICAgICAgICAgICAgdGg6ICdzdGFydFRhZ01pc3BsYWNlZCcsXG4gICAgICAgICAgICB0aGVhZDogJ3N0YXJ0VGFnTWlzcGxhY2VkJyxcbiAgICAgICAgICAgIHRyOiAnc3RhcnRUYWdNaXNwbGFjZWQnLFxuICAgICAgICAgICAgb3B0aW9uOiAnc3RhcnRUYWdPcHRpb25PcHRncm91cCcsXG4gICAgICAgICAgICBvcHRncm91cDogJ3N0YXJ0VGFnT3B0aW9uT3B0Z3JvdXAnLFxuICAgICAgICAgICAgbWF0aDogJ3N0YXJ0VGFnTWF0aCcsXG4gICAgICAgICAgICBzdmc6ICdzdGFydFRhZ1NWRycsXG4gICAgICAgICAgICBydDogJ3N0YXJ0VGFnUnBSdCcsXG4gICAgICAgICAgICBycDogJ3N0YXJ0VGFnUnBSdCcsXG4gICAgICAgICAgICBcIi1kZWZhdWx0XCI6ICdzdGFydFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5lbmRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgcDogJ2VuZFRhZ1AnLFxuICAgICAgICAgICAgYm9keTogJ2VuZFRhZ0JvZHknLFxuICAgICAgICAgICAgaHRtbDogJ2VuZFRhZ0h0bWwnLFxuICAgICAgICAgICAgYWRkcmVzczogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGFydGljbGU6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBhc2lkZTogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGJsb2NrcXVvdGU6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBidXR0b246ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBjZW50ZXI6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBkZXRhaWxzOiAnZW5kVGFnQmxvY2snLFxuICAgICAgICAgICAgZGlyOiAnZW5kVGFnQmxvY2snLFxuICAgICAgICAgICAgZGl2OiAnZW5kVGFnQmxvY2snLFxuICAgICAgICAgICAgZGw6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBmaWVsZHNldDogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIGZpZ2NhcHRpb246ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBmaWd1cmU6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBmb290ZXI6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBoZWFkZXI6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBoZ3JvdXA6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBsaXN0aW5nOiAnZW5kVGFnQmxvY2snLFxuICAgICAgICAgICAgbWFpbjogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIG1lbnU6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBuYXY6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBvbDogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIHByZTogJ2VuZFRhZ0Jsb2NrJyxcbiAgICAgICAgICAgIHNlY3Rpb246ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBzdW1tYXJ5OiAnZW5kVGFnQmxvY2snLFxuICAgICAgICAgICAgdWw6ICdlbmRUYWdCbG9jaycsXG4gICAgICAgICAgICBmb3JtOiAnZW5kVGFnRm9ybScsXG4gICAgICAgICAgICBhcHBsZXQ6ICdlbmRUYWdBcHBsZXRNYXJxdWVlT2JqZWN0JyxcbiAgICAgICAgICAgIG1hcnF1ZWU6ICdlbmRUYWdBcHBsZXRNYXJxdWVlT2JqZWN0JyxcbiAgICAgICAgICAgIG9iamVjdDogJ2VuZFRhZ0FwcGxldE1hcnF1ZWVPYmplY3QnLFxuICAgICAgICAgICAgZGQ6ICdlbmRUYWdMaXN0SXRlbScsXG4gICAgICAgICAgICBkdDogJ2VuZFRhZ0xpc3RJdGVtJyxcbiAgICAgICAgICAgIGxpOiAnZW5kVGFnTGlzdEl0ZW0nLFxuICAgICAgICAgICAgaDE6ICdlbmRUYWdIZWFkaW5nJyxcbiAgICAgICAgICAgIGgyOiAnZW5kVGFnSGVhZGluZycsXG4gICAgICAgICAgICBoMzogJ2VuZFRhZ0hlYWRpbmcnLFxuICAgICAgICAgICAgaDQ6ICdlbmRUYWdIZWFkaW5nJyxcbiAgICAgICAgICAgIGg1OiAnZW5kVGFnSGVhZGluZycsXG4gICAgICAgICAgICBoNjogJ2VuZFRhZ0hlYWRpbmcnLFxuICAgICAgICAgICAgYTogJ2VuZFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgYjogJ2VuZFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgYmlnOiAnZW5kVGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBjb2RlOiAnZW5kVGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICBlbTogJ2VuZFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgZm9udDogJ2VuZFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgaTogJ2VuZFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgbm9icjogJ2VuZFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgczogJ2VuZFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgc21hbGw6ICdlbmRUYWdGb3JtYXR0aW5nJyxcbiAgICAgICAgICAgIHN0cmlrZTogJ2VuZFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgc3Ryb25nOiAnZW5kVGFnRm9ybWF0dGluZycsXG4gICAgICAgICAgICB0dDogJ2VuZFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgdTogJ2VuZFRhZ0Zvcm1hdHRpbmcnLFxuICAgICAgICAgICAgYnI6ICdlbmRUYWdCcicsXG4gICAgICAgICAgICBcIi1kZWZhdWx0XCI6ICdlbmRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLnNob3VsZFNraXBMZWFkaW5nTmV3bGluZSkge1xuICAgICAgICAgICAgICAgIHRyZWUuc2hvdWxkU2tpcExlYWRpbmdOZXdsaW5lID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnNraXBBdE1vc3RPbmVMZWFkaW5nTmV3bGluZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJlZS5yZWNvbnN0cnVjdEFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cygpO1xuICAgICAgICAgICAgdmFyIGNoYXJhY3RlcnMgPSBidWZmZXIudGFrZVJlbWFpbmluZygpO1xuICAgICAgICAgICAgY2hhcmFjdGVycyA9IGNoYXJhY3RlcnMucmVwbGFjZSgvXFx1MDAwMC9nLCBmdW5jdGlvbihtYXRjaCwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgICAvLyBAdG9kbyBwb3NpdGlvblxuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcImludmFsaWQtY29kZXBvaW50XCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKCFjaGFyYWN0ZXJzKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0VGV4dChjaGFyYWN0ZXJzKTtcbiAgICAgICAgICAgIGlmICh0cmVlLmZyYW1lc2V0T2sgJiYgIWlzQWxsV2hpdGVzcGFjZU9yUmVwbGFjZW1lbnRDaGFyYWN0ZXJzKGNoYXJhY3RlcnMpKVxuICAgICAgICAgICAgICAgIHRyZWUuZnJhbWVzZXRPayA9IGZhbHNlO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ0h0bWwgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ25vbi1odG1sLXJvb3QnKTtcbiAgICAgICAgICAgIHRyZWUuYWRkQXR0cmlidXRlc1RvRWxlbWVudCh0cmVlLm9wZW5FbGVtZW50cy5yb290Tm9kZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnUHJvY2Vzc0luSGVhZCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIG1vZGVzLmluSGVhZC5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnQm9keSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1zdGFydC10YWcnLCB7IG5hbWU6ICdib2R5JyB9KTtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5sZW5ndGggPT0gMSB8fFxuICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLml0ZW0oMSkubG9jYWxOYW1lICE9ICdib2R5Jykge1xuICAgICAgICAgICAgICAgIC8vIFRPRE86IGFzc2VydC5vayh0cmVlLmNvbnRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdHJlZS5hZGRBdHRyaWJ1dGVzVG9FbGVtZW50KHRyZWUub3BlbkVsZW1lbnRzLmJvZHlFbGVtZW50LCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdGcmFtZXNldCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1zdGFydC10YWcnLCB7IG5hbWU6ICdmcmFtZXNldCcgfSk7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMubGVuZ3RoID09IDEgfHxcbiAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5pdGVtKDEpLmxvY2FsTmFtZSAhPSAnYm9keScpIHtcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBhc3NlcnQub2sodHJlZS5jb250ZXh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHRyZWUuZnJhbWVzZXRPaykge1xuICAgICAgICAgICAgICAgIHRyZWUuZGV0YWNoRnJvbVBhcmVudCh0cmVlLm9wZW5FbGVtZW50cy5ib2R5RWxlbWVudCk7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHRyZWUub3BlbkVsZW1lbnRzLmxlbmd0aCA+IDEpXG4gICAgICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcCgpO1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luRnJhbWVzZXQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdDbG9zZVAgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5CdXR0b25TY29wZSgncCcpKVxuICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnUCgncCcpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ1ByZUxpc3RpbmcgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5CdXR0b25TY29wZSgncCcpKVxuICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnUCgncCcpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gZmFsc2U7XG4gICAgICAgICAgICB0cmVlLnNob3VsZFNraXBMZWFkaW5nTmV3bGluZSA9IHRydWU7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnRm9ybSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLmZvcm0pIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtc3RhcnQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5CdXR0b25TY29wZSgncCcpKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVuZFRhZ1AoJ3AnKTtcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICAgICAgdHJlZS5mb3JtID0gdHJlZS5jdXJyZW50U3RhY2tJdGVtKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnUnBSdCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pblNjb3BlKCdydWJ5JykpIHtcbiAgICAgICAgICAgICAgICB0cmVlLmdlbmVyYXRlSW1wbGllZEVuZFRhZ3MoKTtcbiAgICAgICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lICE9ICdydWJ5Jykge1xuICAgICAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtc3RhcnQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdMaXN0SXRlbSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIC8vLyBAdG9kbzogRml4IGFjY29yZGluZyB0byBjdXJyZW50IHNwZWMuIGh0dHA6Ly93d3cudzMub3JnL1RSL2h0bWw1L3RyZWUtY29uc3RydWN0aW9uLmh0bWwjcGFyc2luZy1tYWluLWluYm9keVxuICAgICAgICAgICAgdmFyIHN0b3BOYW1lcyA9IHsgbGk6IFsnbGknXSwgZGQ6IFsnZGQnLCAnZHQnXSwgZHQ6IFsnZGQnLCAnZHQnXSB9O1xuICAgICAgICAgICAgdmFyIHN0b3BOYW1lID0gc3RvcE5hbWVzW25hbWVdO1xuXG4gICAgICAgICAgICB2YXIgZWxzID0gdHJlZS5vcGVuRWxlbWVudHM7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gZWxzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5vZGUgPSBlbHMuaXRlbShpKTtcbiAgICAgICAgICAgICAgICBpZiAoc3RvcE5hbWUuaW5kZXhPZihub2RlLmxvY2FsTmFtZSkgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFbmRUYWcobm9kZS5sb2NhbE5hbWUpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyB0b2RvIGlzU2NvcGluZygpXG4gICAgICAgICAgICAgICAgaWYgKG5vZGUuaXNTcGVjaWFsKCkgJiYgbm9kZS5sb2NhbE5hbWUgIT09ICdwJyAmJiBub2RlLmxvY2FsTmFtZSAhPT0gJ2FkZHJlc3MnICYmIG5vZGUubG9jYWxOYW1lICE9PSAnZGl2JylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5CdXR0b25TY29wZSgncCcpKVxuICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnUCgncCcpO1xuXG4gICAgICAgICAgICAvLyBBbHdheXMgaW5zZXJ0IGFuIDxsaT4gZWxlbWVudFxuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gZmFsc2U7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnUGxhaW50ZXh0ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluQnV0dG9uU2NvcGUoJ3AnKSlcbiAgICAgICAgICAgICAgICB0aGlzLmVuZFRhZ1AoJ3AnKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIHRyZWUudG9rZW5pemVyLnNldFN0YXRlKFRva2VuaXplci5QTEFJTlRFWFQpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ0hlYWRpbmcgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5CdXR0b25TY29wZSgncCcpKVxuICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnUCgncCcpO1xuICAgICAgICAgICAgaWYgKHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmlzTnVtYmVyZWRIZWFkZXIoKSkge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1zdGFydC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICAgICAgdHJlZS5wb3BFbGVtZW50KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnQSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHZhciBhY3RpdmVBID0gdHJlZS5lbGVtZW50SW5BY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoJ2EnKTtcbiAgICAgICAgICAgIGlmIChhY3RpdmVBKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1zdGFydC10YWctaW1wbGllcy1lbmQtdGFnXCIsIHsgc3RhcnROYW1lOiBcImFcIiwgZW5kTmFtZTogXCJhXCIgfSk7XG4gICAgICAgICAgICAgICAgdHJlZS5hZG9wdGlvbkFnZW5jeUVuZFRhZygnYScpO1xuICAgICAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5jb250YWlucyhhY3RpdmVBKSlcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucmVtb3ZlKGFjdGl2ZUEpO1xuICAgICAgICAgICAgICAgIHRyZWUucmVtb3ZlRWxlbWVudEZyb21BY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoYWN0aXZlQSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEZvcm1hdHRpbmdFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ0Zvcm1hdHRpbmcgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEZvcm1hdHRpbmdFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ05vYnIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5TY29wZSgnbm9icicpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1zdGFydC10YWctaW1wbGllcy1lbmQtdGFnXCIsIHsgc3RhcnROYW1lOiAnbm9icicsIGVuZE5hbWU6ICdub2JyJyB9KTtcbiAgICAgICAgICAgICAgICB0aGlzLnByb2Nlc3NFbmRUYWcoJ25vYnInKTtcbiAgICAgICAgICAgICAgICAvLyBYWFggTmVlZCB0ZXN0cyB0aGF0IHRyaWdnZXIgdGhlIGZvbGxvd2luZ1xuICAgICAgICAgICAgICAgIHRyZWUucmVjb25zdHJ1Y3RBY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0Rm9ybWF0dGluZ0VsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnQnV0dG9uID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluU2NvcGUoJ2J1dHRvbicpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLXN0YXJ0LXRhZy1pbXBsaWVzLWVuZC10YWcnLCB7IHN0YXJ0TmFtZTogJ2J1dHRvbicsIGVuZE5hbWU6ICdidXR0b24nIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzc0VuZFRhZygnYnV0dG9uJyk7XG4gICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdHJlZS5yZWNvbnN0cnVjdEFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cygpO1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdBcHBsZXRNYXJxdWVlT2JqZWN0ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5yZWNvbnN0cnVjdEFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cygpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMucHVzaChNYXJrZXIpO1xuICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gZmFsc2U7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LmVuZFRhZ0FwcGxldE1hcnF1ZWVPYmplY3QgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBpZiAoIXRyZWUub3BlbkVsZW1lbnRzLmluU2NvcGUobmFtZSkpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWVuZC10YWdcIiwgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cmVlLmdlbmVyYXRlSW1wbGllZEVuZFRhZ3MoKTtcbiAgICAgICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lICE9IG5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdlbmQtdGFnLXRvby1lYXJseScsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxQb3BwZWQobmFtZSk7XG4gICAgICAgICAgICAgICAgdHJlZS5jbGVhckFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ1htcCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pbkJ1dHRvblNjb3BlKCdwJykpXG4gICAgICAgICAgICAgICAgdGhpcy5wcm9jZXNzRW5kVGFnKCdwJyk7XG4gICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICB0cmVlLnByb2Nlc3NHZW5lcmljUmF3VGV4dFN0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gZmFsc2U7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnVGFibGUgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5jb21wYXRNb2RlICE9PSBcInF1aXJrc1wiKVxuICAgICAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pbkJ1dHRvblNjb3BlKCdwJykpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzc0VuZFRhZygncCcpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpblRhYmxlJyk7XG4gICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSBmYWxzZTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdWb2lkRm9ybWF0dGluZyA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucmVjb25zdHJ1Y3RBY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0U2VsZkNsb3NpbmdFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gZmFsc2U7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnUGFyYW1Tb3VyY2VUcmFjayA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0U2VsZkNsb3NpbmdFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ0hyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluQnV0dG9uU2NvcGUoJ3AnKSlcbiAgICAgICAgICAgICAgICB0aGlzLmVuZFRhZ1AoJ3AnKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0U2VsZkNsb3NpbmdFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gZmFsc2U7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnSW1hZ2UgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICAvLyBObywgcmVhbGx5Li4uXG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtc3RhcnQtdGFnLXRyZWF0ZWQtYXMnLCB7IG9yaWdpbmFsTmFtZTogJ2ltYWdlJywgbmV3TmFtZTogJ2ltZycgfSk7XG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NTdGFydFRhZygnaW1nJywgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnSW5wdXQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB2YXIgY3VycmVudEZyYW1lc2V0T2sgPSB0cmVlLmZyYW1lc2V0T2s7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0VGFnVm9pZEZvcm1hdHRpbmcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gYXR0cmlidXRlcykge1xuICAgICAgICAgICAgICAgIC8vIGlucHV0IHR5cGU9aGlkZGVuIGRvZXNuJ3QgY2hhbmdlIGZyYW1lc2V0T2tcbiAgICAgICAgICAgICAgICBpZiAoYXR0cmlidXRlc1trZXldLm5vZGVOYW1lID09ICd0eXBlJykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXR0cmlidXRlc1trZXldLm5vZGVWYWx1ZS50b0xvd2VyQ2FzZSgpID09ICdoaWRkZW4nKVxuICAgICAgICAgICAgICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gY3VycmVudEZyYW1lc2V0T2s7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdJc2luZGV4ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdkZXByZWNhdGVkLXRhZycsIHsgbmFtZTogJ2lzaW5kZXgnIH0pO1xuICAgICAgICAgICAgdHJlZS5zZWxmQ2xvc2luZ0ZsYWdBY2tub3dsZWRnZWQgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKHRyZWUuZm9ybSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB2YXIgZm9ybUF0dHJpYnV0ZXMgPSBbXTtcbiAgICAgICAgICAgIHZhciBpbnB1dEF0dHJpYnV0ZXMgPSBbXTtcbiAgICAgICAgICAgIHZhciBwcm9tcHQgPSBcIlRoaXMgaXMgYSBzZWFyY2hhYmxlIGluZGV4LiBFbnRlciBzZWFyY2gga2V5d29yZHM6IFwiO1xuICAgICAgICAgICAgZm9yICh2YXIga2V5IGluIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGF0dHJpYnV0ZXNba2V5XS5ub2RlTmFtZSkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdhY3Rpb24nOlxuICAgICAgICAgICAgICAgICAgICAgICAgZm9ybUF0dHJpYnV0ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZU5hbWU6ICdhY3Rpb24nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVWYWx1ZTogYXR0cmlidXRlc1trZXldLm5vZGVWYWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAncHJvbXB0JzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb21wdCA9IGF0dHJpYnV0ZXNba2V5XS5ub2RlVmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnbmFtZSc6XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0QXR0cmlidXRlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlTmFtZTogYXR0cmlidXRlc1trZXldLm5vZGVOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVWYWx1ZTogYXR0cmlidXRlc1trZXldLm5vZGVWYWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaW5wdXRBdHRyaWJ1dGVzLnB1c2goeyBub2RlTmFtZTogJ25hbWUnLCBub2RlVmFsdWU6ICdpc2luZGV4JyB9KTtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc1N0YXJ0VGFnKCdmb3JtJywgZm9ybUF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdGhpcy5wcm9jZXNzU3RhcnRUYWcoJ2hyJyk7XG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NTdGFydFRhZygnbGFiZWwnKTtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc0NoYXJhY3RlcnMobmV3IENoYXJhY3RlckJ1ZmZlcihwcm9tcHQpKTtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc1N0YXJ0VGFnKCdpbnB1dCcsIGlucHV0QXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NFbmRUYWcoJ2xhYmVsJyk7XG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NTdGFydFRhZygnaHInKTtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc0VuZFRhZygnZm9ybScpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ1RleHRhcmVhID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgLy8gWFhYIEZvcm0gZWxlbWVudCBwb2ludGVyIGNoZWNraW5nIGhlcmUgYXMgd2VsbC4uLlxuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS50b2tlbml6ZXIuc2V0U3RhdGUoVG9rZW5pemVyLlJDREFUQSk7XG4gICAgICAgICAgICB0cmVlLm9yaWdpbmFsSW5zZXJ0aW9uTW9kZSA9IHRyZWUuaW5zZXJ0aW9uTW9kZU5hbWU7XG4gICAgICAgICAgICB0cmVlLnNob3VsZFNraXBMZWFkaW5nTmV3bGluZSA9IHRydWU7XG4gICAgICAgICAgICB0cmVlLmZyYW1lc2V0T2sgPSBmYWxzZTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgndGV4dCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ0lGcmFtZSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUuZnJhbWVzZXRPayA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5zdGFydFRhZ1Jhd1RleHQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnUmF3VGV4dCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucHJvY2Vzc0dlbmVyaWNSYXdUZXh0U3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnU2VsZWN0ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5yZWNvbnN0cnVjdEFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cygpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5mcmFtZXNldE9rID0gZmFsc2U7XG4gICAgICAgICAgICB2YXIgaW5zZXJ0aW9uTW9kZU5hbWUgPSB0cmVlLmluc2VydGlvbk1vZGVOYW1lO1xuICAgICAgICAgICAgaWYgKGluc2VydGlvbk1vZGVOYW1lID09ICdpblRhYmxlJyB8fFxuICAgICAgICAgICAgICAgIGluc2VydGlvbk1vZGVOYW1lID09ICdpbkNhcHRpb24nIHx8XG4gICAgICAgICAgICAgICAgaW5zZXJ0aW9uTW9kZU5hbWUgPT0gJ2luQ29sdW1uR3JvdXAnIHx8XG4gICAgICAgICAgICAgICAgaW5zZXJ0aW9uTW9kZU5hbWUgPT0gJ2luVGFibGVCb2R5JyB8fFxuICAgICAgICAgICAgICAgIGluc2VydGlvbk1vZGVOYW1lID09ICdpblJvdycgfHxcbiAgICAgICAgICAgICAgICBpbnNlcnRpb25Nb2RlTmFtZSA9PSAnaW5DZWxsJykge1xuICAgICAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5TZWxlY3RJblRhYmxlJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5TZWxlY3QnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuc3RhcnRUYWdNaXNwbGFjZWQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtc3RhcnQtdGFnLWlnbm9yZWQnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LmVuZFRhZ01pc3BsYWNlZCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIC8vIFRoaXMgaGFuZGxlcyBlbGVtZW50cyB3aXRoIGVuZCB0YWdzIGluIG90aGVyIGluc2VydGlvbiBtb2Rlcy5cbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtZW5kLXRhZ1wiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LmVuZFRhZ0JyID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1lbmQtdGFnLXRyZWF0ZWQtYXNcIiwgeyBvcmlnaW5hbE5hbWU6IFwiYnJcIiwgbmV3TmFtZTogXCJiciBlbGVtZW50XCIgfSk7XG4gICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgW10pO1xuICAgICAgICAgICAgdHJlZS5wb3BFbGVtZW50KCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LnN0YXJ0VGFnT3B0aW9uT3B0Z3JvdXAgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lID09ICdvcHRpb24nKVxuICAgICAgICAgICAgICAgIHRyZWUucG9wRWxlbWVudCgpO1xuICAgICAgICAgICAgdHJlZS5yZWNvbnN0cnVjdEFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cygpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5yZWNvbnN0cnVjdEFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cygpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5lbmRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHZhciBub2RlO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHRyZWUub3BlbkVsZW1lbnRzLmxlbmd0aCAtIDE7IGkgPiAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICBub2RlID0gdHJlZS5vcGVuRWxlbWVudHMuaXRlbShpKTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5sb2NhbE5hbWUgPT0gbmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0cmVlLmdlbmVyYXRlSW1wbGllZEVuZFRhZ3MobmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgIT0gbmFtZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgICAgICAgICAvLyB0b2RvIG9wdGltaXplXG4gICAgICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnJlbW92ZV9vcGVuRWxlbWVudHNfdW50aWwoZnVuY3Rpb24oeCkgeyByZXR1cm4geCA9PT0gbm9kZTsgfSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobm9kZS5pc1NwZWNpYWwoKSkge1xuICAgICAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ01hdGggPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgdHJlZS5yZWNvbnN0cnVjdEFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cygpO1xuICAgICAgICAgICAgYXR0cmlidXRlcyA9IHRyZWUuYWRqdXN0TWF0aE1MQXR0cmlidXRlcyhhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIGF0dHJpYnV0ZXMgPSB0cmVlLmFkanVzdEZvcmVpZ25BdHRyaWJ1dGVzKGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRGb3JlaWduRWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzLCBcImh0dHA6Ly93d3cudzMub3JnLzE5OTgvTWF0aC9NYXRoTUxcIiwgc2VsZkNsb3NpbmcpO1xuICAgICAgICAgICAgLy8gTmVlZCB0byBnZXQgdGhlIHBhcnNlIGVycm9yIHJpZ2h0IGZvciB0aGUgY2FzZSB3aGVyZSB0aGUgdG9rZW5cbiAgICAgICAgICAgIC8vIGhhcyBhIG5hbWVzcGFjZSBub3QgZXF1YWwgdG8gdGhlIHhtbG5zIGF0dHJpYnV0ZVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5zdGFydFRhZ1NWRyA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICBhdHRyaWJ1dGVzID0gdHJlZS5hZGp1c3RTVkdBdHRyaWJ1dGVzKGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgYXR0cmlidXRlcyA9IHRyZWUuYWRqdXN0Rm9yZWlnbkF0dHJpYnV0ZXMoYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEZvcmVpZ25FbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMsIFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiwgc2VsZkNsb3NpbmcpO1xuICAgICAgICAgICAgLy8gTmVlZCB0byBnZXQgdGhlIHBhcnNlIGVycm9yIHJpZ2h0IGZvciB0aGUgY2FzZSB3aGVyZSB0aGUgdG9rZW5cbiAgICAgICAgICAgIC8vIGhhcyBhIG5hbWVzcGFjZSBub3QgZXF1YWwgdG8gdGhlIHhtbG5zIGF0dHJpYnV0ZVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5lbmRUYWdQID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKCF0cmVlLm9wZW5FbGVtZW50cy5pbkJ1dHRvblNjb3BlKCdwJykpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogJ3AnIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRUYWdDbG9zZVAoJ3AnLCBbXSk7XG4gICAgICAgICAgICAgICAgdGhpcy5lbmRUYWdQKCdwJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyZWUuZ2VuZXJhdGVJbXBsaWVkRW5kVGFncygncCcpO1xuICAgICAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgIT0gJ3AnKVxuICAgICAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtaW1wbGllZC1lbmQtdGFnJywgeyBuYW1lOiAncCcgfSk7XG4gICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxQb3BwZWQobmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LmVuZFRhZ0JvZHkgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBpZiAoIXRyZWUub3BlbkVsZW1lbnRzLmluU2NvcGUoJ2JvZHknKSkge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8vIEB0b2RvIEVtaXQgcGFyc2UgZXJyb3Igb24gZW5kIHRhZ3Mgb3RoZXIgdGhhbiB0aGUgb25lcyBsaXN0ZWQgaW4gaHR0cDovL3d3dy53My5vcmcvVFIvaHRtbDUvdHJlZS1jb25zdHJ1Y3Rpb24uaHRtbCNwYXJzaW5nLW1haW4taW5ib2R5XG4gICAgICAgICAgICAvLyBbJ2RkJywgJ2R0JywgJ2xpJywgJ29wdGdyb3VwJywgJ29wdGlvbicsICdwJywgJ3JwJywgJ3J0JywgJ3Rib2R5JywgJ3RkJywgJ3Rmb290JywgJ3RoJywgJ3RoZWFkJywgJ3RyJywgJ2JvZHknLCAnaHRtbCddXG4gICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lICE9ICdib2R5Jykge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcignZXhwZWN0ZWQtb25lLWVuZC10YWctYnV0LWdvdC1hbm90aGVyJywge1xuICAgICAgICAgICAgICAgICAgICBleHBlY3RlZE5hbWU6IHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgZ290TmFtZTogbmFtZVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdhZnRlckJvZHknKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuZW5kVGFnSHRtbCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICghdHJlZS5vcGVuRWxlbWVudHMuaW5TY29wZSgnYm9keScpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLy8gQHRvZG8gRW1pdCBwYXJzZSBlcnJvciBvbiBlbmQgdGFncyBvdGhlciB0aGFuIHRoZSBvbmVzIGxpc3RlZCBpbiBodHRwOi8vd3d3LnczLm9yZy9UUi9odG1sNS90cmVlLWNvbnN0cnVjdGlvbi5odG1sI3BhcnNpbmctbWFpbi1pbmJvZHlcbiAgICAgICAgICAgIC8vIFsnZGQnLCAnZHQnLCAnbGknLCAnb3B0Z3JvdXAnLCAnb3B0aW9uJywgJ3AnLCAncnAnLCAncnQnLCAndGJvZHknLCAndGQnLCAndGZvb3QnLCAndGgnLCAndGhlYWQnLCAndHInLCAnYm9keScsICdodG1sJ11cbiAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgIT0gJ2JvZHknKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdleHBlY3RlZC1vbmUtZW5kLXRhZy1idXQtZ290LWFub3RoZXInLCB7XG4gICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkTmFtZTogdHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lLFxuICAgICAgICAgICAgICAgICAgICBnb3ROYW1lOiBuYW1lXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2FmdGVyQm9keScpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LmVuZFRhZ0Jsb2NrID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKCF0cmVlLm9wZW5FbGVtZW50cy5pblNjb3BlKG5hbWUpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyZWUuZ2VuZXJhdGVJbXBsaWVkRW5kVGFncygpO1xuICAgICAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgIT0gbmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2VuZC10YWctdG9vLWVhcmx5JywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3BVbnRpbFBvcHBlZChuYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkJvZHkuZW5kVGFnRm9ybSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHZhciBub2RlID0gdHJlZS5mb3JtO1xuICAgICAgICAgICAgdHJlZS5mb3JtID0gbnVsbDtcbiAgICAgICAgICAgIGlmICghbm9kZSB8fCAhdHJlZS5vcGVuRWxlbWVudHMuaW5TY29wZShuYW1lKSkge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cmVlLmdlbmVyYXRlSW1wbGllZEVuZFRhZ3MoKTtcbiAgICAgICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkgIT0gbm9kZSkge1xuICAgICAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ2VuZC10YWctdG9vLWVhcmx5LWlnbm9yZWQnLCB7IG5hbWU6ICdmb3JtJyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucmVtb3ZlKG5vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5lbmRUYWdMaXN0SXRlbSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICghdHJlZS5vcGVuRWxlbWVudHMuaW5MaXN0SXRlbVNjb3BlKG5hbWUpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyZWUuZ2VuZXJhdGVJbXBsaWVkRW5kVGFncyhuYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lICE9IG5hbWUpXG4gICAgICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcignZW5kLXRhZy10b28tZWFybHknLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxQb3BwZWQobmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Cb2R5LmVuZFRhZ0hlYWRpbmcgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBpZiAoIXRyZWUub3BlbkVsZW1lbnRzLmhhc051bWJlcmVkSGVhZGVyRWxlbWVudEluU2NvcGUoKSkge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyZWUuZ2VuZXJhdGVJbXBsaWVkRW5kVGFncygpO1xuICAgICAgICAgICAgaWYgKHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZSAhPSBuYW1lKVxuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcignZW5kLXRhZy10b28tZWFybHknLCB7IG5hbWU6IG5hbWUgfSk7XG5cbiAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnJlbW92ZV9vcGVuRWxlbWVudHNfdW50aWwoZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBlLmlzTnVtYmVyZWRIZWFkZXIoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQm9keS5lbmRUYWdGb3JtYXR0aW5nID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgaWYgKCF0cmVlLmFkb3B0aW9uQWdlbmN5RW5kVGFnKG5hbWUpKVxuICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnT3RoZXIobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5DYXB0aW9uID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5pbkNhcHRpb24uc3RhcnRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgaHRtbDogJ3N0YXJ0VGFnSHRtbCcsXG4gICAgICAgICAgICBjYXB0aW9uOiAnc3RhcnRUYWdUYWJsZUVsZW1lbnQnLFxuICAgICAgICAgICAgY29sOiAnc3RhcnRUYWdUYWJsZUVsZW1lbnQnLFxuICAgICAgICAgICAgY29sZ3JvdXA6ICdzdGFydFRhZ1RhYmxlRWxlbWVudCcsXG4gICAgICAgICAgICB0Ym9keTogJ3N0YXJ0VGFnVGFibGVFbGVtZW50JyxcbiAgICAgICAgICAgIHRkOiAnc3RhcnRUYWdUYWJsZUVsZW1lbnQnLFxuICAgICAgICAgICAgdGZvb3Q6ICdzdGFydFRhZ1RhYmxlRWxlbWVudCcsXG4gICAgICAgICAgICB0aGVhZDogJ3N0YXJ0VGFnVGFibGVFbGVtZW50JyxcbiAgICAgICAgICAgIHRyOiAnc3RhcnRUYWdUYWJsZUVsZW1lbnQnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5DYXB0aW9uLmVuZF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBjYXB0aW9uOiAnZW5kVGFnQ2FwdGlvbicsXG4gICAgICAgICAgICB0YWJsZTogJ2VuZFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIGJvZHk6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgY29sOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIGNvbGdyb3VwOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIGh0bWw6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgdGJvZHk6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgdGQ6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgdGZvb2Q6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgdGhlYWQ6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgdHI6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ2VuZFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ2FwdGlvbi5wcm9jZXNzQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIG1vZGVzLmluQm9keS5wcm9jZXNzQ2hhcmFjdGVycyhkYXRhKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNhcHRpb24uc3RhcnRUYWdUYWJsZUVsZW1lbnQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIHZhciBpZ25vcmVFbmRUYWcgPSAhdHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKCdjYXB0aW9uJyk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZygnY2FwdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFpZ25vcmVFbmRUYWcpIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5DYXB0aW9uLnN0YXJ0VGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5DYXB0aW9uLmVuZFRhZ0NhcHRpb24gPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBpZiAoIXRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZSgnY2FwdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgLy8gY29udGV4dCBjYXNlXG4gICAgICAgICAgICAgICAgLy8gVE9ETyBhc3NlcnQub2sodHJlZS5jb250ZXh0KTtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEFUIHRoaXMgY29kZSBpcyBxdWl0ZSBzaW1pbGFyIHRvIGVuZFRhZ1RhYmxlIGluIGluVGFibGVcbiAgICAgICAgICAgICAgICB0cmVlLmdlbmVyYXRlSW1wbGllZEVuZFRhZ3MoKTtcbiAgICAgICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lICE9ICdjYXB0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICAvLyBAdG9kbyB0aGlzIGlzIGNvbmZ1c2luZyBmb3IgaW1wbGllZCBlbmQgdGFnXG4gICAgICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcignZXhwZWN0ZWQtb25lLWVuZC10YWctYnV0LWdvdC1hbm90aGVyJywge1xuICAgICAgICAgICAgICAgICAgICAgICAgZ290TmFtZTogXCJjYXB0aW9uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBleHBlY3RlZE5hbWU6IHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxQb3BwZWQoJ2NhcHRpb24nKTtcbiAgICAgICAgICAgICAgICB0cmVlLmNsZWFyQWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpblRhYmxlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5DYXB0aW9uLmVuZFRhZ1RhYmxlID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1lbmQtdGFibGUtaW4tY2FwdGlvblwiKTtcbiAgICAgICAgICAgIHZhciBpZ25vcmVFbmRUYWcgPSAhdHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKCdjYXB0aW9uJyk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZygnY2FwdGlvbicpO1xuICAgICAgICAgICAgaWYgKCFpZ25vcmVFbmRUYWcpIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ2FwdGlvbi5lbmRUYWdJZ25vcmUgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNhcHRpb24uZW5kVGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBtb2Rlcy5pbkJvZHkucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNlbGwgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmluQ2VsbC5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgIGNhcHRpb246ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgY29sOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIGNvbGdyb3VwOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIHRib2R5OiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIHRkOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIHRmb290OiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIHRoOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIHRoZWFkOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIHRyOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdzdGFydFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ2VsbC5lbmRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgdGQ6ICdlbmRUYWdUYWJsZUNlbGwnLFxuICAgICAgICAgICAgdGg6ICdlbmRUYWdUYWJsZUNlbGwnLFxuICAgICAgICAgICAgYm9keTogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICBjYXB0aW9uOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIGNvbDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICBjb2xncm91cDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICBodG1sOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIHRhYmxlOiAnZW5kVGFnSW1wbHknLFxuICAgICAgICAgICAgdGJvZHk6ICdlbmRUYWdJbXBseScsXG4gICAgICAgICAgICB0Zm9vdDogJ2VuZFRhZ0ltcGx5JyxcbiAgICAgICAgICAgIHRoZWFkOiAnZW5kVGFnSW1wbHknLFxuICAgICAgICAgICAgdHI6ICdlbmRUYWdJbXBseScsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnZW5kVGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5DZWxsLnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnByb2Nlc3NDaGFyYWN0ZXJzKGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ2VsbC5zdGFydFRhZ1RhYmxlT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZSgndGQnKSB8fCB0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUoJ3RoJykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNsb3NlQ2VsbCgpO1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBjb250ZXh0IGNhc2VcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtc3RhcnQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ2VsbC5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgIG1vZGVzLmluQm9keS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ2VsbC5lbmRUYWdUYWJsZUNlbGwgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKG5hbWUpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5nZW5lcmF0ZUltcGxpZWRFbmRUYWdzKG5hbWUpO1xuICAgICAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgIT0gbmFtZS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1jZWxsLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcFVudGlsUG9wcGVkKG5hbWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRyZWUucG9wRWxlbWVudCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cmVlLmNsZWFyQWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpblJvdycpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNlbGwuZW5kVGFnSWdub3JlID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5DZWxsLmVuZFRhZ0ltcGx5ID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZShuYW1lKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2xvc2VDZWxsKCk7XG4gICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIHNvbWV0aW1lcyBjb250ZXh0IGNhc2VcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNlbGwuZW5kVGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBtb2Rlcy5pbkJvZHkucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNlbGwuY2xvc2VDZWxsID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKCd0ZCcpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbmRUYWdUYWJsZUNlbGwoJ3RkJyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZSgndGgnKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnVGFibGVDZWxsKCd0aCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG5cbiAgICAgICAgbW9kZXMuaW5Db2x1bW5Hcm91cCA9IE9iamVjdC5jcmVhdGUobW9kZXMuYmFzZSk7XG5cbiAgICAgICAgbW9kZXMuaW5Db2x1bW5Hcm91cC5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgIGNvbDogJ3N0YXJ0VGFnQ29sJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdzdGFydFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ29sdW1uR3JvdXAuZW5kX3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGNvbGdyb3VwOiAnZW5kVGFnQ29sZ3JvdXAnLFxuICAgICAgICAgICAgY29sOiAnZW5kVGFnQ29sJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdlbmRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNvbHVtbkdyb3VwLmlnbm9yZUVuZFRhZ0NvbGdyb3VwID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lID09ICdodG1sJztcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNvbHVtbkdyb3VwLnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgbGVhZGluZ1doaXRlc3BhY2UgPSBidWZmZXIudGFrZUxlYWRpbmdXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICBpZiAobGVhZGluZ1doaXRlc3BhY2UpXG4gICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRUZXh0KGxlYWRpbmdXaGl0ZXNwYWNlKTtcbiAgICAgICAgICAgIGlmICghYnVmZmVyLmxlbmd0aClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB2YXIgaWdub3JlRW5kVGFnID0gdGhpcy5pZ25vcmVFbmRUYWdDb2xncm91cCgpO1xuICAgICAgICAgICAgdGhpcy5lbmRUYWdDb2xncm91cCgnY29sZ3JvdXAnKTtcbiAgICAgICAgICAgIGlmICghaWdub3JlRW5kVGFnKSB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0NoYXJhY3RlcnMoYnVmZmVyKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkNvbHVtbkdyb3VwLnN0YXJ0VGFnQ29sID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRTZWxmQ2xvc2luZ0VsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Db2x1bW5Hcm91cC5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgIHZhciBpZ25vcmVFbmRUYWcgPSB0aGlzLmlnbm9yZUVuZFRhZ0NvbGdyb3VwKCk7XG4gICAgICAgICAgICB0aGlzLmVuZFRhZ0NvbGdyb3VwKCdjb2xncm91cCcpO1xuICAgICAgICAgICAgaWYgKCFpZ25vcmVFbmRUYWcpIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ29sdW1uR3JvdXAuZW5kVGFnQ29sZ3JvdXAgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5pZ25vcmVFbmRUYWdDb2xncm91cCgpKSB7XG4gICAgICAgICAgICAgICAgLy8gY29udGV4dCBjYXNlXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogYXNzZXJ0Lm9rKHRyZWUuY29udGV4dCk7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyZWUucG9wRWxlbWVudCgpO1xuICAgICAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5UYWJsZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ29sdW1uR3JvdXAuZW5kVGFnQ29sID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwibm8tZW5kLXRhZ1wiLCB7IG5hbWU6ICdjb2wnIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluQ29sdW1uR3JvdXAuZW5kVGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB2YXIgaWdub3JlRW5kVGFnID0gdGhpcy5pZ25vcmVFbmRUYWdDb2xncm91cCgpO1xuICAgICAgICAgICAgdGhpcy5lbmRUYWdDb2xncm91cCgnY29sZ3JvdXAnKTtcbiAgICAgICAgICAgIGlmICghaWdub3JlRW5kVGFnKSB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkZvcmVpZ25Db250ZW50ID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5pbkZvcmVpZ25Db250ZW50LnByb2Nlc3NTdGFydFRhZyA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICBpZiAoWydiJywgJ2JpZycsICdibG9ja3F1b3RlJywgJ2JvZHknLCAnYnInLCAnY2VudGVyJywgJ2NvZGUnLCAnZGQnLCAnZGl2JywgJ2RsJywgJ2R0JywgJ2VtJywgJ2VtYmVkJywgJ2gxJywgJ2gyJywgJ2gzJywgJ2g0JywgJ2g1JywgJ2g2JywgJ2hlYWQnLCAnaHInLCAnaScsICdpbWcnLCAnbGknLCAnbGlzdGluZycsICdtZW51JywgJ21ldGEnLCAnbm9icicsICdvbCcsICdwJywgJ3ByZScsICdydWJ5JywgJ3MnLCAnc21hbGwnLCAnc3BhbicsICdzdHJvbmcnLCAnc3RyaWtlJywgJ3N1YicsICdzdXAnLCAndGFibGUnLCAndHQnLCAndScsICd1bCcsICd2YXInXS5pbmRleE9mKG5hbWUpICE9IC0xXG4gICAgICAgICAgICAgICAgfHwgKG5hbWUgPT0gJ2ZvbnQnICYmIGF0dHJpYnV0ZXMuc29tZShmdW5jdGlvbihhdHRyKSB7IHJldHVybiBbJ2NvbG9yJywgJ2ZhY2UnLCAnc2l6ZSddLmluZGV4T2YoYXR0ci5ub2RlTmFtZSkgPj0gMCB9KSkpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtaHRtbC1lbGVtZW50LWluLWZvcmVpZ24tY29udGVudCcsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgICAgICB3aGlsZSAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkuaXNGb3JlaWduKClcbiAgICAgICAgICAgICAgICAgICAgJiYgIXRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmlzSHRtbEludGVncmF0aW9uUG9pbnQoKVxuICAgICAgICAgICAgICAgICAgICAmJiAhdHJlZS5jdXJyZW50U3RhY2tJdGVtKCkuaXNNYXRoTUxUZXh0SW50ZWdyYXRpb25Qb2ludCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubmFtZXNwYWNlVVJJID09IFwiaHR0cDovL3d3dy53My5vcmcvMTk5OC9NYXRoL01hdGhNTFwiKSB7XG4gICAgICAgICAgICAgICAgYXR0cmlidXRlcyA9IHRyZWUuYWRqdXN0TWF0aE1MQXR0cmlidXRlcyhhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5uYW1lc3BhY2VVUkkgPT0gXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiKSB7XG4gICAgICAgICAgICAgICAgbmFtZSA9IHRyZWUuYWRqdXN0U1ZHVGFnTmFtZUNhc2UobmFtZSk7XG4gICAgICAgICAgICAgICAgYXR0cmlidXRlcyA9IHRyZWUuYWRqdXN0U1ZHQXR0cmlidXRlcyhhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF0dHJpYnV0ZXMgPSB0cmVlLmFkanVzdEZvcmVpZ25BdHRyaWJ1dGVzKGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRGb3JlaWduRWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzLCB0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5uYW1lc3BhY2VVUkksIHNlbGZDbG9zaW5nKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkZvcmVpZ25Db250ZW50LnByb2Nlc3NFbmRUYWcgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB2YXIgbm9kZSA9IHRyZWUuY3VycmVudFN0YWNrSXRlbSgpO1xuICAgICAgICAgICAgdmFyIGluZGV4ID0gdHJlZS5vcGVuRWxlbWVudHMubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgIGlmIChub2RlLmxvY2FsTmFtZS50b0xvd2VyQ2FzZSgpICE9IG5hbWUpXG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1lbmQtdGFnXCIsIHsgbmFtZTogbmFtZSB9KTtcblxuICAgICAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgICAgICBpZiAoaW5kZXggPT09IDApXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGlmIChub2RlLmxvY2FsTmFtZS50b0xvd2VyQ2FzZSgpID09IG5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgd2hpbGUgKHRyZWUub3BlbkVsZW1lbnRzLnBvcCgpICE9IG5vZGUpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaW5kZXggLT0gMTtcbiAgICAgICAgICAgICAgICBub2RlID0gdHJlZS5vcGVuRWxlbWVudHMuaXRlbShpbmRleCk7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUuaXNGb3JlaWduKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkZvcmVpZ25Db250ZW50LnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgY2hhcmFjdGVycyA9IGJ1ZmZlci50YWtlUmVtYWluaW5nKCk7XG4gICAgICAgICAgICBjaGFyYWN0ZXJzID0gY2hhcmFjdGVycy5yZXBsYWNlKC9cXHUwMDAwL2csIGZ1bmN0aW9uKG1hdGNoLCBpbmRleCkge1xuICAgICAgICAgICAgICAgIC8vIEB0b2RvIHBvc2l0aW9uXG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdpbnZhbGlkLWNvZGVwb2ludCcpO1xuICAgICAgICAgICAgICAgIHJldHVybiAnXFx1RkZGRCc7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmICh0cmVlLmZyYW1lc2V0T2sgJiYgIWlzQWxsV2hpdGVzcGFjZU9yUmVwbGFjZW1lbnRDaGFyYWN0ZXJzKGNoYXJhY3RlcnMpKVxuICAgICAgICAgICAgICAgIHRyZWUuZnJhbWVzZXRPayA9IGZhbHNlO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRUZXh0KGNoYXJhY3RlcnMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZE5vc2NyaXB0ID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWROb3NjcmlwdC5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgIGJhc2Vmb250OiAnc3RhcnRUYWdCYXNlZm9udEJnc291bmRMaW5rTWV0YU5vZnJhbWVzU3R5bGUnLFxuICAgICAgICAgICAgYmdzb3VuZDogJ3N0YXJ0VGFnQmFzZWZvbnRCZ3NvdW5kTGlua01ldGFOb2ZyYW1lc1N0eWxlJyxcbiAgICAgICAgICAgIGxpbms6ICdzdGFydFRhZ0Jhc2Vmb250Qmdzb3VuZExpbmtNZXRhTm9mcmFtZXNTdHlsZScsXG4gICAgICAgICAgICBtZXRhOiAnc3RhcnRUYWdCYXNlZm9udEJnc291bmRMaW5rTWV0YU5vZnJhbWVzU3R5bGUnLFxuICAgICAgICAgICAgbm9mcmFtZXM6ICdzdGFydFRhZ0Jhc2Vmb250Qmdzb3VuZExpbmtNZXRhTm9mcmFtZXNTdHlsZScsXG4gICAgICAgICAgICBzdHlsZTogJ3N0YXJ0VGFnQmFzZWZvbnRCZ3NvdW5kTGlua01ldGFOb2ZyYW1lc1N0eWxlJyxcbiAgICAgICAgICAgIGhlYWQ6ICdzdGFydFRhZ0hlYWROb3NjcmlwdCcsXG4gICAgICAgICAgICBub3NjcmlwdDogJ3N0YXJ0VGFnSGVhZE5vc2NyaXB0JyxcbiAgICAgICAgICAgIFwiLWRlZmF1bHRcIjogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkTm9zY3JpcHQuZW5kX3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIG5vc2NyaXB0OiAnZW5kVGFnTm9zY3JpcHQnLFxuICAgICAgICAgICAgYnI6ICdlbmRUYWdCcicsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnZW5kVGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkTm9zY3JpcHQucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBsZWFkaW5nV2hpdGVzcGFjZSA9IGJ1ZmZlci50YWtlTGVhZGluZ1doaXRlc3BhY2UoKTtcbiAgICAgICAgICAgIGlmIChsZWFkaW5nV2hpdGVzcGFjZSlcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydFRleHQobGVhZGluZ1doaXRlc3BhY2UpO1xuICAgICAgICAgICAgaWYgKCFidWZmZXIubGVuZ3RoKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIC8vIEZJWE1FIGVycm9yIG1lc3NhZ2VcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtY2hhci1pbi1mcmFtZXNldFwiKTtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0NoYXJhY3RlcnMoYnVmZmVyKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWROb3NjcmlwdC5wcm9jZXNzQ29tbWVudCA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIG1vZGVzLmluSGVhZC5wcm9jZXNzQ29tbWVudChkYXRhKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWROb3NjcmlwdC5zdGFydFRhZ0Jhc2Vmb250Qmdzb3VuZExpbmtNZXRhTm9mcmFtZXNTdHlsZSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIG1vZGVzLmluSGVhZC5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkTm9zY3JpcHQuc3RhcnRUYWdIZWFkTm9zY3JpcHQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICAvLyBGSVhNRSBlcnJvciBtZXNzYWdlXG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLXN0YXJ0LXRhZy1pbi1mcmFtZXNldFwiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkTm9zY3JpcHQuc3RhcnRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIC8vIEZJWE1FIGVycm9yIG1lc3NhZ2VcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtc3RhcnQtdGFnLWluLWZyYW1lc2V0XCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluSGVhZE5vc2NyaXB0LmVuZFRhZ0JyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgLy8gRklYTUUgZXJyb3IgbWVzc2FnZVxuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1lbmQtdGFnLWluLWZyYW1lc2V0XCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIHRoaXMuYW55dGhpbmdFbHNlKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWROb3NjcmlwdC5lbmRUYWdOb3NjcmlwdCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUucG9wRWxlbWVudCgpO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpbkhlYWQnKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkhlYWROb3NjcmlwdC5lbmRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIC8vIEZJWE1FIGVycm9yIG1lc3NhZ2VcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtZW5kLXRhZy1pbi1mcmFtZXNldFwiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5IZWFkTm9zY3JpcHQuYW55dGhpbmdFbHNlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0cmVlLnBvcEVsZW1lbnQoKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5IZWFkJyk7XG4gICAgICAgIH07XG5cblxuICAgICAgICBtb2Rlcy5pbkZyYW1lc2V0ID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5pbkZyYW1lc2V0LnN0YXJ0X3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIGh0bWw6ICdzdGFydFRhZ0h0bWwnLFxuICAgICAgICAgICAgZnJhbWVzZXQ6ICdzdGFydFRhZ0ZyYW1lc2V0JyxcbiAgICAgICAgICAgIGZyYW1lOiAnc3RhcnRUYWdGcmFtZScsXG4gICAgICAgICAgICBub2ZyYW1lczogJ3N0YXJ0VGFnTm9mcmFtZXMnLFxuICAgICAgICAgICAgXCItZGVmYXVsdFwiOiAnc3RhcnRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pbkZyYW1lc2V0LmVuZF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBmcmFtZXNldDogJ2VuZFRhZ0ZyYW1lc2V0JyxcbiAgICAgICAgICAgIG5vZnJhbWVzOiAnZW5kVGFnTm9mcmFtZXMnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ2VuZFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluRnJhbWVzZXQucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWNoYXItaW4tZnJhbWVzZXRcIik7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5GcmFtZXNldC5zdGFydFRhZ0ZyYW1lc2V0ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluRnJhbWVzZXQuc3RhcnRUYWdGcmFtZSA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0U2VsZkNsb3NpbmdFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluRnJhbWVzZXQuc3RhcnRUYWdOb2ZyYW1lcyA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIG1vZGVzLmluQm9keS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5GcmFtZXNldC5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1zdGFydC10YWctaW4tZnJhbWVzZXRcIiwgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluRnJhbWVzZXQuZW5kVGFnRnJhbWVzZXQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lID09ICdodG1sJykge1xuICAgICAgICAgICAgICAgIC8vIGNvbnRleHQgY2FzZVxuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtZnJhbWVzZXQtaW4tZnJhbWVzZXQtaW5uZXJodG1sXCIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBvcEVsZW1lbnQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCF0cmVlLmNvbnRleHQgJiYgdHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lICE9ICdmcmFtZXNldCcpIHtcbiAgICAgICAgICAgICAgICAvLyBJZiB3ZSdyZSBub3QgaW4gY29udGV4dCBtb2RlIGFuIHRoZSBjdXJyZW50IG5vZGUgaXMgbm90IGEgXCJmcmFtZXNldFwiIGVsZW1lbnQgKGFueW1vcmUpIHRoZW4gc3dpdGNoXG4gICAgICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdhZnRlckZyYW1lc2V0Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5GcmFtZXNldC5lbmRUYWdOb2ZyYW1lcyA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIG1vZGVzLmluQm9keS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluRnJhbWVzZXQuZW5kVGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWVuZC10YWctaW4tZnJhbWVzZXRcIiwgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGUgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmluVGFibGUuc3RhcnRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgaHRtbDogJ3N0YXJ0VGFnSHRtbCcsXG4gICAgICAgICAgICBjYXB0aW9uOiAnc3RhcnRUYWdDYXB0aW9uJyxcbiAgICAgICAgICAgIGNvbGdyb3VwOiAnc3RhcnRUYWdDb2xncm91cCcsXG4gICAgICAgICAgICBjb2w6ICdzdGFydFRhZ0NvbCcsXG4gICAgICAgICAgICB0YWJsZTogJ3N0YXJ0VGFnVGFibGUnLFxuICAgICAgICAgICAgdGJvZHk6ICdzdGFydFRhZ1Jvd0dyb3VwJyxcbiAgICAgICAgICAgIHRmb290OiAnc3RhcnRUYWdSb3dHcm91cCcsXG4gICAgICAgICAgICB0aGVhZDogJ3N0YXJ0VGFnUm93R3JvdXAnLFxuICAgICAgICAgICAgdGQ6ICdzdGFydFRhZ0ltcGx5VGJvZHknLFxuICAgICAgICAgICAgdGg6ICdzdGFydFRhZ0ltcGx5VGJvZHknLFxuICAgICAgICAgICAgdHI6ICdzdGFydFRhZ0ltcGx5VGJvZHknLFxuICAgICAgICAgICAgc3R5bGU6ICdzdGFydFRhZ1N0eWxlU2NyaXB0JyxcbiAgICAgICAgICAgIHNjcmlwdDogJ3N0YXJ0VGFnU3R5bGVTY3JpcHQnLFxuICAgICAgICAgICAgaW5wdXQ6ICdzdGFydFRhZ0lucHV0JyxcbiAgICAgICAgICAgIGZvcm06ICdzdGFydFRhZ0Zvcm0nLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZS5lbmRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgdGFibGU6ICdlbmRUYWdUYWJsZScsXG4gICAgICAgICAgICBib2R5OiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIGNhcHRpb246ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgY29sOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIGNvbGdyb3VwOiAnZW5kVGFnSWdub3JlJyxcbiAgICAgICAgICAgIGh0bWw6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgdGJvZHk6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgdGQ6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgdGZvb3Q6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgdGg6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgdGhlYWQ6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgdHI6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ2VuZFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGUucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkuaXNGb3N0ZXJQYXJlbnRpbmcoKSkge1xuICAgICAgICAgICAgICAgIHZhciBvcmlnaW5hbEluc2VydGlvbk1vZGUgPSB0cmVlLmluc2VydGlvbk1vZGVOYW1lO1xuICAgICAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSgnaW5UYWJsZVRleHQnKTtcbiAgICAgICAgICAgICAgICB0cmVlLm9yaWdpbmFsSW5zZXJ0aW9uTW9kZSA9IG9yaWdpbmFsSW5zZXJ0aW9uTW9kZTtcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0NoYXJhY3RlcnMoZGF0YSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyZWUucmVkaXJlY3RBdHRhY2hUb0Zvc3RlclBhcmVudCA9IHRydWU7XG4gICAgICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnByb2Nlc3NDaGFyYWN0ZXJzKGRhdGEpO1xuICAgICAgICAgICAgICAgIHRyZWUucmVkaXJlY3RBdHRhY2hUb0Zvc3RlclBhcmVudCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGUuc3RhcnRUYWdDYXB0aW9uID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxUYWJsZVNjb3BlTWFya2VyKCk7XG4gICAgICAgICAgICB0cmVlLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cy5wdXNoKE1hcmtlcik7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luQ2FwdGlvbicpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGUuc3RhcnRUYWdDb2xncm91cCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcFVudGlsVGFibGVTY29wZU1hcmtlcigpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpbkNvbHVtbkdyb3VwJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZS5zdGFydFRhZ0NvbCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRUYWdDb2xncm91cCgnY29sZ3JvdXAnLCBbXSk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGUuc3RhcnRUYWdSb3dHcm91cCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcFVudGlsVGFibGVTY29wZU1hcmtlcigpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpblRhYmxlQm9keScpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGUuc3RhcnRUYWdJbXBseVRib2R5ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdGhpcy5zdGFydFRhZ1Jvd0dyb3VwKCd0Ym9keScsIFtdKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZS5zdGFydFRhZ1RhYmxlID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1zdGFydC10YWctaW1wbGllcy1lbmQtdGFnXCIsXG4gICAgICAgICAgICAgICAgeyBzdGFydE5hbWU6IFwidGFibGVcIiwgZW5kTmFtZTogXCJ0YWJsZVwiIH0pO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFbmRUYWcoJ3RhYmxlJyk7XG4gICAgICAgICAgICBpZiAoIXRyZWUuY29udGV4dCkgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlLnN0YXJ0VGFnU3R5bGVTY3JpcHQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBtb2Rlcy5pbkhlYWQucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGUuc3RhcnRUYWdJbnB1dCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGF0dHJpYnV0ZXNba2V5XS5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09ICd0eXBlJykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXR0cmlidXRlc1trZXldLm5vZGVWYWx1ZS50b0xvd2VyQ2FzZSgpID09ICdoaWRkZW4nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWhpZGRlbi1pbnB1dC1pbi10YWJsZVwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFhYWCBhc3NvY2lhdGUgd2l0aCBmb3JtXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3AoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnN0YXJ0VGFnT3RoZXIobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZS5zdGFydFRhZ0Zvcm0gPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWZvcm0taW4tdGFibGVcIik7XG4gICAgICAgICAgICBpZiAoIXRyZWUuZm9ybSkge1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgICAgICB0cmVlLmZvcm0gPSB0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKTtcbiAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlLnN0YXJ0VGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1zdGFydC10YWctaW1wbGllcy10YWJsZS12b29kb29cIiwgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgdHJlZS5yZWRpcmVjdEF0dGFjaFRvRm9zdGVyUGFyZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIG1vZGVzLmluQm9keS5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICAgICAgdHJlZS5yZWRpcmVjdEF0dGFjaFRvRm9zdGVyUGFyZW50ID0gZmFsc2U7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZS5lbmRUYWdUYWJsZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUobmFtZSkpIHtcbiAgICAgICAgICAgICAgICB0cmVlLmdlbmVyYXRlSW1wbGllZEVuZFRhZ3MoKTtcbiAgICAgICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lICE9IG5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwiZW5kLXRhZy10b28tZWFybHktbmFtZWRcIiwgeyBnb3ROYW1lOiAndGFibGUnLCBleHBlY3RlZE5hbWU6IHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZSB9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3BVbnRpbFBvcHBlZCgndGFibGUnKTtcbiAgICAgICAgICAgICAgICB0cmVlLnJlc2V0SW5zZXJ0aW9uTW9kZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gVE9ETyBhc3NlcnQub2sodHJlZS5jb250ZXh0KTtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlLmVuZFRhZ0lnbm9yZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtZW5kLXRhZ1wiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZS5lbmRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtZW5kLXRhZy1pbXBsaWVzLXRhYmxlLXZvb2Rvb1wiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICAvLyBNYWtlIGFsbCB0aGUgc3BlY2lhbCBlbGVtZW50IHJlYXJyYW5naW5nIHZvb2RvbyBraWNrIGluXG4gICAgICAgICAgICB0cmVlLnJlZGlyZWN0QXR0YWNoVG9Gb3N0ZXJQYXJlbnQgPSB0cnVlO1xuICAgICAgICAgICAgLy8gUHJvY2VzcyB0aGUgZW5kIHRhZyBpbiB0aGUgXCJpbiBib2R5XCIgbW9kZVxuICAgICAgICAgICAgbW9kZXMuaW5Cb2R5LnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgICAgICB0cmVlLnJlZGlyZWN0QXR0YWNoVG9Gb3N0ZXJQYXJlbnQgPSBmYWxzZTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlVGV4dCA9IE9iamVjdC5jcmVhdGUobW9kZXMuYmFzZSk7XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZVRleHQuZmx1c2hDaGFyYWN0ZXJzID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgY2hhcmFjdGVycyA9IHRyZWUucGVuZGluZ1RhYmxlQ2hhcmFjdGVycy5qb2luKCcnKTtcbiAgICAgICAgICAgIGlmICghaXNBbGxXaGl0ZXNwYWNlKGNoYXJhY3RlcnMpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5yZWRpcmVjdEF0dGFjaFRvRm9zdGVyUGFyZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRUZXh0KGNoYXJhY3RlcnMpO1xuICAgICAgICAgICAgICAgIHRyZWUuZnJhbWVzZXRPayA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHRyZWUucmVkaXJlY3RBdHRhY2hUb0Zvc3RlclBhcmVudCA9IGZhbHNlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydFRleHQoY2hhcmFjdGVycyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cmVlLnBlbmRpbmdUYWJsZUNoYXJhY3RlcnMgPSBbXTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlVGV4dC5wcm9jZXNzQ29tbWVudCA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIHRoaXMuZmx1c2hDaGFyYWN0ZXJzKCk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUodHJlZS5vcmlnaW5hbEluc2VydGlvbk1vZGUpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NDb21tZW50KGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGVUZXh0LnByb2Nlc3NFT0YgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICB0aGlzLmZsdXNoQ2hhcmFjdGVycygpO1xuICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKHRyZWUub3JpZ2luYWxJbnNlcnRpb25Nb2RlKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRU9GKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZVRleHQucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBjaGFyYWN0ZXJzID0gYnVmZmVyLnRha2VSZW1haW5pbmcoKTtcbiAgICAgICAgICAgIGNoYXJhY3RlcnMgPSBjaGFyYWN0ZXJzLnJlcGxhY2UoL1xcdTAwMDAvZywgZnVuY3Rpb24obWF0Y2gsIGluZGV4KSB7XG4gICAgICAgICAgICAgICAgLy8gQHRvZG8gcG9zaXRpb25cbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJpbnZhbGlkLWNvZGVwb2ludFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmICghY2hhcmFjdGVycylcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0cmVlLnBlbmRpbmdUYWJsZUNoYXJhY3RlcnMucHVzaChjaGFyYWN0ZXJzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlVGV4dC5wcm9jZXNzU3RhcnRUYWcgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzLCBzZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgdGhpcy5mbHVzaENoYXJhY3RlcnMoKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSh0cmVlLm9yaWdpbmFsSW5zZXJ0aW9uTW9kZSk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlVGV4dC5wcm9jZXNzRW5kVGFnID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdGhpcy5mbHVzaENoYXJhY3RlcnMoKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSh0cmVlLm9yaWdpbmFsSW5zZXJ0aW9uTW9kZSk7XG4gICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlQm9keSA9IE9iamVjdC5jcmVhdGUobW9kZXMuYmFzZSk7XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZUJvZHkuc3RhcnRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgaHRtbDogJ3N0YXJ0VGFnSHRtbCcsXG4gICAgICAgICAgICB0cjogJ3N0YXJ0VGFnVHInLFxuICAgICAgICAgICAgdGQ6ICdzdGFydFRhZ1RhYmxlQ2VsbCcsXG4gICAgICAgICAgICB0aDogJ3N0YXJ0VGFnVGFibGVDZWxsJyxcbiAgICAgICAgICAgIGNhcHRpb246ICdzdGFydFRhZ1RhYmxlT3RoZXInLFxuICAgICAgICAgICAgY29sOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIGNvbGdyb3VwOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIHRib2R5OiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIHRmb290OiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIHRoZWFkOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdzdGFydFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGVCb2R5LmVuZF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICB0YWJsZTogJ2VuZFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIHRib2R5OiAnZW5kVGFnVGFibGVSb3dHcm91cCcsXG4gICAgICAgICAgICB0Zm9vdDogJ2VuZFRhZ1RhYmxlUm93R3JvdXAnLFxuICAgICAgICAgICAgdGhlYWQ6ICdlbmRUYWdUYWJsZVJvd0dyb3VwJyxcbiAgICAgICAgICAgIGJvZHk6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgY2FwdGlvbjogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICBjb2w6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgY29sZ3JvdXA6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgaHRtbDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0ZDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0aDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0cjogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnZW5kVGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZUJvZHkucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICBtb2Rlcy5pblRhYmxlLnByb2Nlc3NDaGFyYWN0ZXJzKGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGVCb2R5LnN0YXJ0VGFnVHIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3BVbnRpbFRhYmxlQm9keVNjb3BlTWFya2VyKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luUm93Jyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZUJvZHkuc3RhcnRUYWdUYWJsZUNlbGwgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWNlbGwtaW4tdGFibGUtYm9keVwiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0VGFnVHIoJ3RyJywgW10pO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlQm9keS5zdGFydFRhZ1RhYmxlT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICAvLyBYWFggYW55IGlkZWFzIG9uIGhvdyB0byBzaGFyZSB0aGlzIHdpdGggZW5kVGFnVGFibGVcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUoJ3Rib2R5JykgfHwgdHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKCd0aGVhZCcpIHx8IHRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZSgndGZvb3QnKSkge1xuICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcFVudGlsVGFibGVCb2R5U2NvcGVNYXJrZXIoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmVuZFRhZ1RhYmxlUm93R3JvdXAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lKTtcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBjb250ZXh0IGNhc2VcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtc3RhcnQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGVCb2R5LnN0YXJ0VGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBtb2Rlcy5pblRhYmxlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlQm9keS5lbmRUYWdUYWJsZVJvd0dyb3VwID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZShuYW1lKSkge1xuICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcFVudGlsVGFibGVCb2R5U2NvcGVNYXJrZXIoKTtcbiAgICAgICAgICAgICAgICB0cmVlLnBvcEVsZW1lbnQoKTtcbiAgICAgICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luVGFibGUnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWctaW4tdGFibGUtYm9keScsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblRhYmxlQm9keS5lbmRUYWdUYWJsZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUoJ3Rib2R5JykgfHwgdHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKCd0aGVhZCcpIHx8IHRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZSgndGZvb3QnKSkge1xuICAgICAgICAgICAgICAgIHRyZWUub3BlbkVsZW1lbnRzLnBvcFVudGlsVGFibGVCb2R5U2NvcGVNYXJrZXIoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmVuZFRhZ1RhYmxlUm93R3JvdXAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lKTtcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gY29udGV4dCBjYXNlXG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWcnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5UYWJsZUJvZHkuZW5kVGFnSWdub3JlID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1lbmQtdGFnLWluLXRhYmxlLWJvZHlcIiwgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluVGFibGVCb2R5LmVuZFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgbW9kZXMuaW5UYWJsZS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0ID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdC5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgIG9wdGlvbjogJ3N0YXJ0VGFnT3B0aW9uJyxcbiAgICAgICAgICAgIG9wdGdyb3VwOiAnc3RhcnRUYWdPcHRncm91cCcsXG4gICAgICAgICAgICBzZWxlY3Q6ICdzdGFydFRhZ1NlbGVjdCcsXG4gICAgICAgICAgICBpbnB1dDogJ3N0YXJ0VGFnSW5wdXQnLFxuICAgICAgICAgICAga2V5Z2VuOiAnc3RhcnRUYWdJbnB1dCcsXG4gICAgICAgICAgICB0ZXh0YXJlYTogJ3N0YXJ0VGFnSW5wdXQnLFxuICAgICAgICAgICAgc2NyaXB0OiAnc3RhcnRUYWdTY3JpcHQnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5TZWxlY3QuZW5kX3RhZ19oYW5kbGVycyA9IHtcbiAgICAgICAgICAgIG9wdGlvbjogJ2VuZFRhZ09wdGlvbicsXG4gICAgICAgICAgICBvcHRncm91cDogJ2VuZFRhZ09wdGdyb3VwJyxcbiAgICAgICAgICAgIHNlbGVjdDogJ2VuZFRhZ1NlbGVjdCcsXG4gICAgICAgICAgICBjYXB0aW9uOiAnZW5kVGFnVGFibGVFbGVtZW50cycsXG4gICAgICAgICAgICB0YWJsZTogJ2VuZFRhZ1RhYmxlRWxlbWVudHMnLFxuICAgICAgICAgICAgdGJvZHk6ICdlbmRUYWdUYWJsZUVsZW1lbnRzJyxcbiAgICAgICAgICAgIHRmb290OiAnZW5kVGFnVGFibGVFbGVtZW50cycsXG4gICAgICAgICAgICB0aGVhZDogJ2VuZFRhZ1RhYmxlRWxlbWVudHMnLFxuICAgICAgICAgICAgdHI6ICdlbmRUYWdUYWJsZUVsZW1lbnRzJyxcbiAgICAgICAgICAgIHRkOiAnZW5kVGFnVGFibGVFbGVtZW50cycsXG4gICAgICAgICAgICB0aDogJ2VuZFRhZ1RhYmxlRWxlbWVudHMnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ2VuZFRhZ090aGVyJ1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0LnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci50YWtlUmVtYWluaW5nKCk7XG4gICAgICAgICAgICBkYXRhID0gZGF0YS5yZXBsYWNlKC9cXHUwMDAwL2csIGZ1bmN0aW9uKG1hdGNoLCBpbmRleCkge1xuICAgICAgICAgICAgICAgIC8vIEB0b2RvIHBvc2l0aW9uXG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwiaW52YWxpZC1jb2RlcG9pbnRcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoIWRhdGEpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRUZXh0KGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0LnN0YXJ0VGFnT3B0aW9uID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgLy8gd2UgbmVlZCB0byBpbXBseSA8L29wdGlvbj4gaWYgPG9wdGlvbj4gaXMgdGhlIGN1cnJlbnQgbm9kZVxuICAgICAgICAgICAgaWYgKHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZSA9PSAnb3B0aW9uJylcbiAgICAgICAgICAgICAgICB0cmVlLnBvcEVsZW1lbnQoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdC5zdGFydFRhZ09wdGdyb3VwID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgaWYgKHRyZWUuY3VycmVudFN0YWNrSXRlbSgpLmxvY2FsTmFtZSA9PSAnb3B0aW9uJylcbiAgICAgICAgICAgICAgICB0cmVlLnBvcEVsZW1lbnQoKTtcbiAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgPT0gJ29wdGdyb3VwJylcbiAgICAgICAgICAgICAgICB0cmVlLnBvcEVsZW1lbnQoKTtcbiAgICAgICAgICAgIHRyZWUuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdC5lbmRUYWdPcHRpb24gPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lICE9PSAnb3B0aW9uJykge1xuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnLWluLXNlbGVjdCcsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0cmVlLnBvcEVsZW1lbnQoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdC5lbmRUYWdPcHRncm91cCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIC8vIDwvb3B0Z3JvdXA+IGltcGxpY2l0bHkgY2xvc2VzIDxvcHRpb24+XG4gICAgICAgICAgICBpZiAodHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lID09ICdvcHRpb24nICYmIHRyZWUub3BlbkVsZW1lbnRzLml0ZW0odHJlZS5vcGVuRWxlbWVudHMubGVuZ3RoIC0gMikubG9jYWxOYW1lID09ICdvcHRncm91cCcpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnBvcEVsZW1lbnQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaXQgYWxzbyBjbG9zZXMgPC9vcHRncm91cD5cbiAgICAgICAgICAgIGlmICh0cmVlLmN1cnJlbnRTdGFja0l0ZW0oKS5sb2NhbE5hbWUgPT0gJ29wdGdyb3VwJykge1xuICAgICAgICAgICAgICAgIHRyZWUucG9wRWxlbWVudCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBCdXQgbm90aGluZyBlbHNlXG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWctaW4tc2VsZWN0JywgeyBuYW1lOiAnb3B0Z3JvdXAnIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0LnN0YXJ0VGFnU2VsZWN0ID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1zZWxlY3QtaW4tc2VsZWN0XCIpO1xuICAgICAgICAgICAgdGhpcy5lbmRUYWdTZWxlY3QoJ3NlbGVjdCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0LmVuZFRhZ1NlbGVjdCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUoJ3NlbGVjdCcpKSB7XG4gICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxQb3BwZWQoJ3NlbGVjdCcpO1xuICAgICAgICAgICAgICAgIHRyZWUucmVzZXRJbnNlcnRpb25Nb2RlKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGNvbnRleHQgY2FzZVxuICAgICAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0LnN0YXJ0VGFnSW5wdXQgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWlucHV0LWluLXNlbGVjdFwiKTtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pblNlbGVjdFNjb3BlKCdzZWxlY3QnKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnU2VsZWN0KCdzZWxlY3QnKTtcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0LnN0YXJ0VGFnU2NyaXB0ID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgbW9kZXMuaW5IZWFkLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdC5lbmRUYWdUYWJsZUVsZW1lbnRzID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCd1bmV4cGVjdGVkLWVuZC10YWctaW4tc2VsZWN0JywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgaWYgKHRyZWUub3BlbkVsZW1lbnRzLmluVGFibGVTY29wZShuYW1lKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZW5kVGFnU2VsZWN0KCdzZWxlY3QnKTtcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdC5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKFwidW5leHBlY3RlZC1zdGFydC10YWctaW4tc2VsZWN0XCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdC5lbmRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcigndW5leHBlY3RlZC1lbmQtdGFnLWluLXNlbGVjdCcsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdEluVGFibGUgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0SW5UYWJsZS5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBjYXB0aW9uOiAnc3RhcnRUYWdUYWJsZScsXG4gICAgICAgICAgICB0YWJsZTogJ3N0YXJ0VGFnVGFibGUnLFxuICAgICAgICAgICAgdGJvZHk6ICdzdGFydFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIHRmb290OiAnc3RhcnRUYWdUYWJsZScsXG4gICAgICAgICAgICB0aGVhZDogJ3N0YXJ0VGFnVGFibGUnLFxuICAgICAgICAgICAgdHI6ICdzdGFydFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIHRkOiAnc3RhcnRUYWdUYWJsZScsXG4gICAgICAgICAgICB0aDogJ3N0YXJ0VGFnVGFibGUnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5TZWxlY3RJblRhYmxlLmVuZF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBjYXB0aW9uOiAnZW5kVGFnVGFibGUnLFxuICAgICAgICAgICAgdGFibGU6ICdlbmRUYWdUYWJsZScsXG4gICAgICAgICAgICB0Ym9keTogJ2VuZFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIHRmb290OiAnZW5kVGFnVGFibGUnLFxuICAgICAgICAgICAgdGhlYWQ6ICdlbmRUYWdUYWJsZScsXG4gICAgICAgICAgICB0cjogJ2VuZFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIHRkOiAnZW5kVGFnVGFibGUnLFxuICAgICAgICAgICAgdGg6ICdlbmRUYWdUYWJsZScsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnZW5kVGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5TZWxlY3RJblRhYmxlLnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgbW9kZXMuaW5TZWxlY3QucHJvY2Vzc0NoYXJhY3RlcnMoZGF0YSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5TZWxlY3RJblRhYmxlLnN0YXJ0VGFnVGFibGUgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLXRhYmxlLWVsZW1lbnQtc3RhcnQtdGFnLWluLXNlbGVjdC1pbi10YWJsZVwiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB0aGlzLmVuZFRhZ090aGVyKFwic2VsZWN0XCIpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdEluVGFibGUuc3RhcnRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICBtb2Rlcy5pblNlbGVjdC5wcm9jZXNzU3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluU2VsZWN0SW5UYWJsZS5lbmRUYWdUYWJsZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtdGFibGUtZWxlbWVudC1lbmQtdGFnLWluLXNlbGVjdC1pbi10YWJsZVwiLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICBpZiAodHJlZS5vcGVuRWxlbWVudHMuaW5UYWJsZVNjb3BlKG5hbWUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbmRUYWdPdGhlcihcInNlbGVjdFwiKTtcbiAgICAgICAgICAgICAgICB0cmVlLmluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblNlbGVjdEluVGFibGUuZW5kVGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICBtb2Rlcy5pblNlbGVjdC5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluUm93ID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5pblJvdy5zdGFydF90YWdfaGFuZGxlcnMgPSB7XG4gICAgICAgICAgICBodG1sOiAnc3RhcnRUYWdIdG1sJyxcbiAgICAgICAgICAgIHRkOiAnc3RhcnRUYWdUYWJsZUNlbGwnLFxuICAgICAgICAgICAgdGg6ICdzdGFydFRhZ1RhYmxlQ2VsbCcsXG4gICAgICAgICAgICBjYXB0aW9uOiAnc3RhcnRUYWdUYWJsZU90aGVyJyxcbiAgICAgICAgICAgIGNvbDogJ3N0YXJ0VGFnVGFibGVPdGhlcicsXG4gICAgICAgICAgICBjb2xncm91cDogJ3N0YXJ0VGFnVGFibGVPdGhlcicsXG4gICAgICAgICAgICB0Ym9keTogJ3N0YXJ0VGFnVGFibGVPdGhlcicsXG4gICAgICAgICAgICB0Zm9vdDogJ3N0YXJ0VGFnVGFibGVPdGhlcicsXG4gICAgICAgICAgICB0aGVhZDogJ3N0YXJ0VGFnVGFibGVPdGhlcicsXG4gICAgICAgICAgICB0cjogJ3N0YXJ0VGFnVGFibGVPdGhlcicsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnc3RhcnRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblJvdy5lbmRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgdHI6ICdlbmRUYWdUcicsXG4gICAgICAgICAgICB0YWJsZTogJ2VuZFRhZ1RhYmxlJyxcbiAgICAgICAgICAgIHRib2R5OiAnZW5kVGFnVGFibGVSb3dHcm91cCcsXG4gICAgICAgICAgICB0Zm9vdDogJ2VuZFRhZ1RhYmxlUm93R3JvdXAnLFxuICAgICAgICAgICAgdGhlYWQ6ICdlbmRUYWdUYWJsZVJvd0dyb3VwJyxcbiAgICAgICAgICAgIGJvZHk6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgY2FwdGlvbjogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICBjb2w6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgY29sZ3JvdXA6ICdlbmRUYWdJZ25vcmUnLFxuICAgICAgICAgICAgaHRtbDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0ZDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICB0aDogJ2VuZFRhZ0lnbm9yZScsXG4gICAgICAgICAgICAnLWRlZmF1bHQnOiAnZW5kVGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Sb3cucHJvY2Vzc0NoYXJhY3RlcnMgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICBtb2Rlcy5pblRhYmxlLnByb2Nlc3NDaGFyYWN0ZXJzKGRhdGEpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluUm93LnN0YXJ0VGFnVGFibGVDZWxsID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxUYWJsZVJvd1Njb3BlTWFya2VyKCk7XG4gICAgICAgICAgICB0cmVlLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUoJ2luQ2VsbCcpO1xuICAgICAgICAgICAgdHJlZS5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMucHVzaChNYXJrZXIpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluUm93LnN0YXJ0VGFnVGFibGVPdGhlciA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICAgIHZhciBpZ25vcmVFbmRUYWcgPSB0aGlzLmlnbm9yZUVuZFRhZ1RyKCk7XG4gICAgICAgICAgICB0aGlzLmVuZFRhZ1RyKCd0cicpO1xuICAgICAgICAgICAgLy8gWFhYIGhvdyBhcmUgd2Ugc3VyZSBpdCdzIGFsd2F5cyBpZ25vcmVkIGluIHRoZSBjb250ZXh0IGNhc2U/XG4gICAgICAgICAgICBpZiAoIWlnbm9yZUVuZFRhZykgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblJvdy5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgIG1vZGVzLmluVGFibGUucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMsIHNlbGZDbG9zaW5nKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblJvdy5lbmRUYWdUciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmlnbm9yZUVuZFRhZ1RyKCkpIHtcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBhc3NlcnQub2sodHJlZS5jb250ZXh0KTtcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wVW50aWxUYWJsZVJvd1Njb3BlTWFya2VyKCk7XG4gICAgICAgICAgICAgICAgdHJlZS5wb3BFbGVtZW50KCk7XG4gICAgICAgICAgICAgICAgdHJlZS5zZXRJbnNlcnRpb25Nb2RlKCdpblRhYmxlQm9keScpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmluUm93LmVuZFRhZ1RhYmxlID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgdmFyIGlnbm9yZUVuZFRhZyA9IHRoaXMuaWdub3JlRW5kVGFnVHIoKTtcbiAgICAgICAgICAgIHRoaXMuZW5kVGFnVHIoJ3RyJyk7XG4gICAgICAgICAgICAvLyBSZXByb2Nlc3MgdGhlIGN1cnJlbnQgdGFnIGlmIHRoZSB0ciBlbmQgdGFnIHdhcyBub3QgaWdub3JlZFxuICAgICAgICAgICAgLy8gWFhYIGhvdyBhcmUgd2Ugc3VyZSBpdCdzIGFsd2F5cyBpZ25vcmVkIGluIHRoZSBjb250ZXh0IGNhc2U/XG4gICAgICAgICAgICBpZiAoIWlnbm9yZUVuZFRhZykgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFbmRUYWcobmFtZSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuaW5Sb3cuZW5kVGFnVGFibGVSb3dHcm91cCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmICh0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUobmFtZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVuZFRhZ1RyKCd0cicpO1xuICAgICAgICAgICAgICAgIHRyZWUuaW5zZXJ0aW9uTW9kZS5wcm9jZXNzRW5kVGFnKG5hbWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBjb250ZXh0IGNhc2VcbiAgICAgICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoJ3VuZXhwZWN0ZWQtZW5kLXRhZycsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblJvdy5lbmRUYWdJZ25vcmUgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWVuZC10YWctaW4tdGFibGUtcm93XCIsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblJvdy5lbmRUYWdPdGhlciA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIG1vZGVzLmluVGFibGUucHJvY2Vzc0VuZFRhZyhuYW1lKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy5pblJvdy5pZ25vcmVFbmRUYWdUciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuICF0cmVlLm9wZW5FbGVtZW50cy5pblRhYmxlU2NvcGUoJ3RyJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJBZnRlckZyYW1lc2V0ID0gT2JqZWN0LmNyZWF0ZShtb2Rlcy5iYXNlKTtcblxuICAgICAgICBtb2Rlcy5hZnRlckFmdGVyRnJhbWVzZXQuc3RhcnRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgaHRtbDogJ3N0YXJ0VGFnSHRtbCcsXG4gICAgICAgICAgICBub2ZyYW1lczogJ3N0YXJ0VGFnTm9GcmFtZXMnLFxuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJBZnRlckZyYW1lc2V0LnByb2Nlc3NFT0YgPSBmdW5jdGlvbigpIHsgfTtcblxuICAgICAgICBtb2Rlcy5hZnRlckFmdGVyRnJhbWVzZXQucHJvY2Vzc0NvbW1lbnQgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICB0cmVlLmluc2VydENvbW1lbnQoZGF0YSwgdHJlZS5kb2N1bWVudCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJBZnRlckZyYW1lc2V0LnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgY2hhcmFjdGVycyA9IGJ1ZmZlci50YWtlUmVtYWluaW5nKCk7XG4gICAgICAgICAgICB2YXIgd2hpdGVzcGFjZSA9IFwiXCI7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNoYXJhY3RlcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgY2ggPSBjaGFyYWN0ZXJzW2ldO1xuICAgICAgICAgICAgICAgIGlmIChpc1doaXRlc3BhY2UoY2gpKVxuICAgICAgICAgICAgICAgICAgICB3aGl0ZXNwYWNlICs9IGNoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHdoaXRlc3BhY2UpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnJlY29uc3RydWN0QWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgdHJlZS5pbnNlcnRUZXh0KHdoaXRlc3BhY2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHdoaXRlc3BhY2UubGVuZ3RoIDwgY2hhcmFjdGVycy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdleHBlY3RlZC1lb2YtYnV0LWdvdC1jaGFyJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMuYWZ0ZXJBZnRlckZyYW1lc2V0LnN0YXJ0VGFnTm9GcmFtZXMgPSBmdW5jdGlvbihuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgICBtb2Rlcy5pbkhlYWQucHJvY2Vzc1N0YXJ0VGFnKG5hbWUsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQWZ0ZXJGcmFtZXNldC5zdGFydFRhZ090aGVyID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcywgc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgIHRyZWUucGFyc2VFcnJvcignZXhwZWN0ZWQtZW9mLWJ1dC1nb3Qtc3RhcnQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLmFmdGVyQWZ0ZXJGcmFtZXNldC5wcm9jZXNzRW5kVGFnID0gZnVuY3Rpb24obmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgICAgdHJlZS5wYXJzZUVycm9yKCdleHBlY3RlZC1lb2YtYnV0LWdvdC1lbmQtdGFnJywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLnRleHQgPSBPYmplY3QuY3JlYXRlKG1vZGVzLmJhc2UpO1xuXG4gICAgICAgIG1vZGVzLnRleHQuc3RhcnRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgJy1kZWZhdWx0JzogJ3N0YXJ0VGFnT3RoZXInXG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMudGV4dC5lbmRfdGFnX2hhbmRsZXJzID0ge1xuICAgICAgICAgICAgc2NyaXB0OiAnZW5kVGFnU2NyaXB0JyxcbiAgICAgICAgICAgICctZGVmYXVsdCc6ICdlbmRUYWdPdGhlcidcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy50ZXh0LnByb2Nlc3NDaGFyYWN0ZXJzID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gICAgICAgICAgICBpZiAodHJlZS5zaG91bGRTa2lwTGVhZGluZ05ld2xpbmUpIHtcbiAgICAgICAgICAgICAgICB0cmVlLnNob3VsZFNraXBMZWFkaW5nTmV3bGluZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci5za2lwQXRNb3N0T25lTGVhZGluZ05ld2xpbmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLnRha2VSZW1haW5pbmcoKTtcbiAgICAgICAgICAgIGlmICghZGF0YSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0cmVlLmluc2VydFRleHQoZGF0YSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgbW9kZXMudGV4dC5wcm9jZXNzRU9GID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0cmVlLnBhcnNlRXJyb3IoXCJleHBlY3RlZC1uYW1lZC1jbG9zaW5nLXRhZy1idXQtZ290LWVvZlwiLFxuICAgICAgICAgICAgICAgIHsgbmFtZTogdHJlZS5jdXJyZW50U3RhY2tJdGVtKCkubG9jYWxOYW1lIH0pO1xuICAgICAgICAgICAgdHJlZS5vcGVuRWxlbWVudHMucG9wKCk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUodHJlZS5vcmlnaW5hbEluc2VydGlvbk1vZGUpO1xuICAgICAgICAgICAgdHJlZS5pbnNlcnRpb25Nb2RlLnByb2Nlc3NFT0YoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy50ZXh0LnN0YXJ0VGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0aHJvdyBcIlRyaWVkIHRvIHByb2Nlc3Mgc3RhcnQgdGFnIFwiICsgbmFtZSArIFwiIGluIFJDREFUQS9SQVdURVhUIG1vZGVcIjtcbiAgICAgICAgfTtcblxuICAgICAgICBtb2Rlcy50ZXh0LmVuZFRhZ1NjcmlwdCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIHZhciBub2RlID0gdHJlZS5vcGVuRWxlbWVudHMucG9wKCk7XG4gICAgICAgICAgICAvLyBUT0RPIGFzc2VydC5vayhub2RlLmxvY2FsTmFtZSA9PSAnc2NyaXB0Jyk7XG4gICAgICAgICAgICB0cmVlLnNldEluc2VydGlvbk1vZGUodHJlZS5vcmlnaW5hbEluc2VydGlvbk1vZGUpO1xuICAgICAgICB9O1xuXG4gICAgICAgIG1vZGVzLnRleHQuZW5kVGFnT3RoZXIgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0cmVlLm9wZW5FbGVtZW50cy5wb3AoKTtcbiAgICAgICAgICAgIHRyZWUuc2V0SW5zZXJ0aW9uTW9kZSh0cmVlLm9yaWdpbmFsSW5zZXJ0aW9uTW9kZSk7XG4gICAgICAgIH07XG4gICAgfVxuXG5cbiAgICBzZXRJbnNlcnRpb25Nb2RlKG5hbWUpIHtcbiAgICAgICAgdGhpcy5pbnNlcnRpb25Nb2RlID0gdGhpcy5pbnNlcnRpb25Nb2Rlc1tuYW1lXTtcbiAgICAgICAgdGhpcy5pbnNlcnRpb25Nb2RlTmFtZSA9IG5hbWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRvcHRpb24gYWdlbmN5IGFsZ29yaXRobSAoaHR0cDovL3d3dy53aGF0d2cub3JnL3NwZWNzL3dlYi1hcHBzL2N1cnJlbnQtd29yay9tdWx0aXBhZ2UvdHJlZS1jb25zdHJ1Y3Rpb24uaHRtbCNhZG9wdGlvbi1hZ2VuY3ktYWxnb3JpdGhtKVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIEEgdGFnIG5hbWUgc3ViamVjdCBmb3Igd2hpY2ggdGhlIGFsZ29yaXRobSBpcyBiZWluZyBydW5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufSBSZXR1cm5zIGZhbHNlIGlmIHRoZSBhbGdvcml0aG0gd2FzIGFib3J0ZWRcbiAgICAgKi9cbiAgICBhZG9wdGlvbkFnZW5jeUVuZFRhZyhuYW1lKSB7XG4gICAgICAgIHZhciBvdXRlckl0ZXJhdGlvbkxpbWl0ID0gODtcbiAgICAgICAgdmFyIGlubmVySXRlcmF0aW9uTGltaXQgPSAzO1xuICAgICAgICB2YXIgZm9ybWF0dGluZ0VsZW1lbnQ7XG5cbiAgICAgICAgZnVuY3Rpb24gaXNBY3RpdmVGb3JtYXR0aW5nRWxlbWVudChlbCkge1xuICAgICAgICAgICAgcmV0dXJuIGVsID09PSBmb3JtYXR0aW5nRWxlbWVudDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBvdXRlckxvb3BDb3VudGVyID0gMDtcblxuICAgICAgICB3aGlsZSAob3V0ZXJMb29wQ291bnRlcisrIDwgb3V0ZXJJdGVyYXRpb25MaW1pdCkge1xuICAgICAgICAgICAgLy8gNC5cbiAgICAgICAgICAgIGZvcm1hdHRpbmdFbGVtZW50ID0gdGhpcy5lbGVtZW50SW5BY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMobmFtZSk7XG5cbiAgICAgICAgICAgIGlmICghZm9ybWF0dGluZ0VsZW1lbnQgfHwgKHRoaXMub3BlbkVsZW1lbnRzLmNvbnRhaW5zKGZvcm1hdHRpbmdFbGVtZW50KSAmJiAhdGhpcy5vcGVuRWxlbWVudHMuaW5TY29wZShmb3JtYXR0aW5nRWxlbWVudC5sb2NhbE5hbWUpKSkge1xuICAgICAgICAgICAgICAgIHRoaXMucGFyc2VFcnJvcignYWRvcHRpb24tYWdlbmN5LTEuMScsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXRoaXMub3BlbkVsZW1lbnRzLmNvbnRhaW5zKGZvcm1hdHRpbmdFbGVtZW50KSkge1xuICAgICAgICAgICAgICAgIHRoaXMucGFyc2VFcnJvcignYWRvcHRpb24tYWdlbmN5LTEuMicsIHsgbmFtZTogbmFtZSB9KTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUVsZW1lbnRGcm9tQWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKGZvcm1hdHRpbmdFbGVtZW50KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghdGhpcy5vcGVuRWxlbWVudHMuaW5TY29wZShmb3JtYXR0aW5nRWxlbWVudC5sb2NhbE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXJzZUVycm9yKCdhZG9wdGlvbi1hZ2VuY3ktNC40JywgeyBuYW1lOiBuYW1lIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZm9ybWF0dGluZ0VsZW1lbnQgIT0gdGhpcy5jdXJyZW50U3RhY2tJdGVtKCkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnBhcnNlRXJyb3IoJ2Fkb3B0aW9uLWFnZW5jeS0xLjMnLCB7IG5hbWU6IG5hbWUgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFN0YXJ0IG9mIHRoZSBhZG9wdGlvbiBhZ2VuY3kgYWxnb3JpdGhtIHByb3BlclxuICAgICAgICAgICAgLy8gdG9kbyBFbGVtZW50U3RhY2tcbiAgICAgICAgICAgIHZhciBmdXJ0aGVzdEJsb2NrID0gdGhpcy5vcGVuRWxlbWVudHMuZnVydGhlc3RCbG9ja0ZvckZvcm1hdHRpbmdFbGVtZW50KGZvcm1hdHRpbmdFbGVtZW50Lm5vZGUpO1xuXG4gICAgICAgICAgICBpZiAoIWZ1cnRoZXN0QmxvY2spIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wZW5FbGVtZW50cy5yZW1vdmVfb3BlbkVsZW1lbnRzX3VudGlsKGlzQWN0aXZlRm9ybWF0dGluZ0VsZW1lbnQpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRWxlbWVudEZyb21BY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoZm9ybWF0dGluZ0VsZW1lbnQpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgYWZlSW5kZXggPSB0aGlzLm9wZW5FbGVtZW50cy5lbGVtZW50cy5pbmRleE9mKGZvcm1hdHRpbmdFbGVtZW50KTtcbiAgICAgICAgICAgIHZhciBjb21tb25BbmNlc3RvciA9IHRoaXMub3BlbkVsZW1lbnRzLml0ZW0oYWZlSW5kZXggLSAxKTtcblxuICAgICAgICAgICAgdmFyIGJvb2ttYXJrID0gdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMuaW5kZXhPZihmb3JtYXR0aW5nRWxlbWVudCk7XG5cbiAgICAgICAgICAgIHZhciBub2RlID0gZnVydGhlc3RCbG9jaztcbiAgICAgICAgICAgIHZhciBsYXN0Tm9kZSA9IGZ1cnRoZXN0QmxvY2s7XG4gICAgICAgICAgICB2YXIgaW5kZXggPSB0aGlzLm9wZW5FbGVtZW50cy5lbGVtZW50cy5pbmRleE9mKG5vZGUpO1xuXG4gICAgICAgICAgICB2YXIgaW5uZXJMb29wQ291bnRlciA9IDA7XG4gICAgICAgICAgICB3aGlsZSAoaW5uZXJMb29wQ291bnRlcisrIDwgaW5uZXJJdGVyYXRpb25MaW1pdCkge1xuICAgICAgICAgICAgICAgIGluZGV4IC09IDE7XG4gICAgICAgICAgICAgICAgbm9kZSA9IHRoaXMub3BlbkVsZW1lbnRzLml0ZW0oaW5kZXgpO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cy5pbmRleE9mKG5vZGUpIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm9wZW5FbGVtZW50cy5lbGVtZW50cy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUgPT0gZm9ybWF0dGluZ0VsZW1lbnQpXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgaWYgKGxhc3ROb2RlID09IGZ1cnRoZXN0QmxvY2spXG4gICAgICAgICAgICAgICAgICAgIGJvb2ttYXJrID0gdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMuaW5kZXhPZihub2RlKSArIDE7XG5cbiAgICAgICAgICAgICAgICB2YXIgY2xvbmUgPSB0aGlzLmNyZWF0ZUVsZW1lbnQobm9kZS5uYW1lc3BhY2VVUkksIG5vZGUubG9jYWxOYW1lLCBub2RlLmF0dHJpYnV0ZXMpO1xuICAgICAgICAgICAgICAgIHZhciBuZXdOb2RlID0gbmV3IFN0YWNrSXRlbShub2RlLm5hbWVzcGFjZVVSSSwgbm9kZS5sb2NhbE5hbWUsIG5vZGUuYXR0cmlidXRlcywgY2xvbmUpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHNbdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMuaW5kZXhPZihub2RlKV0gPSBuZXdOb2RlO1xuICAgICAgICAgICAgICAgIHRoaXMub3BlbkVsZW1lbnRzLmVsZW1lbnRzW3RoaXMub3BlbkVsZW1lbnRzLmVsZW1lbnRzLmluZGV4T2Yobm9kZSldID0gbmV3Tm9kZTtcblxuICAgICAgICAgICAgICAgIG5vZGUgPSBuZXdOb2RlO1xuICAgICAgICAgICAgICAgIHRoaXMuZGV0YWNoRnJvbVBhcmVudChsYXN0Tm9kZS5ub2RlKTtcbiAgICAgICAgICAgICAgICB0aGlzLmF0dGFjaE5vZGUobGFzdE5vZGUubm9kZSwgbm9kZS5ub2RlKTtcbiAgICAgICAgICAgICAgICBsYXN0Tm9kZSA9IG5vZGU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuZGV0YWNoRnJvbVBhcmVudChsYXN0Tm9kZS5ub2RlKTtcbiAgICAgICAgICAgIGlmIChjb21tb25BbmNlc3Rvci5pc0Zvc3RlclBhcmVudGluZygpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5pbnNlcnRJbnRvRm9zdGVyUGFyZW50KGxhc3ROb2RlLm5vZGUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmF0dGFjaE5vZGUobGFzdE5vZGUubm9kZSwgY29tbW9uQW5jZXN0b3Iubm9kZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBjbG9uZSA9IHRoaXMuY3JlYXRlRWxlbWVudChcImh0dHA6Ly93d3cudzMub3JnLzE5OTkveGh0bWxcIiwgZm9ybWF0dGluZ0VsZW1lbnQubG9jYWxOYW1lLCBmb3JtYXR0aW5nRWxlbWVudC5hdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIHZhciBmb3JtYXR0aW5nQ2xvbmUgPSBuZXcgU3RhY2tJdGVtKGZvcm1hdHRpbmdFbGVtZW50Lm5hbWVzcGFjZVVSSSwgZm9ybWF0dGluZ0VsZW1lbnQubG9jYWxOYW1lLCBmb3JtYXR0aW5nRWxlbWVudC5hdHRyaWJ1dGVzLCBjbG9uZSk7XG5cbiAgICAgICAgICAgIHRoaXMucmVwYXJlbnRDaGlsZHJlbihmdXJ0aGVzdEJsb2NrLm5vZGUsIGNsb25lKTtcbiAgICAgICAgICAgIHRoaXMuYXR0YWNoTm9kZShjbG9uZSwgZnVydGhlc3RCbG9jay5ub2RlKTtcblxuICAgICAgICAgICAgdGhpcy5yZW1vdmVFbGVtZW50RnJvbUFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cyhmb3JtYXR0aW5nRWxlbWVudCk7XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cy5zcGxpY2UoTWF0aC5taW4oYm9va21hcmssIHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzLmxlbmd0aCksIDAsIGZvcm1hdHRpbmdDbG9uZSk7XG5cbiAgICAgICAgICAgIHRoaXMub3BlbkVsZW1lbnRzLnJlbW92ZShmb3JtYXR0aW5nRWxlbWVudCk7XG4gICAgICAgICAgICB0aGlzLm9wZW5FbGVtZW50cy5lbGVtZW50cy5zcGxpY2UodGhpcy5vcGVuRWxlbWVudHMuZWxlbWVudHMuaW5kZXhPZihmdXJ0aGVzdEJsb2NrKSArIDEsIDAsIGZvcm1hdHRpbmdDbG9uZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBzdGFydCh0b2tlbml6ZXIpIHtcbiAgICAgICAgdGhyb3cgXCJOb3QgaW1wbGVtZW50ZWRcIjtcbiAgICB9XG5cbiAgICBzdGFydFRva2VuaXphdGlvbih0b2tlbml6ZXIpIHtcbiAgICAgICAgdGhpcy50b2tlbml6ZXIgPSB0b2tlbml6ZXI7XG4gICAgICAgIHRoaXMuY29tcGF0TW9kZSA9IFwibm8gcXVpcmtzXCI7XG4gICAgICAgIHRoaXMub3JpZ2luYWxJbnNlcnRpb25Nb2RlID0gXCJpbml0aWFsXCI7XG4gICAgICAgIHRoaXMuZnJhbWVzZXRPayA9IHRydWU7XG4gICAgICAgIHRoaXMub3BlbkVsZW1lbnRzID0gbmV3IEVsZW1lbnRTdGFjaygpO1xuICAgICAgICB0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cyA9IFtdO1xuICAgICAgICB0aGlzLnN0YXJ0KHRva2VuaXplcik7XG4gICAgICAgIGlmICh0aGlzLmNvbnRleHQpIHtcbiAgICAgICAgICAgIHN3aXRjaCAodGhpcy5jb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgY2FzZSAndGl0bGUnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ3RleHRhcmVhJzpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b2tlbml6ZXIuc2V0U3RhdGUoVG9rZW5pemVyLlJDREFUQSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3N0eWxlJzpcbiAgICAgICAgICAgICAgICBjYXNlICd4bXAnOlxuICAgICAgICAgICAgICAgIGNhc2UgJ2lmcmFtZSc6XG4gICAgICAgICAgICAgICAgY2FzZSAnbm9lbWJlZCc6XG4gICAgICAgICAgICAgICAgY2FzZSAnbm9mcmFtZXMnOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRva2VuaXplci5zZXRTdGF0ZShUb2tlbml6ZXIuUkFXVEVYVCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3NjcmlwdCc6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG9rZW5pemVyLnNldFN0YXRlKFRva2VuaXplci5TQ1JJUFRfREFUQSk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ25vc2NyaXB0JzpcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc2NyaXB0aW5nRW5hYmxlZClcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudG9rZW5pemVyLnNldFN0YXRlKFRva2VuaXplci5SQVdURVhUKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAncGxhaW50ZXh0JzpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b2tlbml6ZXIuc2V0U3RhdGUoVG9rZW5pemVyLlBMQUlOVEVYVCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5pbnNlcnRIdG1sRWxlbWVudCgpO1xuICAgICAgICAgICAgdGhpcy5yZXNldEluc2VydGlvbk1vZGUoKTtcbiAgICAgICAgICAgIC8vIHRvZG8gZm9ybSBwb2ludGVyXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNldEluc2VydGlvbk1vZGUoJ2luaXRpYWwnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByb2Nlc3NUb2tlbih0b2tlbikge1xuICAgICAgICB0aGlzLnNlbGZDbG9zaW5nRmxhZ0Fja25vd2xlZGdlZCA9IGZhbHNlO1xuXG4gICAgICAgIHZhciBjdXJyZW50Tm9kZSA9IHRoaXMub3BlbkVsZW1lbnRzLnRvcCB8fCBudWxsO1xuICAgICAgICB2YXIgaW5zZXJ0aW9uTW9kZTtcbiAgICAgICAgaWYgKCFjdXJyZW50Tm9kZSB8fCAhY3VycmVudE5vZGUuaXNGb3JlaWduKCkgfHxcbiAgICAgICAgICAgIChjdXJyZW50Tm9kZS5pc01hdGhNTFRleHRJbnRlZ3JhdGlvblBvaW50KCkgJiZcbiAgICAgICAgICAgICAgICAoKHRva2VuLnR5cGUgPT0gJ1N0YXJ0VGFnJyAmJlxuICAgICAgICAgICAgICAgICAgICAhKHRva2VuLm5hbWUgaW4geyBtZ2x5cGg6IDAsIG1hbGlnbm1hcms6IDAgfSkpIHx8XG4gICAgICAgICAgICAgICAgICAgICh0b2tlbi50eXBlID09PSAnQ2hhcmFjdGVycycpKVxuICAgICAgICAgICAgKSB8fFxuICAgICAgICAgICAgKGN1cnJlbnROb2RlLm5hbWVzcGFjZVVSSSA9PSBcImh0dHA6Ly93d3cudzMub3JnLzE5OTgvTWF0aC9NYXRoTUxcIiAmJlxuICAgICAgICAgICAgICAgIGN1cnJlbnROb2RlLmxvY2FsTmFtZSA9PSAnYW5ub3RhdGlvbi14bWwnICYmXG4gICAgICAgICAgICAgICAgdG9rZW4udHlwZSA9PSAnU3RhcnRUYWcnICYmIHRva2VuLm5hbWUgPT0gJ3N2ZydcbiAgICAgICAgICAgICkgfHxcbiAgICAgICAgICAgIChjdXJyZW50Tm9kZS5pc0h0bWxJbnRlZ3JhdGlvblBvaW50KCkgJiZcbiAgICAgICAgICAgICAgICB0b2tlbi50eXBlIGluIHsgU3RhcnRUYWc6IDAsIENoYXJhY3RlcnM6IDAgfVxuICAgICAgICAgICAgKSB8fFxuICAgICAgICAgICAgdG9rZW4udHlwZSA9PSAnRU9GJ1xuICAgICAgICApIHtcbiAgICAgICAgICAgIGluc2VydGlvbk1vZGUgPSB0aGlzLmluc2VydGlvbk1vZGU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbnNlcnRpb25Nb2RlID0gdGhpcy5pbnNlcnRpb25Nb2Rlcy5pbkZvcmVpZ25Db250ZW50O1xuICAgICAgICB9XG4gICAgICAgIHN3aXRjaCAodG9rZW4udHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnQ2hhcmFjdGVycyc6XG4gICAgICAgICAgICAgICAgdmFyIGJ1ZmZlciA9IG5ldyBDaGFyYWN0ZXJCdWZmZXIodG9rZW4uZGF0YSk7XG4gICAgICAgICAgICAgICAgaW5zZXJ0aW9uTW9kZS5wcm9jZXNzQ2hhcmFjdGVycyhidWZmZXIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnQ29tbWVudCc6XG4gICAgICAgICAgICAgICAgaW5zZXJ0aW9uTW9kZS5wcm9jZXNzQ29tbWVudCh0b2tlbi5kYXRhKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ1N0YXJ0VGFnJzpcbiAgICAgICAgICAgICAgICBpbnNlcnRpb25Nb2RlLnByb2Nlc3NTdGFydFRhZyh0b2tlbi5uYW1lLCB0b2tlbi5kYXRhLCB0b2tlbi5zZWxmQ2xvc2luZyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdFbmRUYWcnOlxuICAgICAgICAgICAgICAgIGluc2VydGlvbk1vZGUucHJvY2Vzc0VuZFRhZyh0b2tlbi5uYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0RvY3R5cGUnOlxuICAgICAgICAgICAgICAgIGluc2VydGlvbk1vZGUucHJvY2Vzc0RvY3R5cGUodG9rZW4ubmFtZSwgdG9rZW4ucHVibGljSWQsIHRva2VuLnN5c3RlbUlkLCB0b2tlbi5mb3JjZVF1aXJrcyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdFT0YnOlxuICAgICAgICAgICAgICAgIGluc2VydGlvbk1vZGUucHJvY2Vzc0VPRigpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqL1xuICAgIGlzQ2RhdGFTZWN0aW9uQWxsb3dlZCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMub3BlbkVsZW1lbnRzLmxlbmd0aCA+IDAgJiYgdGhpcy5jdXJyZW50U3RhY2tJdGVtKCkuaXNGb3JlaWduKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqL1xuICAgIGlzU2VsZkNsb3NpbmdGbGFnQWNrbm93bGVkZ2VkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZWxmQ2xvc2luZ0ZsYWdBY2tub3dsZWRnZWQ7XG4gICAgfVxuXG4gICAgY3JlYXRlRWxlbWVudChuYW1lc3BhY2VVUkksIGxvY2FsTmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWRcIik7XG4gICAgfVxuXG4gICAgYXR0YWNoTm9kZShjaGlsZCwgcGFyZW50KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZFwiKTtcbiAgICB9XG5cbiAgICBhdHRhY2hOb2RlVG9Gb3N0ZXJQYXJlbnQoY2hpbGQsIHRhYmxlLCBzdGFja1BhcmVudCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWRcIik7XG4gICAgfVxuXG4gICAgZGV0YWNoRnJvbVBhcmVudChub2RlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZFwiKTtcbiAgICB9XG5cbiAgICBhZGRBdHRyaWJ1dGVzVG9FbGVtZW50KGVsZW1lbnQsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm90IGltcGxlbWVudGVkXCIpO1xuICAgIH1cblxuICAgIGluc2VydEh0bWxFbGVtZW50KGF0dHJpYnV0ZXM/KSB7XG4gICAgICAgIHZhciByb290ID0gdGhpcy5jcmVhdGVFbGVtZW50KFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbFwiLCAnaHRtbCcsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB0aGlzLmF0dGFjaE5vZGUocm9vdCwgdGhpcy5kb2N1bWVudCk7XG4gICAgICAgIHRoaXMub3BlbkVsZW1lbnRzLnB1c2hIdG1sRWxlbWVudChuZXcgU3RhY2tJdGVtKFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbFwiLCAnaHRtbCcsIGF0dHJpYnV0ZXMsIHJvb3QpKTtcbiAgICAgICAgcmV0dXJuIHJvb3Q7XG4gICAgfVxuXG4gICAgaW5zZXJ0SGVhZEVsZW1lbnQoYXR0cmlidXRlcykge1xuICAgICAgICB2YXIgZWxlbWVudCA9IHRoaXMuY3JlYXRlRWxlbWVudChcImh0dHA6Ly93d3cudzMub3JnLzE5OTkveGh0bWxcIiwgXCJoZWFkXCIsIGF0dHJpYnV0ZXMpO1xuICAgICAgICB0aGlzLmhlYWQgPSBuZXcgU3RhY2tJdGVtKFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbFwiLCBcImhlYWRcIiwgYXR0cmlidXRlcywgZWxlbWVudCk7XG4gICAgICAgIHRoaXMuYXR0YWNoTm9kZShlbGVtZW50LCB0aGlzLm9wZW5FbGVtZW50cy50b3Aubm9kZSk7XG4gICAgICAgIHRoaXMub3BlbkVsZW1lbnRzLnB1c2hIZWFkRWxlbWVudCh0aGlzLmhlYWQpO1xuICAgICAgICByZXR1cm4gZWxlbWVudDtcbiAgICB9XG5cbiAgICBpbnNlcnRCb2R5RWxlbWVudChhdHRyaWJ1dGVzKSB7XG4gICAgICAgIHZhciBlbGVtZW50ID0gdGhpcy5jcmVhdGVFbGVtZW50KFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbFwiLCBcImJvZHlcIiwgYXR0cmlidXRlcyk7XG4gICAgICAgIHRoaXMuYXR0YWNoTm9kZShlbGVtZW50LCB0aGlzLm9wZW5FbGVtZW50cy50b3Aubm9kZSk7XG4gICAgICAgIHRoaXMub3BlbkVsZW1lbnRzLnB1c2hCb2R5RWxlbWVudChuZXcgU3RhY2tJdGVtKFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbFwiLCBcImJvZHlcIiwgYXR0cmlidXRlcywgZWxlbWVudCkpO1xuICAgICAgICByZXR1cm4gZWxlbWVudDtcbiAgICB9XG5cbiAgICBpbnNlcnRJbnRvRm9zdGVyUGFyZW50KG5vZGUpIHtcbiAgICAgICAgdmFyIHRhYmxlSW5kZXggPSB0aGlzLm9wZW5FbGVtZW50cy5maW5kSW5kZXgoJ3RhYmxlJyk7XG4gICAgICAgIHZhciB0YWJsZUVsZW1lbnQgPSB0aGlzLm9wZW5FbGVtZW50cy5pdGVtKHRhYmxlSW5kZXgpLm5vZGU7XG4gICAgICAgIGlmICh0YWJsZUluZGV4ID09PSAwKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYXR0YWNoTm9kZShub2RlLCB0YWJsZUVsZW1lbnQpO1xuICAgICAgICB0aGlzLmF0dGFjaE5vZGVUb0Zvc3RlclBhcmVudChub2RlLCB0YWJsZUVsZW1lbnQsIHRoaXMub3BlbkVsZW1lbnRzLml0ZW0odGFibGVJbmRleCAtIDEpLm5vZGUpO1xuICAgIH1cblxuICAgIGluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcywgbmFtZXNwYWNlVVJJPywgc2VsZkNsb3Npbmc/KSB7XG4gICAgICAgIGlmICghbmFtZXNwYWNlVVJJKVxuICAgICAgICAgICAgbmFtZXNwYWNlVVJJID0gXCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sXCI7XG4gICAgICAgIHZhciBlbGVtZW50ID0gdGhpcy5jcmVhdGVFbGVtZW50KG5hbWVzcGFjZVVSSSwgbmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIGlmICh0aGlzLnNob3VsZEZvc3RlclBhcmVudCgpKVxuICAgICAgICAgICAgdGhpcy5pbnNlcnRJbnRvRm9zdGVyUGFyZW50KGVsZW1lbnQpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLmF0dGFjaE5vZGUoZWxlbWVudCwgdGhpcy5vcGVuRWxlbWVudHMudG9wLm5vZGUpO1xuICAgICAgICBpZiAoIXNlbGZDbG9zaW5nKVxuICAgICAgICAgICAgdGhpcy5vcGVuRWxlbWVudHMucHVzaChuZXcgU3RhY2tJdGVtKG5hbWVzcGFjZVVSSSwgbmFtZSwgYXR0cmlidXRlcywgZWxlbWVudCkpO1xuICAgIH1cblxuICAgIGluc2VydEZvcm1hdHRpbmdFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgdGhpcy5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMsIFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbFwiKTtcbiAgICAgICAgdGhpcy5hcHBlbmRFbGVtZW50VG9BY3RpdmVGb3JtYXR0aW5nRWxlbWVudHModGhpcy5jdXJyZW50U3RhY2tJdGVtKCkpO1xuICAgIH1cblxuICAgIGluc2VydFNlbGZDbG9zaW5nRWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgIHRoaXMuc2VsZkNsb3NpbmdGbGFnQWNrbm93bGVkZ2VkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMsIFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbFwiLCB0cnVlKTtcbiAgICB9XG5cbiAgICBpbnNlcnRGb3JlaWduRWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzLCBuYW1lc3BhY2VVUkksIHNlbGZDbG9zaW5nKSB7XG4gICAgICAgIGlmIChzZWxmQ2xvc2luZylcbiAgICAgICAgICAgIHRoaXMuc2VsZkNsb3NpbmdGbGFnQWNrbm93bGVkZ2VkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5pbnNlcnRFbGVtZW50KG5hbWUsIGF0dHJpYnV0ZXMsIG5hbWVzcGFjZVVSSSwgc2VsZkNsb3NpbmcpO1xuICAgIH1cblxuICAgIGluc2VydENvbW1lbnQoZGF0YSwgcGFyZW50KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZFwiKTtcbiAgICB9XG5cbiAgICBpbnNlcnREb2N0eXBlKG5hbWUsIHB1YmxpY0lkLCBzeXN0ZW1JZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWRcIik7XG4gICAgfVxuXG4gICAgaW5zZXJ0VGV4dChkYXRhKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRvcG1vc3Qgb3BlbiBlbGVtZW50XG4gICAgICogQHJldHVybiB7U3RhY2tJdGVtfVxuICAgICAqL1xuICAgIGN1cnJlbnRTdGFja0l0ZW0oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm9wZW5FbGVtZW50cy50b3A7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUG9wdWxhdGVzIGN1cnJlbnQgb3BlbiBlbGVtZW50XG4gICAgICogQHJldHVybiB7U3RhY2tJdGVtfVxuICAgICAqL1xuICAgIHBvcEVsZW1lbnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm9wZW5FbGVtZW50cy5wb3AoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRydWUgaWYgcmVkaXJlY3QgaXMgcmVxdWlyZWQgYW5kIGN1cnJlbnQgb3BlbiBlbGVtZW50IGNhdXNlcyBmb3N0ZXIgcGFyZW50aW5nXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBzaG91bGRGb3N0ZXJQYXJlbnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlZGlyZWN0QXR0YWNoVG9Gb3N0ZXJQYXJlbnQgJiYgdGhpcy5jdXJyZW50U3RhY2tJdGVtKCkuaXNGb3N0ZXJQYXJlbnRpbmcoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbXBsZW1lbnRzIGh0dHA6Ly93d3cud2hhdHdnLm9yZy9zcGVjcy93ZWItYXBwcy9jdXJyZW50LXdvcmsvbXVsdGlwYWdlL3RyZWUtY29uc3RydWN0aW9uLmh0bWwjY2xvc2luZy1lbGVtZW50cy10aGF0LWhhdmUtaW1wbGllZC1lbmQtdGFnc1xuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBbZXhjbHVkZV0gSWdub3JlIHNwZWNpZmljIHRhZyBuYW1lXG4gICAgICovXG4gICAgZ2VuZXJhdGVJbXBsaWVkRW5kVGFncyhleGNsdWRlPykge1xuICAgICAgICAvLyBGSVhNRSBnZXQgcmlkIG9mIHRoZSByZWN1cnNpb25cbiAgICAgICAgdmFyIG5hbWUgPSB0aGlzLm9wZW5FbGVtZW50cy50b3AubG9jYWxOYW1lO1xuICAgICAgICBpZiAoWydkZCcsICdkdCcsICdsaScsICdvcHRpb24nLCAnb3B0Z3JvdXAnLCAncCcsICdycCcsICdydCddLmluZGV4T2YobmFtZSkgIT0gLTEgJiYgbmFtZSAhPSBleGNsdWRlKSB7XG4gICAgICAgICAgICB0aGlzLnBvcEVsZW1lbnQoKTtcbiAgICAgICAgICAgIHRoaXMuZ2VuZXJhdGVJbXBsaWVkRW5kVGFncyhleGNsdWRlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIGh0dHA6Ly93d3cud2hhdHdnLm9yZy9zcGVjcy93ZWItYXBwcy9jdXJyZW50LXdvcmsvbXVsdGlwYWdlL3BhcnNpbmcuaHRtbCNyZWNvbnN0cnVjdC10aGUtYWN0aXZlLWZvcm1hdHRpbmctZWxlbWVudHNcbiAgICAgKi9cbiAgICByZWNvbnN0cnVjdEFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cygpIHtcbiAgICAgICAgLy8gV2l0aGluIHRoaXMgYWxnb3JpdGhtIHRoZSBvcmRlciBvZiBzdGVwcyBkZWNyaWJlZCBpbiB0aGUgc3BlY2lmaWNhdGlvblxuICAgICAgICAvLyBpcyBub3QgcXVpdGUgdGhlIHNhbWUgYXMgdGhlIG9yZGVyIG9mIHN0ZXBzIGluIHRoZSBjb2RlLiBJdCBzaG91bGQgc3RpbGxcbiAgICAgICAgLy8gZG8gdGhlIHNhbWUgdGhvdWdoLlxuXG4gICAgICAgIC8vIFN0ZXAgMTogc3RvcCBpZiB0aGVyZSdzIG5vdGhpbmcgdG8gZG9cbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzLmxlbmd0aCA9PT0gMClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAvLyBTdGVwIDIgYW5kIDM6IHN0YXJ0IHdpdGggdGhlIGxhc3QgZWxlbWVudFxuICAgICAgICB2YXIgaSA9IHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzLmxlbmd0aCAtIDE7XG4gICAgICAgIHZhciBlbnRyeSA9IHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzW2ldO1xuICAgICAgICBpZiAoZW50cnkgPT0gTWFya2VyIHx8IHRoaXMub3BlbkVsZW1lbnRzLmNvbnRhaW5zKGVudHJ5KSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB3aGlsZSAoZW50cnkgIT0gTWFya2VyICYmICF0aGlzLm9wZW5FbGVtZW50cy5jb250YWlucyhlbnRyeSkpIHtcbiAgICAgICAgICAgIGkgLT0gMTtcbiAgICAgICAgICAgIGVudHJ5ID0gdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHNbaV07XG4gICAgICAgICAgICBpZiAoIWVudHJ5KVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG5cbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIGkgKz0gMTtcbiAgICAgICAgICAgIGVudHJ5ID0gdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHNbaV07XG4gICAgICAgICAgICB0aGlzLmluc2VydEVsZW1lbnQoZW50cnkubG9jYWxOYW1lLCBlbnRyeS5hdHRyaWJ1dGVzKTtcbiAgICAgICAgICAgIHZhciBlbGVtZW50ID0gdGhpcy5jdXJyZW50U3RhY2tJdGVtKCk7XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50c1tpXSA9IGVsZW1lbnQ7XG4gICAgICAgICAgICBpZiAoZWxlbWVudCA9PSB0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50c1t0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cy5sZW5ndGggLSAxXSlcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0YWNrSXRlbX0gaXRlbVxuICAgICAqL1xuICAgIGVuc3VyZU5vYWhzQXJrQ29uZGl0aW9uKGl0ZW0pIHtcbiAgICAgICAgdmFyIGtOb2Foc0Fya0NhcGFjaXR5ID0gMztcbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzLmxlbmd0aCA8IGtOb2Foc0Fya0NhcGFjaXR5KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgY2FuZGlkYXRlcyA9IFtdO1xuICAgICAgICB2YXIgbmV3SXRlbUF0dHJpYnV0ZUNvdW50ID0gaXRlbS5hdHRyaWJ1dGVzLmxlbmd0aDtcbiAgICAgICAgZm9yICh2YXIgaSA9IHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICB2YXIgY2FuZGlkYXRlID0gdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHNbaV07XG4gICAgICAgICAgICBpZiAoY2FuZGlkYXRlID09PSBNYXJrZXIpXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBpZiAoaXRlbS5sb2NhbE5hbWUgIT09IGNhbmRpZGF0ZS5sb2NhbE5hbWUgfHwgaXRlbS5uYW1lc3BhY2VVUkkgIT09IGNhbmRpZGF0ZS5uYW1lc3BhY2VVUkkpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICBpZiAoY2FuZGlkYXRlLmF0dHJpYnV0ZXMubGVuZ3RoICE9IG5ld0l0ZW1BdHRyaWJ1dGVDb3VudClcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIGNhbmRpZGF0ZXMucHVzaChjYW5kaWRhdGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjYW5kaWRhdGVzLmxlbmd0aCA8IGtOb2Foc0Fya0NhcGFjaXR5KVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciByZW1haW5pbmdDYW5kaWRhdGVzID0gW107XG4gICAgICAgIHZhciBhdHRyaWJ1dGVzID0gaXRlbS5hdHRyaWJ1dGVzO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGF0dHJpYnV0ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzW2ldO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNhbmRpZGF0ZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgY2FuZGlkYXRlID0gY2FuZGlkYXRlc1tqXTtcbiAgICAgICAgICAgICAgICB2YXIgY2FuZGlkYXRlQXR0cmlidXRlID0gZ2V0QXR0cmlidXRlKGNhbmRpZGF0ZSwgYXR0cmlidXRlLm5vZGVOYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoY2FuZGlkYXRlQXR0cmlidXRlICYmIGNhbmRpZGF0ZUF0dHJpYnV0ZS5ub2RlVmFsdWUgPT09IGF0dHJpYnV0ZS5ub2RlVmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIHJlbWFpbmluZ0NhbmRpZGF0ZXMucHVzaChjYW5kaWRhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlbWFpbmluZ0NhbmRpZGF0ZXMubGVuZ3RoIDwga05vYWhzQXJrQ2FwYWNpdHkpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgY2FuZGlkYXRlcyA9IHJlbWFpbmluZ0NhbmRpZGF0ZXM7XG4gICAgICAgICAgICByZW1haW5pbmdDYW5kaWRhdGVzID0gW107XG4gICAgICAgIH1cbiAgICAgICAgLy8gSW5kdWN0aXZlbHksIHdlIHNob3VsZG4ndCBzcGluIHRoaXMgbG9vcCB2ZXJ5IG1hbnkgdGltZXMuIEl0J3MgcG9zc2libGUsXG4gICAgICAgIC8vIGhvd2V2ZXIsIHRoYXQgd2Ugd2lsIHNwaW4gdGhlIGxvb3AgbW9yZSB0aGFuIG9uY2UgYmVjYXVzZSBvZiBob3cgdGhlXG4gICAgICAgIC8vIGZvcm1hdHRpbmcgZWxlbWVudCBsaXN0IGdldHMgcGVybXV0ZWQuXG4gICAgICAgIGZvciAodmFyIGkgPSBrTm9haHNBcmtDYXBhY2l0eSAtIDE7IGkgPCBjYW5kaWRhdGVzLmxlbmd0aDsgaSsrKVxuICAgICAgICAgICAgdGhpcy5yZW1vdmVFbGVtZW50RnJvbUFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cyhjYW5kaWRhdGVzW2ldKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RhY2tJdGVtfSBpdGVtXG4gICAgICovXG4gICAgYXBwZW5kRWxlbWVudFRvQWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKGl0ZW0pIHtcbiAgICAgICAgdGhpcy5lbnN1cmVOb2Foc0Fya0NvbmRpdGlvbihpdGVtKTtcbiAgICAgICAgdGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMucHVzaChpdGVtKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RhY2tJdGVtfSBpdGVtXG4gICAgICovXG4gICAgcmVtb3ZlRWxlbWVudEZyb21BY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMoaXRlbSkge1xuICAgICAgICB2YXIgaW5kZXggPSB0aGlzLmFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cy5pbmRleE9mKGl0ZW0pO1xuICAgICAgICBpZiAoaW5kZXggPj0gMClcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzLnNwbGljZShpbmRleCwgMSk7XG4gICAgfVxuXG4gICAgZWxlbWVudEluQWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzKG5hbWUpIHtcbiAgICAgICAgdmFyIGVscyA9IHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzO1xuICAgICAgICBmb3IgKHZhciBpID0gZWxzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICBpZiAoZWxzW2ldID09IE1hcmtlcikgYnJlYWs7XG4gICAgICAgICAgICBpZiAoZWxzW2ldLmxvY2FsTmFtZSA9PSBuYW1lKSByZXR1cm4gZWxzW2ldO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjbGVhckFjdGl2ZUZvcm1hdHRpbmdFbGVtZW50cygpIHtcbiAgICAgICAgd2hpbGUgKCEodGhpcy5hY3RpdmVGb3JtYXR0aW5nRWxlbWVudHMubGVuZ3RoID09PSAwIHx8IHRoaXMuYWN0aXZlRm9ybWF0dGluZ0VsZW1lbnRzLnBvcCgpID09IE1hcmtlcikpO1xuICAgIH1cblxuICAgIHJlcGFyZW50Q2hpbGRyZW4ob2xkUGFyZW50LCBuZXdQYXJlbnQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm90IGltcGxlbWVudGVkXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNvbnRleHQgQSBjb250ZXh0IGVsZW1lbnQgbmFtZSBmb3IgZnJhZ21lbnQgcGFyc2luZ1xuICAgICAqL1xuICAgIHNldEZyYWdtZW50Q29udGV4dChjb250ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgLy8gU3RlcHMgNC4yLTQuNiBvZiB0aGUgSFRNTDUgRnJhZ21lbnQgQ2FzZSBwYXJzaW5nIGFsZ29yaXRobTpcbiAgICAgICAgLy8gaHR0cDovL3d3dy53aGF0d2cub3JnL3NwZWNzL3dlYi1hcHBzL2N1cnJlbnQtd29yay9tdWx0aXBhZ2UvdGhlLWVuZC5odG1sI2ZyYWdtZW50LWNhc2VcbiAgICAgICAgLy8gRm9yIGVmZmljaWVuY3ksIHdlIHNraXAgc3RlcCA0LjIgKFwiTGV0IHJvb3QgYmUgYSBuZXcgaHRtbCBlbGVtZW50IHdpdGggbm8gYXR0cmlidXRlc1wiKVxuICAgICAgICAvLyBhbmQgaW5zdGVhZCB1c2UgdGhlIERvY3VtZW50RnJhZ21lbnQgYXMgYSByb290IG5vZGUuXG4gICAgICAgIC8vIG1fdHJlZS5vcGVuRWxlbWVudHMoKS0+cHVzaFJvb3ROb2RlKEhUTUxTdGFja0l0ZW06OmNyZWF0ZShmcmFnbWVudCwgSFRNTFN0YWNrSXRlbTo6SXRlbUZvckRvY3VtZW50RnJhZ21lbnROb2RlKSk7XG4gICAgICAgIHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gY29kZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbYXJnc11cbiAgICAgKi9cbiAgICBwYXJzZUVycm9yKGNvZGUsIGFyZ3M/KSB7XG4gICAgICAgIC8vIEZJWE1FOiB0aGlzLmVycm9ycy5wdXNoKFt0aGlzLnRva2VuaXplci5wb3NpdGlvbiwgY29kZSwgZGF0YV0pO1xuICAgICAgICBpZiAoIXRoaXMuZXJyb3JIYW5kbGVyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgbWVzc2FnZSA9IGZvcm1hdE1lc3NhZ2UobWVzc2FnZXNbY29kZV0sIGFyZ3MpO1xuICAgICAgICB0aGlzLmVycm9ySGFuZGxlci5lcnJvcihtZXNzYWdlLCB0aGlzLnRva2VuaXplci5faW5wdXRTdHJlYW0ubG9jYXRpb24oKSwgY29kZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVzZXRzIHRoZSBpbnNlcnRpb24gbW9kZSAoaHR0cDovL3d3dy53aGF0d2cub3JnL3NwZWNzL3dlYi1hcHBzL2N1cnJlbnQtd29yay9tdWx0aXBhZ2UvcGFyc2luZy5odG1sI3Jlc2V0LXRoZS1pbnNlcnRpb24tbW9kZS1hcHByb3ByaWF0ZWx5KVxuICAgICAqL1xuICAgIHJlc2V0SW5zZXJ0aW9uTW9kZSgpIHtcbiAgICAgICAgdmFyIGxhc3QgPSBmYWxzZTtcbiAgICAgICAgdmFyIG5vZGUgPSBudWxsO1xuICAgICAgICBmb3IgKHZhciBpID0gdGhpcy5vcGVuRWxlbWVudHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIG5vZGUgPSB0aGlzLm9wZW5FbGVtZW50cy5pdGVtKGkpO1xuICAgICAgICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgICAgICAgICAvLyBUT0RPIGFzc2VydC5vayh0aGlzLmNvbnRleHQpO1xuICAgICAgICAgICAgICAgIGxhc3QgPSB0cnVlO1xuICAgICAgICAgICAgICAgIG5vZGUgPSBuZXcgU3RhY2tJdGVtKFwiaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbFwiLCB0aGlzLmNvbnRleHQsIFtdLCBudWxsKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG5vZGUubmFtZXNwYWNlVVJJID09PSBcImh0dHA6Ly93d3cudzMub3JnLzE5OTkveGh0bWxcIikge1xuICAgICAgICAgICAgICAgIC8vIFRPRE8gdGVtcGxhdGUgdGFnXG4gICAgICAgICAgICAgICAgaWYgKG5vZGUubG9jYWxOYW1lID09PSAnc2VsZWN0JylcbiAgICAgICAgICAgICAgICAgICAgLy8gRklYTUUgaGFuZGxlIGluU2VsZWN0SW5UYWJsZVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbnNlcnRpb25Nb2RlKCdpblNlbGVjdCcpO1xuICAgICAgICAgICAgICAgIGlmIChub2RlLmxvY2FsTmFtZSA9PT0gJ3RkJyB8fCBub2RlLmxvY2FsTmFtZSA9PT0gJ3RoJylcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5zZXJ0aW9uTW9kZSgnaW5DZWxsJyk7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUubG9jYWxOYW1lID09PSAndHInKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbnNlcnRpb25Nb2RlKCdpblJvdycpO1xuICAgICAgICAgICAgICAgIGlmIChub2RlLmxvY2FsTmFtZSA9PT0gJ3Rib2R5JyB8fCBub2RlLmxvY2FsTmFtZSA9PT0gJ3RoZWFkJyB8fCBub2RlLmxvY2FsTmFtZSA9PT0gJ3Rmb290JylcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5zZXJ0aW9uTW9kZSgnaW5UYWJsZUJvZHknKTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5sb2NhbE5hbWUgPT09ICdjYXB0aW9uJylcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5zZXJ0aW9uTW9kZSgnaW5DYXB0aW9uJyk7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUubG9jYWxOYW1lID09PSAnY29sZ3JvdXAnKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbnNlcnRpb25Nb2RlKCdpbkNvbHVtbkdyb3VwJyk7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUubG9jYWxOYW1lID09PSAndGFibGUnKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbnNlcnRpb25Nb2RlKCdpblRhYmxlJyk7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUubG9jYWxOYW1lID09PSAnaGVhZCcgJiYgIWxhc3QpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldEluc2VydGlvbk1vZGUoJ2luSGVhZCcpO1xuICAgICAgICAgICAgICAgIGlmIChub2RlLmxvY2FsTmFtZSA9PT0gJ2JvZHknKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbnNlcnRpb25Nb2RlKCdpbkJvZHknKTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5sb2NhbE5hbWUgPT09ICdmcmFtZXNldCcpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldEluc2VydGlvbk1vZGUoJ2luRnJhbWVzZXQnKTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5sb2NhbE5hbWUgPT09ICdodG1sJylcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLm9wZW5FbGVtZW50cy5oZWFkRWxlbWVudClcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldEluc2VydGlvbk1vZGUoJ2JlZm9yZUhlYWQnKTtcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5zZXJ0aW9uTW9kZSgnYWZ0ZXJIZWFkJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChsYXN0KVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldEluc2VydGlvbk1vZGUoJ2luQm9keScpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJvY2Vzc0dlbmVyaWNSQ0RBVEFTdGFydFRhZyhuYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgIHRoaXMuaW5zZXJ0RWxlbWVudChuYW1lLCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgdGhpcy50b2tlbml6ZXIuc2V0U3RhdGUoVG9rZW5pemVyLlJDREFUQSk7XG4gICAgICAgIHRoaXMub3JpZ2luYWxJbnNlcnRpb25Nb2RlID0gdGhpcy5pbnNlcnRpb25Nb2RlTmFtZTtcbiAgICAgICAgdGhpcy5zZXRJbnNlcnRpb25Nb2RlKCd0ZXh0Jyk7XG4gICAgfVxuXG4gICAgcHJvY2Vzc0dlbmVyaWNSYXdUZXh0U3RhcnRUYWcobmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICB0aGlzLmluc2VydEVsZW1lbnQobmFtZSwgYXR0cmlidXRlcyk7XG4gICAgICAgIHRoaXMudG9rZW5pemVyLnNldFN0YXRlKFRva2VuaXplci5SQVdURVhUKTtcbiAgICAgICAgdGhpcy5vcmlnaW5hbEluc2VydGlvbk1vZGUgPSB0aGlzLmluc2VydGlvbk1vZGVOYW1lO1xuICAgICAgICB0aGlzLnNldEluc2VydGlvbk1vZGUoJ3RleHQnKTtcbiAgICB9XG5cbiAgICBhZGp1c3RNYXRoTUxBdHRyaWJ1dGVzKGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgYXR0cmlidXRlcy5mb3JFYWNoKGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgICAgIGEubmFtZXNwYWNlVVJJID0gXCJodHRwOi8vd3d3LnczLm9yZy8xOTk4L01hdGgvTWF0aE1MXCI7XG4gICAgICAgICAgICBpZiAoTUFUSE1MQXR0cmlidXRlTWFwW2Eubm9kZU5hbWVdKVxuICAgICAgICAgICAgICAgIGEubm9kZU5hbWUgPSBNQVRITUxBdHRyaWJ1dGVNYXBbYS5ub2RlTmFtZV07XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gYXR0cmlidXRlcztcbiAgICB9XG5cbiAgICBhZGp1c3RTVkdUYWdOYW1lQ2FzZShuYW1lKSB7XG4gICAgICAgIHJldHVybiBTVkdUYWdNYXBbbmFtZV0gfHwgbmFtZTtcbiAgICB9XG5cbiAgICBhZGp1c3RTVkdBdHRyaWJ1dGVzKGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgYXR0cmlidXRlcy5mb3JFYWNoKGZ1bmN0aW9uKGEpIHtcbiAgICAgICAgICAgIGEubmFtZXNwYWNlVVJJID0gXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiO1xuICAgICAgICAgICAgaWYgKFNWR0F0dHJpYnV0ZU1hcFthLm5vZGVOYW1lXSlcbiAgICAgICAgICAgICAgICBhLm5vZGVOYW1lID0gU1ZHQXR0cmlidXRlTWFwW2Eubm9kZU5hbWVdO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGF0dHJpYnV0ZXM7XG4gICAgfVxuXG4gICAgYWRqdXN0Rm9yZWlnbkF0dHJpYnV0ZXMoYXR0cmlidXRlcykge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGF0dHJpYnV0ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzW2ldO1xuICAgICAgICAgICAgdmFyIGFkanVzdGVkID0gRm9yZWlnbkF0dHJpYnV0ZU1hcFthdHRyaWJ1dGUubm9kZU5hbWVdO1xuICAgICAgICAgICAgaWYgKGFkanVzdGVkKSB7XG4gICAgICAgICAgICAgICAgYXR0cmlidXRlLm5vZGVOYW1lID0gYWRqdXN0ZWQubG9jYWxOYW1lO1xuICAgICAgICAgICAgICAgIGF0dHJpYnV0ZS5wcmVmaXggPSBhZGp1c3RlZC5wcmVmaXg7XG4gICAgICAgICAgICAgICAgYXR0cmlidXRlLm5hbWVzcGFjZVVSSSA9IGFkanVzdGVkLm5hbWVzcGFjZVVSSTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXR0cmlidXRlcztcbiAgICB9XG59Il19