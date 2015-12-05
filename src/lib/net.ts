/*
 * based on code from:
 *
 * @license RequireJS text 0.25.0 Copyright (c) 2010-2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */

import dom = require("./dom");

/**
 * Executes a 'GET' HTTP request with a responseText callback.
 */
export function get(url: string, callback: (responseText: string) => any) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function() {
        // Do not explicitly handle errors, those should be
        // visible via console output in the browser.
        if (xhr.readyState === 4) {
            callback(xhr.responseText);
        }
    };
    xhr.send(null);
}

/**
 * Creates a <script> tag, sets the 'src' property and calls back when loaded.
 */
export function loadScript(path: string, callback: () => any): void {
    // TODO: This is a standard trick. Are there any best practices?
    var head: HTMLElement = dom.getDocumentHead();
    var s: HTMLScriptElement = document.createElement('script');

    s.src = path;
    head.appendChild(s);

    s.onload = s['onreadystatechange'] = function(_, isAbort?: boolean) {
        if (isAbort || !s['readyState'] || s['readyState'] === "loaded" || s['readyState'] === "complete") {
            s = s.onload = s['onreadystatechange'] = null;
            if (!isAbort) {
                callback();
            }
        }
    };
};

/**
 * Convert a url into a fully qualified absolute URL.
 * This function does not work in IE6
 */
export function qualifyURL(url: string): string {
    // TODO: This is a standard trick. Are there any best practices?
    var a: HTMLAnchorElement = document.createElement('a');
    a.href = url;
    return a.href;
}
