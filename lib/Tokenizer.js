"use strict";
var MAX_TOKEN_COUNT = 1000;
export default class Tokenizer {
    constructor(rules) {
        this.states = rules;
        this.regExps = {};
        this.matchMappings = {};
        for (var key in this.states) {
            var state = this.states[key];
            var ruleRegExps = [];
            var matchTotal = 0;
            var mapping = this.matchMappings[key] = { defaultToken: "text" };
            var flag = "g";
            var splitterRules = [];
            for (var i = 0; i < state.length; i++) {
                var rule = state[i];
                if (rule.defaultToken)
                    mapping.defaultToken = rule.defaultToken;
                if (rule.caseInsensitive)
                    flag = "gi";
                if (rule.regex == null)
                    continue;
                if (rule.regex instanceof RegExp)
                    rule.regex = rule.regex.toString().slice(1, -1);
                var adjustedregex = rule.regex;
                var matchcount = new RegExp("(?:(" + adjustedregex + ")|(.))").exec("a").length - 2;
                if (Array.isArray(rule.token)) {
                    if (rule.token.length == 1 || matchcount == 1) {
                        rule.token = rule.token[0];
                    }
                    else if (matchcount - 1 != rule.token.length) {
                        throw new Error("number of classes and regexp groups in '" +
                            rule.token + "'\n'" + rule.regex + "' doesn't match\n"
                            + (matchcount - 1) + "!=" + rule.token.length);
                    }
                    else {
                        rule.tokenArray = rule.token;
                        rule.token = null;
                        rule.onMatch = this.$arrayTokens;
                    }
                }
                else if (typeof rule.token === "function" && !rule.onMatch) {
                    if (matchcount > 1)
                        rule.onMatch = this.$applyToken;
                    else
                        rule.onMatch = rule.token;
                }
                if (matchcount > 1) {
                    if (/\\\d/.test(rule.regex)) {
                        adjustedregex = rule.regex.replace(/\\([0-9]+)/g, function (match, digit) {
                            return "\\" + (parseInt(digit, 10) + matchTotal + 1);
                        });
                    }
                    else {
                        matchcount = 1;
                        adjustedregex = this.removeCapturingGroups(rule.regex);
                    }
                    if (!rule.splitRegex && typeof rule.token != "string")
                        splitterRules.push(rule);
                }
                mapping[matchTotal] = i;
                matchTotal += matchcount;
                ruleRegExps.push(adjustedregex);
                if (!rule.onMatch)
                    rule.onMatch = null;
            }
            if (!ruleRegExps.length) {
                mapping[0] = 0;
                ruleRegExps.push("$");
            }
            splitterRules.forEach(function (rule) {
                rule.splitRegex = this.createSplitterRegexp(rule.regex, flag);
            }, this);
            this.regExps[key] = new RegExp("(" + ruleRegExps.join(")|(") + ")|($)", flag);
        }
    }
    $setMaxTokenCount(m) {
        MAX_TOKEN_COUNT = m | 0;
    }
    $applyToken(str) {
        var values = this.splitRegex.exec(str).slice(1);
        var types = this.token.apply(this, values);
        if (typeof types === "string")
            return [{ type: types, value: str }];
        var tokens = [];
        for (var i = 0, l = types.length; i < l; i++) {
            if (values[i])
                tokens[tokens.length] = {
                    type: types[i],
                    value: values[i]
                };
        }
        return tokens;
    }
    $arrayTokens(str) {
        if (!str) {
            return [];
        }
        var values = this.splitRegex.exec(str);
        if (!values)
            return "text";
        var tokens = [];
        var types = this.tokenArray;
        for (var i = 0, l = types.length; i < l; i++) {
            if (values[i + 1])
                tokens[tokens.length] = {
                    type: types[i],
                    value: values[i + 1]
                };
        }
        return tokens;
    }
    removeCapturingGroups(src) {
        var r = src.replace(/\[(?:\\.|[^\]])*?\]|\\.|\(\?[:=!]|(\()/g, function (x, y) { return y ? "(?:" : x; });
        return r;
    }
    createSplitterRegexp(src, flag) {
        if (src.indexOf("(?=") != -1) {
            var stack = 0;
            var inChClass = false;
            var lastCapture = {};
            src.replace(/(\\.)|(\((?:\?[=!])?)|(\))|([\[\]])/g, function (m, esc, parenOpen, parenClose, square, index) {
                if (inChClass) {
                    inChClass = square != "]";
                }
                else if (square) {
                    inChClass = true;
                }
                else if (parenClose) {
                    if (stack == lastCapture.stack) {
                        lastCapture.end = index + 1;
                        lastCapture.stack = -1;
                    }
                    stack--;
                }
                else if (parenOpen) {
                    stack++;
                    if (parenOpen.length != 1) {
                        lastCapture.stack = stack;
                        lastCapture.start = index;
                    }
                }
                return m;
            });
            if (lastCapture.end != null && /^\)*$/.test(src.substr(lastCapture.end)))
                src = src.substring(0, lastCapture.start) + src.substr(lastCapture.end);
        }
        return new RegExp(src, (flag || "").replace("g", ""));
    }
    getLineTokens(line, startState) {
        var stack;
        if (startState && typeof startState !== 'string') {
            stack = startState.slice(0);
            startState = stack[0];
            if (startState === '#tmp') {
                stack.shift();
                startState = stack.shift();
            }
        }
        else {
            stack = [];
        }
        var currentState = startState || "start";
        var state = this.states[currentState];
        if (!state) {
            currentState = "start";
            state = this.states[currentState];
        }
        var mapping = this.matchMappings[currentState];
        var re = this.regExps[currentState];
        re.lastIndex = 0;
        var match, tokens = [];
        var lastIndex = 0;
        var token = { type: null, value: "" };
        while (match = re.exec(line)) {
            var type = mapping.defaultToken;
            var rule = null;
            var value = match[0];
            var index = re.lastIndex;
            if (index - value.length > lastIndex) {
                var skipped = line.substring(lastIndex, index - value.length);
                if (token.type == type) {
                    token.value += skipped;
                }
                else {
                    if (token.type)
                        tokens.push(token);
                    token = { type: type, value: skipped };
                }
            }
            for (var i = 0; i < match.length - 2; i++) {
                if (match[i + 1] === undefined)
                    continue;
                rule = state[mapping[i]];
                if (rule.onMatch)
                    type = rule.onMatch(value, currentState, stack);
                else
                    type = rule.token;
                if (rule.next) {
                    if (typeof rule.next === 'string') {
                        currentState = rule.next;
                    }
                    else {
                        currentState = rule.next(currentState, stack);
                    }
                    state = this.states[currentState];
                    if (!state) {
                        window.console && console.error && console.error(currentState, "doesn't exist");
                        currentState = "start";
                        state = this.states[currentState];
                    }
                    mapping = this.matchMappings[currentState];
                    lastIndex = index;
                    re = this.regExps[currentState];
                    re.lastIndex = index;
                }
                break;
            }
            if (value) {
                if (typeof type == "string") {
                    if ((!rule || rule.merge !== false) && token.type === type) {
                        token.value += value;
                    }
                    else {
                        if (token.type)
                            tokens.push(token);
                        token = { type: type, value: value };
                    }
                }
                else if (type) {
                    if (token.type)
                        tokens.push(token);
                    token = { type: null, value: "" };
                    for (var i = 0; i < type.length; i++)
                        tokens.push(type[i]);
                }
            }
            if (lastIndex == line.length)
                break;
            lastIndex = index;
            if (tokens.length > MAX_TOKEN_COUNT) {
                while (lastIndex < line.length) {
                    if (token.type)
                        tokens.push(token);
                    token = {
                        value: line.substring(lastIndex, lastIndex += 2000),
                        type: "overflow"
                    };
                }
                currentState = "start";
                stack = [];
                break;
            }
        }
        if (token.type)
            tokens.push(token);
        if (stack.length > 1) {
            if (stack[0] !== currentState) {
                stack.unshift('#tmp', currentState);
            }
        }
        return {
            tokens: tokens,
            state: stack.length ? stack : currentState
        };
    }
}
