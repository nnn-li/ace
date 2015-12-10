/**
 * based on code from:
 *
 * @license RequireJS text 0.25.0 Copyright (c) 2010-2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */
define(["require", "exports", './dom'], function (require, exports, dom_1) {
    /**
     * Executes a 'GET' HTTP request with a responseText callback.
     */
    function get(url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function () {
            // Do not explicitly handle errors, those should be
            // visible via console output in the browser.
            if (xhr.readyState === 4) {
                callback(xhr.responseText);
            }
        };
        xhr.send(null);
    }
    exports.get = get;
    /**
     * Creates a <script> tag, sets the 'src' property, and calls back when loaded.
     */
    function loadScript(src, callback, doc) {
        // TODO: This is a standard trick. Are there any best practices?
        var head = dom_1.getDocumentHead();
        var s = doc.createElement('script');
        s.src = src;
        head.appendChild(s);
        s.onload = s['onreadystatechange'] = function (_, isAbort) {
            if (isAbort || !s['readyState'] || s['readyState'] === "loaded" || s['readyState'] === "complete") {
                s = s.onload = s['onreadystatechange'] = null;
                if (!isAbort) {
                    callback();
                }
            }
        };
    }
    exports.loadScript = loadScript;
    ;
    /**
     * Convert a url into a fully qualified absolute URL.
     * This function does not work in IE6
     */
    function qualifyURL(url) {
        // TODO: This is a standard trick. Are there any best practices?
        var a = document.createElement('a');
        a.href = url;
        return a.href;
    }
    exports.qualifyURL = qualifyURL;
});
