"use strict";
import Editor from './Editor';
import Document from './Document';
import EditSession from './EditSession';
import VirtualRenderer from './VirtualRenderer';
var code = '// comment\n"use strict";\nvar x = 0;\nvar y = 1;\n';
var doc = new Document(code);
var editSession = new EditSession(doc);
editSession.importMode('lib/mode/JavaScriptMode')
    .then(function (mode) {
    editSession.setLanguageMode(mode);
}).catch(function (reason) {
    console.warn(`importMode() failed. Reason:  ${reason}`);
});
editSession.setTabSize(2);
editSession.setUseSoftTabs(true);
var element = document.getElementById('editor');
var renderer = new VirtualRenderer(element);
renderer.importThemeLink('lib/theme/twilight')
    .then(function (themeLink) {
    renderer.setThemeLink(themeLink);
})
    .catch(function (reason) {
    console.warn(`importThemeLink() failed. Reason:  ${reason}`);
});
var editor = new Editor(renderer, editSession);
editor.setFontSize("20px");
