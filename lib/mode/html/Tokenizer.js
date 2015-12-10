import { EntityParser } from './EntityParser';
import InputStream from './InputStream';
import isAlpha from './isAlpha';
import isWhitespace from './isWhitespace';
export default class Tokenizer {
    constructor(tokenHandler) {
        this._emitCurrentToken = function () {
            this._state = Tokenizer.DATA;
            this._emitToken(this._currentToken);
        };
        this._currentAttribute = function () {
            return this._currentToken.data[this._currentToken.data.length - 1];
        };
        this.setState = function (state) {
            this._state = state;
        };
        this.tokenize = function (source) {
            Tokenizer.DATA = data_state;
            Tokenizer.RCDATA = rcdata_state;
            Tokenizer.RAWTEXT = rawtext_state;
            Tokenizer.SCRIPT_DATA = script_data_state;
            Tokenizer.PLAINTEXT = plaintext_state;
            this._state = Tokenizer.DATA;
            this._inputStream.append(source);
            this._tokenHandler.startTokenization(this);
            this._inputStream.eof = true;
            var tokenizer = this;
            while (this._state.call(this, this._inputStream))
                ;
            function data_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._emitToken({ type: 'EOF', data: null });
                    return false;
                }
                else if (data === '&') {
                    tokenizer.setState(character_reference_in_data_state);
                }
                else if (data === '<') {
                    tokenizer.setState(tag_open_state);
                }
                else if (data === '\u0000') {
                    tokenizer._emitToken({ type: 'Characters', data: data });
                    buffer.commit();
                }
                else {
                    var chars = buffer.matchUntil("&|<|\u0000");
                    tokenizer._emitToken({ type: 'Characters', data: data + chars });
                    buffer.commit();
                }
                return true;
            }
            function character_reference_in_data_state(buffer) {
                var character = EntityParser.consumeEntity(buffer, tokenizer);
                tokenizer.setState(data_state);
                tokenizer._emitToken({ type: 'Characters', data: character || '&' });
                return true;
            }
            function rcdata_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._emitToken({ type: 'EOF', data: null });
                    return false;
                }
                else if (data === '&') {
                    tokenizer.setState(character_reference_in_rcdata_state);
                }
                else if (data === '<') {
                    tokenizer.setState(rcdata_less_than_sign_state);
                }
                else if (data === "\u0000") {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._emitToken({ type: 'Characters', data: '\uFFFD' });
                    buffer.commit();
                }
                else {
                    var chars = buffer.matchUntil("&|<|\u0000");
                    tokenizer._emitToken({ type: 'Characters', data: data + chars });
                    buffer.commit();
                }
                return true;
            }
            function character_reference_in_rcdata_state(buffer) {
                var character = EntityParser.consumeEntity(buffer, tokenizer);
                tokenizer.setState(rcdata_state);
                tokenizer._emitToken({ type: 'Characters', data: character || '&' });
                return true;
            }
            function rawtext_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._emitToken({ type: 'EOF', data: null });
                    return false;
                }
                else if (data === '<') {
                    tokenizer.setState(rawtext_less_than_sign_state);
                }
                else if (data === "\u0000") {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._emitToken({ type: 'Characters', data: '\uFFFD' });
                    buffer.commit();
                }
                else {
                    var chars = buffer.matchUntil("<|\u0000");
                    tokenizer._emitToken({ type: 'Characters', data: data + chars });
                }
                return true;
            }
            function plaintext_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._emitToken({ type: 'EOF', data: null });
                    return false;
                }
                else if (data === "\u0000") {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._emitToken({ type: 'Characters', data: '\uFFFD' });
                    buffer.commit();
                }
                else {
                    var chars = buffer.matchUntil("\u0000");
                    tokenizer._emitToken({ type: 'Characters', data: data + chars });
                }
                return true;
            }
            function script_data_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._emitToken({ type: 'EOF', data: null });
                    return false;
                }
                else if (data === '<') {
                    tokenizer.setState(script_data_less_than_sign_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._emitToken({ type: 'Characters', data: '\uFFFD' });
                    buffer.commit();
                }
                else {
                    var chars = buffer.matchUntil("<|\u0000");
                    tokenizer._emitToken({ type: 'Characters', data: data + chars });
                }
                return true;
            }
            function rcdata_less_than_sign_state(buffer) {
                var data = buffer.char();
                if (data === "/") {
                    this._temporaryBuffer = '';
                    tokenizer.setState(rcdata_end_tag_open_state);
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: '<' });
                    buffer.unget(data);
                    tokenizer.setState(rcdata_state);
                }
                return true;
            }
            function rcdata_end_tag_open_state(buffer) {
                var data = buffer.char();
                if (isAlpha(data)) {
                    this._temporaryBuffer += data;
                    tokenizer.setState(rcdata_end_tag_name_state);
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: '</' });
                    buffer.unget(data);
                    tokenizer.setState(rcdata_state);
                }
                return true;
            }
            function rcdata_end_tag_name_state(buffer) {
                var appropriate = tokenizer._currentToken && (tokenizer._currentToken.name === this._temporaryBuffer.toLowerCase());
                var data = buffer.char();
                if (isWhitespace(data) && appropriate) {
                    tokenizer._currentToken = { type: 'EndTag', name: this._temporaryBuffer, data: [], selfClosing: false };
                    tokenizer.setState(before_attribute_name_state);
                }
                else if (data === '/' && appropriate) {
                    tokenizer._currentToken = { type: 'EndTag', name: this._temporaryBuffer, data: [], selfClosing: false };
                    tokenizer.setState(self_closing_tag_state);
                }
                else if (data === '>' && appropriate) {
                    tokenizer._currentToken = { type: 'EndTag', name: this._temporaryBuffer, data: [], selfClosing: false };
                    tokenizer._emitCurrentToken();
                    tokenizer.setState(data_state);
                }
                else if (isAlpha(data)) {
                    this._temporaryBuffer += data;
                    buffer.commit();
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: '</' + this._temporaryBuffer });
                    buffer.unget(data);
                    tokenizer.setState(rcdata_state);
                }
                return true;
            }
            function rawtext_less_than_sign_state(buffer) {
                var data = buffer.char();
                if (data === "/") {
                    this._temporaryBuffer = '';
                    tokenizer.setState(rawtext_end_tag_open_state);
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: '<' });
                    buffer.unget(data);
                    tokenizer.setState(rawtext_state);
                }
                return true;
            }
            function rawtext_end_tag_open_state(buffer) {
                var data = buffer.char();
                if (isAlpha(data)) {
                    this._temporaryBuffer += data;
                    tokenizer.setState(rawtext_end_tag_name_state);
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: '</' });
                    buffer.unget(data);
                    tokenizer.setState(rawtext_state);
                }
                return true;
            }
            function rawtext_end_tag_name_state(buffer) {
                var appropriate = tokenizer._currentToken && (tokenizer._currentToken.name === this._temporaryBuffer.toLowerCase());
                var data = buffer.char();
                if (isWhitespace(data) && appropriate) {
                    tokenizer._currentToken = { type: 'EndTag', name: this._temporaryBuffer, data: [], selfClosing: false };
                    tokenizer.setState(before_attribute_name_state);
                }
                else if (data === '/' && appropriate) {
                    tokenizer._currentToken = { type: 'EndTag', name: this._temporaryBuffer, data: [], selfClosing: false };
                    tokenizer.setState(self_closing_tag_state);
                }
                else if (data === '>' && appropriate) {
                    tokenizer._currentToken = { type: 'EndTag', name: this._temporaryBuffer, data: [], selfClosing: false };
                    tokenizer._emitCurrentToken();
                    tokenizer.setState(data_state);
                }
                else if (isAlpha(data)) {
                    this._temporaryBuffer += data;
                    buffer.commit();
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: '</' + this._temporaryBuffer });
                    buffer.unget(data);
                    tokenizer.setState(rawtext_state);
                }
                return true;
            }
            function script_data_less_than_sign_state(buffer) {
                var data = buffer.char();
                if (data === "/") {
                    this._temporaryBuffer = '';
                    tokenizer.setState(script_data_end_tag_open_state);
                }
                else if (data === '!') {
                    tokenizer._emitToken({ type: 'Characters', data: '<!' });
                    tokenizer.setState(script_data_escape_start_state);
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: '<' });
                    buffer.unget(data);
                    tokenizer.setState(script_data_state);
                }
                return true;
            }
            function script_data_end_tag_open_state(buffer) {
                var data = buffer.char();
                if (isAlpha(data)) {
                    this._temporaryBuffer += data;
                    tokenizer.setState(script_data_end_tag_name_state);
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: '</' });
                    buffer.unget(data);
                    tokenizer.setState(script_data_state);
                }
                return true;
            }
            function script_data_end_tag_name_state(buffer) {
                var appropriate = tokenizer._currentToken && (tokenizer._currentToken.name === this._temporaryBuffer.toLowerCase());
                var data = buffer.char();
                if (isWhitespace(data) && appropriate) {
                    tokenizer._currentToken = { type: 'EndTag', name: 'script', data: [], selfClosing: false };
                    tokenizer.setState(before_attribute_name_state);
                }
                else if (data === '/' && appropriate) {
                    tokenizer._currentToken = { type: 'EndTag', name: 'script', data: [], selfClosing: false };
                    tokenizer.setState(self_closing_tag_state);
                }
                else if (data === '>' && appropriate) {
                    tokenizer._currentToken = { type: 'EndTag', name: 'script', data: [], selfClosing: false };
                    tokenizer._emitCurrentToken();
                }
                else if (isAlpha(data)) {
                    this._temporaryBuffer += data;
                    buffer.commit();
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: '</' + this._temporaryBuffer });
                    buffer.unget(data);
                    tokenizer.setState(script_data_state);
                }
                return true;
            }
            function script_data_escape_start_state(buffer) {
                var data = buffer.char();
                if (data === '-') {
                    tokenizer._emitToken({ type: 'Characters', data: '-' });
                    tokenizer.setState(script_data_escape_start_dash_state);
                }
                else {
                    buffer.unget(data);
                    tokenizer.setState(script_data_state);
                }
                return true;
            }
            function script_data_escape_start_dash_state(buffer) {
                var data = buffer.char();
                if (data === '-') {
                    tokenizer._emitToken({ type: 'Characters', data: '-' });
                    tokenizer.setState(script_data_escaped_dash_dash_state);
                }
                else {
                    buffer.unget(data);
                    tokenizer.setState(script_data_state);
                }
                return true;
            }
            function script_data_escaped_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '-') {
                    tokenizer._emitToken({ type: 'Characters', data: '-' });
                    tokenizer.setState(script_data_escaped_dash_state);
                }
                else if (data === '<') {
                    tokenizer.setState(script_data_escaped_less_then_sign_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._emitToken({ type: 'Characters', data: '\uFFFD' });
                    buffer.commit();
                }
                else {
                    var chars = buffer.matchUntil('<|-|\u0000');
                    tokenizer._emitToken({ type: 'Characters', data: data + chars });
                }
                return true;
            }
            function script_data_escaped_dash_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '-') {
                    tokenizer._emitToken({ type: 'Characters', data: '-' });
                    tokenizer.setState(script_data_escaped_dash_dash_state);
                }
                else if (data === '<') {
                    tokenizer.setState(script_data_escaped_less_then_sign_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._emitToken({ type: 'Characters', data: '\uFFFD' });
                    tokenizer.setState(script_data_escaped_state);
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: data });
                    tokenizer.setState(script_data_escaped_state);
                }
                return true;
            }
            function script_data_escaped_dash_dash_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError('eof-in-script');
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '<') {
                    tokenizer.setState(script_data_escaped_less_then_sign_state);
                }
                else if (data === '>') {
                    tokenizer._emitToken({ type: 'Characters', data: '>' });
                    tokenizer.setState(script_data_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._emitToken({ type: 'Characters', data: '\uFFFD' });
                    tokenizer.setState(script_data_escaped_state);
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: data });
                    tokenizer.setState(script_data_escaped_state);
                }
                return true;
            }
            function script_data_escaped_less_then_sign_state(buffer) {
                var data = buffer.char();
                if (data === '/') {
                    this._temporaryBuffer = '';
                    tokenizer.setState(script_data_escaped_end_tag_open_state);
                }
                else if (isAlpha(data)) {
                    tokenizer._emitToken({ type: 'Characters', data: '<' + data });
                    this._temporaryBuffer = data;
                    tokenizer.setState(script_data_double_escape_start_state);
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: '<' });
                    buffer.unget(data);
                    tokenizer.setState(script_data_escaped_state);
                }
                return true;
            }
            function script_data_escaped_end_tag_open_state(buffer) {
                var data = buffer.char();
                if (isAlpha(data)) {
                    this._temporaryBuffer = data;
                    tokenizer.setState(script_data_escaped_end_tag_name_state);
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: '</' });
                    buffer.unget(data);
                    tokenizer.setState(script_data_escaped_state);
                }
                return true;
            }
            function script_data_escaped_end_tag_name_state(buffer) {
                var appropriate = tokenizer._currentToken && (tokenizer._currentToken.name === this._temporaryBuffer.toLowerCase());
                var data = buffer.char();
                if (isWhitespace(data) && appropriate) {
                    tokenizer._currentToken = { type: 'EndTag', name: 'script', data: [], selfClosing: false };
                    tokenizer.setState(before_attribute_name_state);
                }
                else if (data === '/' && appropriate) {
                    tokenizer._currentToken = { type: 'EndTag', name: 'script', data: [], selfClosing: false };
                    tokenizer.setState(self_closing_tag_state);
                }
                else if (data === '>' && appropriate) {
                    tokenizer._currentToken = { type: 'EndTag', name: 'script', data: [], selfClosing: false };
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else if (isAlpha(data)) {
                    this._temporaryBuffer += data;
                    buffer.commit();
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: '</' + this._temporaryBuffer });
                    buffer.unget(data);
                    tokenizer.setState(script_data_escaped_state);
                }
                return true;
            }
            function script_data_double_escape_start_state(buffer) {
                var data = buffer.char();
                if (isWhitespace(data) || data === '/' || data === '>') {
                    tokenizer._emitToken({ type: 'Characters', data: data });
                    if (this._temporaryBuffer.toLowerCase() === 'script')
                        tokenizer.setState(script_data_double_escaped_state);
                    else
                        tokenizer.setState(script_data_escaped_state);
                }
                else if (isAlpha(data)) {
                    tokenizer._emitToken({ type: 'Characters', data: data });
                    this._temporaryBuffer += data;
                    buffer.commit();
                }
                else {
                    buffer.unget(data);
                    tokenizer.setState(script_data_escaped_state);
                }
                return true;
            }
            function script_data_double_escaped_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError('eof-in-script');
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '-') {
                    tokenizer._emitToken({ type: 'Characters', data: '-' });
                    tokenizer.setState(script_data_double_escaped_dash_state);
                }
                else if (data === '<') {
                    tokenizer._emitToken({ type: 'Characters', data: '<' });
                    tokenizer.setState(script_data_double_escaped_less_than_sign_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError('invalid-codepoint');
                    tokenizer._emitToken({ type: 'Characters', data: '\uFFFD' });
                    buffer.commit();
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: data });
                    buffer.commit();
                }
                return true;
            }
            function script_data_double_escaped_dash_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError('eof-in-script');
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '-') {
                    tokenizer._emitToken({ type: 'Characters', data: '-' });
                    tokenizer.setState(script_data_double_escaped_dash_dash_state);
                }
                else if (data === '<') {
                    tokenizer._emitToken({ type: 'Characters', data: '<' });
                    tokenizer.setState(script_data_double_escaped_less_than_sign_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError('invalid-codepoint');
                    tokenizer._emitToken({ type: 'Characters', data: '\uFFFD' });
                    tokenizer.setState(script_data_double_escaped_state);
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: data });
                    tokenizer.setState(script_data_double_escaped_state);
                }
                return true;
            }
            function script_data_double_escaped_dash_dash_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError('eof-in-script');
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '-') {
                    tokenizer._emitToken({ type: 'Characters', data: '-' });
                    buffer.commit();
                }
                else if (data === '<') {
                    tokenizer._emitToken({ type: 'Characters', data: '<' });
                    tokenizer.setState(script_data_double_escaped_less_than_sign_state);
                }
                else if (data === '>') {
                    tokenizer._emitToken({ type: 'Characters', data: '>' });
                    tokenizer.setState(script_data_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError('invalid-codepoint');
                    tokenizer._emitToken({ type: 'Characters', data: '\uFFFD' });
                    tokenizer.setState(script_data_double_escaped_state);
                }
                else {
                    tokenizer._emitToken({ type: 'Characters', data: data });
                    tokenizer.setState(script_data_double_escaped_state);
                }
                return true;
            }
            function script_data_double_escaped_less_than_sign_state(buffer) {
                var data = buffer.char();
                if (data === '/') {
                    tokenizer._emitToken({ type: 'Characters', data: '/' });
                    this._temporaryBuffer = '';
                    tokenizer.setState(script_data_double_escape_end_state);
                }
                else {
                    buffer.unget(data);
                    tokenizer.setState(script_data_double_escaped_state);
                }
                return true;
            }
            function script_data_double_escape_end_state(buffer) {
                var data = buffer.char();
                if (isWhitespace(data) || data === '/' || data === '>') {
                    tokenizer._emitToken({ type: 'Characters', data: data });
                    if (this._temporaryBuffer.toLowerCase() === 'script')
                        tokenizer.setState(script_data_escaped_state);
                    else
                        tokenizer.setState(script_data_double_escaped_state);
                }
                else if (isAlpha(data)) {
                    tokenizer._emitToken({ type: 'Characters', data: data });
                    this._temporaryBuffer += data;
                    buffer.commit();
                }
                else {
                    buffer.unget(data);
                    tokenizer.setState(script_data_double_escaped_state);
                }
                return true;
            }
            function tag_open_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("bare-less-than-sign-at-eof");
                    tokenizer._emitToken({ type: 'Characters', data: '<' });
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (isAlpha(data)) {
                    tokenizer._currentToken = { type: 'StartTag', name: data.toLowerCase(), data: [] };
                    tokenizer.setState(tag_name_state);
                }
                else if (data === '!') {
                    tokenizer.setState(markup_declaration_open_state);
                }
                else if (data === '/') {
                    tokenizer.setState(close_tag_open_state);
                }
                else if (data === '>') {
                    tokenizer._parseError("expected-tag-name-but-got-right-bracket");
                    tokenizer._emitToken({ type: 'Characters', data: "<>" });
                    tokenizer.setState(data_state);
                }
                else if (data === '?') {
                    tokenizer._parseError("expected-tag-name-but-got-question-mark");
                    buffer.unget(data);
                    tokenizer.setState(bogus_comment_state);
                }
                else {
                    tokenizer._parseError("expected-tag-name");
                    tokenizer._emitToken({ type: 'Characters', data: "<" });
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                return true;
            }
            function close_tag_open_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("expected-closing-tag-but-got-eof");
                    tokenizer._emitToken({ type: 'Characters', data: '</' });
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (isAlpha(data)) {
                    tokenizer._currentToken = { type: 'EndTag', name: data.toLowerCase(), data: [] };
                    tokenizer.setState(tag_name_state);
                }
                else if (data === '>') {
                    tokenizer._parseError("expected-closing-tag-but-got-right-bracket");
                    tokenizer.setState(data_state);
                }
                else {
                    tokenizer._parseError("expected-closing-tag-but-got-char", { data: data });
                    buffer.unget(data);
                    tokenizer.setState(bogus_comment_state);
                }
                return true;
            }
            function tag_name_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError('eof-in-tag-name');
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (isWhitespace(data)) {
                    tokenizer.setState(before_attribute_name_state);
                }
                else if (isAlpha(data)) {
                    tokenizer._currentToken.name += data.toLowerCase();
                }
                else if (data === '>') {
                    tokenizer._emitCurrentToken();
                }
                else if (data === '/') {
                    tokenizer.setState(self_closing_tag_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._currentToken.name += "\uFFFD";
                }
                else {
                    tokenizer._currentToken.name += data;
                }
                buffer.commit();
                return true;
            }
            function before_attribute_name_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("expected-attribute-name-but-got-eof");
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (isWhitespace(data)) {
                    return true;
                }
                else if (isAlpha(data)) {
                    tokenizer._currentToken.data.push({ nodeName: data.toLowerCase(), nodeValue: "" });
                    tokenizer.setState(attribute_name_state);
                }
                else if (data === '>') {
                    tokenizer._emitCurrentToken();
                }
                else if (data === '/') {
                    tokenizer.setState(self_closing_tag_state);
                }
                else if (data === "'" || data === '"' || data === '=' || data === '<') {
                    tokenizer._parseError("invalid-character-in-attribute-name");
                    tokenizer._currentToken.data.push({ nodeName: data, nodeValue: "" });
                    tokenizer.setState(attribute_name_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._currentToken.data.push({ nodeName: "\uFFFD", nodeValue: "" });
                }
                else {
                    tokenizer._currentToken.data.push({ nodeName: data, nodeValue: "" });
                    tokenizer.setState(attribute_name_state);
                }
                return true;
            }
            function attribute_name_state(buffer) {
                var data = buffer.char();
                var leavingThisState = true;
                var shouldEmit = false;
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-attribute-name");
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                    shouldEmit = true;
                }
                else if (data === '=') {
                    tokenizer.setState(before_attribute_value_state);
                }
                else if (isAlpha(data)) {
                    tokenizer._currentAttribute().nodeName += data.toLowerCase();
                    leavingThisState = false;
                }
                else if (data === '>') {
                    shouldEmit = true;
                }
                else if (isWhitespace(data)) {
                    tokenizer.setState(after_attribute_name_state);
                }
                else if (data === '/') {
                    tokenizer.setState(self_closing_tag_state);
                }
                else if (data === "'" || data === '"') {
                    tokenizer._parseError("invalid-character-in-attribute-name");
                    tokenizer._currentAttribute().nodeName += data;
                    leavingThisState = false;
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._currentAttribute().nodeName += "\uFFFD";
                }
                else {
                    tokenizer._currentAttribute().nodeName += data;
                    leavingThisState = false;
                }
                if (leavingThisState) {
                    var attributes = tokenizer._currentToken.data;
                    var currentAttribute = attributes[attributes.length - 1];
                    for (var i = attributes.length - 2; i >= 0; i--) {
                        if (currentAttribute.nodeName === attributes[i].nodeName) {
                            tokenizer._parseError("duplicate-attribute", { name: currentAttribute.nodeName });
                            currentAttribute.nodeName = null;
                            break;
                        }
                    }
                    if (shouldEmit)
                        tokenizer._emitCurrentToken();
                }
                else {
                    buffer.commit();
                }
                return true;
            }
            function after_attribute_name_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("expected-end-of-tag-but-got-eof");
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (isWhitespace(data)) {
                    return true;
                }
                else if (data === '=') {
                    tokenizer.setState(before_attribute_value_state);
                }
                else if (data === '>') {
                    tokenizer._emitCurrentToken();
                }
                else if (isAlpha(data)) {
                    tokenizer._currentToken.data.push({ nodeName: data, nodeValue: "" });
                    tokenizer.setState(attribute_name_state);
                }
                else if (data === '/') {
                    tokenizer.setState(self_closing_tag_state);
                }
                else if (data === "'" || data === '"' || data === '<') {
                    tokenizer._parseError("invalid-character-after-attribute-name");
                    tokenizer._currentToken.data.push({ nodeName: data, nodeValue: "" });
                    tokenizer.setState(attribute_name_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._currentToken.data.push({ nodeName: "\uFFFD", nodeValue: "" });
                }
                else {
                    tokenizer._currentToken.data.push({ nodeName: data, nodeValue: "" });
                    tokenizer.setState(attribute_name_state);
                }
                return true;
            }
            function before_attribute_value_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("expected-attribute-value-but-got-eof");
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (isWhitespace(data)) {
                    return true;
                }
                else if (data === '"') {
                    tokenizer.setState(attribute_value_double_quoted_state);
                }
                else if (data === '&') {
                    tokenizer.setState(attribute_value_unquoted_state);
                    buffer.unget(data);
                }
                else if (data === "'") {
                    tokenizer.setState(attribute_value_single_quoted_state);
                }
                else if (data === '>') {
                    tokenizer._parseError("expected-attribute-value-but-got-right-bracket");
                    tokenizer._emitCurrentToken();
                }
                else if (data === '=' || data === '<' || data === '`') {
                    tokenizer._parseError("unexpected-character-in-unquoted-attribute-value");
                    tokenizer._currentAttribute().nodeValue += data;
                    tokenizer.setState(attribute_value_unquoted_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._currentAttribute().nodeValue += "\uFFFD";
                }
                else {
                    tokenizer._currentAttribute().nodeValue += data;
                    tokenizer.setState(attribute_value_unquoted_state);
                }
                return true;
            }
            function attribute_value_double_quoted_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-attribute-value-double-quote");
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '"') {
                    tokenizer.setState(after_attribute_value_state);
                }
                else if (data === '&') {
                    this._additionalAllowedCharacter = '"';
                    tokenizer.setState(character_reference_in_attribute_value_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._currentAttribute().nodeValue += "\uFFFD";
                }
                else {
                    var s = buffer.matchUntil('[\0"&]');
                    data = data + s;
                    tokenizer._currentAttribute().nodeValue += data;
                }
                return true;
            }
            function attribute_value_single_quoted_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-attribute-value-single-quote");
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === "'") {
                    tokenizer.setState(after_attribute_value_state);
                }
                else if (data === '&') {
                    this._additionalAllowedCharacter = "'";
                    tokenizer.setState(character_reference_in_attribute_value_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._currentAttribute().nodeValue += "\uFFFD";
                }
                else {
                    tokenizer._currentAttribute().nodeValue += data + buffer.matchUntil("\u0000|['&]");
                }
                return true;
            }
            function attribute_value_unquoted_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-after-attribute-value");
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (isWhitespace(data)) {
                    tokenizer.setState(before_attribute_name_state);
                }
                else if (data === '&') {
                    this._additionalAllowedCharacter = ">";
                    tokenizer.setState(character_reference_in_attribute_value_state);
                }
                else if (data === '>') {
                    tokenizer._emitCurrentToken();
                }
                else if (data === '"' || data === "'" || data === '=' || data === '`' || data === '<') {
                    tokenizer._parseError("unexpected-character-in-unquoted-attribute-value");
                    tokenizer._currentAttribute().nodeValue += data;
                    buffer.commit();
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._currentAttribute().nodeValue += "\uFFFD";
                }
                else {
                    var o = buffer.matchUntil("\u0000|[" + "\t\n\v\f\x20\r" + "&<>\"'=`" + "]");
                    if (o === InputStream.EOF) {
                        tokenizer._parseError("eof-in-attribute-value-no-quotes");
                        tokenizer._emitCurrentToken();
                    }
                    buffer.commit();
                    tokenizer._currentAttribute().nodeValue += data + o;
                }
                return true;
            }
            function character_reference_in_attribute_value_state(buffer) {
                var character = EntityParser.consumeEntity(buffer, tokenizer, this._additionalAllowedCharacter);
                this._currentAttribute().nodeValue += character || '&';
                if (this._additionalAllowedCharacter === '"')
                    tokenizer.setState(attribute_value_double_quoted_state);
                else if (this._additionalAllowedCharacter === '\'')
                    tokenizer.setState(attribute_value_single_quoted_state);
                else if (this._additionalAllowedCharacter === '>')
                    tokenizer.setState(attribute_value_unquoted_state);
                return true;
            }
            function after_attribute_value_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-after-attribute-value");
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (isWhitespace(data)) {
                    tokenizer.setState(before_attribute_name_state);
                }
                else if (data === '>') {
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else if (data === '/') {
                    tokenizer.setState(self_closing_tag_state);
                }
                else {
                    tokenizer._parseError("unexpected-character-after-attribute-value");
                    buffer.unget(data);
                    tokenizer.setState(before_attribute_name_state);
                }
                return true;
            }
            function self_closing_tag_state(buffer) {
                var c = buffer.char();
                if (c === InputStream.EOF) {
                    tokenizer._parseError("unexpected-eof-after-solidus-in-tag");
                    buffer.unget(c);
                    tokenizer.setState(data_state);
                }
                else if (c === '>') {
                    tokenizer._currentToken.selfClosing = true;
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else {
                    tokenizer._parseError("unexpected-character-after-solidus-in-tag");
                    buffer.unget(c);
                    tokenizer.setState(before_attribute_name_state);
                }
                return true;
            }
            function bogus_comment_state(buffer) {
                var data = buffer.matchUntil('>');
                data = data.replace(/\u0000/g, "\uFFFD");
                buffer.char();
                tokenizer._emitToken({ type: 'Comment', data: data });
                tokenizer.setState(data_state);
                return true;
            }
            function markup_declaration_open_state(buffer) {
                var chars = buffer.shift(2);
                if (chars === '--') {
                    tokenizer._currentToken = { type: 'Comment', data: '' };
                    tokenizer.setState(comment_start_state);
                }
                else {
                    var newchars = buffer.shift(5);
                    if (newchars === InputStream.EOF || chars === InputStream.EOF) {
                        tokenizer._parseError("expected-dashes-or-doctype");
                        tokenizer.setState(bogus_comment_state);
                        buffer.unget(chars);
                        return true;
                    }
                    chars += newchars;
                    if (chars.toUpperCase() === 'DOCTYPE') {
                        tokenizer._currentToken = { type: 'Doctype', name: '', publicId: null, systemId: null, forceQuirks: false };
                        tokenizer.setState(doctype_state);
                    }
                    else if (tokenizer._tokenHandler.isCdataSectionAllowed() && chars === '[CDATA[') {
                        tokenizer.setState(cdata_section_state);
                    }
                    else {
                        tokenizer._parseError("expected-dashes-or-doctype");
                        buffer.unget(chars);
                        tokenizer.setState(bogus_comment_state);
                    }
                }
                return true;
            }
            function cdata_section_state(buffer) {
                var data = buffer.matchUntil(']]>');
                buffer.shift(3);
                if (data) {
                    tokenizer._emitToken({ type: 'Characters', data: data });
                }
                tokenizer.setState(data_state);
                return true;
            }
            function comment_start_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-comment");
                    tokenizer._emitToken(tokenizer._currentToken);
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '-') {
                    tokenizer.setState(comment_start_dash_state);
                }
                else if (data === '>') {
                    tokenizer._parseError("incorrect-comment");
                    tokenizer._emitToken(tokenizer._currentToken);
                    tokenizer.setState(data_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._currentToken.data += "\uFFFD";
                }
                else {
                    tokenizer._currentToken.data += data;
                    tokenizer.setState(comment_state);
                }
                return true;
            }
            function comment_start_dash_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-comment");
                    tokenizer._emitToken(tokenizer._currentToken);
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '-') {
                    tokenizer.setState(comment_end_state);
                }
                else if (data === '>') {
                    tokenizer._parseError("incorrect-comment");
                    tokenizer._emitToken(tokenizer._currentToken);
                    tokenizer.setState(data_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._currentToken.data += "\uFFFD";
                }
                else {
                    tokenizer._currentToken.data += '-' + data;
                    tokenizer.setState(comment_state);
                }
                return true;
            }
            function comment_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-comment");
                    tokenizer._emitToken(tokenizer._currentToken);
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '-') {
                    tokenizer.setState(comment_end_dash_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._currentToken.data += "\uFFFD";
                }
                else {
                    tokenizer._currentToken.data += data;
                    buffer.commit();
                }
                return true;
            }
            function comment_end_dash_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-comment-end-dash");
                    tokenizer._emitToken(tokenizer._currentToken);
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '-') {
                    tokenizer.setState(comment_end_state);
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._currentToken.data += "-\uFFFD";
                    tokenizer.setState(comment_state);
                }
                else {
                    tokenizer._currentToken.data += '-' + data + buffer.matchUntil('\u0000|-');
                    buffer.char();
                }
                return true;
            }
            function comment_end_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-comment-double-dash");
                    tokenizer._emitToken(tokenizer._currentToken);
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '>') {
                    tokenizer._emitToken(tokenizer._currentToken);
                    tokenizer.setState(data_state);
                }
                else if (data === '!') {
                    tokenizer._parseError("unexpected-bang-after-double-dash-in-comment");
                    tokenizer.setState(comment_end_bang_state);
                }
                else if (data === '-') {
                    tokenizer._parseError("unexpected-dash-after-double-dash-in-comment");
                    tokenizer._currentToken.data += data;
                }
                else if (data === '\u0000') {
                    tokenizer._parseError("invalid-codepoint");
                    tokenizer._currentToken.data += "--\uFFFD";
                    tokenizer.setState(comment_state);
                }
                else {
                    tokenizer._parseError("unexpected-char-in-comment");
                    tokenizer._currentToken.data += '--' + data;
                    tokenizer.setState(comment_state);
                }
                return true;
            }
            function comment_end_bang_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-comment-end-bang-state");
                    tokenizer._emitToken(tokenizer._currentToken);
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '>') {
                    tokenizer._emitToken(tokenizer._currentToken);
                    tokenizer.setState(data_state);
                }
                else if (data === '-') {
                    tokenizer._currentToken.data += '--!';
                    tokenizer.setState(comment_end_dash_state);
                }
                else {
                    tokenizer._currentToken.data += '--!' + data;
                    tokenizer.setState(comment_state);
                }
                return true;
            }
            function doctype_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("expected-doctype-name-but-got-eof");
                    tokenizer._currentToken.forceQuirks = true;
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else if (isWhitespace(data)) {
                    tokenizer.setState(before_doctype_name_state);
                }
                else {
                    tokenizer._parseError("need-space-after-doctype");
                    buffer.unget(data);
                    tokenizer.setState(before_doctype_name_state);
                }
                return true;
            }
            function before_doctype_name_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("expected-doctype-name-but-got-eof");
                    tokenizer._currentToken.forceQuirks = true;
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else if (isWhitespace(data)) {
                }
                else if (data === '>') {
                    tokenizer._parseError("expected-doctype-name-but-got-right-bracket");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else {
                    if (isAlpha(data))
                        data = data.toLowerCase();
                    tokenizer._currentToken.name = data;
                    tokenizer.setState(doctype_name_state);
                }
                return true;
            }
            function doctype_name_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._currentToken.forceQuirks = true;
                    buffer.unget(data);
                    tokenizer._parseError("eof-in-doctype-name");
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else if (isWhitespace(data)) {
                    tokenizer.setState(after_doctype_name_state);
                }
                else if (data === '>') {
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else {
                    if (isAlpha(data))
                        data = data.toLowerCase();
                    tokenizer._currentToken.name += data;
                    buffer.commit();
                }
                return true;
            }
            function after_doctype_name_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._currentToken.forceQuirks = true;
                    buffer.unget(data);
                    tokenizer._parseError("eof-in-doctype");
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else if (isWhitespace(data)) {
                }
                else if (data === '>') {
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else {
                    if (['p', 'P'].indexOf(data) > -1) {
                        var expected = [['u', 'U'], ['b', 'B'], ['l', 'L'], ['i', 'I'], ['c', 'C']];
                        var matched = expected.every(function (expected) {
                            data = buffer.char();
                            return expected.indexOf(data) > -1;
                        });
                        if (matched) {
                            tokenizer.setState(after_doctype_public_keyword_state);
                            return true;
                        }
                    }
                    else if (['s', 'S'].indexOf(data) > -1) {
                        var expected = [['y', 'Y'], ['s', 'S'], ['t', 'T'], ['e', 'E'], ['m', 'M']];
                        var matched = expected.every(function (expected) {
                            data = buffer.char();
                            return expected.indexOf(data) > -1;
                        });
                        if (matched) {
                            tokenizer.setState(after_doctype_system_keyword_state);
                            return true;
                        }
                    }
                    buffer.unget(data);
                    tokenizer._currentToken.forceQuirks = true;
                    if (data === InputStream.EOF) {
                        tokenizer._parseError("eof-in-doctype");
                        buffer.unget(data);
                        tokenizer.setState(data_state);
                        tokenizer._emitCurrentToken();
                    }
                    else {
                        tokenizer._parseError("expected-space-or-right-bracket-in-doctype", { data: data });
                        tokenizer.setState(bogus_doctype_state);
                    }
                }
                return true;
            }
            function after_doctype_public_keyword_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else if (isWhitespace(data)) {
                    tokenizer.setState(before_doctype_public_identifier_state);
                }
                else if (data === "'" || data === '"') {
                    tokenizer._parseError("unexpected-char-in-doctype");
                    buffer.unget(data);
                    tokenizer.setState(before_doctype_public_identifier_state);
                }
                else {
                    buffer.unget(data);
                    tokenizer.setState(before_doctype_public_identifier_state);
                }
                return true;
            }
            function before_doctype_public_identifier_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else if (isWhitespace(data)) {
                }
                else if (data === '"') {
                    tokenizer._currentToken.publicId = '';
                    tokenizer.setState(doctype_public_identifier_double_quoted_state);
                }
                else if (data === "'") {
                    tokenizer._currentToken.publicId = '';
                    tokenizer.setState(doctype_public_identifier_single_quoted_state);
                }
                else if (data === '>') {
                    tokenizer._parseError("unexpected-end-of-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else {
                    tokenizer._parseError("unexpected-char-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer.setState(bogus_doctype_state);
                }
                return true;
            }
            function doctype_public_identifier_double_quoted_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else if (data === '"') {
                    tokenizer.setState(after_doctype_public_identifier_state);
                }
                else if (data === '>') {
                    tokenizer._parseError("unexpected-end-of-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else {
                    tokenizer._currentToken.publicId += data;
                }
                return true;
            }
            function doctype_public_identifier_single_quoted_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else if (data === "'") {
                    tokenizer.setState(after_doctype_public_identifier_state);
                }
                else if (data === '>') {
                    tokenizer._parseError("unexpected-end-of-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else {
                    tokenizer._currentToken.publicId += data;
                }
                return true;
            }
            function after_doctype_public_identifier_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer._emitCurrentToken();
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (isWhitespace(data)) {
                    tokenizer.setState(between_doctype_public_and_system_identifiers_state);
                }
                else if (data === '>') {
                    tokenizer.setState(data_state);
                    tokenizer._emitCurrentToken();
                }
                else if (data === '"') {
                    tokenizer._parseError("unexpected-char-in-doctype");
                    tokenizer._currentToken.systemId = '';
                    tokenizer.setState(doctype_system_identifier_double_quoted_state);
                }
                else if (data === "'") {
                    tokenizer._parseError("unexpected-char-in-doctype");
                    tokenizer._currentToken.systemId = '';
                    tokenizer.setState(doctype_system_identifier_single_quoted_state);
                }
                else {
                    tokenizer._parseError("unexpected-char-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer.setState(bogus_doctype_state);
                }
                return true;
            }
            function between_doctype_public_and_system_identifiers_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer._emitCurrentToken();
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (isWhitespace(data)) {
                }
                else if (data === '>') {
                    tokenizer._emitCurrentToken();
                    tokenizer.setState(data_state);
                }
                else if (data === '"') {
                    tokenizer._currentToken.systemId = '';
                    tokenizer.setState(doctype_system_identifier_double_quoted_state);
                }
                else if (data === "'") {
                    tokenizer._currentToken.systemId = '';
                    tokenizer.setState(doctype_system_identifier_single_quoted_state);
                }
                else {
                    tokenizer._parseError("unexpected-char-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer.setState(bogus_doctype_state);
                }
                return true;
            }
            function after_doctype_system_keyword_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer._emitCurrentToken();
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (isWhitespace(data)) {
                    tokenizer.setState(before_doctype_system_identifier_state);
                }
                else if (data === "'" || data === '"') {
                    tokenizer._parseError("unexpected-char-in-doctype");
                    buffer.unget(data);
                    tokenizer.setState(before_doctype_system_identifier_state);
                }
                else {
                    buffer.unget(data);
                    tokenizer.setState(before_doctype_system_identifier_state);
                }
                return true;
            }
            function before_doctype_system_identifier_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer._emitCurrentToken();
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (isWhitespace(data)) {
                }
                else if (data === '"') {
                    tokenizer._currentToken.systemId = '';
                    tokenizer.setState(doctype_system_identifier_double_quoted_state);
                }
                else if (data === "'") {
                    tokenizer._currentToken.systemId = '';
                    tokenizer.setState(doctype_system_identifier_single_quoted_state);
                }
                else if (data === '>') {
                    tokenizer._parseError("unexpected-end-of-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer._emitCurrentToken();
                    tokenizer.setState(data_state);
                }
                else {
                    tokenizer._parseError("unexpected-char-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer.setState(bogus_doctype_state);
                }
                return true;
            }
            function doctype_system_identifier_double_quoted_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer._emitCurrentToken();
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === '"') {
                    tokenizer.setState(after_doctype_system_identifier_state);
                }
                else if (data === '>') {
                    tokenizer._parseError("unexpected-end-of-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer._emitCurrentToken();
                    tokenizer.setState(data_state);
                }
                else {
                    tokenizer._currentToken.systemId += data;
                }
                return true;
            }
            function doctype_system_identifier_single_quoted_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer._emitCurrentToken();
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (data === "'") {
                    tokenizer.setState(after_doctype_system_identifier_state);
                }
                else if (data === '>') {
                    tokenizer._parseError("unexpected-end-of-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer._emitCurrentToken();
                    tokenizer.setState(data_state);
                }
                else {
                    tokenizer._currentToken.systemId += data;
                }
                return true;
            }
            function after_doctype_system_identifier_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    tokenizer._parseError("eof-in-doctype");
                    tokenizer._currentToken.forceQuirks = true;
                    tokenizer._emitCurrentToken();
                    buffer.unget(data);
                    tokenizer.setState(data_state);
                }
                else if (isWhitespace(data)) {
                }
                else if (data === '>') {
                    tokenizer._emitCurrentToken();
                    tokenizer.setState(data_state);
                }
                else {
                    tokenizer._parseError("unexpected-char-in-doctype");
                    tokenizer.setState(bogus_doctype_state);
                }
                return true;
            }
            function bogus_doctype_state(buffer) {
                var data = buffer.char();
                if (data === InputStream.EOF) {
                    buffer.unget(data);
                    tokenizer._emitCurrentToken();
                    tokenizer.setState(data_state);
                }
                else if (data === '>') {
                    tokenizer._emitCurrentToken();
                    tokenizer.setState(data_state);
                }
                return true;
            }
        };
        this._tokenHandler = tokenHandler;
        this._state = Tokenizer.DATA;
        this._inputStream = new InputStream();
        this._currentToken = null;
        this._temporaryBuffer = '';
        this._additionalAllowedCharacter = '';
    }
    get lineNumber() {
        return this._inputStream.location().line;
    }
    get columnNumber() {
        return this._inputStream.location().column;
    }
    _parseError(code, args) {
        this._tokenHandler.parseError(code, args);
    }
    _emitToken(token) {
        if (token.type === 'StartTag') {
            for (var i = 1; i < token.data.length; i++) {
                if (!token.data[i].nodeName)
                    token.data.splice(i--, 1);
            }
        }
        else if (token.type === 'EndTag') {
            if (token.selfClosing) {
                this._parseError('self-closing-flag-on-end-tag');
            }
            if (token.data.length !== 0) {
                this._parseError('attributes-in-end-tag');
            }
        }
        this._tokenHandler.processToken(token);
        if (token.type === 'StartTag' && token.selfClosing && !this._tokenHandler.isSelfClosingFlagAcknowledged()) {
            this._parseError('non-void-element-with-trailing-solidus', { name: token.name });
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVG9rZW5pemVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL21vZGUvaHRtbC9Ub2tlbml6ZXIudHMiXSwibmFtZXMiOlsiVG9rZW5pemVyIiwiVG9rZW5pemVyLmNvbnN0cnVjdG9yIiwiZGF0YV9zdGF0ZSIsImNoYXJhY3Rlcl9yZWZlcmVuY2VfaW5fZGF0YV9zdGF0ZSIsInJjZGF0YV9zdGF0ZSIsImNoYXJhY3Rlcl9yZWZlcmVuY2VfaW5fcmNkYXRhX3N0YXRlIiwicmF3dGV4dF9zdGF0ZSIsInBsYWludGV4dF9zdGF0ZSIsInNjcmlwdF9kYXRhX3N0YXRlIiwicmNkYXRhX2xlc3NfdGhhbl9zaWduX3N0YXRlIiwicmNkYXRhX2VuZF90YWdfb3Blbl9zdGF0ZSIsInJjZGF0YV9lbmRfdGFnX25hbWVfc3RhdGUiLCJyYXd0ZXh0X2xlc3NfdGhhbl9zaWduX3N0YXRlIiwicmF3dGV4dF9lbmRfdGFnX29wZW5fc3RhdGUiLCJyYXd0ZXh0X2VuZF90YWdfbmFtZV9zdGF0ZSIsInNjcmlwdF9kYXRhX2xlc3NfdGhhbl9zaWduX3N0YXRlIiwic2NyaXB0X2RhdGFfZW5kX3RhZ19vcGVuX3N0YXRlIiwic2NyaXB0X2RhdGFfZW5kX3RhZ19uYW1lX3N0YXRlIiwic2NyaXB0X2RhdGFfZXNjYXBlX3N0YXJ0X3N0YXRlIiwic2NyaXB0X2RhdGFfZXNjYXBlX3N0YXJ0X2Rhc2hfc3RhdGUiLCJzY3JpcHRfZGF0YV9lc2NhcGVkX3N0YXRlIiwic2NyaXB0X2RhdGFfZXNjYXBlZF9kYXNoX3N0YXRlIiwic2NyaXB0X2RhdGFfZXNjYXBlZF9kYXNoX2Rhc2hfc3RhdGUiLCJzY3JpcHRfZGF0YV9lc2NhcGVkX2xlc3NfdGhlbl9zaWduX3N0YXRlIiwic2NyaXB0X2RhdGFfZXNjYXBlZF9lbmRfdGFnX29wZW5fc3RhdGUiLCJzY3JpcHRfZGF0YV9lc2NhcGVkX2VuZF90YWdfbmFtZV9zdGF0ZSIsInNjcmlwdF9kYXRhX2RvdWJsZV9lc2NhcGVfc3RhcnRfc3RhdGUiLCJzY3JpcHRfZGF0YV9kb3VibGVfZXNjYXBlZF9zdGF0ZSIsInNjcmlwdF9kYXRhX2RvdWJsZV9lc2NhcGVkX2Rhc2hfc3RhdGUiLCJzY3JpcHRfZGF0YV9kb3VibGVfZXNjYXBlZF9kYXNoX2Rhc2hfc3RhdGUiLCJzY3JpcHRfZGF0YV9kb3VibGVfZXNjYXBlZF9sZXNzX3RoYW5fc2lnbl9zdGF0ZSIsInNjcmlwdF9kYXRhX2RvdWJsZV9lc2NhcGVfZW5kX3N0YXRlIiwidGFnX29wZW5fc3RhdGUiLCJjbG9zZV90YWdfb3Blbl9zdGF0ZSIsInRhZ19uYW1lX3N0YXRlIiwiYmVmb3JlX2F0dHJpYnV0ZV9uYW1lX3N0YXRlIiwiYXR0cmlidXRlX25hbWVfc3RhdGUiLCJhZnRlcl9hdHRyaWJ1dGVfbmFtZV9zdGF0ZSIsImJlZm9yZV9hdHRyaWJ1dGVfdmFsdWVfc3RhdGUiLCJhdHRyaWJ1dGVfdmFsdWVfZG91YmxlX3F1b3RlZF9zdGF0ZSIsImF0dHJpYnV0ZV92YWx1ZV9zaW5nbGVfcXVvdGVkX3N0YXRlIiwiYXR0cmlidXRlX3ZhbHVlX3VucXVvdGVkX3N0YXRlIiwiY2hhcmFjdGVyX3JlZmVyZW5jZV9pbl9hdHRyaWJ1dGVfdmFsdWVfc3RhdGUiLCJhZnRlcl9hdHRyaWJ1dGVfdmFsdWVfc3RhdGUiLCJzZWxmX2Nsb3NpbmdfdGFnX3N0YXRlIiwiYm9ndXNfY29tbWVudF9zdGF0ZSIsIm1hcmt1cF9kZWNsYXJhdGlvbl9vcGVuX3N0YXRlIiwiY2RhdGFfc2VjdGlvbl9zdGF0ZSIsImNvbW1lbnRfc3RhcnRfc3RhdGUiLCJjb21tZW50X3N0YXJ0X2Rhc2hfc3RhdGUiLCJjb21tZW50X3N0YXRlIiwiY29tbWVudF9lbmRfZGFzaF9zdGF0ZSIsImNvbW1lbnRfZW5kX3N0YXRlIiwiY29tbWVudF9lbmRfYmFuZ19zdGF0ZSIsImRvY3R5cGVfc3RhdGUiLCJiZWZvcmVfZG9jdHlwZV9uYW1lX3N0YXRlIiwiZG9jdHlwZV9uYW1lX3N0YXRlIiwiYWZ0ZXJfZG9jdHlwZV9uYW1lX3N0YXRlIiwiYWZ0ZXJfZG9jdHlwZV9wdWJsaWNfa2V5d29yZF9zdGF0ZSIsImJlZm9yZV9kb2N0eXBlX3B1YmxpY19pZGVudGlmaWVyX3N0YXRlIiwiZG9jdHlwZV9wdWJsaWNfaWRlbnRpZmllcl9kb3VibGVfcXVvdGVkX3N0YXRlIiwiZG9jdHlwZV9wdWJsaWNfaWRlbnRpZmllcl9zaW5nbGVfcXVvdGVkX3N0YXRlIiwiYWZ0ZXJfZG9jdHlwZV9wdWJsaWNfaWRlbnRpZmllcl9zdGF0ZSIsImJldHdlZW5fZG9jdHlwZV9wdWJsaWNfYW5kX3N5c3RlbV9pZGVudGlmaWVyc19zdGF0ZSIsImFmdGVyX2RvY3R5cGVfc3lzdGVtX2tleXdvcmRfc3RhdGUiLCJiZWZvcmVfZG9jdHlwZV9zeXN0ZW1faWRlbnRpZmllcl9zdGF0ZSIsImRvY3R5cGVfc3lzdGVtX2lkZW50aWZpZXJfZG91YmxlX3F1b3RlZF9zdGF0ZSIsImRvY3R5cGVfc3lzdGVtX2lkZW50aWZpZXJfc2luZ2xlX3F1b3RlZF9zdGF0ZSIsImFmdGVyX2RvY3R5cGVfc3lzdGVtX2lkZW50aWZpZXJfc3RhdGUiLCJib2d1c19kb2N0eXBlX3N0YXRlIiwiVG9rZW5pemVyLmxpbmVOdW1iZXIiLCJUb2tlbml6ZXIuY29sdW1uTnVtYmVyIiwiVG9rZW5pemVyLl9wYXJzZUVycm9yIiwiVG9rZW5pemVyLl9lbWl0VG9rZW4iXSwibWFwcGluZ3MiOiJPQUFPLEVBQUMsWUFBWSxFQUFDLE1BQU0sZ0JBQWdCO09BQ3BDLFdBQVcsTUFBTSxlQUFlO09BQ2hDLE9BQU8sTUFBTSxXQUFXO09BQ3hCLFlBQVksTUFBTSxnQkFBZ0I7QUFRekM7SUFZSUEsWUFBWUEsWUFBWUE7UUF1Q3hCQyxzQkFBaUJBLEdBQUdBO1lBQ2hCLElBQUksQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQztZQUM3QixJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUFBO1FBRURBLHNCQUFpQkEsR0FBR0E7WUFDaEIs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Q0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7Z0JBQ3pCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDM0JBLFNBQVNBLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLEtBQUtBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBO29CQUNsREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQ2pCQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3RCQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSw0QkFBNEJBLENBQUNBLENBQUNBO2dCQUNyREEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO29CQUMzQkEsU0FBU0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtvQkFDM0NBLFNBQVNBLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLFlBQVlBLEVBQUVBLElBQUlBLEVBQUVBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBO29CQUM3REEsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7Z0JBQ3BCQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ0pBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO29CQUMxQ0EsU0FBU0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsWUFBWUEsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsR0FBR0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JFQSxDQUFDQTtnQkFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLENBQUNBO1lBRUQseUJBQXlCLE1BQU07Z0JBQzNCQyxJQUFJQSxJQUFJQSxHQUFHQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQTtnQkFDekJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUMzQkEsU0FBU0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsS0FBS0EsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7b0JBQ2xEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDakJBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDM0JBLFNBQVNBLENBQUNBLFdBQVdBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7b0JBQzNDQSxTQUFTQSxDQUFDQSxVQUFVQSxDQUFDQSxFQUFFQSxJQUFJQSxFQUFFQSxZQUFZQSxFQUFFQSxJQUFJQSxFQUFFQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQTtvQkFDN0RBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO2dCQUNwQkEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLENBQUNBO29CQUNKQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFDeENBLFNBQVNBLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLFlBQVlBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEdBQUdBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBO2dCQUNyRUEsQ0FBQ0E7Z0JBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1lBQ2hCQSxDQUFDQTtZQUdELDJCQUEyQixNQUFNO2dCQUM3QkMsSUFBSUEsSUFBSUEsR0FBR0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7Z0JBQ3pCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDM0JBLFNBQVNBLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLEtBQUtBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBO29CQUNsREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQ2pCQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3RCQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxnQ0FBZ0NBLENBQUNBLENBQUNBO2dCQUN6REEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO29CQUMzQkEsU0FBU0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtvQkFDM0NBLFNBQVNBLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLFlBQVlBLEVBQUVBLElBQUlBLEVBQUVBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBO29CQUM3REEsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7Z0JBQ3BCQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ0pBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO29CQUMxQ0EsU0FBU0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsWUFBWUEsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsR0FBR0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JFQSxDQUFDQTtnQkFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJB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QUNBLElBQUlBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO29CQUNwQ0EsU0FBU0EsQ0FBQ0EsYUFBYUEsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsUUFBUUEsRUFBRUEsSUFBSUEsRUFBRUEsUUFBUUEsRUFBRUEsSUFBSUEsRUFBRUEsRUFBRUEsRUFBRUEsV0FBV0EsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0E7b0JBQzNGQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSwyQkFBMkJBLENBQUNBLENBQUNBO2dCQUNwREEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO29CQUNyQ0EsU0FBU0EsQ0FBQ0EsYUFBYUEsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsUUFBUUEsRUFBRUEsSUFBSUEsRUFBRUEsUUFBUUEsRUFBRUEsSUFBSUEsRUFBRUEsRUFBRUEsRUFBRUEsV0FBV0EsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0E7b0JBQzNGQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxzQkFBc0JBLENBQUNBLENBQUNBO2dCQUMvQ0EsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO29CQUNyQ0EsU0FBU0EsQ0FBQ0EsYUFBYUEsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsUUFBUUEsRUFBRUEsSUFBSUEsRUFBRUEsUUFBUUEsRUFBRUEsSUFBSUEsRUFBRUEsRUFBRUEsRUFBRUEsV0FBV0EsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0E7b0JBQzNGQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtvQkFDL0JBLFNBQVNBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7Z0JBQ2xDQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FB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Q0EsQ0FBQ0E7b0JBQy9CQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDdEJBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDdEJBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLDRCQUE0QkEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JEQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3ZCQSxTQUFTQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBLFFBQVFBLElBQUlBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO29CQUM3REEsZ0JBQWdCQSxHQUFHQSxLQUFLQSxDQUFDQTtnQkFDN0JBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFJdEJBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBO2dCQUN0QkEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUM1QkEsU0FBU0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsMEJBQTBCQSxDQUFDQSxDQUFDQTtnQkFDbkRBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDdEJBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLHNCQUFzQkEsQ0FBQ0EsQ0FBQ0E7Z0JBQy9DQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FB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QSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDdEJBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLDRCQUE0QkEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JEQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3RCQSxTQUFTQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBO2dCQUNsQ0EsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUN2QkEsU0FBU0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsUUFBUUEsRUFBRUEsSUFBSUEsRUFBRUEsU0FBU0EsRUFBRUEsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7b0JBQ3JFQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBO2dCQUM3Q0EsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUN0QkEsU0FBU0EsQ0FBQ0EsUUFBUUEsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxDQUFDQTtnQkFDL0NBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDdERBLFNBQVNBLENBQUNBLFdBQVdBLENBQUNBLHdDQUF3Q0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hFQSxTQUFTQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxRQUFRQSxFQUFF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NEJBQzFDLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7NEJBQ3JCLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO3dCQUN2QyxDQUFDLENBQUNBLENBQUNBO3dCQUNIQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDVkEsU0FBU0EsQ0FBQ0EsUUFBUUEsQ0FBQ0Esa0NBQWtDQSxDQUFDQSxDQUFDQTs0QkFDdkRBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO3dCQUNoQkEsQ0FBQ0E7b0JBQ0xBLENBQUNBO29CQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDdkNBLElBQUlBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO3dCQUM1RUEsSUFBSUEsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBU0EsUUFBUUE7NEJBQzFDLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7NEJBQ3JCLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO3dCQUN2QyxDQUFDLENBQUNBLENBQUNBO3dCQUNIQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDVkEsU0FBU0Es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LEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUMzQkEsU0FBU0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQTtvQkFDeENBLFNBQVNBLENBQUNBLGFBQWFBLENBQUNBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBO29CQUMzQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ25CQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtvQkFDL0JBLFNBQVNBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7Z0JBQ2xDQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBRWhDQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3RCQSxTQUFTQSxDQUFDQSxhQUFhQSxDQUFDQSxRQUFRQSxHQUFHQSxFQUFFQSxDQUFDQTtvQkFDdENBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLDZDQUE2Q0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RFQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3RCQSxTQUFTQSxDQUFDQSxhQUFhQSxDQUFDQSxRQUFRQSxHQUFHQSxFQUFFQSxDQUFDQTtvQkFDdENBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLDZDQUE2Q0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RFQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3RCQSxTQUFTQSxD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LEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUN6Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7b0JBQ3hCQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQ0EsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsS0FBS0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsOEJBQThCQSxDQUFDQSxDQUFDQTtZQUNyREEsQ0FBQ0E7WUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzFCQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSx1QkFBdUJBLENBQUNBLENBQUNBO1lBQzlDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUN2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsS0FBS0EsVUFBVUEsSUFBSUEsS0FBS0EsQ0FBQ0EsV0FBV0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsNkJBQTZCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4R0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0Esd0NBQXdDQSxFQUFFQSxFQUFFQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUNyRkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7QUE4OUNMekUsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7RW50aXR5UGFyc2VyfSBmcm9tICcuL0VudGl0eVBhcnNlcic7XG5pbXBvcnQgSW5wdXRTdHJlYW0gZnJvbSAnLi9JbnB1dFN0cmVhbSc7XG5pbXBvcnQgaXNBbHBoYSBmcm9tICcuL2lzQWxwaGEnO1xuaW1wb3J0IGlzV2hpdGVzcGFjZSBmcm9tICcuL2lzV2hpdGVzcGFjZSc7XG5pbXBvcnQgU0FYVHJlZUJ1aWxkZXIgZnJvbSAnLi9TQVhUcmVlQnVpbGRlcic7XG5cbi8qKlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSB0b2tlbkhhbmRsZXJcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBUb2tlbml6ZXIge1xuICAgIF90b2tlbkhhbmRsZXI7XG4gICAgX3N0YXRlOiAoYnVmZmVyKSA9PiBib29sZWFuO1xuICAgIF9pbnB1dFN0cmVhbTogSW5wdXRTdHJlYW07XG4gICAgX2N1cnJlbnRUb2tlbjtcbiAgICBfdGVtcG9yYXJ5QnVmZmVyOiBzdHJpbmc7XG4gICAgX2FkZGl0aW9uYWxBbGxvd2VkQ2hhcmFjdGVyOiBzdHJpbmc7XG4gICAgc3RhdGljIERBVEE6IChidWZmZXIpID0+IGJvb2xlYW47XG4gICAgc3RhdGljIFJDREFUQTogKGJ1ZmZlcikgPT4gYm9vbGVhbjtcbiAgICBzdGF0aWMgUkFXVEVYVDogKGJ1ZmZlcikgPT4gYm9vbGVhbjtcbiAgICBzdGF0aWMgU0NSSVBUX0RBVEE6IChidWZmZXIpID0+IGJvb2xlYW47XG4gICAgc3RhdGljIFBMQUlOVEVYVDogKGJ1ZmZlcikgPT4gYm9vbGVhbjtcbiAgICBjb25zdHJ1Y3Rvcih0b2tlbkhhbmRsZXIpIHtcbiAgICAgICAgdGhpcy5fdG9rZW5IYW5kbGVyID0gdG9rZW5IYW5kbGVyO1xuICAgICAgICB0aGlzLl9zdGF0ZSA9IFRva2VuaXplci5EQVRBO1xuICAgICAgICB0aGlzLl9pbnB1dFN0cmVhbSA9IG5ldyBJbnB1dFN0cmVhbSgpO1xuICAgICAgICB0aGlzLl9jdXJyZW50VG9rZW4gPSBudWxsO1xuICAgICAgICB0aGlzLl90ZW1wb3JhcnlCdWZmZXIgPSAnJztcbiAgICAgICAgdGhpcy5fYWRkaXRpb25hbEFsbG93ZWRDaGFyYWN0ZXIgPSAnJztcbiAgICB9XG4gICAgZ2V0IGxpbmVOdW1iZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9pbnB1dFN0cmVhbS5sb2NhdGlvbigpLmxpbmU7XG4gICAgfVxuICAgIGdldCBjb2x1bW5OdW1iZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9pbnB1dFN0cmVhbS5sb2NhdGlvbigpLmNvbHVtbjtcbiAgICB9XG5cbiAgICBfcGFyc2VFcnJvcihjb2RlLCBhcmdzPykge1xuICAgICAgICB0aGlzLl90b2tlbkhhbmRsZXIucGFyc2VFcnJvcihjb2RlLCBhcmdzKTtcbiAgICB9XG5cbiAgICBfZW1pdFRva2VuKHRva2VuKSB7XG4gICAgICAgIGlmICh0b2tlbi50eXBlID09PSAnU3RhcnRUYWcnKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHRva2VuLmRhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoIXRva2VuLmRhdGFbaV0ubm9kZU5hbWUpXG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmRhdGEuc3BsaWNlKGktLSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodG9rZW4udHlwZSA9PT0gJ0VuZFRhZycpIHtcbiAgICAgICAgICAgIGlmICh0b2tlbi5zZWxmQ2xvc2luZykge1xuICAgICAgICAgICAgICAgIHRoaXMuX3BhcnNlRXJyb3IoJ3NlbGYtY2xvc2luZy1mbGFnLW9uLWVuZC10YWcnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0b2tlbi5kYXRhLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3BhcnNlRXJyb3IoJ2F0dHJpYnV0ZXMtaW4tZW5kLXRhZycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3Rva2VuSGFuZGxlci5wcm9jZXNzVG9rZW4odG9rZW4pO1xuICAgICAgICBpZiAodG9rZW4udHlwZSA9PT0gJ1N0YXJ0VGFnJyAmJiB0b2tlbi5zZWxmQ2xvc2luZyAmJiAhdGhpcy5fdG9rZW5IYW5kbGVyLmlzU2VsZkNsb3NpbmdGbGFnQWNrbm93bGVkZ2VkKCkpIHtcbiAgICAgICAgICAgIHRoaXMuX3BhcnNlRXJyb3IoJ25vbi12b2lkLWVsZW1lbnQtd2l0aC10cmFpbGluZy1zb2xpZHVzJywgeyBuYW1lOiB0b2tlbi5uYW1lIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX2VtaXRDdXJyZW50VG9rZW4gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5fc3RhdGUgPSBUb2tlbml6ZXIuREFUQTtcbiAgICAgICAgdGhpcy5fZW1pdFRva2VuKHRoaXMuX2N1cnJlbnRUb2tlbik7XG4gICAgfVxuXG4gICAgX2N1cnJlbnRBdHRyaWJ1dGUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2N1cnJlbnRUb2tlbi5kYXRhW3RoaXMuX2N1cnJlbnRUb2tlbi5kYXRhLmxlbmd0aCAtIDFdO1xuICAgIH1cblxuICAgIHNldFN0YXRlID0gZnVuY3Rpb24oc3RhdGUpIHtcbiAgICAgICAgdGhpcy5fc3RhdGUgPSBzdGF0ZTtcbiAgICB9XG5cbiAgICB0b2tlbml6ZSA9IGZ1bmN0aW9uKHNvdXJjZSkge1xuICAgICAgICAvLyBGSVhNRSBwcm9wZXIgdG9rZW5pemVyIHN0YXRlc1xuICAgICAgICBUb2tlbml6ZXIuREFUQSA9IGRhdGFfc3RhdGU7XG4gICAgICAgIFRva2VuaXplci5SQ0RBVEEgPSByY2RhdGFfc3RhdGU7XG4gICAgICAgIFRva2VuaXplci5SQVdURVhUID0gcmF3dGV4dF9zdGF0ZTtcbiAgICAgICAgVG9rZW5pemVyLlNDUklQVF9EQVRBID0gc2NyaXB0X2RhdGFfc3RhdGU7XG4gICAgICAgIFRva2VuaXplci5QTEFJTlRFWFQgPSBwbGFpbnRleHRfc3RhdGU7XG5cblxuICAgICAgICB0aGlzLl9zdGF0ZSA9IFRva2VuaXplci5EQVRBO1xuXG4gICAgICAgIHRoaXMuX2lucHV0U3RyZWFtLmFwcGVuZChzb3VyY2UpO1xuXG4gICAgICAgIHRoaXMuX3Rva2VuSGFuZGxlci5zdGFydFRva2VuaXphdGlvbih0aGlzKTtcblxuICAgICAgICB0aGlzLl9pbnB1dFN0cmVhbS5lb2YgPSB0cnVlO1xuXG4gICAgICAgIHZhciB0b2tlbml6ZXIgPSB0aGlzO1xuXG4gICAgICAgIHdoaWxlICh0aGlzLl9zdGF0ZS5jYWxsKHRoaXMsIHRoaXMuX2lucHV0U3RyZWFtKSk7XG5cblxuICAgICAgICBmdW5jdGlvbiBkYXRhX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0VPRicsIGRhdGE6IG51bGwgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnJicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoY2hhcmFjdGVyX3JlZmVyZW5jZV9pbl9kYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHRhZ19vcGVuX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJ1xcdTAwMDAnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6IGRhdGEgfSk7XG4gICAgICAgICAgICAgICAgYnVmZmVyLmNvbW1pdCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgY2hhcnMgPSBidWZmZXIubWF0Y2hVbnRpbChcIiZ8PHxcXHUwMDAwXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiBkYXRhICsgY2hhcnMgfSk7XG4gICAgICAgICAgICAgICAgYnVmZmVyLmNvbW1pdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjaGFyYWN0ZXJfcmVmZXJlbmNlX2luX2RhdGFfc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgY2hhcmFjdGVyID0gRW50aXR5UGFyc2VyLmNvbnN1bWVFbnRpdHkoYnVmZmVyLCB0b2tlbml6ZXIpO1xuICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6IGNoYXJhY3RlciB8fCAnJicgfSk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHJjZGF0YV9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdFT0YnLCBkYXRhOiBudWxsIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJyYnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGNoYXJhY3Rlcl9yZWZlcmVuY2VfaW5fcmNkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHJjZGF0YV9sZXNzX3RoYW5fc2lnbl9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09IFwiXFx1MDAwMFwiKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiaW52YWxpZC1jb2RlcG9pbnRcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6ICdcXHVGRkZEJyB9KTtcbiAgICAgICAgICAgICAgICBidWZmZXIuY29tbWl0KCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBjaGFycyA9IGJ1ZmZlci5tYXRjaFVudGlsKFwiJnw8fFxcdTAwMDBcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6IGRhdGEgKyBjaGFycyB9KTtcbiAgICAgICAgICAgICAgICBidWZmZXIuY29tbWl0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNoYXJhY3Rlcl9yZWZlcmVuY2VfaW5fcmNkYXRhX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGNoYXJhY3RlciA9IEVudGl0eVBhcnNlci5jb25zdW1lRW50aXR5KGJ1ZmZlciwgdG9rZW5pemVyKTtcbiAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShyY2RhdGFfc3RhdGUpO1xuICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6IGNoYXJhY3RlciB8fCAnJicgfSk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHJhd3RleHRfc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoZGF0YSA9PT0gSW5wdXRTdHJlYW0uRU9GKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnRU9GJywgZGF0YTogbnVsbCB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShyYXd0ZXh0X2xlc3NfdGhhbl9zaWduX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gXCJcXHUwMDAwXCIpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJpbnZhbGlkLWNvZGVwb2ludFwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJ1xcdUZGRkQnIH0pO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci5jb21taXQoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGNoYXJzID0gYnVmZmVyLm1hdGNoVW50aWwoXCI8fFxcdTAwMDBcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6IGRhdGEgKyBjaGFycyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcGxhaW50ZXh0X3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0VPRicsIGRhdGE6IG51bGwgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSBcIlxcdTAwMDBcIikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImludmFsaWQtY29kZXBvaW50XCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiAnXFx1RkZGRCcgfSk7XG4gICAgICAgICAgICAgICAgYnVmZmVyLmNvbW1pdCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgY2hhcnMgPSBidWZmZXIubWF0Y2hVbnRpbChcIlxcdTAwMDBcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6IGRhdGEgKyBjaGFycyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cblxuICAgICAgICBmdW5jdGlvbiBzY3JpcHRfZGF0YV9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdFT0YnLCBkYXRhOiBudWxsIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHNjcmlwdF9kYXRhX2xlc3NfdGhhbl9zaWduX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJ1xcdTAwMDAnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiaW52YWxpZC1jb2RlcG9pbnRcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6ICdcXHVGRkZEJyB9KTtcbiAgICAgICAgICAgICAgICBidWZmZXIuY29tbWl0KCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBjaGFycyA9IGJ1ZmZlci5tYXRjaFVudGlsKFwiPHxcXHUwMDAwXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiBkYXRhICsgY2hhcnMgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHJjZGF0YV9sZXNzX3RoYW5fc2lnbl9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBcIi9cIikge1xuICAgICAgICAgICAgICAgIHRoaXMuX3RlbXBvcmFyeUJ1ZmZlciA9ICcnO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShyY2RhdGFfZW5kX3RhZ19vcGVuX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6ICc8JyB9KTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHJjZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHJjZGF0YV9lbmRfdGFnX29wZW5fc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoaXNBbHBoYShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3RlbXBvcmFyeUJ1ZmZlciArPSBkYXRhO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShyY2RhdGFfZW5kX3RhZ19uYW1lX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6ICc8LycgfSk7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShyY2RhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiByY2RhdGFfZW5kX3RhZ19uYW1lX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGFwcHJvcHJpYXRlID0gdG9rZW5pemVyLl9jdXJyZW50VG9rZW4gJiYgKHRva2VuaXplci5fY3VycmVudFRva2VuLm5hbWUgPT09IHRoaXMuX3RlbXBvcmFyeUJ1ZmZlci50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChpc1doaXRlc3BhY2UoZGF0YSkgJiYgYXBwcm9wcmlhdGUpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbiA9IHsgdHlwZTogJ0VuZFRhZycsIG5hbWU6IHRoaXMuX3RlbXBvcmFyeUJ1ZmZlciwgZGF0YTogW10sIHNlbGZDbG9zaW5nOiBmYWxzZSB9O1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShiZWZvcmVfYXR0cmlidXRlX25hbWVfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnLycgJiYgYXBwcm9wcmlhdGUpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbiA9IHsgdHlwZTogJ0VuZFRhZycsIG5hbWU6IHRoaXMuX3RlbXBvcmFyeUJ1ZmZlciwgZGF0YTogW10sIHNlbGZDbG9zaW5nOiBmYWxzZSB9O1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzZWxmX2Nsb3NpbmdfdGFnX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJz4nICYmIGFwcHJvcHJpYXRlKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4gPSB7IHR5cGU6ICdFbmRUYWcnLCBuYW1lOiB0aGlzLl90ZW1wb3JhcnlCdWZmZXIsIGRhdGE6IFtdLCBzZWxmQ2xvc2luZzogZmFsc2UgfTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzQWxwaGEoZGF0YSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl90ZW1wb3JhcnlCdWZmZXIgKz0gZGF0YTtcbiAgICAgICAgICAgICAgICBidWZmZXIuY29tbWl0KCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiAnPC8nICsgdGhpcy5fdGVtcG9yYXJ5QnVmZmVyIH0pO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUocmNkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcmF3dGV4dF9sZXNzX3RoYW5fc2lnbl9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBcIi9cIikge1xuICAgICAgICAgICAgICAgIHRoaXMuX3RlbXBvcmFyeUJ1ZmZlciA9ICcnO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShyYXd0ZXh0X2VuZF90YWdfb3Blbl9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiAnPCcgfSk7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShyYXd0ZXh0X3N0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcmF3dGV4dF9lbmRfdGFnX29wZW5fc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoaXNBbHBoYShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3RlbXBvcmFyeUJ1ZmZlciArPSBkYXRhO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShyYXd0ZXh0X2VuZF90YWdfbmFtZV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiAnPC8nIH0pO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUocmF3dGV4dF9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHJhd3RleHRfZW5kX3RhZ19uYW1lX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGFwcHJvcHJpYXRlID0gdG9rZW5pemVyLl9jdXJyZW50VG9rZW4gJiYgKHRva2VuaXplci5fY3VycmVudFRva2VuLm5hbWUgPT09IHRoaXMuX3RlbXBvcmFyeUJ1ZmZlci50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChpc1doaXRlc3BhY2UoZGF0YSkgJiYgYXBwcm9wcmlhdGUpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbiA9IHsgdHlwZTogJ0VuZFRhZycsIG5hbWU6IHRoaXMuX3RlbXBvcmFyeUJ1ZmZlciwgZGF0YTogW10sIHNlbGZDbG9zaW5nOiBmYWxzZSB9O1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShiZWZvcmVfYXR0cmlidXRlX25hbWVfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnLycgJiYgYXBwcm9wcmlhdGUpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbiA9IHsgdHlwZTogJ0VuZFRhZycsIG5hbWU6IHRoaXMuX3RlbXBvcmFyeUJ1ZmZlciwgZGF0YTogW10sIHNlbGZDbG9zaW5nOiBmYWxzZSB9O1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzZWxmX2Nsb3NpbmdfdGFnX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJz4nICYmIGFwcHJvcHJpYXRlKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4gPSB7IHR5cGU6ICdFbmRUYWcnLCBuYW1lOiB0aGlzLl90ZW1wb3JhcnlCdWZmZXIsIGRhdGE6IFtdLCBzZWxmQ2xvc2luZzogZmFsc2UgfTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzQWxwaGEoZGF0YSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl90ZW1wb3JhcnlCdWZmZXIgKz0gZGF0YTtcbiAgICAgICAgICAgICAgICBidWZmZXIuY29tbWl0KCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiAnPC8nICsgdGhpcy5fdGVtcG9yYXJ5QnVmZmVyIH0pO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUocmF3dGV4dF9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNjcmlwdF9kYXRhX2xlc3NfdGhhbl9zaWduX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IFwiL1wiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fdGVtcG9yYXJ5QnVmZmVyID0gJyc7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHNjcmlwdF9kYXRhX2VuZF90YWdfb3Blbl9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICchJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiAnPCEnIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9lc2NhcGVfc3RhcnRfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJzwnIH0pO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2NyaXB0X2RhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBzY3JpcHRfZGF0YV9lbmRfdGFnX29wZW5fc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoaXNBbHBoYShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3RlbXBvcmFyeUJ1ZmZlciArPSBkYXRhO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9lbmRfdGFnX25hbWVfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJzwvJyB9KTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHNjcmlwdF9kYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gc2NyaXB0X2RhdGFfZW5kX3RhZ19uYW1lX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGFwcHJvcHJpYXRlID0gdG9rZW5pemVyLl9jdXJyZW50VG9rZW4gJiYgKHRva2VuaXplci5fY3VycmVudFRva2VuLm5hbWUgPT09IHRoaXMuX3RlbXBvcmFyeUJ1ZmZlci50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChpc1doaXRlc3BhY2UoZGF0YSkgJiYgYXBwcm9wcmlhdGUpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbiA9IHsgdHlwZTogJ0VuZFRhZycsIG5hbWU6ICdzY3JpcHQnLCBkYXRhOiBbXSwgc2VsZkNsb3Npbmc6IGZhbHNlIH07XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGJlZm9yZV9hdHRyaWJ1dGVfbmFtZV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICcvJyAmJiBhcHByb3ByaWF0ZSkge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuID0geyB0eXBlOiAnRW5kVGFnJywgbmFtZTogJ3NjcmlwdCcsIGRhdGE6IFtdLCBzZWxmQ2xvc2luZzogZmFsc2UgfTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2VsZl9jbG9zaW5nX3RhZ19zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc+JyAmJiBhcHByb3ByaWF0ZSkge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuID0geyB0eXBlOiAnRW5kVGFnJywgbmFtZTogJ3NjcmlwdCcsIGRhdGE6IFtdLCBzZWxmQ2xvc2luZzogZmFsc2UgfTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNBbHBoYShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3RlbXBvcmFyeUJ1ZmZlciArPSBkYXRhO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci5jb21taXQoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6ICc8LycgKyB0aGlzLl90ZW1wb3JhcnlCdWZmZXIgfSk7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNjcmlwdF9kYXRhX2VzY2FwZV9zdGFydF9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSAnLScpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJy0nIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9lc2NhcGVfc3RhcnRfZGFzaF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2NyaXB0X2RhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBzY3JpcHRfZGF0YV9lc2NhcGVfc3RhcnRfZGFzaF9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSAnLScpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJy0nIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9lc2NhcGVkX2Rhc2hfZGFzaF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2NyaXB0X2RhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBzY3JpcHRfZGF0YV9lc2NhcGVkX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICctJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiAnLScgfSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHNjcmlwdF9kYXRhX2VzY2FwZWRfZGFzaF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9lc2NhcGVkX2xlc3NfdGhlbl9zaWduX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJ1xcdTAwMDAnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiaW52YWxpZC1jb2RlcG9pbnRcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6ICdcXHVGRkZEJyB9KTtcbiAgICAgICAgICAgICAgICBidWZmZXIuY29tbWl0KCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBjaGFycyA9IGJ1ZmZlci5tYXRjaFVudGlsKCc8fC18XFx1MDAwMCcpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiBkYXRhICsgY2hhcnMgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNjcmlwdF9kYXRhX2VzY2FwZWRfZGFzaF9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnLScpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJy0nIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9lc2NhcGVkX2Rhc2hfZGFzaF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9lc2NhcGVkX2xlc3NfdGhlbl9zaWduX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJ1xcdTAwMDAnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiaW52YWxpZC1jb2RlcG9pbnRcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6ICdcXHVGRkZEJyB9KTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2NyaXB0X2RhdGFfZXNjYXBlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiBkYXRhIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9lc2NhcGVkX3N0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gc2NyaXB0X2RhdGFfZXNjYXBlZF9kYXNoX2Rhc2hfc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoZGF0YSA9PT0gSW5wdXRTdHJlYW0uRU9GKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKCdlb2YtaW4tc2NyaXB0Jyk7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHNjcmlwdF9kYXRhX2VzY2FwZWRfbGVzc190aGVuX3NpZ25fc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJz4nIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICdcXHUwMDAwJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImludmFsaWQtY29kZXBvaW50XCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiAnXFx1RkZGRCcgfSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHNjcmlwdF9kYXRhX2VzY2FwZWRfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogZGF0YSB9KTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2NyaXB0X2RhdGFfZXNjYXBlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNjcmlwdF9kYXRhX2VzY2FwZWRfbGVzc190aGVuX3NpZ25fc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoZGF0YSA9PT0gJy8nKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fdGVtcG9yYXJ5QnVmZmVyID0gJyc7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHNjcmlwdF9kYXRhX2VzY2FwZWRfZW5kX3RhZ19vcGVuX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNBbHBoYShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiAnPCcgKyBkYXRhIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMuX3RlbXBvcmFyeUJ1ZmZlciA9IGRhdGE7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHNjcmlwdF9kYXRhX2RvdWJsZV9lc2NhcGVfc3RhcnRfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJzwnIH0pO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2NyaXB0X2RhdGFfZXNjYXBlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNjcmlwdF9kYXRhX2VzY2FwZWRfZW5kX3RhZ19vcGVuX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGlzQWxwaGEoZGF0YSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl90ZW1wb3JhcnlCdWZmZXIgPSBkYXRhO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9lc2NhcGVkX2VuZF90YWdfbmFtZV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiAnPC8nIH0pO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2NyaXB0X2RhdGFfZXNjYXBlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNjcmlwdF9kYXRhX2VzY2FwZWRfZW5kX3RhZ19uYW1lX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGFwcHJvcHJpYXRlID0gdG9rZW5pemVyLl9jdXJyZW50VG9rZW4gJiYgKHRva2VuaXplci5fY3VycmVudFRva2VuLm5hbWUgPT09IHRoaXMuX3RlbXBvcmFyeUJ1ZmZlci50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChpc1doaXRlc3BhY2UoZGF0YSkgJiYgYXBwcm9wcmlhdGUpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbiA9IHsgdHlwZTogJ0VuZFRhZycsIG5hbWU6ICdzY3JpcHQnLCBkYXRhOiBbXSwgc2VsZkNsb3Npbmc6IGZhbHNlIH07XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGJlZm9yZV9hdHRyaWJ1dGVfbmFtZV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICcvJyAmJiBhcHByb3ByaWF0ZSkge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuID0geyB0eXBlOiAnRW5kVGFnJywgbmFtZTogJ3NjcmlwdCcsIGRhdGE6IFtdLCBzZWxmQ2xvc2luZzogZmFsc2UgfTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2VsZl9jbG9zaW5nX3RhZ19zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc+JyAmJiBhcHByb3ByaWF0ZSkge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuID0geyB0eXBlOiAnRW5kVGFnJywgbmFtZTogJ3NjcmlwdCcsIGRhdGE6IFtdLCBzZWxmQ2xvc2luZzogZmFsc2UgfTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0Q3VycmVudFRva2VuKCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzQWxwaGEoZGF0YSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl90ZW1wb3JhcnlCdWZmZXIgKz0gZGF0YTtcbiAgICAgICAgICAgICAgICBidWZmZXIuY29tbWl0KCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiAnPC8nICsgdGhpcy5fdGVtcG9yYXJ5QnVmZmVyIH0pO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2NyaXB0X2RhdGFfZXNjYXBlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNjcmlwdF9kYXRhX2RvdWJsZV9lc2NhcGVfc3RhcnRfc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoaXNXaGl0ZXNwYWNlKGRhdGEpIHx8IGRhdGEgPT09ICcvJyB8fCBkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogZGF0YSB9KTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fdGVtcG9yYXJ5QnVmZmVyLnRvTG93ZXJDYXNlKCkgPT09ICdzY3JpcHQnKVxuICAgICAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2NyaXB0X2RhdGFfZG91YmxlX2VzY2FwZWRfc3RhdGUpO1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHNjcmlwdF9kYXRhX2VzY2FwZWRfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc0FscGhhKGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6IGRhdGEgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fdGVtcG9yYXJ5QnVmZmVyICs9IGRhdGE7XG4gICAgICAgICAgICAgICAgYnVmZmVyLmNvbW1pdCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHNjcmlwdF9kYXRhX2VzY2FwZWRfc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBzY3JpcHRfZGF0YV9kb3VibGVfZXNjYXBlZF9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoJ2VvZi1pbi1zY3JpcHQnKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnLScpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJy0nIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9kb3VibGVfZXNjYXBlZF9kYXNoX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6ICc8JyB9KTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2NyaXB0X2RhdGFfZG91YmxlX2VzY2FwZWRfbGVzc190aGFuX3NpZ25fc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnXFx1MDAwMCcpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoJ2ludmFsaWQtY29kZXBvaW50Jyk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6ICdcXHVGRkZEJyB9KTtcbiAgICAgICAgICAgICAgICBidWZmZXIuY29tbWl0KCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiBkYXRhIH0pO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci5jb21taXQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gc2NyaXB0X2RhdGFfZG91YmxlX2VzY2FwZWRfZGFzaF9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoJ2VvZi1pbi1zY3JpcHQnKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnLScpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJy0nIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9kb3VibGVfZXNjYXBlZF9kYXNoX2Rhc2hfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPCcpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJzwnIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9kb3VibGVfZXNjYXBlZF9sZXNzX3RoYW5fc2lnbl9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICdcXHUwMDAwJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcignaW52YWxpZC1jb2RlcG9pbnQnKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJ1xcdUZGRkQnIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9kb3VibGVfZXNjYXBlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiBkYXRhIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9kb3VibGVfZXNjYXBlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNjcmlwdF9kYXRhX2RvdWJsZV9lc2NhcGVkX2Rhc2hfZGFzaF9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoJ2VvZi1pbi1zY3JpcHQnKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnLScpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJy0nIH0pO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci5jb21taXQoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6ICc8JyB9KTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2NyaXB0X2RhdGFfZG91YmxlX2VzY2FwZWRfbGVzc190aGFuX3NpZ25fc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJz4nIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICdcXHUwMDAwJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcignaW52YWxpZC1jb2RlcG9pbnQnKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJ1xcdUZGRkQnIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9kb3VibGVfZXNjYXBlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiBkYXRhIH0pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9kb3VibGVfZXNjYXBlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNjcmlwdF9kYXRhX2RvdWJsZV9lc2NhcGVkX2xlc3NfdGhhbl9zaWduX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09ICcvJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiAnLycgfSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fdGVtcG9yYXJ5QnVmZmVyID0gJyc7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHNjcmlwdF9kYXRhX2RvdWJsZV9lc2NhcGVfZW5kX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9kb3VibGVfZXNjYXBlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNjcmlwdF9kYXRhX2RvdWJsZV9lc2NhcGVfZW5kX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGlzV2hpdGVzcGFjZShkYXRhKSB8fCBkYXRhID09PSAnLycgfHwgZGF0YSA9PT0gJz4nKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6IGRhdGEgfSk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX3RlbXBvcmFyeUJ1ZmZlci50b0xvd2VyQ2FzZSgpID09PSAnc2NyaXB0JylcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHNjcmlwdF9kYXRhX2VzY2FwZWRfc3RhdGUpO1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHNjcmlwdF9kYXRhX2RvdWJsZV9lc2NhcGVkX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNBbHBoYShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiBkYXRhIH0pO1xuICAgICAgICAgICAgICAgIHRoaXMuX3RlbXBvcmFyeUJ1ZmZlciArPSBkYXRhO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci5jb21taXQoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzY3JpcHRfZGF0YV9kb3VibGVfZXNjYXBlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHRhZ19vcGVuX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImJhcmUtbGVzcy10aGFuLXNpZ24tYXQtZW9mXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiAnPCcgfSk7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNBbHBoYShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuID0geyB0eXBlOiAnU3RhcnRUYWcnLCBuYW1lOiBkYXRhLnRvTG93ZXJDYXNlKCksIGRhdGE6IFtdIH07XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHRhZ19uYW1lX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJyEnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKG1hcmt1cF9kZWNsYXJhdGlvbl9vcGVuX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJy8nKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGNsb3NlX3RhZ19vcGVuX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJz4nKSB7XG4gICAgICAgICAgICAgICAgLy8gWFhYIEluIHRoZW9yeSBpdCBjb3VsZCBiZSBzb21ldGhpbmcgYmVzaWRlcyBhIHRhZyBuYW1lLiBCdXRcbiAgICAgICAgICAgICAgICAvLyBkbyB3ZSByZWFsbHkgY2FyZT9cbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJleHBlY3RlZC10YWctbmFtZS1idXQtZ290LXJpZ2h0LWJyYWNrZXRcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4oeyB0eXBlOiAnQ2hhcmFjdGVycycsIGRhdGE6IFwiPD5cIiB9KTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc/Jykge1xuICAgICAgICAgICAgICAgIC8vIFhYWCBJbiB0aGVvcnkgaXQgY291bGQgYmUgc29tZXRoaW5nIGJlc2lkZXMgYSB0YWcgbmFtZS4gQnV0XG4gICAgICAgICAgICAgICAgLy8gZG8gd2UgcmVhbGx5IGNhcmU/XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZXhwZWN0ZWQtdGFnLW5hbWUtYnV0LWdvdC1xdWVzdGlvbi1tYXJrXCIpO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYm9ndXNfY29tbWVudF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIFhYWFxuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImV4cGVjdGVkLXRhZy1uYW1lXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiBcIjxcIiB9KTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjbG9zZV90YWdfb3Blbl9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJleHBlY3RlZC1jbG9zaW5nLXRhZy1idXQtZ290LWVvZlwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDaGFyYWN0ZXJzJywgZGF0YTogJzwvJyB9KTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc0FscGhhKGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4gPSB7IHR5cGU6ICdFbmRUYWcnLCBuYW1lOiBkYXRhLnRvTG93ZXJDYXNlKCksIGRhdGE6IFtdIH07XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKHRhZ19uYW1lX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJz4nKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZXhwZWN0ZWQtY2xvc2luZy10YWctYnV0LWdvdC1yaWdodC1icmFja2V0XCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZXhwZWN0ZWQtY2xvc2luZy10YWctYnV0LWdvdC1jaGFyXCIsIHsgZGF0YTogZGF0YSB9KTsgLy8gcGFyYW0gMSBpcyBkYXRhdmFyczpcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGJvZ3VzX2NvbW1lbnRfc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiB0YWdfbmFtZV9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoJ2VvZi1pbi10YWctbmFtZScpO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzV2hpdGVzcGFjZShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShiZWZvcmVfYXR0cmlidXRlX25hbWVfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc0FscGhhKGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4ubmFtZSArPSBkYXRhLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc+Jykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdEN1cnJlbnRUb2tlbigpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnLycpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2VsZl9jbG9zaW5nX3RhZ19zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICdcXHUwMDAwJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImludmFsaWQtY29kZXBvaW50XCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLm5hbWUgKz0gXCJcXHVGRkZEXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLm5hbWUgKz0gZGF0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJ1ZmZlci5jb21taXQoKTtcblxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBiZWZvcmVfYXR0cmlidXRlX25hbWVfc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoZGF0YSA9PT0gSW5wdXRTdHJlYW0uRU9GKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZXhwZWN0ZWQtYXR0cmlidXRlLW5hbWUtYnV0LWdvdC1lb2ZcIik7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNXaGl0ZXNwYWNlKGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzQWxwaGEoZGF0YSkpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5kYXRhLnB1c2goeyBub2RlTmFtZTogZGF0YS50b0xvd2VyQ2FzZSgpLCBub2RlVmFsdWU6IFwiXCIgfSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGF0dHJpYnV0ZV9uYW1lX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJz4nKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0Q3VycmVudFRva2VuKCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICcvJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzZWxmX2Nsb3NpbmdfdGFnX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gXCInXCIgfHwgZGF0YSA9PT0gJ1wiJyB8fCBkYXRhID09PSAnPScgfHwgZGF0YSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiaW52YWxpZC1jaGFyYWN0ZXItaW4tYXR0cmlidXRlLW5hbWVcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZGF0YS5wdXNoKHsgbm9kZU5hbWU6IGRhdGEsIG5vZGVWYWx1ZTogXCJcIiB9KTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYXR0cmlidXRlX25hbWVfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnXFx1MDAwMCcpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJpbnZhbGlkLWNvZGVwb2ludFwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5kYXRhLnB1c2goeyBub2RlTmFtZTogXCJcXHVGRkZEXCIsIG5vZGVWYWx1ZTogXCJcIiB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZGF0YS5wdXNoKHsgbm9kZU5hbWU6IGRhdGEsIG5vZGVWYWx1ZTogXCJcIiB9KTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYXR0cmlidXRlX25hbWVfc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBhdHRyaWJ1dGVfbmFtZV9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIHZhciBsZWF2aW5nVGhpc1N0YXRlID0gdHJ1ZTtcbiAgICAgICAgICAgIHZhciBzaG91bGRFbWl0ID0gZmFsc2U7XG4gICAgICAgICAgICBpZiAoZGF0YSA9PT0gSW5wdXRTdHJlYW0uRU9GKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZW9mLWluLWF0dHJpYnV0ZS1uYW1lXCIpO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICAgICAgc2hvdWxkRW1pdCA9IHRydWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc9Jykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShiZWZvcmVfYXR0cmlidXRlX3ZhbHVlX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNBbHBoYShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudEF0dHJpYnV0ZSgpLm5vZGVOYW1lICs9IGRhdGEudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICBsZWF2aW5nVGhpc1N0YXRlID0gZmFsc2U7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc+Jykge1xuICAgICAgICAgICAgICAgIC8vIFhYWCBJZiB3ZSBlbWl0IGhlcmUgdGhlIGF0dHJpYnV0ZXMgYXJlIGNvbnZlcnRlZCB0byBhIGRpY3RcbiAgICAgICAgICAgICAgICAvLyB3aXRob3V0IGJlaW5nIGNoZWNrZWQgYW5kIHdoZW4gdGhlIGNvZGUgYmVsb3cgcnVucyB3ZSBlcnJvclxuICAgICAgICAgICAgICAgIC8vIGJlY2F1c2UgZGF0YSBpcyBhIGRpY3Qgbm90IGEgbGlzdFxuICAgICAgICAgICAgICAgIHNob3VsZEVtaXQgPSB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc1doaXRlc3BhY2UoZGF0YSkpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYWZ0ZXJfYXR0cmlidXRlX25hbWVfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnLycpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2VsZl9jbG9zaW5nX3RhZ19zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09IFwiJ1wiIHx8IGRhdGEgPT09ICdcIicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJpbnZhbGlkLWNoYXJhY3Rlci1pbi1hdHRyaWJ1dGUtbmFtZVwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRBdHRyaWJ1dGUoKS5ub2RlTmFtZSArPSBkYXRhO1xuICAgICAgICAgICAgICAgIGxlYXZpbmdUaGlzU3RhdGUgPSBmYWxzZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJ1xcdTAwMDAnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiaW52YWxpZC1jb2RlcG9pbnRcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50QXR0cmlidXRlKCkubm9kZU5hbWUgKz0gXCJcXHVGRkZEXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudEF0dHJpYnV0ZSgpLm5vZGVOYW1lICs9IGRhdGE7XG4gICAgICAgICAgICAgICAgbGVhdmluZ1RoaXNTdGF0ZSA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobGVhdmluZ1RoaXNTdGF0ZSkge1xuICAgICAgICAgICAgICAgIC8vIEF0dHJpYnV0ZXMgYXJlIG5vdCBkcm9wcGVkIGF0IHRoaXMgc3RhZ2UuIFRoYXQgaGFwcGVucyB3aGVuIHRoZVxuICAgICAgICAgICAgICAgIC8vIHN0YXJ0IHRhZyB0b2tlbiBpcyBlbWl0dGVkIHNvIHZhbHVlcyBjYW4gc3RpbGwgYmUgc2FmZWx5IGFwcGVuZGVkXG4gICAgICAgICAgICAgICAgLy8gdG8gYXR0cmlidXRlcywgYnV0IHdlIGRvIHdhbnQgdG8gcmVwb3J0IHRoZSBwYXJzZSBlcnJvciBpbiB0aW1lLlxuICAgICAgICAgICAgICAgIHZhciBhdHRyaWJ1dGVzID0gdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZGF0YTtcbiAgICAgICAgICAgICAgICB2YXIgY3VycmVudEF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXNbYXR0cmlidXRlcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gYXR0cmlidXRlcy5sZW5ndGggLSAyOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudEF0dHJpYnV0ZS5ub2RlTmFtZSA9PT0gYXR0cmlidXRlc1tpXS5ub2RlTmFtZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZHVwbGljYXRlLWF0dHJpYnV0ZVwiLCB7IG5hbWU6IGN1cnJlbnRBdHRyaWJ1dGUubm9kZU5hbWUgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50QXR0cmlidXRlLm5vZGVOYW1lID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChzaG91bGRFbWl0KVxuICAgICAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYnVmZmVyLmNvbW1pdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBhZnRlcl9hdHRyaWJ1dGVfbmFtZV9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJleHBlY3RlZC1lbmQtb2YtdGFnLWJ1dC1nb3QtZW9mXCIpO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzV2hpdGVzcGFjZShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPScpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYmVmb3JlX2F0dHJpYnV0ZV92YWx1ZV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc+Jykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdEN1cnJlbnRUb2tlbigpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc0FscGhhKGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZGF0YS5wdXNoKHsgbm9kZU5hbWU6IGRhdGEsIG5vZGVWYWx1ZTogXCJcIiB9KTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYXR0cmlidXRlX25hbWVfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnLycpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoc2VsZl9jbG9zaW5nX3RhZ19zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09IFwiJ1wiIHx8IGRhdGEgPT09ICdcIicgfHwgZGF0YSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiaW52YWxpZC1jaGFyYWN0ZXItYWZ0ZXItYXR0cmlidXRlLW5hbWVcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZGF0YS5wdXNoKHsgbm9kZU5hbWU6IGRhdGEsIG5vZGVWYWx1ZTogXCJcIiB9KTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYXR0cmlidXRlX25hbWVfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnXFx1MDAwMCcpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJpbnZhbGlkLWNvZGVwb2ludFwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5kYXRhLnB1c2goeyBub2RlTmFtZTogXCJcXHVGRkZEXCIsIG5vZGVWYWx1ZTogXCJcIiB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZGF0YS5wdXNoKHsgbm9kZU5hbWU6IGRhdGEsIG5vZGVWYWx1ZTogXCJcIiB9KTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYXR0cmlidXRlX25hbWVfc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBiZWZvcmVfYXR0cmlidXRlX3ZhbHVlX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImV4cGVjdGVkLWF0dHJpYnV0ZS12YWx1ZS1idXQtZ290LWVvZlwiKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc1doaXRlc3BhY2UoZGF0YSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJ1wiJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShhdHRyaWJ1dGVfdmFsdWVfZG91YmxlX3F1b3RlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICcmJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShhdHRyaWJ1dGVfdmFsdWVfdW5xdW90ZWRfc3RhdGUpO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gXCInXCIpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYXR0cmlidXRlX3ZhbHVlX3NpbmdsZV9xdW90ZWRfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJleHBlY3RlZC1hdHRyaWJ1dGUtdmFsdWUtYnV0LWdvdC1yaWdodC1icmFja2V0XCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdEN1cnJlbnRUb2tlbigpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPScgfHwgZGF0YSA9PT0gJzwnIHx8IGRhdGEgPT09ICdgJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtY2hhcmFjdGVyLWluLXVucXVvdGVkLWF0dHJpYnV0ZS12YWx1ZVwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRBdHRyaWJ1dGUoKS5ub2RlVmFsdWUgKz0gZGF0YTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYXR0cmlidXRlX3ZhbHVlX3VucXVvdGVkX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJ1xcdTAwMDAnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiaW52YWxpZC1jb2RlcG9pbnRcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50QXR0cmlidXRlKCkubm9kZVZhbHVlICs9IFwiXFx1RkZGRFwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRBdHRyaWJ1dGUoKS5ub2RlVmFsdWUgKz0gZGF0YTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYXR0cmlidXRlX3ZhbHVlX3VucXVvdGVkX3N0YXRlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBhdHRyaWJ1dGVfdmFsdWVfZG91YmxlX3F1b3RlZF9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJlb2YtaW4tYXR0cmlidXRlLXZhbHVlLWRvdWJsZS1xdW90ZVwiKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnXCInKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGFmdGVyX2F0dHJpYnV0ZV92YWx1ZV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICcmJykge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkZGl0aW9uYWxBbGxvd2VkQ2hhcmFjdGVyID0gJ1wiJztcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoY2hhcmFjdGVyX3JlZmVyZW5jZV9pbl9hdHRyaWJ1dGVfdmFsdWVfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnXFx1MDAwMCcpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJpbnZhbGlkLWNvZGVwb2ludFwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRBdHRyaWJ1dGUoKS5ub2RlVmFsdWUgKz0gXCJcXHVGRkZEXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBzID0gYnVmZmVyLm1hdGNoVW50aWwoJ1tcXDBcIiZdJyk7XG4gICAgICAgICAgICAgICAgZGF0YSA9IGRhdGEgKyBzO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudEF0dHJpYnV0ZSgpLm5vZGVWYWx1ZSArPSBkYXRhO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBhdHRyaWJ1dGVfdmFsdWVfc2luZ2xlX3F1b3RlZF9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJlb2YtaW4tYXR0cmlidXRlLXZhbHVlLXNpbmdsZS1xdW90ZVwiKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSBcIidcIikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShhZnRlcl9hdHRyaWJ1dGVfdmFsdWVfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnJicpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9hZGRpdGlvbmFsQWxsb3dlZENoYXJhY3RlciA9IFwiJ1wiO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShjaGFyYWN0ZXJfcmVmZXJlbmNlX2luX2F0dHJpYnV0ZV92YWx1ZV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICdcXHUwMDAwJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImludmFsaWQtY29kZXBvaW50XCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudEF0dHJpYnV0ZSgpLm5vZGVWYWx1ZSArPSBcIlxcdUZGRkRcIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50QXR0cmlidXRlKCkubm9kZVZhbHVlICs9IGRhdGEgKyBidWZmZXIubWF0Y2hVbnRpbChcIlxcdTAwMDB8WycmXVwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYXR0cmlidXRlX3ZhbHVlX3VucXVvdGVkX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImVvZi1hZnRlci1hdHRyaWJ1dGUtdmFsdWVcIik7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNXaGl0ZXNwYWNlKGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGJlZm9yZV9hdHRyaWJ1dGVfbmFtZV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICcmJykge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkZGl0aW9uYWxBbGxvd2VkQ2hhcmFjdGVyID0gXCI+XCI7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGNoYXJhY3Rlcl9yZWZlcmVuY2VfaW5fYXR0cmlidXRlX3ZhbHVlX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJz4nKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0Q3VycmVudFRva2VuKCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICdcIicgfHwgZGF0YSA9PT0gXCInXCIgfHwgZGF0YSA9PT0gJz0nIHx8IGRhdGEgPT09ICdgJyB8fCBkYXRhID09PSAnPCcpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWNoYXJhY3Rlci1pbi11bnF1b3RlZC1hdHRyaWJ1dGUtdmFsdWVcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50QXR0cmlidXRlKCkubm9kZVZhbHVlICs9IGRhdGE7XG4gICAgICAgICAgICAgICAgYnVmZmVyLmNvbW1pdCgpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnXFx1MDAwMCcpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJpbnZhbGlkLWNvZGVwb2ludFwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRBdHRyaWJ1dGUoKS5ub2RlVmFsdWUgKz0gXCJcXHVGRkZEXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBvID0gYnVmZmVyLm1hdGNoVW50aWwoXCJcXHUwMDAwfFtcIiArIFwiXFx0XFxuXFx2XFxmXFx4MjBcXHJcIiArIFwiJjw+XFxcIic9YFwiICsgXCJdXCIpO1xuICAgICAgICAgICAgICAgIGlmIChvID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZW9mLWluLWF0dHJpYnV0ZS12YWx1ZS1uby1xdW90ZXNcIik7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdEN1cnJlbnRUb2tlbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBDb21taXQgaGVyZSBzaW5jZSB0aGlzIHN0YXRlIGlzIHJlLWVudGVyYWJsZSBhbmQgaXRzIG91dGNvbWUgd29uJ3QgY2hhbmdlIHdpdGggbW9yZSBkYXRhLlxuICAgICAgICAgICAgICAgIGJ1ZmZlci5jb21taXQoKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRBdHRyaWJ1dGUoKS5ub2RlVmFsdWUgKz0gZGF0YSArIG87XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNoYXJhY3Rlcl9yZWZlcmVuY2VfaW5fYXR0cmlidXRlX3ZhbHVlX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGNoYXJhY3RlciA9IEVudGl0eVBhcnNlci5jb25zdW1lRW50aXR5KGJ1ZmZlciwgdG9rZW5pemVyLCB0aGlzLl9hZGRpdGlvbmFsQWxsb3dlZENoYXJhY3Rlcik7XG4gICAgICAgICAgICB0aGlzLl9jdXJyZW50QXR0cmlidXRlKCkubm9kZVZhbHVlICs9IGNoYXJhY3RlciB8fCAnJic7XG4gICAgICAgICAgICAvLyBXZSdyZSBzdXBwb3NlZCB0byBzd2l0Y2ggYmFjayB0byB0aGUgYXR0cmlidXRlIHZhbHVlIHN0YXRlIHRoYXRcbiAgICAgICAgICAgIC8vIHdlIHdlcmUgaW4gd2hlbiB3ZSB3ZXJlIHN3aXRjaGVkIGludG8gdGhpcyBzdGF0ZS4gUmF0aGVyIHRoYW5cbiAgICAgICAgICAgIC8vIGtlZXBpbmcgdHJhY2sgb2YgdGhpcyBleHBsaWN0bHksIHdlIG9ic2VydmUgdGhhdCB0aGUgcHJldmlvdXNcbiAgICAgICAgICAgIC8vIHN0YXRlIGNhbiBiZSBkZXRlcm1pbmVkIGJ5IGFkZGl0aW9uYWxBbGxvd2VkQ2hhcmFjdGVyLlxuICAgICAgICAgICAgaWYgKHRoaXMuX2FkZGl0aW9uYWxBbGxvd2VkQ2hhcmFjdGVyID09PSAnXCInKVxuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShhdHRyaWJ1dGVfdmFsdWVfZG91YmxlX3F1b3RlZF9zdGF0ZSk7XG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzLl9hZGRpdGlvbmFsQWxsb3dlZENoYXJhY3RlciA9PT0gJ1xcJycpXG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGF0dHJpYnV0ZV92YWx1ZV9zaW5nbGVfcXVvdGVkX3N0YXRlKTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMuX2FkZGl0aW9uYWxBbGxvd2VkQ2hhcmFjdGVyID09PSAnPicpXG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGF0dHJpYnV0ZV92YWx1ZV91bnF1b3RlZF9zdGF0ZSk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGFmdGVyX2F0dHJpYnV0ZV92YWx1ZV9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJlb2YtYWZ0ZXItYXR0cmlidXRlLXZhbHVlXCIpO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzV2hpdGVzcGFjZShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShiZWZvcmVfYXR0cmlidXRlX25hbWVfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0Q3VycmVudFRva2VuKCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICcvJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShzZWxmX2Nsb3NpbmdfdGFnX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwidW5leHBlY3RlZC1jaGFyYWN0ZXItYWZ0ZXItYXR0cmlidXRlLXZhbHVlXCIpO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYmVmb3JlX2F0dHJpYnV0ZV9uYW1lX3N0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gc2VsZl9jbG9zaW5nX3RhZ19zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBjID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChjID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWVvZi1hZnRlci1zb2xpZHVzLWluLXRhZ1wiKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoYyk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5zZWxmQ2xvc2luZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdEN1cnJlbnRUb2tlbigpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWNoYXJhY3Rlci1hZnRlci1zb2xpZHVzLWluLXRhZ1wiKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoYyk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGJlZm9yZV9hdHRyaWJ1dGVfbmFtZV9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGJvZ3VzX2NvbW1lbnRfc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5tYXRjaFVudGlsKCc+Jyk7XG4gICAgICAgICAgICBkYXRhID0gZGF0YS5yZXBsYWNlKC9cXHUwMDAwL2csIFwiXFx1RkZGRFwiKTtcbiAgICAgICAgICAgIGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih7IHR5cGU6ICdDb21tZW50JywgZGF0YTogZGF0YSB9KTtcbiAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gbWFya3VwX2RlY2xhcmF0aW9uX29wZW5fc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgY2hhcnMgPSBidWZmZXIuc2hpZnQoMik7XG4gICAgICAgICAgICBpZiAoY2hhcnMgPT09ICctLScpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbiA9IHsgdHlwZTogJ0NvbW1lbnQnLCBkYXRhOiAnJyB9O1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShjb21tZW50X3N0YXJ0X3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIG5ld2NoYXJzID0gYnVmZmVyLnNoaWZ0KDUpO1xuICAgICAgICAgICAgICAgIGlmIChuZXdjaGFycyA9PT0gSW5wdXRTdHJlYW0uRU9GIHx8IGNoYXJzID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZXhwZWN0ZWQtZGFzaGVzLW9yLWRvY3R5cGVcIik7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShib2d1c19jb21tZW50X3N0YXRlKTtcbiAgICAgICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGNoYXJzKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY2hhcnMgKz0gbmV3Y2hhcnM7XG4gICAgICAgICAgICAgICAgaWYgKGNoYXJzLnRvVXBwZXJDYXNlKCkgPT09ICdET0NUWVBFJykge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbiA9IHsgdHlwZTogJ0RvY3R5cGUnLCBuYW1lOiAnJywgcHVibGljSWQ6IG51bGwsIHN5c3RlbUlkOiBudWxsLCBmb3JjZVF1aXJrczogZmFsc2UgfTtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRvY3R5cGVfc3RhdGUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW5pemVyLl90b2tlbkhhbmRsZXIuaXNDZGF0YVNlY3Rpb25BbGxvd2VkKCkgJiYgY2hhcnMgPT09ICdbQ0RBVEFbJykge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoY2RhdGFfc2VjdGlvbl9zdGF0ZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZXhwZWN0ZWQtZGFzaGVzLW9yLWRvY3R5cGVcIik7XG4gICAgICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChjaGFycyk7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShib2d1c19jb21tZW50X3N0YXRlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNkYXRhX3NlY3Rpb25fc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5tYXRjaFVudGlsKCddXT4nKTtcbiAgICAgICAgICAgIC8vIHNraXAgXV0+XG4gICAgICAgICAgICBidWZmZXIuc2hpZnQoMyk7XG4gICAgICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHsgdHlwZTogJ0NoYXJhY3RlcnMnLCBkYXRhOiBkYXRhIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjb21tZW50X3N0YXJ0X3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImVvZi1pbi1jb21tZW50XCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHRva2VuaXplci5fY3VycmVudFRva2VuKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnLScpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoY29tbWVudF9zdGFydF9kYXNoX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJz4nKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiaW5jb3JyZWN0LWNvbW1lbnRcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4odG9rZW5pemVyLl9jdXJyZW50VG9rZW4pO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJ1xcdTAwMDAnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiaW52YWxpZC1jb2RlcG9pbnRcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZGF0YSArPSBcIlxcdUZGRkRcIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZGF0YSArPSBkYXRhO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShjb21tZW50X3N0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gY29tbWVudF9zdGFydF9kYXNoX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImVvZi1pbi1jb21tZW50XCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHRva2VuaXplci5fY3VycmVudFRva2VuKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnLScpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoY29tbWVudF9lbmRfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJpbmNvcnJlY3QtY29tbWVudFwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnXFx1MDAwMCcpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJpbnZhbGlkLWNvZGVwb2ludFwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5kYXRhICs9IFwiXFx1RkZGRFwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5kYXRhICs9ICctJyArIGRhdGE7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGNvbW1lbnRfc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjb21tZW50X3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImVvZi1pbi1jb21tZW50XCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHRva2VuaXplci5fY3VycmVudFRva2VuKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnLScpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoY29tbWVudF9lbmRfZGFzaF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICdcXHUwMDAwJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImludmFsaWQtY29kZXBvaW50XCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmRhdGEgKz0gXCJcXHVGRkZEXCI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmRhdGEgKz0gZGF0YTtcbiAgICAgICAgICAgICAgICBidWZmZXIuY29tbWl0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNvbW1lbnRfZW5kX2Rhc2hfc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoZGF0YSA9PT0gSW5wdXRTdHJlYW0uRU9GKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZW9mLWluLWNvbW1lbnQtZW5kLWRhc2hcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4odG9rZW5pemVyLl9jdXJyZW50VG9rZW4pO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICctJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShjb21tZW50X2VuZF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICdcXHUwMDAwJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImludmFsaWQtY29kZXBvaW50XCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmRhdGEgKz0gXCItXFx1RkZGRFwiO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShjb21tZW50X3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZGF0YSArPSAnLScgKyBkYXRhICsgYnVmZmVyLm1hdGNoVW50aWwoJ1xcdTAwMDB8LScpO1xuICAgICAgICAgICAgICAgIC8vIENvbnN1bWUgdGhlIG5leHQgY2hhcmFjdGVyIHdoaWNoIGlzIGVpdGhlciBhIFwiLVwiIG9yIGFuIDpFT0YgYXNcbiAgICAgICAgICAgICAgICAvLyB3ZWxsIHNvIGlmIHRoZXJlJ3MgYSBcIi1cIiBkaXJlY3RseSBhZnRlciB0aGUgXCItXCIgd2UgZ28gbmljZWx5IHRvXG4gICAgICAgICAgICAgICAgLy8gdGhlIFwiY29tbWVudCBlbmQgc3RhdGVcIiB3aXRob3V0IGVtaXR0aW5nIGEgdG9rZW5pemVyLl9wYXJzZUVycm9yIHRoZXJlLlxuICAgICAgICAgICAgICAgIGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNvbW1lbnRfZW5kX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImVvZi1pbi1jb21tZW50LWRvdWJsZS1kYXNoXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHRva2VuaXplci5fY3VycmVudFRva2VuKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRUb2tlbih0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnIScpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWJhbmctYWZ0ZXItZG91YmxlLWRhc2gtaW4tY29tbWVudFwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoY29tbWVudF9lbmRfYmFuZ19zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICctJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtZGFzaC1hZnRlci1kb3VibGUtZGFzaC1pbi1jb21tZW50XCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmRhdGEgKz0gZGF0YTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJ1xcdTAwMDAnKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiaW52YWxpZC1jb2RlcG9pbnRcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZGF0YSArPSBcIi0tXFx1RkZGRFwiO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShjb21tZW50X3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gWFhYXG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwidW5leHBlY3RlZC1jaGFyLWluLWNvbW1lbnRcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZGF0YSArPSAnLS0nICsgZGF0YTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoY29tbWVudF9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNvbW1lbnRfZW5kX2Jhbmdfc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoZGF0YSA9PT0gSW5wdXRTdHJlYW0uRU9GKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZW9mLWluLWNvbW1lbnQtZW5kLWJhbmctc3RhdGVcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0VG9rZW4odG9rZW5pemVyLl9jdXJyZW50VG9rZW4pO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc+Jykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdFRva2VuKHRva2VuaXplci5fY3VycmVudFRva2VuKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICctJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmRhdGEgKz0gJy0tISc7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGNvbW1lbnRfZW5kX2Rhc2hfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5kYXRhICs9ICctLSEnICsgZGF0YTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoY29tbWVudF9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGRvY3R5cGVfc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoZGF0YSA9PT0gSW5wdXRTdHJlYW0uRU9GKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZXhwZWN0ZWQtZG9jdHlwZS1uYW1lLWJ1dC1nb3QtZW9mXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmZvcmNlUXVpcmtzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdEN1cnJlbnRUb2tlbigpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc1doaXRlc3BhY2UoZGF0YSkpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYmVmb3JlX2RvY3R5cGVfbmFtZV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcIm5lZWQtc3BhY2UtYWZ0ZXItZG9jdHlwZVwiKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGJlZm9yZV9kb2N0eXBlX25hbWVfc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBiZWZvcmVfZG9jdHlwZV9uYW1lX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImV4cGVjdGVkLWRvY3R5cGUtbmFtZS1idXQtZ290LWVvZlwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5mb3JjZVF1aXJrcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNXaGl0ZXNwYWNlKGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgLy8gcGFzc1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJleHBlY3RlZC1kb2N0eXBlLW5hbWUtYnV0LWdvdC1yaWdodC1icmFja2V0XCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmZvcmNlUXVpcmtzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0Q3VycmVudFRva2VuKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChpc0FscGhhKGRhdGEpKVxuICAgICAgICAgICAgICAgICAgICBkYXRhID0gZGF0YS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLm5hbWUgPSBkYXRhO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkb2N0eXBlX25hbWVfc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBkb2N0eXBlX25hbWVfc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoZGF0YSA9PT0gSW5wdXRTdHJlYW0uRU9GKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZm9yY2VRdWlya3MgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJlb2YtaW4tZG9jdHlwZS1uYW1lXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNXaGl0ZXNwYWNlKGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGFmdGVyX2RvY3R5cGVfbmFtZV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc+Jykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzQWxwaGEoZGF0YSkpXG4gICAgICAgICAgICAgICAgICAgIGRhdGEgPSBkYXRhLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4ubmFtZSArPSBkYXRhO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci5jb21taXQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYWZ0ZXJfZG9jdHlwZV9uYW1lX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmZvcmNlUXVpcmtzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZW9mLWluLWRvY3R5cGVcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdEN1cnJlbnRUb2tlbigpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc1doaXRlc3BhY2UoZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAvLyBwYXNzXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc+Jykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKFsncCcsICdQJ10uaW5kZXhPZihkYXRhKSA+IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBleHBlY3RlZCA9IFtbJ3UnLCAnVSddLCBbJ2InLCAnQiddLCBbJ2wnLCAnTCddLCBbJ2knLCAnSSddLCBbJ2MnLCAnQyddXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG1hdGNoZWQgPSBleHBlY3RlZC5ldmVyeShmdW5jdGlvbihleHBlY3RlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXhwZWN0ZWQuaW5kZXhPZihkYXRhKSA+IC0xO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShhZnRlcl9kb2N0eXBlX3B1YmxpY19rZXl3b3JkX3N0YXRlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChbJ3MnLCAnUyddLmluZGV4T2YoZGF0YSkgPiAtMSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZXhwZWN0ZWQgPSBbWyd5JywgJ1knXSwgWydzJywgJ1MnXSwgWyd0JywgJ1QnXSwgWydlJywgJ0UnXSwgWydtJywgJ00nXV07XG4gICAgICAgICAgICAgICAgICAgIHZhciBtYXRjaGVkID0gZXhwZWN0ZWQuZXZlcnkoZnVuY3Rpb24oZXhwZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV4cGVjdGVkLmluZGV4T2YoZGF0YSkgPiAtMTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYWZ0ZXJfZG9jdHlwZV9zeXN0ZW1fa2V5d29yZF9zdGF0ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIEFsbCB0aGUgY2hhcmFjdGVycyByZWFkIGJlZm9yZSB0aGUgY3VycmVudCAnZGF0YScgd2lsbCBiZVxuICAgICAgICAgICAgICAgIC8vIFthLXpBLVpdLCBzbyB0aGV5J3JlIGdhcmJhZ2UgaW4gdGhlIGJvZ3VzIGRvY3R5cGUgYW5kIGNhbiBiZVxuICAgICAgICAgICAgICAgIC8vIGRpc2NhcmRlZDsgb25seSB0aGUgbGF0ZXN0IGNoYXJhY3RlciBtaWdodCBiZSAnPicgb3IgRU9GXG4gICAgICAgICAgICAgICAgLy8gYW5kIG5lZWRzIHRvIGJlIHVuZ2V0dGVkXG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmZvcmNlUXVpcmtzID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZW9mLWluLWRvY3R5cGVcIik7XG4gICAgICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJleHBlY3RlZC1zcGFjZS1vci1yaWdodC1icmFja2V0LWluLWRvY3R5cGVcIiwgeyBkYXRhOiBkYXRhIH0pO1xuICAgICAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYm9ndXNfZG9jdHlwZV9zdGF0ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBhZnRlcl9kb2N0eXBlX3B1YmxpY19rZXl3b3JkX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImVvZi1pbi1kb2N0eXBlXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmZvcmNlUXVpcmtzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdEN1cnJlbnRUb2tlbigpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc1doaXRlc3BhY2UoZGF0YSkpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYmVmb3JlX2RvY3R5cGVfcHVibGljX2lkZW50aWZpZXJfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSBcIidcIiB8fCBkYXRhID09PSAnXCInKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwidW5leHBlY3RlZC1jaGFyLWluLWRvY3R5cGVcIik7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShiZWZvcmVfZG9jdHlwZV9wdWJsaWNfaWRlbnRpZmllcl9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYmVmb3JlX2RvY3R5cGVfcHVibGljX2lkZW50aWZpZXJfc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBiZWZvcmVfZG9jdHlwZV9wdWJsaWNfaWRlbnRpZmllcl9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJlb2YtaW4tZG9jdHlwZVwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5mb3JjZVF1aXJrcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNXaGl0ZXNwYWNlKGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgLy8gcGFzc1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnXCInKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4ucHVibGljSWQgPSAnJztcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZG9jdHlwZV9wdWJsaWNfaWRlbnRpZmllcl9kb3VibGVfcXVvdGVkX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gXCInXCIpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5wdWJsaWNJZCA9ICcnO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkb2N0eXBlX3B1YmxpY19pZGVudGlmaWVyX3NpbmdsZV9xdW90ZWRfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWVuZC1vZi1kb2N0eXBlXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmZvcmNlUXVpcmtzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0Q3VycmVudFRva2VuKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtY2hhci1pbi1kb2N0eXBlXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmZvcmNlUXVpcmtzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYm9ndXNfZG9jdHlwZV9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGRvY3R5cGVfcHVibGljX2lkZW50aWZpZXJfZG91YmxlX3F1b3RlZF9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJlb2YtaW4tZG9jdHlwZVwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5mb3JjZVF1aXJrcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJ1wiJykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShhZnRlcl9kb2N0eXBlX3B1YmxpY19pZGVudGlmaWVyX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gJz4nKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwidW5leHBlY3RlZC1lbmQtb2YtZG9jdHlwZVwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5mb3JjZVF1aXJrcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdEN1cnJlbnRUb2tlbigpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5wdWJsaWNJZCArPSBkYXRhO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBkb2N0eXBlX3B1YmxpY19pZGVudGlmaWVyX3NpbmdsZV9xdW90ZWRfc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoZGF0YSA9PT0gSW5wdXRTdHJlYW0uRU9GKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZW9mLWluLWRvY3R5cGVcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZm9yY2VRdWlya3MgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0Q3VycmVudFRva2VuKCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09IFwiJ1wiKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGFmdGVyX2RvY3R5cGVfcHVibGljX2lkZW50aWZpZXJfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWVuZC1vZi1kb2N0eXBlXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmZvcmNlUXVpcmtzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0Q3VycmVudFRva2VuKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLnB1YmxpY0lkICs9IGRhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGFmdGVyX2RvY3R5cGVfcHVibGljX2lkZW50aWZpZXJfc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoZGF0YSA9PT0gSW5wdXRTdHJlYW0uRU9GKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZW9mLWluLWRvY3R5cGVcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZm9yY2VRdWlya3MgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdEN1cnJlbnRUb2tlbigpO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzV2hpdGVzcGFjZShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShiZXR3ZWVuX2RvY3R5cGVfcHVibGljX2FuZF9zeXN0ZW1faWRlbnRpZmllcnNfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0Q3VycmVudFRva2VuKCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICdcIicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWNoYXItaW4tZG9jdHlwZVwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5zeXN0ZW1JZCA9ICcnO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkb2N0eXBlX3N5c3RlbV9pZGVudGlmaWVyX2RvdWJsZV9xdW90ZWRfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSBcIidcIikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtY2hhci1pbi1kb2N0eXBlXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLnN5c3RlbUlkID0gJyc7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRvY3R5cGVfc3lzdGVtX2lkZW50aWZpZXJfc2luZ2xlX3F1b3RlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtY2hhci1pbi1kb2N0eXBlXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmZvcmNlUXVpcmtzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYm9ndXNfZG9jdHlwZV9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGJldHdlZW5fZG9jdHlwZV9wdWJsaWNfYW5kX3N5c3RlbV9pZGVudGlmaWVyc19zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJlb2YtaW4tZG9jdHlwZVwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5mb3JjZVF1aXJrcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0Q3VycmVudFRva2VuKCk7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNXaGl0ZXNwYWNlKGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgLy8gcGFzc1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICdcIicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5zeXN0ZW1JZCA9ICcnO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkb2N0eXBlX3N5c3RlbV9pZGVudGlmaWVyX2RvdWJsZV9xdW90ZWRfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSBcIidcIikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLnN5c3RlbUlkID0gJyc7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRvY3R5cGVfc3lzdGVtX2lkZW50aWZpZXJfc2luZ2xlX3F1b3RlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtY2hhci1pbi1kb2N0eXBlXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmZvcmNlUXVpcmtzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYm9ndXNfZG9jdHlwZV9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGFmdGVyX2RvY3R5cGVfc3lzdGVtX2tleXdvcmRfc3RhdGUoYnVmZmVyKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IGJ1ZmZlci5jaGFyKCk7XG4gICAgICAgICAgICBpZiAoZGF0YSA9PT0gSW5wdXRTdHJlYW0uRU9GKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwiZW9mLWluLWRvY3R5cGVcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZm9yY2VRdWlya3MgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdEN1cnJlbnRUb2tlbigpO1xuICAgICAgICAgICAgICAgIGJ1ZmZlci51bmdldChkYXRhKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzV2hpdGVzcGFjZShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShiZWZvcmVfZG9jdHlwZV9zeXN0ZW1faWRlbnRpZmllcl9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09IFwiJ1wiIHx8IGRhdGEgPT09ICdcIicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWNoYXItaW4tZG9jdHlwZVwiKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGJlZm9yZV9kb2N0eXBlX3N5c3RlbV9pZGVudGlmaWVyX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShiZWZvcmVfZG9jdHlwZV9zeXN0ZW1faWRlbnRpZmllcl9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGJlZm9yZV9kb2N0eXBlX3N5c3RlbV9pZGVudGlmaWVyX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImVvZi1pbi1kb2N0eXBlXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmZvcmNlUXVpcmtzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpc1doaXRlc3BhY2UoZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAvLyBwYXNzXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICdcIicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5zeXN0ZW1JZCA9ICcnO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkb2N0eXBlX3N5c3RlbV9pZGVudGlmaWVyX2RvdWJsZV9xdW90ZWRfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSBcIidcIikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLnN5c3RlbUlkID0gJyc7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRvY3R5cGVfc3lzdGVtX2lkZW50aWZpZXJfc2luZ2xlX3F1b3RlZF9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc+Jykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtZW5kLW9mLWRvY3R5cGVcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZm9yY2VRdWlya3MgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdEN1cnJlbnRUb2tlbigpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9wYXJzZUVycm9yKFwidW5leHBlY3RlZC1jaGFyLWluLWRvY3R5cGVcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZm9yY2VRdWlya3MgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShib2d1c19kb2N0eXBlX3N0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZG9jdHlwZV9zeXN0ZW1faWRlbnRpZmllcl9kb3VibGVfcXVvdGVkX3N0YXRlKGJ1ZmZlcikge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSBidWZmZXIuY2hhcigpO1xuICAgICAgICAgICAgaWYgKGRhdGEgPT09IElucHV0U3RyZWFtLkVPRikge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcImVvZi1pbi1kb2N0eXBlXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmZvcmNlUXVpcmtzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnXCInKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGFmdGVyX2RvY3R5cGVfc3lzdGVtX2lkZW50aWZpZXJfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJ1bmV4cGVjdGVkLWVuZC1vZi1kb2N0eXBlXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLmZvcmNlUXVpcmtzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fY3VycmVudFRva2VuLnN5c3RlbUlkICs9IGRhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGRvY3R5cGVfc3lzdGVtX2lkZW50aWZpZXJfc2luZ2xlX3F1b3RlZF9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJlb2YtaW4tZG9jdHlwZVwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5mb3JjZVF1aXJrcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0Q3VycmVudFRva2VuKCk7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YSA9PT0gXCInXCIpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoYWZ0ZXJfZG9jdHlwZV9zeXN0ZW1faWRlbnRpZmllcl9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGRhdGEgPT09ICc+Jykge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtZW5kLW9mLWRvY3R5cGVcIik7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uZm9yY2VRdWlya3MgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fZW1pdEN1cnJlbnRUb2tlbigpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9jdXJyZW50VG9rZW4uc3lzdGVtSWQgKz0gZGF0YTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYWZ0ZXJfZG9jdHlwZV9zeXN0ZW1faWRlbnRpZmllcl9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX3BhcnNlRXJyb3IoXCJlb2YtaW4tZG9jdHlwZVwiKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2N1cnJlbnRUb2tlbi5mb3JjZVF1aXJrcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0Q3VycmVudFRva2VuKCk7XG4gICAgICAgICAgICAgICAgYnVmZmVyLnVuZ2V0KGRhdGEpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShkYXRhX3N0YXRlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNXaGl0ZXNwYWNlKGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgLy8gcGFzc1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5fcGFyc2VFcnJvcihcInVuZXhwZWN0ZWQtY2hhci1pbi1kb2N0eXBlXCIpO1xuICAgICAgICAgICAgICAgIHRva2VuaXplci5zZXRTdGF0ZShib2d1c19kb2N0eXBlX3N0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYm9ndXNfZG9jdHlwZV9zdGF0ZShidWZmZXIpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gYnVmZmVyLmNoYXIoKTtcbiAgICAgICAgICAgIGlmIChkYXRhID09PSBJbnB1dFN0cmVhbS5FT0YpIHtcbiAgICAgICAgICAgICAgICBidWZmZXIudW5nZXQoZGF0YSk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLl9lbWl0Q3VycmVudFRva2VuKCk7XG4gICAgICAgICAgICAgICAgdG9rZW5pemVyLnNldFN0YXRlKGRhdGFfc3RhdGUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChkYXRhID09PSAnPicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuX2VtaXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgICAgICAgICB0b2tlbml6ZXIuc2V0U3RhdGUoZGF0YV9zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH07XG59XG5cblxuIl19