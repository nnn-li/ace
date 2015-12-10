/**
 * Executes a 'GET' HTTP request with a responseText callback.
 */
export declare function get(url: string, callback: (responseText: string) => any): void;
/**
 * Creates a <script> tag, sets the 'src' property, and calls back when loaded.
 */
export declare function loadScript(src: string, callback: () => any, doc: Document): void;
/**
 * Convert a url into a fully qualified absolute URL.
 * This function does not work in IE6
 */
export declare function qualifyURL(url: string): string;
