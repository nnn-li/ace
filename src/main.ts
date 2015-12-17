/* ***** BEGIN LICENSE BLOCK *****
 * The MIT License (MIT)
 *
 * Copyright (c) 2014-2016 David Geo Holmes <david.geo.holmes@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * ***** END LICENSE BLOCK ***** */
"use strict";

import Editor from './Editor';
import Document from './Document';
import EditSession from './EditSession';
import EditorRenderer from './EditorRenderer';
import VirtualRenderer from './VirtualRenderer';

import TextMode from './mode/TextMode';
import CssMode from './mode/CssMode';
import HtmlMode from './mode/HtmlMode';
import JavaScriptMode from './mode/JavaScriptMode';
import TypeScriptMode from './mode/TypeScriptMode';

import LanguageMode from './LanguageMode';
import Range from './Range';
import ThemeLink from './ThemeLink';

// var text = new TextMode()
// var mode = new CssMode()
// var mode = new HtmlMode()
// var mode = new JavaScriptMode()
// var mode = new TypeScriptMode()

var code = '// comment\n"use strict";\nvar x = 0;\nvar y = 1;\n';
//var code = '';

var doc = new Document(code);

var editSession = new EditSession(doc);
// editSession.setUseWorker(false);
// We can use module names to set the language mode.
// FIXME: Separate out the synchronous from the async?
//editSession.setMode(text);
editSession.importMode('lib/mode/JavaScriptMode')
    .then(function(mode: LanguageMode) {
        editSession.setLanguageMode(mode);
    }).catch(function(reason) {
        console.warn(`importMode() failed. Reason:  ${reason}`);
    });
editSession.setTabSize(2);
editSession.setUseSoftTabs(true);

var element = document.getElementById('editor')
var renderer = new VirtualRenderer(element);
//renderer.setAnnotations([]);
//renderer.setPadding(10);
renderer.importThemeLink('lib/theme/twilight')
    .then(function(themeLink: ThemeLink) {
        renderer.setThemeCss(themeLink,'/assets/css/twilight.css')
    })
    .catch(function(reason) {
        console.warn(`importThemeLink() failed. Reason:  ${reason}`);
    });
//renderer.setAnimatedScroll(true);
//renderer.setCompositionText("Hello");
//renderer.setCursorStyle('yahoo');

//renderer.setDefaultHandler('', function() {
//});

//renderer.setMouseCursor('cursor-style');
//renderer.setScrollMargin(5, 5, 5, 5);
//renderer.setShowGutter(true);
//renderer.setShowInvisibles(true);
//renderer.setCursorLayerOff();
//renderer.setDefaultCursorStyle();
//renderer.setDisplayIndentGuides(true);
//renderer.setFadeFoldWidgets(true);
//renderer.setHighlightGutterLine(true);
//renderer.setPrintMarginColumn(23);
//renderer.setShowPrintMargin(true);
//renderer.setHScrollBarAlwaysVisible(true);
//renderer.setVScrollBarAlwaysVisible(true);

// The Editor acts as a controller between the renderer and the EditSession.
var editor = new Editor(renderer, editSession);
editor.setFontSize("20px");
//editor.setHighlightActiveLine(true);
// editor.setHighlightGutterLine(true); Why repeated?
//editor.setHighlightSelectedWord(true);
//editor.setAnimatedScroll(false);  // Why repeated?
//editor.setShowInvisibles(true); // Why repeated
