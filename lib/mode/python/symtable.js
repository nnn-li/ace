var astnodes = require('./astnodes');
var base = require('./base');
var asserts = require('./asserts');
var DEF_GLOBAL = 1;
var DEF_LOCAL = 2;
var DEF_PARAM = 2 << 1;
var USE = 2 << 2;
var DEF_STAR = 2 << 3;
var DEF_DOUBLESTAR = 2 << 4;
var DEF_INTUPLE = 2 << 5;
var DEF_FREE = 2 << 6;
var DEF_FREE_GLOBAL = 2 << 7;
var DEF_FREE_CLASS = 2 << 8;
var DEF_IMPORT = 2 << 9;
var DEF_BOUND = (DEF_LOCAL | DEF_PARAM | DEF_IMPORT);
var SCOPE_OFF = 11;
var SCOPE_MASK = 7;
exports.LOCAL = 1;
exports.GLOBAL_EXPLICIT = 2;
exports.GLOBAL_IMPLICIT = 3;
exports.FREE = 4;
exports.CELL = 5;
var OPT_IMPORT_STAR = 1;
var OPT_EXEC = 2;
var OPT_BARE_EXEC = 4;
var OPT_TOPLEVEL = 8;
var GENERATOR = 2;
var GENERATOR_EXPRESSION = 2;
var ModuleBlock = 'module';
exports.FunctionBlock = 'function';
var ClassBlock = 'class';
function syntaxError(message, fileName, lineNumber) {
    asserts.assert(base.isString(message), "message must be a string");
    asserts.assert(base.isString(fileName), "fileName must be a string");
    if (base.isDef(lineNumber)) {
        asserts.assert(base.isNumber(lineNumber), "lineNumber must be a number");
    }
    var e = new SyntaxError(message);
    e['fileName'] = fileName;
    if (typeof lineNumber === 'number') {
        e['lineNumber'] = lineNumber;
    }
    return e;
}
function mangleName(priv, name) {
    var strpriv = null;
    if (priv === null || name === null || name.charAt(0) !== '_' || name.charAt(1) !== '_')
        return name;
    if (name.charAt(name.length - 1) === '_' && name.charAt(name.length - 2) === '_')
        return name;
    strpriv = priv;
    strpriv.replace(/_/g, '');
    if (strpriv === '')
        return name;
    strpriv = priv;
    strpriv.replace(/^_*/, '');
    strpriv = '_' + strpriv + name;
    return strpriv;
}
exports.mangleName = mangleName;
var Symbol = (function () {
    function Symbol(name, flags, namespaces) {
        this.__name = name;
        this.__flags = flags;
        this.__scope = (flags >> SCOPE_OFF) & SCOPE_MASK;
        this.__namespaces = namespaces || [];
    }
    Symbol.prototype.get_name = function () {
        return this.__name;
    };
    Symbol.prototype.is_referenced = function () {
        return !!(this.__flags & USE);
    };
    Symbol.prototype.is_parameter = function () {
        return !!(this.__flags & DEF_PARAM);
    };
    Symbol.prototype.is_global = function () {
        return this.__scope === exports.GLOBAL_IMPLICIT || this.__scope == exports.GLOBAL_EXPLICIT;
    };
    Symbol.prototype.is_declared_global = function () {
        return this.__scope == exports.GLOBAL_EXPLICIT;
    };
    Symbol.prototype.is_local = function () {
        return !!(this.__flags & DEF_BOUND);
    };
    Symbol.prototype.is_free = function () {
        return this.__scope == exports.FREE;
    };
    Symbol.prototype.is_imported = function () {
        return !!(this.__flags & DEF_IMPORT);
    };
    Symbol.prototype.is_assigned = function () {
        return !!(this.__flags & DEF_LOCAL);
    };
    Symbol.prototype.is_namespace = function () {
        return this.__namespaces && this.__namespaces.length > 0;
    };
    Symbol.prototype.get_namespaces = function () {
        return this.__namespaces;
    };
    return Symbol;
})();
var astScopeCounter = 0;
var SymbolTableScope = (function () {
    function SymbolTableScope(table, name, type, ast, lineno) {
        this.symFlags = {};
        this.name = name;
        this.varnames = [];
        this.children = [];
        this.blockType = type;
        this.isNested = false;
        this.hasFree = false;
        this.childHasFree = false;
        this.generator = false;
        this.varargs = false;
        this.varkeywords = false;
        this.returnsValue = false;
        this.lineno = lineno;
        this.table = table;
        if (table.cur && (table.cur.is_nested() || table.cur.blockType === exports.FunctionBlock))
            this.isNested = true;
        ast.scopeId = astScopeCounter++;
        table.stss[ast.scopeId] = this;
        this.symbols = {};
    }
    SymbolTableScope.prototype.get_type = function () {
        return this.blockType;
    };
    SymbolTableScope.prototype.get_name = function () {
        return this.name;
    };
    SymbolTableScope.prototype.get_lineno = function () {
        return this.lineno;
    };
    SymbolTableScope.prototype.is_nested = function () {
        return this.isNested;
    };
    SymbolTableScope.prototype.has_children = function () {
        return this.children.length > 0;
    };
    SymbolTableScope.prototype.get_identifiers = function () {
        return this._identsMatching(function (x) { return true; });
    };
    SymbolTableScope.prototype.lookup = function (name) {
        var sym;
        if (!this.symbols.hasOwnProperty(name)) {
            var flags = this.symFlags[name];
            var namespaces = this.__check_children(name);
            sym = this.symbols[name] = new Symbol(name, flags, namespaces);
        }
        else {
            sym = this.symbols[name];
        }
        return sym;
    };
    SymbolTableScope.prototype.__check_children = function (name) {
        var ret = [];
        for (var i = 0; i < this.children.length; ++i) {
            var child = this.children[i];
            if (child.name === name)
                ret.push(child);
        }
        return ret;
    };
    SymbolTableScope.prototype._identsMatching = function (f) {
        var ret = [];
        for (var k in this.symFlags) {
            if (this.symFlags.hasOwnProperty(k)) {
                if (f(this.symFlags[k]))
                    ret.push(k);
            }
        }
        ret.sort();
        return ret;
    };
    SymbolTableScope.prototype.get_parameters = function () {
        asserts.assert(this.get_type() == 'function', "get_parameters only valid for function scopes");
        if (!this._funcParams)
            this._funcParams = this._identsMatching(function (x) { return x & DEF_PARAM; });
        return this._funcParams;
    };
    SymbolTableScope.prototype.get_locals = function () {
        asserts.assert(this.get_type() == 'function', "get_locals only valid for function scopes");
        if (!this._funcLocals)
            this._funcLocals = this._identsMatching(function (x) { return x & DEF_BOUND; });
        return this._funcLocals;
    };
    SymbolTableScope.prototype.get_globals = function () {
        asserts.assert(this.get_type() == 'function', "get_globals only valid for function scopes");
        if (!this._funcGlobals) {
            this._funcGlobals = this._identsMatching(function (x) {
                var masked = (x >> SCOPE_OFF) & SCOPE_MASK;
                return masked == exports.GLOBAL_IMPLICIT || masked == exports.GLOBAL_EXPLICIT;
            });
        }
        return this._funcGlobals;
    };
    SymbolTableScope.prototype.get_frees = function () {
        asserts.assert(this.get_type() == 'function', "get_frees only valid for function scopes");
        if (!this._funcFrees) {
            this._funcFrees = this._identsMatching(function (x) {
                var masked = (x >> SCOPE_OFF) & SCOPE_MASK;
                return masked == exports.FREE;
            });
        }
        return this._funcFrees;
    };
    SymbolTableScope.prototype.get_methods = function () {
        asserts.assert(this.get_type() == 'class', "get_methods only valid for class scopes");
        if (!this._classMethods) {
            var all = [];
            for (var i = 0; i < this.children.length; ++i)
                all.push(this.children[i].name);
            all.sort();
            this._classMethods = all;
        }
        return this._classMethods;
    };
    SymbolTableScope.prototype.getScope = function (name) {
        var v = this.symFlags[name];
        if (v === undefined)
            return 0;
        return (v >> SCOPE_OFF) & SCOPE_MASK;
    };
    return SymbolTableScope;
})();
exports.SymbolTableScope = SymbolTableScope;
var SymbolTable = (function () {
    function SymbolTable(fileName) {
        this.cur = null;
        this.top = null;
        this.stack = [];
        this.global = null;
        this.curClass = null;
        this.tmpname = 0;
        this.stss = {};
        this.fileName = fileName;
    }
    SymbolTable.prototype.getStsForAst = function (ast) {
        asserts.assert(ast.scopeId !== undefined, "ast wasn't added to st?");
        var v = this.stss[ast.scopeId];
        asserts.assert(v !== undefined, "unknown sym tab entry");
        return v;
    };
    SymbolTable.prototype.SEQStmt = function (nodes) {
        var len = nodes.length;
        for (var i = 0; i < len; ++i) {
            var val = nodes[i];
            if (val)
                this.visitStmt(val);
        }
    };
    SymbolTable.prototype.SEQExpr = function (nodes) {
        var len = nodes.length;
        for (var i = 0; i < len; ++i) {
            var val = nodes[i];
            if (val)
                this.visitExpr(val);
        }
    };
    SymbolTable.prototype.enterBlock = function (name, blockType, ast, lineno) {
        var prev = null;
        if (this.cur) {
            prev = this.cur;
            this.stack.push(this.cur);
        }
        this.cur = new SymbolTableScope(this, name, blockType, ast, lineno);
        if (name === 'top') {
            this.global = this.cur.symFlags;
        }
        if (prev) {
            prev.children.push(this.cur);
        }
    };
    SymbolTable.prototype.exitBlock = function () {
        this.cur = null;
        if (this.stack.length > 0)
            this.cur = this.stack.pop();
    };
    SymbolTable.prototype.visitParams = function (args, toplevel) {
        for (var i = 0; i < args.length; ++i) {
            var arg = args[i];
            if (arg.constructor === astnodes.Name) {
                asserts.assert(arg.ctx === astnodes.Param || (arg.ctx === astnodes.Store && !toplevel));
                this.addDef(arg.id, DEF_PARAM, arg.lineno);
            }
            else {
                throw syntaxError("invalid expression in parameter list", this.fileName);
            }
        }
    };
    SymbolTable.prototype.visitArguments = function (a, lineno) {
        if (a.args)
            this.visitParams(a.args, true);
        if (a.vararg) {
            this.addDef(a.vararg, DEF_PARAM, lineno);
            this.cur.varargs = true;
        }
        if (a.kwarg) {
            this.addDef(a.kwarg, DEF_PARAM, lineno);
            this.cur.varkeywords = true;
        }
    };
    SymbolTable.prototype.newTmpname = function (lineno) {
        this.addDef("_[" + (++this.tmpname) + "]", DEF_LOCAL, lineno);
    };
    SymbolTable.prototype.addDef = function (name, flag, lineno) {
        var mangled = mangleName(this.curClass, name);
        var val = this.cur.symFlags[mangled];
        if (val !== undefined) {
            if ((flag & DEF_PARAM) && (val & DEF_PARAM)) {
                throw syntaxError("duplicate argument '" + name + "' in function definition", this.fileName, lineno);
            }
            val |= flag;
        }
        else {
            val = flag;
        }
        this.cur.symFlags[mangled] = val;
        if (flag & DEF_PARAM) {
            this.cur.varnames.push(mangled);
        }
        else if (flag & DEF_GLOBAL) {
            val = flag;
            var fromGlobal = this.global[mangled];
            if (fromGlobal !== undefined)
                val |= fromGlobal;
            this.global[mangled] = val;
        }
    };
    SymbolTable.prototype.visitSlice = function (s) {
        switch (s.constructor) {
            case astnodes.Slice:
                if (s.lower)
                    this.visitExpr(s.lower);
                if (s.upper)
                    this.visitExpr(s.upper);
                if (s.step)
                    this.visitExpr(s.step);
                break;
            case astnodes.ExtSlice:
                for (var i = 0; i < s.dims.length; ++i)
                    this.visitSlice(s.dims[i]);
                break;
            case astnodes.Index:
                this.visitExpr(s.value);
                break;
            case astnodes.Ellipsis:
                break;
        }
    };
    SymbolTable.prototype.visitStmt = function (s) {
        asserts.assert(s !== undefined, "visitStmt called with undefined");
        switch (s.constructor) {
            case astnodes.FunctionDef:
                this.addDef(s.name, DEF_LOCAL, s.lineno);
                if (s.args.defaults)
                    this.SEQExpr(s.args.defaults);
                if (s.decorator_list)
                    this.SEQExpr(s.decorator_list);
                this.enterBlock(s.name, exports.FunctionBlock, s, s.lineno);
                this.visitArguments(s.args, s.lineno);
                this.SEQStmt(s.body);
                this.exitBlock();
                break;
            case astnodes.ClassDef:
                this.addDef(s.name, DEF_LOCAL, s.lineno);
                this.SEQExpr(s.bases);
                if (s.decorator_list)
                    this.SEQExpr(s.decorator_list);
                this.enterBlock(s.name, ClassBlock, s, s.lineno);
                var tmp = this.curClass;
                this.curClass = s.name;
                this.SEQStmt(s.body);
                this.curClass = tmp;
                this.exitBlock();
                break;
            case astnodes.Return_:
                if (s.value) {
                    this.visitExpr(s.value);
                    this.cur.returnsValue = true;
                    if (this.cur.generator) {
                        throw syntaxError("'return' with argument inside generator", this.fileName);
                    }
                }
                break;
            case astnodes.Delete_:
                this.SEQExpr(s.targets);
                break;
            case astnodes.Assign:
                this.SEQExpr(s.targets);
                this.visitExpr(s.value);
                break;
            case astnodes.AugAssign:
                this.visitExpr(s.target);
                this.visitExpr(s.value);
                break;
            case astnodes.Print:
                if (s.dest)
                    this.visitExpr(s.dest);
                this.SEQExpr(s.values);
                break;
            case astnodes.For_:
                this.visitExpr(s.target);
                this.visitExpr(s.iter);
                this.SEQStmt(s.body);
                if (s.orelse)
                    this.SEQStmt(s.orelse);
                break;
            case astnodes.While_:
                this.visitExpr(s.test);
                this.SEQStmt(s.body);
                if (s.orelse)
                    this.SEQStmt(s.orelse);
                break;
            case astnodes.If_:
                this.visitExpr(s.test);
                this.SEQStmt(s.body);
                if (s.orelse)
                    this.SEQStmt(s.orelse);
                break;
            case astnodes.Raise:
                if (s.type) {
                    this.visitExpr(s.type);
                    if (s.inst) {
                        this.visitExpr(s.inst);
                        if (s.tback)
                            this.visitExpr(s.tback);
                    }
                }
                break;
            case astnodes.TryExcept:
                this.SEQStmt(s.body);
                this.SEQStmt(s.orelse);
                this.visitExcepthandlers(s.handlers);
                break;
            case astnodes.TryFinally:
                this.SEQStmt(s.body);
                this.SEQStmt(s.finalbody);
                break;
            case astnodes.Assert:
                this.visitExpr(s.test);
                if (s.msg)
                    this.visitExpr(s.msg);
                break;
            case astnodes.Import_:
            case astnodes.ImportFrom:
                this.visitAlias(s.names, s.lineno);
                break;
            case astnodes.Exec:
                this.visitExpr(s.body);
                if (s.globals) {
                    this.visitExpr(s.globals);
                    if (s.locals)
                        this.visitExpr(s.locals);
                }
                break;
            case astnodes.Global:
                var nameslen = s.names.length;
                for (var i = 0; i < nameslen; ++i) {
                    var name = mangleName(this.curClass, s.names[i]);
                    var cur = this.cur.symFlags[name];
                    if (cur & (DEF_LOCAL | USE)) {
                        if (cur & DEF_LOCAL) {
                            throw syntaxError("name '" + name + "' is assigned to before global declaration", this.fileName, s.lineno);
                        }
                        else {
                            throw syntaxError("name '" + name + "' is used prior to global declaration", this.fileName, s.lineno);
                        }
                    }
                    this.addDef(name, DEF_GLOBAL, s.lineno);
                }
                break;
            case astnodes.Expr:
                this.visitExpr(s.value);
                break;
            case astnodes.Pass:
            case astnodes.Break_:
            case astnodes.Continue_:
                break;
            case astnodes.With_:
                this.newTmpname(s.lineno);
                this.visitExpr(s.context_expr);
                if (s.optional_vars) {
                    this.newTmpname(s.lineno);
                    this.visitExpr(s.optional_vars);
                }
                this.SEQStmt(s.body);
                break;
            default:
                asserts.fail("Unhandled type " + s.constructor.name + " in visitStmt");
        }
    };
    SymbolTable.prototype.visitExpr = function (e) {
        asserts.assert(e !== undefined, "visitExpr called with undefined");
        switch (e.constructor) {
            case astnodes.BoolOp:
                this.SEQExpr(e.values);
                break;
            case astnodes.BinOp:
                this.visitExpr(e.left);
                this.visitExpr(e.right);
                break;
            case astnodes.UnaryOp:
                this.visitExpr(e.operand);
                break;
            case astnodes.Lambda:
                this.addDef("lambda", DEF_LOCAL, e.lineno);
                if (e.args.defaults)
                    this.SEQExpr(e.args.defaults);
                this.enterBlock("lambda", exports.FunctionBlock, e, e.lineno);
                this.visitArguments(e.args, e.lineno);
                this.visitExpr(e.body);
                this.exitBlock();
                break;
            case astnodes.IfExp:
                this.visitExpr(e.test);
                this.visitExpr(e.body);
                this.visitExpr(e.orelse);
                break;
            case astnodes.Dict:
                this.SEQExpr(e.keys);
                this.SEQExpr(e.values);
                break;
            case astnodes.ListComp:
                this.newTmpname(e.lineno);
                this.visitExpr(e.elt);
                this.visitComprehension(e.generators, 0);
                break;
            case astnodes.GeneratorExp:
                this.visitGenexp(e);
                break;
            case astnodes.Yield:
                if (e.value)
                    this.visitExpr(e.value);
                this.cur.generator = true;
                if (this.cur.returnsValue) {
                    throw syntaxError("'return' with argument inside generator", this.fileName);
                }
                break;
            case astnodes.Compare:
                this.visitExpr(e.left);
                this.SEQExpr(e.comparators);
                break;
            case astnodes.Call:
                this.visitExpr(e.func);
                this.SEQExpr(e.args);
                for (var i = 0; i < e.keywords.length; ++i)
                    this.visitExpr(e.keywords[i].value);
                if (e.starargs)
                    this.visitExpr(e.starargs);
                if (e.kwargs)
                    this.visitExpr(e.kwargs);
                break;
            case astnodes.Num:
            case astnodes.Str:
                break;
            case astnodes.Attribute:
                this.visitExpr(e.value);
                break;
            case astnodes.Subscript:
                this.visitExpr(e.value);
                this.visitSlice(e.slice);
                break;
            case astnodes.Name:
                this.addDef(e.id, e.ctx === astnodes.Load ? USE : DEF_LOCAL, e.lineno);
                break;
            case astnodes.List:
            case astnodes.Tuple:
                this.SEQExpr(e.elts);
                break;
            default:
                asserts.fail("Unhandled type " + e.constructor.name + " in visitExpr");
        }
    };
    SymbolTable.prototype.visitComprehension = function (lcs, startAt) {
        var len = lcs.length;
        for (var i = startAt; i < len; ++i) {
            var lc = lcs[i];
            this.visitExpr(lc.target);
            this.visitExpr(lc.iter);
            this.SEQExpr(lc.ifs);
        }
    };
    SymbolTable.prototype.visitAlias = function (names, lineno) {
        for (var i = 0; i < names.length; ++i) {
            var a = names[i];
            var name = a.asname === null ? a.name : a.asname;
            var storename = name;
            var dot = name.indexOf('.');
            if (dot !== -1)
                storename = name.substr(0, dot);
            if (name !== "*") {
                this.addDef(storename, DEF_IMPORT, lineno);
            }
            else {
                if (this.cur.blockType !== ModuleBlock) {
                    throw syntaxError("import * only allowed at module level", this.fileName);
                }
            }
        }
    };
    SymbolTable.prototype.visitGenexp = function (e) {
        var outermost = e.generators[0];
        this.visitExpr(outermost.iter);
        this.enterBlock("genexpr", exports.FunctionBlock, e, e.lineno);
        this.cur.generator = true;
        this.addDef(".0", DEF_PARAM, e.lineno);
        this.visitExpr(outermost.target);
        this.SEQExpr(outermost.ifs);
        this.visitComprehension(e.generators, 1);
        this.visitExpr(e.elt);
        this.exitBlock();
    };
    SymbolTable.prototype.visitExcepthandlers = function (handlers) {
        for (var i = 0, eh; eh = handlers[i]; ++i) {
            if (eh.type)
                this.visitExpr(eh.type);
            if (eh.name)
                this.visitExpr(eh.name);
            this.SEQStmt(eh.body);
        }
    };
    SymbolTable.prototype.analyzeBlock = function (ste, bound, free, global) {
        var local = {};
        var scope = {};
        var newglobal = {};
        var newbound = {};
        var newfree = {};
        if (ste.blockType == ClassBlock) {
            _dictUpdate(newglobal, global);
            if (bound)
                _dictUpdate(newbound, bound);
        }
        for (var name in ste.symFlags) {
            var flags = ste.symFlags[name];
            this.analyzeName(ste, scope, name, flags, bound, local, free, global);
        }
        if (ste.blockType !== ClassBlock) {
            if (ste.blockType === exports.FunctionBlock)
                _dictUpdate(newbound, local);
            if (bound)
                _dictUpdate(newbound, bound);
            _dictUpdate(newglobal, global);
        }
        var allfree = {};
        var childlen = ste.children.length;
        for (var i = 0; i < childlen; ++i) {
            var c = ste.children[i];
            this.analyzeChildBlock(c, newbound, newfree, newglobal, allfree);
            if (c.hasFree || c.childHasFree)
                ste.childHasFree = true;
        }
        _dictUpdate(newfree, allfree);
        if (ste.blockType === exports.FunctionBlock)
            this.analyzeCells(scope, newfree);
        this.updateSymbols(ste.symFlags, scope, bound, newfree, ste.blockType === ClassBlock);
        _dictUpdate(free, newfree);
    };
    SymbolTable.prototype.analyzeChildBlock = function (entry, bound, free, global, childFree) {
        var tempBound = {};
        _dictUpdate(tempBound, bound);
        var tempFree = {};
        _dictUpdate(tempFree, free);
        var tempGlobal = {};
        _dictUpdate(tempGlobal, global);
        this.analyzeBlock(entry, tempBound, tempFree, tempGlobal);
        _dictUpdate(childFree, tempFree);
    };
    SymbolTable.prototype.analyzeCells = function (scope, free) {
        for (var name in scope) {
            var flags = scope[name];
            if (flags !== exports.LOCAL)
                continue;
            if (free[name] === undefined)
                continue;
            scope[name] = exports.CELL;
            delete free[name];
        }
    };
    SymbolTable.prototype.updateSymbols = function (symbols, scope, bound, free, classflag) {
        for (var name in symbols) {
            var flags = symbols[name];
            var w = scope[name];
            flags |= w << SCOPE_OFF;
            symbols[name] = flags;
        }
        var freeValue = exports.FREE << SCOPE_OFF;
        var pos = 0;
        for (var name in free) {
            var o = symbols[name];
            if (o !== undefined) {
                if (classflag && (o & (DEF_BOUND | DEF_GLOBAL))) {
                    var i = o | DEF_FREE_CLASS;
                    symbols[name] = i;
                }
                continue;
            }
            if (bound[name] === undefined)
                continue;
            symbols[name] = freeValue;
        }
    };
    SymbolTable.prototype.analyzeName = function (ste, dict, name, flags, bound, local, free, global) {
        if (flags & DEF_GLOBAL) {
            if (flags & DEF_PARAM)
                throw syntaxError("name '" + name + "' is local and global", this.fileName, ste.lineno);
            dict[name] = exports.GLOBAL_EXPLICIT;
            global[name] = null;
            if (bound && bound[name] !== undefined)
                delete bound[name];
            return;
        }
        if (flags & DEF_BOUND) {
            dict[name] = exports.LOCAL;
            local[name] = null;
            delete global[name];
            return;
        }
        if (bound && bound[name] !== undefined) {
            dict[name] = exports.FREE;
            ste.hasFree = true;
            free[name] = null;
        }
        else if (global && global[name] !== undefined) {
            dict[name] = exports.GLOBAL_IMPLICIT;
        }
        else {
            if (ste.isNested)
                ste.hasFree = true;
            dict[name] = exports.GLOBAL_IMPLICIT;
        }
    };
    SymbolTable.prototype.analyze = function () {
        var free = {};
        var global = {};
        this.analyzeBlock(this.top, null, free, global);
    };
    return SymbolTable;
})();
exports.SymbolTable = SymbolTable;
function _dictUpdate(a, b) {
    for (var kb in b) {
        a[kb] = b[kb];
    }
}
function symbolTable(module, fileName) {
    var ret = new SymbolTable(fileName);
    ret.enterBlock("top", ModuleBlock, module, 0);
    ret.top = ret.cur;
    for (var i = 0; i < module.body.length; ++i) {
        ret.visitStmt(module.body[i]);
    }
    ret.exitBlock();
    ret.analyze();
    return ret;
}
exports.symbolTable = symbolTable;
function dumpSymbolTable(st) {
    var pyBoolStr = function (b) {
        return b ? "True" : "False";
    };
    var pyList = function (l) {
        var ret = [];
        for (var i = 0; i < l.length; ++i) {
            ret.push(l[i]);
        }
        return '[' + ret.join(', ') + ']';
    };
    var getIdents = function (obj, indent) {
        if (indent === undefined)
            indent = "";
        var ret = "";
        ret += indent + "Sym_type: " + obj.get_type() + "\n";
        ret += indent + "Sym_name: " + obj.get_name() + "\n";
        ret += indent + "Sym_lineno: " + obj.get_lineno() + "\n";
        ret += indent + "Sym_nested: " + pyBoolStr(obj.is_nested()) + "\n";
        ret += indent + "Sym_haschildren: " + pyBoolStr(obj.has_children()) + "\n";
        if (obj.get_type() === "class") {
            ret += indent + "Class_methods: " + pyList(obj.get_methods()) + "\n";
        }
        else if (obj.get_type() === "function") {
            ret += indent + "Func_params: " + pyList(obj.get_parameters()) + "\n";
            ret += indent + "Func_locals: " + pyList(obj.get_locals()) + "\n";
            ret += indent + "Func_globals: " + pyList(obj.get_globals()) + "\n";
            ret += indent + "Func_frees: " + pyList(obj.get_frees()) + "\n";
        }
        ret += indent + "-- Identifiers --\n";
        var objidents = obj.get_identifiers();
        var objidentslen = objidents.length;
        for (var i = 0; i < objidentslen; ++i) {
            var info = obj.lookup(objidents[i]);
            ret += indent + "name: " + info.get_name() + "\n";
            ret += indent + "  is_referenced: " + pyBoolStr(info.is_referenced()) + "\n";
            ret += indent + "  is_imported: " + pyBoolStr(info.is_imported()) + "\n";
            ret += indent + "  is_parameter: " + pyBoolStr(info.is_parameter()) + "\n";
            ret += indent + "  is_global: " + pyBoolStr(info.is_global()) + "\n";
            ret += indent + "  is_declared_global: " + pyBoolStr(info.is_declared_global()) + "\n";
            ret += indent + "  is_local: " + pyBoolStr(info.is_local()) + "\n";
            ret += indent + "  is_free: " + pyBoolStr(info.is_free()) + "\n";
            ret += indent + "  is_assigned: " + pyBoolStr(info.is_assigned()) + "\n";
            ret += indent + "  is_namespace: " + pyBoolStr(info.is_namespace()) + "\n";
            var nss = info.get_namespaces();
            var nsslen = nss.length;
            ret += indent + "  namespaces: [\n";
            var sub = [];
            for (var j = 0; j < nsslen; ++j) {
                var ns = nss[j];
                sub.push(getIdents(ns, indent + "    "));
            }
            ret += sub.join('\n');
            ret += indent + '  ]\n';
        }
        return ret;
    };
    return getIdents(st.top, '');
}
exports.dumpSymbolTable = dumpSymbolTable;
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3ltdGFibGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbW9kZS9weXRob24vc3ltdGFibGUudHMiXSwibmFtZXMiOlsic3ludGF4RXJyb3IiLCJtYW5nbGVOYW1lIiwiU3ltYm9sIiwiU3ltYm9sLmNvbnN0cnVjdG9yIiwiU3ltYm9sLmdldF9uYW1lIiwiU3ltYm9sLmlzX3JlZmVyZW5jZWQiLCJTeW1ib2wuaXNfcGFyYW1ldGVyIiwiU3ltYm9sLmlzX2dsb2JhbCIsIlN5bWJvbC5pc19kZWNsYXJlZF9nbG9iYWwiLCJTeW1ib2wuaXNfbG9jYWwiLCJTeW1ib2wuaXNfZnJlZSIsIlN5bWJvbC5pc19pbXBvcnRlZCIsIlN5bWJvbC5pc19hc3NpZ25lZCIsIlN5bWJvbC5pc19uYW1lc3BhY2UiLCJTeW1ib2wuZ2V0X25hbWVzcGFjZXMiLCJTeW1ib2xUYWJsZVNjb3BlIiwiU3ltYm9sVGFibGVTY29wZS5jb25zdHJ1Y3RvciIsIlN5bWJvbFRhYmxlU2NvcGUuZ2V0X3R5cGUiLCJTeW1ib2xUYWJsZVNjb3BlLmdldF9uYW1lIiwiU3ltYm9sVGFibGVTY29wZS5nZXRfbGluZW5vIiwiU3ltYm9sVGFibGVTY29wZS5pc19uZXN0ZWQiLCJTeW1ib2xUYWJsZVNjb3BlLmhhc19jaGlsZHJlbiIsIlN5bWJvbFRhYmxlU2NvcGUuZ2V0X2lkZW50aWZpZXJzIiwiU3ltYm9sVGFibGVTY29wZS5sb29rdXAiLCJTeW1ib2xUYWJsZVNjb3BlLl9fX2NoZWNrX2NoaWxkcmVuIiwiU3ltYm9sVGFibGVTY29wZS5faWRlbnRzTWF0Y2hpbmciLCJTeW1ib2xUYWJsZVNjb3BlLmdldF9wYXJhbWV0ZXJzIiwiU3ltYm9sVGFibGVTY29wZS5nZXRfbG9jYWxzIiwiU3ltYm9sVGFibGVTY29wZS5nZXRfZ2xvYmFscyIsIlN5bWJvbFRhYmxlU2NvcGUuZ2V0X2ZyZWVzIiwiU3ltYm9sVGFibGVTY29wZS5nZXRfbWV0aG9kcyIsIlN5bWJvbFRhYmxlU2NvcGUuZ2V0U2NvcGUiLCJTeW1ib2xUYWJsZSIsIlN5bWJvbFRhYmxlLmNvbnN0cnVjdG9yIiwiU3ltYm9sVGFibGUuZ2V0U3RzRm9yQXN0IiwiU3ltYm9sVGFibGUuU0VRU3RtdCIsIlN5bWJvbFRhYmxlLlNFUUV4cHIiLCJTeW1ib2xUYWJsZS5lbnRlckJsb2NrIiwiU3ltYm9sVGFibGUuZXhpdEJsb2NrIiwiU3ltYm9sVGFibGUudmlzaXRQYXJhbXMiLCJTeW1ib2xUYWJsZS52aXNpdEFyZ3VtZW50cyIsIlN5bWJvbFRhYmxlLm5ld1RtcG5hbWUiLCJTeW1ib2xUYWJsZS5hZGREZWYiLCJTeW1ib2xUYWJsZS52aXNpdFNsaWNlIiwiU3ltYm9sVGFibGUudmlzaXRTdG10IiwiU3ltYm9sVGFibGUudmlzaXRFeHByIiwiU3ltYm9sVGFibGUudmlzaXRDb21wcmVoZW5zaW9uIiwiU3ltYm9sVGFibGUudmlzaXRBbGlhcyIsIlN5bWJvbFRhYmxlLnZpc2l0R2VuZXhwIiwiU3ltYm9sVGFibGUudmlzaXRFeGNlcHRoYW5kbGVycyIsIlN5bWJvbFRhYmxlLmFuYWx5emVCbG9jayIsIlN5bWJvbFRhYmxlLmFuYWx5emVDaGlsZEJsb2NrIiwiU3ltYm9sVGFibGUuYW5hbHl6ZUNlbGxzIiwiU3ltYm9sVGFibGUudXBkYXRlU3ltYm9scyIsIlN5bWJvbFRhYmxlLmFuYWx5emVOYW1lIiwiU3ltYm9sVGFibGUuYW5hbHl6ZSIsIl9kaWN0VXBkYXRlIiwic3ltYm9sVGFibGUiLCJkdW1wU3ltYm9sVGFibGUiXSwibWFwcGluZ3MiOiJBQUFBLElBQU8sUUFBUSxXQUFXLFlBQVksQ0FBQyxDQUFDO0FBQ3hDLElBQU8sSUFBSSxXQUFXLFFBQVEsQ0FBQyxDQUFDO0FBQ2hDLElBQU8sT0FBTyxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBSXRDLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUNuQixJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDbEIsSUFBSSxTQUFTLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN2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Q0FBQ0E7b0JBQ2hGQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7Z0JBQ0RBLEtBQUtBLENBQUNBO1lBQ1ZBLEtBQUtBLFFBQVFBLENBQUNBLE9BQU9BO2dCQUNqQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hCQSxLQUFLQSxDQUFDQTtZQUNWQSxLQUFLQSxRQUFRQSxDQUFDQSxNQUFNQTtnQkFDaEJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO2dCQUN4QkEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hCQSxLQUFLQSxDQUFDQTtZQUNWQSxLQUFLQSxRQUFRQSxDQUFDQSxTQUFTQTtnQkFDbkJBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUN6QkEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hCQSxLQUFLQSxDQUFDQTtZQUNWQSxLQUFLQSxRQUFRQSxDQUFDQSxLQUFLQTtnQkFDZkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7b0JBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNuQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxLQUFLQSxDQUFDQTtZQUNWQSxLQUFLQSxRQUFRQSxDQUFDQSxJQUFJQTtnQkFDZEEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pCQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdkJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7b0JBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNyQ0EsS0FBS0EsQ0FBQ0E7WUFDVkEsS0FBS0EsUUFBUUEsQ0FBQ0EsTUFBTUE7Z0JBQ2hCQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdkJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7b0JBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNyQ0EsS0FBS0EsQ0FBQ0E7WUFDVkEsS0FBS0EsUUFBUUEsQ0FBQ0EsR0FBR0E7Z0JBQ2JBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN2QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQTtvQkFDVEEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxLQUFLQSxDQUFDQTtZQUNWQSxLQUFLQSxRQUFRQSxDQUFDQSxLQUFLQTtnQkFDZkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ1RBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO29CQUN2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ1RBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO3dCQUN2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7NEJBQ1JBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO29CQUNoQ0EsQ0FBQ0E7Z0JBQ0xBLENBQUNBO2dCQUNEQSxLQUFLQSxDQUFDQTtZQUNWQSxLQUFLQSxRQUFRQSxDQUFDQSxTQUFTQTtnQkFDbkJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNyQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO2dCQUNyQ0EsS0FBS0EsQ0FBQ0E7WUFDVkEsS0FBS0EsUUFBUUEsQ0FBQ0EsVUFBVUE7Z0JBQ3BCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDckJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO2dCQUMxQkEsS0FBS0EsQ0FBQ0E7WUFDVkEsS0FBS0EsUUFBUUEsQ0FBQ0EsTUFBTUE7Z0JBQ2hCQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdkJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBO29CQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDakNBLEtBQUtBLENBQUNBO1lBQ1ZBLEtBQUtBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBO1lBQ3RCQSxLQUFLQSxRQUFRQSxDQUFDQSxVQUFVQTtnQkFDcEJBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNuQ0EsS0FBS0EsQ0FBQ0E7WUFDVkEsS0FBS0EsUUFBUUEsQ0FBQ0EsSUFBSUE7Z0JBQ2RBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ1pBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO29CQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7d0JBQ1RBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNqQ0EsQ0FBQ0E7Z0JBQ0RBLEtBQUtBLENBQUNBO1lBQ1ZBLEtBQUtBLFFBQVFBLENBQUNBLE1BQU1BO2dCQUNoQkEsSUFBSUEsUUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQzlCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtvQkFDaENBLElBQUlBLElBQUlBLEdBQUdBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUVqREEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxTQUFTQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDMUJBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBOzRCQUNsQkEsTUFBTUEsV0FBV0EsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsR0FBR0EsNENBQTRDQSxFQUFFQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTt3QkFDL0dBLENBQUNBO3dCQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTs0QkFDRkEsTUFBTUEsV0FBV0EsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsR0FBR0EsdUNBQXVDQSxFQUFFQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTt3QkFDMUdBLENBQUNBO29CQUNMQSxDQUFDQTtvQkFDREEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBVUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzVDQSxDQUFDQTtnQkFDREEsS0FBS0EsQ0FBQ0E7WUFDVkEsS0FBS0EsUUFBUUEsQ0FBQ0EsSUFBSUE7Z0JBQ2RBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUN4QkEsS0FBS0EsQ0FBQ0E7WUFDVkEsS0FBS0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDbkJBLEtBQUtBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBO1lBQ3JCQSxLQUFLQSxRQUFRQSxDQUFDQSxTQUFTQTtnQkFFbkJBLEtBQUtBLENBQUNBO1lBQ1ZBLEtBQUtBLFFBQVFBLENBQUNBLEtBQUtBO2dCQUNmQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFD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Q0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ2hGQSxDQUFDQTtnQkFDREEsS0FBS0EsQ0FBQ0E7WUFDVkEsS0FBS0EsUUFBUUEsQ0FBQ0EsT0FBT0E7Z0JBQ2pCQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdkJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO2dCQUM1QkEsS0FBS0EsQ0FBQ0E7WUFDVkEsS0FBS0EsUUFBUUEsQ0FBQ0EsSUFBSUE7Z0JBQ2RBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN2QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDdENBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUd4Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7b0JBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO2dCQUMzQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7b0JBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUN2Q0EsS0FBS0EsQ0FBQ0E7WUFDVkEsS0FBS0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDbEJBLEtBQUtBLFFBQVFBLENBQUNB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QTtRQUNsQkEsSUFBSUEsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFFakJBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLElBQUlBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQzlCQSxXQUFXQSxDQUFDQSxTQUFTQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUMvQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQ05BLFdBQVdBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1FBQ3JDQSxDQUFDQTtRQUVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1QkEsSUFBSUEsS0FBS0EsR0FBR0EsR0FBR0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLEVBQUVBLElBQUlBLEVBQUVBLEtBQUtBLEVBQUVBLEtBQUtBLEVBQUVBLEtBQUtBLEVBQUVBLElBQUlBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBQzFFQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxLQUFLQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMvQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsS0FBS0EscUJBQWFBLENBQUNBO2dCQUNoQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO2dCQUNOQSxXQUFXQSxDQUFDQSxRQUFRQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNqQ0EsV0FBV0EsQ0FBQ0EsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDbkNBLENBQUNBO1FBRURBLElBQUlB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TSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7WUFDeEIsR0FBRyxJQUFJLE1BQU0sR0FBRyxtQkFBbUIsQ0FBQztZQUNwQyxJQUFJLEdBQUcsR0FBRyxFQUFFLENBQUM7WUFDYixHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQzlCLElBQUksRUFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDaEIsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLE1BQU0sR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQzdDLENBQUM7WUFDRCxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN0QixHQUFHLElBQUksTUFBTSxHQUFHLE9BQU8sQ0FBQztRQUM1QixDQUFDO1FBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQztJQUNmLENBQUMsQ0FBQ0E7SUFDRkEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7QUFDakNBLENBQUNBO0FBN0RlLHVCQUFlLGtCQTZEOUIsQ0FBQTtBQUFBLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgYXN0bm9kZXMgPSByZXF1aXJlKCcuL2FzdG5vZGVzJyk7XG5pbXBvcnQgYmFzZSA9IHJlcXVpcmUoJy4vYmFzZScpO1xuaW1wb3J0IGFzc2VydHMgPSByZXF1aXJlKCcuL2Fzc2VydHMnKTtcblxuLyogRmxhZ3MgZm9yIGRlZi11c2UgaW5mb3JtYXRpb24gKi9cblxudmFyIERFRl9HTE9CQUwgPSAxOyAgICAgICAgICAgLyogZ2xvYmFsIHN0bXQgKi9cbnZhciBERUZfTE9DQUwgPSAyOyAgICAgICAgICAgIC8qIGFzc2lnbm1lbnQgaW4gY29kZSBibG9jayAqL1xudmFyIERFRl9QQVJBTSA9IDIgPDwgMTsgICAgICAgLyogZm9ybWFsIHBhcmFtZXRlciAqL1xudmFyIFVTRSA9IDIgPDwgMjsgICAgICAgICAgICAgLyogbmFtZSBpcyB1c2VkICovXG52YXIgREVGX1NUQVIgPSAyIDw8IDM7ICAgICAgICAvKiBwYXJhbWV0ZXIgaXMgc3RhciBhcmcgKi9cbnZhciBERUZfRE9VQkxFU1RBUiA9IDIgPDwgNDsgIC8qIHBhcmFtZXRlciBpcyBzdGFyLXN0YXIgYXJnICovXG52YXIgREVGX0lOVFVQTEUgPSAyIDw8IDU7ICAgICAvKiBuYW1lIGRlZmluZWQgaW4gdHVwbGUgaW4gcGFyYW1ldGVycyAqL1xudmFyIERFRl9GUkVFID0gMiA8PCA2OyAgICAgICAgLyogbmFtZSB1c2VkIGJ1dCBub3QgZGVmaW5lZCBpbiBuZXN0ZWQgYmxvY2sgKi9cbnZhciBERUZfRlJFRV9HTE9CQUwgPSAyIDw8IDc7IC8qIGZyZWUgdmFyaWFibGUgaXMgYWN0dWFsbHkgaW1wbGljaXQgZ2xvYmFsICovXG52YXIgREVGX0ZSRUVfQ0xBU1MgPSAyIDw8IDg7ICAvKiBmcmVlIHZhcmlhYmxlIGZyb20gY2xhc3MncyBtZXRob2QgKi9cbnZhciBERUZfSU1QT1JUID0gMiA8PCA5OyAgICAgIC8qIGFzc2lnbm1lbnQgb2NjdXJyZWQgdmlhIGltcG9ydCAqL1xuXG52YXIgREVGX0JPVU5EID0gKERFRl9MT0NBTCB8IERFRl9QQVJBTSB8IERFRl9JTVBPUlQpO1xuXG4vKiBHTE9CQUxfRVhQTElDSVQgYW5kIEdMT0JBTF9JTVBMSUNJVCBhcmUgdXNlZCBpbnRlcm5hbGx5IGJ5IHRoZSBzeW1ib2xcbiAgIHRhYmxlLiAgR0xPQkFMIGlzIHJldHVybmVkIGZyb20gUHlTVF9HZXRTY29wZSgpIGZvciBlaXRoZXIgb2YgdGhlbS5cbiAgIEl0IGlzIHN0b3JlZCBpbiBzdGVfc3ltYm9scyBhdCBiaXRzIDEyLTE0LlxuKi9cbnZhciBTQ09QRV9PRkYgPSAxMTtcbnZhciBTQ09QRV9NQVNLID0gNztcblxuZXhwb3J0IHZhciBMT0NBTCA9IDE7XG5leHBvcnQgdmFyIEdMT0JBTF9FWFBMSUNJVCA9IDI7XG5leHBvcnQgdmFyIEdMT0JBTF9JTVBMSUNJVCA9IDM7XG5leHBvcnQgdmFyIEZSRUUgPSA0O1xuZXhwb3J0IHZhciBDRUxMID0gNTtcblxuLyogVGhlIGZvbGxvd2luZyB0aHJlZSBuYW1lcyBhcmUgdXNlZCBmb3IgdGhlIHN0ZV91bm9wdGltaXplZCBiaXQgZmllbGQgKi9cbnZhciBPUFRfSU1QT1JUX1NUQVIgPSAxO1xudmFyIE9QVF9FWEVDID0gMjtcbnZhciBPUFRfQkFSRV9FWEVDID0gNDtcbnZhciBPUFRfVE9QTEVWRUwgPSA4OyAgLyogdG9wLWxldmVsIG5hbWVzLCBpbmNsdWRpbmcgZXZhbCBhbmQgZXhlYyAqL1xuXG52YXIgR0VORVJBVE9SID0gMjtcbnZhciBHRU5FUkFUT1JfRVhQUkVTU0lPTiA9IDI7XG5cbnZhciBNb2R1bGVCbG9jayA9ICdtb2R1bGUnO1xuZXhwb3J0IHZhciBGdW5jdGlvbkJsb2NrID0gJ2Z1bmN0aW9uJztcbnZhciBDbGFzc0Jsb2NrID0gJ2NsYXNzJztcblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gbWVzc2FnZVxuICogQHBhcmFtIHtzdHJpbmd9IGZpbGVOYW1lXG4gKiBAcGFyYW0ge251bWJlcj19IGxpbmVOdW1iZXJcbiAqL1xuZnVuY3Rpb24gc3ludGF4RXJyb3IobWVzc2FnZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nLCBsaW5lTnVtYmVyPzogbnVtYmVyKSB7XG4gICAgYXNzZXJ0cy5hc3NlcnQoYmFzZS5pc1N0cmluZyhtZXNzYWdlKSwgXCJtZXNzYWdlIG11c3QgYmUgYSBzdHJpbmdcIik7XG4gICAgYXNzZXJ0cy5hc3NlcnQoYmFzZS5pc1N0cmluZyhmaWxlTmFtZSksIFwiZmlsZU5hbWUgbXVzdCBiZSBhIHN0cmluZ1wiKTtcbiAgICBpZiAoYmFzZS5pc0RlZihsaW5lTnVtYmVyKSkge1xuICAgICAgICBhc3NlcnRzLmFzc2VydChiYXNlLmlzTnVtYmVyKGxpbmVOdW1iZXIpLCBcImxpbmVOdW1iZXIgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICB9XG4gICAgdmFyIGUgPSBuZXcgU3ludGF4RXJyb3IobWVzc2FnZSk7XG4gICAgZVsnZmlsZU5hbWUnXSA9IGZpbGVOYW1lO1xuICAgIGlmICh0eXBlb2YgbGluZU51bWJlciA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgZVsnbGluZU51bWJlciddID0gbGluZU51bWJlcjtcbiAgICB9XG4gICAgcmV0dXJuIGU7XG59XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd8bnVsbH0gcHJpdlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hbmdsZU5hbWUocHJpdjogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHZhciBzdHJwcml2OiBzdHJpbmcgPSBudWxsO1xuXG4gICAgaWYgKHByaXYgPT09IG51bGwgfHwgbmFtZSA9PT0gbnVsbCB8fCBuYW1lLmNoYXJBdCgwKSAhPT0gJ18nIHx8IG5hbWUuY2hhckF0KDEpICE9PSAnXycpXG4gICAgICAgIHJldHVybiBuYW1lO1xuICAgIC8vIGRvbid0IG1hbmdsZSBfX2lkX19cbiAgICBpZiAobmFtZS5jaGFyQXQobmFtZS5sZW5ndGggLSAxKSA9PT0gJ18nICYmIG5hbWUuY2hhckF0KG5hbWUubGVuZ3RoIC0gMikgPT09ICdfJylcbiAgICAgICAgcmV0dXJuIG5hbWU7XG4gICAgLy8gZG9uJ3QgbWFuZ2xlIGNsYXNzZXMgdGhhdCBhcmUgYWxsIF8gKG9ic2N1cmUgbXVjaD8pXG4gICAgc3RycHJpdiA9IHByaXY7XG4gICAgc3RycHJpdi5yZXBsYWNlKC9fL2csICcnKTtcbiAgICBpZiAoc3RycHJpdiA9PT0gJycpXG4gICAgICAgIHJldHVybiBuYW1lO1xuXG4gICAgc3RycHJpdiA9IHByaXY7XG4gICAgc3RycHJpdi5yZXBsYWNlKC9eXyovLCAnJyk7XG4gICAgc3RycHJpdiA9ICdfJyArIHN0cnByaXYgKyBuYW1lO1xuICAgIHJldHVybiBzdHJwcml2O1xufVxuXG5jbGFzcyBTeW1ib2wge1xuICAgIHByaXZhdGUgX19uYW1lO1xuICAgIHByaXZhdGUgX19mbGFncztcbiAgICBwcml2YXRlIF9fc2NvcGU7XG4gICAgcHJpdmF0ZSBfX25hbWVzcGFjZXM7XG4gICAgY29uc3RydWN0b3IobmFtZSwgZmxhZ3MsIG5hbWVzcGFjZXMpIHtcbiAgICAgICAgdGhpcy5fX25hbWUgPSBuYW1lO1xuICAgICAgICB0aGlzLl9fZmxhZ3MgPSBmbGFncztcbiAgICAgICAgdGhpcy5fX3Njb3BlID0gKGZsYWdzID4+IFNDT1BFX09GRikgJiBTQ09QRV9NQVNLO1xuICAgICAgICB0aGlzLl9fbmFtZXNwYWNlcyA9IG5hbWVzcGFjZXMgfHwgW107XG4gICAgfVxuXG4gICAgZ2V0X25hbWUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9fbmFtZTtcbiAgICAgICAgXG4gICAgfVxuXG4gICAgaXNfcmVmZXJlbmNlZCgpIHtcbiAgICAgICAgcmV0dXJuICEhKHRoaXMuX19mbGFncyAmIFVTRSk7XG4gICAgICAgIFxuICAgIH1cblxuICAgIGlzX3BhcmFtZXRlcigpIHtcbiAgICAgICAgcmV0dXJuICEhKHRoaXMuX19mbGFncyAmIERFRl9QQVJBTSk7XG4gICAgfVxuXG4gICAgaXNfZ2xvYmFsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fX3Njb3BlID09PSBHTE9CQUxfSU1QTElDSVQgfHwgdGhpcy5fX3Njb3BlID09IEdMT0JBTF9FWFBMSUNJVDtcbiAgICB9XG5cbiAgICBpc19kZWNsYXJlZF9nbG9iYWwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9fc2NvcGUgPT0gR0xPQkFMX0VYUExJQ0lUO1xuICAgIH1cblxuICAgIGlzX2xvY2FsKCkge1xuICAgICAgICByZXR1cm4gISEodGhpcy5fX2ZsYWdzICYgREVGX0JPVU5EKTtcbiAgICB9XG5cbiAgICBpc19mcmVlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fX3Njb3BlID09IEZSRUU7XG4gICAgfVxuXG4gICAgaXNfaW1wb3J0ZWQoKSB7XG4gICAgICAgIHJldHVybiAhISh0aGlzLl9fZmxhZ3MgJiBERUZfSU1QT1JUKTtcbiAgICB9XG5cbiAgICBpc19hc3NpZ25lZCgpIHtcbiAgICAgICAgcmV0dXJuICEhKHRoaXMuX19mbGFncyAmIERFRl9MT0NBTCk7XG4gICAgfVxuXG4gICAgaXNfbmFtZXNwYWNlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fX25hbWVzcGFjZXMgJiYgdGhpcy5fX25hbWVzcGFjZXMubGVuZ3RoID4gMDtcbiAgICB9XG4gICAgXG4gICAgZ2V0X25hbWVzcGFjZXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9fbmFtZXNwYWNlcztcbiAgICB9XG59XG5cbnZhciBhc3RTY29wZUNvdW50ZXIgPSAwO1xuXG5leHBvcnQgY2xhc3MgU3ltYm9sVGFibGVTY29wZSB7XG4gICAgcHVibGljIHN5bUZsYWdzO1xuICAgIHByaXZhdGUgbmFtZTogc3RyaW5nO1xuICAgIHB1YmxpYyB2YXJuYW1lczogc3RyaW5nW107XG4gICAgcHVibGljIGNoaWxkcmVuOiBTeW1ib2xUYWJsZVNjb3BlW107XG4gICAgcHVibGljIGJsb2NrVHlwZTogc3RyaW5nO1xuICAgIHB1YmxpYyBpc05lc3RlZDogYm9vbGVhbjtcbiAgICBwdWJsaWMgaGFzRnJlZTogYm9vbGVhbjtcbiAgICBwdWJsaWMgY2hpbGRIYXNGcmVlOiBib29sZWFuO1xuICAgIHB1YmxpYyBnZW5lcmF0b3I6IGJvb2xlYW47XG4gICAgcHVibGljIHZhcmFyZ3M6IGJvb2xlYW47XG4gICAgcHVibGljIHZhcmtleXdvcmRzOiBib29sZWFuO1xuICAgIHB1YmxpYyByZXR1cm5zVmFsdWU6IGJvb2xlYW47XG4gICAgcHVibGljIGxpbmVubzogbnVtYmVyO1xuICAgIHByaXZhdGUgdGFibGU6IFN5bWJvbFRhYmxlO1xuICAgIHByaXZhdGUgc3ltYm9scztcbiAgICBwcml2YXRlIF9mdW5jUGFyYW1zO1xuICAgIHByaXZhdGUgX2Z1bmNMb2NhbHM7XG4gICAgcHJpdmF0ZSBfZnVuY0dsb2JhbHM7XG4gICAgcHJpdmF0ZSBfZnVuY0ZyZWVzO1xuICAgIHByaXZhdGUgX2NsYXNzTWV0aG9kcztcbiAgICAvKipcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdGFibGVcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGxpbmVub1xuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKHRhYmxlOiBTeW1ib2xUYWJsZSwgbmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIGFzdCwgbGluZW5vOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5zeW1GbGFncyA9IHt9O1xuICAgICAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgICAgICB0aGlzLnZhcm5hbWVzID0gW107XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAdHlwZSBBcnJheS48U3ltYm9sVGFibGVTY29wZT5cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuY2hpbGRyZW4gPSBbXTtcbiAgICAgICAgdGhpcy5ibG9ja1R5cGUgPSB0eXBlO1xuICAgIFxuICAgICAgICB0aGlzLmlzTmVzdGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuaGFzRnJlZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLmNoaWxkSGFzRnJlZSA9IGZhbHNlOyAgLy8gdHJ1ZSBpZiBjaGlsZCBibG9jayBoYXMgZnJlZSB2YXJzIGluY2x1ZGluZyBmcmVlIHJlZnMgdG8gZ2xvYmFsc1xuICAgICAgICB0aGlzLmdlbmVyYXRvciA9IGZhbHNlO1xuICAgICAgICB0aGlzLnZhcmFyZ3MgPSBmYWxzZTtcbiAgICAgICAgdGhpcy52YXJrZXl3b3JkcyA9IGZhbHNlO1xuICAgICAgICB0aGlzLnJldHVybnNWYWx1ZSA9IGZhbHNlO1xuICAgIFxuICAgICAgICB0aGlzLmxpbmVubyA9IGxpbmVubztcbiAgICBcbiAgICAgICAgdGhpcy50YWJsZSA9IHRhYmxlO1xuICAgIFxuICAgICAgICBpZiAodGFibGUuY3VyICYmICh0YWJsZS5jdXIuaXNfbmVzdGVkKCkgfHwgdGFibGUuY3VyLmJsb2NrVHlwZSA9PT0gRnVuY3Rpb25CbG9jaykpXG4gICAgICAgICAgICB0aGlzLmlzTmVzdGVkID0gdHJ1ZTtcbiAgICBcbiAgICAgICAgYXN0LnNjb3BlSWQgPSBhc3RTY29wZUNvdW50ZXIrKztcbiAgICAgICAgdGFibGUuc3Rzc1thc3Quc2NvcGVJZF0gPSB0aGlzO1xuICAgIFxuICAgICAgICAvLyBjYWNoZSBvZiBTeW1ib2xzIGZvciByZXR1cm5pbmcgdG8gb3RoZXIgcGFydHMgb2YgY29kZVxuICAgICAgICB0aGlzLnN5bWJvbHMgPSB7fTtcbiAgICB9XG5cbiAgICBnZXRfdHlwZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmxvY2tUeXBlO1xuICAgICAgICBcbiAgICB9XG5cbiAgICBnZXRfbmFtZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubmFtZTtcbiAgICAgICAgXG4gICAgfVxuXG4gICAgZ2V0X2xpbmVubygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubGluZW5vO1xuICAgICAgICBcbiAgICB9XG5cbiAgICBpc19uZXN0ZWQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmlzTmVzdGVkO1xuICAgICAgICBcbiAgICB9XG5cbiAgICBoYXNfY2hpbGRyZW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNoaWxkcmVuLmxlbmd0aCA+IDA7XG4gICAgfVxuXG4gICAgZ2V0X2lkZW50aWZpZXJzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5faWRlbnRzTWF0Y2hpbmcoZnVuY3Rpb24oeCkgeyByZXR1cm4gdHJ1ZTsgfSk7XG4gICAgfVxuXG4gICAgbG9va3VwKG5hbWU6IHN0cmluZykge1xuICAgICAgICB2YXIgc3ltO1xuICAgICAgICBpZiAoIXRoaXMuc3ltYm9scy5oYXNPd25Qcm9wZXJ0eShuYW1lKSkge1xuICAgICAgICAgICAgdmFyIGZsYWdzID0gdGhpcy5zeW1GbGFnc1tuYW1lXTtcbiAgICAgICAgICAgIHZhciBuYW1lc3BhY2VzID0gdGhpcy5fX2NoZWNrX2NoaWxkcmVuKG5hbWUpO1xuICAgICAgICAgICAgc3ltID0gdGhpcy5zeW1ib2xzW25hbWVdID0gbmV3IFN5bWJvbChuYW1lLCBmbGFncywgbmFtZXNwYWNlcyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzeW0gPSB0aGlzLnN5bWJvbHNbbmFtZV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN5bTtcbiAgICB9XG4gICAgXG4gICAgX19jaGVja19jaGlsZHJlbihuYW1lKSB7XG4gICAgICAgIHZhciByZXQgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldO1xuICAgICAgICAgICAgaWYgKGNoaWxkLm5hbWUgPT09IG5hbWUpXG4gICAgICAgICAgICAgICAgcmV0LnB1c2goY2hpbGQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgfVxuICAgIFxuICAgIF9pZGVudHNNYXRjaGluZyhmKSB7XG4gICAgICAgIHZhciByZXQgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgayBpbiB0aGlzLnN5bUZsYWdzKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5zeW1GbGFncy5oYXNPd25Qcm9wZXJ0eShrKSkge1xuICAgICAgICAgICAgICAgIGlmIChmKHRoaXMuc3ltRmxhZ3Nba10pKVxuICAgICAgICAgICAgICAgICAgICByZXQucHVzaChrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXQuc29ydCgpO1xuICAgICAgICByZXR1cm4gcmV0O1xuICAgIH1cbiAgICBcbiAgICBnZXRfcGFyYW1ldGVycygpIHtcbiAgICAgICAgYXNzZXJ0cy5hc3NlcnQodGhpcy5nZXRfdHlwZSgpID09ICdmdW5jdGlvbicsIFwiZ2V0X3BhcmFtZXRlcnMgb25seSB2YWxpZCBmb3IgZnVuY3Rpb24gc2NvcGVzXCIpO1xuICAgICAgICBpZiAoIXRoaXMuX2Z1bmNQYXJhbXMpXG4gICAgICAgICAgICB0aGlzLl9mdW5jUGFyYW1zID0gdGhpcy5faWRlbnRzTWF0Y2hpbmcoZnVuY3Rpb24oeCkgeyByZXR1cm4geCAmIERFRl9QQVJBTTsgfSk7XG4gICAgICAgIHJldHVybiB0aGlzLl9mdW5jUGFyYW1zO1xuICAgIH1cbiAgICBcbiAgICBnZXRfbG9jYWxzKCkge1xuICAgICAgICBhc3NlcnRzLmFzc2VydCh0aGlzLmdldF90eXBlKCkgPT0gJ2Z1bmN0aW9uJywgXCJnZXRfbG9jYWxzIG9ubHkgdmFsaWQgZm9yIGZ1bmN0aW9uIHNjb3Blc1wiKTtcbiAgICAgICAgaWYgKCF0aGlzLl9mdW5jTG9jYWxzKVxuICAgICAgICAgICAgdGhpcy5fZnVuY0xvY2FscyA9IHRoaXMuX2lkZW50c01hdGNoaW5nKGZ1bmN0aW9uKHgpIHsgcmV0dXJuIHggJiBERUZfQk9VTkQ7IH0pO1xuICAgICAgICByZXR1cm4gdGhpcy5fZnVuY0xvY2FscztcbiAgICB9XG4gICAgXG4gICAgZ2V0X2dsb2JhbHMoKSB7XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KHRoaXMuZ2V0X3R5cGUoKSA9PSAnZnVuY3Rpb24nLCBcImdldF9nbG9iYWxzIG9ubHkgdmFsaWQgZm9yIGZ1bmN0aW9uIHNjb3Blc1wiKTtcbiAgICAgICAgaWYgKCF0aGlzLl9mdW5jR2xvYmFscykge1xuICAgICAgICAgICAgdGhpcy5fZnVuY0dsb2JhbHMgPSB0aGlzLl9pZGVudHNNYXRjaGluZyhmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICAgICAgdmFyIG1hc2tlZCA9ICh4ID4+IFNDT1BFX09GRikgJiBTQ09QRV9NQVNLO1xuICAgICAgICAgICAgICAgIHJldHVybiBtYXNrZWQgPT0gR0xPQkFMX0lNUExJQ0lUIHx8IG1hc2tlZCA9PSBHTE9CQUxfRVhQTElDSVQ7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fZnVuY0dsb2JhbHM7XG4gICAgfVxuICAgIFxuICAgIGdldF9mcmVlcygpIHtcbiAgICAgICAgYXNzZXJ0cy5hc3NlcnQodGhpcy5nZXRfdHlwZSgpID09ICdmdW5jdGlvbicsIFwiZ2V0X2ZyZWVzIG9ubHkgdmFsaWQgZm9yIGZ1bmN0aW9uIHNjb3Blc1wiKTtcbiAgICAgICAgaWYgKCF0aGlzLl9mdW5jRnJlZXMpIHtcbiAgICAgICAgICAgIHRoaXMuX2Z1bmNGcmVlcyA9IHRoaXMuX2lkZW50c01hdGNoaW5nKGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgICAgICAgICB2YXIgbWFza2VkID0gKHggPj4gU0NPUEVfT0ZGKSAmIFNDT1BFX01BU0s7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1hc2tlZCA9PSBGUkVFO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX2Z1bmNGcmVlcztcbiAgICB9XG4gICAgXG4gICAgZ2V0X21ldGhvZHMoKSB7XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KHRoaXMuZ2V0X3R5cGUoKSA9PSAnY2xhc3MnLCBcImdldF9tZXRob2RzIG9ubHkgdmFsaWQgZm9yIGNsYXNzIHNjb3Blc1wiKTtcbiAgICAgICAgaWYgKCF0aGlzLl9jbGFzc01ldGhvZHMpIHtcbiAgICAgICAgICAgIC8vIHRvZG87IHVuaXE/XG4gICAgICAgICAgICB2YXIgYWxsID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyArK2kpXG4gICAgICAgICAgICAgICAgYWxsLnB1c2godGhpcy5jaGlsZHJlbltpXS5uYW1lKTtcbiAgICAgICAgICAgIGFsbC5zb3J0KCk7XG4gICAgICAgICAgICB0aGlzLl9jbGFzc01ldGhvZHMgPSBhbGw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX2NsYXNzTWV0aG9kcztcbiAgICB9XG4gICAgXG4gICAgZ2V0U2NvcGUobmFtZSkge1xuICAgICAgICB2YXIgdiA9IHRoaXMuc3ltRmxhZ3NbbmFtZV07XG4gICAgICAgIGlmICh2ID09PSB1bmRlZmluZWQpIHJldHVybiAwO1xuICAgICAgICByZXR1cm4gKHYgPj4gU0NPUEVfT0ZGKSAmIFNDT1BFX01BU0s7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgU3ltYm9sVGFibGUge1xuICAgIHByaXZhdGUgZmlsZU5hbWU6IHN0cmluZztcbiAgICBwdWJsaWMgY3VyOiBTeW1ib2xUYWJsZVNjb3BlID0gbnVsbDtcbiAgICBwdWJsaWMgdG9wOiBTeW1ib2xUYWJsZVNjb3BlID0gbnVsbDtcbiAgICBwcml2YXRlIHN0YWNrOiBTeW1ib2xUYWJsZVNjb3BlW10gPSBbXTtcbiAgICAvKipcbiAgICAgKiBwb2ludHMgYXQgdG9wIGxldmVsIG1vZHVsZSBzeW1GbGFnc1xuICAgICAqL1xuICAgIHByaXZhdGUgZ2xvYmFsID0gbnVsbDtcbiAgICAvKipcbiAgICAgKiBUaGUgY3VycmVudCBjbGFzcyBvciBudWxsLlxuICAgICAqL1xuICAgIHByaXZhdGUgY3VyQ2xhc3M6IHN0cmluZyA9IG51bGw7XG4gICAgLyoqXG4gICAgICogVGVtcG9yYXJ5IHZhcmlhYmxlIHVzZWQgdG8gZ2VuZXJhdGUgbmFtZXMgb2YgZGVmaW5pdGlvbnMuXG4gICAgICovXG4gICAgcHJpdmF0ZSB0bXBuYW1lOiBudW1iZXIgPSAwO1xuICAgIC8qKlxuICAgICAqIG1hcHBpbmcgZnJvbSBhc3Qgbm9kZXMgdG8gdGhlaXIgc2NvcGUgaWYgdGhleSBoYXZlIG9uZS4gd2UgYWRkIGFuXG4gICAgICogaWQgdG8gdGhlIGFzdCBub2RlIHdoZW4gYSBzY29wZSBpcyBjcmVhdGVkIGZvciBpdCwgYW5kIHN0b3JlIGl0IGluXG4gICAgICogaGVyZSBmb3IgdGhlIGNvbXBpbGVyIHRvIGxvb2t1cCBsYXRlci5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RzcyA9IHt9O1xuICAgIGNvbnN0cnVjdG9yKGZpbGVOYW1lOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5maWxlTmFtZSA9IGZpbGVOYW1lO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIExvb2t1cCB0aGUgU3ltYm9sVGFibGVTY29wZSBmb3IgYSBzY29wZUlkIG9mIHRoZSBBU1QuXG4gICAgICovXG4gICAgZ2V0U3RzRm9yQXN0KGFzdCkge1xuICAgICAgICBhc3NlcnRzLmFzc2VydChhc3Quc2NvcGVJZCAhPT0gdW5kZWZpbmVkLCBcImFzdCB3YXNuJ3QgYWRkZWQgdG8gc3Q/XCIpO1xuICAgICAgICB2YXIgdiA9IHRoaXMuc3Rzc1thc3Quc2NvcGVJZF07XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KHYgIT09IHVuZGVmaW5lZCwgXCJ1bmtub3duIHN5bSB0YWIgZW50cnlcIik7XG4gICAgICAgIHJldHVybiB2O1xuICAgIH1cblxuICAgIFNFUVN0bXQobm9kZXMpIHtcbiAgICAgICAgdmFyIGxlbiA9IG5vZGVzLmxlbmd0aDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47ICsraSkge1xuICAgICAgICAgICAgdmFyIHZhbCA9IG5vZGVzW2ldO1xuICAgICAgICAgICAgaWYgKHZhbCkgdGhpcy52aXNpdFN0bXQodmFsKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIFNFUUV4cHIobm9kZXMpIHtcbiAgICAgICAgdmFyIGxlbiA9IG5vZGVzLmxlbmd0aDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47ICsraSkge1xuICAgICAgICAgICAgdmFyIHZhbCA9IG5vZGVzW2ldO1xuICAgICAgICAgICAgaWYgKHZhbCkgdGhpcy52aXNpdEV4cHIodmFsKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGVudGVyQmxvY2sobmFtZTogc3RyaW5nLCBibG9ja1R5cGU6IHN0cmluZywgYXN0LCBsaW5lbm86IG51bWJlcikge1xuICAgICAgICAvLyAgbmFtZSA9IGZpeFJlc2VydmVkTmFtZXMobmFtZSk7XG4gICAgICAgIHZhciBwcmV2OiBTeW1ib2xUYWJsZVNjb3BlID0gbnVsbDtcbiAgICAgICAgaWYgKHRoaXMuY3VyKSB7XG4gICAgICAgICAgICBwcmV2ID0gdGhpcy5jdXI7XG4gICAgICAgICAgICB0aGlzLnN0YWNrLnB1c2godGhpcy5jdXIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY3VyID0gbmV3IFN5bWJvbFRhYmxlU2NvcGUodGhpcywgbmFtZSwgYmxvY2tUeXBlLCBhc3QsIGxpbmVubyk7XG4gICAgICAgIGlmIChuYW1lID09PSAndG9wJykge1xuICAgICAgICAgICAgdGhpcy5nbG9iYWwgPSB0aGlzLmN1ci5zeW1GbGFncztcbiAgICAgICAgfVxuICAgICAgICBpZiAocHJldikge1xuICAgICAgICAgICAgcHJldi5jaGlsZHJlbi5wdXNoKHRoaXMuY3VyKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBleGl0QmxvY2soKSB7XG4gICAgICAgIHRoaXMuY3VyID0gbnVsbDtcbiAgICAgICAgaWYgKHRoaXMuc3RhY2subGVuZ3RoID4gMClcbiAgICAgICAgICAgIHRoaXMuY3VyID0gdGhpcy5zdGFjay5wb3AoKTtcbiAgICB9XG5cbiAgICB2aXNpdFBhcmFtcyhhcmdzLCB0b3BsZXZlbCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBhcmcgPSBhcmdzW2ldO1xuICAgICAgICAgICAgaWYgKGFyZy5jb25zdHJ1Y3RvciA9PT0gYXN0bm9kZXMuTmFtZSkge1xuICAgICAgICAgICAgICAgIGFzc2VydHMuYXNzZXJ0KGFyZy5jdHggPT09IGFzdG5vZGVzLlBhcmFtIHx8IChhcmcuY3R4ID09PSBhc3Rub2Rlcy5TdG9yZSAmJiAhdG9wbGV2ZWwpKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZERlZihhcmcuaWQsIERFRl9QQVJBTSwgYXJnLmxpbmVubyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBUdXBsZSBpc24ndCBzdXBwb3J0ZWRcbiAgICAgICAgICAgICAgICB0aHJvdyBzeW50YXhFcnJvcihcImludmFsaWQgZXhwcmVzc2lvbiBpbiBwYXJhbWV0ZXIgbGlzdFwiLCB0aGlzLmZpbGVOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvKipcbiAgICAgKiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgZm9yIGEgRnVuY3Rpb24gRGVmaW5pdGlvbiBvciBhIExhbWJkYSBleHByZXNzaW9uLlxuICAgICAqL1xuICAgIHZpc2l0QXJndW1lbnRzKGEsIGxpbmVubzogbnVtYmVyKSB7XG4gICAgICAgIGlmIChhLmFyZ3MpIHRoaXMudmlzaXRQYXJhbXMoYS5hcmdzLCB0cnVlKTtcbiAgICAgICAgaWYgKGEudmFyYXJnKSB7XG4gICAgICAgICAgICB0aGlzLmFkZERlZihhLnZhcmFyZywgREVGX1BBUkFNLCBsaW5lbm8pO1xuICAgICAgICAgICAgdGhpcy5jdXIudmFyYXJncyA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGEua3dhcmcpIHtcbiAgICAgICAgICAgIHRoaXMuYWRkRGVmKGEua3dhcmcsIERFRl9QQVJBTSwgbGluZW5vKTtcbiAgICAgICAgICAgIHRoaXMuY3VyLnZhcmtleXdvcmRzID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBsaW5lbm9cbiAgICAgKi9cbiAgICBuZXdUbXBuYW1lKGxpbmVubzogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuYWRkRGVmKFwiX1tcIiArICgrK3RoaXMudG1wbmFtZSkgKyBcIl1cIiwgREVGX0xPQ0FMLCBsaW5lbm8pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGZsYWdcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbGluZW5vXG4gICAgICovXG4gICAgYWRkRGVmKG5hbWU6IHN0cmluZywgZmxhZzogbnVtYmVyLCBsaW5lbm86IG51bWJlcikge1xuICAgICAgICB2YXIgbWFuZ2xlZCA9IG1hbmdsZU5hbWUodGhpcy5jdXJDbGFzcywgbmFtZSk7XG4gICAgICAgIC8vICBtYW5nbGVkID0gZml4UmVzZXJ2ZWROYW1lcyhtYW5nbGVkKTtcbiAgICAgICAgdmFyIHZhbCA9IHRoaXMuY3VyLnN5bUZsYWdzW21hbmdsZWRdO1xuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGlmICgoZmxhZyAmIERFRl9QQVJBTSkgJiYgKHZhbCAmIERFRl9QQVJBTSkpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBzeW50YXhFcnJvcihcImR1cGxpY2F0ZSBhcmd1bWVudCAnXCIgKyBuYW1lICsgXCInIGluIGZ1bmN0aW9uIGRlZmluaXRpb25cIiwgdGhpcy5maWxlTmFtZSwgbGluZW5vKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhbCB8PSBmbGFnO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFsID0gZmxhZztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmN1ci5zeW1GbGFnc1ttYW5nbGVkXSA9IHZhbDtcbiAgICAgICAgaWYgKGZsYWcgJiBERUZfUEFSQU0pIHtcbiAgICAgICAgICAgIHRoaXMuY3VyLnZhcm5hbWVzLnB1c2gobWFuZ2xlZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoZmxhZyAmIERFRl9HTE9CQUwpIHtcbiAgICAgICAgICAgIHZhbCA9IGZsYWc7XG4gICAgICAgICAgICB2YXIgZnJvbUdsb2JhbCA9IHRoaXMuZ2xvYmFsW21hbmdsZWRdO1xuICAgICAgICAgICAgaWYgKGZyb21HbG9iYWwgIT09IHVuZGVmaW5lZCkgdmFsIHw9IGZyb21HbG9iYWw7XG4gICAgICAgICAgICB0aGlzLmdsb2JhbFttYW5nbGVkXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICB2aXNpdFNsaWNlKHMpIHtcbiAgICAgICAgc3dpdGNoIChzLmNvbnN0cnVjdG9yKSB7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlNsaWNlOlxuICAgICAgICAgICAgICAgIGlmIChzLmxvd2VyKSB0aGlzLnZpc2l0RXhwcihzLmxvd2VyKTtcbiAgICAgICAgICAgICAgICBpZiAocy51cHBlcikgdGhpcy52aXNpdEV4cHIocy51cHBlcik7XG4gICAgICAgICAgICAgICAgaWYgKHMuc3RlcCkgdGhpcy52aXNpdEV4cHIocy5zdGVwKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuRXh0U2xpY2U6XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzLmRpbXMubGVuZ3RoOyArK2kpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudmlzaXRTbGljZShzLmRpbXNbaV0pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5JbmRleDpcbiAgICAgICAgICAgICAgICB0aGlzLnZpc2l0RXhwcihzLnZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuRWxsaXBzaXM6XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gc1xuICAgICAqL1xuICAgIHZpc2l0U3RtdChzKSB7XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KHMgIT09IHVuZGVmaW5lZCwgXCJ2aXNpdFN0bXQgY2FsbGVkIHdpdGggdW5kZWZpbmVkXCIpO1xuICAgICAgICBzd2l0Y2ggKHMuY29uc3RydWN0b3IpIHtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuRnVuY3Rpb25EZWY6XG4gICAgICAgICAgICAgICAgdGhpcy5hZGREZWYocy5uYW1lLCBERUZfTE9DQUwsIHMubGluZW5vKTtcbiAgICAgICAgICAgICAgICBpZiAocy5hcmdzLmRlZmF1bHRzKSB0aGlzLlNFUUV4cHIocy5hcmdzLmRlZmF1bHRzKTtcbiAgICAgICAgICAgICAgICBpZiAocy5kZWNvcmF0b3JfbGlzdCkgdGhpcy5TRVFFeHByKHMuZGVjb3JhdG9yX2xpc3QpO1xuICAgICAgICAgICAgICAgIHRoaXMuZW50ZXJCbG9jayhzLm5hbWUsIEZ1bmN0aW9uQmxvY2ssIHMsIHMubGluZW5vKTtcbiAgICAgICAgICAgICAgICB0aGlzLnZpc2l0QXJndW1lbnRzKHMuYXJncywgcy5saW5lbm8pO1xuICAgICAgICAgICAgICAgIHRoaXMuU0VRU3RtdChzLmJvZHkpO1xuICAgICAgICAgICAgICAgIHRoaXMuZXhpdEJsb2NrKCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkNsYXNzRGVmOlxuICAgICAgICAgICAgICAgIHRoaXMuYWRkRGVmKHMubmFtZSwgREVGX0xPQ0FMLCBzLmxpbmVubyk7XG4gICAgICAgICAgICAgICAgdGhpcy5TRVFFeHByKHMuYmFzZXMpO1xuICAgICAgICAgICAgICAgIGlmIChzLmRlY29yYXRvcl9saXN0KSB0aGlzLlNFUUV4cHIocy5kZWNvcmF0b3JfbGlzdCk7XG4gICAgICAgICAgICAgICAgdGhpcy5lbnRlckJsb2NrKHMubmFtZSwgQ2xhc3NCbG9jaywgcywgcy5saW5lbm8pO1xuICAgICAgICAgICAgICAgIHZhciB0bXAgPSB0aGlzLmN1ckNsYXNzO1xuICAgICAgICAgICAgICAgIHRoaXMuY3VyQ2xhc3MgPSBzLm5hbWU7XG4gICAgICAgICAgICAgICAgdGhpcy5TRVFTdG10KHMuYm9keSk7XG4gICAgICAgICAgICAgICAgdGhpcy5jdXJDbGFzcyA9IHRtcDtcbiAgICAgICAgICAgICAgICB0aGlzLmV4aXRCbG9jaygpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5SZXR1cm5fOlxuICAgICAgICAgICAgICAgIGlmIChzLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudmlzaXRFeHByKHMudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1ci5yZXR1cm5zVmFsdWUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5jdXIuZ2VuZXJhdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBzeW50YXhFcnJvcihcIidyZXR1cm4nIHdpdGggYXJndW1lbnQgaW5zaWRlIGdlbmVyYXRvclwiLCB0aGlzLmZpbGVOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuRGVsZXRlXzpcbiAgICAgICAgICAgICAgICB0aGlzLlNFUUV4cHIocy50YXJnZXRzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuQXNzaWduOlxuICAgICAgICAgICAgICAgIHRoaXMuU0VRRXhwcihzLnRhcmdldHMpO1xuICAgICAgICAgICAgICAgIHRoaXMudmlzaXRFeHByKHMudmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5BdWdBc3NpZ246XG4gICAgICAgICAgICAgICAgdGhpcy52aXNpdEV4cHIocy50YXJnZXQpO1xuICAgICAgICAgICAgICAgIHRoaXMudmlzaXRFeHByKHMudmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5QcmludDpcbiAgICAgICAgICAgICAgICBpZiAocy5kZXN0KSB0aGlzLnZpc2l0RXhwcihzLmRlc3QpO1xuICAgICAgICAgICAgICAgIHRoaXMuU0VRRXhwcihzLnZhbHVlcyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkZvcl86XG4gICAgICAgICAgICAgICAgdGhpcy52aXNpdEV4cHIocy50YXJnZXQpO1xuICAgICAgICAgICAgICAgIHRoaXMudmlzaXRFeHByKHMuaXRlcik7XG4gICAgICAgICAgICAgICAgdGhpcy5TRVFTdG10KHMuYm9keSk7XG4gICAgICAgICAgICAgICAgaWYgKHMub3JlbHNlKSB0aGlzLlNFUVN0bXQocy5vcmVsc2UpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5XaGlsZV86XG4gICAgICAgICAgICAgICAgdGhpcy52aXNpdEV4cHIocy50ZXN0KTtcbiAgICAgICAgICAgICAgICB0aGlzLlNFUVN0bXQocy5ib2R5KTtcbiAgICAgICAgICAgICAgICBpZiAocy5vcmVsc2UpIHRoaXMuU0VRU3RtdChzLm9yZWxzZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLklmXzpcbiAgICAgICAgICAgICAgICB0aGlzLnZpc2l0RXhwcihzLnRlc3QpO1xuICAgICAgICAgICAgICAgIHRoaXMuU0VRU3RtdChzLmJvZHkpO1xuICAgICAgICAgICAgICAgIGlmIChzLm9yZWxzZSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5TRVFTdG10KHMub3JlbHNlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuUmFpc2U6XG4gICAgICAgICAgICAgICAgaWYgKHMudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnZpc2l0RXhwcihzLnR5cGUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocy5pbnN0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnZpc2l0RXhwcihzLmluc3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHMudGJhY2spXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy52aXNpdEV4cHIocy50YmFjayk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlRyeUV4Y2VwdDpcbiAgICAgICAgICAgICAgICB0aGlzLlNFUVN0bXQocy5ib2R5KTtcbiAgICAgICAgICAgICAgICB0aGlzLlNFUVN0bXQocy5vcmVsc2UpO1xuICAgICAgICAgICAgICAgIHRoaXMudmlzaXRFeGNlcHRoYW5kbGVycyhzLmhhbmRsZXJzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuVHJ5RmluYWxseTpcbiAgICAgICAgICAgICAgICB0aGlzLlNFUVN0bXQocy5ib2R5KTtcbiAgICAgICAgICAgICAgICB0aGlzLlNFUVN0bXQocy5maW5hbGJvZHkpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5Bc3NlcnQ6XG4gICAgICAgICAgICAgICAgdGhpcy52aXNpdEV4cHIocy50ZXN0KTtcbiAgICAgICAgICAgICAgICBpZiAocy5tc2cpIHRoaXMudmlzaXRFeHByKHMubXNnKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuSW1wb3J0XzpcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuSW1wb3J0RnJvbTpcbiAgICAgICAgICAgICAgICB0aGlzLnZpc2l0QWxpYXMocy5uYW1lcywgcy5saW5lbm8pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5FeGVjOlxuICAgICAgICAgICAgICAgIHRoaXMudmlzaXRFeHByKHMuYm9keSk7XG4gICAgICAgICAgICAgICAgaWYgKHMuZ2xvYmFscykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnZpc2l0RXhwcihzLmdsb2JhbHMpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocy5sb2NhbHMpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnZpc2l0RXhwcihzLmxvY2Fscyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5HbG9iYWw6XG4gICAgICAgICAgICAgICAgdmFyIG5hbWVzbGVuID0gcy5uYW1lcy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuYW1lc2xlbjsgKytpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBuYW1lID0gbWFuZ2xlTmFtZSh0aGlzLmN1ckNsYXNzLCBzLm5hbWVzW2ldKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gICAgICAgICAgICAgIG5hbWUgPSBmaXhSZXNlcnZlZE5hbWVzKG5hbWUpO1xuICAgICAgICAgICAgICAgICAgICB2YXIgY3VyID0gdGhpcy5jdXIuc3ltRmxhZ3NbbmFtZV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXIgJiAoREVGX0xPQ0FMIHwgVVNFKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGN1ciAmIERFRl9MT0NBTCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IHN5bnRheEVycm9yKFwibmFtZSAnXCIgKyBuYW1lICsgXCInIGlzIGFzc2lnbmVkIHRvIGJlZm9yZSBnbG9iYWwgZGVjbGFyYXRpb25cIiwgdGhpcy5maWxlTmFtZSwgcy5saW5lbm8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgc3ludGF4RXJyb3IoXCJuYW1lICdcIiArIG5hbWUgKyBcIicgaXMgdXNlZCBwcmlvciB0byBnbG9iYWwgZGVjbGFyYXRpb25cIiwgdGhpcy5maWxlTmFtZSwgcy5saW5lbm8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkRGVmKG5hbWUsIERFRl9HTE9CQUwsIHMubGluZW5vKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkV4cHI6XG4gICAgICAgICAgICAgICAgdGhpcy52aXNpdEV4cHIocy52YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlBhc3M6XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkJyZWFrXzpcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuQ29udGludWVfOlxuICAgICAgICAgICAgICAgIC8vIG5vdGhpbmdcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuV2l0aF86XG4gICAgICAgICAgICAgICAgdGhpcy5uZXdUbXBuYW1lKHMubGluZW5vKTtcbiAgICAgICAgICAgICAgICB0aGlzLnZpc2l0RXhwcihzLmNvbnRleHRfZXhwcik7XG4gICAgICAgICAgICAgICAgaWYgKHMub3B0aW9uYWxfdmFycykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm5ld1RtcG5hbWUocy5saW5lbm8pO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnZpc2l0RXhwcihzLm9wdGlvbmFsX3ZhcnMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLlNFUVN0bXQocy5ib2R5KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICBcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgYXNzZXJ0cy5mYWlsKFwiVW5oYW5kbGVkIHR5cGUgXCIgKyBzLmNvbnN0cnVjdG9yLm5hbWUgKyBcIiBpbiB2aXNpdFN0bXRcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2aXNpdEV4cHIoZSkge1xuICAgICAgICBhc3NlcnRzLmFzc2VydChlICE9PSB1bmRlZmluZWQsIFwidmlzaXRFeHByIGNhbGxlZCB3aXRoIHVuZGVmaW5lZFwiKTtcbiAgICAgICAgLy9wcmludChcIiAgZTogXCIsIGUuY29uc3RydWN0b3IubmFtZSk7XG4gICAgICAgIHN3aXRjaCAoZS5jb25zdHJ1Y3Rvcikge1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5Cb29sT3A6XG4gICAgICAgICAgICAgICAgdGhpcy5TRVFFeHByKGUudmFsdWVzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuQmluT3A6XG4gICAgICAgICAgICAgICAgdGhpcy52aXNpdEV4cHIoZS5sZWZ0KTtcbiAgICAgICAgICAgICAgICB0aGlzLnZpc2l0RXhwcihlLnJpZ2h0KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuVW5hcnlPcDpcbiAgICAgICAgICAgICAgICB0aGlzLnZpc2l0RXhwcihlLm9wZXJhbmQpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5MYW1iZGE6XG4gICAgICAgICAgICAgICAgdGhpcy5hZGREZWYoXCJsYW1iZGFcIiwgREVGX0xPQ0FMLCBlLmxpbmVubyk7XG4gICAgICAgICAgICAgICAgaWYgKGUuYXJncy5kZWZhdWx0cylcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5TRVFFeHByKGUuYXJncy5kZWZhdWx0cyk7XG4gICAgICAgICAgICAgICAgdGhpcy5lbnRlckJsb2NrKFwibGFtYmRhXCIsIEZ1bmN0aW9uQmxvY2ssIGUsIGUubGluZW5vKTtcbiAgICAgICAgICAgICAgICB0aGlzLnZpc2l0QXJndW1lbnRzKGUuYXJncywgZS5saW5lbm8pO1xuICAgICAgICAgICAgICAgIHRoaXMudmlzaXRFeHByKGUuYm9keSk7XG4gICAgICAgICAgICAgICAgdGhpcy5leGl0QmxvY2soKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuSWZFeHA6XG4gICAgICAgICAgICAgICAgdGhpcy52aXNpdEV4cHIoZS50ZXN0KTtcbiAgICAgICAgICAgICAgICB0aGlzLnZpc2l0RXhwcihlLmJvZHkpO1xuICAgICAgICAgICAgICAgIHRoaXMudmlzaXRFeHByKGUub3JlbHNlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuRGljdDpcbiAgICAgICAgICAgICAgICB0aGlzLlNFUUV4cHIoZS5rZXlzKTtcbiAgICAgICAgICAgICAgICB0aGlzLlNFUUV4cHIoZS52YWx1ZXMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5MaXN0Q29tcDpcbiAgICAgICAgICAgICAgICB0aGlzLm5ld1RtcG5hbWUoZS5saW5lbm8pO1xuICAgICAgICAgICAgICAgIHRoaXMudmlzaXRFeHByKGUuZWx0KTtcbiAgICAgICAgICAgICAgICB0aGlzLnZpc2l0Q29tcHJlaGVuc2lvbihlLmdlbmVyYXRvcnMsIDApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5HZW5lcmF0b3JFeHA6XG4gICAgICAgICAgICAgICAgdGhpcy52aXNpdEdlbmV4cChlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuWWllbGQ6XG4gICAgICAgICAgICAgICAgaWYgKGUudmFsdWUpIHRoaXMudmlzaXRFeHByKGUudmFsdWUpO1xuICAgICAgICAgICAgICAgIHRoaXMuY3VyLmdlbmVyYXRvciA9IHRydWU7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY3VyLnJldHVybnNWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBzeW50YXhFcnJvcihcIidyZXR1cm4nIHdpdGggYXJndW1lbnQgaW5zaWRlIGdlbmVyYXRvclwiLCB0aGlzLmZpbGVOYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkNvbXBhcmU6XG4gICAgICAgICAgICAgICAgdGhpcy52aXNpdEV4cHIoZS5sZWZ0KTtcbiAgICAgICAgICAgICAgICB0aGlzLlNFUUV4cHIoZS5jb21wYXJhdG9ycyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkNhbGw6XG4gICAgICAgICAgICAgICAgdGhpcy52aXNpdEV4cHIoZS5mdW5jKTtcbiAgICAgICAgICAgICAgICB0aGlzLlNFUUV4cHIoZS5hcmdzKTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGUua2V5d29yZHMubGVuZ3RoOyArK2kpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudmlzaXRFeHByKGUua2V5d29yZHNbaV0udmFsdWUpO1xuICAgICAgICAgICAgICAgIC8vcHJpbnQoSlNPTi5zdHJpbmdpZnkoZS5zdGFyYXJncywgbnVsbCwgMikpO1xuICAgICAgICAgICAgICAgIC8vcHJpbnQoSlNPTi5zdHJpbmdpZnkoZS5rd2FyZ3MsIG51bGwsMikpO1xuICAgICAgICAgICAgICAgIGlmIChlLnN0YXJhcmdzKSB0aGlzLnZpc2l0RXhwcihlLnN0YXJhcmdzKTtcbiAgICAgICAgICAgICAgICBpZiAoZS5rd2FyZ3MpIHRoaXMudmlzaXRFeHByKGUua3dhcmdzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuTnVtOlxuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5TdHI6XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkF0dHJpYnV0ZTpcbiAgICAgICAgICAgICAgICB0aGlzLnZpc2l0RXhwcihlLnZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuU3Vic2NyaXB0OlxuICAgICAgICAgICAgICAgIHRoaXMudmlzaXRFeHByKGUudmFsdWUpO1xuICAgICAgICAgICAgICAgIHRoaXMudmlzaXRTbGljZShlLnNsaWNlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuTmFtZTpcbiAgICAgICAgICAgICAgICB0aGlzLmFkZERlZihlLmlkLCBlLmN0eCA9PT0gYXN0bm9kZXMuTG9hZCA/IFVTRSA6IERFRl9MT0NBTCwgZS5saW5lbm8pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5MaXN0OlxuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5UdXBsZTpcbiAgICAgICAgICAgICAgICB0aGlzLlNFUUV4cHIoZS5lbHRzKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgYXNzZXJ0cy5mYWlsKFwiVW5oYW5kbGVkIHR5cGUgXCIgKyBlLmNvbnN0cnVjdG9yLm5hbWUgKyBcIiBpbiB2aXNpdEV4cHJcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2aXNpdENvbXByZWhlbnNpb24obGNzLCBzdGFydEF0KSB7XG4gICAgICAgIHZhciBsZW4gPSBsY3MubGVuZ3RoO1xuICAgICAgICBmb3IgKHZhciBpID0gc3RhcnRBdDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgICAgICB2YXIgbGMgPSBsY3NbaV07XG4gICAgICAgICAgICB0aGlzLnZpc2l0RXhwcihsYy50YXJnZXQpO1xuICAgICAgICAgICAgdGhpcy52aXNpdEV4cHIobGMuaXRlcik7XG4gICAgICAgICAgICB0aGlzLlNFUUV4cHIobGMuaWZzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoaXMgaXMgcHJvYmFibHkgbm90IGNvcnJlY3QgZm9yIG5hbWVzLiBXaGF0IGFyZSB0aGV5P1xuICAgICAqIEBwYXJhbSB7QXJyYXkuPE9iamVjdD59IG5hbWVzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGxpbmVub1xuICAgICAqL1xuICAgIHZpc2l0QWxpYXMobmFtZXMsIGxpbmVubykge1xuICAgICAgICAvKiBDb21wdXRlIHN0b3JlX25hbWUsIHRoZSBuYW1lIGFjdHVhbGx5IGJvdW5kIGJ5IHRoZSBpbXBvcnRcbiAgICAgICAgICAgIG9wZXJhdGlvbi4gIEl0IGlzIGRpZmVyZW50IHRoYW4gYS0+bmFtZSB3aGVuIGEtPm5hbWUgaXMgYVxuICAgICAgICAgICAgZG90dGVkIHBhY2thZ2UgbmFtZSAoZS5nLiBzcGFtLmVnZ3MpXG4gICAgICAgICovXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbmFtZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBhID0gbmFtZXNbaV07XG4gICAgICAgICAgICAvLyBER0g6IFRoZSBSSFMgdXNlZCB0byBiZSBQeXRob24gc3RyaW5ncy5cbiAgICAgICAgICAgIHZhciBuYW1lID0gYS5hc25hbWUgPT09IG51bGwgPyBhLm5hbWUgOiBhLmFzbmFtZTtcbiAgICAgICAgICAgIHZhciBzdG9yZW5hbWUgPSBuYW1lO1xuICAgICAgICAgICAgdmFyIGRvdCA9IG5hbWUuaW5kZXhPZignLicpO1xuICAgICAgICAgICAgaWYgKGRvdCAhPT0gLTEpXG4gICAgICAgICAgICAgICAgc3RvcmVuYW1lID0gbmFtZS5zdWJzdHIoMCwgZG90KTtcbiAgICAgICAgICAgIGlmIChuYW1lICE9PSBcIipcIikge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkRGVmKHN0b3JlbmFtZSwgREVGX0lNUE9SVCwgbGluZW5vKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1ci5ibG9ja1R5cGUgIT09IE1vZHVsZUJsb2NrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IHN5bnRheEVycm9yKFwiaW1wb3J0ICogb25seSBhbGxvd2VkIGF0IG1vZHVsZSBsZXZlbFwiLCB0aGlzLmZpbGVOYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZVxuICAgICAqL1xuICAgIHZpc2l0R2VuZXhwKGUpIHtcbiAgICAgICAgdmFyIG91dGVybW9zdCA9IGUuZ2VuZXJhdG9yc1swXTtcbiAgICAgICAgLy8gb3V0ZXJtb3N0IGlzIGV2YWxlZCBpbiBjdXJyZW50IHNjb3BlXG4gICAgICAgIHRoaXMudmlzaXRFeHByKG91dGVybW9zdC5pdGVyKTtcbiAgICAgICAgdGhpcy5lbnRlckJsb2NrKFwiZ2VuZXhwclwiLCBGdW5jdGlvbkJsb2NrLCBlLCBlLmxpbmVubyk7XG4gICAgICAgIHRoaXMuY3VyLmdlbmVyYXRvciA9IHRydWU7XG4gICAgICAgIHRoaXMuYWRkRGVmKFwiLjBcIiwgREVGX1BBUkFNLCBlLmxpbmVubyk7XG4gICAgICAgIHRoaXMudmlzaXRFeHByKG91dGVybW9zdC50YXJnZXQpO1xuICAgICAgICB0aGlzLlNFUUV4cHIob3V0ZXJtb3N0Lmlmcyk7XG4gICAgICAgIHRoaXMudmlzaXRDb21wcmVoZW5zaW9uKGUuZ2VuZXJhdG9ycywgMSk7XG4gICAgICAgIHRoaXMudmlzaXRFeHByKGUuZWx0KTtcbiAgICAgICAgdGhpcy5leGl0QmxvY2soKTtcbiAgICB9XG5cbiAgICB2aXNpdEV4Y2VwdGhhbmRsZXJzKGhhbmRsZXJzKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBlaDsgZWggPSBoYW5kbGVyc1tpXTsgKytpKSB7XG4gICAgICAgICAgICBpZiAoZWgudHlwZSkgdGhpcy52aXNpdEV4cHIoZWgudHlwZSk7XG4gICAgICAgICAgICBpZiAoZWgubmFtZSkgdGhpcy52aXNpdEV4cHIoZWgubmFtZSk7XG4gICAgICAgICAgICB0aGlzLlNFUVN0bXQoZWguYm9keSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gc3RlIFRoZSBTeW1ib2wgVGFibGUgU2NvcGUuXG4gICAgICovXG4gICAgYW5hbHl6ZUJsb2NrKHN0ZTogU3ltYm9sVGFibGVTY29wZSwgYm91bmQsIGZyZWUsIGdsb2JhbCkge1xuICAgICAgICB2YXIgbG9jYWwgPSB7fTtcbiAgICAgICAgdmFyIHNjb3BlID0ge307XG4gICAgICAgIHZhciBuZXdnbG9iYWwgPSB7fTtcbiAgICAgICAgdmFyIG5ld2JvdW5kID0ge307XG4gICAgICAgIHZhciBuZXdmcmVlID0ge307XG4gICAgXG4gICAgICAgIGlmIChzdGUuYmxvY2tUeXBlID09IENsYXNzQmxvY2spIHtcbiAgICAgICAgICAgIF9kaWN0VXBkYXRlKG5ld2dsb2JhbCwgZ2xvYmFsKTtcbiAgICAgICAgICAgIGlmIChib3VuZClcbiAgICAgICAgICAgICAgICBfZGljdFVwZGF0ZShuZXdib3VuZCwgYm91bmQpO1xuICAgICAgICB9XG4gICAgXG4gICAgICAgIGZvciAodmFyIG5hbWUgaW4gc3RlLnN5bUZsYWdzKSB7XG4gICAgICAgICAgICB2YXIgZmxhZ3MgPSBzdGUuc3ltRmxhZ3NbbmFtZV07XG4gICAgICAgICAgICB0aGlzLmFuYWx5emVOYW1lKHN0ZSwgc2NvcGUsIG5hbWUsIGZsYWdzLCBib3VuZCwgbG9jYWwsIGZyZWUsIGdsb2JhbCk7XG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgaWYgKHN0ZS5ibG9ja1R5cGUgIT09IENsYXNzQmxvY2spIHtcbiAgICAgICAgICAgIGlmIChzdGUuYmxvY2tUeXBlID09PSBGdW5jdGlvbkJsb2NrKVxuICAgICAgICAgICAgICAgIF9kaWN0VXBkYXRlKG5ld2JvdW5kLCBsb2NhbCk7XG4gICAgICAgICAgICBpZiAoYm91bmQpXG4gICAgICAgICAgICAgICAgX2RpY3RVcGRhdGUobmV3Ym91bmQsIGJvdW5kKTtcbiAgICAgICAgICAgIF9kaWN0VXBkYXRlKG5ld2dsb2JhbCwgZ2xvYmFsKTtcbiAgICAgICAgfVxuICAgIFxuICAgICAgICB2YXIgYWxsZnJlZSA9IHt9O1xuICAgICAgICB2YXIgY2hpbGRsZW4gPSBzdGUuY2hpbGRyZW4ubGVuZ3RoO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNoaWxkbGVuOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBjID0gc3RlLmNoaWxkcmVuW2ldO1xuICAgICAgICAgICAgdGhpcy5hbmFseXplQ2hpbGRCbG9jayhjLCBuZXdib3VuZCwgbmV3ZnJlZSwgbmV3Z2xvYmFsLCBhbGxmcmVlKTtcbiAgICAgICAgICAgIGlmIChjLmhhc0ZyZWUgfHwgYy5jaGlsZEhhc0ZyZWUpXG4gICAgICAgICAgICAgICAgc3RlLmNoaWxkSGFzRnJlZSA9IHRydWU7XG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgX2RpY3RVcGRhdGUobmV3ZnJlZSwgYWxsZnJlZSk7XG5cbiAgICAgICAgaWYgKHN0ZS5ibG9ja1R5cGUgPT09IEZ1bmN0aW9uQmxvY2spIHRoaXMuYW5hbHl6ZUNlbGxzKHNjb3BlLCBuZXdmcmVlKTtcblxuICAgICAgICB0aGlzLnVwZGF0ZVN5bWJvbHMoc3RlLnN5bUZsYWdzLCBzY29wZSwgYm91bmQsIG5ld2ZyZWUsIHN0ZS5ibG9ja1R5cGUgPT09IENsYXNzQmxvY2spO1xuICAgIFxuICAgICAgICBfZGljdFVwZGF0ZShmcmVlLCBuZXdmcmVlKTtcbiAgICB9XG4gICAgXG4gICAgYW5hbHl6ZUNoaWxkQmxvY2soZW50cnksIGJvdW5kLCBmcmVlLCBnbG9iYWwsIGNoaWxkRnJlZSkge1xuICAgICAgICB2YXIgdGVtcEJvdW5kID0ge307XG4gICAgICAgIF9kaWN0VXBkYXRlKHRlbXBCb3VuZCwgYm91bmQpO1xuICAgICAgICB2YXIgdGVtcEZyZWUgPSB7fTtcbiAgICAgICAgX2RpY3RVcGRhdGUodGVtcEZyZWUsIGZyZWUpO1xuICAgICAgICB2YXIgdGVtcEdsb2JhbCA9IHt9O1xuICAgICAgICBfZGljdFVwZGF0ZSh0ZW1wR2xvYmFsLCBnbG9iYWwpO1xuICAgIFxuICAgICAgICB0aGlzLmFuYWx5emVCbG9jayhlbnRyeSwgdGVtcEJvdW5kLCB0ZW1wRnJlZSwgdGVtcEdsb2JhbCk7XG4gICAgICAgIF9kaWN0VXBkYXRlKGNoaWxkRnJlZSwgdGVtcEZyZWUpO1xuICAgIH1cblxuICAgIGFuYWx5emVDZWxscyhzY29wZSwgZnJlZSkge1xuICAgICAgICBmb3IgKHZhciBuYW1lIGluIHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgZmxhZ3MgPSBzY29wZVtuYW1lXTtcbiAgICAgICAgICAgIGlmIChmbGFncyAhPT0gTE9DQUwpIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKGZyZWVbbmFtZV0gPT09IHVuZGVmaW5lZCkgY29udGludWU7XG4gICAgICAgICAgICBzY29wZVtuYW1lXSA9IENFTEw7XG4gICAgICAgICAgICBkZWxldGUgZnJlZVtuYW1lXTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHN0b3JlIHNjb3BlIGluZm8gYmFjayBpbnRvIHRoZSBzdCBzeW1ib2xzIGRpY3QuIHN5bWJvbHMgaXMgbW9kaWZpZWQsXG4gICAgICogb3RoZXJzIGFyZSBub3QuXG4gICAgICovXG4gICAgdXBkYXRlU3ltYm9scyhzeW1ib2xzLCBzY29wZSwgYm91bmQsIGZyZWUsIGNsYXNzZmxhZykge1xuXG4gICAgICAgIGZvciAodmFyIG5hbWUgaW4gc3ltYm9scykge1xuICAgICAgICAgICAgdmFyIGZsYWdzID0gc3ltYm9sc1tuYW1lXTtcbiAgICAgICAgICAgIHZhciB3ID0gc2NvcGVbbmFtZV07XG4gICAgICAgICAgICBmbGFncyB8PSB3IDw8IFNDT1BFX09GRjtcbiAgICAgICAgICAgIHN5bWJvbHNbbmFtZV0gPSBmbGFncztcbiAgICAgICAgfVxuICAgIFxuICAgICAgICB2YXIgZnJlZVZhbHVlID0gRlJFRSA8PCBTQ09QRV9PRkY7XG4gICAgICAgIHZhciBwb3MgPSAwO1xuICAgICAgICBmb3IgKHZhciBuYW1lIGluIGZyZWUpIHtcbiAgICAgICAgICAgIHZhciBvID0gc3ltYm9sc1tuYW1lXTtcbiAgICAgICAgICAgIGlmIChvICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBpdCBjb3VsZCBiZSBhIGZyZWUgdmFyaWFibGUgaW4gYSBtZXRob2Qgb2YgdGhlIGNsYXNzIHRoYXQgaGFzXG4gICAgICAgICAgICAgICAgLy8gdGhlIHNhbWUgbmFtZSBhcyBhIGxvY2FsIG9yIGdsb2JhbCBpbiB0aGUgY2xhc3Mgc2NvcGVcbiAgICAgICAgICAgICAgICBpZiAoY2xhc3NmbGFnICYmIChvICYgKERFRl9CT1VORCB8IERFRl9HTE9CQUwpKSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgaSA9IG8gfCBERUZfRlJFRV9DTEFTUztcbiAgICAgICAgICAgICAgICAgICAgc3ltYm9sc1tuYW1lXSA9IGk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIGVsc2UgaXQncyBub3QgZnJlZSwgcHJvYmFibHkgYSBjZWxsXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYm91bmRbbmFtZV0gPT09IHVuZGVmaW5lZCkgY29udGludWU7XG4gICAgICAgICAgICBzeW1ib2xzW25hbWVdID0gZnJlZVZhbHVlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHN0ZSBUaGUgU3ltYm9sIFRhYmxlIFNjb3BlLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG4gICAgICovXG4gICAgYW5hbHl6ZU5hbWUoc3RlOiBTeW1ib2xUYWJsZVNjb3BlLCBkaWN0LCBuYW1lLCBmbGFncywgYm91bmQsIGxvY2FsLCBmcmVlLCBnbG9iYWwpIHtcbiAgICAgICAgaWYgKGZsYWdzICYgREVGX0dMT0JBTCkge1xuICAgICAgICAgICAgaWYgKGZsYWdzICYgREVGX1BBUkFNKSB0aHJvdyBzeW50YXhFcnJvcihcIm5hbWUgJ1wiICsgbmFtZSArIFwiJyBpcyBsb2NhbCBhbmQgZ2xvYmFsXCIsIHRoaXMuZmlsZU5hbWUsIHN0ZS5saW5lbm8pO1xuICAgICAgICAgICAgZGljdFtuYW1lXSA9IEdMT0JBTF9FWFBMSUNJVDtcbiAgICAgICAgICAgIGdsb2JhbFtuYW1lXSA9IG51bGw7XG4gICAgICAgICAgICBpZiAoYm91bmQgJiYgYm91bmRbbmFtZV0gIT09IHVuZGVmaW5lZCkgZGVsZXRlIGJvdW5kW25hbWVdO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChmbGFncyAmIERFRl9CT1VORCkge1xuICAgICAgICAgICAgZGljdFtuYW1lXSA9IExPQ0FMO1xuICAgICAgICAgICAgbG9jYWxbbmFtZV0gPSBudWxsO1xuICAgICAgICAgICAgZGVsZXRlIGdsb2JhbFtuYW1lXTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIFxuICAgICAgICBpZiAoYm91bmQgJiYgYm91bmRbbmFtZV0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgZGljdFtuYW1lXSA9IEZSRUU7XG4gICAgICAgICAgICBzdGUuaGFzRnJlZSA9IHRydWU7XG4gICAgICAgICAgICBmcmVlW25hbWVdID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChnbG9iYWwgJiYgZ2xvYmFsW25hbWVdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGRpY3RbbmFtZV0gPSBHTE9CQUxfSU1QTElDSVQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBpZiAoc3RlLmlzTmVzdGVkKVxuICAgICAgICAgICAgICAgIHN0ZS5oYXNGcmVlID0gdHJ1ZTtcbiAgICAgICAgICAgIGRpY3RbbmFtZV0gPSBHTE9CQUxfSU1QTElDSVQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhbmFseXplKCkge1xuICAgICAgICB2YXIgZnJlZSA9IHt9O1xuICAgICAgICB2YXIgZ2xvYmFsID0ge307XG4gICAgICAgIHRoaXMuYW5hbHl6ZUJsb2NrKHRoaXMudG9wLCBudWxsLCBmcmVlLCBnbG9iYWwpO1xuICAgIH1cbiAgICBcbn1cblxuZnVuY3Rpb24gX2RpY3RVcGRhdGUoYSwgYikge1xuICAgIGZvciAodmFyIGtiIGluIGIpIHtcbiAgICAgICAgYVtrYl0gPSBiW2tiXTtcbiAgICB9XG59XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHN5bWJvbCB0YWJsZSBmb3IgdGhlIEFTVCBtb2R1bGUuXG4gKiBAcGFyYW0ge09iamVjdH0gbW9kdWxlXG4gKiBAcGFyYW0ge3N0cmluZ30gZmlsZU5hbWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN5bWJvbFRhYmxlKG1vZHVsZTogYXN0bm9kZXMuTW9kdWxlLCBmaWxlTmFtZTogc3RyaW5nKTogU3ltYm9sVGFibGUge1xuICAgIHZhciByZXQgPSBuZXcgU3ltYm9sVGFibGUoZmlsZU5hbWUpO1xuXG4gICAgcmV0LmVudGVyQmxvY2soXCJ0b3BcIiwgTW9kdWxlQmxvY2ssIG1vZHVsZSwgMCk7XG5cbiAgICByZXQudG9wID0gcmV0LmN1cjtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbW9kdWxlLmJvZHkubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgcmV0LnZpc2l0U3RtdChtb2R1bGUuYm9keVtpXSk7XG4gICAgfVxuXG4gICAgcmV0LmV4aXRCbG9jaygpO1xuXG4gICAgcmV0LmFuYWx5emUoKTtcblxuICAgIHJldHVybiByZXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkdW1wU3ltYm9sVGFibGUoc3Q6IFN5bWJvbFRhYmxlKSB7XG5cbiAgICB2YXIgcHlCb29sU3RyID0gZnVuY3Rpb24oYjogYm9vbGVhbikge1xuICAgICAgICByZXR1cm4gYiA/IFwiVHJ1ZVwiIDogXCJGYWxzZVwiO1xuICAgIH07XG5cbiAgICB2YXIgcHlMaXN0ID0gZnVuY3Rpb24obCkge1xuICAgICAgICB2YXIgcmV0ID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbC5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgLy8gVE9ETzogT3JpZ2luYWxseSwgdGhpcyBjb21wdXRlZCB0aGUgUHl0aG9uIHJlcHIoKS5cbiAgICAgICAgICAgIHJldC5wdXNoKGxbaV0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnWycgKyByZXQuam9pbignLCAnKSArICddJztcbiAgICB9O1xuXG4gICAgdmFyIGdldElkZW50cyA9IGZ1bmN0aW9uKG9iajogU3ltYm9sVGFibGVTY29wZSwgaW5kZW50OiBzdHJpbmcpIHtcbiAgICAgICAgaWYgKGluZGVudCA9PT0gdW5kZWZpbmVkKSBpbmRlbnQgPSBcIlwiO1xuICAgICAgICB2YXIgcmV0ID0gXCJcIjtcbiAgICAgICAgcmV0ICs9IGluZGVudCArIFwiU3ltX3R5cGU6IFwiICsgb2JqLmdldF90eXBlKCkgKyBcIlxcblwiO1xuICAgICAgICByZXQgKz0gaW5kZW50ICsgXCJTeW1fbmFtZTogXCIgKyBvYmouZ2V0X25hbWUoKSArIFwiXFxuXCI7XG4gICAgICAgIHJldCArPSBpbmRlbnQgKyBcIlN5bV9saW5lbm86IFwiICsgb2JqLmdldF9saW5lbm8oKSArIFwiXFxuXCI7XG4gICAgICAgIHJldCArPSBpbmRlbnQgKyBcIlN5bV9uZXN0ZWQ6IFwiICsgcHlCb29sU3RyKG9iai5pc19uZXN0ZWQoKSkgKyBcIlxcblwiO1xuICAgICAgICByZXQgKz0gaW5kZW50ICsgXCJTeW1faGFzY2hpbGRyZW46IFwiICsgcHlCb29sU3RyKG9iai5oYXNfY2hpbGRyZW4oKSkgKyBcIlxcblwiO1xuICAgICAgICBpZiAob2JqLmdldF90eXBlKCkgPT09IFwiY2xhc3NcIikge1xuICAgICAgICAgICAgcmV0ICs9IGluZGVudCArIFwiQ2xhc3NfbWV0aG9kczogXCIgKyBweUxpc3Qob2JqLmdldF9tZXRob2RzKCkpICsgXCJcXG5cIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChvYmouZ2V0X3R5cGUoKSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICByZXQgKz0gaW5kZW50ICsgXCJGdW5jX3BhcmFtczogXCIgKyBweUxpc3Qob2JqLmdldF9wYXJhbWV0ZXJzKCkpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldCArPSBpbmRlbnQgKyBcIkZ1bmNfbG9jYWxzOiBcIiArIHB5TGlzdChvYmouZ2V0X2xvY2FscygpKSArIFwiXFxuXCI7XG4gICAgICAgICAgICByZXQgKz0gaW5kZW50ICsgXCJGdW5jX2dsb2JhbHM6IFwiICsgcHlMaXN0KG9iai5nZXRfZ2xvYmFscygpKSArIFwiXFxuXCI7XG4gICAgICAgICAgICByZXQgKz0gaW5kZW50ICsgXCJGdW5jX2ZyZWVzOiBcIiArIHB5TGlzdChvYmouZ2V0X2ZyZWVzKCkpICsgXCJcXG5cIjtcbiAgICAgICAgfVxuICAgICAgICByZXQgKz0gaW5kZW50ICsgXCItLSBJZGVudGlmaWVycyAtLVxcblwiO1xuICAgICAgICB2YXIgb2JqaWRlbnRzID0gb2JqLmdldF9pZGVudGlmaWVycygpO1xuICAgICAgICB2YXIgb2JqaWRlbnRzbGVuID0gb2JqaWRlbnRzLmxlbmd0aDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvYmppZGVudHNsZW47ICsraSkge1xuICAgICAgICAgICAgdmFyIGluZm8gPSBvYmoubG9va3VwKG9iamlkZW50c1tpXSk7XG4gICAgICAgICAgICByZXQgKz0gaW5kZW50ICsgXCJuYW1lOiBcIiArIGluZm8uZ2V0X25hbWUoKSArIFwiXFxuXCI7XG4gICAgICAgICAgICByZXQgKz0gaW5kZW50ICsgXCIgIGlzX3JlZmVyZW5jZWQ6IFwiICsgcHlCb29sU3RyKGluZm8uaXNfcmVmZXJlbmNlZCgpKSArIFwiXFxuXCI7XG4gICAgICAgICAgICByZXQgKz0gaW5kZW50ICsgXCIgIGlzX2ltcG9ydGVkOiBcIiArIHB5Qm9vbFN0cihpbmZvLmlzX2ltcG9ydGVkKCkpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldCArPSBpbmRlbnQgKyBcIiAgaXNfcGFyYW1ldGVyOiBcIiArIHB5Qm9vbFN0cihpbmZvLmlzX3BhcmFtZXRlcigpKSArIFwiXFxuXCI7XG4gICAgICAgICAgICByZXQgKz0gaW5kZW50ICsgXCIgIGlzX2dsb2JhbDogXCIgKyBweUJvb2xTdHIoaW5mby5pc19nbG9iYWwoKSkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0ICs9IGluZGVudCArIFwiICBpc19kZWNsYXJlZF9nbG9iYWw6IFwiICsgcHlCb29sU3RyKGluZm8uaXNfZGVjbGFyZWRfZ2xvYmFsKCkpICsgXCJcXG5cIjtcbiAgICAgICAgICAgIHJldCArPSBpbmRlbnQgKyBcIiAgaXNfbG9jYWw6IFwiICsgcHlCb29sU3RyKGluZm8uaXNfbG9jYWwoKSkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0ICs9IGluZGVudCArIFwiICBpc19mcmVlOiBcIiArIHB5Qm9vbFN0cihpbmZvLmlzX2ZyZWUoKSkgKyBcIlxcblwiO1xuICAgICAgICAgICAgcmV0ICs9IGluZGVudCArIFwiICBpc19hc3NpZ25lZDogXCIgKyBweUJvb2xTdHIoaW5mby5pc19hc3NpZ25lZCgpKSArIFwiXFxuXCI7XG4gICAgICAgICAgICByZXQgKz0gaW5kZW50ICsgXCIgIGlzX25hbWVzcGFjZTogXCIgKyBweUJvb2xTdHIoaW5mby5pc19uYW1lc3BhY2UoKSkgKyBcIlxcblwiO1xuICAgICAgICAgICAgdmFyIG5zcyA9IGluZm8uZ2V0X25hbWVzcGFjZXMoKTtcbiAgICAgICAgICAgIHZhciBuc3NsZW4gPSBuc3MubGVuZ3RoO1xuICAgICAgICAgICAgcmV0ICs9IGluZGVudCArIFwiICBuYW1lc3BhY2VzOiBbXFxuXCI7XG4gICAgICAgICAgICB2YXIgc3ViID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IG5zc2xlbjsgKytqKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5zID0gbnNzW2pdO1xuICAgICAgICAgICAgICAgIHN1Yi5wdXNoKGdldElkZW50cyhucywgaW5kZW50ICsgXCIgICAgXCIpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldCArPSBzdWIuam9pbignXFxuJyk7XG4gICAgICAgICAgICByZXQgKz0gaW5kZW50ICsgJyAgXVxcbic7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICB9O1xuICAgIHJldHVybiBnZXRJZGVudHMoc3QudG9wLCAnJyk7XG59O1xuIl19