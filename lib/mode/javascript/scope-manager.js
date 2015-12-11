"use strict";
import EventEmitter from './EventEmitter';
import has from "../../fp/has";
import sliceArgs from "../../fp/sliceArgs";
import findLastIndex from "../../fp/findLastIndex";
var marker = {};
export var scopeManager = function (state, predefined, exported, declared) {
    var _current;
    var _scopeStack = [];
    function _newScope(type) {
        _current = {
            "(labels)": Object.create(null),
            "(usages)": Object.create(null),
            "(breakLabels)": Object.create(null),
            "(parent)": _current,
            "(type)": type,
            "(params)": (type === "functionparams" || type === "catchparams") ? [] : null
        };
        _scopeStack.push(_current);
    }
    _newScope("global");
    _current["(predefined)"] = predefined;
    var _currentFunctBody = _current;
    var usedPredefinedAndGlobals = Object.create(null);
    var impliedGlobals = Object.create(null);
    var unuseds = [];
    var emitter = new EventEmitter();
    function warning(code, token, unused1, unused2) {
        emitter.emit("warning", {
            code: code,
            token: token,
            data: sliceArgs(arguments, 2)
        });
    }
    function error(code, token, unused) {
        emitter.emit("warning", {
            code: code,
            token: token,
            data: sliceArgs(arguments, 2)
        });
    }
    function _setupUsages(labelName) {
        if (!_current["(usages)"][labelName]) {
            _current["(usages)"][labelName] = {
                "(modified)": [],
                "(reassigned)": [],
                "(tokens)": []
            };
        }
    }
    var _getUnusedOption = function (unused_opt) {
        if (unused_opt === undefined) {
            unused_opt = state.option.unused;
        }
        if (unused_opt === true) {
            unused_opt = "last-param";
        }
        return unused_opt;
    };
    var _warnUnused = function (name, tkn, type, unused_opt) {
        var line = tkn.line;
        var chr = tkn.from;
        var raw_name = tkn.raw_text || name;
        unused_opt = _getUnusedOption(unused_opt);
        var warnable_types = {
            "vars": ["var"],
            "last-param": ["var", "param"],
            "strict": ["var", "param", "last-param"]
        };
        if (unused_opt) {
            if (warnable_types[unused_opt] && warnable_types[unused_opt].indexOf(type) !== -1) {
                warning("W098", { line: line, from: chr }, raw_name);
            }
        }
        if (unused_opt || type === "var") {
            unuseds.push({
                name: name,
                line: line,
                character: chr
            });
        }
    };
    function _checkForUnused() {
        if (_current["(type)"] === "functionparams") {
            _checkParams();
            return;
        }
        var curentLabels = _current["(labels)"];
        for (var labelName in curentLabels) {
            if (curentLabels[labelName]) {
                if (curentLabels[labelName]["(type)"] !== "exception" &&
                    curentLabels[labelName]["(unused)"]) {
                    _warnUnused(labelName, curentLabels[labelName]["(token)"], "var");
                }
            }
        }
    }
    function _checkParams() {
        var params = _current["(params)"];
        if (!params) {
            return;
        }
        var param = params.pop();
        var unused_opt;
        while (param) {
            var label = _current["(labels)"][param];
            unused_opt = _getUnusedOption(state.funct["(unusedOption)"]);
            if (param === "undefined")
                return;
            if (label["(unused)"]) {
                _warnUnused(param, label["(token)"], "param", state.funct["(unusedOption)"]);
            }
            else if (unused_opt === "last-param") {
                return;
            }
            param = params.pop();
        }
    }
    function _getLabel(labelName) {
        for (var i = _scopeStack.length - 1; i >= 0; --i) {
            var scopeLabels = _scopeStack[i]["(labels)"];
            if (scopeLabels[labelName]) {
                return scopeLabels;
            }
        }
    }
    function usedSoFarInCurrentFunction(labelName) {
        for (var i = _scopeStack.length - 1; i >= 0; i--) {
            var current = _scopeStack[i];
            if (current["(usages)"][labelName]) {
                return current["(usages)"][labelName];
            }
            if (current === _currentFunctBody) {
                break;
            }
        }
        return false;
    }
    function _checkOuterShadow(labelName, token, unused) {
        if (state.option.shadow !== "outer") {
            return;
        }
        var isGlobal = _currentFunctBody["(type)"] === "global", isNewFunction = _current["(type)"] === "functionparams";
        var outsideCurrentFunction = !isGlobal;
        for (var i = 0; i < _scopeStack.length; i++) {
            var stackItem = _scopeStack[i];
            if (!isNewFunction && _scopeStack[i + 1] === _currentFunctBody) {
                outsideCurrentFunction = false;
            }
            if (outsideCurrentFunction && stackItem["(labels)"][labelName]) {
                warning("W123", token, labelName);
            }
            if (stackItem["(breakLabels)"][labelName]) {
                warning("W123", token, labelName);
            }
        }
    }
    function _latedefWarning(type, labelName, token) {
        if (state.option.latedef) {
            if ((state.option.latedef === true && type === "function") ||
                type !== "function") {
                warning("W003", token, labelName);
            }
        }
    }
    var scopeManagerInst = {
        on: function (names, listener) {
            names.split(" ").forEach(function (name) {
                emitter.on(name, listener);
            });
        },
        isPredefined: function (labelName) {
            return !this.has(labelName) && has(_scopeStack[0]["(predefined)"], labelName);
        },
        stack: function (type) {
            var previousScope = _current;
            _newScope(type);
            if (!type && previousScope["(type)"] === "functionparams") {
                _current["(isFuncBody)"] = true;
                _current["(context)"] = _currentFunctBody;
                _currentFunctBody = _current;
            }
        },
        unstack: function () {
            var subScope = _scopeStack.length > 1 ? _scopeStack[_scopeStack.length - 2] : null;
            var isUnstackingFunctionBody = _current === _currentFunctBody, isUnstackingFunctionParams = _current["(type)"] === "functionparams", isUnstackingFunctionOuter = _current["(type)"] === "functionouter";
            var i, j;
            var currentUsages = _current["(usages)"];
            var currentLabels = _current["(labels)"];
            var usedLabelNameList = Object.keys(currentUsages);
            if (currentUsages.__proto__ && usedLabelNameList.indexOf("__proto__") === -1) {
                usedLabelNameList.push("__proto__");
            }
            for (i = 0; i < usedLabelNameList.length; i++) {
                var usedLabelName = usedLabelNameList[i];
                var usage = currentUsages[usedLabelName];
                var usedLabel = currentLabels[usedLabelName];
                if (usedLabel) {
                    var usedLabelType = usedLabel["(type)"];
                    if (usedLabel["(useOutsideOfScope)"] && !state.option.funcscope) {
                        var usedTokens = usage["(tokens)"];
                        if (usedTokens) {
                            for (j = 0; j < usedTokens.length; j++) {
                                if (usedLabel["(function)"] === usedTokens[j]["(function)"]) {
                                    error("W038", usedTokens[j], usedLabelName);
                                }
                            }
                        }
                    }
                    _current["(labels)"][usedLabelName]["(unused)"] = false;
                    if (usedLabelType === "const" && usage["(modified)"]) {
                        for (j = 0; j < usage["(modified)"].length; j++) {
                            error("E013", usage["(modified)"][j], usedLabelName);
                        }
                    }
                    if ((usedLabelType === "function" || usedLabelType === "class") &&
                        usage["(reassigned)"]) {
                        for (j = 0; j < usage["(reassigned)"].length; j++) {
                            if (!usage["(reassigned)"][j].ignoreW021) {
                                warning("W021", usage["(reassigned)"][j], usedLabelName, usedLabelType);
                            }
                        }
                    }
                    continue;
                }
                if (isUnstackingFunctionOuter) {
                    state.funct["(isCapturing)"] = true;
                }
                if (subScope) {
                    if (!subScope["(usages)"][usedLabelName]) {
                        subScope["(usages)"][usedLabelName] = usage;
                        if (isUnstackingFunctionBody) {
                            subScope["(usages)"][usedLabelName]["(onlyUsedSubFunction)"] = true;
                        }
                    }
                    else {
                        var subScopeUsage = subScope["(usages)"][usedLabelName];
                        subScopeUsage["(modified)"] = subScopeUsage["(modified)"].concat(usage["(modified)"]);
                        subScopeUsage["(tokens)"] = subScopeUsage["(tokens)"].concat(usage["(tokens)"]);
                        subScopeUsage["(reassigned)"] =
                            subScopeUsage["(reassigned)"].concat(usage["(reassigned)"]);
                        subScopeUsage["(onlyUsedSubFunction)"] = false;
                    }
                }
                else {
                    if (typeof _current["(predefined)"][usedLabelName] === "boolean") {
                        delete declared[usedLabelName];
                        usedPredefinedAndGlobals[usedLabelName] = marker;
                        if (_current["(predefined)"][usedLabelName] === false && usage["(reassigned)"]) {
                            for (j = 0; j < usage["(reassigned)"].length; j++) {
                                if (!usage["(reassigned)"][j].ignoreW020) {
                                    warning("W020", usage["(reassigned)"][j]);
                                }
                            }
                        }
                    }
                    else {
                        if (usage["(tokens)"]) {
                            for (j = 0; j < usage["(tokens)"].length; j++) {
                                var undefinedToken = usage["(tokens)"][j];
                                if (!undefinedToken.forgiveUndef) {
                                    if (state.option.undef && !undefinedToken.ignoreUndef) {
                                        warning("W117", undefinedToken, usedLabelName);
                                    }
                                    if (impliedGlobals[usedLabelName]) {
                                        impliedGlobals[usedLabelName].line.push(undefinedToken.line);
                                    }
                                    else {
                                        impliedGlobals[usedLabelName] = {
                                            name: usedLabelName,
                                            line: [undefinedToken.line]
                                        };
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (!subScope) {
                Object.keys(declared)
                    .forEach(function (labelNotUsed) {
                    _warnUnused(labelNotUsed, declared[labelNotUsed], "var");
                });
            }
            if (subScope && !isUnstackingFunctionBody &&
                !isUnstackingFunctionParams && !isUnstackingFunctionOuter) {
                var labelNames = Object.keys(currentLabels);
                for (i = 0; i < labelNames.length; i++) {
                    var defLabelName = labelNames[i];
                    var defLabel = currentLabels[defLabelName];
                    if (!defLabel["(blockscoped)"] && defLabel["(type)"] !== "exception") {
                        var shadowed = subScope["(labels)"][defLabelName];
                        if (shadowed) {
                            shadowed["(unused)"] &= defLabel["(unused)"];
                        }
                        else {
                            defLabel["(useOutsideOfScope)"] =
                                _currentFunctBody["(type)"] !== "global" &&
                                    !this.funct.has(defLabelName, { excludeCurrent: true });
                            subScope["(labels)"][defLabelName] = defLabel;
                        }
                        delete currentLabels[defLabelName];
                    }
                }
            }
            _checkForUnused();
            _scopeStack.pop();
            if (isUnstackingFunctionBody) {
                _currentFunctBody = _scopeStack[findLastIndex(_scopeStack, function (scope) {
                    return scope["(isFuncBody)"] || scope["(type)"] === "global";
                })];
            }
            _current = subScope;
        },
        addParam: function (labelName, token, type) {
            type = type || "param";
            if (type === "exception") {
                var previouslyDefinedLabelType = this.funct.labeltype(labelName);
                if (previouslyDefinedLabelType && previouslyDefinedLabelType !== "exception") {
                    if (!state.option.node) {
                        warning("W002", state.tokens.next, labelName);
                    }
                }
            }
            if (has(_current["(labels)"], labelName)) {
                _current["(labels)"][labelName].duplicated = true;
            }
            else {
                _checkOuterShadow(labelName, token, type);
                _current["(labels)"][labelName] = {
                    "(type)": type,
                    "(token)": token,
                    "(unused)": true
                };
                _current["(params)"].push(labelName);
            }
            if (has(_current["(usages)"], labelName)) {
                var usage = _current["(usages)"][labelName];
                if (usage["(onlyUsedSubFunction)"]) {
                    _latedefWarning(type, labelName, token);
                }
                else {
                    warning("E056", token, labelName, type);
                }
            }
        },
        validateParams: function () {
            if (_currentFunctBody["(type)"] === "global") {
                return;
            }
            var isStrict = state.isStrict();
            var currentFunctParamScope = _currentFunctBody["(parent)"];
            if (!currentFunctParamScope["(params)"]) {
                return;
            }
            currentFunctParamScope["(params)"].forEach(function (labelName) {
                var label = currentFunctParamScope["(labels)"][labelName];
                if (label && label.duplicated) {
                    if (isStrict) {
                        warning("E011", label["(token)"], labelName);
                    }
                    else if (state.option.shadow !== true) {
                        warning("W004", label["(token)"], labelName);
                    }
                }
            });
        },
        getUsedOrDefinedGlobals: function () {
            var list = Object.keys(usedPredefinedAndGlobals);
            if (usedPredefinedAndGlobals.__proto__ === marker &&
                list.indexOf("__proto__") === -1) {
                list.push("__proto__");
            }
            return list;
        },
        getImpliedGlobals: function () {
            var values = values(impliedGlobals);
            var hasProto = false;
            if (impliedGlobals.__proto__) {
                hasProto = values.some(function (value) {
                    return value.name === "__proto__";
                });
                if (!hasProto) {
                    values.push(impliedGlobals.__proto__);
                }
            }
            return values;
        },
        getUnuseds: function () {
            return unuseds;
        },
        has: function (labelName, unused) {
            return Boolean(_getLabel(labelName));
        },
        labeltype: function (labelName) {
            var scopeLabels = _getLabel(labelName);
            if (scopeLabels) {
                return scopeLabels[labelName]["(type)"];
            }
            return null;
        },
        addExported: function (labelName) {
            var globalLabels = _scopeStack[0]["(labels)"];
            if (has(declared, labelName)) {
                delete declared[labelName];
            }
            else if (has(globalLabels, labelName)) {
                globalLabels[labelName]["(unused)"] = false;
            }
            else {
                for (var i = 1; i < _scopeStack.length; i++) {
                    var scope = _scopeStack[i];
                    if (!scope["(type)"]) {
                        if (has(scope["(labels)"], labelName) &&
                            !scope["(labels)"][labelName]["(blockscoped)"]) {
                            scope["(labels)"][labelName]["(unused)"] = false;
                            return;
                        }
                    }
                    else {
                        break;
                    }
                }
                exported[labelName] = true;
            }
        },
        setExported: function (labelName, token) {
            this.block.use(labelName, token);
        },
        addlabel: function (labelName, opts) {
            var type = opts.type;
            var token = opts.token;
            var isblockscoped = type === "let" || type === "const" || type === "class";
            var isexported = (isblockscoped ? _current : _currentFunctBody)["(type)"] === "global" &&
                has(exported, labelName);
            _checkOuterShadow(labelName, token, type);
            if (isblockscoped) {
                var declaredInCurrentScope = _current["(labels)"][labelName];
                if (!declaredInCurrentScope && _current === _currentFunctBody &&
                    _current["(type)"] !== "global") {
                    declaredInCurrentScope = !!_currentFunctBody["(parent)"]["(labels)"][labelName];
                }
                if (!declaredInCurrentScope && _current["(usages)"][labelName]) {
                    var usage = _current["(usages)"][labelName];
                    if (usage["(onlyUsedSubFunction)"]) {
                        _latedefWarning(type, labelName, token);
                    }
                    else {
                        warning("E056", token, labelName, type);
                    }
                }
                if (declaredInCurrentScope) {
                    warning("E011", token, labelName);
                }
                else if (state.option.shadow === "outer") {
                    if (scopeManagerInst.funct.has(labelName)) {
                        warning("W004", token, labelName);
                    }
                }
                scopeManagerInst.block.add(labelName, type, token, !isexported);
            }
            else {
                var declaredInCurrentFunctionScope = scopeManagerInst.funct.has(labelName);
                if (!declaredInCurrentFunctionScope && usedSoFarInCurrentFunction(labelName)) {
                    _latedefWarning(type, labelName, token);
                }
                if (scopeManagerInst.funct.has(labelName, { onlyBlockscoped: true })) {
                    warning("E011", token, labelName);
                }
                else if (state.option.shadow !== true) {
                    if (declaredInCurrentFunctionScope && labelName !== "__proto__") {
                        if (_currentFunctBody["(type)"] !== "global") {
                            warning("W004", token, labelName);
                        }
                    }
                }
                scopeManagerInst.funct.add(labelName, type, token, !isexported);
                if (_currentFunctBody["(type)"] === "global") {
                    usedPredefinedAndGlobals[labelName] = marker;
                }
            }
        },
        funct: {
            labeltype: function (labelName, options) {
                var onlyBlockscoped = options && options.onlyBlockscoped;
                var excludeParams = options && options.excludeParams;
                var currentScopeIndex = _scopeStack.length - (options && options.excludeCurrent ? 2 : 1);
                for (var i = currentScopeIndex; i >= 0; i--) {
                    var current = _scopeStack[i];
                    if (current["(labels)"][labelName] &&
                        (!onlyBlockscoped || current["(labels)"][labelName]["(blockscoped)"])) {
                        return current["(labels)"][labelName]["(type)"];
                    }
                    var scopeCheck = excludeParams ? _scopeStack[i - 1] : current;
                    if (scopeCheck && scopeCheck["(type)"] === "functionparams") {
                        return null;
                    }
                }
                return null;
            },
            hasBreakLabel: function (labelName) {
                for (var i = _scopeStack.length - 1; i >= 0; i--) {
                    var current = _scopeStack[i];
                    if (current["(breakLabels)"][labelName]) {
                        return true;
                    }
                    if (current["(type)"] === "functionparams") {
                        return false;
                    }
                }
                return false;
            },
            has: function (labelName, options) {
                return Boolean(this.labeltype(labelName, options));
            },
            add: function (labelName, type, tok, unused) {
                _current["(labels)"][labelName] = {
                    "(type)": type,
                    "(token)": tok,
                    "(blockscoped)": false,
                    "(function)": _currentFunctBody,
                    "(unused)": unused
                };
            }
        },
        block: {
            isGlobal: function () {
                return _current["(type)"] === "global";
            },
            use: function (labelName, token) {
                var paramScope = _currentFunctBody["(parent)"];
                if (paramScope && paramScope["(labels)"][labelName] &&
                    paramScope["(labels)"][labelName]["(type)"] === "param") {
                    if (!scopeManagerInst.funct.has(labelName, { excludeParams: true, onlyBlockscoped: true })) {
                        paramScope["(labels)"][labelName]["(unused)"] = false;
                    }
                }
                if (token && (state.ignored.W117 || state.option.undef === false)) {
                    token.ignoreUndef = true;
                }
                _setupUsages(labelName);
                if (token) {
                    token["(function)"] = _currentFunctBody;
                    _current["(usages)"][labelName]["(tokens)"].push(token);
                }
            },
            reassign: function (labelName, token) {
                token.ignoreW020 = state.ignored.W020;
                token.ignoreW021 = state.ignored.W021;
                this.modify(labelName, token);
                _current["(usages)"][labelName]["(reassigned)"].push(token);
            },
            modify: function (labelName, token) {
                _setupUsages(labelName);
                _current["(usages)"][labelName]["(modified)"].push(token);
            },
            add: function (labelName, type, tok, unused) {
                _current["(labels)"][labelName] = {
                    "(type)": type,
                    "(token)": tok,
                    "(blockscoped)": true,
                    "(unused)": unused
                };
            },
            addBreakLabel: function (labelName, opts) {
                var token = opts.token;
                if (scopeManagerInst.funct.hasBreakLabel(labelName)) {
                    warning("E011", token, labelName);
                }
                else if (state.option.shadow === "outer") {
                    if (scopeManagerInst.funct.has(labelName)) {
                        warning("W004", token, labelName);
                    }
                    else {
                        _checkOuterShadow(labelName, token);
                    }
                }
                _current["(breakLabels)"][labelName] = token;
            }
        }
    };
    return scopeManagerInst;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NvcGUtbWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tb2RlL2phdmFzY3JpcHQvc2NvcGUtbWFuYWdlci50cyJdLCJuYW1lcyI6WyJfbmV3U2NvcGUiLCJ3YXJuaW5nIiwiZXJyb3IiLCJfc2V0dXBVc2FnZXMiLCJfY2hlY2tGb3JVbnVzZWQiLCJfY2hlY2tQYXJhbXMiLCJfZ2V0TGFiZWwiLCJ1c2VkU29GYXJJbkN1cnJlbnRGdW5jdGlvbiIsIl9jaGVja091dGVyU2hhZG93IiwiX2xhdGVkZWZXYXJuaW5nIl0sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7T0FFTixZQUFZLE1BQU0sZ0JBQWdCO09BQ2xDLEdBQUcsTUFBTSxjQUFjO09BQ3ZCLFNBQVMsTUFBTSxvQkFBb0I7T0FDbkMsYUFBYSxNQUFNLHdCQUF3QjtBQUtsRCxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFNaEIsV0FBVyxZQUFZLEdBQUcsVUFBUyxLQUFLLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxRQUFRO0lBRXBFLElBQUksUUFBUSxDQUFDO0lBQ2IsSUFBSSxXQUFXLEdBQUcsRUFBRSxDQUFDO0lBRXJCLG1CQUFtQixJQUFJO1FBQ25CQSxRQUFRQSxHQUFHQTtZQUNQQSxVQUFVQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUMvQkEsVUFBVUEsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDL0JBLGVBQWVBLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1lBQ3BDQSxVQUFVQSxFQUFFQSxRQUFRQTtZQUNwQkEsUUFBUUEsRUFBRUEsSUFBSUE7WUFDZEEsVUFBVUEsRUFBRUEsQ0FBQ0EsSUFBSUEsS0FBS0EsZ0JBQWdCQSxJQUFJQSxJQUFJQSxLQUFLQSxhQUFhQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxJQUFJQTtTQUNoRkEsQ0FB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QUVBLFlBQVlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO2dCQUN0RUEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFNRDtRQUNJQyxJQUFJQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUVsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDekJBLElBQUlBLFVBQVVBLENBQUNBO1FBRWZBLE9BQU9BLEtBQUtBLEVBQUVBLENBQUNBO1lBQ1hBLElBQUlBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBRXhDQSxVQUFVQSxHQUFHQSxnQkFBZ0JBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFJN0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEtBQUtBLFdBQVdBLENBQUNBO2dCQUN0QkEsTUFBTUEsQ0FBQ0E7WUFFWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxXQUFXQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxFQUFFQSxPQUFPQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxnQkFBZ0JBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pGQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxLQUFLQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDckNBLE1BQU1BLENBQUNBO1lBQ1hBLENB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QUN2QixFQUFFLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbEQsT0FBTyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQ3RDLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUM7b0JBQ3ZDLEVBQUUsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUN4QyxPQUFPLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztvQkFDdEMsQ0FBQztvQkFBQyxJQUFJLENBQUMsQ0FBQzt3QkFDSixpQkFBaUIsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQ3hDLENBQUM7Z0JBQ0wsQ0FBQztnQkFDRCxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQ2pELENBQUM7U0FDSjtLQUNKLENBQUM7SUFDRixNQUFNLENBQUMsZ0JBQWdCLENBQUM7QUFDNUIsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCBFdmVudEVtaXR0ZXIgZnJvbSAnLi9FdmVudEVtaXR0ZXInO1xuaW1wb3J0IGhhcyBmcm9tIFwiLi4vLi4vZnAvaGFzXCI7XG5pbXBvcnQgc2xpY2VBcmdzIGZyb20gXCIuLi8uLi9mcC9zbGljZUFyZ3NcIjtcbmltcG9ydCBmaW5kTGFzdEluZGV4IGZyb20gXCIuLi8uLi9mcC9maW5kTGFzdEluZGV4XCI7XG5cbi8vIFVzZWQgdG8gZGVub3RlIG1lbWJlcnNoaXAgaW4gbG9va3VwIHRhYmxlcyAoYSBwcmltaXRpdmUgdmFsdWUgc3VjaCBhcyBgdHJ1ZWBcbi8vIHdvdWxkIGJlIHNpbGVudGx5IHJlamVjdGVkIGZvciB0aGUgcHJvcGVydHkgbmFtZSBcIl9fcHJvdG9fX1wiIGluIHNvbWVcbi8vIGVudmlyb25tZW50cylcbnZhciBtYXJrZXIgPSB7fTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgc2NvcGUgbWFuYWdlciB0aGF0IGhhbmRsZXMgdmFyaWFibGVzIGFuZCBsYWJlbHMsIHN0b3JpbmcgdXNhZ2VzXG4gKiBhbmQgcmVzb2x2aW5nIHdoZW4gdmFyaWFibGVzIGFyZSB1c2VkIGFuZCB1bmRlZmluZWRcbiAqL1xuZXhwb3J0IHZhciBzY29wZU1hbmFnZXIgPSBmdW5jdGlvbihzdGF0ZSwgcHJlZGVmaW5lZCwgZXhwb3J0ZWQsIGRlY2xhcmVkKSB7XG5cbiAgICB2YXIgX2N1cnJlbnQ7XG4gICAgdmFyIF9zY29wZVN0YWNrID0gW107XG5cbiAgICBmdW5jdGlvbiBfbmV3U2NvcGUodHlwZSkge1xuICAgICAgICBfY3VycmVudCA9IHtcbiAgICAgICAgICAgIFwiKGxhYmVscylcIjogT2JqZWN0LmNyZWF0ZShudWxsKSxcbiAgICAgICAgICAgIFwiKHVzYWdlcylcIjogT2JqZWN0LmNyZWF0ZShudWxsKSxcbiAgICAgICAgICAgIFwiKGJyZWFrTGFiZWxzKVwiOiBPYmplY3QuY3JlYXRlKG51bGwpLFxuICAgICAgICAgICAgXCIocGFyZW50KVwiOiBfY3VycmVudCxcbiAgICAgICAgICAgIFwiKHR5cGUpXCI6IHR5cGUsXG4gICAgICAgICAgICBcIihwYXJhbXMpXCI6ICh0eXBlID09PSBcImZ1bmN0aW9ucGFyYW1zXCIgfHwgdHlwZSA9PT0gXCJjYXRjaHBhcmFtc1wiKSA/IFtdIDogbnVsbFxuICAgICAgICB9O1xuICAgICAgICBfc2NvcGVTdGFjay5wdXNoKF9jdXJyZW50KTtcbiAgICB9XG5cbiAgICBfbmV3U2NvcGUoXCJnbG9iYWxcIik7XG4gICAgX2N1cnJlbnRbXCIocHJlZGVmaW5lZClcIl0gPSBwcmVkZWZpbmVkO1xuXG4gICAgdmFyIF9jdXJyZW50RnVuY3RCb2R5ID0gX2N1cnJlbnQ7IC8vIHRoaXMgaXMgdGhlIGJsb2NrIGFmdGVyIHRoZSBwYXJhbXMgPSBmdW5jdGlvblxuXG4gICAgdmFyIHVzZWRQcmVkZWZpbmVkQW5kR2xvYmFscyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgdmFyIGltcGxpZWRHbG9iYWxzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICB2YXIgdW51c2VkcyA9IFtdO1xuICAgIHZhciBlbWl0dGVyID0gbmV3IEV2ZW50RW1pdHRlcigpO1xuXG4gICAgZnVuY3Rpb24gd2FybmluZyhjb2RlOiBzdHJpbmcsIHRva2VuLCB1bnVzZWQxPywgdW51c2VkMj8pIHtcbiAgICAgICAgZW1pdHRlci5lbWl0KFwid2FybmluZ1wiLCB7XG4gICAgICAgICAgICBjb2RlOiBjb2RlLFxuICAgICAgICAgICAgdG9rZW46IHRva2VuLFxuICAgICAgICAgICAgZGF0YTogc2xpY2VBcmdzKGFyZ3VtZW50cywgMilcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXJyb3IoY29kZTogc3RyaW5nLCB0b2tlbiwgdW51c2VkPykge1xuICAgICAgICBlbWl0dGVyLmVtaXQoXCJ3YXJuaW5nXCIsIHtcbiAgICAgICAgICAgIGNvZGU6IGNvZGUsXG4gICAgICAgICAgICB0b2tlbjogdG9rZW4sXG4gICAgICAgICAgICBkYXRhOiBzbGljZUFyZ3MoYXJndW1lbnRzLCAyKVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfc2V0dXBVc2FnZXMobGFiZWxOYW1lKSB7XG4gICAgICAgIGlmICghX2N1cnJlbnRbXCIodXNhZ2VzKVwiXVtsYWJlbE5hbWVdKSB7XG4gICAgICAgICAgICBfY3VycmVudFtcIih1c2FnZXMpXCJdW2xhYmVsTmFtZV0gPSB7XG4gICAgICAgICAgICAgICAgXCIobW9kaWZpZWQpXCI6IFtdLFxuICAgICAgICAgICAgICAgIFwiKHJlYXNzaWduZWQpXCI6IFtdLFxuICAgICAgICAgICAgICAgIFwiKHRva2VucylcIjogW11cbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgX2dldFVudXNlZE9wdGlvbiA9IGZ1bmN0aW9uKHVudXNlZF9vcHQpIHtcbiAgICAgICAgaWYgKHVudXNlZF9vcHQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdW51c2VkX29wdCA9IHN0YXRlLm9wdGlvbi51bnVzZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodW51c2VkX29wdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgdW51c2VkX29wdCA9IFwibGFzdC1wYXJhbVwiO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVudXNlZF9vcHQ7XG4gICAgfTtcblxuICAgIHZhciBfd2FyblVudXNlZCA9IGZ1bmN0aW9uKG5hbWUsIHRrbiwgdHlwZSwgdW51c2VkX29wdD8pIHtcbiAgICAgICAgdmFyIGxpbmUgPSB0a24ubGluZTtcbiAgICAgICAgdmFyIGNociA9IHRrbi5mcm9tO1xuICAgICAgICB2YXIgcmF3X25hbWUgPSB0a24ucmF3X3RleHQgfHwgbmFtZTtcblxuICAgICAgICB1bnVzZWRfb3B0ID0gX2dldFVudXNlZE9wdGlvbih1bnVzZWRfb3B0KTtcblxuICAgICAgICB2YXIgd2FybmFibGVfdHlwZXMgPSB7XG4gICAgICAgICAgICBcInZhcnNcIjogW1widmFyXCJdLFxuICAgICAgICAgICAgXCJsYXN0LXBhcmFtXCI6IFtcInZhclwiLCBcInBhcmFtXCJdLFxuICAgICAgICAgICAgXCJzdHJpY3RcIjogW1widmFyXCIsIFwicGFyYW1cIiwgXCJsYXN0LXBhcmFtXCJdXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKHVudXNlZF9vcHQpIHtcbiAgICAgICAgICAgIGlmICh3YXJuYWJsZV90eXBlc1t1bnVzZWRfb3B0XSAmJiB3YXJuYWJsZV90eXBlc1t1bnVzZWRfb3B0XS5pbmRleE9mKHR5cGUpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDk4XCIsIHsgbGluZTogbGluZSwgZnJvbTogY2hyIH0sIHJhd19uYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGluY29uc2lzdGVudCAtIHNlZSBnaC0xODk0XG4gICAgICAgIGlmICh1bnVzZWRfb3B0IHx8IHR5cGUgPT09IFwidmFyXCIpIHtcbiAgICAgICAgICAgIHVudXNlZHMucHVzaCh7XG4gICAgICAgICAgICAgICAgbmFtZTogbmFtZSxcbiAgICAgICAgICAgICAgICBsaW5lOiBsaW5lLFxuICAgICAgICAgICAgICAgIGNoYXJhY3RlcjogY2hyXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBDaGVja3MgdGhlIGN1cnJlbnQgc2NvcGUgZm9yIHVudXNlZCBpZGVudGlmaWVyc1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIF9jaGVja0ZvclVudXNlZCgpIHtcbiAgICAgICAgLy8gZnVuY3Rpb24gcGFyYW1zIGFyZSBoYW5kbGVkIHNwZWNpYWxseVxuICAgICAgICAvLyBhc3N1bWUgdGhhdCBwYXJhbWV0ZXJzIGFyZSB0aGUgb25seSB0aGluZyBkZWNsYXJlZCBpbiB0aGUgcGFyYW0gc2NvcGVcbiAgICAgICAgaWYgKF9jdXJyZW50W1wiKHR5cGUpXCJdID09PSBcImZ1bmN0aW9ucGFyYW1zXCIpIHtcbiAgICAgICAgICAgIF9jaGVja1BhcmFtcygpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBjdXJlbnRMYWJlbHMgPSBfY3VycmVudFtcIihsYWJlbHMpXCJdO1xuICAgICAgICBmb3IgKHZhciBsYWJlbE5hbWUgaW4gY3VyZW50TGFiZWxzKSB7XG4gICAgICAgICAgICBpZiAoY3VyZW50TGFiZWxzW2xhYmVsTmFtZV0pIHtcbiAgICAgICAgICAgICAgICBpZiAoY3VyZW50TGFiZWxzW2xhYmVsTmFtZV1bXCIodHlwZSlcIl0gIT09IFwiZXhjZXB0aW9uXCIgJiZcbiAgICAgICAgICAgICAgICAgICAgY3VyZW50TGFiZWxzW2xhYmVsTmFtZV1bXCIodW51c2VkKVwiXSkge1xuICAgICAgICAgICAgICAgICAgICBfd2FyblVudXNlZChsYWJlbE5hbWUsIGN1cmVudExhYmVsc1tsYWJlbE5hbWVdW1wiKHRva2VuKVwiXSwgXCJ2YXJcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHRoZSBjdXJyZW50IHNjb3BlIGZvciB1bnVzZWQgcGFyYW1ldGVyc1xuICAgICAqIE11c3QgYmUgY2FsbGVkIGluIGEgZnVuY3Rpb24gcGFyYW1ldGVyIHNjb3BlXG4gICAgICovXG4gICAgZnVuY3Rpb24gX2NoZWNrUGFyYW1zKCkge1xuICAgICAgICB2YXIgcGFyYW1zID0gX2N1cnJlbnRbXCIocGFyYW1zKVwiXTtcblxuICAgICAgICBpZiAoIXBhcmFtcykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHBhcmFtID0gcGFyYW1zLnBvcCgpO1xuICAgICAgICB2YXIgdW51c2VkX29wdDtcblxuICAgICAgICB3aGlsZSAocGFyYW0pIHtcbiAgICAgICAgICAgIHZhciBsYWJlbCA9IF9jdXJyZW50W1wiKGxhYmVscylcIl1bcGFyYW1dO1xuXG4gICAgICAgICAgICB1bnVzZWRfb3B0ID0gX2dldFVudXNlZE9wdGlvbihzdGF0ZS5mdW5jdFtcIih1bnVzZWRPcHRpb24pXCJdKTtcblxuICAgICAgICAgICAgLy8gJ3VuZGVmaW5lZCcgaXMgYSBzcGVjaWFsIGNhc2UgZm9yIChmdW5jdGlvbih3aW5kb3csIHVuZGVmaW5lZCkgeyAuLi4gfSkoKTtcbiAgICAgICAgICAgIC8vIHBhdHRlcm5zLlxuICAgICAgICAgICAgaWYgKHBhcmFtID09PSBcInVuZGVmaW5lZFwiKVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgaWYgKGxhYmVsW1wiKHVudXNlZClcIl0pIHtcbiAgICAgICAgICAgICAgICBfd2FyblVudXNlZChwYXJhbSwgbGFiZWxbXCIodG9rZW4pXCJdLCBcInBhcmFtXCIsIHN0YXRlLmZ1bmN0W1wiKHVudXNlZE9wdGlvbilcIl0pO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh1bnVzZWRfb3B0ID09PSBcImxhc3QtcGFyYW1cIikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcGFyYW0gPSBwYXJhbXMucG9wKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaW5kcyB0aGUgcmVsZXZhbnQgbGFiZWwncyBzY29wZSwgc2VhcmNoaW5nIGZyb20gbmVhcmVzdCBvdXR3YXJkc1xuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IHRoZSBzY29wZSB0aGUgbGFiZWwgd2FzIGZvdW5kIGluXG4gICAgICovXG4gICAgZnVuY3Rpb24gX2dldExhYmVsKGxhYmVsTmFtZSkge1xuICAgICAgICBmb3IgKHZhciBpID0gX3Njb3BlU3RhY2subGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgICAgICAgIHZhciBzY29wZUxhYmVscyA9IF9zY29wZVN0YWNrW2ldW1wiKGxhYmVscylcIl07XG4gICAgICAgICAgICBpZiAoc2NvcGVMYWJlbHNbbGFiZWxOYW1lXSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzY29wZUxhYmVscztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVzZWRTb0ZhckluQ3VycmVudEZ1bmN0aW9uKGxhYmVsTmFtZSkge1xuICAgICAgICAvLyB1c2VkIHNvIGZhciBpbiB0aGlzIHdob2xlIGZ1bmN0aW9uIGFuZCBhbnkgc3ViIGZ1bmN0aW9uc1xuICAgICAgICBmb3IgKHZhciBpID0gX3Njb3BlU3RhY2subGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIHZhciBjdXJyZW50ID0gX3Njb3BlU3RhY2tbaV07XG4gICAgICAgICAgICBpZiAoY3VycmVudFtcIih1c2FnZXMpXCJdW2xhYmVsTmFtZV0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY3VycmVudFtcIih1c2FnZXMpXCJdW2xhYmVsTmFtZV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY3VycmVudCA9PT0gX2N1cnJlbnRGdW5jdEJvZHkpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2NoZWNrT3V0ZXJTaGFkb3cobGFiZWxOYW1lLCB0b2tlbiwgdW51c2VkPykge1xuXG4gICAgICAgIC8vIG9ubHkgY2hlY2sgaWYgc2hhZG93IGlzIG91dGVyXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24uc2hhZG93ICE9PSBcIm91dGVyXCIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpc0dsb2JhbCA9IF9jdXJyZW50RnVuY3RCb2R5W1wiKHR5cGUpXCJdID09PSBcImdsb2JhbFwiLFxuICAgICAgICAgICAgaXNOZXdGdW5jdGlvbiA9IF9jdXJyZW50W1wiKHR5cGUpXCJdID09PSBcImZ1bmN0aW9ucGFyYW1zXCI7XG5cbiAgICAgICAgdmFyIG91dHNpZGVDdXJyZW50RnVuY3Rpb24gPSAhaXNHbG9iYWw7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgX3Njb3BlU3RhY2subGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBzdGFja0l0ZW0gPSBfc2NvcGVTdGFja1tpXTtcblxuICAgICAgICAgICAgaWYgKCFpc05ld0Z1bmN0aW9uICYmIF9zY29wZVN0YWNrW2kgKyAxXSA9PT0gX2N1cnJlbnRGdW5jdEJvZHkpIHtcbiAgICAgICAgICAgICAgICBvdXRzaWRlQ3VycmVudEZ1bmN0aW9uID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAob3V0c2lkZUN1cnJlbnRGdW5jdGlvbiAmJiBzdGFja0l0ZW1bXCIobGFiZWxzKVwiXVtsYWJlbE5hbWVdKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMjNcIiwgdG9rZW4sIGxhYmVsTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc3RhY2tJdGVtW1wiKGJyZWFrTGFiZWxzKVwiXVtsYWJlbE5hbWVdKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMjNcIiwgdG9rZW4sIGxhYmVsTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfbGF0ZWRlZldhcm5pbmcodHlwZSwgbGFiZWxOYW1lLCB0b2tlbikge1xuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmxhdGVkZWYpIHtcbiAgICAgICAgICAgIC8vIGlmIGVpdGhlciBsYXRlZGVmIGlzIHN0cmljdCBhbmQgdGhpcyBpcyBhIGZ1bmN0aW9uXG4gICAgICAgICAgICAvLyAgICBvciB0aGlzIGlzIG5vdCBhIGZ1bmN0aW9uXG4gICAgICAgICAgICBpZiAoKHN0YXRlLm9wdGlvbi5sYXRlZGVmID09PSB0cnVlICYmIHR5cGUgPT09IFwiZnVuY3Rpb25cIikgfHxcbiAgICAgICAgICAgICAgICB0eXBlICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAwM1wiLCB0b2tlbiwgbGFiZWxOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciBzY29wZU1hbmFnZXJJbnN0ID0ge1xuXG4gICAgICAgIG9uOiBmdW5jdGlvbihuYW1lcywgbGlzdGVuZXIpIHtcbiAgICAgICAgICAgIG5hbWVzLnNwbGl0KFwiIFwiKS5mb3JFYWNoKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgICAgICBlbWl0dGVyLm9uKG5hbWUsIGxpc3RlbmVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuXG4gICAgICAgIGlzUHJlZGVmaW5lZDogZnVuY3Rpb24obGFiZWxOYW1lKSB7XG4gICAgICAgICAgICByZXR1cm4gIXRoaXMuaGFzKGxhYmVsTmFtZSkgJiYgaGFzKF9zY29wZVN0YWNrWzBdW1wiKHByZWRlZmluZWQpXCJdLCBsYWJlbE5hbWUpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUZWxsIHRoZSBtYW5hZ2VyIHdlIGFyZSBlbnRlcmluZyBhIG5ldyBibG9jayBvZiBjb2RlXG4gICAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbdHlwZV0gLSBUaGUgdHlwZSBvZiB0aGUgYmxvY2suIFZhbGlkIHZhbHVlcyBhcmVcbiAgICAgICAgICogICAgICAgICAgICAgICAgICAgICAgICAgIFwiZnVuY3Rpb25wYXJhbXNcIiwgXCJjYXRjaHBhcmFtc1wiIGFuZFxuICAgICAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmdW5jdGlvbm91dGVyXCJcbiAgICAgICAgICovXG4gICAgICAgIHN0YWNrOiBmdW5jdGlvbih0eXBlKSB7XG4gICAgICAgICAgICB2YXIgcHJldmlvdXNTY29wZSA9IF9jdXJyZW50O1xuICAgICAgICAgICAgX25ld1Njb3BlKHR5cGUpO1xuXG4gICAgICAgICAgICBpZiAoIXR5cGUgJiYgcHJldmlvdXNTY29wZVtcIih0eXBlKVwiXSA9PT0gXCJmdW5jdGlvbnBhcmFtc1wiKSB7XG5cbiAgICAgICAgICAgICAgICBfY3VycmVudFtcIihpc0Z1bmNCb2R5KVwiXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgX2N1cnJlbnRbXCIoY29udGV4dClcIl0gPSBfY3VycmVudEZ1bmN0Qm9keTtcbiAgICAgICAgICAgICAgICBfY3VycmVudEZ1bmN0Qm9keSA9IF9jdXJyZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHVuc3RhY2s6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgLy8ganNoaW50IHByb3RvOiB0cnVlXG4gICAgICAgICAgICB2YXIgc3ViU2NvcGUgPSBfc2NvcGVTdGFjay5sZW5ndGggPiAxID8gX3Njb3BlU3RhY2tbX3Njb3BlU3RhY2subGVuZ3RoIC0gMl0gOiBudWxsO1xuICAgICAgICAgICAgdmFyIGlzVW5zdGFja2luZ0Z1bmN0aW9uQm9keSA9IF9jdXJyZW50ID09PSBfY3VycmVudEZ1bmN0Qm9keSxcbiAgICAgICAgICAgICAgICBpc1Vuc3RhY2tpbmdGdW5jdGlvblBhcmFtcyA9IF9jdXJyZW50W1wiKHR5cGUpXCJdID09PSBcImZ1bmN0aW9ucGFyYW1zXCIsXG4gICAgICAgICAgICAgICAgaXNVbnN0YWNraW5nRnVuY3Rpb25PdXRlciA9IF9jdXJyZW50W1wiKHR5cGUpXCJdID09PSBcImZ1bmN0aW9ub3V0ZXJcIjtcblxuICAgICAgICAgICAgdmFyIGksIGo7XG4gICAgICAgICAgICB2YXIgY3VycmVudFVzYWdlcyA9IF9jdXJyZW50W1wiKHVzYWdlcylcIl07XG4gICAgICAgICAgICB2YXIgY3VycmVudExhYmVscyA9IF9jdXJyZW50W1wiKGxhYmVscylcIl07XG4gICAgICAgICAgICB2YXIgdXNlZExhYmVsTmFtZUxpc3QgPSBPYmplY3Qua2V5cyhjdXJyZW50VXNhZ2VzKTtcblxuICAgICAgICAgICAgaWYgKGN1cnJlbnRVc2FnZXMuX19wcm90b19fICYmIHVzZWRMYWJlbE5hbWVMaXN0LmluZGV4T2YoXCJfX3Byb3RvX19cIikgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgdXNlZExhYmVsTmFtZUxpc3QucHVzaChcIl9fcHJvdG9fX1wiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IHVzZWRMYWJlbE5hbWVMaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIHVzZWRMYWJlbE5hbWUgPSB1c2VkTGFiZWxOYW1lTGlzdFtpXTtcblxuICAgICAgICAgICAgICAgIHZhciB1c2FnZSA9IGN1cnJlbnRVc2FnZXNbdXNlZExhYmVsTmFtZV07XG4gICAgICAgICAgICAgICAgdmFyIHVzZWRMYWJlbCA9IGN1cnJlbnRMYWJlbHNbdXNlZExhYmVsTmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKHVzZWRMYWJlbCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdXNlZExhYmVsVHlwZSA9IHVzZWRMYWJlbFtcIih0eXBlKVwiXTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodXNlZExhYmVsW1wiKHVzZU91dHNpZGVPZlNjb3BlKVwiXSAmJiAhc3RhdGUub3B0aW9uLmZ1bmNzY29wZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHVzZWRUb2tlbnMgPSB1c2FnZVtcIih0b2tlbnMpXCJdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHVzZWRUb2tlbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgdXNlZFRva2Vucy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBLZWVwIHRoZSBjb25zaXN0ZW5jeSBvZiBodHRwczovL2dpdGh1Yi5jb20vanNoaW50L2pzaGludC9pc3N1ZXMvMjQwOVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodXNlZExhYmVsW1wiKGZ1bmN0aW9uKVwiXSA9PT0gdXNlZFRva2Vuc1tqXVtcIihmdW5jdGlvbilcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiVzAzOFwiLCB1c2VkVG9rZW5zW2pdLCB1c2VkTGFiZWxOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIG1hcmsgdGhlIGxhYmVsIHVzZWRcbiAgICAgICAgICAgICAgICAgICAgX2N1cnJlbnRbXCIobGFiZWxzKVwiXVt1c2VkTGFiZWxOYW1lXVtcIih1bnVzZWQpXCJdID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgZm9yIG1vZGlmeWluZyBhIGNvbnN0XG4gICAgICAgICAgICAgICAgICAgIGlmICh1c2VkTGFiZWxUeXBlID09PSBcImNvbnN0XCIgJiYgdXNhZ2VbXCIobW9kaWZpZWQpXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgdXNhZ2VbXCIobW9kaWZpZWQpXCJdLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDEzXCIsIHVzYWdlW1wiKG1vZGlmaWVkKVwiXVtqXSwgdXNlZExhYmVsTmFtZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBmb3IgcmUtYXNzaWduaW5nIGEgZnVuY3Rpb24gZGVjbGFyYXRpb25cbiAgICAgICAgICAgICAgICAgICAgaWYgKCh1c2VkTGFiZWxUeXBlID09PSBcImZ1bmN0aW9uXCIgfHwgdXNlZExhYmVsVHlwZSA9PT0gXCJjbGFzc1wiKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdXNhZ2VbXCIocmVhc3NpZ25lZClcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCB1c2FnZVtcIihyZWFzc2lnbmVkKVwiXS5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdXNhZ2VbXCIocmVhc3NpZ25lZClcIl1bal0uaWdub3JlVzAyMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAyMVwiLCB1c2FnZVtcIihyZWFzc2lnbmVkKVwiXVtqXSwgdXNlZExhYmVsTmFtZSwgdXNlZExhYmVsVHlwZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChpc1Vuc3RhY2tpbmdGdW5jdGlvbk91dGVyKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKGlzQ2FwdHVyaW5nKVwiXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHN1YlNjb3BlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIG5vdCBleGl0aW5nIHRoZSBnbG9iYWwgc2NvcGUsIHNvIGNvcHkgdGhlIHVzYWdlIGRvd24gaW4gY2FzZSBpdHMgYW4gb3V0IG9mIHNjb3BlIHVzYWdlXG4gICAgICAgICAgICAgICAgICAgIGlmICghc3ViU2NvcGVbXCIodXNhZ2VzKVwiXVt1c2VkTGFiZWxOYW1lXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3ViU2NvcGVbXCIodXNhZ2VzKVwiXVt1c2VkTGFiZWxOYW1lXSA9IHVzYWdlO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzVW5zdGFja2luZ0Z1bmN0aW9uQm9keSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1YlNjb3BlW1wiKHVzYWdlcylcIl1bdXNlZExhYmVsTmFtZV1bXCIob25seVVzZWRTdWJGdW5jdGlvbilcIl0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHN1YlNjb3BlVXNhZ2UgPSBzdWJTY29wZVtcIih1c2FnZXMpXCJdW3VzZWRMYWJlbE5hbWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgc3ViU2NvcGVVc2FnZVtcIihtb2RpZmllZClcIl0gPSBzdWJTY29wZVVzYWdlW1wiKG1vZGlmaWVkKVwiXS5jb25jYXQodXNhZ2VbXCIobW9kaWZpZWQpXCJdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1YlNjb3BlVXNhZ2VbXCIodG9rZW5zKVwiXSA9IHN1YlNjb3BlVXNhZ2VbXCIodG9rZW5zKVwiXS5jb25jYXQodXNhZ2VbXCIodG9rZW5zKVwiXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWJTY29wZVVzYWdlW1wiKHJlYXNzaWduZWQpXCJdID1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJTY29wZVVzYWdlW1wiKHJlYXNzaWduZWQpXCJdLmNvbmNhdCh1c2FnZVtcIihyZWFzc2lnbmVkKVwiXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWJTY29wZVVzYWdlW1wiKG9ubHlVc2VkU3ViRnVuY3Rpb24pXCJdID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyB0aGlzIGlzIGV4aXRpbmcgZ2xvYmFsIHNjb3BlLCBzbyB3ZSBmaW5hbGlzZSBldmVyeXRoaW5nIGhlcmUgLSB3ZSBhcmUgYXQgdGhlIGVuZCBvZiB0aGUgZmlsZVxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIF9jdXJyZW50W1wiKHByZWRlZmluZWQpXCJdW3VzZWRMYWJlbE5hbWVdID09PSBcImJvb2xlYW5cIikge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyByZW1vdmUgdGhlIGRlY2xhcmVkIHRva2VuLCBzbyB3ZSBrbm93IGl0IGlzIHVzZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBkZWNsYXJlZFt1c2VkTGFiZWxOYW1lXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbm90ZSBpdCBhcyB1c2VkIHNvIGl0IGNhbiBiZSByZXBvcnRlZFxuICAgICAgICAgICAgICAgICAgICAgICAgdXNlZFByZWRlZmluZWRBbmRHbG9iYWxzW3VzZWRMYWJlbE5hbWVdID0gbWFya2VyO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBmb3IgcmUtYXNzaWduaW5nIGEgcmVhZC1vbmx5IChzZXQgdG8gZmFsc2UpIHByZWRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChfY3VycmVudFtcIihwcmVkZWZpbmVkKVwiXVt1c2VkTGFiZWxOYW1lXSA9PT0gZmFsc2UgJiYgdXNhZ2VbXCIocmVhc3NpZ25lZClcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgdXNhZ2VbXCIocmVhc3NpZ25lZClcIl0ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF1c2FnZVtcIihyZWFzc2lnbmVkKVwiXVtqXS5pZ25vcmVXMDIwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAyMFwiLCB1c2FnZVtcIihyZWFzc2lnbmVkKVwiXVtqXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBsYWJlbCB1c2FnZSBpcyBub3QgcHJlZGVmaW5lZCBhbmQgd2UgaGF2ZSBub3QgZm91bmQgYSBkZWNsYXJhdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc28gcmVwb3J0IGFzIHVuZGVjbGFyZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh1c2FnZVtcIih0b2tlbnMpXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IHVzYWdlW1wiKHRva2VucylcIl0ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHVuZGVmaW5lZFRva2VuID0gdXNhZ2VbXCIodG9rZW5zKVwiXVtqXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgaXRzIG5vdCBhIGZvcmdpdmVuIHVuZGVmaW5lZCAoZS5nLiB0eXBvZiB4KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXVuZGVmaW5lZFRva2VuLmZvcmdpdmVVbmRlZikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgdW5kZWYgaXMgb24gYW5kIHVuZGVmIHdhcyBvbiB3aGVuIHRoZSB0b2tlbiB3YXMgZGVmaW5lZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi51bmRlZiAmJiAhdW5kZWZpbmVkVG9rZW4uaWdub3JlVW5kZWYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExN1wiLCB1bmRlZmluZWRUb2tlbiwgdXNlZExhYmVsTmFtZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW1wbGllZEdsb2JhbHNbdXNlZExhYmVsTmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbXBsaWVkR2xvYmFsc1t1c2VkTGFiZWxOYW1lXS5saW5lLnB1c2godW5kZWZpbmVkVG9rZW4ubGluZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGltcGxpZWRHbG9iYWxzW3VzZWRMYWJlbE5hbWVdID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiB1c2VkTGFiZWxOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiBbdW5kZWZpbmVkVG9rZW4ubGluZV1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpZiBleGl0aW5nIHRoZSBnbG9iYWwgc2NvcGUsIHdlIGNhbiB3YXJuIGFib3V0IGRlY2xhcmVkIGdsb2JhbHMgdGhhdCBoYXZlbid0IGJlZW4gdXNlZCB5ZXRcbiAgICAgICAgICAgIGlmICghc3ViU2NvcGUpIHtcbiAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyhkZWNsYXJlZClcbiAgICAgICAgICAgICAgICAgICAgLmZvckVhY2goZnVuY3Rpb24obGFiZWxOb3RVc2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBfd2FyblVudXNlZChsYWJlbE5vdFVzZWQsIGRlY2xhcmVkW2xhYmVsTm90VXNlZF0sIFwidmFyXCIpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gSWYgdGhpcyBpcyBub3QgYSBmdW5jdGlvbiBib3VuZGFyeSwgdHJhbnNmZXIgZnVuY3Rpb24tc2NvcGVkIGxhYmVscyB0b1xuICAgICAgICAgICAgLy8gdGhlIHBhcmVudCBibG9jayAoYSByb3VnaCBzaW11bGF0aW9uIG9mIHZhcmlhYmxlIGhvaXN0aW5nKS4gUHJldmlvdXNseVxuICAgICAgICAgICAgLy8gZXhpc3RpbmcgbGFiZWxzIGluIHRoZSBwYXJlbnQgYmxvY2sgc2hvdWxkIHRha2UgcHJlY2VkZW5jZSBzbyB0aGF0IHRoaW5ncyBhbmQgc3R1ZmYuXG4gICAgICAgICAgICBpZiAoc3ViU2NvcGUgJiYgIWlzVW5zdGFja2luZ0Z1bmN0aW9uQm9keSAmJlxuICAgICAgICAgICAgICAgICFpc1Vuc3RhY2tpbmdGdW5jdGlvblBhcmFtcyAmJiAhaXNVbnN0YWNraW5nRnVuY3Rpb25PdXRlcikge1xuICAgICAgICAgICAgICAgIHZhciBsYWJlbE5hbWVzID0gT2JqZWN0LmtleXMoY3VycmVudExhYmVscyk7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGxhYmVsTmFtZXMubGVuZ3RoOyBpKyspIHtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgZGVmTGFiZWxOYW1lID0gbGFiZWxOYW1lc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGRlZkxhYmVsID0gY3VycmVudExhYmVsc1tkZWZMYWJlbE5hbWVdO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICghZGVmTGFiZWxbXCIoYmxvY2tzY29wZWQpXCJdICYmIGRlZkxhYmVsW1wiKHR5cGUpXCJdICE9PSBcImV4Y2VwdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgc2hhZG93ZWQgPSBzdWJTY29wZVtcIihsYWJlbHMpXCJdW2RlZkxhYmVsTmFtZV07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIERvIG5vdCBvdmVyd3JpdGUgYSBsYWJlbCBpZiBpdCBleGlzdHMgaW4gdGhlIHBhcmVudCBzY29wZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYmVjYXVzZSBpdCBpcyBzaGFyZWQgYnkgYWRqYWNlbnQgYmxvY2tzLiBDb3B5IHRoZSBgdW51c2VkYFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gcHJvcGVydHkgc28gdGhhdCBhbnkgcmVmZXJlbmNlcyBmb3VuZCB3aXRoaW4gdGhlIGN1cnJlbnQgYmxvY2tcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFyZSBjb3VudGVkIHRvd2FyZCB0aGF0IGhpZ2hlci1sZXZlbCBkZWNsYXJhdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzaGFkb3dlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNoYWRvd2VkW1wiKHVudXNlZClcIl0gJj0gZGVmTGFiZWxbXCIodW51c2VkKVwiXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFwiSG9pc3RcIiB0aGUgdmFyaWFibGUgdG8gdGhlIHBhcmVudCBibG9jaywgZGVjb3JhdGluZyB0aGUgbGFiZWxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzbyB0aGF0IGZ1dHVyZSByZWZlcmVuY2VzLCB0aG91Z2ggdGVjaG5pY2FsbHkgdmFsaWQsIGNhbiBiZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJlcG9ydGVkIGFzIFwib3V0LW9mLXNjb3BlXCIgaW4gdGhlIGFic2VuY2Ugb2YgdGhlIGBmdW5jc2NvcGVgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3B0aW9uLlxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZMYWJlbFtcIih1c2VPdXRzaWRlT2ZTY29wZSlcIl0gPVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBEbyBub3Qgd2FybiBhYm91dCBvdXQtb2Ytc2NvcGUgdXNhZ2VzIGluIHRoZSBnbG9iYWwgc2NvcGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgX2N1cnJlbnRGdW5jdEJvZHlbXCIodHlwZSlcIl0gIT09IFwiZ2xvYmFsXCIgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2hlbiBhIGhpZ2hlciBzY29wZSBjb250YWlucyBhIGJpbmRpbmcgZm9yIHRoZSBsYWJlbCwgdGhlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGxhYmVsIGlzIGEgcmUtZGVjbGFyYXRpb24gYW5kIHNob3VsZCBub3QgcHJvbXB0IFwidXNlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBvdXQtb2Ytc2NvcGVcIiB3YXJuaW5ncy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIXRoaXMuZnVuY3QuaGFzKGRlZkxhYmVsTmFtZSwgeyBleGNsdWRlQ3VycmVudDogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1YlNjb3BlW1wiKGxhYmVscylcIl1bZGVmTGFiZWxOYW1lXSA9IGRlZkxhYmVsO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgY3VycmVudExhYmVsc1tkZWZMYWJlbE5hbWVdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBfY2hlY2tGb3JVbnVzZWQoKTtcblxuICAgICAgICAgICAgX3Njb3BlU3RhY2sucG9wKCk7XG4gICAgICAgICAgICBpZiAoaXNVbnN0YWNraW5nRnVuY3Rpb25Cb2R5KSB7XG4gICAgICAgICAgICAgICAgX2N1cnJlbnRGdW5jdEJvZHkgPSBfc2NvcGVTdGFja1tmaW5kTGFzdEluZGV4KF9zY29wZVN0YWNrLCBmdW5jdGlvbihzY29wZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiBmdW5jdGlvbiBvciBpZiBnbG9iYWwgKHdoaWNoIGlzIGF0IHRoZSBib3R0b20gc28gaXQgd2lsbCBvbmx5IHJldHVybiB0cnVlIGlmIHdlIGNhbGwgYmFjaylcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlW1wiKGlzRnVuY0JvZHkpXCJdIHx8IHNjb3BlW1wiKHR5cGUpXCJdID09PSBcImdsb2JhbFwiO1xuICAgICAgICAgICAgICAgIH0pXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgX2N1cnJlbnQgPSBzdWJTY29wZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQWRkIGEgcGFyYW0gdG8gdGhlIGN1cnJlbnQgc2NvcGVcbiAgICAgICAgICogQHBhcmFtIHtzdHJpbmd9IGxhYmVsTmFtZVxuICAgICAgICAgKiBAcGFyYW0ge1Rva2VufSB0b2tlblxuICAgICAgICAgKiBAcGFyYW0ge3N0cmluZ30gW3R5cGU9XCJwYXJhbVwiXSBwYXJhbSB0eXBlXG4gICAgICAgICAqL1xuICAgICAgICBhZGRQYXJhbTogZnVuY3Rpb24obGFiZWxOYW1lLCB0b2tlbiwgdHlwZSkge1xuICAgICAgICAgICAgdHlwZSA9IHR5cGUgfHwgXCJwYXJhbVwiO1xuXG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gXCJleGNlcHRpb25cIikge1xuICAgICAgICAgICAgICAgIC8vIGlmIGRlZmluZWQgaW4gdGhlIGN1cnJlbnQgZnVuY3Rpb25cbiAgICAgICAgICAgICAgICB2YXIgcHJldmlvdXNseURlZmluZWRMYWJlbFR5cGUgPSB0aGlzLmZ1bmN0LmxhYmVsdHlwZShsYWJlbE5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChwcmV2aW91c2x5RGVmaW5lZExhYmVsVHlwZSAmJiBwcmV2aW91c2x5RGVmaW5lZExhYmVsVHlwZSAhPT0gXCJleGNlcHRpb25cIikge1xuICAgICAgICAgICAgICAgICAgICAvLyBhbmQgaGFzIG5vdCBiZWVuIHVzZWQgeWV0IGluIHRoZSBjdXJyZW50IGZ1bmN0aW9uIHNjb3BlXG4gICAgICAgICAgICAgICAgICAgIGlmICghc3RhdGUub3B0aW9uLm5vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDAyXCIsIHN0YXRlLnRva2Vucy5uZXh0LCBsYWJlbE5hbWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBUaGUgdmFyaWFibGUgd2FzIGRlY2xhcmVkIGluIHRoZSBjdXJyZW50IHNjb3BlXG4gICAgICAgICAgICBpZiAoaGFzKF9jdXJyZW50W1wiKGxhYmVscylcIl0sIGxhYmVsTmFtZSkpIHtcbiAgICAgICAgICAgICAgICBfY3VycmVudFtcIihsYWJlbHMpXCJdW2xhYmVsTmFtZV0uZHVwbGljYXRlZCA9IHRydWU7XG5cbiAgICAgICAgICAgICAgICAvLyBUaGUgdmFyaWFibGUgd2FzIGRlY2xhcmVkIGluIGFuIG91dGVyIHNjb3BlXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGlmIHRoaXMgc2NvcGUgaGFzIHRoZSB2YXJpYWJsZSBkZWZpbmVkLCBpdCdzIGEgcmUtZGVmaW5pdGlvbiBlcnJvclxuICAgICAgICAgICAgICAgIF9jaGVja091dGVyU2hhZG93KGxhYmVsTmFtZSwgdG9rZW4sIHR5cGUpO1xuXG4gICAgICAgICAgICAgICAgX2N1cnJlbnRbXCIobGFiZWxzKVwiXVtsYWJlbE5hbWVdID0ge1xuICAgICAgICAgICAgICAgICAgICBcIih0eXBlKVwiOiB0eXBlLFxuICAgICAgICAgICAgICAgICAgICBcIih0b2tlbilcIjogdG9rZW4sXG4gICAgICAgICAgICAgICAgICAgIFwiKHVudXNlZClcIjogdHJ1ZVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICBfY3VycmVudFtcIihwYXJhbXMpXCJdLnB1c2gobGFiZWxOYW1lKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGhhcyhfY3VycmVudFtcIih1c2FnZXMpXCJdLCBsYWJlbE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgdmFyIHVzYWdlID0gX2N1cnJlbnRbXCIodXNhZ2VzKVwiXVtsYWJlbE5hbWVdO1xuICAgICAgICAgICAgICAgIC8vIGlmIGl0cyBpbiBhIHN1YiBmdW5jdGlvbiBpdCBpcyBub3QgbmVjZXNzYXJpbHkgYW4gZXJyb3IsIGp1c3QgbGF0ZWRlZlxuICAgICAgICAgICAgICAgIGlmICh1c2FnZVtcIihvbmx5VXNlZFN1YkZ1bmN0aW9uKVwiXSkge1xuICAgICAgICAgICAgICAgICAgICBfbGF0ZWRlZldhcm5pbmcodHlwZSwgbGFiZWxOYW1lLCB0b2tlbik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhpcyBpcyBhIGNsZWFyIGlsbGVnYWwgdXNhZ2UgZm9yIGJsb2NrIHNjb3BlZCB2YXJpYWJsZXNcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIkUwNTZcIiwgdG9rZW4sIGxhYmVsTmFtZSwgdHlwZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHZhbGlkYXRlUGFyYW1zOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIC8vIFRoaXMgbWV0aG9kIG9ubHkgY29uY2VybnMgZXJyb3JzIGZvciBmdW5jdGlvbiBwYXJhbWV0ZXJzXG4gICAgICAgICAgICBpZiAoX2N1cnJlbnRGdW5jdEJvZHlbXCIodHlwZSlcIl0gPT09IFwiZ2xvYmFsXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBpc1N0cmljdCA9IHN0YXRlLmlzU3RyaWN0KCk7XG4gICAgICAgICAgICB2YXIgY3VycmVudEZ1bmN0UGFyYW1TY29wZSA9IF9jdXJyZW50RnVuY3RCb2R5W1wiKHBhcmVudClcIl07XG5cbiAgICAgICAgICAgIGlmICghY3VycmVudEZ1bmN0UGFyYW1TY29wZVtcIihwYXJhbXMpXCJdKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjdXJyZW50RnVuY3RQYXJhbVNjb3BlW1wiKHBhcmFtcylcIl0uZm9yRWFjaChmdW5jdGlvbihsYWJlbE5hbWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgbGFiZWwgPSBjdXJyZW50RnVuY3RQYXJhbVNjb3BlW1wiKGxhYmVscylcIl1bbGFiZWxOYW1lXTtcblxuICAgICAgICAgICAgICAgIGlmIChsYWJlbCAmJiBsYWJlbC5kdXBsaWNhdGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc1N0cmljdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIkUwMTFcIiwgbGFiZWxbXCIodG9rZW4pXCJdLCBsYWJlbE5hbWUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLm9wdGlvbi5zaGFkb3cgIT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDA0XCIsIGxhYmVsW1wiKHRva2VuKVwiXSwgbGFiZWxOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuXG4gICAgICAgIGdldFVzZWRPckRlZmluZWRHbG9iYWxzOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIC8vIGpzaGludCBwcm90bzogdHJ1ZVxuICAgICAgICAgICAgdmFyIGxpc3QgPSBPYmplY3Qua2V5cyh1c2VkUHJlZGVmaW5lZEFuZEdsb2JhbHMpO1xuXG4gICAgICAgICAgICAvLyBJZiBgX19wcm90b19fYCBpcyB1c2VkIGFzIGEgZ2xvYmFsIHZhcmlhYmxlIG5hbWUsIGl0cyBlbnRyeSBpbiB0aGVcbiAgICAgICAgICAgIC8vIGxvb2t1cCB0YWJsZSBtYXkgbm90IGJlIGVudW1lcmF0ZWQgYnkgYE9iamVjdC5rZXlzYCAoZGVwZW5kaW5nIG9uIHRoZVxuICAgICAgICAgICAgLy8gZW52aXJvbm1lbnQpLlxuICAgICAgICAgICAgaWYgKHVzZWRQcmVkZWZpbmVkQW5kR2xvYmFscy5fX3Byb3RvX18gPT09IG1hcmtlciAmJlxuICAgICAgICAgICAgICAgIGxpc3QuaW5kZXhPZihcIl9fcHJvdG9fX1wiKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICBsaXN0LnB1c2goXCJfX3Byb3RvX19cIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBsaXN0O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBHZXRzIGFuIGFycmF5IG9mIGltcGxpZWQgZ2xvYmFsc1xuICAgICAgICAgKiBAcmV0dXJucyB7QXJyYXkuPHsgbmFtZTogc3RyaW5nLCBsaW5lOiBBcnJheS48bnVtYmVyPn0+fVxuICAgICAgICAgKi9cbiAgICAgICAgZ2V0SW1wbGllZEdsb2JhbHM6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgLy8ganNoaW50IHByb3RvOiB0cnVlXG4gICAgICAgICAgICB2YXIgdmFsdWVzID0gdmFsdWVzKGltcGxpZWRHbG9iYWxzKTtcbiAgICAgICAgICAgIHZhciBoYXNQcm90byA9IGZhbHNlO1xuXG4gICAgICAgICAgICAvLyBJZiBgX19wcm90b19fYCBpcyBhbiBpbXBsaWVkIGdsb2JhbCB2YXJpYWJsZSwgaXRzIGVudHJ5IGluIHRoZSBsb29rdXBcbiAgICAgICAgICAgIC8vIHRhYmxlIG1heSBub3QgYmUgZW51bWVyYXRlZCBieSBgXy52YWx1ZXNgIChkZXBlbmRpbmcgb24gdGhlXG4gICAgICAgICAgICAvLyBlbnZpcm9ubWVudCkuXG4gICAgICAgICAgICBpZiAoaW1wbGllZEdsb2JhbHMuX19wcm90b19fKSB7XG4gICAgICAgICAgICAgICAgaGFzUHJvdG8gPSB2YWx1ZXMuc29tZShmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUubmFtZSA9PT0gXCJfX3Byb3RvX19cIjtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGlmICghaGFzUHJvdG8pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goaW1wbGllZEdsb2JhbHMuX19wcm90b19fKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB2YWx1ZXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJldHVybnMgYSBsaXN0IG9mIHVudXNlZCB2YXJpYWJsZXNcbiAgICAgICAgICogQHJldHVybnMge0FycmF5fVxuICAgICAgICAgKi9cbiAgICAgICAgZ2V0VW51c2VkczogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gdW51c2VkcztcbiAgICAgICAgfSxcblxuICAgICAgICBoYXM6IGZ1bmN0aW9uKGxhYmVsTmFtZSwgdW51c2VkPykge1xuICAgICAgICAgICAgcmV0dXJuIEJvb2xlYW4oX2dldExhYmVsKGxhYmVsTmFtZSkpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGxhYmVsdHlwZTogZnVuY3Rpb24obGFiZWxOYW1lKSB7XG4gICAgICAgICAgICAvLyByZXR1cm5zIGEgbGFiZWxzIHR5cGUgb3IgbnVsbCBpZiBub3QgcHJlc2VudFxuICAgICAgICAgICAgdmFyIHNjb3BlTGFiZWxzID0gX2dldExhYmVsKGxhYmVsTmFtZSk7XG4gICAgICAgICAgICBpZiAoc2NvcGVMYWJlbHMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGVMYWJlbHNbbGFiZWxOYW1lXVtcIih0eXBlKVwiXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBmb3IgdGhlIGV4cG9ydGVkIG9wdGlvbnMsIGluZGljYXRpbmcgYSB2YXJpYWJsZSBpcyB1c2VkIG91dHNpZGUgdGhlIGZpbGVcbiAgICAgICAgICovXG4gICAgICAgIGFkZEV4cG9ydGVkOiBmdW5jdGlvbihsYWJlbE5hbWUpIHtcbiAgICAgICAgICAgIHZhciBnbG9iYWxMYWJlbHMgPSBfc2NvcGVTdGFja1swXVtcIihsYWJlbHMpXCJdO1xuICAgICAgICAgICAgaWYgKGhhcyhkZWNsYXJlZCwgbGFiZWxOYW1lKSkge1xuICAgICAgICAgICAgICAgIC8vIHJlbW92ZSB0aGUgZGVjbGFyZWQgdG9rZW4sIHNvIHdlIGtub3cgaXQgaXMgdXNlZFxuICAgICAgICAgICAgICAgIGRlbGV0ZSBkZWNsYXJlZFtsYWJlbE5hbWVdO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChoYXMoZ2xvYmFsTGFiZWxzLCBsYWJlbE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgZ2xvYmFsTGFiZWxzW2xhYmVsTmFtZV1bXCIodW51c2VkKVwiXSA9IGZhbHNlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IF9zY29wZVN0YWNrLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzY29wZSA9IF9zY29wZVN0YWNrW2ldO1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiBgc2NvcGUuKHR5cGUpYCBpcyBub3QgZGVmaW5lZCwgaXQgaXMgYSBibG9jayBzY29wZVxuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjb3BlW1wiKHR5cGUpXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGFzKHNjb3BlW1wiKGxhYmVscylcIl0sIGxhYmVsTmFtZSkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAhc2NvcGVbXCIobGFiZWxzKVwiXVtsYWJlbE5hbWVdW1wiKGJsb2Nrc2NvcGVkKVwiXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlW1wiKGxhYmVscylcIl1bbGFiZWxOYW1lXVtcIih1bnVzZWQpXCJdID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZXhwb3J0ZWRbbGFiZWxOYW1lXSA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIE1hcmsgYW4gaW5kZW50aWZpZXIgYXMgZXM2IG1vZHVsZSBleHBvcnRlZFxuICAgICAgICAgKi9cbiAgICAgICAgc2V0RXhwb3J0ZWQ6IGZ1bmN0aW9uKGxhYmVsTmFtZSwgdG9rZW4pIHtcbiAgICAgICAgICAgIHRoaXMuYmxvY2sudXNlKGxhYmVsTmFtZSwgdG9rZW4pO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBhZGRzIGFuIGluZGVudGlmaWVyIHRvIHRoZSByZWxldmFudCBjdXJyZW50IHNjb3BlIGFuZCBjcmVhdGVzIHdhcm5pbmdzL2Vycm9ycyBhcyBuZWNlc3NhcnlcbiAgICAgICAgICogQHBhcmFtIHtzdHJpbmd9IGxhYmVsTmFtZVxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0c1xuICAgICAgICAgKiBAcGFyYW0ge1N0cmluZ30gb3B0cy50eXBlIC0gdGhlIHR5cGUgb2YgdGhlIGxhYmVsIGUuZy4gXCJwYXJhbVwiLCBcInZhclwiLCBcImxldCwgXCJjb25zdFwiLCBcImZ1bmN0aW9uXCJcbiAgICAgICAgICogQHBhcmFtIHtUb2tlbn0gb3B0cy50b2tlbiAtIHRoZSB0b2tlbiBwb2ludGluZyBhdCB0aGUgZGVjbGFyYXRpb25cbiAgICAgICAgICovXG4gICAgICAgIGFkZGxhYmVsOiBmdW5jdGlvbihsYWJlbE5hbWUsIG9wdHMpIHtcblxuICAgICAgICAgICAgdmFyIHR5cGUgPSBvcHRzLnR5cGU7XG4gICAgICAgICAgICB2YXIgdG9rZW4gPSBvcHRzLnRva2VuO1xuICAgICAgICAgICAgdmFyIGlzYmxvY2tzY29wZWQgPSB0eXBlID09PSBcImxldFwiIHx8IHR5cGUgPT09IFwiY29uc3RcIiB8fCB0eXBlID09PSBcImNsYXNzXCI7XG4gICAgICAgICAgICB2YXIgaXNleHBvcnRlZCA9IChpc2Jsb2Nrc2NvcGVkID8gX2N1cnJlbnQgOiBfY3VycmVudEZ1bmN0Qm9keSlbXCIodHlwZSlcIl0gPT09IFwiZ2xvYmFsXCIgJiZcbiAgICAgICAgICAgICAgICBoYXMoZXhwb3J0ZWQsIGxhYmVsTmFtZSk7XG5cbiAgICAgICAgICAgIC8vIG91dGVyIHNoYWRvdyBjaGVjayAoaW5uZXIgaXMgb25seSBvbiBub24tYmxvY2sgc2NvcGVkKVxuICAgICAgICAgICAgX2NoZWNrT3V0ZXJTaGFkb3cobGFiZWxOYW1lLCB0b2tlbiwgdHlwZSk7XG5cbiAgICAgICAgICAgIC8vIGlmIGlzIGJsb2NrIHNjb3BlZCAobGV0IG9yIGNvbnN0KVxuICAgICAgICAgICAgaWYgKGlzYmxvY2tzY29wZWQpIHtcblxuICAgICAgICAgICAgICAgIHZhciBkZWNsYXJlZEluQ3VycmVudFNjb3BlID0gX2N1cnJlbnRbXCIobGFiZWxzKVwiXVtsYWJlbE5hbWVdO1xuICAgICAgICAgICAgICAgIC8vIGZvciBibG9jayBzY29wZWQgdmFyaWFibGVzLCBwYXJhbXMgYXJlIHNlZW4gaW4gdGhlIGN1cnJlbnQgc2NvcGUgYXMgdGhlIHJvb3QgZnVuY3Rpb25cbiAgICAgICAgICAgICAgICAvLyBzY29wZSwgc28gY2hlY2sgdGhlc2UgdG9vLlxuICAgICAgICAgICAgICAgIGlmICghZGVjbGFyZWRJbkN1cnJlbnRTY29wZSAmJiBfY3VycmVudCA9PT0gX2N1cnJlbnRGdW5jdEJvZHkgJiZcbiAgICAgICAgICAgICAgICAgICAgX2N1cnJlbnRbXCIodHlwZSlcIl0gIT09IFwiZ2xvYmFsXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVjbGFyZWRJbkN1cnJlbnRTY29wZSA9ICEhX2N1cnJlbnRGdW5jdEJvZHlbXCIocGFyZW50KVwiXVtcIihsYWJlbHMpXCJdW2xhYmVsTmFtZV07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gaWYgaXRzIG5vdCBhbHJlYWR5IGRlZmluZWQgKHdoaWNoIGlzIGFuIGVycm9yLCBzbyBpZ25vcmUpIGFuZCBpcyB1c2VkIGluIFREWlxuICAgICAgICAgICAgICAgIGlmICghZGVjbGFyZWRJbkN1cnJlbnRTY29wZSAmJiBfY3VycmVudFtcIih1c2FnZXMpXCJdW2xhYmVsTmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHVzYWdlID0gX2N1cnJlbnRbXCIodXNhZ2VzKVwiXVtsYWJlbE5hbWVdO1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiBpdHMgaW4gYSBzdWIgZnVuY3Rpb24gaXQgaXMgbm90IG5lY2Vzc2FyaWx5IGFuIGVycm9yLCBqdXN0IGxhdGVkZWZcbiAgICAgICAgICAgICAgICAgICAgaWYgKHVzYWdlW1wiKG9ubHlVc2VkU3ViRnVuY3Rpb24pXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBfbGF0ZWRlZldhcm5pbmcodHlwZSwgbGFiZWxOYW1lLCB0b2tlbik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGlzIGlzIGEgY2xlYXIgaWxsZWdhbCB1c2FnZSBmb3IgYmxvY2sgc2NvcGVkIHZhcmlhYmxlc1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIkUwNTZcIiwgdG9rZW4sIGxhYmVsTmFtZSwgdHlwZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBpZiB0aGlzIHNjb3BlIGhhcyB0aGUgdmFyaWFibGUgZGVmaW5lZCwgaXRzIGEgcmUtZGVmaW5pdGlvbiBlcnJvclxuICAgICAgICAgICAgICAgIGlmIChkZWNsYXJlZEluQ3VycmVudFNjb3BlKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJFMDExXCIsIHRva2VuLCBsYWJlbE5hbWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzdGF0ZS5vcHRpb24uc2hhZG93ID09PSBcIm91dGVyXCIpIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyBpZiBzaGFkb3cgaXMgb3V0ZXIsIGZvciBibG9jayBzY29wZSB3ZSB3YW50IHRvIGRldGVjdCBhbnkgc2hhZG93aW5nIHdpdGhpbiB0aGlzIGZ1bmN0aW9uXG4gICAgICAgICAgICAgICAgICAgIGlmIChzY29wZU1hbmFnZXJJbnN0LmZ1bmN0LmhhcyhsYWJlbE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAwNFwiLCB0b2tlbiwgbGFiZWxOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHNjb3BlTWFuYWdlckluc3QuYmxvY2suYWRkKGxhYmVsTmFtZSwgdHlwZSwgdG9rZW4sICFpc2V4cG9ydGVkKTtcblxuICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgIHZhciBkZWNsYXJlZEluQ3VycmVudEZ1bmN0aW9uU2NvcGUgPSBzY29wZU1hbmFnZXJJbnN0LmZ1bmN0LmhhcyhsYWJlbE5hbWUpO1xuXG4gICAgICAgICAgICAgICAgLy8gY2hlY2sgZm9yIGxhdGUgZGVmaW5pdGlvbiwgaWdub3JlIGlmIGFscmVhZHkgZGVjbGFyZWRcbiAgICAgICAgICAgICAgICBpZiAoIWRlY2xhcmVkSW5DdXJyZW50RnVuY3Rpb25TY29wZSAmJiB1c2VkU29GYXJJbkN1cnJlbnRGdW5jdGlvbihsYWJlbE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIF9sYXRlZGVmV2FybmluZyh0eXBlLCBsYWJlbE5hbWUsIHRva2VuKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBkZWZpbmluZyB3aXRoIGEgdmFyIG9yIGEgZnVuY3Rpb24gd2hlbiBhIGJsb2NrIHNjb3BlIHZhcmlhYmxlIG9mIHRoZSBzYW1lIG5hbWVcbiAgICAgICAgICAgICAgICAvLyBpcyBpbiBzY29wZSBpcyBhbiBlcnJvclxuICAgICAgICAgICAgICAgIGlmIChzY29wZU1hbmFnZXJJbnN0LmZ1bmN0LmhhcyhsYWJlbE5hbWUsIHsgb25seUJsb2Nrc2NvcGVkOiB0cnVlIH0pKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJFMDExXCIsIHRva2VuLCBsYWJlbE5hbWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdGUub3B0aW9uLnNoYWRvdyAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBub3cgc2luY2Ugd2UgZGlkbid0IGdldCBhbnkgYmxvY2sgc2NvcGUgdmFyaWFibGVzLCB0ZXN0IGZvciB2YXIvZnVuY3Rpb25cbiAgICAgICAgICAgICAgICAgICAgLy8gc2hhZG93aW5nXG4gICAgICAgICAgICAgICAgICAgIGlmIChkZWNsYXJlZEluQ3VycmVudEZ1bmN0aW9uU2NvcGUgJiYgbGFiZWxOYW1lICE9PSBcIl9fcHJvdG9fX1wiKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vanNoaW50L2pzaGludC9pc3N1ZXMvMjQwMFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKF9jdXJyZW50RnVuY3RCb2R5W1wiKHR5cGUpXCJdICE9PSBcImdsb2JhbFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMDRcIiwgdG9rZW4sIGxhYmVsTmFtZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzY29wZU1hbmFnZXJJbnN0LmZ1bmN0LmFkZChsYWJlbE5hbWUsIHR5cGUsIHRva2VuLCAhaXNleHBvcnRlZCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoX2N1cnJlbnRGdW5jdEJvZHlbXCIodHlwZSlcIl0gPT09IFwiZ2xvYmFsXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdXNlZFByZWRlZmluZWRBbmRHbG9iYWxzW2xhYmVsTmFtZV0gPSBtYXJrZXI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGZ1bmN0OiB7XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIFJldHVybnMgdGhlIGxhYmVsIHR5cGUgZ2l2ZW4gY2VydGFpbiBvcHRpb25zXG4gICAgICAgICAgICAgKiBAcGFyYW0gbGFiZWxOYW1lXG4gICAgICAgICAgICAgKiBAcGFyYW0ge09iamVjdD19IG9wdGlvbnNcbiAgICAgICAgICAgICAqIEBwYXJhbSB7Qm9vbGVhbj19IG9wdGlvbnMub25seUJsb2Nrc2NvcGVkIC0gb25seSBpbmNsdWRlIGJsb2NrIHNjb3BlZCBsYWJlbHNcbiAgICAgICAgICAgICAqIEBwYXJhbSB7Qm9vbGVhbj19IG9wdGlvbnMuZXhjbHVkZVBhcmFtcyAtIGV4Y2x1ZGUgdGhlIHBhcmFtIHNjb3BlXG4gICAgICAgICAgICAgKiBAcGFyYW0ge0Jvb2xlYW49fSBvcHRpb25zLmV4Y2x1ZGVDdXJyZW50IC0gZXhjbHVkZSB0aGUgY3VycmVudCBzY29wZVxuICAgICAgICAgICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgbGFiZWx0eXBlOiBmdW5jdGlvbihsYWJlbE5hbWUsIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICB2YXIgb25seUJsb2Nrc2NvcGVkID0gb3B0aW9ucyAmJiBvcHRpb25zLm9ubHlCbG9ja3Njb3BlZDtcbiAgICAgICAgICAgICAgICB2YXIgZXhjbHVkZVBhcmFtcyA9IG9wdGlvbnMgJiYgb3B0aW9ucy5leGNsdWRlUGFyYW1zO1xuICAgICAgICAgICAgICAgIHZhciBjdXJyZW50U2NvcGVJbmRleCA9IF9zY29wZVN0YWNrLmxlbmd0aCAtIChvcHRpb25zICYmIG9wdGlvbnMuZXhjbHVkZUN1cnJlbnQgPyAyIDogMSk7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IGN1cnJlbnRTY29wZUluZGV4OyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY3VycmVudCA9IF9zY29wZVN0YWNrW2ldO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudFtcIihsYWJlbHMpXCJdW2xhYmVsTmFtZV0gJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICghb25seUJsb2Nrc2NvcGVkIHx8IGN1cnJlbnRbXCIobGFiZWxzKVwiXVtsYWJlbE5hbWVdW1wiKGJsb2Nrc2NvcGVkKVwiXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjdXJyZW50W1wiKGxhYmVscylcIl1bbGFiZWxOYW1lXVtcIih0eXBlKVwiXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB2YXIgc2NvcGVDaGVjayA9IGV4Y2x1ZGVQYXJhbXMgPyBfc2NvcGVTdGFja1tpIC0gMV0gOiBjdXJyZW50O1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2NvcGVDaGVjayAmJiBzY29wZUNoZWNrW1wiKHR5cGUpXCJdID09PSBcImZ1bmN0aW9ucGFyYW1zXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogUmV0dXJucyBpZiBhIGJyZWFrIGxhYmVsIGV4aXN0cyBpbiB0aGUgZnVuY3Rpb24gc2NvcGVcbiAgICAgICAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSBsYWJlbE5hbWVcbiAgICAgICAgICAgICAqIEByZXR1cm5zIHtib29sZWFufVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBoYXNCcmVha0xhYmVsOiBmdW5jdGlvbihsYWJlbE5hbWUpIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gX3Njb3BlU3RhY2subGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGN1cnJlbnQgPSBfc2NvcGVTdGFja1tpXTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudFtcIihicmVha0xhYmVscylcIl1bbGFiZWxOYW1lXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKGN1cnJlbnRbXCIodHlwZSlcIl0gPT09IFwiZnVuY3Rpb25wYXJhbXNcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIFJldHVybnMgaWYgdGhlIGxhYmVsIGlzIGluIHRoZSBjdXJyZW50IGZ1bmN0aW9uIHNjb3BlXG4gICAgICAgICAgICAgKiBTZWUgc2NvcGVNYW5hZ2VyLmZ1bmN0LmxhYmVsVHlwZSBmb3Igb3B0aW9uc1xuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBoYXM6IGZ1bmN0aW9uKGxhYmVsTmFtZTogc3RyaW5nLCBvcHRpb25zPykge1xuICAgICAgICAgICAgICAgIHJldHVybiBCb29sZWFuKHRoaXMubGFiZWx0eXBlKGxhYmVsTmFtZSwgb3B0aW9ucykpO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBBZGRzIGEgbmV3IGZ1bmN0aW9uIHNjb3BlZCB2YXJpYWJsZVxuICAgICAgICAgICAgICogc2VlIGJsb2NrLmFkZCBmb3IgYmxvY2sgc2NvcGVkXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIGFkZDogZnVuY3Rpb24obGFiZWxOYW1lLCB0eXBlLCB0b2ssIHVudXNlZCkge1xuICAgICAgICAgICAgICAgIF9jdXJyZW50W1wiKGxhYmVscylcIl1bbGFiZWxOYW1lXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCIodHlwZSlcIjogdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgXCIodG9rZW4pXCI6IHRvayxcbiAgICAgICAgICAgICAgICAgICAgXCIoYmxvY2tzY29wZWQpXCI6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBcIihmdW5jdGlvbilcIjogX2N1cnJlbnRGdW5jdEJvZHksXG4gICAgICAgICAgICAgICAgICAgIFwiKHVudXNlZClcIjogdW51c2VkXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBibG9jazoge1xuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIGlzIHRoZSBjdXJyZW50IGJsb2NrIGdsb2JhbD9cbiAgICAgICAgICAgICAqIEByZXR1cm5zIEJvb2xlYW5cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgaXNHbG9iYWw6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBfY3VycmVudFtcIih0eXBlKVwiXSA9PT0gXCJnbG9iYWxcIjtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHVzZTogZnVuY3Rpb24obGFiZWxOYW1lLCB0b2tlbikge1xuXG4gICAgICAgICAgICAgICAgLy8gaWYgcmVzb2x2ZXMgdG8gY3VycmVudCBmdW5jdGlvbiBwYXJhbXMsIHRoZW4gZG8gbm90IHN0b3JlIHVzYWdlIGp1c3QgcmVzb2x2ZVxuICAgICAgICAgICAgICAgIC8vIHRoaXMgaXMgYmVjYXVzZSBmdW5jdGlvbihhKSB7IHZhciBhOyBhID0gYTsgfSB3aWxsIHJlc29sdmUgdG8gdGhlIHBhcmFtLCBub3RcbiAgICAgICAgICAgICAgICAvLyB0byB0aGUgdW5zZXQgdmFyXG4gICAgICAgICAgICAgICAgLy8gZmlyc3QgY2hlY2sgdGhlIHBhcmFtIGlzIHVzZWRcbiAgICAgICAgICAgICAgICB2YXIgcGFyYW1TY29wZSA9IF9jdXJyZW50RnVuY3RCb2R5W1wiKHBhcmVudClcIl07XG4gICAgICAgICAgICAgICAgaWYgKHBhcmFtU2NvcGUgJiYgcGFyYW1TY29wZVtcIihsYWJlbHMpXCJdW2xhYmVsTmFtZV0gJiZcbiAgICAgICAgICAgICAgICAgICAgcGFyYW1TY29wZVtcIihsYWJlbHMpXCJdW2xhYmVsTmFtZV1bXCIodHlwZSlcIl0gPT09IFwicGFyYW1cIikge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoZW4gY2hlY2sgaXRzIG5vdCBkZWNsYXJlZCBieSBhIGJsb2NrIHNjb3BlIHZhcmlhYmxlXG4gICAgICAgICAgICAgICAgICAgIGlmICghc2NvcGVNYW5hZ2VySW5zdC5mdW5jdC5oYXMobGFiZWxOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgeyBleGNsdWRlUGFyYW1zOiB0cnVlLCBvbmx5QmxvY2tzY29wZWQ6IHRydWUgfSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtU2NvcGVbXCIobGFiZWxzKVwiXVtsYWJlbE5hbWVdW1wiKHVudXNlZClcIl0gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh0b2tlbiAmJiAoc3RhdGUuaWdub3JlZC5XMTE3IHx8IHN0YXRlLm9wdGlvbi51bmRlZiA9PT0gZmFsc2UpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuLmlnbm9yZVVuZGVmID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBfc2V0dXBVc2FnZXMobGFiZWxOYW1lKTtcblxuICAgICAgICAgICAgICAgIGlmICh0b2tlbikge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbltcIihmdW5jdGlvbilcIl0gPSBfY3VycmVudEZ1bmN0Qm9keTtcbiAgICAgICAgICAgICAgICAgICAgX2N1cnJlbnRbXCIodXNhZ2VzKVwiXVtsYWJlbE5hbWVdW1wiKHRva2VucylcIl0ucHVzaCh0b2tlbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgcmVhc3NpZ246IGZ1bmN0aW9uKGxhYmVsTmFtZSwgdG9rZW4pIHtcbiAgICAgICAgICAgICAgICB0b2tlbi5pZ25vcmVXMDIwID0gc3RhdGUuaWdub3JlZC5XMDIwO1xuICAgICAgICAgICAgICAgIHRva2VuLmlnbm9yZVcwMjEgPSBzdGF0ZS5pZ25vcmVkLlcwMjE7XG5cbiAgICAgICAgICAgICAgICB0aGlzLm1vZGlmeShsYWJlbE5hbWUsIHRva2VuKTtcblxuICAgICAgICAgICAgICAgIF9jdXJyZW50W1wiKHVzYWdlcylcIl1bbGFiZWxOYW1lXVtcIihyZWFzc2lnbmVkKVwiXS5wdXNoKHRva2VuKTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIG1vZGlmeTogZnVuY3Rpb24obGFiZWxOYW1lLCB0b2tlbikge1xuXG4gICAgICAgICAgICAgICAgX3NldHVwVXNhZ2VzKGxhYmVsTmFtZSk7XG5cbiAgICAgICAgICAgICAgICBfY3VycmVudFtcIih1c2FnZXMpXCJdW2xhYmVsTmFtZV1bXCIobW9kaWZpZWQpXCJdLnB1c2godG9rZW4pO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBBZGRzIGEgbmV3IHZhcmlhYmxlXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIGFkZDogZnVuY3Rpb24obGFiZWxOYW1lLCB0eXBlLCB0b2ssIHVudXNlZCkge1xuICAgICAgICAgICAgICAgIF9jdXJyZW50W1wiKGxhYmVscylcIl1bbGFiZWxOYW1lXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCIodHlwZSlcIjogdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgXCIodG9rZW4pXCI6IHRvayxcbiAgICAgICAgICAgICAgICAgICAgXCIoYmxvY2tzY29wZWQpXCI6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIFwiKHVudXNlZClcIjogdW51c2VkXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIGFkZEJyZWFrTGFiZWw6IGZ1bmN0aW9uKGxhYmVsTmFtZSwgb3B0cykge1xuICAgICAgICAgICAgICAgIHZhciB0b2tlbiA9IG9wdHMudG9rZW47XG4gICAgICAgICAgICAgICAgaWYgKHNjb3BlTWFuYWdlckluc3QuZnVuY3QuaGFzQnJlYWtMYWJlbChsYWJlbE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJFMDExXCIsIHRva2VuLCBsYWJlbE5hbWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzdGF0ZS5vcHRpb24uc2hhZG93ID09PSBcIm91dGVyXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNjb3BlTWFuYWdlckluc3QuZnVuY3QuaGFzKGxhYmVsTmFtZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDA0XCIsIHRva2VuLCBsYWJlbE5hbWUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgX2NoZWNrT3V0ZXJTaGFkb3cobGFiZWxOYW1lLCB0b2tlbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgX2N1cnJlbnRbXCIoYnJlYWtMYWJlbHMpXCJdW2xhYmVsTmFtZV0gPSB0b2tlbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIHNjb3BlTWFuYWdlckluc3Q7XG59O1xuIl19