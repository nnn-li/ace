define(function(require, exports, module) {
"no use strict";
exports.isDark = true;

/**
* The cssClass variable corresponds to the class used in mathdoodle.css
*/
exports.cssClass = "ace-mathdoodle";
exports.cssText = require("../requirejs/text!./mathdoodle.css");

var dom = require("../lib/dom");
dom.importCssString(exports.cssText, exports.cssClass);
});
