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
// FIXME convert CR to LF http://www.whatwg.org/specs/web-apps/current-work/multipage/parsing.html#input-stream
export default class InputStream {
    data: string;
    start: number;
    committed: number;
    eof: boolean;
    lastLocation: { line: number; column: number };
    constructor() {
        this.data = '';
        this.start = 0;
        this.committed = 0;
        this.eof = false;
        this.lastLocation = { line: 0, column: 0 };
    }
    slice(): any {
        if (this.start >= this.data.length) {
            if (!this.eof) throw InputStream.DRAIN;
            return InputStream.EOF;
        }
        return this.data.slice(this.start, this.data.length);
    }
    char(): any {
        if (!this.eof && this.start >= this.data.length - 1) throw InputStream.DRAIN;
        if (this.start >= this.data.length) {
            return InputStream.EOF;
        }
        var ch = this.data[this.start++];
        if (ch === '\r')
            ch = '\n';
        return ch;
    }
    advance(amount: number): number {
        this.start += amount;
        if (this.start >= this.data.length) {
            if (!this.eof) throw InputStream.DRAIN;
            return InputStream.EOF;
        }
        else {
            if (this.committed > this.data.length / 2) {
                // Sliiiide
                this.lastLocation = this.location();
                this.data = this.data.slice(this.committed);
                this.start = this.start - this.committed;
                this.committed = 0;
            }
        }
    }
    matchWhile(re) {
        if (this.eof && this.start >= this.data.length) return '';
        var r = new RegExp("^" + re + "+");
        var m = r.exec(this.slice());
        if (m) {
            if (!this.eof && m[0].length == this.data.length - this.start) throw InputStream.DRAIN;
            this.advance(m[0].length);
            return m[0];
        } else {
            return '';
        }
    }
    matchUntil(re): string {
        var m, s;
        s = this.slice();
        if (s === InputStream.EOF) {
            return '';
        }
        else if (m = new RegExp(re + (this.eof ? "|$" : "")).exec(s)) {
            var t = this.data.slice(this.start, this.start + m.index);
            this.advance(m.index);
            return t.replace(/\r/g, '\n').replace(/\n{2,}/g, '\n');
        }
        else {
            throw InputStream.DRAIN;
        }
    }
    append(data) {
        this.data += data;
    }
    shift(n): any {
        if (!this.eof && this.start + n >= this.data.length) throw InputStream.DRAIN;
        if (this.eof && this.start >= this.data.length) return InputStream.EOF;
        var d = this.data.slice(this.start, this.start + n).toString();
        this.advance(Math.min(n, this.data.length - this.start));
        return d;
    }
    peek(n): any {
        if (!this.eof && this.start + n >= this.data.length) throw InputStream.DRAIN;
        if (this.eof && this.start >= this.data.length) return InputStream.EOF;
        return this.data.slice(this.start, Math.min(this.start + n, this.data.length)).toString();
    }
    length() {
        return this.data.length - this.start - 1;
    }
    unget(d) {
        if (d === InputStream.EOF) return;
        this.start -= (d.length);
    }
    undo() {
        this.start = this.committed;
    }
    commit() {
        this.committed = this.start;
    }
    location() {
        var lastLine = this.lastLocation.line;
        var lastColumn = this.lastLocation.column;
        var read = this.data.slice(0, this.committed);
        var newlines = read.match(/\n/g);
        var line = newlines ? lastLine + newlines.length : lastLine;
        var column = newlines ? read.length - read.lastIndexOf('\n') - 1 : lastColumn + read.length;
        return { line: line, column: column };
    }
    static EOF = -1;
    static DRAIN = -2;
}
