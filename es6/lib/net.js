import { getDocumentHead } from './dom';
export function get(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            callback(xhr.responseText);
        }
    };
    xhr.send(null);
}
export function loadScript(src, callback, doc) {
    var head = getDocumentHead();
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
;
export function qualifyURL(url) {
    var a = document.createElement('a');
    a.href = url;
    return a.href;
}
