var asserts = require('./asserts');
var astnodes = require('./astnodes');
var builder = require('./builder');
var parser = require('./Parser');
var symtable = require('./symtable');
var LOCAL = symtable.LOCAL;
var GLOBAL_EXPLICIT = symtable.GLOBAL_EXPLICIT;
var GLOBAL_IMPLICIT = symtable.GLOBAL_IMPLICIT;
var FREE = symtable.FREE;
var CELL = symtable.CELL;
var FunctionBlock = symtable.FunctionBlock;
var out;
var gensymcount = 0;
var reservedWords_ = {
    'abstract': true,
    'as': true,
    'boolean': true,
    'break': true,
    'byte': true,
    'case': true,
    'catch': true,
    'char': true,
    'class': true,
    'continue': true,
    'const': true,
    'debugger': true,
    'default': true,
    'delete': true,
    'do': true,
    'double': true,
    'else': true,
    'enum': true,
    'export': true,
    'extends': true,
    'false': true,
    'final': true,
    'finally': true,
    'float': true,
    'for': true,
    'function': true,
    'goto': true,
    'if': true,
    'implements': true,
    'import': true,
    'in': true,
    'instanceof': true,
    'int': true,
    'interface': true,
    'is': true,
    'long': true,
    'namespace': true,
    'native': true,
    'new': true,
    'null': true,
    'package': true,
    'private': true,
    'protected': true,
    'public': true,
    'return': true,
    'short': true,
    'static': true,
    'super': false,
    'switch': true,
    'synchronized': true,
    'this': true,
    'throw': true,
    'throws': true,
    'transient': true,
    'true': true,
    'try': true,
    'typeof': true,
    'use': true,
    'var': true,
    'void': true,
    'volatile': true,
    'while': true,
    'with': true
};
function fixReservedWords(name) {
    if (reservedWords_[name] !== true) {
        return name;
    }
    else {
        return name + "_$rw$";
    }
}
var reservedNames_ = {
    '__defineGetter__': true,
    '__defineSetter__': true,
    'apply': true,
    'call': true,
    'eval': true,
    'hasOwnProperty': true,
    'isPrototypeOf': true,
    '__lookupGetter__': true,
    '__lookupSetter__': true,
    '__noSuchMethod__': true,
    'propertyIsEnumerable': true,
    'toSource': true,
    'toLocaleString': true,
    'toString': true,
    'unwatch': true,
    'valueOf': true,
    'watch': true,
    'length': true
};
function fixReservedNames(name) {
    if (reservedNames_[name]) {
        return name + "_$rn$";
    }
    else {
        return name;
    }
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
    return '_' + strpriv + name;
}
var toStringLiteralJS = function (value) {
    var quote = "'";
    if (value.indexOf("'") !== -1 && value.indexOf('"') === -1) {
        quote = '"';
    }
    var len = value.length;
    var ret = quote;
    for (var i = 0; i < len; ++i) {
        var c = value.charAt(i);
        if (c === quote || c === '\\')
            ret += '\\' + c;
        else if (c === '\t')
            ret += '\\t';
        else if (c === '\n')
            ret += '\\n';
        else if (c === '\r')
            ret += '\\r';
        else if (c < ' ' || c >= 0x7f) {
            var ashex = c.charCodeAt(0).toString(16);
            if (ashex.length < 2)
                ashex = "0" + ashex;
            ret += "\\x" + ashex;
        }
        else
            ret += c;
    }
    ret += quote;
    return ret;
};
var OP_FAST = 0;
var OP_GLOBAL = 1;
var OP_DEREF = 2;
var OP_NAME = 3;
var D_NAMES = 0;
var D_FREEVARS = 1;
var D_CELLVARS = 2;
var CompilerUnit = (function () {
    function CompilerUnit() {
        this.ste = null;
        this.name = null;
        this.private_ = null;
        this.firstlineno = 0;
        this.lineno = 0;
        this.linenoSet = false;
        this.localnames = [];
        this.blocknum = 0;
        this.blocks = [];
        this.curblock = 0;
        this.scopename = null;
        this.prefixCode = '';
        this.varDeclsCode = '';
        this.switchCode = '';
        this.suffixCode = '';
        this.breakBlocks = [];
        this.continueBlocks = [];
        this.exceptBlocks = [];
        this.finallyBlocks = [];
    }
    CompilerUnit.prototype.activateScope = function () {
        var self = this;
        out = function () {
            var b = self.blocks[self.curblock];
            for (var i = 0; i < arguments.length; ++i)
                b.push(arguments[i]);
        };
    };
    return CompilerUnit;
})();
var Compiler = (function () {
    function Compiler(fileName, st, flags, sourceCodeForAnnotation) {
        this.interactive = false;
        this.nestlevel = 0;
        this.u = null;
        this.stack = [];
        this.result = [];
        this.allUnits = [];
        this._gr = function (hint) {
            var rest = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                rest[_i - 1] = arguments[_i];
            }
            var v = this.gensym(hint);
            out("var ", v, "=");
            for (var i = 1; i < arguments.length; ++i) {
                out(arguments[i]);
            }
            out(";");
            return v;
        };
        this.clistcompgen = function (tmpname, generators, genIndex, elt) {
            var start = this.newBlock('list gen start');
            var skip = this.newBlock('list gen skip');
            var anchor = this.newBlock('list gen anchor');
            var l = generators[genIndex];
            var toiter = this.vexpr(l.iter);
            var iter = this._gr("iter", "Sk.abstr.iter(", toiter, ")");
            this._jump(start);
            this.setBlock(start);
            var nexti = this._gr('next', "Sk.abstr.iternext(", iter, ")");
            this._jumpundef(nexti, anchor);
            var target = this.vexpr(l.target, nexti);
            var n = l.ifs.length;
            for (var i = 0; i < n; ++i) {
                var ifres = this.vexpr(l.ifs[i]);
                this._jumpfalse(ifres, start);
            }
            if (++genIndex < generators.length) {
                this.clistcompgen(tmpname, generators, genIndex, elt);
            }
            if (genIndex >= generators.length) {
                var velt = this.vexpr(elt);
                out(tmpname, ".v.push(", velt, ");");
                this._jump(skip);
                this.setBlock(skip);
            }
            this._jump(start);
            this.setBlock(anchor);
            return tmpname;
        };
        this.fileName = fileName;
        this.st = st;
        this.flags = flags;
        this.source = sourceCodeForAnnotation ? sourceCodeForAnnotation.split("\n") : false;
    }
    Compiler.prototype.getSourceLine = function (lineno) {
        asserts.assert(this.source);
        return this.source[lineno - 1];
    };
    Compiler.prototype.annotateSource = function (ast) {
        if (this.source) {
            out('\n//');
            out('\n// line ', ast.lineno, ':');
            out('\n// ', this.getSourceLine(ast.lineno));
            out('\n// ');
            for (var i = 0; i < ast.col_offset; ++i) {
                out(" ");
            }
            out("^");
            out("\n//");
            out('\nSk.currLineNo = ', ast.lineno, ';Sk.currColNo = ', ast.col_offset, ';');
            out("\nSk.currFilename = '", this.fileName, "';\n\n");
        }
    };
    Compiler.prototype.gensym = function (hint) {
        hint = hint || '';
        hint = '$' + hint;
        hint += gensymcount++;
        return hint;
    };
    Compiler.prototype.niceName = function (roughName) {
        return this.gensym(roughName.replace("<", "").replace(">", "").replace(" ", "_"));
    };
    Compiler.prototype._interruptTest = function () {
        out("if (typeof Sk.execStart === 'undefined') {Sk.execStart=new Date()}");
        out("if (Sk.execLimit !== null && new Date() - Sk.execStart > Sk.execLimit) {throw new Sk.builtin.TimeLimitError(Sk.timeoutMsg())}");
    };
    Compiler.prototype._jumpfalse = function (test, block) {
        var cond = this._gr('jfalse', "(", test, "===false||!Sk.misceval.isTrue(", test, "))");
        this._interruptTest();
        out("if(", cond, "){/*test failed */$blk=", block, ";continue;}");
    };
    Compiler.prototype._jumpundef = function (test, block) {
        this._interruptTest();
        out("if(typeof ", test, " === 'undefined'){$blk=", block, ";continue;}");
    };
    Compiler.prototype._jumptrue = function (test, block) {
        var cond = this._gr('jtrue', "(", test, "===true||Sk.misceval.isTrue(", test, "))");
        this._interruptTest();
        out("if(", cond, "){/*test passed */$blk=", block, ";continue;}");
    };
    Compiler.prototype._jump = function (block) {
        this._interruptTest();
        out("$blk=", block, ";/* jump */continue;");
    };
    Compiler.prototype.ctupleorlist = function (e, data, tuporlist) {
        asserts.assert(tuporlist === 'tuple' || tuporlist === 'list');
        if (e.ctx === astnodes.Store) {
            for (var i = 0; i < e.elts.length; ++i) {
                this.vexpr(e.elts[i], "Sk.abstr.objectGetItem(" + data + "," + i + ")");
            }
        }
        else if (e.ctx === astnodes.Load) {
            var items = [];
            for (var i = 0; i < e.elts.length; ++i) {
                items.push(this._gr('elem', this.vexpr(e.elts[i])));
            }
            return this._gr('load' + tuporlist, "new Sk.builtins['", tuporlist, "']([", items, "])");
        }
    };
    Compiler.prototype.cdict = function (e) {
        asserts.assert(e.values.length === e.keys.length);
        var items = [];
        for (var i = 0; i < e.values.length; ++i) {
            var v = this.vexpr(e.values[i]);
            items.push(this.vexpr(e.keys[i]));
            items.push(v);
        }
        return this._gr('loaddict', "new Sk.builtins['dict']([", items, "])");
    };
    Compiler.prototype.clistcomp = function (e) {
        asserts.assert(e instanceof astnodes.ListComp);
        var tmp = this._gr("_compr", "new Sk.builtins['list']([])");
        return this.clistcompgen(tmp, e.generators, 0, e.elt);
    };
    Compiler.prototype.cyield = function (e) {
        if (this.u.ste.blockType !== FunctionBlock)
            throw new SyntaxError("'yield' outside function");
        var val = 'null';
        if (e.value)
            val = this.vexpr(e.value);
        var nextBlock = this.newBlock('after yield');
        out("return [/*resume*/", nextBlock, ",/*ret*/", val, "];");
        this.setBlock(nextBlock);
        return '$gen.gi$sentvalue';
    };
    Compiler.prototype.ccompare = function (e) {
        asserts.assert(e.ops.length === e.comparators.length);
        var cur = this.vexpr(e.left);
        var n = e.ops.length;
        var done = this.newBlock("done");
        var fres = this._gr('compareres', 'null');
        for (var i = 0; i < n; ++i) {
            var rhs = this.vexpr(e.comparators[i]);
            var res = this._gr('compare', "Sk.builtin.bool(Sk.misceval.richCompareBool(", cur, ",", rhs, ",'", e.ops[i].prototype._astname, "'))");
            out(fres, '=', res, ';');
            this._jumpfalse(res, done);
            cur = rhs;
        }
        this._jump(done);
        this.setBlock(done);
        return fres;
    };
    Compiler.prototype.ccall = function (e) {
        var func = this.vexpr(e.func);
        var args = this.vseqexpr(e.args);
        if (e.keywords.length > 0 || e.starargs || e.kwargs) {
            var kwarray = [];
            for (var i = 0; i < e.keywords.length; ++i) {
                kwarray.push("'" + e.keywords[i].arg + "'");
                kwarray.push(this.vexpr(e.keywords[i].value));
            }
            var keywords = "[" + kwarray.join(",") + "]";
            var starargs = "undefined";
            var kwargs = "undefined";
            if (e.starargs)
                starargs = this.vexpr(e.starargs);
            if (e.kwargs)
                kwargs = this.vexpr(e.kwargs);
            return this._gr('call', "Sk.misceval.call(", func, ",", kwargs, ",", starargs, ",", keywords, args.length > 0 ? "," : "", args, ")");
        }
        else {
            return this._gr('call', "Sk.misceval.callsim(", func, args.length > 0 ? "," : "", args, ")");
        }
    };
    Compiler.prototype.cslice = function (s) {
        asserts.assert(s instanceof astnodes.Slice);
        var low = s.lower ? this.vexpr(s.lower) : 'null';
        var high = s.upper ? this.vexpr(s.upper) : 'null';
        var step = s.step ? this.vexpr(s.step) : 'null';
        return this._gr('slice', "new Sk.builtins['slice'](", low, ",", high, ",", step, ")");
    };
    Compiler.prototype.vslicesub = function (s) {
        var subs;
        switch (s.constructor) {
            case Number:
            case String:
                subs = s;
                break;
            case astnodes.Index:
                subs = this.vexpr(s.value);
                break;
            case astnodes.Slice:
                subs = this.cslice(s);
                break;
            case astnodes.Ellipsis:
            case astnodes.ExtSlice:
                asserts.fail("todo;");
                break;
            default:
                asserts.fail("invalid subscript kind");
        }
        return subs;
    };
    Compiler.prototype.vslice = function (s, ctx, obj, dataToStore) {
        var subs = this.vslicesub(s);
        return this.chandlesubscr(ctx, obj, subs, dataToStore);
    };
    Compiler.prototype.chandlesubscr = function (ctx, obj, subs, data) {
        if (ctx === astnodes.Load || ctx === astnodes.AugLoad)
            return this._gr('lsubscr', "Sk.abstr.objectGetItem(", obj, ",", subs, ")");
        else if (ctx === astnodes.Store || ctx === astnodes.AugStore)
            out("Sk.abstr.objectSetItem(", obj, ",", subs, ",", data, ");");
        else if (ctx === astnodes.Del)
            out("Sk.abstr.objectDelItem(", obj, ",", subs, ");");
        else
            asserts.fail("handlesubscr fail");
    };
    Compiler.prototype.cboolop = function (e) {
        asserts.assert(e instanceof astnodes.BoolOp);
        var jtype;
        var ifFailed;
        if (e.op === astnodes.And)
            jtype = this._jumpfalse;
        else
            jtype = this._jumptrue;
        var end = this.newBlock('end of boolop');
        var s = e.values;
        var n = s.length;
        var retval;
        for (var i = 0; i < n; ++i) {
            var expres = this.vexpr(s[i]);
            if (i === 0) {
                retval = this._gr('boolopsucc', expres);
            }
            out(retval, "=", expres, ";");
            jtype.call(this, expres, end);
        }
        this._jump(end);
        this.setBlock(end);
        return retval;
    };
    Compiler.prototype.vexpr = function (e, data, augstoreval) {
        if (e.lineno > this.u.lineno) {
            this.u.lineno = e.lineno;
            this.u.linenoSet = false;
        }
        switch (e.constructor) {
            case astnodes.BoolOp:
                return this.cboolop(e);
            case astnodes.BinOp:
                return this._gr('binop', "Sk.abstr.numberBinOp(", this.vexpr(e.left), ",", this.vexpr(e.right), ",'", e.op.prototype._astname, "')");
            case astnodes.UnaryOp:
                return this._gr('unaryop', "Sk.abstr.numberUnaryOp(", this.vexpr(e.operand), ",'", e.op.prototype._astname, "')");
            case astnodes.Lambda:
                return this.clambda(e);
            case astnodes.IfExp:
                return this.cifexp(e);
            case astnodes.Dict:
                return this.cdict(e);
            case astnodes.ListComp:
                return this.clistcomp(e);
            case astnodes.GeneratorExp:
                return this.cgenexp(e);
            case astnodes.Yield:
                return this.cyield(e);
            case astnodes.Compare:
                return this.ccompare(e);
            case astnodes.Call:
                var result = this.ccall(e);
                this.annotateSource(e);
                return result;
            case astnodes.Num:
                {
                    if (e.n.isFloat()) {
                        return 'Sk.builtin.numberToPy(' + e.n.value + ')';
                    }
                    else if (e.n.isInt()) {
                        return "Sk.ffi.numberToIntPy(" + e.n.value + ")";
                    }
                    else if (e.n.isLong()) {
                        return "Sk.ffi.longFromString('" + e.n.text + "', " + e.n.radix + ")";
                    }
                    asserts.fail("unhandled Num type");
                }
            case astnodes.Str:
                {
                    return this._gr('str', 'Sk.builtin.stringToPy(', toStringLiteralJS(e.s), ')');
                }
            case astnodes.Attribute:
                var val;
                if (e.ctx !== astnodes.AugStore)
                    val = this.vexpr(e.value);
                var mangled = toStringLiteralJS(e.attr);
                mangled = mangled.substring(1, mangled.length - 1);
                mangled = mangleName(this.u.private_, mangled);
                mangled = fixReservedWords(mangled);
                mangled = fixReservedNames(mangled);
                switch (e.ctx) {
                    case astnodes.AugLoad:
                    case astnodes.Load:
                        return this._gr("lattr", "Sk.abstr.gattr(", val, ",'", mangled, "')");
                    case astnodes.AugStore:
                        out("if(typeof ", data, " !== 'undefined'){");
                        val = this.vexpr(augstoreval || null);
                        out("Sk.abstr.sattr(", val, ",'", mangled, "',", data, ");");
                        out("}");
                        break;
                    case astnodes.Store:
                        out("Sk.abstr.sattr(", val, ",'", mangled, "',", data, ");");
                        break;
                    case astnodes.Del:
                        asserts.fail("todo;");
                        break;
                    case astnodes.Param:
                    default:
                        asserts.fail("invalid attribute expression");
                }
                break;
            case astnodes.Subscript:
                var val;
                switch (e.ctx) {
                    case astnodes.AugLoad:
                    case astnodes.Load:
                    case astnodes.Store:
                    case astnodes.Del:
                        return this.vslice(e.slice, e.ctx, this.vexpr(e.value), data);
                    case astnodes.AugStore:
                        out("if(typeof ", data, " !== 'undefined'){");
                        val = this.vexpr(augstoreval || null);
                        this.vslice(e.slice, e.ctx, val, data);
                        out("}");
                        break;
                    case astnodes.Param:
                    default:
                        asserts.fail("invalid subscript expression");
                }
                break;
            case astnodes.Name:
                return this.nameop(e.id, e.ctx, data);
            case astnodes.List:
                return this.ctupleorlist(e, data, 'list');
            case astnodes.Tuple:
                return this.ctupleorlist(e, data, 'tuple');
            default:
                asserts.fail("unhandled case in vexpr");
        }
    };
    Compiler.prototype.vseqexpr = function (exprs, data) {
        var missingData = (typeof data === 'undefined');
        asserts.assert(missingData || exprs.length === data.length);
        var ret = [];
        for (var i = 0; i < exprs.length; ++i) {
            ret.push(this.vexpr(exprs[i], (missingData ? undefined : data[i])));
        }
        return ret;
    };
    Compiler.prototype.caugassign = function (s) {
        asserts.assert(s instanceof astnodes.AugAssign);
        var e = s.target;
        var auge;
        switch (e.constructor) {
            case astnodes.Attribute:
                auge = new astnodes.Attribute(e.value, e.attr, astnodes.AugLoad, e.lineno, e.col_offset);
                var aug = this.vexpr(auge);
                var val = this.vexpr(s.value);
                var res = this._gr('inplbinopattr', "Sk.abstr.numberInplaceBinOp(", aug, ",", val, ",'", s.op.prototype._astname, "')");
                auge.ctx = astnodes.AugStore;
                return this.vexpr(auge, res, e.value);
            case astnodes.Subscript:
                var augsub = this.vslicesub(e.slice);
                auge = new astnodes.Subscript(e.value, augsub, astnodes.AugLoad, e.lineno, e.col_offset);
                var aug = this.vexpr(auge);
                var val = this.vexpr(s.value);
                var res = this._gr('inplbinopsubscr', "Sk.abstr.numberInplaceBinOp(", aug, ",", val, ",'", s.op.prototype._astname, "')");
                auge.ctx = astnodes.AugStore;
                return this.vexpr(auge, res, e.value);
            case astnodes.Name:
                var to = this.nameop(e.id, astnodes.Load);
                var val = this.vexpr(s.value);
                var res = this._gr('inplbinop', "Sk.abstr.numberInplaceBinOp(", to, ",", val, ",'", s.op.prototype._astname, "')");
                return this.nameop(e.id, astnodes.Store, res);
            default:
                asserts.fail("unhandled case in augassign");
        }
    };
    Compiler.prototype.exprConstant = function (e) {
        switch (e.constructor) {
            case astnodes.Name:
            default:
                return -1;
        }
    };
    Compiler.prototype.newBlock = function (name) {
        var ret = this.u.blocknum++;
        this.u.blocks[ret] = [];
        this.u.blocks[ret]._name = name || '<unnamed>';
        return ret;
    };
    Compiler.prototype.setBlock = function (n) {
        asserts.assert(n >= 0 && n < this.u.blocknum);
        this.u.curblock = n;
    };
    Compiler.prototype.pushBreakBlock = function (n) {
        asserts.assert(n >= 0 && n < this.u.blocknum);
        this.u.breakBlocks.push(n);
    };
    Compiler.prototype.popBreakBlock = function () {
        this.u.breakBlocks.pop();
    };
    Compiler.prototype.pushContinueBlock = function (n) {
        asserts.assert(n >= 0 && n < this.u.blocknum);
        this.u.continueBlocks.push(n);
    };
    Compiler.prototype.popContinueBlock = function () {
        this.u.continueBlocks.pop();
    };
    Compiler.prototype.pushExceptBlock = function (n) {
        asserts.assert(n >= 0 && n < this.u.blocknum);
        this.u.exceptBlocks.push(n);
    };
    Compiler.prototype.popExceptBlock = function () {
        this.u.exceptBlocks.pop();
    };
    Compiler.prototype.pushFinallyBlock = function (n) {
        asserts.assert(n >= 0 && n < this.u.blocknum);
        this.u.finallyBlocks.push(n);
    };
    Compiler.prototype.popFinallyBlock = function () {
        this.u.finallyBlocks.pop();
    };
    Compiler.prototype.setupExcept = function (eb) {
        out("$exc.push(", eb, ");");
    };
    Compiler.prototype.endExcept = function () {
        out("$exc.pop();");
    };
    Compiler.prototype.outputLocals = function (unit) {
        var have = {};
        for (var i = 0; unit.argnames && i < unit.argnames.length; ++i)
            have[unit.argnames[i]] = true;
        unit.localnames.sort();
        var output = [];
        for (var i = 0; i < unit.localnames.length; ++i) {
            var name = unit.localnames[i];
            if (have[name] === undefined) {
                output.push(name);
                have[name] = true;
            }
        }
        if (output.length > 0)
            return "var " + output.join(",") + "; /* locals */";
        return "";
    };
    Compiler.prototype.outputAllUnits = function () {
        var ret = '';
        for (var j = 0; j < this.allUnits.length; ++j) {
            var unit = this.allUnits[j];
            ret += unit.prefixCode;
            ret += this.outputLocals(unit);
            ret += unit.varDeclsCode;
            ret += unit.switchCode;
            var blocks = unit.blocks;
            for (var i = 0; i < blocks.length; ++i) {
                ret += "case " + i + ": /* --- " + blocks[i]._name + " --- */";
                ret += blocks[i].join('');
            }
            ret += unit.suffixCode;
        }
        return ret;
    };
    Compiler.prototype.cif = function (s) {
        asserts.assert(s instanceof astnodes.If_);
        var constant = this.exprConstant(s.test);
        if (constant === 0) {
            if (s.orelse)
                this.vseqstmt(s.orelse);
        }
        else if (constant === 1) {
            this.vseqstmt(s.body);
        }
        else {
            var end = this.newBlock('end of if');
            var next = this.newBlock('next branch of if');
            var test = this.vexpr(s.test);
            this._jumpfalse(test, next);
            this.vseqstmt(s.body);
            this._jump(end);
            this.setBlock(next);
            if (s.orelse)
                this.vseqstmt(s.orelse);
            this._jump(end);
        }
        this.setBlock(end);
    };
    Compiler.prototype.cwhile = function (s) {
        var constant = this.exprConstant(s.test);
        if (constant === 0) {
            if (s.orelse)
                this.vseqstmt(s.orelse);
        }
        else {
            var top = this.newBlock('while test');
            this._jump(top);
            this.setBlock(top);
            var next = this.newBlock('after while');
            var orelse = s.orelse.length > 0 ? this.newBlock('while orelse') : null;
            var body = this.newBlock('while body');
            this._jumpfalse(this.vexpr(s.test), orelse ? orelse : next);
            this._jump(body);
            this.pushBreakBlock(next);
            this.pushContinueBlock(top);
            this.setBlock(body);
            this.vseqstmt(s.body);
            this._jump(top);
            this.popContinueBlock();
            this.popBreakBlock();
            if (s.orelse.length > 0) {
                this.setBlock(orelse);
                this.vseqstmt(s.orelse);
                this._jump(next);
            }
            this.setBlock(next);
        }
    };
    Compiler.prototype.cfor = function (s) {
        var start = this.newBlock('for start');
        var cleanup = this.newBlock('for cleanup');
        var end = this.newBlock('for end');
        this.pushBreakBlock(end);
        this.pushContinueBlock(start);
        var toiter = this.vexpr(s.iter);
        var iter;
        if (this.u.ste.generator) {
            iter = "$loc." + this.gensym("iter");
            out(iter, "=Sk.abstr.iter(", toiter, ");");
        }
        else
            iter = this._gr("iter", "Sk.abstr.iter(", toiter, ")");
        this._jump(start);
        this.setBlock(start);
        var nexti = this._gr('next', "Sk.abstr.iternext(", iter, ")");
        this._jumpundef(nexti, cleanup);
        var target = this.vexpr(s.target, nexti);
        this.vseqstmt(s.body);
        this._jump(start);
        this.setBlock(cleanup);
        this.popContinueBlock();
        this.popBreakBlock();
        this.vseqstmt(s.orelse);
        this._jump(end);
        this.setBlock(end);
    };
    Compiler.prototype.craise = function (s) {
        if (s && s.type && s.type.id && (s.type.id === "StopIteration")) {
            out("return undefined;");
        }
        else {
            var inst = '';
            if (s.inst) {
                inst = this.vexpr(s.inst);
                out("throw ", this.vexpr(s.type), "(", inst, ");");
            }
            else if (s.type) {
                if (s.type.func) {
                    out("throw ", this.vexpr(s.type), ";");
                }
                else {
                    out("throw ", this.vexpr(s.type), "('');");
                }
            }
            else {
                out("throw $err;");
            }
        }
    };
    Compiler.prototype.ctryexcept = function (s) {
        var n = s.handlers.length;
        var handlers = [];
        for (var i = 0; i < n; ++i) {
            handlers.push(this.newBlock("except_" + i + "_"));
        }
        var unhandled = this.newBlock("unhandled");
        var orelse = this.newBlock("orelse");
        var end = this.newBlock("end");
        this.setupExcept(handlers[0]);
        this.vseqstmt(s.body);
        this.endExcept();
        this._jump(orelse);
        for (var i = 0; i < n; ++i) {
            this.setBlock(handlers[i]);
            var handler = s.handlers[i];
            if (!handler.type && i < n - 1) {
                throw new SyntaxError("default 'except:' must be last");
            }
            if (handler.type) {
                var handlertype = this.vexpr(handler.type);
                var next = (i == n - 1) ? unhandled : handlers[i + 1];
                var check = this._gr('instance', "$err instanceof ", handlertype);
                this._jumpfalse(check, next);
            }
            if (handler.name) {
                this.vexpr(handler.name, "$err");
            }
            this.vseqstmt(handler.body);
            this._jump(end);
        }
        this.setBlock(unhandled);
        out("throw $err;");
        this.setBlock(orelse);
        this.vseqstmt(s.orelse);
        this._jump(end);
        this.setBlock(end);
    };
    Compiler.prototype.ctryfinally = function (s) {
        out("/*todo; tryfinally*/");
        this.ctryexcept(s.body[0]);
    };
    Compiler.prototype.cassert = function (s) {
        var test = this.vexpr(s.test);
        var end = this.newBlock("end");
        this._jumptrue(test, end);
        out("throw new Sk.builtin.AssertionError(", s.msg ? this.vexpr(s.msg) : "", ");");
        this.setBlock(end);
    };
    Compiler.prototype.cimportas = function (name, asname, mod) {
        var src = name;
        var dotLoc = src.indexOf(".");
        var cur = mod;
        if (dotLoc !== -1) {
            src = src.substr(dotLoc + 1);
            while (dotLoc !== -1) {
                dotLoc = src.indexOf(".");
                var attr = dotLoc !== -1 ? src.substr(0, dotLoc) : src;
                cur = this._gr('lattr', "Sk.abstr.gattr(", cur, ",'", attr, "')");
                src = src.substr(dotLoc + 1);
            }
        }
        return this.nameop(asname, astnodes.Store, cur);
    };
    Compiler.prototype.cimport = function (s) {
        var n = s.names.length;
        for (var i = 0; i < n; ++i) {
            var alias = s.names[i];
            var mod = this._gr('module', 'Sk.builtin.__import__(', toStringLiteralJS(alias.name), ',$gbl,$loc,[])');
            if (alias.asname) {
                this.cimportas(alias.name, alias.asname, mod);
            }
            else {
                var lastDot = alias.name.indexOf('.');
                if (lastDot !== -1) {
                    this.nameop(alias.name.substr(0, lastDot), astnodes.Store, mod);
                }
                else {
                    this.nameop(alias.name, astnodes.Store, mod);
                }
            }
        }
    };
    Compiler.prototype.cfromimport = function (s) {
        var n = s.names.length;
        var names = [];
        for (var i = 0; i < n; ++i) {
            names[i] = s.names[i].name;
        }
        var namesString = names.map(function (name) { return toStringLiteralJS(name); }).join(', ');
        var mod = this._gr('module', 'Sk.builtin.__import__(', toStringLiteralJS(s.module), ',$gbl,$loc,[', namesString, '])');
        for (var i = 0; i < n; ++i) {
            var alias = s.names[i];
            if (i === 0 && alias.name === "*") {
                asserts.assert(n === 1);
                out("Sk.importStar(", mod, ",$loc, $gbl);");
                return;
            }
            var got = this._gr('item', 'Sk.abstr.gattr(', mod, ',', toStringLiteralJS(alias.name), ')');
            var storeName = alias.name;
            if (alias.asname)
                storeName = alias.asname;
            this.nameop(storeName, astnodes.Store, got);
        }
    };
    Compiler.prototype.buildcodeobj = function (n, coname, decorator_list, args, callback) {
        var decos = [];
        var defaults = [];
        var vararg = null;
        var kwarg = null;
        if (decorator_list)
            decos = this.vseqexpr(decorator_list);
        if (args && args.defaults)
            defaults = this.vseqexpr(args.defaults);
        if (args && args.vararg)
            vararg = args.vararg;
        if (args && args.kwarg)
            kwarg = args.kwarg;
        var containingHasFree = this.u.ste.hasFree;
        var containingHasCell = this.u.ste.childHasFree;
        var scopename = this.enterScope(coname, n, n.lineno);
        var isGenerator = this.u.ste.generator;
        var hasFree = this.u.ste.hasFree;
        var hasCell = this.u.ste.childHasFree;
        var descendantOrSelfHasFree = this.u.ste.hasFree;
        var entryBlock = this.newBlock('codeobj entry');
        this.u.prefixCode = "var " + scopename + "=(function " + this.niceName(coname) + "$(";
        var funcArgs = [];
        if (isGenerator) {
            if (kwarg) {
                throw new SyntaxError(coname + "(): keyword arguments in generators not supported");
            }
            if (vararg) {
                throw new SyntaxError(coname + "(): variable number of arguments in generators not supported");
            }
            funcArgs.push("$gen");
        }
        else {
            if (kwarg)
                funcArgs.push("$kwa");
            for (var i = 0; args && i < args.args.length; ++i)
                funcArgs.push(this.nameop(args.args[i].id, astnodes.Param));
        }
        if (descendantOrSelfHasFree) {
            funcArgs.push("$free");
        }
        this.u.prefixCode += funcArgs.join(",");
        this.u.prefixCode += "){";
        if (isGenerator)
            this.u.prefixCode += "\n// generator\n";
        if (containingHasFree)
            this.u.prefixCode += "\n// containing has free\n";
        if (containingHasCell)
            this.u.prefixCode += "\n// containing has cell\n";
        if (hasFree)
            this.u.prefixCode += "\n// has free\n";
        if (hasCell)
            this.u.prefixCode += "\n// has cell\n";
        var locals = "{}";
        if (isGenerator) {
            entryBlock = "$gen.gi$resumeat";
            locals = "$gen.gi$locals";
        }
        var cells = "";
        if (hasCell)
            cells = ",$cell={}";
        this.u.varDeclsCode += "var $blk=" + entryBlock + ",$exc=[],$loc=" + locals + cells + ",$gbl=this,$err;";
        for (var i = 0; args && i < args.args.length; ++i) {
            var id = args.args[i].id;
            if (this.isCell(id)) {
                this.u.varDeclsCode += "$cell." + id + "=" + id + ";";
            }
        }
        if (!isGenerator) {
            var minargs = args ? args.args.length - defaults.length : 0;
            var maxargs = vararg ? Infinity : (args ? args.args.length : 0);
            var kw = kwarg ? true : false;
            this.u.varDeclsCode += "Sk.builtin.pyCheckArgs(\"" + coname +
                "\", arguments, " + minargs + ", " + maxargs + ", " + kw +
                ", " + descendantOrSelfHasFree + ");";
        }
        if (defaults.length > 0) {
            var offset = args.args.length - defaults.length;
            for (var i = 0; i < defaults.length; ++i) {
                var argname = this.nameop(args.args[i + offset].id, astnodes.Param);
                this.u.varDeclsCode += "if(typeof " + argname + " === 'undefined')" + argname + "=" + scopename + ".$defaults[" + i + "];";
            }
        }
        if (vararg) {
            var start = funcArgs.length;
            this.u.varDeclsCode += vararg + "=new Sk.builtins['tuple'](Array.prototype.slice.call(arguments," + start + ")); /*vararg*/";
        }
        if (kwarg) {
            this.u.varDeclsCode += kwarg + "=new Sk.builtins['dict']($kwa);";
        }
        this.u.switchCode = "while(true){try{switch($blk){";
        this.u.suffixCode = "}}catch(err){if ($exc.length>0) {$err=err;$blk=$exc.pop();continue;} else {throw err;}}}});";
        callback.call(this, scopename);
        var argnames;
        if (args && args.args.length > 0) {
            var argnamesarr = [];
            for (var i = 0; i < args.args.length; ++i) {
                argnamesarr.push(args.args[i].id);
            }
            argnames = argnamesarr.join("', '");
            this.u.argnames = argnamesarr;
        }
        this.exitScope();
        if (defaults.length > 0)
            out(scopename, ".$defaults=[", defaults.join(','), "];");
        if (argnames) {
            out(scopename, ".co_varnames=['", argnames, "'];");
        }
        if (kwarg) {
            out(scopename, ".co_kwargs=1;");
        }
        var frees = "";
        if (hasFree) {
            frees = ",$cell";
            if (containingHasFree)
                frees += ",$free";
        }
        if (isGenerator)
            if (args && args.args.length > 0) {
                return this._gr("gener", "new Sk.builtins['function']((function(){var $origargs=Array.prototype.slice.call(arguments);Sk.builtin.pyCheckArgs(\"", coname, "\",arguments,", args.args.length - defaults.length, ",", args.args.length, ");return new Sk.builtins['generator'](", scopename, ",$gbl,$origargs", frees, ");}))");
            }
            else {
                return this._gr("gener", "new Sk.builtins['function']((function(){Sk.builtin.pyCheckArgs(\"", coname, "\",arguments,0,0);return new Sk.builtins['generator'](", scopename, ",$gbl,[]", frees, ");}))");
            }
        else {
            return this._gr("funcobj", "new Sk.builtins['function'](", scopename, ",$gbl", frees, ")");
        }
    };
    Compiler.prototype.cfunction = function (s) {
        asserts.assert(s instanceof astnodes.FunctionDef);
        var funcorgen = this.buildcodeobj(s, s.name, s.decorator_list, s.args, function (scopename) {
            this.vseqstmt(s.body);
            out("return Sk.builtin.none.none$;");
        });
        this.nameop(s.name, astnodes.Store, funcorgen);
    };
    Compiler.prototype.clambda = function (e) {
        asserts.assert(e instanceof astnodes.Lambda);
        var func = this.buildcodeobj(e, "<lambda>", null, e.args, function (scopename) {
            var val = this.vexpr(e.body);
            out("return ", val, ";");
        });
        return func;
    };
    Compiler.prototype.cifexp = function (e) {
        var next = this.newBlock('next of ifexp');
        var end = this.newBlock('end of ifexp');
        var ret = this._gr('res', 'null');
        var test = this.vexpr(e.test);
        this._jumpfalse(test, next);
        out(ret, '=', this.vexpr(e.body), ';');
        this._jump(end);
        this.setBlock(next);
        out(ret, '=', this.vexpr(e.orelse), ';');
        this._jump(end);
        this.setBlock(end);
        return ret;
    };
    Compiler.prototype.cgenexpgen = function (generators, genIndex, elt) {
        var start = this.newBlock('start for ' + genIndex);
        var skip = this.newBlock('skip for ' + genIndex);
        var ifCleanup = this.newBlock('if cleanup for ' + genIndex);
        var end = this.newBlock('end for ' + genIndex);
        var ge = generators[genIndex];
        var iter;
        if (genIndex === 0) {
            iter = "$loc.$iter0";
        }
        else {
            var toiter = this.vexpr(ge.iter);
            iter = "$loc." + this.gensym("iter");
            out(iter, "=", "Sk.abstr.iter(", toiter, ");");
        }
        this._jump(start);
        this.setBlock(start);
        var nexti = this._gr('next', "Sk.abstr.iternext(", iter, ")");
        this._jumpundef(nexti, end);
        var target = this.vexpr(ge.target, nexti);
        var n = ge.ifs.length;
        for (var i = 0; i < n; ++i) {
            var ifres = this.vexpr(ge.ifs[i]);
            this._jumpfalse(ifres, start);
        }
        if (++genIndex < generators.length) {
            this.cgenexpgen(generators, genIndex, elt);
        }
        if (genIndex >= generators.length) {
            var velt = this.vexpr(elt);
            out("return [", skip, "/*resume*/,", velt, "/*ret*/];");
            this.setBlock(skip);
        }
        this._jump(start);
        this.setBlock(end);
        if (genIndex === 1)
            out("return null;");
    };
    Compiler.prototype.cgenexp = function (e) {
        var gen = this.buildcodeobj(e, "<genexpr>", null, null, function (scopename) {
            this.cgenexpgen(e.generators, 0, e.elt);
        });
        var gener = this._gr("gener", "Sk.misceval.callsim(", gen, ");");
        out(gener, ".gi$locals.$iter0=Sk.abstr.iter(", this.vexpr(e.generators[0].iter), ");");
        return gener;
    };
    Compiler.prototype.cclass = function (s) {
        asserts.assert(s instanceof astnodes.ClassDef);
        var decos = s.decorator_list;
        var bases = this.vseqexpr(s.bases);
        var scopename = this.enterScope(s.name, s, s.lineno);
        var entryBlock = this.newBlock('class entry');
        this.u.prefixCode = "var " + scopename + "=(function $" + s.name + "$class_outer($globals,$locals,$rest){var $gbl=$globals,$loc=$locals;";
        this.u.switchCode += "return(function " + s.name + "(){";
        this.u.switchCode += "var $blk=" + entryBlock + ",$exc=[];while(true){switch($blk){";
        this.u.suffixCode = "}break;}}).apply(null,$rest);});";
        this.u.private_ = s.name;
        this.cbody(s.body);
        out("break;");
        this.exitScope();
        var wrapped = this._gr('built', 'Sk.misceval.buildClass($gbl,', scopename, ',', toStringLiteralJS(s.name), ',[', bases, '])');
        this.nameop(s.name, astnodes.Store, wrapped);
    };
    Compiler.prototype.ccontinue = function (s) {
        if (this.u.continueBlocks.length === 0)
            throw new SyntaxError("'continue' outside loop");
        this._jump(this.u.continueBlocks[this.u.continueBlocks.length - 1]);
    };
    Compiler.prototype.vstmt = function (s) {
        this.u.lineno = s.lineno;
        this.u.linenoSet = false;
        this.annotateSource(s);
        switch (s.constructor) {
            case astnodes.FunctionDef:
                this.cfunction(s);
                break;
            case astnodes.ClassDef:
                this.cclass(s);
                break;
            case astnodes.Return_:
                if (this.u.ste.blockType !== FunctionBlock)
                    throw new SyntaxError("'return' outside function");
                if (s.value)
                    out("return ", this.vexpr(s.value), ";");
                else
                    out("return null;");
                break;
            case astnodes.Delete_:
                this.vseqexpr(s.targets);
                break;
            case astnodes.Assign:
                var n = s.targets.length;
                var val = this.vexpr(s.value);
                for (var i = 0; i < n; ++i)
                    this.vexpr(s.targets[i], val);
                break;
            case astnodes.AugAssign:
                return this.caugassign(s);
            case astnodes.Print:
                this.cprint(s);
                break;
            case astnodes.For_:
                return this.cfor(s);
            case astnodes.While_:
                return this.cwhile(s);
            case astnodes.If_:
                return this.cif(s);
            case astnodes.Raise:
                return this.craise(s);
            case astnodes.TryExcept:
                return this.ctryexcept(s);
            case astnodes.TryFinally:
                return this.ctryfinally(s);
            case astnodes.Assert:
                return this.cassert(s);
            case astnodes.Import_:
                return this.cimport(s);
            case astnodes.ImportFrom:
                return this.cfromimport(s);
            case astnodes.Global:
                break;
            case astnodes.Expr:
                this.vexpr(s.value);
                break;
            case astnodes.Pass:
                break;
            case astnodes.Break_:
                if (this.u.breakBlocks.length === 0)
                    throw new SyntaxError("'break' outside loop");
                this._jump(this.u.breakBlocks[this.u.breakBlocks.length - 1]);
                break;
            case astnodes.Continue_:
                this.ccontinue(s);
                break;
            default:
                asserts.fail("unhandled case in vstmt");
        }
    };
    Compiler.prototype.vseqstmt = function (stmts) {
        for (var i = 0; i < stmts.length; ++i)
            this.vstmt(stmts[i]);
    };
    Compiler.prototype.isCell = function (name) {
        var mangled = mangleName(this.u.private_, name);
        var scope = this.u.ste.getScope(mangled);
        var dict = null;
        if (scope === symtable.CELL)
            return true;
        return false;
    };
    Compiler.prototype.nameop = function (name, ctx, dataToStore) {
        if ((ctx === astnodes.Store || ctx === astnodes.AugStore || ctx === astnodes.Del) && name === "__debug__") {
            throw new SyntaxError("can not assign to __debug__");
        }
        if ((ctx === astnodes.Store || ctx === astnodes.AugStore || ctx === astnodes.Del) && name === "None") {
            throw new SyntaxError("can not assign to None");
        }
        if (name === "None")
            return "Sk.builtin.none.none$";
        if (name === "True")
            return "Sk.ffi.bool.True";
        if (name === "False")
            return "Sk.ffi.bool.False";
        var mangled = mangleName(this.u.private_, name);
        var op = 0;
        var optype = OP_NAME;
        var scope = this.u.ste.getScope(mangled);
        var dict = null;
        switch (scope) {
            case FREE:
                dict = "$free";
                optype = OP_DEREF;
                break;
            case CELL:
                dict = "$cell";
                optype = OP_DEREF;
                break;
            case LOCAL:
                if (this.u.ste.blockType === FunctionBlock && !this.u.ste.generator)
                    optype = OP_FAST;
                break;
            case GLOBAL_IMPLICIT:
                if (this.u.ste.blockType === FunctionBlock)
                    optype = OP_GLOBAL;
                break;
            case GLOBAL_EXPLICIT:
                optype = OP_GLOBAL;
            default:
                break;
        }
        mangled = fixReservedNames(mangled);
        mangled = fixReservedWords(mangled);
        asserts.assert(scope || name.charAt(1) === '_');
        var mangledNoPre = mangled;
        if (this.u.ste.generator || this.u.ste.blockType !== FunctionBlock)
            mangled = "$loc." + mangled;
        else if (optype === OP_FAST || optype === OP_NAME)
            this.u.localnames.push(mangled);
        switch (optype) {
            case OP_FAST:
                switch (ctx) {
                    case astnodes.Load:
                    case astnodes.Param:
                        out("if (typeof ", mangled, " === 'undefined') { throw new Error('local variable \\\'", mangled, "\\\' referenced before assignment'); }\n");
                        return mangled;
                    case astnodes.Store:
                        out(mangled, "=", dataToStore, ";");
                        break;
                    case astnodes.Del:
                        out("delete ", mangled, ";");
                        break;
                    default:
                        asserts.fail("unhandled");
                }
                break;
            case OP_NAME:
                switch (ctx) {
                    case astnodes.Load:
                        var v = this.gensym('loadname');
                        out("var ", v, "=(typeof ", mangled, " !== 'undefined') ? ", mangled, ":Sk.misceval.loadname('", mangledNoPre, "',$gbl);");
                        return v;
                    case astnodes.Store:
                        out(mangled, "=", dataToStore, ";");
                        break;
                    case astnodes.Del:
                        out("delete ", mangled, ";");
                        break;
                    case astnodes.Param:
                        return mangled;
                    default:
                        asserts.fail("unhandled");
                }
                break;
            case OP_GLOBAL:
                switch (ctx) {
                    case astnodes.Load:
                        return this._gr("loadgbl", "Sk.misceval.loadname('", mangledNoPre, "',$gbl)");
                    case astnodes.Store:
                        out("$gbl.", mangledNoPre, "=", dataToStore, ';');
                        break;
                    case astnodes.Del:
                        out("delete $gbl.", mangledNoPre);
                        break;
                    default:
                        asserts.fail("unhandled case in name op_global");
                }
                break;
            case OP_DEREF:
                switch (ctx) {
                    case astnodes.Load:
                        return dict + "." + mangledNoPre;
                    case astnodes.Store:
                        out(dict, ".", mangledNoPre, "=", dataToStore, ";");
                        break;
                    case astnodes.Param:
                        return mangledNoPre;
                    default:
                        asserts.fail("unhandled case in name op_deref");
                }
                break;
            default:
                asserts.fail("unhandled case");
        }
    };
    Compiler.prototype.enterScope = function (name, key, lineno) {
        var u = new CompilerUnit();
        u.ste = this.st.getStsForAst(key);
        u.name = name;
        u.firstlineno = lineno;
        if (this.u && this.u.private_)
            u.private_ = this.u.private_;
        this.stack.push(this.u);
        this.allUnits.push(u);
        var scopeName = this.gensym('scope');
        u.scopename = scopeName;
        this.u = u;
        this.u.activateScope();
        this.nestlevel++;
        return scopeName;
    };
    Compiler.prototype.exitScope = function () {
        var prev = this.u;
        this.nestlevel--;
        if (this.stack.length - 1 >= 0)
            this.u = this.stack.pop();
        else
            this.u = null;
        if (this.u)
            this.u.activateScope();
        if (prev.name !== "<module>") {
            var mangled = prev.name;
            mangled = fixReservedWords(mangled);
            mangled = fixReservedNames(mangled);
            out(prev.scopename, ".co_name=Sk.builtin.stringToPy('", mangled, "');");
        }
    };
    Compiler.prototype.cbody = function (stmts) {
        for (var i = 0; i < stmts.length; ++i) {
            this.vstmt(stmts[i]);
        }
    };
    Compiler.prototype.cprint = function (s) {
        asserts.assert(s instanceof astnodes.Print);
        var dest = 'null';
        if (s.dest) {
            dest = this.vexpr(s.dest);
        }
        var n = s.values.length;
        for (var i = 0; i < n; ++i) {
            out("Sk.misceval.print_(Sk.ffi.remapToJs(new Sk.builtins.str(", this.vexpr(s.values[i]), ")));");
        }
        if (s.nl) {
            out("Sk.misceval.print_('\\n');");
        }
    };
    Compiler.prototype.cmod = function (mod) {
        var modf = this.enterScope("<module>", mod, 0);
        var entryBlock = this.newBlock('module entry');
        this.u.prefixCode = "var " + modf + "=(function($modname){";
        this.u.varDeclsCode = "var $blk=" + entryBlock + ",$exc=[],$gbl={},$loc=$gbl,$err;$gbl.__name__=$modname;Sk.globals=$gbl;";
        this.u.switchCode = "try {while(true){try{switch($blk){";
        this.u.suffixCode = "}}catch(err){if ($exc.length>0) {$err=err;$blk=$exc.pop();continue;} else {throw err;}}}}catch(err){if (err instanceof Sk.builtin.SystemExit && !Sk.throwSystemExit) { Sk.misceval.print_(err.toString() + '\\n'); return $loc; } else { throw err; } } });";
        switch (mod.constructor) {
            case astnodes.Module:
                this.cbody(mod.body);
                out("return $loc;");
                break;
            default:
                asserts.fail("todo; unhandled case in compilerMod");
        }
        this.exitScope();
        this.result.push(this.outputAllUnits());
        return modf;
    };
    return Compiler;
})();
exports.Compiler = Compiler;
function compile(source, fileName) {
    var cst = parser.parse(fileName, source);
    var ast = builder.astFromParse(cst, fileName);
    var st = symtable.symbolTable(ast, fileName);
    var c = new Compiler(fileName, st, 0, source);
    return { 'funcname': c.cmod(ast), 'code': c.result.join('') };
}
exports.compile = compile;
;
function resetCompiler() {
    gensymcount = 0;
}
exports.resetCompiler = resetCompiler;
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGlsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbW9kZS9weXRob24vY29tcGlsZXIudHMiXSwibmFtZXMiOlsiZml4UmVzZXJ2ZWRXb3JkcyIsImZpeFJlc2VydmVkTmFtZXMiLCJtYW5nbGVOYW1lIiwiQ29tcGlsZXJVbml0IiwiQ29tcGlsZXJVbml0LmNvbnN0cnVjdG9yIiwiQ29tcGlsZXJVbml0LmFjdGl2YXRlU2NvcGUiLCJDb21waWxlciIsIkNvbXBpbGVyLmNvbnN0cnVjdG9yIiwiQ29tcGlsZXIuZ2V0U291cmNlTGluZSIsIkNvbXBpbGVyLmFubm90YXRlU291cmNlIiwiQ29tcGlsZXIuZ2Vuc3ltIiwiQ29tcGlsZXIubmljZU5hbWUiLCJDb21waWxlci5faW50ZXJydXB0VGVzdCIsIkNvbXBpbGVyLl9qdW1wZmFsc2UiLCJDb21waWxlci5fanVtcHVuZGVmIiwiQ29tcGlsZXIuX2p1bXB0cnVlIiwiQ29tcGlsZXIuX2p1bXAiLCJDb21waWxlci5jdHVwbGVvcmxpc3QiLCJDb21waWxlci5jZGljdCIsIkNvbXBpbGVyLmNsaXN0Y29tcCIsIkNvbXBpbGVyLmN5aWVsZCIsIkNvbXBpbGVyLmNjb21wYXJlIiwiQ29tcGlsZXIuY2NhbGwiLCJDb21waWxlci5jc2xpY2UiLCJDb21waWxlci52c2xpY2VzdWIiLCJDb21waWxlci52c2xpY2UiLCJDb21waWxlci5jaGFuZGxlc3Vic2NyIiwiQ29tcGlsZXIuY2Jvb2xvcCIsIkNvbXBpbGVyLnZleHByIiwiQ29tcGlsZXIudnNlcWV4cHIiLCJDb21waWxlci5jYXVnYXNzaWduIiwiQ29tcGlsZXIuZXhwckNvbnN0YW50IiwiQ29tcGlsZXIubmV3QmxvY2siLCJDb21waWxlci5zZXRCbG9jayIsIkNvbXBpbGVyLnB1c2hCcmVha0Jsb2NrIiwiQ29tcGlsZXIucG9wQnJlYWtCbG9jayIsIkNvbXBpbGVyLnB1c2hDb250aW51ZUJsb2NrIiwiQ29tcGlsZXIucG9wQ29udGludWVCbG9jayIsIkNvbXBpbGVyLnB1c2hFeGNlcHRCbG9jayIsIkNvbXBpbGVyLnBvcEV4Y2VwdEJsb2NrIiwiQ29tcGlsZXIucHVzaEZpbmFsbHlCbG9jayIsIkNvbXBpbGVyLnBvcEZpbmFsbHlCbG9jayIsIkNvbXBpbGVyLnNldHVwRXhjZXB0IiwiQ29tcGlsZXIuZW5kRXhjZXB0IiwiQ29tcGlsZXIub3V0cHV0TG9jYWxzIiwiQ29tcGlsZXIub3V0cHV0QWxsVW5pdHMiLCJDb21waWxlci5jaWYiLCJDb21waWxlci5jd2hpbGUiLCJDb21waWxlci5jZm9yIiwiQ29tcGlsZXIuY3JhaXNlIiwiQ29tcGlsZXIuY3RyeWV4Y2VwdCIsIkNvbXBpbGVyLmN0cnlmaW5hbGx5IiwiQ29tcGlsZXIuY2Fzc2VydCIsIkNvbXBpbGVyLmNpbXBvcnRhcyIsIkNvbXBpbGVyLmNpbXBvcnQiLCJDb21waWxlci5jZnJvbWltcG9ydCIsIkNvbXBpbGVyLmJ1aWxkY29kZW9iaiIsIkNvbXBpbGVyLmNmdW5jdGlvbiIsIkNvbXBpbGVyLmNsYW1iZGEiLCJDb21waWxlci5jaWZleHAiLCJDb21waWxlci5jZ2VuZXhwZ2VuIiwiQ29tcGlsZXIuY2dlbmV4cCIsIkNvbXBpbGVyLmNjbGFzcyIsIkNvbXBpbGVyLmNjb250aW51ZSIsIkNvbXBpbGVyLnZzdG10IiwiQ29tcGlsZXIudnNlcXN0bXQiLCJDb21waWxlci5pc0NlbGwiLCJDb21waWxlci5uYW1lb3AiLCJDb21waWxlci5lbnRlclNjb3BlIiwiQ29tcGlsZXIuZXhpdFNjb3BlIiwiQ29tcGlsZXIuY2JvZHkiLCJDb21waWxlci5jcHJpbnQiLCJDb21waWxlci5jbW9kIiwiY29tcGlsZSIsInJlc2V0Q29tcGlsZXIiXSwibWFwcGluZ3MiOiJBQUFBLElBQU8sT0FBTyxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBQ3RDLElBQU8sUUFBUSxXQUFXLFlBQVksQ0FBQyxDQUFDO0FBQ3hDLElBQU8sT0FBTyxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBQ3RDLElBQU8sTUFBTSxX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Q0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO2dCQUNyQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEseUJBQXlCQSxHQUFHQSxJQUFJQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUM1RUEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLElBQUlBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ2ZBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO2dCQUNyQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeERBLENBQUNBO1lBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLEVBQUVBLG1CQUFtQkEsRUFBRUEsU0FBU0EsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDN0ZBLENBQUNBO0lBQ0xBLENBQUNBO0lBRURYLHdCQUFLQSxHQUFMQSxVQUFNQSxDQUFDQTtRQUNIWSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxLQUFLQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNsREEsSUFBSUEsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDZkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDdkNBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbEJBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFVBQVVBLEVBQUVBLDJCQUEyQkEsRUFBRUEsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDMUVBLENBQUNBO0lBMENEWiw0QkFBU0EsR0FBVEEsVUFBVUEsQ0FBQ0E7UUFDUGEsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsWUFBWUEsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDL0NBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLDZCQUE2QkEsQ0FBQ0EsQ0FBQ0E7UUFDNURBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO0lBQzFEQSxDQUFDQTtJQUVEYix5QkFBTUEsR0FBTkEsVUFBT0EsQ0FBQ0E7UUFDSmMsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsS0FBS0EsYUFBYUEsQ0FBQ0E7WUFDdkNBLE1BQU1BLElBQUlBLFdBQVdBLENBQUNBLDBCQUEwQkEsQ0FBQ0EsQ0FBQ0E7UUFDdERBLElBQUlBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBO1FBQ2pCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNSQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUM5QkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0E7UUFFN0NBLEdBQUdBLENBQUNBLG9CQUFvQkEsRUFBRUEsU0FBU0EsRUFBRUEsVUFBVUEsRUFBRUEsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDNURBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1FBQ3pCQSxNQUFNQSxDQUFDQSxtQkFBbUJBLENBQUNBO0lBQy9CQSxDQUFDQTtJQUVEZCwyQkFBUUEsR0FBUkEsVUFBU0EsQ0FBQ0E7UUFDTmUsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDdERBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQzdCQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNyQkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDakNBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBRTFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUN6QkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkNBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLDhDQUE4Q0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDdklBLEdBQUdBLENBQUNBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3pCQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMzQkEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0E7UUFDZEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FB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UUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBO1FBQ2pEQSxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNsREEsSUFBSUEsSUFBSUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDaERBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLEVBQUVBLDJCQUEyQkEsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDMUZBLENBQUNBO0lBRURqQiw0QkFBU0EsR0FBVEEsVUFBVUEsQ0FBQ0E7UUFDUGtCLElBQUlBLElBQUlBLENBQUNBO1FBQ1RBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxLQUFLQSxNQUFNQSxDQUFDQTtZQUNaQSxLQUFLQSxNQUFNQTtnQkFFUEEsSUFBSUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1RBLEtBQUtBLENBQUNBO1lBQ1ZBLEtBQUtBLFFBQVFBLENBQUNBLEtBQUtBO2dCQUNmQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDM0JBLEtBQUtBLENBQUNBO1lBQ1ZBLEtBQUtBLFFBQVFBLENBQUNBLEtBQUtBO2dCQUNmQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdEJBLEtBQUtBLENBQUNBO1lBQ1ZBLEtBQUtBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBO1lBQ3ZCQSxLQUFLQSxRQUFRQSxDQUFDQSxRQUFRQTtnQkFDbEJBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO2dCQUN0QkEsS0FBS0EsQ0FBQ0E7WUFDVkE7Z0JBQ0lBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLHdCQUF3QkEsQ0FBQ0EsQ0FBQ0E7UUFDL0NBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUVEbEIseUJBQU1BLEdBQU5BLFVBQU9BLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLFdBQVdBO1FBQzNCbUIsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLElBQUlBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO0lBQzNEQSxDQUFDQTtJQUVEbkIsZ0NBQWFBLEdBQWJBLFVBQWNBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBO1FBQzlCb0IsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsUUFBUUEsQ0FBQ0EsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7WUFDbERBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLHlCQUF5QkEsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDL0VBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdB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QUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDM0JBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUM5QkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsaUJBQWlCQSxFQUFFQSw4QkFBOEJBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO2dCQUMxSEEsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7Z0JBQzdCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFBQTtZQUN6Q0EsS0FBS0EsUUFBUUEsQ0FBQ0EsSUFBSUE7Z0JBQ2RBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUMxQ0EsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzlCQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxXQUFXQSxFQUFFQSw4QkFBOEJBLEVBQUVBLEVBQUVBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO2dCQUNuSEEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FB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R0EsRUFBRUEsQ0FBQ0E7UUFDaEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQzlDQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDbEJBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO1lBQ3RCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNsQkEsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsZ0JBQWdCQSxDQUFDQTtRQUN4REEsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7SUFDZEEsQ0FBQ0E7SUFFRHRDLGlDQUFjQSxHQUFkQTtRQUNJdUMsSUFBSUEsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDYkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDNUNBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzVCQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtZQUN2QkEsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBO1lBQ3pCQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtZQUN2QkEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDekJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO2dCQUNyQ0EsR0FBR0EsSUFBSUEsT0FBT0EsR0FBR0EsQ0FBQ0EsR0FBR0EsV0FBV0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsU0FBU0EsQ0FBQ0E7Z0JBQy9EQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUk5QkEsQ0FBQ0E7WUFDREEsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFDM0JBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO0lBQ2ZBLENBQUNBO0lBRUR2QyxzQkFBR0EsR0FBSEEsVUFBSUEsQ0FBQ0E7UUFDRHdDLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLFlBQVlBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzFDQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN6Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNUQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNoQ0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQzFCQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUNyQ0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtZQUU5Q0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOUJBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1lBQzVCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN0QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFFaEJBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQTtnQkFDVEEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDNUJBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3BCQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxH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QSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDMUJBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1lBQ3ZEQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDZEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBRWRBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO2dCQUMzQ0EsQ0FBQ0E7Z0JBQ0RBLElBQUlBLENBQUNBLENBQUNBO29CQUVGQSxHQUFHQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtnQkFDL0NBLENBQUNBO1lBQ0xBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLENBQUNBO2dCQUVGQSxHQUFHQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtZQUN2QkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFRDNDLDZCQUFVQSxHQUFWQSxVQUFXQSxDQUFDQTtRQUNSNEMsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFHMUJBLElBQUlBLFFBQVFBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2xCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUN6QkEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdERBLENBQUNBO1FBRURBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1FBQzNDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUNyQ0EsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFFL0JBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzlCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN0QkEsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0E7UUFDakJBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRW5CQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUN6QkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLElBQUlBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzVCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDN0JBLE1B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QSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM5QkEsSUFBSUEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0E7UUFDZEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFLaEJBLEdBQUdBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQzdCQSxPQUFPQSxNQUFNQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDbkJBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUMxQkEsSUFBSUEsSUFBSUEsR0FBR0EsTUFBTUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0E7Z0JBQ3ZEQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxFQUFFQSxpQkFBaUJBLEVBQUVBLEdBQUdBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO2dCQUNsRUEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLFFBQVFBLENBQUNBLEtBQUtBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO0lBQ3BEQSxDQUFDQTtJQUVEL0MsMEJBQU9BLEdBQVBBLFVBQVFBLENBQUNBO1FBQ0xnRCxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUN2QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDekJBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxFQUFFQSx3QkFBd0JBLEVBQUVBLGlCQUFpQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsZ0JBQWdCQSxDQUFDQSxDQUFDQTtZQUV4R0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2ZBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2xEQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDRkEsSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDakJBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEVBQUVBLE9BQU9BLENBQUNBLEVBQUVBLFFBQVFBLENBQUNBLEtBQUtBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNwRUEsQ0FBQ0E7Z0JBQ0RBLElBQUlBLENBQUNBLENBQUNBO29CQUNGQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxFQUFFQSxRQUFRQSxDQUFDQSxLQUFLQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtn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LHVCQUF1QkEsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBZ0NBO1FBRWhGQSxJQUFJQSxVQUFVQSxHQUFRQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQTtRQUtyREEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsR0FBR0EsTUFBTUEsR0FBR0EsU0FBU0EsR0FBR0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFFdEZBLElBQUlBLFFBQVFBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2xCQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDUkEsTUFBTUEsSUFBSUEsV0FBV0EsQ0FBQ0EsTUFBTUEsR0FBR0EsbURBQW1EQSxDQUFDQSxDQUFDQTtZQUN4RkEsQ0FBQ0E7WUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1RBLE1BQU1BLElBQUlBLFdBQVdBLENBQUNBLE1BQU1BLEdBQUdBLDhEQUE4REEsQ0FBQ0EsQ0FBQ0E7WUFDbkdBLENBQUNBO1lBQ0RBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQzFCQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDTkEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLENBQUNB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QUNBLE1BQU1BLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO2dCQUN4Q0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDdENBLENBQUNBO1lBRURBLFFBQVFBLEdBQUdBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBRXBDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxRQUFRQSxHQUFHQSxXQUFXQSxDQUFDQTtRQUNsQ0EsQ0FBQ0E7UUFLREEsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0E7UUFPakJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO1lBQ3BCQSxHQUFHQSxDQUFDQSxTQUFTQSxFQUFFQSxjQUFjQSxFQUFFQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQU83REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsaUJBQWlCQSxFQUFFQSxRQUFRQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUN2REEsQ0FBQ0E7UUFLREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUkEsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsZUFBZUEsQ0FBQ0EsQ0FBQ0E7UUFDcENBLENBQUNBO1FBZURBLElBQUlBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2ZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBO1lBSWpCQSxFQUFFQSxDQUFDQSxDQUFDQSxpQkFBaUJBLENBQUNBO2dCQUNsQkEsS0FBS0EsSUFBSUEsUUFBUUEsQ0FB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RUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDNUJBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1FBRTFDQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUN0QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDekJBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNsQ0EsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsUUFBUUEsR0FBR0EsVUFBVUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLFVBQVVBLEVBQUVBLFFBQVFBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO1FBQy9DQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxJQUFJQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQ0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEdBQUdBLENBQUNBLFVBQVVBLEVBQUVBLElBQUlBLEVBQUVBLGFBQWFBLEVBQUVBLElBQUlBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO1lBQ3hEQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN4QkEsQ0FB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TUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7SUFDekNBLElBQUlBLEdBQUdBLEdBQUdBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO0lBQzlDQSxJQUFJQSxFQUFFQSxHQUF5QkEsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7SUFFbkVBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBLFFBQVFBLEVBQUVBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO0lBRTlDQSxNQUFNQSxDQUFDQSxFQUFFQSxVQUFVQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtBQUNsRUEsQ0FBQ0E7QUFSZSxlQUFPLFVBUXRCLENBQUE7QUFBQSxDQUFDO0FBRUY7SUFDSUMsV0FBV0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7QUFDcEJBLENBQUNBO0FBRmUscUJBQWEsZ0JBRTVCLENBQUE7QUFBQSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGFzc2VydHMgPSByZXF1aXJlKCcuL2Fzc2VydHMnKTtcbmltcG9ydCBhc3Rub2RlcyA9IHJlcXVpcmUoJy4vYXN0bm9kZXMnKTtcbmltcG9ydCBidWlsZGVyID0gcmVxdWlyZSgnLi9idWlsZGVyJyk7XG5pbXBvcnQgcGFyc2VyID0gcmVxdWlyZSgnLi9QYXJzZXInKTtcbmltcG9ydCBzeW10YWJsZSA9IHJlcXVpcmUoJy4vc3ltdGFibGUnKTtcblxuXG52YXIgTE9DQUwgPSBzeW10YWJsZS5MT0NBTDtcbnZhciBHTE9CQUxfRVhQTElDSVQgPSBzeW10YWJsZS5HTE9CQUxfRVhQTElDSVQ7XG52YXIgR0xPQkFMX0lNUExJQ0lUID0gc3ltdGFibGUuR0xPQkFMX0lNUExJQ0lUO1xudmFyIEZSRUUgPSBzeW10YWJsZS5GUkVFO1xudmFyIENFTEwgPSBzeW10YWJsZS5DRUxMO1xudmFyIEZ1bmN0aW9uQmxvY2sgPSBzeW10YWJsZS5GdW5jdGlvbkJsb2NrO1xuXG4vKiogQHBhcmFtIHsuLi4qfSB4ICovXG52YXIgb3V0O1xuXG52YXIgZ2Vuc3ltY291bnQgPSAwO1xuXG52YXIgcmVzZXJ2ZWRXb3Jkc18gPSB7XG4gICAgJ2Fic3RyYWN0JzogdHJ1ZSxcbiAgICAnYXMnOiB0cnVlLFxuICAgICdib29sZWFuJzogdHJ1ZSxcbiAgICAnYnJlYWsnOiB0cnVlLFxuICAgICdieXRlJzogdHJ1ZSxcbiAgICAnY2FzZSc6IHRydWUsXG4gICAgJ2NhdGNoJzogdHJ1ZSxcbiAgICAnY2hhcic6IHRydWUsXG4gICAgJ2NsYXNzJzogdHJ1ZSxcbiAgICAnY29udGludWUnOiB0cnVlLFxuICAgICdjb25zdCc6IHRydWUsXG4gICAgJ2RlYnVnZ2VyJzogdHJ1ZSxcbiAgICAnZGVmYXVsdCc6IHRydWUsXG4gICAgJ2RlbGV0ZSc6IHRydWUsXG4gICAgJ2RvJzogdHJ1ZSxcbiAgICAnZG91YmxlJzogdHJ1ZSxcbiAgICAnZWxzZSc6IHRydWUsXG4gICAgJ2VudW0nOiB0cnVlLFxuICAgICdleHBvcnQnOiB0cnVlLFxuICAgICdleHRlbmRzJzogdHJ1ZSxcbiAgICAnZmFsc2UnOiB0cnVlLFxuICAgICdmaW5hbCc6IHRydWUsXG4gICAgJ2ZpbmFsbHknOiB0cnVlLFxuICAgICdmbG9hdCc6IHRydWUsXG4gICAgJ2Zvcic6IHRydWUsXG4gICAgJ2Z1bmN0aW9uJzogdHJ1ZSxcbiAgICAnZ290byc6IHRydWUsXG4gICAgJ2lmJzogdHJ1ZSxcbiAgICAnaW1wbGVtZW50cyc6IHRydWUsXG4gICAgJ2ltcG9ydCc6IHRydWUsXG4gICAgJ2luJzogdHJ1ZSxcbiAgICAnaW5zdGFuY2VvZic6IHRydWUsXG4gICAgJ2ludCc6IHRydWUsXG4gICAgJ2ludGVyZmFjZSc6IHRydWUsXG4gICAgJ2lzJzogdHJ1ZSxcbiAgICAnbG9uZyc6IHRydWUsXG4gICAgJ25hbWVzcGFjZSc6IHRydWUsXG4gICAgJ25hdGl2ZSc6IHRydWUsXG4gICAgJ25ldyc6IHRydWUsXG4gICAgJ251bGwnOiB0cnVlLFxuICAgICdwYWNrYWdlJzogdHJ1ZSxcbiAgICAncHJpdmF0ZSc6IHRydWUsXG4gICAgJ3Byb3RlY3RlZCc6IHRydWUsXG4gICAgJ3B1YmxpYyc6IHRydWUsXG4gICAgJ3JldHVybic6IHRydWUsXG4gICAgJ3Nob3J0JzogdHJ1ZSxcbiAgICAnc3RhdGljJzogdHJ1ZSxcbiAgICAnc3VwZXInOiBmYWxzZSxcbiAgICAnc3dpdGNoJzogdHJ1ZSxcbiAgICAnc3luY2hyb25pemVkJzogdHJ1ZSxcbiAgICAndGhpcyc6IHRydWUsXG4gICAgJ3Rocm93JzogdHJ1ZSxcbiAgICAndGhyb3dzJzogdHJ1ZSxcbiAgICAndHJhbnNpZW50JzogdHJ1ZSxcbiAgICAndHJ1ZSc6IHRydWUsXG4gICAgJ3RyeSc6IHRydWUsXG4gICAgJ3R5cGVvZic6IHRydWUsXG4gICAgJ3VzZSc6IHRydWUsXG4gICAgJ3Zhcic6IHRydWUsXG4gICAgJ3ZvaWQnOiB0cnVlLFxuICAgICd2b2xhdGlsZSc6IHRydWUsXG4gICAgJ3doaWxlJzogdHJ1ZSxcbiAgICAnd2l0aCc6IHRydWVcbn07XG5cbmZ1bmN0aW9uIGZpeFJlc2VydmVkV29yZHMobmFtZSkge1xuICAgIGlmIChyZXNlcnZlZFdvcmRzX1tuYW1lXSAhPT0gdHJ1ZSkge1xuICAgICAgICByZXR1cm4gbmFtZTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBuYW1lICsgXCJfJHJ3JFwiO1xuICAgIH1cbn1cblxudmFyIHJlc2VydmVkTmFtZXNfID0ge1xuICAgICdfX2RlZmluZUdldHRlcl9fJzogdHJ1ZSxcbiAgICAnX19kZWZpbmVTZXR0ZXJfXyc6IHRydWUsXG4gICAgJ2FwcGx5JzogdHJ1ZSxcbiAgICAnY2FsbCc6IHRydWUsXG4gICAgJ2V2YWwnOiB0cnVlLFxuICAgICdoYXNPd25Qcm9wZXJ0eSc6IHRydWUsXG4gICAgJ2lzUHJvdG90eXBlT2YnOiB0cnVlLFxuICAgICdfX2xvb2t1cEdldHRlcl9fJzogdHJ1ZSxcbiAgICAnX19sb29rdXBTZXR0ZXJfXyc6IHRydWUsXG4gICAgJ19fbm9TdWNoTWV0aG9kX18nOiB0cnVlLFxuICAgICdwcm9wZXJ0eUlzRW51bWVyYWJsZSc6IHRydWUsXG4gICAgJ3RvU291cmNlJzogdHJ1ZSxcbiAgICAndG9Mb2NhbGVTdHJpbmcnOiB0cnVlLFxuICAgICd0b1N0cmluZyc6IHRydWUsXG4gICAgJ3Vud2F0Y2gnOiB0cnVlLFxuICAgICd2YWx1ZU9mJzogdHJ1ZSxcbiAgICAnd2F0Y2gnOiB0cnVlLFxuICAgICdsZW5ndGgnOiB0cnVlXG59O1xuXG5mdW5jdGlvbiBmaXhSZXNlcnZlZE5hbWVzKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgaWYgKHJlc2VydmVkTmFtZXNfW25hbWVdKSB7XG4gICAgICAgIHJldHVybiBuYW1lICsgXCJfJHJuJFwiO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5hbWU7XG4gICAgfVxufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBwcml2XG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICogQHJldHVybiB7c3RyaW5nfSBUaGUgbWFuZ2xlZCBuYW1lLlxuICovXG5mdW5jdGlvbiBtYW5nbGVOYW1lKHByaXY6IHN0cmluZywgbmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICB2YXIgc3RycHJpdiA9IG51bGw7XG5cbiAgICBpZiAocHJpdiA9PT0gbnVsbCB8fCBuYW1lID09PSBudWxsIHx8IG5hbWUuY2hhckF0KDApICE9PSAnXycgfHwgbmFtZS5jaGFyQXQoMSkgIT09ICdfJylcbiAgICAgICAgcmV0dXJuIG5hbWU7XG4gICAgLy8gZG9uJ3QgbWFuZ2xlIF9faWRfX1xuICAgIGlmIChuYW1lLmNoYXJBdChuYW1lLmxlbmd0aCAtIDEpID09PSAnXycgJiYgbmFtZS5jaGFyQXQobmFtZS5sZW5ndGggLSAyKSA9PT0gJ18nKVxuICAgICAgICByZXR1cm4gbmFtZTtcbiAgICAvLyBkb24ndCBtYW5nbGUgY2xhc3NlcyB0aGF0IGFyZSBhbGwgXyAob2JzY3VyZSBtdWNoPylcbiAgICBzdHJwcml2ID0gcHJpdjtcbiAgICBzdHJwcml2LnJlcGxhY2UoL18vZywgJycpO1xuICAgIGlmIChzdHJwcml2ID09PSAnJylcbiAgICAgICAgcmV0dXJuIG5hbWU7XG5cbiAgICBzdHJwcml2ID0gcHJpdjtcbiAgICBzdHJwcml2LnJlcGxhY2UoL15fKi8sICcnKTtcbiAgICByZXR1cm4gJ18nICsgc3RycHJpdiArIG5hbWU7XG59XG5cbnZhciB0b1N0cmluZ0xpdGVyYWxKUyA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgLy8gc2luZ2xlIGlzIHByZWZlcnJlZFxuICAgIHZhciBxdW90ZSA9IFwiJ1wiO1xuICAgIGlmICh2YWx1ZS5pbmRleE9mKFwiJ1wiKSAhPT0gLTEgJiYgdmFsdWUuaW5kZXhPZignXCInKSA9PT0gLTEpIHtcbiAgICAgICAgcXVvdGUgPSAnXCInO1xuICAgIH1cbiAgICB2YXIgbGVuID0gdmFsdWUubGVuZ3RoO1xuICAgIHZhciByZXQgPSBxdW90ZTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciBjID0gdmFsdWUuY2hhckF0KGkpO1xuICAgICAgICBpZiAoYyA9PT0gcXVvdGUgfHwgYyA9PT0gJ1xcXFwnKVxuICAgICAgICAgICAgcmV0ICs9ICdcXFxcJyArIGM7XG4gICAgICAgIGVsc2UgaWYgKGMgPT09ICdcXHQnKVxuICAgICAgICAgICAgcmV0ICs9ICdcXFxcdCc7XG4gICAgICAgIGVsc2UgaWYgKGMgPT09ICdcXG4nKVxuICAgICAgICAgICAgcmV0ICs9ICdcXFxcbic7XG4gICAgICAgIGVsc2UgaWYgKGMgPT09ICdcXHInKVxuICAgICAgICAgICAgcmV0ICs9ICdcXFxccic7XG4gICAgICAgIGVsc2UgaWYgKGMgPCAnICcgfHwgYyA+PSAweDdmKSB7XG4gICAgICAgICAgICB2YXIgYXNoZXggPSBjLmNoYXJDb2RlQXQoMCkudG9TdHJpbmcoMTYpO1xuICAgICAgICAgICAgaWYgKGFzaGV4Lmxlbmd0aCA8IDIpIGFzaGV4ID0gXCIwXCIgKyBhc2hleDtcbiAgICAgICAgICAgIHJldCArPSBcIlxcXFx4XCIgKyBhc2hleDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXQgKz0gYztcbiAgICB9XG4gICAgcmV0ICs9IHF1b3RlO1xuICAgIHJldHVybiByZXQ7XG59O1xuXG52YXIgT1BfRkFTVCA9IDA7XG52YXIgT1BfR0xPQkFMID0gMTtcbnZhciBPUF9ERVJFRiA9IDI7XG52YXIgT1BfTkFNRSA9IDM7XG52YXIgRF9OQU1FUyA9IDA7XG52YXIgRF9GUkVFVkFSUyA9IDE7XG52YXIgRF9DRUxMVkFSUyA9IDI7XG5cbmNsYXNzIENvbXBpbGVyVW5pdCB7XG4gICAgcHVibGljIHN0ZTogc3ltdGFibGUuU3ltYm9sVGFibGVTY29wZSA9IG51bGw7XG4gICAgcHVibGljIG5hbWU6IHN0cmluZyA9IG51bGw7XG4gICAgcHVibGljIHByaXZhdGVfOiBzdHJpbmcgPSBudWxsO1xuICAgIHB1YmxpYyBmaXJzdGxpbmVubyA9IDA7XG4gICAgcHVibGljIGxpbmVubyA9IDA7XG4gICAgcHVibGljIGxpbmVub1NldCA9IGZhbHNlO1xuICAgIHB1YmxpYyBsb2NhbG5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIHB1YmxpYyBibG9ja251bSA9IDA7XG4gICAgcHVibGljIGJsb2NrcyA9IFtdO1xuICAgIHB1YmxpYyBjdXJibG9jazogbnVtYmVyID0gMDtcbiAgICBwdWJsaWMgc2NvcGVuYW1lOiBzdHJpbmcgPSBudWxsO1xuICAgIHB1YmxpYyBwcmVmaXhDb2RlOiBzdHJpbmcgPSAnJztcbiAgICBwdWJsaWMgdmFyRGVjbHNDb2RlOiBzdHJpbmcgPSAnJztcbiAgICBwdWJsaWMgc3dpdGNoQ29kZTogc3RyaW5nID0gJyc7XG4gICAgcHVibGljIHN1ZmZpeENvZGU6IHN0cmluZyA9ICcnO1xuICAgIC8qKlxuICAgICAqIFN0YWNrIG9mIHdoZXJlIHRvIGdvIG9uIGEgYnJlYWsuXG4gICAgICovXG4gICAgcHVibGljIGJyZWFrQmxvY2tzOiBudW1iZXJbXSA9IFtdO1xuICAgIC8qKlxuICAgICAqIFN0YWNrIG9mIHdoZXJlIHRvIGdvIG9uIGEgY29udGludWUuXG4gICAgICovXG4gICAgcHVibGljIGNvbnRpbnVlQmxvY2tzOiBudW1iZXJbXSA9IFtdO1xuICAgIHB1YmxpYyBleGNlcHRCbG9ja3M6IG51bWJlcltdID0gW107XG4gICAgcHVibGljIGZpbmFsbHlCbG9ja3M6IG51bWJlcltdID0gW107XG5cbiAgICBwdWJsaWMgYXJnbmFtZXM6IHN0cmluZ1tdO1xuICAgIC8qKlxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqXG4gICAgICogU3R1ZmYgdGhhdCBjaGFuZ2VzIG9uIGVudHJ5L2V4aXQgb2YgY29kZSBibG9ja3MuIG11c3QgYmUgc2F2ZWQgYW5kIHJlc3RvcmVkXG4gICAgICogd2hlbiByZXR1cm5pbmcgdG8gYSBibG9jay5cbiAgICAgKlxuICAgICAqIENvcnJlc3BvbmRzIHRvIHRoZSBib2R5IG9mIGEgbW9kdWxlLCBjbGFzcywgb3IgZnVuY3Rpb24uXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgfVxuXG4gICAgYWN0aXZhdGVTY29wZSgpIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgIG91dCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIGIgPSBzZWxmLmJsb2Nrc1tzZWxmLmN1cmJsb2NrXTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgKytpKVxuICAgICAgICAgICAgICAgIGIucHVzaChhcmd1bWVudHNbaV0pO1xuICAgICAgICB9O1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbXBpbGVyIHtcbiAgICBwcml2YXRlIGZpbGVOYW1lOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBzdDogc3ltdGFibGUuU3ltYm9sVGFibGU7XG4gICAgcHJpdmF0ZSBmbGFncztcbiAgICBwcml2YXRlIGludGVyYWN0aXZlOiBib29sZWFuID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBuZXN0bGV2ZWw6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSB1OiBDb21waWxlclVuaXQgPSBudWxsO1xuICAgIHByaXZhdGUgc3RhY2s6IENvbXBpbGVyVW5pdFtdID0gW107XG4gICAgcHVibGljIHJlc3VsdDogc3RyaW5nW10gPSBbXTtcbiAgICBwcml2YXRlIGFsbFVuaXRzOiBDb21waWxlclVuaXRbXSA9IFtdO1xuICAgIHByaXZhdGUgc291cmNlO1xuICAgIC8qKlxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlTmFtZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBzdFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBmbGFnc1xuICAgICAqIEBwYXJhbSB7c3RyaW5nPX0gc291cmNlQ29kZUZvckFubm90YXRpb24gdXNlZCB0byBhZGQgb3JpZ2luYWwgc291cmNlIHRvIGxpc3RpbmcgaWYgZGVzaXJlZFxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGZpbGVOYW1lOiBzdHJpbmcsIHN0OiBzeW10YWJsZS5TeW1ib2xUYWJsZSwgZmxhZ3M6IG51bWJlciwgc291cmNlQ29kZUZvckFubm90YXRpb24pIHtcbiAgICAgICAgdGhpcy5maWxlTmFtZSA9IGZpbGVOYW1lO1xuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUge09iamVjdH1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuc3QgPSBzdDtcbiAgICAgICAgdGhpcy5mbGFncyA9IGZsYWdzO1xuXG4gICAgICAgIC8vIHRoaXMuZ2Vuc3ltY291bnQgPSAwO1xuICAgICAgICB0aGlzLnNvdXJjZSA9IHNvdXJjZUNvZGVGb3JBbm5vdGF0aW9uID8gc291cmNlQ29kZUZvckFubm90YXRpb24uc3BsaXQoXCJcXG5cIikgOiBmYWxzZTtcbiAgICB9XG5cbiAgICBnZXRTb3VyY2VMaW5lKGxpbmVubzogbnVtYmVyKSB7XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KHRoaXMuc291cmNlKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuc291cmNlW2xpbmVubyAtIDFdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXQgdGhlIEphdmFTY3JpcHQgY29kZSB0aGF0IGNvbW1lbnRzIGFuZCByZXBvcnRzIHRoZSBvcmlnaW5hbCBQeXRob24gY29kZSBwb3NpdGlvbi5cbiAgICAgKi9cbiAgICBhbm5vdGF0ZVNvdXJjZShhc3Q6IHtsaW5lbm86bnVtYmVyOyBjb2xfb2Zmc2V0OiBudW1iZXJ9KSB7XG4gICAgICAgIGlmICh0aGlzLnNvdXJjZSkge1xuICAgICAgICAgICAgb3V0KCdcXG4vLycpO1xuICAgICAgICAgICAgb3V0KCdcXG4vLyBsaW5lICcsIGFzdC5saW5lbm8sICc6Jyk7XG4gICAgICAgICAgICBvdXQoJ1xcbi8vICcsIHRoaXMuZ2V0U291cmNlTGluZShhc3QubGluZW5vKSk7XG5cbiAgICAgICAgICAgIC8vXG4gICAgICAgICAgICBvdXQoJ1xcbi8vICcpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhc3QuY29sX29mZnNldDsgKytpKSB7XG4gICAgICAgICAgICAgICAgb3V0KFwiIFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG91dChcIl5cIik7XG5cbiAgICAgICAgICAgIG91dChcIlxcbi8vXCIpO1xuXG4gICAgICAgICAgICBvdXQoJ1xcblNrLmN1cnJMaW5lTm8gPSAnLCBhc3QubGluZW5vLCAnO1NrLmN1cnJDb2xObyA9ICcsIGFzdC5jb2xfb2Zmc2V0LCAnOycpO1xuICAgICAgICAgICAgb3V0KFwiXFxuU2suY3VyckZpbGVuYW1lID0gJ1wiLCB0aGlzLmZpbGVOYW1lLCBcIic7XFxuXFxuXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2Vuc3ltKGhpbnQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIGhpbnQgPSBoaW50IHx8ICcnO1xuICAgICAgICBoaW50ID0gJyQnICsgaGludDtcbiAgICAgICAgaGludCArPSBnZW5zeW1jb3VudCsrO1xuICAgICAgICByZXR1cm4gaGludDtcbiAgICB9XG5cbiAgICBuaWNlTmFtZShyb3VnaE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmdlbnN5bShyb3VnaE5hbWUucmVwbGFjZShcIjxcIiwgXCJcIikucmVwbGFjZShcIj5cIiwgXCJcIikucmVwbGFjZShcIiBcIiwgXCJfXCIpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gaGludCBiYXNlbmFtZSBmb3IgZ2Vuc3ltXG4gICAgICogQHBhcmFtIHsuLi4qfSByZXN0XG4gICAgICovXG4gICAgX2dyID0gZnVuY3Rpb24oaGludDogc3RyaW5nLCAuLi5yZXN0OiBhbnlbXSk6IHN0cmluZyB7XG4gICAgICAgIHZhciB2OiBzdHJpbmcgPSB0aGlzLmdlbnN5bShoaW50KTtcbiAgICAgICAgb3V0KFwidmFyIFwiLCB2LCBcIj1cIik7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBvdXQoYXJndW1lbnRzW2ldKTtcbiAgICAgICAgfVxuICAgICAgICBvdXQoXCI7XCIpO1xuICAgICAgICByZXR1cm4gdjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEZ1bmN0aW9uIHRvIHRlc3QgaWYgYW4gaW50ZXJydXB0IHNob3VsZCBvY2N1ciBpZiB0aGUgcHJvZ3JhbSBoYXMgYmVlbiBydW5uaW5nIGZvciB0b28gbG9uZy5cbiAgICAqIFRoaXMgZnVuY3Rpb24gaXMgZXhlY3V0ZWQgYXQgZXZlcnkgdGVzdC9icmFuY2ggb3BlcmF0aW9uLlxuICAgICovXG4gICAgX2ludGVycnVwdFRlc3QoKSB7XG4gICAgICAgIG91dChcImlmICh0eXBlb2YgU2suZXhlY1N0YXJ0ID09PSAndW5kZWZpbmVkJykge1NrLmV4ZWNTdGFydD1uZXcgRGF0ZSgpfVwiKTtcbiAgICAgICAgb3V0KFwiaWYgKFNrLmV4ZWNMaW1pdCAhPT0gbnVsbCAmJiBuZXcgRGF0ZSgpIC0gU2suZXhlY1N0YXJ0ID4gU2suZXhlY0xpbWl0KSB7dGhyb3cgbmV3IFNrLmJ1aWx0aW4uVGltZUxpbWl0RXJyb3IoU2sudGltZW91dE1zZygpKX1cIik7XG4gICAgfVxuXG4gICAgX2p1bXBmYWxzZSh0ZXN0LCBibG9jaykge1xuICAgICAgICB2YXIgY29uZCA9IHRoaXMuX2dyKCdqZmFsc2UnLCBcIihcIiwgdGVzdCwgXCI9PT1mYWxzZXx8IVNrLm1pc2NldmFsLmlzVHJ1ZShcIiwgdGVzdCwgXCIpKVwiKTtcbiAgICAgICAgdGhpcy5faW50ZXJydXB0VGVzdCgpO1xuICAgICAgICBvdXQoXCJpZihcIiwgY29uZCwgXCIpey8qdGVzdCBmYWlsZWQgKi8kYmxrPVwiLCBibG9jaywgXCI7Y29udGludWU7fVwiKTtcbiAgICB9XG5cbiAgICBfanVtcHVuZGVmKHRlc3QsIGJsb2NrKSB7XG4gICAgICAgIHRoaXMuX2ludGVycnVwdFRlc3QoKTtcbiAgICAgICAgb3V0KFwiaWYodHlwZW9mIFwiLCB0ZXN0LCBcIiA9PT0gJ3VuZGVmaW5lZCcpeyRibGs9XCIsIGJsb2NrLCBcIjtjb250aW51ZTt9XCIpO1xuICAgIH1cblxuICAgIF9qdW1wdHJ1ZSh0ZXN0LCBibG9jaykge1xuICAgICAgICB2YXIgY29uZCA9IHRoaXMuX2dyKCdqdHJ1ZScsIFwiKFwiLCB0ZXN0LCBcIj09PXRydWV8fFNrLm1pc2NldmFsLmlzVHJ1ZShcIiwgdGVzdCwgXCIpKVwiKTtcbiAgICAgICAgdGhpcy5faW50ZXJydXB0VGVzdCgpO1xuICAgICAgICBvdXQoXCJpZihcIiwgY29uZCwgXCIpey8qdGVzdCBwYXNzZWQgKi8kYmxrPVwiLCBibG9jaywgXCI7Y29udGludWU7fVwiKTtcbiAgICB9XG5cbiAgICBfanVtcChibG9jaykge1xuICAgICAgICB0aGlzLl9pbnRlcnJ1cHRUZXN0KCk7XG4gICAgICAgIG91dChcIiRibGs9XCIsIGJsb2NrLCBcIjsvKiBqdW1wICovY29udGludWU7XCIpO1xuICAgIH1cblxuICAgIGN0dXBsZW9ybGlzdChlLCBkYXRhLCB0dXBvcmxpc3Q6IHN0cmluZykge1xuICAgICAgICBhc3NlcnRzLmFzc2VydCh0dXBvcmxpc3QgPT09ICd0dXBsZScgfHwgdHVwb3JsaXN0ID09PSAnbGlzdCcpO1xuICAgICAgICBpZiAoZS5jdHggPT09IGFzdG5vZGVzLlN0b3JlKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGUuZWx0cy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgICAgIHRoaXMudmV4cHIoZS5lbHRzW2ldLCBcIlNrLmFic3RyLm9iamVjdEdldEl0ZW0oXCIgKyBkYXRhICsgXCIsXCIgKyBpICsgXCIpXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGUuY3R4ID09PSBhc3Rub2Rlcy5Mb2FkKSB7XG4gICAgICAgICAgICB2YXIgaXRlbXMgPSBbXTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZS5lbHRzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICAgICAgaXRlbXMucHVzaCh0aGlzLl9ncignZWxlbScsIHRoaXMudmV4cHIoZS5lbHRzW2ldKSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2dyKCdsb2FkJyArIHR1cG9ybGlzdCwgXCJuZXcgU2suYnVpbHRpbnNbJ1wiLCB0dXBvcmxpc3QsIFwiJ10oW1wiLCBpdGVtcywgXCJdKVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNkaWN0KGUpIHtcbiAgICAgICAgYXNzZXJ0cy5hc3NlcnQoZS52YWx1ZXMubGVuZ3RoID09PSBlLmtleXMubGVuZ3RoKTtcbiAgICAgICAgdmFyIGl0ZW1zID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZS52YWx1ZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIHZhciB2ID0gdGhpcy52ZXhwcihlLnZhbHVlc1tpXSk7IC8vIFwiYmFja3dhcmRzXCIgdG8gbWF0Y2ggb3JkZXIgaW4gY3B5XG4gICAgICAgICAgICBpdGVtcy5wdXNoKHRoaXMudmV4cHIoZS5rZXlzW2ldKSk7XG4gICAgICAgICAgICBpdGVtcy5wdXNoKHYpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9ncignbG9hZGRpY3QnLCBcIm5ldyBTay5idWlsdGluc1snZGljdCddKFtcIiwgaXRlbXMsIFwiXSlcIik7XG4gICAgfVxuXG4gICAgY2xpc3Rjb21wZ2VuID0gZnVuY3Rpb24odG1wbmFtZSwgZ2VuZXJhdG9ycywgZ2VuSW5kZXgsIGVsdCkge1xuICAgICAgICB2YXIgc3RhcnQgPSB0aGlzLm5ld0Jsb2NrKCdsaXN0IGdlbiBzdGFydCcpO1xuICAgICAgICB2YXIgc2tpcCA9IHRoaXMubmV3QmxvY2soJ2xpc3QgZ2VuIHNraXAnKTtcbiAgICAgICAgdmFyIGFuY2hvciA9IHRoaXMubmV3QmxvY2soJ2xpc3QgZ2VuIGFuY2hvcicpO1xuXG4gICAgICAgIHZhciBsID0gZ2VuZXJhdG9yc1tnZW5JbmRleF07XG4gICAgICAgIHZhciB0b2l0ZXIgPSB0aGlzLnZleHByKGwuaXRlcik7XG4gICAgICAgIHZhciBpdGVyID0gdGhpcy5fZ3IoXCJpdGVyXCIsIFwiU2suYWJzdHIuaXRlcihcIiwgdG9pdGVyLCBcIilcIik7XG4gICAgICAgIHRoaXMuX2p1bXAoc3RhcnQpO1xuICAgICAgICB0aGlzLnNldEJsb2NrKHN0YXJ0KTtcblxuICAgICAgICAvLyBsb2FkIHRhcmdldHNcbiAgICAgICAgdmFyIG5leHRpID0gdGhpcy5fZ3IoJ25leHQnLCBcIlNrLmFic3RyLml0ZXJuZXh0KFwiLCBpdGVyLCBcIilcIik7XG4gICAgICAgIHRoaXMuX2p1bXB1bmRlZihuZXh0aSwgYW5jaG9yKTsgLy8gdG9kbzsgdGhpcyBzaG91bGQgYmUgaGFuZGxlZCBieSBTdG9wSXRlcmF0aW9uXG4gICAgICAgIHZhciB0YXJnZXQgPSB0aGlzLnZleHByKGwudGFyZ2V0LCBuZXh0aSk7XG5cbiAgICAgICAgdmFyIG4gPSBsLmlmcy5sZW5ndGg7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgICAgICB2YXIgaWZyZXMgPSB0aGlzLnZleHByKGwuaWZzW2ldKTtcbiAgICAgICAgICAgIHRoaXMuX2p1bXBmYWxzZShpZnJlcywgc3RhcnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCsrZ2VuSW5kZXggPCBnZW5lcmF0b3JzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy5jbGlzdGNvbXBnZW4odG1wbmFtZSwgZ2VuZXJhdG9ycywgZ2VuSW5kZXgsIGVsdCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZ2VuSW5kZXggPj0gZ2VuZXJhdG9ycy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHZhciB2ZWx0ID0gdGhpcy52ZXhwcihlbHQpO1xuICAgICAgICAgICAgb3V0KHRtcG5hbWUsIFwiLnYucHVzaChcIiwgdmVsdCwgXCIpO1wiKTtcbiAgICAgICAgICAgIHRoaXMuX2p1bXAoc2tpcCk7XG4gICAgICAgICAgICB0aGlzLnNldEJsb2NrKHNraXApO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fanVtcChzdGFydCk7XG5cbiAgICAgICAgdGhpcy5zZXRCbG9jayhhbmNob3IpO1xuXG4gICAgICAgIHJldHVybiB0bXBuYW1lO1xuICAgIH1cblxuICAgIGNsaXN0Y29tcChlKSB7XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KGUgaW5zdGFuY2VvZiBhc3Rub2Rlcy5MaXN0Q29tcCk7XG4gICAgICAgIHZhciB0bXAgPSB0aGlzLl9ncihcIl9jb21wclwiLCBcIm5ldyBTay5idWlsdGluc1snbGlzdCddKFtdKVwiKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2xpc3Rjb21wZ2VuKHRtcCwgZS5nZW5lcmF0b3JzLCAwLCBlLmVsdCk7XG4gICAgfVxuXG4gICAgY3lpZWxkKGUpIHtcbiAgICAgICAgaWYgKHRoaXMudS5zdGUuYmxvY2tUeXBlICE9PSBGdW5jdGlvbkJsb2NrKVxuICAgICAgICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKFwiJ3lpZWxkJyBvdXRzaWRlIGZ1bmN0aW9uXCIpO1xuICAgICAgICB2YXIgdmFsID0gJ251bGwnO1xuICAgICAgICBpZiAoZS52YWx1ZSlcbiAgICAgICAgICAgIHZhbCA9IHRoaXMudmV4cHIoZS52YWx1ZSk7XG4gICAgICAgIHZhciBuZXh0QmxvY2sgPSB0aGlzLm5ld0Jsb2NrKCdhZnRlciB5aWVsZCcpO1xuICAgICAgICAvLyByZXR1cm4gYSBwYWlyOiByZXN1bWUgdGFyZ2V0IGJsb2NrIGFuZCB5aWVsZGVkIHZhbHVlXG4gICAgICAgIG91dChcInJldHVybiBbLypyZXN1bWUqL1wiLCBuZXh0QmxvY2ssIFwiLC8qcmV0Ki9cIiwgdmFsLCBcIl07XCIpO1xuICAgICAgICB0aGlzLnNldEJsb2NrKG5leHRCbG9jayk7XG4gICAgICAgIHJldHVybiAnJGdlbi5naSRzZW50dmFsdWUnOyAvLyB3aWxsIGVpdGhlciBiZSBudWxsIGlmIG5vbmUgc2VudCwgb3IgdGhlIHZhbHVlIGZyb20gZ2VuLnNlbmQodmFsdWUpXG4gICAgfVxuXG4gICAgY2NvbXBhcmUoZSkge1xuICAgICAgICBhc3NlcnRzLmFzc2VydChlLm9wcy5sZW5ndGggPT09IGUuY29tcGFyYXRvcnMubGVuZ3RoKTtcbiAgICAgICAgdmFyIGN1ciA9IHRoaXMudmV4cHIoZS5sZWZ0KTtcbiAgICAgICAgdmFyIG4gPSBlLm9wcy5sZW5ndGg7XG4gICAgICAgIHZhciBkb25lID0gdGhpcy5uZXdCbG9jayhcImRvbmVcIik7XG4gICAgICAgIHZhciBmcmVzID0gdGhpcy5fZ3IoJ2NvbXBhcmVyZXMnLCAnbnVsbCcpO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgICAgICB2YXIgcmhzID0gdGhpcy52ZXhwcihlLmNvbXBhcmF0b3JzW2ldKTtcbiAgICAgICAgICAgIHZhciByZXMgPSB0aGlzLl9ncignY29tcGFyZScsIFwiU2suYnVpbHRpbi5ib29sKFNrLm1pc2NldmFsLnJpY2hDb21wYXJlQm9vbChcIiwgY3VyLCBcIixcIiwgcmhzLCBcIiwnXCIsIGUub3BzW2ldLnByb3RvdHlwZS5fYXN0bmFtZSwgXCInKSlcIik7XG4gICAgICAgICAgICBvdXQoZnJlcywgJz0nLCByZXMsICc7Jyk7XG4gICAgICAgICAgICB0aGlzLl9qdW1wZmFsc2UocmVzLCBkb25lKTtcbiAgICAgICAgICAgIGN1ciA9IHJocztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9qdW1wKGRvbmUpO1xuICAgICAgICB0aGlzLnNldEJsb2NrKGRvbmUpO1xuICAgICAgICByZXR1cm4gZnJlcztcbiAgICB9XG5cbiAgICBjY2FsbChlKSB7XG4gICAgICAgIHZhciBmdW5jID0gdGhpcy52ZXhwcihlLmZ1bmMpO1xuICAgICAgICB2YXIgYXJncyA9IHRoaXMudnNlcWV4cHIoZS5hcmdzKTtcblxuICAgICAgICBpZiAoZS5rZXl3b3Jkcy5sZW5ndGggPiAwIHx8IGUuc3RhcmFyZ3MgfHwgZS5rd2FyZ3MpIHtcbiAgICAgICAgICAgIHZhciBrd2FycmF5ID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGUua2V5d29yZHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgICAgICBrd2FycmF5LnB1c2goXCInXCIgKyBlLmtleXdvcmRzW2ldLmFyZyArIFwiJ1wiKTtcbiAgICAgICAgICAgICAgICBrd2FycmF5LnB1c2godGhpcy52ZXhwcihlLmtleXdvcmRzW2ldLnZhbHVlKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIga2V5d29yZHMgPSBcIltcIiArIGt3YXJyYXkuam9pbihcIixcIikgKyBcIl1cIjtcbiAgICAgICAgICAgIHZhciBzdGFyYXJncyA9IFwidW5kZWZpbmVkXCI7XG4gICAgICAgICAgICB2YXIga3dhcmdzID0gXCJ1bmRlZmluZWRcIjtcbiAgICAgICAgICAgIGlmIChlLnN0YXJhcmdzKVxuICAgICAgICAgICAgICAgIHN0YXJhcmdzID0gdGhpcy52ZXhwcihlLnN0YXJhcmdzKTtcbiAgICAgICAgICAgIGlmIChlLmt3YXJncylcbiAgICAgICAgICAgICAgICBrd2FyZ3MgPSB0aGlzLnZleHByKGUua3dhcmdzKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9ncignY2FsbCcsIFwiU2subWlzY2V2YWwuY2FsbChcIiwgZnVuYywgXCIsXCIsIGt3YXJncywgXCIsXCIsIHN0YXJhcmdzLCBcIixcIiwga2V5d29yZHMsIGFyZ3MubGVuZ3RoID4gMCA/IFwiLFwiIDogXCJcIiwgYXJncywgXCIpXCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2dyKCdjYWxsJywgXCJTay5taXNjZXZhbC5jYWxsc2ltKFwiLCBmdW5jLCBhcmdzLmxlbmd0aCA+IDAgPyBcIixcIiA6IFwiXCIsIGFyZ3MsIFwiKVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNzbGljZShzKSB7XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KHMgaW5zdGFuY2VvZiBhc3Rub2Rlcy5TbGljZSk7XG4gICAgICAgIHZhciBsb3cgPSBzLmxvd2VyID8gdGhpcy52ZXhwcihzLmxvd2VyKSA6ICdudWxsJztcbiAgICAgICAgdmFyIGhpZ2ggPSBzLnVwcGVyID8gdGhpcy52ZXhwcihzLnVwcGVyKSA6ICdudWxsJztcbiAgICAgICAgdmFyIHN0ZXAgPSBzLnN0ZXAgPyB0aGlzLnZleHByKHMuc3RlcCkgOiAnbnVsbCc7XG4gICAgICAgIHJldHVybiB0aGlzLl9ncignc2xpY2UnLCBcIm5ldyBTay5idWlsdGluc1snc2xpY2UnXShcIiwgbG93LCBcIixcIiwgaGlnaCwgXCIsXCIsIHN0ZXAsIFwiKVwiKTtcbiAgICB9XG5cbiAgICB2c2xpY2VzdWIocykge1xuICAgICAgICB2YXIgc3VicztcbiAgICAgICAgc3dpdGNoIChzLmNvbnN0cnVjdG9yKSB7XG4gICAgICAgICAgICBjYXNlIE51bWJlcjpcbiAgICAgICAgICAgIGNhc2UgU3RyaW5nOlxuICAgICAgICAgICAgICAgIC8vIEFscmVhZHkgY29tcGlsZWQsIHNob3VsZCBvbmx5IGhhcHBlbiBmb3IgYXVnbWVudGVkIGFzc2lnbm1lbnRzXG4gICAgICAgICAgICAgICAgc3VicyA9IHM7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkluZGV4OlxuICAgICAgICAgICAgICAgIHN1YnMgPSB0aGlzLnZleHByKHMudmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5TbGljZTpcbiAgICAgICAgICAgICAgICBzdWJzID0gdGhpcy5jc2xpY2Uocyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkVsbGlwc2lzOlxuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5FeHRTbGljZTpcbiAgICAgICAgICAgICAgICBhc3NlcnRzLmZhaWwoXCJ0b2RvO1wiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgYXNzZXJ0cy5mYWlsKFwiaW52YWxpZCBzdWJzY3JpcHQga2luZFwiKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3VicztcbiAgICB9XG5cbiAgICB2c2xpY2UocywgY3R4LCBvYmosIGRhdGFUb1N0b3JlKSB7XG4gICAgICAgIHZhciBzdWJzID0gdGhpcy52c2xpY2VzdWIocyk7XG4gICAgICAgIHJldHVybiB0aGlzLmNoYW5kbGVzdWJzY3IoY3R4LCBvYmosIHN1YnMsIGRhdGFUb1N0b3JlKTtcbiAgICB9XG5cbiAgICBjaGFuZGxlc3Vic2NyKGN0eCwgb2JqLCBzdWJzLCBkYXRhKSB7XG4gICAgICAgIGlmIChjdHggPT09IGFzdG5vZGVzLkxvYWQgfHwgY3R4ID09PSBhc3Rub2Rlcy5BdWdMb2FkKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2dyKCdsc3Vic2NyJywgXCJTay5hYnN0ci5vYmplY3RHZXRJdGVtKFwiLCBvYmosIFwiLFwiLCBzdWJzLCBcIilcIik7XG4gICAgICAgIGVsc2UgaWYgKGN0eCA9PT0gYXN0bm9kZXMuU3RvcmUgfHwgY3R4ID09PSBhc3Rub2Rlcy5BdWdTdG9yZSlcbiAgICAgICAgICAgIG91dChcIlNrLmFic3RyLm9iamVjdFNldEl0ZW0oXCIsIG9iaiwgXCIsXCIsIHN1YnMsIFwiLFwiLCBkYXRhLCBcIik7XCIpO1xuICAgICAgICBlbHNlIGlmIChjdHggPT09IGFzdG5vZGVzLkRlbClcbiAgICAgICAgICAgIG91dChcIlNrLmFic3RyLm9iamVjdERlbEl0ZW0oXCIsIG9iaiwgXCIsXCIsIHN1YnMsIFwiKTtcIik7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGFzc2VydHMuZmFpbChcImhhbmRsZXN1YnNjciBmYWlsXCIpO1xuICAgIH1cblxuICAgIGNib29sb3AoZSkge1xuICAgICAgICBhc3NlcnRzLmFzc2VydChlIGluc3RhbmNlb2YgYXN0bm9kZXMuQm9vbE9wKTtcbiAgICAgICAgdmFyIGp0eXBlO1xuICAgICAgICB2YXIgaWZGYWlsZWQ7XG4gICAgICAgIGlmIChlLm9wID09PSBhc3Rub2Rlcy5BbmQpXG4gICAgICAgICAgICBqdHlwZSA9IHRoaXMuX2p1bXBmYWxzZTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAganR5cGUgPSB0aGlzLl9qdW1wdHJ1ZTtcbiAgICAgICAgdmFyIGVuZCA9IHRoaXMubmV3QmxvY2soJ2VuZCBvZiBib29sb3AnKTtcbiAgICAgICAgdmFyIHMgPSBlLnZhbHVlcztcbiAgICAgICAgdmFyIG4gPSBzLmxlbmd0aDtcbiAgICAgICAgdmFyIHJldHZhbDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBleHByZXMgPSB0aGlzLnZleHByKHNbaV0pXG4gICAgICAgICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHZhbCA9IHRoaXMuX2dyKCdib29sb3BzdWNjJywgZXhwcmVzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG91dChyZXR2YWwsIFwiPVwiLCBleHByZXMsIFwiO1wiKTtcbiAgICAgICAgICAgIGp0eXBlLmNhbGwodGhpcywgZXhwcmVzLCBlbmQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2p1bXAoZW5kKTtcbiAgICAgICAgdGhpcy5zZXRCbG9jayhlbmQpO1xuICAgICAgICByZXR1cm4gcmV0dmFsO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBjb21waWxlcyBhbiBleHByZXNzaW9uLiB0byAncmV0dXJuJyBzb21ldGhpbmcsIGl0J2xsIGdlbnN5bSBhIHZhciBhbmQgc3RvcmVcbiAgICAgKiBpbnRvIHRoYXQgdmFyIHNvIHRoYXQgdGhlIGNhbGxpbmcgY29kZSBkb2Vzbid0IGhhdmUgYXZvaWQganVzdCBwYXN0aW5nIHRoZVxuICAgICAqIHJldHVybmVkIG5hbWUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZVxuICAgICAqIEBwYXJhbSB7c3RyaW5nPX0gZGF0YSBkYXRhIHRvIHN0b3JlIGluIGEgc3RvcmUgb3BlcmF0aW9uXG4gICAgICogQHBhcmFtIHtPYmplY3Q9fSBhdWdzdG9yZXZhbCB2YWx1ZSB0byBzdG9yZSB0byBmb3IgYW4gYXVnIG9wZXJhdGlvbiAobm90XG4gICAgICogdmV4cHInZCB5ZXQpXG4gICAgICovXG4gICAgdmV4cHIoZTogYW55LCBkYXRhPywgYXVnc3RvcmV2YWw/KSB7XG4gICAgICAgIGlmIChlLmxpbmVubyA+IHRoaXMudS5saW5lbm8pIHtcbiAgICAgICAgICAgIHRoaXMudS5saW5lbm8gPSBlLmxpbmVubztcbiAgICAgICAgICAgIHRoaXMudS5saW5lbm9TZXQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICAvL3RoaXMuYW5ub3RhdGVTb3VyY2UoZSk7XG4gICAgICAgIHN3aXRjaCAoZS5jb25zdHJ1Y3Rvcikge1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5Cb29sT3A6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2Jvb2xvcChlKTtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuQmluT3A6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2dyKCdiaW5vcCcsIFwiU2suYWJzdHIubnVtYmVyQmluT3AoXCIsIHRoaXMudmV4cHIoKDxhc3Rub2Rlcy5CaW5PcD5lKS5sZWZ0KSwgXCIsXCIsIHRoaXMudmV4cHIoKDxhc3Rub2Rlcy5CaW5PcD5lKS5yaWdodCksIFwiLCdcIiwgZS5vcC5wcm90b3R5cGUuX2FzdG5hbWUsIFwiJylcIik7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlVuYXJ5T3A6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2dyKCd1bmFyeW9wJywgXCJTay5hYnN0ci5udW1iZXJVbmFyeU9wKFwiLCB0aGlzLnZleHByKGUub3BlcmFuZCksIFwiLCdcIiwgZS5vcC5wcm90b3R5cGUuX2FzdG5hbWUsIFwiJylcIik7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkxhbWJkYTpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jbGFtYmRhKGUpO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5JZkV4cDpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jaWZleHAoZSk7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkRpY3Q6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2RpY3QoZSk7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkxpc3RDb21wOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNsaXN0Y29tcChlKTtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuR2VuZXJhdG9yRXhwOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNnZW5leHAoZSk7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLllpZWxkOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmN5aWVsZChlKTtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuQ29tcGFyZTpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jY29tcGFyZShlKTtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuQ2FsbDpcbiAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gdGhpcy5jY2FsbChlKTtcbiAgICAgICAgICAgICAgICAvLyBBZnRlciB0aGUgZnVuY3Rpb24gY2FsbCwgd2UndmUgcmV0dXJuZWQgdG8gdGhpcyBsaW5lXG4gICAgICAgICAgICAgICAgdGhpcy5hbm5vdGF0ZVNvdXJjZShlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5OdW06XG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZS5uLmlzRmxvYXQoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICdTay5idWlsdGluLm51bWJlclRvUHkoJyArIGUubi52YWx1ZSArICcpJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChlLm4uaXNJbnQoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiU2suZmZpLm51bWJlclRvSW50UHkoXCIgKyBlLm4udmFsdWUgKyBcIilcIjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChlLm4uaXNMb25nKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlNrLmZmaS5sb25nRnJvbVN0cmluZygnXCIgKyBlLm4udGV4dCArIFwiJywgXCIgKyBlLm4ucmFkaXggKyBcIilcIjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBhc3NlcnRzLmZhaWwoXCJ1bmhhbmRsZWQgTnVtIHR5cGVcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5TdHI6XG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fZ3IoJ3N0cicsICdTay5idWlsdGluLnN0cmluZ1RvUHkoJywgdG9TdHJpbmdMaXRlcmFsSlMoZS5zKSwgJyknKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkF0dHJpYnV0ZTpcbiAgICAgICAgICAgICAgICB2YXIgdmFsO1xuICAgICAgICAgICAgICAgIGlmIChlLmN0eCAhPT0gYXN0bm9kZXMuQXVnU3RvcmUpXG4gICAgICAgICAgICAgICAgICAgIHZhbCA9IHRoaXMudmV4cHIoZS52YWx1ZSk7XG4gICAgICAgICAgICAgICAgdmFyIG1hbmdsZWQgPSB0b1N0cmluZ0xpdGVyYWxKUyhlLmF0dHIpO1xuICAgICAgICAgICAgICAgIG1hbmdsZWQgPSBtYW5nbGVkLnN1YnN0cmluZygxLCBtYW5nbGVkLmxlbmd0aCAtIDEpO1xuICAgICAgICAgICAgICAgIG1hbmdsZWQgPSBtYW5nbGVOYW1lKHRoaXMudS5wcml2YXRlXywgbWFuZ2xlZCk7XG4gICAgICAgICAgICAgICAgbWFuZ2xlZCA9IGZpeFJlc2VydmVkV29yZHMobWFuZ2xlZCk7XG4gICAgICAgICAgICAgICAgbWFuZ2xlZCA9IGZpeFJlc2VydmVkTmFtZXMobWFuZ2xlZCk7XG4gICAgICAgICAgICAgICAgc3dpdGNoIChlLmN0eCkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkF1Z0xvYWQ6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuTG9hZDpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9ncihcImxhdHRyXCIsIFwiU2suYWJzdHIuZ2F0dHIoXCIsIHZhbCwgXCIsJ1wiLCBtYW5nbGVkLCBcIicpXCIpO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkF1Z1N0b3JlOlxuICAgICAgICAgICAgICAgICAgICAgICAgb3V0KFwiaWYodHlwZW9mIFwiLCBkYXRhLCBcIiAhPT0gJ3VuZGVmaW5lZCcpe1wiKTsgLy8gc3BlY2lhbCBjYXNlIHRvIGF2b2lkIHJlLXN0b3JlIGlmIGlucGxhY2Ugd29ya2VkXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB0aGlzLnZleHByKGF1Z3N0b3JldmFsIHx8IG51bGwpOyAvLyB0aGUgfHwgbnVsbCBjYW4gbmV2ZXIgaGFwcGVuLCBidXQgY2xvc3VyZSB0aGlua3Mgd2UgY2FuIGdldCBoZXJlIHdpdGggaXQgYmVpbmcgdW5kZWZcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dChcIlNrLmFic3RyLnNhdHRyKFwiLCB2YWwsIFwiLCdcIiwgbWFuZ2xlZCwgXCInLFwiLCBkYXRhLCBcIik7XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgb3V0KFwifVwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlN0b3JlOlxuICAgICAgICAgICAgICAgICAgICAgICAgb3V0KFwiU2suYWJzdHIuc2F0dHIoXCIsIHZhbCwgXCIsJ1wiLCBtYW5nbGVkLCBcIicsXCIsIGRhdGEsIFwiKTtcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5EZWw6XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NlcnRzLmZhaWwoXCJ0b2RvO1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlBhcmFtOlxuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXJ0cy5mYWlsKFwiaW52YWxpZCBhdHRyaWJ1dGUgZXhwcmVzc2lvblwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlN1YnNjcmlwdDpcbiAgICAgICAgICAgICAgICB2YXIgdmFsO1xuICAgICAgICAgICAgICAgIHN3aXRjaCAoZS5jdHgpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5BdWdMb2FkOlxuICAgICAgICAgICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkxvYWQ6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuU3RvcmU6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuRGVsOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudnNsaWNlKGUuc2xpY2UsIGUuY3R4LCB0aGlzLnZleHByKGUudmFsdWUpLCBkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5BdWdTdG9yZTpcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dChcImlmKHR5cGVvZiBcIiwgZGF0YSwgXCIgIT09ICd1bmRlZmluZWQnKXtcIik7IC8vIHNwZWNpYWwgY2FzZSB0byBhdm9pZCByZS1zdG9yZSBpZiBpbnBsYWNlIHdvcmtlZFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gdGhpcy52ZXhwcihhdWdzdG9yZXZhbCB8fCBudWxsKTsgLy8gdGhlIHx8IG51bGwgY2FuIG5ldmVyIGhhcHBlbiwgYnV0IGNsb3N1cmUgdGhpbmtzIHdlIGNhbiBnZXQgaGVyZSB3aXRoIGl0IGJlaW5nIHVuZGVmXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnZzbGljZShlLnNsaWNlLCBlLmN0eCwgdmFsLCBkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dChcIn1cIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5QYXJhbTpcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2VydHMuZmFpbChcImludmFsaWQgc3Vic2NyaXB0IGV4cHJlc3Npb25cIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5OYW1lOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm5hbWVvcChlLmlkLCBlLmN0eCwgZGF0YSk7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkxpc3Q6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY3R1cGxlb3JsaXN0KGUsIGRhdGEsICdsaXN0Jyk7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlR1cGxlOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmN0dXBsZW9ybGlzdChlLCBkYXRhLCAndHVwbGUnKTtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgYXNzZXJ0cy5mYWlsKFwidW5oYW5kbGVkIGNhc2UgaW4gdmV4cHJcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge0FycmF5LjxPYmplY3Q+fSBleHByc1xuICAgICAqIEBwYXJhbSB7QXJyYXkuPHN0cmluZz49fSBkYXRhXG4gICAgICovXG4gICAgdnNlcWV4cHIoZXhwcnM6IGFzdG5vZGVzLmV4cHJbXSwgZGF0YT8pOiBhbnlbXSB7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAY29uc3RcbiAgICAgICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICAgICAqL1xuICAgICAgICB2YXIgbWlzc2luZ0RhdGEgPSAodHlwZW9mIGRhdGEgPT09ICd1bmRlZmluZWQnKTtcblxuICAgICAgICBhc3NlcnRzLmFzc2VydChtaXNzaW5nRGF0YSB8fCBleHBycy5sZW5ndGggPT09IGRhdGEubGVuZ3RoKTtcbiAgICAgICAgdmFyIHJldCA9IFtdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGV4cHJzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICByZXQucHVzaCh0aGlzLnZleHByKGV4cHJzW2ldLCAobWlzc2luZ0RhdGEgPyB1bmRlZmluZWQgOiBkYXRhW2ldKSkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgfVxuXG4gICAgY2F1Z2Fzc2lnbihzKSB7XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KHMgaW5zdGFuY2VvZiBhc3Rub2Rlcy5BdWdBc3NpZ24pO1xuICAgICAgICB2YXIgZSA9IHMudGFyZ2V0O1xuICAgICAgICB2YXIgYXVnZTogYW55O1xuICAgICAgICBzd2l0Y2ggKGUuY29uc3RydWN0b3IpIHtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuQXR0cmlidXRlOlxuICAgICAgICAgICAgICAgIGF1Z2UgPSBuZXcgYXN0bm9kZXMuQXR0cmlidXRlKGUudmFsdWUsIGUuYXR0ciwgYXN0bm9kZXMuQXVnTG9hZCwgZS5saW5lbm8sIGUuY29sX29mZnNldCk7XG4gICAgICAgICAgICAgICAgdmFyIGF1ZyA9IHRoaXMudmV4cHIoYXVnZSk7XG4gICAgICAgICAgICAgICAgdmFyIHZhbCA9IHRoaXMudmV4cHIocy52YWx1ZSk7XG4gICAgICAgICAgICAgICAgdmFyIHJlcyA9IHRoaXMuX2dyKCdpbnBsYmlub3BhdHRyJywgXCJTay5hYnN0ci5udW1iZXJJbnBsYWNlQmluT3AoXCIsIGF1ZywgXCIsXCIsIHZhbCwgXCIsJ1wiLCBzLm9wLnByb3RvdHlwZS5fYXN0bmFtZSwgXCInKVwiKTtcbiAgICAgICAgICAgICAgICBhdWdlLmN0eCA9IGFzdG5vZGVzLkF1Z1N0b3JlO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnZleHByKGF1Z2UsIHJlcywgZS52YWx1ZSlcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuU3Vic2NyaXB0OlxuICAgICAgICAgICAgICAgIC8vIE9ubHkgY29tcGlsZSB0aGUgc3Vic2NyaXB0IHZhbHVlIG9uY2VcbiAgICAgICAgICAgICAgICB2YXIgYXVnc3ViID0gdGhpcy52c2xpY2VzdWIoZS5zbGljZSk7XG4gICAgICAgICAgICAgICAgYXVnZSA9IG5ldyBhc3Rub2Rlcy5TdWJzY3JpcHQoZS52YWx1ZSwgYXVnc3ViLCBhc3Rub2Rlcy5BdWdMb2FkLCBlLmxpbmVubywgZS5jb2xfb2Zmc2V0KTtcbiAgICAgICAgICAgICAgICB2YXIgYXVnID0gdGhpcy52ZXhwcihhdWdlKTtcbiAgICAgICAgICAgICAgICB2YXIgdmFsID0gdGhpcy52ZXhwcihzLnZhbHVlKTtcbiAgICAgICAgICAgICAgICB2YXIgcmVzID0gdGhpcy5fZ3IoJ2lucGxiaW5vcHN1YnNjcicsIFwiU2suYWJzdHIubnVtYmVySW5wbGFjZUJpbk9wKFwiLCBhdWcsIFwiLFwiLCB2YWwsIFwiLCdcIiwgcy5vcC5wcm90b3R5cGUuX2FzdG5hbWUsIFwiJylcIik7XG4gICAgICAgICAgICAgICAgYXVnZS5jdHggPSBhc3Rub2Rlcy5BdWdTdG9yZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy52ZXhwcihhdWdlLCByZXMsIGUudmFsdWUpXG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLk5hbWU6XG4gICAgICAgICAgICAgICAgdmFyIHRvID0gdGhpcy5uYW1lb3AoZS5pZCwgYXN0bm9kZXMuTG9hZCk7XG4gICAgICAgICAgICAgICAgdmFyIHZhbCA9IHRoaXMudmV4cHIocy52YWx1ZSk7XG4gICAgICAgICAgICAgICAgdmFyIHJlcyA9IHRoaXMuX2dyKCdpbnBsYmlub3AnLCBcIlNrLmFic3RyLm51bWJlcklucGxhY2VCaW5PcChcIiwgdG8sIFwiLFwiLCB2YWwsIFwiLCdcIiwgcy5vcC5wcm90b3R5cGUuX2FzdG5hbWUsIFwiJylcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMubmFtZW9wKGUuaWQsIGFzdG5vZGVzLlN0b3JlLCByZXMpO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBhc3NlcnRzLmZhaWwoXCJ1bmhhbmRsZWQgY2FzZSBpbiBhdWdhc3NpZ25cIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBvcHRpbWl6ZSBzb21lIGNvbnN0YW50IGV4cHJzLiByZXR1cm5zIDAgaWYgYWx3YXlzIDAsIDEgaWYgYWx3YXlzIDEgb3IgLTEgb3RoZXJ3aXNlLlxuICAgICAqL1xuICAgIGV4cHJDb25zdGFudChlKSB7XG4gICAgICAgIHN3aXRjaCAoZS5jb25zdHJ1Y3Rvcikge1xuICAgICAgICAgICAgLypcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuTnVtOlxuICAgICAgICAgICAgICAgIHJldHVybiBTay5taXNjZXZhbC5pc1RydWUoZS5uKTtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuU3RyOiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFNrLm1pc2NldmFsLmlzVHJ1ZShlLnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuTmFtZTpcbiAgICAgICAgICAgIC8vIHRvZG87IGRvIF9fZGVidWdfXyB0ZXN0IGhlcmUgaWYgb3B0XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG5ld0Jsb2NrKG5hbWU6IHN0cmluZyk6IG51bWJlciB7XG4gICAgICAgIHZhciByZXQgPSB0aGlzLnUuYmxvY2tudW0rKztcbiAgICAgICAgdGhpcy51LmJsb2Nrc1tyZXRdID0gW107XG4gICAgICAgIHRoaXMudS5ibG9ja3NbcmV0XS5fbmFtZSA9IG5hbWUgfHwgJzx1bm5hbWVkPic7XG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgfVxuXG4gICAgc2V0QmxvY2sobjogbnVtYmVyKSB7XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KG4gPj0gMCAmJiBuIDwgdGhpcy51LmJsb2NrbnVtKTtcbiAgICAgICAgdGhpcy51LmN1cmJsb2NrID0gbjtcbiAgICB9XG5cbiAgICBwdXNoQnJlYWtCbG9jayhuOiBudW1iZXIpIHtcbiAgICAgICAgYXNzZXJ0cy5hc3NlcnQobiA+PSAwICYmIG4gPCB0aGlzLnUuYmxvY2tudW0pO1xuICAgICAgICB0aGlzLnUuYnJlYWtCbG9ja3MucHVzaChuKTtcbiAgICB9XG5cbiAgICBwb3BCcmVha0Jsb2NrKCkge1xuICAgICAgICB0aGlzLnUuYnJlYWtCbG9ja3MucG9wKCk7XG4gICAgfVxuXG4gICAgcHVzaENvbnRpbnVlQmxvY2sobikge1xuICAgICAgICBhc3NlcnRzLmFzc2VydChuID49IDAgJiYgbiA8IHRoaXMudS5ibG9ja251bSk7XG4gICAgICAgIHRoaXMudS5jb250aW51ZUJsb2Nrcy5wdXNoKG4pO1xuICAgIH1cblxuICAgIHBvcENvbnRpbnVlQmxvY2soKSB7XG4gICAgICAgIHRoaXMudS5jb250aW51ZUJsb2Nrcy5wb3AoKTtcbiAgICB9XG5cbiAgICBwdXNoRXhjZXB0QmxvY2sobikge1xuICAgICAgICBhc3NlcnRzLmFzc2VydChuID49IDAgJiYgbiA8IHRoaXMudS5ibG9ja251bSk7XG4gICAgICAgIHRoaXMudS5leGNlcHRCbG9ja3MucHVzaChuKTtcbiAgICB9XG5cbiAgICBwb3BFeGNlcHRCbG9jaygpIHtcbiAgICAgICAgdGhpcy51LmV4Y2VwdEJsb2Nrcy5wb3AoKTtcbiAgICB9XG5cbiAgICBwdXNoRmluYWxseUJsb2NrKG4pIHtcbiAgICAgICAgYXNzZXJ0cy5hc3NlcnQobiA+PSAwICYmIG4gPCB0aGlzLnUuYmxvY2tudW0pO1xuICAgICAgICB0aGlzLnUuZmluYWxseUJsb2Nrcy5wdXNoKG4pO1xuICAgIH1cblxuICAgIHBvcEZpbmFsbHlCbG9jaygpIHtcbiAgICAgICAgdGhpcy51LmZpbmFsbHlCbG9ja3MucG9wKCk7XG4gICAgfVxuXG4gICAgc2V0dXBFeGNlcHQoZWIpIHtcbiAgICAgICAgb3V0KFwiJGV4Yy5wdXNoKFwiLCBlYiwgXCIpO1wiKTtcbiAgICAgICAgLy90aGlzLnB1c2hFeGNlcHRCbG9jayhlYik7XG4gICAgfVxuXG4gICAgZW5kRXhjZXB0KCkge1xuICAgICAgICBvdXQoXCIkZXhjLnBvcCgpO1wiKTtcbiAgICB9XG5cbiAgICBvdXRwdXRMb2NhbHModW5pdCkge1xuICAgICAgICB2YXIgaGF2ZSA9IHt9O1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgdW5pdC5hcmduYW1lcyAmJiBpIDwgdW5pdC5hcmduYW1lcy5sZW5ndGg7ICsraSlcbiAgICAgICAgICAgIGhhdmVbdW5pdC5hcmduYW1lc1tpXV0gPSB0cnVlO1xuICAgICAgICB1bml0LmxvY2FsbmFtZXMuc29ydCgpO1xuICAgICAgICB2YXIgb3V0cHV0ID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdW5pdC5sb2NhbG5hbWVzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICB2YXIgbmFtZSA9IHVuaXQubG9jYWxuYW1lc1tpXTtcbiAgICAgICAgICAgIGlmIChoYXZlW25hbWVdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBvdXRwdXQucHVzaChuYW1lKTtcbiAgICAgICAgICAgICAgICBoYXZlW25hbWVdID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3V0cHV0Lmxlbmd0aCA+IDApXG4gICAgICAgICAgICByZXR1cm4gXCJ2YXIgXCIgKyBvdXRwdXQuam9pbihcIixcIikgKyBcIjsgLyogbG9jYWxzICovXCI7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cblxuICAgIG91dHB1dEFsbFVuaXRzKCkge1xuICAgICAgICB2YXIgcmV0ID0gJyc7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5hbGxVbml0cy5sZW5ndGg7ICsraikge1xuICAgICAgICAgICAgdmFyIHVuaXQgPSB0aGlzLmFsbFVuaXRzW2pdO1xuICAgICAgICAgICAgcmV0ICs9IHVuaXQucHJlZml4Q29kZTtcbiAgICAgICAgICAgIHJldCArPSB0aGlzLm91dHB1dExvY2Fscyh1bml0KTtcbiAgICAgICAgICAgIHJldCArPSB1bml0LnZhckRlY2xzQ29kZTtcbiAgICAgICAgICAgIHJldCArPSB1bml0LnN3aXRjaENvZGU7XG4gICAgICAgICAgICB2YXIgYmxvY2tzID0gdW5pdC5ibG9ja3M7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGJsb2Nrcy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgICAgIHJldCArPSBcImNhc2UgXCIgKyBpICsgXCI6IC8qIC0tLSBcIiArIGJsb2Nrc1tpXS5fbmFtZSArIFwiIC0tLSAqL1wiO1xuICAgICAgICAgICAgICAgIHJldCArPSBibG9ja3NbaV0uam9pbignJyk7XG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICByZXQgKz0gXCJ0aHJvdyBuZXcgU2suYnVpbHRpbi5TeXN0ZW1FcnJvcignaW50ZXJuYWwgZXJyb3I6IHVudGVybWluYXRlZCBibG9jaycpO1wiO1xuICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXQgKz0gdW5pdC5zdWZmaXhDb2RlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgfVxuXG4gICAgY2lmKHMpIHtcbiAgICAgICAgYXNzZXJ0cy5hc3NlcnQocyBpbnN0YW5jZW9mIGFzdG5vZGVzLklmXyk7XG4gICAgICAgIHZhciBjb25zdGFudCA9IHRoaXMuZXhwckNvbnN0YW50KHMudGVzdCk7XG4gICAgICAgIGlmIChjb25zdGFudCA9PT0gMCkge1xuICAgICAgICAgICAgaWYgKHMub3JlbHNlKVxuICAgICAgICAgICAgICAgIHRoaXMudnNlcXN0bXQocy5vcmVsc2UpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNvbnN0YW50ID09PSAxKSB7XG4gICAgICAgICAgICB0aGlzLnZzZXFzdG10KHMuYm9keSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgZW5kID0gdGhpcy5uZXdCbG9jaygnZW5kIG9mIGlmJyk7XG4gICAgICAgICAgICB2YXIgbmV4dCA9IHRoaXMubmV3QmxvY2soJ25leHQgYnJhbmNoIG9mIGlmJyk7XG5cbiAgICAgICAgICAgIHZhciB0ZXN0ID0gdGhpcy52ZXhwcihzLnRlc3QpO1xuICAgICAgICAgICAgdGhpcy5fanVtcGZhbHNlKHRlc3QsIG5leHQpO1xuICAgICAgICAgICAgdGhpcy52c2Vxc3RtdChzLmJvZHkpO1xuICAgICAgICAgICAgdGhpcy5fanVtcChlbmQpO1xuXG4gICAgICAgICAgICB0aGlzLnNldEJsb2NrKG5leHQpO1xuICAgICAgICAgICAgaWYgKHMub3JlbHNlKVxuICAgICAgICAgICAgICAgIHRoaXMudnNlcXN0bXQocy5vcmVsc2UpO1xuICAgICAgICAgICAgdGhpcy5fanVtcChlbmQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2V0QmxvY2soZW5kKTtcblxuICAgIH1cblxuICAgIGN3aGlsZShzKSB7XG4gICAgICAgIHZhciBjb25zdGFudCA9IHRoaXMuZXhwckNvbnN0YW50KHMudGVzdCk7XG4gICAgICAgIGlmIChjb25zdGFudCA9PT0gMCkge1xuICAgICAgICAgICAgaWYgKHMub3JlbHNlKVxuICAgICAgICAgICAgICAgIHRoaXMudnNlcXN0bXQocy5vcmVsc2UpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHRvcCA9IHRoaXMubmV3QmxvY2soJ3doaWxlIHRlc3QnKTtcbiAgICAgICAgICAgIHRoaXMuX2p1bXAodG9wKTtcbiAgICAgICAgICAgIHRoaXMuc2V0QmxvY2sodG9wKTtcblxuICAgICAgICAgICAgdmFyIG5leHQgPSB0aGlzLm5ld0Jsb2NrKCdhZnRlciB3aGlsZScpO1xuICAgICAgICAgICAgdmFyIG9yZWxzZSA9IHMub3JlbHNlLmxlbmd0aCA+IDAgPyB0aGlzLm5ld0Jsb2NrKCd3aGlsZSBvcmVsc2UnKSA6IG51bGw7XG4gICAgICAgICAgICB2YXIgYm9keSA9IHRoaXMubmV3QmxvY2soJ3doaWxlIGJvZHknKTtcblxuICAgICAgICAgICAgdGhpcy5fanVtcGZhbHNlKHRoaXMudmV4cHIocy50ZXN0KSwgb3JlbHNlID8gb3JlbHNlIDogbmV4dCk7XG4gICAgICAgICAgICB0aGlzLl9qdW1wKGJvZHkpO1xuXG4gICAgICAgICAgICB0aGlzLnB1c2hCcmVha0Jsb2NrKG5leHQpO1xuICAgICAgICAgICAgdGhpcy5wdXNoQ29udGludWVCbG9jayh0b3ApO1xuXG4gICAgICAgICAgICB0aGlzLnNldEJsb2NrKGJvZHkpO1xuICAgICAgICAgICAgdGhpcy52c2Vxc3RtdChzLmJvZHkpO1xuICAgICAgICAgICAgdGhpcy5fanVtcCh0b3ApO1xuXG4gICAgICAgICAgICB0aGlzLnBvcENvbnRpbnVlQmxvY2soKTtcbiAgICAgICAgICAgIHRoaXMucG9wQnJlYWtCbG9jaygpO1xuXG4gICAgICAgICAgICBpZiAocy5vcmVsc2UubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0QmxvY2sob3JlbHNlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnZzZXFzdG10KHMub3JlbHNlKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9qdW1wKG5leHQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnNldEJsb2NrKG5leHQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY2ZvcihzOiBhc3Rub2Rlcy5Gb3JfKSB7XG4gICAgICAgIHZhciBzdGFydCA9IHRoaXMubmV3QmxvY2soJ2ZvciBzdGFydCcpO1xuICAgICAgICB2YXIgY2xlYW51cCA9IHRoaXMubmV3QmxvY2soJ2ZvciBjbGVhbnVwJyk7XG4gICAgICAgIHZhciBlbmQgPSB0aGlzLm5ld0Jsb2NrKCdmb3IgZW5kJyk7XG5cbiAgICAgICAgdGhpcy5wdXNoQnJlYWtCbG9jayhlbmQpO1xuICAgICAgICB0aGlzLnB1c2hDb250aW51ZUJsb2NrKHN0YXJ0KTtcblxuICAgICAgICAvLyBnZXQgdGhlIGl0ZXJhdG9yXG4gICAgICAgIHZhciB0b2l0ZXIgPSB0aGlzLnZleHByKHMuaXRlcik7XG4gICAgICAgIHZhciBpdGVyO1xuICAgICAgICBpZiAodGhpcy51LnN0ZS5nZW5lcmF0b3IpIHtcbiAgICAgICAgICAgIC8vIGlmIHdlJ3JlIGluIGEgZ2VuZXJhdG9yLCB3ZSBoYXZlIHRvIHN0b3JlIHRoZSBpdGVyYXRvciB0byBhIGxvY2FsXG4gICAgICAgICAgICAvLyBzbyBpdCdzIHByZXNlcnZlZCAoYXMgd2UgY3Jvc3MgYmxvY2tzIGhlcmUgYW5kIGFzc3VtZSBpdCBzdXJ2aXZlcylcbiAgICAgICAgICAgIGl0ZXIgPSBcIiRsb2MuXCIgKyB0aGlzLmdlbnN5bShcIml0ZXJcIik7XG4gICAgICAgICAgICBvdXQoaXRlciwgXCI9U2suYWJzdHIuaXRlcihcIiwgdG9pdGVyLCBcIik7XCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGl0ZXIgPSB0aGlzLl9ncihcIml0ZXJcIiwgXCJTay5hYnN0ci5pdGVyKFwiLCB0b2l0ZXIsIFwiKVwiKTtcblxuICAgICAgICB0aGlzLl9qdW1wKHN0YXJ0KTtcblxuICAgICAgICB0aGlzLnNldEJsb2NrKHN0YXJ0KTtcblxuICAgICAgICAvLyBsb2FkIHRhcmdldHNcbiAgICAgICAgdmFyIG5leHRpID0gdGhpcy5fZ3IoJ25leHQnLCBcIlNrLmFic3RyLml0ZXJuZXh0KFwiLCBpdGVyLCBcIilcIik7XG4gICAgICAgIHRoaXMuX2p1bXB1bmRlZihuZXh0aSwgY2xlYW51cCk7IC8vIHRvZG87IHRoaXMgc2hvdWxkIGJlIGhhbmRsZWQgYnkgU3RvcEl0ZXJhdGlvblxuICAgICAgICB2YXIgdGFyZ2V0ID0gdGhpcy52ZXhwcihzLnRhcmdldCwgbmV4dGkpO1xuXG4gICAgICAgIC8vIGV4ZWN1dGUgYm9keVxuICAgICAgICB0aGlzLnZzZXFzdG10KHMuYm9keSk7XG5cbiAgICAgICAgLy8ganVtcCB0byB0b3Agb2YgbG9vcFxuICAgICAgICB0aGlzLl9qdW1wKHN0YXJ0KTtcblxuICAgICAgICB0aGlzLnNldEJsb2NrKGNsZWFudXApO1xuICAgICAgICB0aGlzLnBvcENvbnRpbnVlQmxvY2soKTtcbiAgICAgICAgdGhpcy5wb3BCcmVha0Jsb2NrKCk7XG5cbiAgICAgICAgdGhpcy52c2Vxc3RtdChzLm9yZWxzZSk7XG4gICAgICAgIHRoaXMuX2p1bXAoZW5kKTtcblxuICAgICAgICB0aGlzLnNldEJsb2NrKGVuZCk7XG4gICAgfVxuXG4gICAgY3JhaXNlKHMpIHtcbiAgICAgICAgaWYgKHMgJiYgcy50eXBlICYmIHMudHlwZS5pZCAmJiAocy50eXBlLmlkID09PSBcIlN0b3BJdGVyYXRpb25cIikpIHtcbiAgICAgICAgICAgIC8vIGN1cnJlbnRseSwgd2Ugb25seSBoYW5kbGUgU3RvcEl0ZXJhdGlvbiwgYW5kIGFsbCBpdCBkb2VzIGl0IHJldHVyblxuICAgICAgICAgICAgLy8gdW5kZWZpbmVkIHdoaWNoIGlzIHdoYXQgb3VyIGl0ZXJhdG9yIHByb3RvY29sIHJlcXVpcmVzLlxuICAgICAgICAgICAgLy9cbiAgICAgICAgICAgIC8vIHRvdGFsbHkgaGFja3ksIGJ1dCBnb29kIGVub3VnaCBmb3Igbm93LlxuICAgICAgICAgICAgb3V0KFwicmV0dXJuIHVuZGVmaW5lZDtcIik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgaW5zdCA9ICcnO1xuICAgICAgICAgICAgaWYgKHMuaW5zdCkge1xuICAgICAgICAgICAgICAgIC8vIGhhbmRsZXM6IHJhaXNlIEVycm9yLCBhcmd1bWVudHNcbiAgICAgICAgICAgICAgICBpbnN0ID0gdGhpcy52ZXhwcihzLmluc3QpO1xuICAgICAgICAgICAgICAgIG91dChcInRocm93IFwiLCB0aGlzLnZleHByKHMudHlwZSksIFwiKFwiLCBpbnN0LCBcIik7XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAocy50eXBlKSB7XG4gICAgICAgICAgICAgICAgaWYgKHMudHlwZS5mdW5jKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGhhbmRsZXM6IHJhaXNlIEVycm9yKGFyZ3VtZW50cylcbiAgICAgICAgICAgICAgICAgICAgb3V0KFwidGhyb3cgXCIsIHRoaXMudmV4cHIocy50eXBlKSwgXCI7XCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaGFuZGxlczogcmFpc2UgRXJyb3JcbiAgICAgICAgICAgICAgICAgICAgb3V0KFwidGhyb3cgXCIsIHRoaXMudmV4cHIocy50eXBlKSwgXCIoJycpO1wiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyByZS1yYWlzZVxuICAgICAgICAgICAgICAgIG91dChcInRocm93ICRlcnI7XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgY3RyeWV4Y2VwdChzKSB7XG4gICAgICAgIHZhciBuID0gcy5oYW5kbGVycy5sZW5ndGg7XG5cbiAgICAgICAgLy8gQ3JlYXRlIGEgYmxvY2sgZm9yIGVhY2ggZXhjZXB0IGNsYXVzZVxuICAgICAgICB2YXIgaGFuZGxlcnMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgICAgICAgIGhhbmRsZXJzLnB1c2godGhpcy5uZXdCbG9jayhcImV4Y2VwdF9cIiArIGkgKyBcIl9cIikpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHVuaGFuZGxlZCA9IHRoaXMubmV3QmxvY2soXCJ1bmhhbmRsZWRcIik7XG4gICAgICAgIHZhciBvcmVsc2UgPSB0aGlzLm5ld0Jsb2NrKFwib3JlbHNlXCIpO1xuICAgICAgICB2YXIgZW5kID0gdGhpcy5uZXdCbG9jayhcImVuZFwiKTtcblxuICAgICAgICB0aGlzLnNldHVwRXhjZXB0KGhhbmRsZXJzWzBdKTtcbiAgICAgICAgdGhpcy52c2Vxc3RtdChzLmJvZHkpO1xuICAgICAgICB0aGlzLmVuZEV4Y2VwdCgpO1xuICAgICAgICB0aGlzLl9qdW1wKG9yZWxzZSk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0QmxvY2soaGFuZGxlcnNbaV0pO1xuICAgICAgICAgICAgdmFyIGhhbmRsZXIgPSBzLmhhbmRsZXJzW2ldO1xuICAgICAgICAgICAgaWYgKCFoYW5kbGVyLnR5cGUgJiYgaSA8IG4gLSAxKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKFwiZGVmYXVsdCAnZXhjZXB0OicgbXVzdCBiZSBsYXN0XCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaGFuZGxlci50eXBlKSB7XG4gICAgICAgICAgICAgICAgLy8gc2hvdWxkIGp1bXAgdG8gbmV4dCBoYW5kbGVyIGlmIGVyciBub3QgaXNpbnN0YW5jZSBvZiBoYW5kbGVyLnR5cGVcbiAgICAgICAgICAgICAgICB2YXIgaGFuZGxlcnR5cGUgPSB0aGlzLnZleHByKGhhbmRsZXIudHlwZSk7XG4gICAgICAgICAgICAgICAgdmFyIG5leHQgPSAoaSA9PSBuIC0gMSkgPyB1bmhhbmRsZWQgOiBoYW5kbGVyc1tpICsgMV07XG5cbiAgICAgICAgICAgICAgICAvLyB0aGlzIGNoZWNrIGlzIG5vdCByaWdodCwgc2hvdWxkIHVzZSBpc2luc3RhbmNlLCBidXQgZXhjZXB0aW9uIG9iamVjdHNcbiAgICAgICAgICAgICAgICAvLyBhcmUgbm90IHlldCBwcm9wZXIgUHl0aG9uIG9iamVjdHNcbiAgICAgICAgICAgICAgICB2YXIgY2hlY2sgPSB0aGlzLl9ncignaW5zdGFuY2UnLCBcIiRlcnIgaW5zdGFuY2VvZiBcIiwgaGFuZGxlcnR5cGUpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2p1bXBmYWxzZShjaGVjaywgbmV4dCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChoYW5kbGVyLm5hbWUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnZleHByKGhhbmRsZXIubmFtZSwgXCIkZXJyXCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBOZWVkIHRvIGV4ZWN1dGUgZmluYWxseSBiZWZvcmUgbGVhdmluZyBib2R5IGlmIGFuIGV4Y2VwdGlvbiBpcyByYWlzZWRcbiAgICAgICAgICAgIHRoaXMudnNlcXN0bXQoaGFuZGxlci5ib2R5KTtcblxuICAgICAgICAgICAgLy8gU2hvdWxkIGp1bXAgdG8gZmluYWxseSwgYnV0IGZpbmFsbHkgaXMgbm90IGltcGxlbWVudGVkIHlldFxuICAgICAgICAgICAgdGhpcy5fanVtcChlbmQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgbm8gZXhjZXB0IGNsYXVzZSBjYXRjaGVzIGV4Y2VwdGlvbiwgdGhyb3cgaXQgYWdhaW5cbiAgICAgICAgdGhpcy5zZXRCbG9jayh1bmhhbmRsZWQpO1xuICAgICAgICAvLyBTaG91bGQgZXhlY3V0ZSBmaW5hbGx5IGZpcnN0XG4gICAgICAgIG91dChcInRocm93ICRlcnI7XCIpO1xuXG4gICAgICAgIHRoaXMuc2V0QmxvY2sob3JlbHNlKTtcbiAgICAgICAgdGhpcy52c2Vxc3RtdChzLm9yZWxzZSk7XG4gICAgICAgIC8vIFNob3VsZCBqdW1wIHRvIGZpbmFsbHksIGJ1dCBmaW5hbGx5IGlzIG5vdCBpbXBsZW1lbnRlZCB5ZXRcbiAgICAgICAgdGhpcy5fanVtcChlbmQpO1xuICAgICAgICB0aGlzLnNldEJsb2NrKGVuZCk7XG4gICAgfVxuXG4gICAgY3RyeWZpbmFsbHkocykge1xuICAgICAgICBvdXQoXCIvKnRvZG87IHRyeWZpbmFsbHkqL1wiKTtcbiAgICAgICAgLy8gZXZlcnl0aGluZyBidXQgdGhlIGZpbmFsbHk/XG4gICAgICAgIHRoaXMuY3RyeWV4Y2VwdChzLmJvZHlbMF0pO1xuICAgIH1cblxuICAgIGNhc3NlcnQoczogYXN0bm9kZXMuQXNzZXJ0KSB7XG4gICAgICAgIC8qIHRvZG87IHdhcm5pbmdzIG1ldGhvZFxuICAgICAgICBpZiAocy50ZXN0IGluc3RhbmNlb2YgVHVwbGUgJiYgcy50ZXN0LmVsdHMubGVuZ3RoID4gMClcbiAgICAgICAgICAgIFNrLndhcm4oXCJhc3NlcnRpb24gaXMgYWx3YXlzIHRydWUsIHBlcmhhcHMgcmVtb3ZlIHBhcmVudGhlc2VzP1wiKTtcbiAgICAgICAgKi9cblxuICAgICAgICB2YXIgdGVzdCA9IHRoaXMudmV4cHIocy50ZXN0KTtcbiAgICAgICAgdmFyIGVuZCA9IHRoaXMubmV3QmxvY2soXCJlbmRcIik7XG4gICAgICAgIHRoaXMuX2p1bXB0cnVlKHRlc3QsIGVuZCk7XG4gICAgICAgIC8vIHRvZG87IGV4Y2VwdGlvbiBoYW5kbGluZ1xuICAgICAgICAvLyBtYXliZSByZXBsYWNlIHdpdGggYXNzZXJ0cy5mYWlsPz8gb3IganVzdCBhbiBhbGVydD9cbiAgICAgICAgb3V0KFwidGhyb3cgbmV3IFNrLmJ1aWx0aW4uQXNzZXJ0aW9uRXJyb3IoXCIsIHMubXNnID8gdGhpcy52ZXhwcihzLm1zZykgOiBcIlwiLCBcIik7XCIpO1xuICAgICAgICB0aGlzLnNldEJsb2NrKGVuZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gYXNuYW1lXG4gICAgICogQHBhcmFtIHtzdHJpbmc9fSBtb2RcbiAgICAgKi9cbiAgICBjaW1wb3J0YXMobmFtZSwgYXNuYW1lLCBtb2QpIHtcbiAgICAgICAgdmFyIHNyYyA9IG5hbWU7XG4gICAgICAgIHZhciBkb3RMb2MgPSBzcmMuaW5kZXhPZihcIi5cIik7XG4gICAgICAgIHZhciBjdXIgPSBtb2Q7XG4gICAgICAgIGlmIChkb3RMb2MgIT09IC0xKSB7XG4gICAgICAgICAgICAvLyBpZiB0aGVyZSdzIGRvdHMgaW4gdGhlIG1vZHVsZSBuYW1lLCBfX2ltcG9ydF9fIHdpbGwgaGF2ZSByZXR1cm5lZFxuICAgICAgICAgICAgLy8gdGhlIHRvcC1sZXZlbCBtb2R1bGUuIHNvLCB3ZSBuZWVkIHRvIGV4dHJhY3QgdGhlIGFjdHVhbCBtb2R1bGUgYnlcbiAgICAgICAgICAgIC8vIGdldGF0dHInaW5nIHVwIHRocm91Z2ggdGhlIG5hbWVzLCBhbmQgdGhlbiBzdG9yaW5nIHRoZSBsZWFmIHVuZGVyXG4gICAgICAgICAgICAvLyB0aGUgbmFtZSBpdCB3YXMgdG8gYmUgaW1wb3J0ZWQgYXMuXG4gICAgICAgICAgICBzcmMgPSBzcmMuc3Vic3RyKGRvdExvYyArIDEpO1xuICAgICAgICAgICAgd2hpbGUgKGRvdExvYyAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBkb3RMb2MgPSBzcmMuaW5kZXhPZihcIi5cIik7XG4gICAgICAgICAgICAgICAgdmFyIGF0dHIgPSBkb3RMb2MgIT09IC0xID8gc3JjLnN1YnN0cigwLCBkb3RMb2MpIDogc3JjO1xuICAgICAgICAgICAgICAgIGN1ciA9IHRoaXMuX2dyKCdsYXR0cicsIFwiU2suYWJzdHIuZ2F0dHIoXCIsIGN1ciwgXCIsJ1wiLCBhdHRyLCBcIicpXCIpO1xuICAgICAgICAgICAgICAgIHNyYyA9IHNyYy5zdWJzdHIoZG90TG9jICsgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMubmFtZW9wKGFzbmFtZSwgYXN0bm9kZXMuU3RvcmUsIGN1cik7XG4gICAgfVxuXG4gICAgY2ltcG9ydChzKSB7XG4gICAgICAgIHZhciBuID0gcy5uYW1lcy5sZW5ndGg7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgICAgICB2YXIgYWxpYXMgPSBzLm5hbWVzW2ldO1xuICAgICAgICAgICAgdmFyIG1vZCA9IHRoaXMuX2dyKCdtb2R1bGUnLCAnU2suYnVpbHRpbi5fX2ltcG9ydF9fKCcsIHRvU3RyaW5nTGl0ZXJhbEpTKGFsaWFzLm5hbWUpLCAnLCRnYmwsJGxvYyxbXSknKTtcblxuICAgICAgICAgICAgaWYgKGFsaWFzLmFzbmFtZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2ltcG9ydGFzKGFsaWFzLm5hbWUsIGFsaWFzLmFzbmFtZSwgbW9kKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBsYXN0RG90ID0gYWxpYXMubmFtZS5pbmRleE9mKCcuJyk7XG4gICAgICAgICAgICAgICAgaWYgKGxhc3REb3QgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmFtZW9wKGFsaWFzLm5hbWUuc3Vic3RyKDAsIGxhc3REb3QpLCBhc3Rub2Rlcy5TdG9yZSwgbW9kKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmFtZW9wKGFsaWFzLm5hbWUsIGFzdG5vZGVzLlN0b3JlLCBtb2QpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNmcm9taW1wb3J0KHMpIHtcbiAgICAgICAgdmFyIG4gPSBzLm5hbWVzLmxlbmd0aDtcbiAgICAgICAgdmFyIG5hbWVzID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgICAgICBuYW1lc1tpXSA9IHMubmFtZXNbaV0ubmFtZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgbmFtZXNTdHJpbmcgPSBuYW1lcy5tYXAoZnVuY3Rpb24obmFtZSkgeyByZXR1cm4gdG9TdHJpbmdMaXRlcmFsSlMobmFtZSk7IH0pLmpvaW4oJywgJyk7XG4gICAgICAgIHZhciBtb2QgPSB0aGlzLl9ncignbW9kdWxlJywgJ1NrLmJ1aWx0aW4uX19pbXBvcnRfXygnLCB0b1N0cmluZ0xpdGVyYWxKUyhzLm1vZHVsZSksICcsJGdibCwkbG9jLFsnLCBuYW1lc1N0cmluZywgJ10pJyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgICAgICB2YXIgYWxpYXMgPSBzLm5hbWVzW2ldO1xuICAgICAgICAgICAgaWYgKGkgPT09IDAgJiYgYWxpYXMubmFtZSA9PT0gXCIqXCIpIHtcbiAgICAgICAgICAgICAgICBhc3NlcnRzLmFzc2VydChuID09PSAxKTtcbiAgICAgICAgICAgICAgICBvdXQoXCJTay5pbXBvcnRTdGFyKFwiLCBtb2QsIFwiLCRsb2MsICRnYmwpO1wiKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBnb3QgPSB0aGlzLl9ncignaXRlbScsICdTay5hYnN0ci5nYXR0cignLCBtb2QsICcsJywgdG9TdHJpbmdMaXRlcmFsSlMoYWxpYXMubmFtZSksICcpJyk7XG4gICAgICAgICAgICB2YXIgc3RvcmVOYW1lID0gYWxpYXMubmFtZTtcbiAgICAgICAgICAgIGlmIChhbGlhcy5hc25hbWUpXG4gICAgICAgICAgICAgICAgc3RvcmVOYW1lID0gYWxpYXMuYXNuYW1lO1xuICAgICAgICAgICAgdGhpcy5uYW1lb3Aoc3RvcmVOYW1lLCBhc3Rub2Rlcy5TdG9yZSwgZ290KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGJ1aWxkcyBhIGNvZGUgb2JqZWN0IChqcyBmdW5jdGlvbikgZm9yIHZhcmlvdXMgY29uc3RydWN0cy4gdXNlZCBieSBkZWYsXG4gICAgICogbGFtYmRhLCBnZW5lcmF0b3IgZXhwcmVzc2lvbnMuIGl0IGlzbid0IHVzZWQgZm9yIGNsYXNzIGJlY2F1c2UgaXQgc2VlbWVkXG4gICAgICogZGlmZmVyZW50IGVub3VnaC5cbiAgICAgKlxuICAgICAqIGhhbmRsZXM6XG4gICAgICogLSBzZXR0aW5nIHVwIGEgbmV3IHNjb3BlXG4gICAgICogLSBkZWNvcmF0b3JzIChpZiBhbnkpXG4gICAgICogLSBkZWZhdWx0cyBzZXR1cFxuICAgICAqIC0gc2V0dXAgZm9yIGNlbGwgYW5kIGZyZWUgdmFyc1xuICAgICAqIC0gc2V0dXAgYW5kIG1vZGlmaWNhdGlvbiBmb3IgZ2VuZXJhdG9yc1xuICAgICAqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG4gYXN0IG5vZGUgdG8gYnVpbGQgZm9yXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGNvbmFtZSBuYW1lIG9mIGNvZGUgb2JqZWN0IHRvIGJ1aWxkXG4gICAgICogQHBhcmFtIHtBcnJheX0gZGVjb3JhdG9yX2xpc3QgYXN0IG9mIGRlY29yYXRvcnMgaWYgYW55XG4gICAgICogQHBhcmFtIHsqfSBhcmdzIGFyZ3VtZW50cyB0byBmdW5jdGlvbiwgaWYgYW55XG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgY2FsbGVkIGFmdGVyIHNldHVwIHRvIGRvIGFjdHVhbCB3b3JrIG9mIGZ1bmN0aW9uXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB0aGUgbmFtZSBvZiB0aGUgbmV3bHkgY3JlYXRlZCBmdW5jdGlvbiBvciBnZW5lcmF0b3Igb2JqZWN0LlxuICAgICAqXG4gICAgICovXG4gICAgYnVpbGRjb2Rlb2JqKG4sIGNvbmFtZSwgZGVjb3JhdG9yX2xpc3QsIGFyZ3MsIGNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBkZWNvcyA9IFtdO1xuICAgICAgICB2YXIgZGVmYXVsdHMgPSBbXTtcbiAgICAgICAgdmFyIHZhcmFyZyA9IG51bGw7XG4gICAgICAgIHZhciBrd2FyZyA9IG51bGw7XG5cbiAgICAgICAgLy8gZGVjb3JhdG9ycyBhbmQgZGVmYXVsdHMgaGF2ZSB0byBiZSBldmFsdWF0ZWQgb3V0IGhlcmUgYmVmb3JlIHdlIGVudGVyXG4gICAgICAgIC8vIHRoZSBuZXcgc2NvcGUuIHdlIG91dHB1dCB0aGUgZGVmYXVsdHMgYW5kIGF0dGFjaCB0aGVtIHRvIHRoaXMgY29kZVxuICAgICAgICAvLyBvYmplY3QsIGJ1dCBvbmx5IG9uY2Ugd2Uga25vdyB0aGUgbmFtZSBvZiBpdCAoc28gd2UgZG8gaXQgYWZ0ZXIgd2UndmVcbiAgICAgICAgLy8gZXhpdGVkIHRoZSBzY29wZSBuZWFyIHRoZSBlbmQgb2YgdGhpcyBmdW5jdGlvbikuXG4gICAgICAgIGlmIChkZWNvcmF0b3JfbGlzdClcbiAgICAgICAgICAgIGRlY29zID0gdGhpcy52c2VxZXhwcihkZWNvcmF0b3JfbGlzdCk7XG4gICAgICAgIGlmIChhcmdzICYmIGFyZ3MuZGVmYXVsdHMpXG4gICAgICAgICAgICBkZWZhdWx0cyA9IHRoaXMudnNlcWV4cHIoYXJncy5kZWZhdWx0cyk7XG4gICAgICAgIGlmIChhcmdzICYmIGFyZ3MudmFyYXJnKVxuICAgICAgICAgICAgdmFyYXJnID0gYXJncy52YXJhcmc7XG4gICAgICAgIGlmIChhcmdzICYmIGFyZ3Mua3dhcmcpXG4gICAgICAgICAgICBrd2FyZyA9IGFyZ3Mua3dhcmc7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBjb25zdFxuICAgICAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgICAgICovXG4gICAgICAgIHZhciBjb250YWluaW5nSGFzRnJlZTogYm9vbGVhbiA9IHRoaXMudS5zdGUuaGFzRnJlZTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBjb25zdFxuICAgICAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgICAgICovXG4gICAgICAgIHZhciBjb250YWluaW5nSGFzQ2VsbDogYm9vbGVhbiA9IHRoaXMudS5zdGUuY2hpbGRIYXNGcmVlO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBlbnRlciB0aGUgbmV3IHNjb3BlLCBhbmQgY3JlYXRlIHRoZSBmaXJzdCBibG9ja1xuICAgICAgICAgKiBAY29uc3RcbiAgICAgICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgICAgICovXG4gICAgICAgIHZhciBzY29wZW5hbWUgPSB0aGlzLmVudGVyU2NvcGUoY29uYW1lLCBuLCBuLmxpbmVubyk7XG5cbiAgICAgICAgdmFyIGlzR2VuZXJhdG9yOiBib29sZWFuID0gdGhpcy51LnN0ZS5nZW5lcmF0b3I7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAY29uc3RcbiAgICAgICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICAgICAqL1xuICAgICAgICB2YXIgaGFzRnJlZTogYm9vbGVhbiA9IHRoaXMudS5zdGUuaGFzRnJlZTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBjb25zdFxuICAgICAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgICAgICovXG4gICAgICAgIHZhciBoYXNDZWxsOiBib29sZWFuID0gdGhpcy51LnN0ZS5jaGlsZEhhc0ZyZWU7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAY29uc3RcbiAgICAgICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICAgICAqL1xuICAgICAgICB2YXIgZGVzY2VuZGFudE9yU2VsZkhhc0ZyZWUgPSB0aGlzLnUuc3RlLmhhc0ZyZWUvKiB8fCB0aGlzLnUuc3RlLmNoaWxkSGFzRnJlZSovO1xuXG4gICAgICAgIHZhciBlbnRyeUJsb2NrOiBhbnkgPSB0aGlzLm5ld0Jsb2NrKCdjb2Rlb2JqIGVudHJ5Jyk7XG5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gdGhlIGhlYWRlciBvZiB0aGUgZnVuY3Rpb24sIGFuZCBhcmd1bWVudHNcbiAgICAgICAgLy9cbiAgICAgICAgdGhpcy51LnByZWZpeENvZGUgPSBcInZhciBcIiArIHNjb3BlbmFtZSArIFwiPShmdW5jdGlvbiBcIiArIHRoaXMubmljZU5hbWUoY29uYW1lKSArIFwiJChcIjtcblxuICAgICAgICB2YXIgZnVuY0FyZ3MgPSBbXTtcbiAgICAgICAgaWYgKGlzR2VuZXJhdG9yKSB7XG4gICAgICAgICAgICBpZiAoa3dhcmcpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgU3ludGF4RXJyb3IoY29uYW1lICsgXCIoKToga2V5d29yZCBhcmd1bWVudHMgaW4gZ2VuZXJhdG9ycyBub3Qgc3VwcG9ydGVkXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhcmFyZykge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcihjb25hbWUgKyBcIigpOiB2YXJpYWJsZSBudW1iZXIgb2YgYXJndW1lbnRzIGluIGdlbmVyYXRvcnMgbm90IHN1cHBvcnRlZFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZ1bmNBcmdzLnB1c2goXCIkZ2VuXCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKGt3YXJnKVxuICAgICAgICAgICAgICAgIGZ1bmNBcmdzLnB1c2goXCIka3dhXCIpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGFyZ3MgJiYgaSA8IGFyZ3MuYXJncy5sZW5ndGg7ICsraSlcbiAgICAgICAgICAgICAgICBmdW5jQXJncy5wdXNoKHRoaXMubmFtZW9wKGFyZ3MuYXJnc1tpXS5pZCwgYXN0bm9kZXMuUGFyYW0pKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZGVzY2VuZGFudE9yU2VsZkhhc0ZyZWUpIHtcbiAgICAgICAgICAgIGZ1bmNBcmdzLnB1c2goXCIkZnJlZVwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnUucHJlZml4Q29kZSArPSBmdW5jQXJncy5qb2luKFwiLFwiKTtcblxuICAgICAgICB0aGlzLnUucHJlZml4Q29kZSArPSBcIil7XCI7XG5cbiAgICAgICAgaWYgKGlzR2VuZXJhdG9yKSB0aGlzLnUucHJlZml4Q29kZSArPSBcIlxcbi8vIGdlbmVyYXRvclxcblwiO1xuICAgICAgICBpZiAoY29udGFpbmluZ0hhc0ZyZWUpIHRoaXMudS5wcmVmaXhDb2RlICs9IFwiXFxuLy8gY29udGFpbmluZyBoYXMgZnJlZVxcblwiO1xuICAgICAgICBpZiAoY29udGFpbmluZ0hhc0NlbGwpIHRoaXMudS5wcmVmaXhDb2RlICs9IFwiXFxuLy8gY29udGFpbmluZyBoYXMgY2VsbFxcblwiO1xuICAgICAgICBpZiAoaGFzRnJlZSkgdGhpcy51LnByZWZpeENvZGUgKz0gXCJcXG4vLyBoYXMgZnJlZVxcblwiO1xuICAgICAgICBpZiAoaGFzQ2VsbCkgdGhpcy51LnByZWZpeENvZGUgKz0gXCJcXG4vLyBoYXMgY2VsbFxcblwiO1xuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIHNldCB1cCBzdGFuZGFyZCBkaWN0cy92YXJpYWJsZXNcbiAgICAgICAgLy9cbiAgICAgICAgdmFyIGxvY2FscyA9IFwie31cIjtcbiAgICAgICAgaWYgKGlzR2VuZXJhdG9yKSB7XG4gICAgICAgICAgICBlbnRyeUJsb2NrID0gXCIkZ2VuLmdpJHJlc3VtZWF0XCI7XG4gICAgICAgICAgICBsb2NhbHMgPSBcIiRnZW4uZ2kkbG9jYWxzXCI7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNlbGxzID0gXCJcIjtcbiAgICAgICAgaWYgKGhhc0NlbGwpXG4gICAgICAgICAgICBjZWxscyA9IFwiLCRjZWxsPXt9XCI7XG5cbiAgICAgICAgLy8gbm90ZSBzcGVjaWFsIHVzYWdlIG9mICd0aGlzJyB0byBhdm9pZCBoYXZpbmcgdG8gc2xpY2UgZ2xvYmFscyBpbnRvXG4gICAgICAgIC8vIGFsbCBmdW5jdGlvbiBpbnZvY2F0aW9ucyBpbiBjYWxsXG4gICAgICAgIHRoaXMudS52YXJEZWNsc0NvZGUgKz0gXCJ2YXIgJGJsaz1cIiArIGVudHJ5QmxvY2sgKyBcIiwkZXhjPVtdLCRsb2M9XCIgKyBsb2NhbHMgKyBjZWxscyArIFwiLCRnYmw9dGhpcywkZXJyO1wiO1xuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIGNvcHkgYWxsIHBhcmFtZXRlcnMgdGhhdCBhcmUgYWxzbyBjZWxscyBpbnRvIHRoZSBjZWxscyBkaWN0LiB0aGlzIGlzIHNvXG4gICAgICAgIC8vIHRoZXkgY2FuIGJlIGFjY2Vzc2VkIGNvcnJlY3RseSBieSBuZXN0ZWQgc2NvcGVzLlxuICAgICAgICAvL1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgYXJncyAmJiBpIDwgYXJncy5hcmdzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICB2YXIgaWQgPSBhcmdzLmFyZ3NbaV0uaWQ7XG4gICAgICAgICAgICBpZiAodGhpcy5pc0NlbGwoaWQpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy51LnZhckRlY2xzQ29kZSArPSBcIiRjZWxsLlwiICsgaWQgKyBcIj1cIiArIGlkICsgXCI7XCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvL1xuICAgICAgICAvLyBtYWtlIHN1cmUgY29ycmVjdCBudW1iZXIgb2YgYXJndW1lbnRzIHdlcmUgcGFzc2VkIChnZW5lcmF0b3JzIGhhbmRsZWQgYmVsb3cpXG4gICAgICAgIC8vXG4gICAgICAgIGlmICghaXNHZW5lcmF0b3IpIHtcbiAgICAgICAgICAgIHZhciBtaW5hcmdzID0gYXJncyA/IGFyZ3MuYXJncy5sZW5ndGggLSBkZWZhdWx0cy5sZW5ndGggOiAwO1xuICAgICAgICAgICAgdmFyIG1heGFyZ3MgPSB2YXJhcmcgPyBJbmZpbml0eSA6IChhcmdzID8gYXJncy5hcmdzLmxlbmd0aCA6IDApO1xuICAgICAgICAgICAgdmFyIGt3ID0ga3dhcmcgPyB0cnVlIDogZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnUudmFyRGVjbHNDb2RlICs9IFwiU2suYnVpbHRpbi5weUNoZWNrQXJncyhcXFwiXCIgKyBjb25hbWUgK1xuICAgICAgICAgICAgXCJcXFwiLCBhcmd1bWVudHMsIFwiICsgbWluYXJncyArIFwiLCBcIiArIG1heGFyZ3MgKyBcIiwgXCIgKyBrdyArXG4gICAgICAgICAgICBcIiwgXCIgKyBkZXNjZW5kYW50T3JTZWxmSGFzRnJlZSArIFwiKTtcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIGluaXRpYWxpemUgZGVmYXVsdCBhcmd1bWVudHMuIHdlIHN0b3JlIHRoZSB2YWx1ZXMgb2YgdGhlIGRlZmF1bHRzIHRvXG4gICAgICAgIC8vIHRoaXMgY29kZSBvYmplY3QgYXMgLiRkZWZhdWx0cyBqdXN0IGJlbG93IGFmdGVyIHdlIGV4aXQgdGhpcyBzY29wZS5cbiAgICAgICAgLy9cbiAgICAgICAgaWYgKGRlZmF1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIGRlZmF1bHRzIGhhdmUgdG8gYmUgXCJyaWdodCBqdXN0aWZpZWRcIiBzbyBpZiB0aGVyZSdzIGxlc3MgZGVmYXVsdHNcbiAgICAgICAgICAgIC8vIHRoYW4gYXJncyB3ZSBvZmZzZXQgdG8gbWFrZSB0aGVtIG1hdGNoIHVwICh3ZSBkb24ndCBuZWVkIGFub3RoZXJcbiAgICAgICAgICAgIC8vIGNvcnJlbGF0aW9uIGluIHRoZSBhc3QpXG4gICAgICAgICAgICB2YXIgb2Zmc2V0ID0gYXJncy5hcmdzLmxlbmd0aCAtIGRlZmF1bHRzLmxlbmd0aDtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVmYXVsdHMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgICAgICB2YXIgYXJnbmFtZSA9IHRoaXMubmFtZW9wKGFyZ3MuYXJnc1tpICsgb2Zmc2V0XS5pZCwgYXN0bm9kZXMuUGFyYW0pO1xuICAgICAgICAgICAgICAgIHRoaXMudS52YXJEZWNsc0NvZGUgKz0gXCJpZih0eXBlb2YgXCIgKyBhcmduYW1lICsgXCIgPT09ICd1bmRlZmluZWQnKVwiICsgYXJnbmFtZSArIFwiPVwiICsgc2NvcGVuYW1lICsgXCIuJGRlZmF1bHRzW1wiICsgaSArIFwiXTtcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIGluaXRpYWxpemUgdmFyYXJnLCBpZiBhbnlcbiAgICAgICAgLy9cbiAgICAgICAgaWYgKHZhcmFyZykge1xuICAgICAgICAgICAgdmFyIHN0YXJ0ID0gZnVuY0FyZ3MubGVuZ3RoO1xuICAgICAgICAgICAgdGhpcy51LnZhckRlY2xzQ29kZSArPSB2YXJhcmcgKyBcIj1uZXcgU2suYnVpbHRpbnNbJ3R1cGxlJ10oQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLFwiICsgc3RhcnQgKyBcIikpOyAvKnZhcmFyZyovXCI7XG4gICAgICAgIH1cblxuICAgICAgICAvL1xuICAgICAgICAvLyBpbml0aWFsaXplIGt3YXJnLCBpZiBhbnlcbiAgICAgICAgLy9cbiAgICAgICAgaWYgKGt3YXJnKSB7XG4gICAgICAgICAgICB0aGlzLnUudmFyRGVjbHNDb2RlICs9IGt3YXJnICsgXCI9bmV3IFNrLmJ1aWx0aW5zWydkaWN0J10oJGt3YSk7XCI7XG4gICAgICAgIH1cblxuICAgICAgICAvL1xuICAgICAgICAvLyBmaW5hbGx5LCBzZXQgdXAgdGhlIGJsb2NrIHN3aXRjaCB0aGF0IHRoZSBqdW1wIGNvZGUgZXhwZWN0c1xuICAgICAgICAvL1xuICAgICAgICAvLyBPbGQgc3dpdGNoIGNvZGVcbiAgICAgICAgLy8gdGhpcy51LnN3aXRjaENvZGUgKz0gXCJ3aGlsZSh0cnVlKXtzd2l0Y2goJGJsayl7XCI7XG4gICAgICAgIC8vIHRoaXMudS5zdWZmaXhDb2RlID0gXCJ9YnJlYWs7fX0pO1wiO1xuXG4gICAgICAgIC8vIE5ldyBzd2l0Y2ggY29kZSB0byBjYXRjaCBleGNlcHRpb25zXG4gICAgICAgIHRoaXMudS5zd2l0Y2hDb2RlID0gXCJ3aGlsZSh0cnVlKXt0cnl7c3dpdGNoKCRibGspe1wiO1xuICAgICAgICB0aGlzLnUuc3VmZml4Q29kZSA9IFwifX1jYXRjaChlcnIpe2lmICgkZXhjLmxlbmd0aD4wKSB7JGVycj1lcnI7JGJsaz0kZXhjLnBvcCgpO2NvbnRpbnVlO30gZWxzZSB7dGhyb3cgZXJyO319fX0pO1wiO1xuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIGp1bXAgYmFjayB0byB0aGUgaGFuZGxlciBzbyBpdCBjYW4gZG8gdGhlIG1haW4gYWN0dWFsIHdvcmsgb2YgdGhlXG4gICAgICAgIC8vIGZ1bmN0aW9uXG4gICAgICAgIC8vXG4gICAgICAgIGNhbGxiYWNrLmNhbGwodGhpcywgc2NvcGVuYW1lKTtcblxuICAgICAgICAvL1xuICAgICAgICAvLyBnZXQgYSBsaXN0IG9mIGFsbCB0aGUgYXJndW1lbnQgbmFtZXMgKHVzZWQgdG8gYXR0YWNoIHRvIHRoZSBjb2RlXG4gICAgICAgIC8vIG9iamVjdCwgYW5kIGFsc28gdG8gYWxsb3cgdXMgdG8gZGVjbGFyZSBvbmx5IGxvY2FscyB0aGF0IGFyZW4ndCBhbHNvXG4gICAgICAgIC8vIHBhcmFtZXRlcnMpLlxuICAgICAgICB2YXIgYXJnbmFtZXM7XG4gICAgICAgIGlmIChhcmdzICYmIGFyZ3MuYXJncy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICB2YXIgYXJnbmFtZXNhcnIgPSBbXTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJncy5hcmdzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICAgICAgYXJnbmFtZXNhcnIucHVzaChhcmdzLmFyZ3NbaV0uaWQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBhcmduYW1lcyA9IGFyZ25hbWVzYXJyLmpvaW4oXCInLCAnXCIpO1xuICAgICAgICAgICAgLy8gc3RvcmUgdG8gdW5pdCBzbyB3ZSBrbm93IHdoYXQgbG9jYWwgdmFyaWFibGVzIG5vdCB0byBkZWNsYXJlXG4gICAgICAgICAgICB0aGlzLnUuYXJnbmFtZXMgPSBhcmduYW1lc2FycjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIGFuZCBleGl0IHRoZSBjb2RlIG9iamVjdCBzY29wZVxuICAgICAgICAvL1xuICAgICAgICB0aGlzLmV4aXRTY29wZSgpO1xuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIGF0dGFjaCB0aGUgZGVmYXVsdCB2YWx1ZXMgd2UgZXZhbHVhdGVkIGF0IHRoZSBiZWdpbm5pbmcgdG8gdGhlIGNvZGVcbiAgICAgICAgLy8gb2JqZWN0IHNvIHRoYXQgaXQgY2FuIGdldCBhdCB0aGVtIHRvIHNldCBhbnkgYXJndW1lbnRzIHRoYXQgYXJlIGxlZnRcbiAgICAgICAgLy8gdW5zZXQuXG4gICAgICAgIC8vXG4gICAgICAgIGlmIChkZWZhdWx0cy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgb3V0KHNjb3BlbmFtZSwgXCIuJGRlZmF1bHRzPVtcIiwgZGVmYXVsdHMuam9pbignLCcpLCBcIl07XCIpO1xuXG5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gYXR0YWNoIGNvX3Zhcm5hbWVzIChvbmx5IHRoZSBhcmd1bWVudCBuYW1lcykgZm9yIGtleXdvcmQgYXJndW1lbnRcbiAgICAgICAgLy8gYmluZGluZy5cbiAgICAgICAgLy9cbiAgICAgICAgaWYgKGFyZ25hbWVzKSB7XG4gICAgICAgICAgICBvdXQoc2NvcGVuYW1lLCBcIi5jb192YXJuYW1lcz1bJ1wiLCBhcmduYW1lcywgXCInXTtcIik7XG4gICAgICAgIH1cblxuICAgICAgICAvL1xuICAgICAgICAvLyBhdHRhY2ggZmxhZ3NcbiAgICAgICAgLy9cbiAgICAgICAgaWYgKGt3YXJnKSB7XG4gICAgICAgICAgICBvdXQoc2NvcGVuYW1lLCBcIi5jb19rd2FyZ3M9MTtcIik7XG4gICAgICAgIH1cblxuICAgICAgICAvL1xuICAgICAgICAvLyBidWlsZCBlaXRoZXIgYSAnZnVuY3Rpb24nIG9yICdnZW5lcmF0b3InLiB0aGUgZnVuY3Rpb24gaXMganVzdCBhIHNpbXBsZVxuICAgICAgICAvLyBjb25zdHJ1Y3RvciBjYWxsLiB0aGUgZ2VuZXJhdG9yIGlzIG1vcmUgY29tcGxpY2F0ZWQuIGl0IG5lZWRzIHRvIG1ha2UgYVxuICAgICAgICAvLyBuZXcgZ2VuZXJhdG9yIGV2ZXJ5IHRpbWUgaXQncyBjYWxsZWQsIHNvIHRoZSB0aGluZyB0aGF0J3MgcmV0dXJuZWQgaXNcbiAgICAgICAgLy8gYWN0dWFsbHkgYSBmdW5jdGlvbiB0aGF0IG1ha2VzIHRoZSBnZW5lcmF0b3IgKGFuZCBwYXNzZXMgYXJndW1lbnRzIHRvXG4gICAgICAgIC8vIHRoZSBmdW5jdGlvbiBvbndhcmRzIHRvIHRoZSBnZW5lcmF0b3IpLiB0aGlzIHNob3VsZCBwcm9iYWJseSBhY3R1YWxseVxuICAgICAgICAvLyBiZSBhIGZ1bmN0aW9uIG9iamVjdCwgcmF0aGVyIHRoYW4gYSBqcyBmdW5jdGlvbiBsaWtlIGl0IGlzIG5vdy4gd2UgYWxzb1xuICAgICAgICAvLyBoYXZlIHRvIGJ1aWxkIHRoZSBhcmd1bWVudCBuYW1lcyB0byBwYXNzIHRvIHRoZSBnZW5lcmF0b3IgYmVjYXVzZSBpdFxuICAgICAgICAvLyBuZWVkcyB0byBzdG9yZSBhbGwgbG9jYWxzIGludG8gaXRzZWxmIHNvIHRoYXQgdGhleSdyZSBtYWludGFpbmVkIGFjcm9zc1xuICAgICAgICAvLyB5aWVsZHMuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIHRvZG87IHBvc3NpYmx5IHRoaXMgc2hvdWxkIGJlIG91dHNpZGU/XG4gICAgICAgIC8vXG4gICAgICAgIHZhciBmcmVlcyA9IFwiXCI7XG4gICAgICAgIGlmIChoYXNGcmVlKSB7XG4gICAgICAgICAgICBmcmVlcyA9IFwiLCRjZWxsXCI7XG4gICAgICAgICAgICAvLyBpZiB0aGUgc2NvcGUgd2UncmUgaW4gd2hlcmUgd2UncmUgZGVmaW5pbmcgdGhpcyBvbmUgaGFzIGZyZWVcbiAgICAgICAgICAgIC8vIHZhcnMsIHRoZXkgbWF5IGFsc28gYmUgY2VsbCB2YXJzLCBzbyB3ZSBwYXNzIHRob3NlIHRvIHRoZVxuICAgICAgICAgICAgLy8gY2xvc3VyZSB0b28uXG4gICAgICAgICAgICBpZiAoY29udGFpbmluZ0hhc0ZyZWUpXG4gICAgICAgICAgICAgICAgZnJlZXMgKz0gXCIsJGZyZWVcIjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaXNHZW5lcmF0b3IpXG4gICAgICAgICAgICAvLyBLZXl3b3JkIGFuZCB2YXJpYWJsZSBhcmd1bWVudHMgYXJlIG5vdCBjdXJyZW50bHkgc3VwcG9ydGVkIGluIGdlbmVyYXRvcnMuXG4gICAgICAgICAgICAvLyBUaGUgY2FsbCB0byBweUNoZWNrQXJncyBhc3N1bWVzIHRoZXkgY2FuJ3QgYmUgdHJ1ZS5cbiAgICAgICAgICAgIGlmIChhcmdzICYmIGFyZ3MuYXJncy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2dyKFwiZ2VuZXJcIiwgXCJuZXcgU2suYnVpbHRpbnNbJ2Z1bmN0aW9uJ10oKGZ1bmN0aW9uKCl7dmFyICRvcmlnYXJncz1BcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1NrLmJ1aWx0aW4ucHlDaGVja0FyZ3MoXFxcIlwiLFxuICAgICAgICAgICAgICAgICAgICBjb25hbWUsIFwiXFxcIixhcmd1bWVudHMsXCIsIGFyZ3MuYXJncy5sZW5ndGggLSBkZWZhdWx0cy5sZW5ndGgsIFwiLFwiLCBhcmdzLmFyZ3MubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBcIik7cmV0dXJuIG5ldyBTay5idWlsdGluc1snZ2VuZXJhdG9yJ10oXCIsIHNjb3BlbmFtZSwgXCIsJGdibCwkb3JpZ2FyZ3NcIiwgZnJlZXMsIFwiKTt9KSlcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fZ3IoXCJnZW5lclwiLCBcIm5ldyBTay5idWlsdGluc1snZnVuY3Rpb24nXSgoZnVuY3Rpb24oKXtTay5idWlsdGluLnB5Q2hlY2tBcmdzKFxcXCJcIiwgY29uYW1lLFxuICAgICAgICAgICAgICAgICAgICBcIlxcXCIsYXJndW1lbnRzLDAsMCk7cmV0dXJuIG5ldyBTay5idWlsdGluc1snZ2VuZXJhdG9yJ10oXCIsIHNjb3BlbmFtZSwgXCIsJGdibCxbXVwiLCBmcmVlcywgXCIpO30pKVwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZ3IoXCJmdW5jb2JqXCIsIFwibmV3IFNrLmJ1aWx0aW5zWydmdW5jdGlvbiddKFwiLCBzY29wZW5hbWUsIFwiLCRnYmxcIiwgZnJlZXMsIFwiKVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNmdW5jdGlvbihzOiBhc3Rub2Rlcy5GdW5jdGlvbkRlZikge1xuICAgICAgICBhc3NlcnRzLmFzc2VydChzIGluc3RhbmNlb2YgYXN0bm9kZXMuRnVuY3Rpb25EZWYpO1xuICAgICAgICB2YXIgZnVuY29yZ2VuID0gdGhpcy5idWlsZGNvZGVvYmoocywgcy5uYW1lLCBzLmRlY29yYXRvcl9saXN0LCBzLmFyZ3MsXG4gICAgICAgICAgICBmdW5jdGlvbihzY29wZW5hbWUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnZzZXFzdG10KHMuYm9keSk7XG4gICAgICAgICAgICAgICAgb3V0KFwicmV0dXJuIFNrLmJ1aWx0aW4ubm9uZS5ub25lJDtcIik7IC8vIGlmIHdlIGZhbGwgb2ZmIHRoZSBib3R0b20sIHdlIHdhbnQgdGhlIHJldCB0byBiZSBOb25lXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICApO1xuICAgICAgICB0aGlzLm5hbWVvcChzLm5hbWUsIGFzdG5vZGVzLlN0b3JlLCBmdW5jb3JnZW4pO1xuICAgIH1cblxuICAgIGNsYW1iZGEoZSkge1xuICAgICAgICBhc3NlcnRzLmFzc2VydChlIGluc3RhbmNlb2YgYXN0bm9kZXMuTGFtYmRhKTtcbiAgICAgICAgdmFyIGZ1bmMgPSB0aGlzLmJ1aWxkY29kZW9iaihlLCBcIjxsYW1iZGE+XCIsIG51bGwsIGUuYXJncywgZnVuY3Rpb24oc2NvcGVuYW1lKSB7XG4gICAgICAgICAgICB2YXIgdmFsID0gdGhpcy52ZXhwcihlLmJvZHkpO1xuICAgICAgICAgICAgb3V0KFwicmV0dXJuIFwiLCB2YWwsIFwiO1wiKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBmdW5jO1xuICAgIH1cblxuICAgIGNpZmV4cChlKSB7XG4gICAgICAgIHZhciBuZXh0ID0gdGhpcy5uZXdCbG9jaygnbmV4dCBvZiBpZmV4cCcpO1xuICAgICAgICB2YXIgZW5kID0gdGhpcy5uZXdCbG9jaygnZW5kIG9mIGlmZXhwJyk7XG4gICAgICAgIHZhciByZXQgPSB0aGlzLl9ncigncmVzJywgJ251bGwnKTtcblxuICAgICAgICB2YXIgdGVzdCA9IHRoaXMudmV4cHIoZS50ZXN0KTtcbiAgICAgICAgdGhpcy5fanVtcGZhbHNlKHRlc3QsIG5leHQpO1xuXG4gICAgICAgIG91dChyZXQsICc9JywgdGhpcy52ZXhwcihlLmJvZHkpLCAnOycpO1xuICAgICAgICB0aGlzLl9qdW1wKGVuZCk7XG5cbiAgICAgICAgdGhpcy5zZXRCbG9jayhuZXh0KTtcbiAgICAgICAgb3V0KHJldCwgJz0nLCB0aGlzLnZleHByKGUub3JlbHNlKSwgJzsnKTtcbiAgICAgICAgdGhpcy5fanVtcChlbmQpO1xuXG4gICAgICAgIHRoaXMuc2V0QmxvY2soZW5kKTtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICB9XG5cbiAgICBjZ2VuZXhwZ2VuKGdlbmVyYXRvcnMsIGdlbkluZGV4LCBlbHQpIHtcbiAgICAgICAgdmFyIHN0YXJ0ID0gdGhpcy5uZXdCbG9jaygnc3RhcnQgZm9yICcgKyBnZW5JbmRleCk7XG4gICAgICAgIHZhciBza2lwID0gdGhpcy5uZXdCbG9jaygnc2tpcCBmb3IgJyArIGdlbkluZGV4KTtcbiAgICAgICAgdmFyIGlmQ2xlYW51cCA9IHRoaXMubmV3QmxvY2soJ2lmIGNsZWFudXAgZm9yICcgKyBnZW5JbmRleCk7XG4gICAgICAgIHZhciBlbmQgPSB0aGlzLm5ld0Jsb2NrKCdlbmQgZm9yICcgKyBnZW5JbmRleCk7XG5cbiAgICAgICAgdmFyIGdlID0gZ2VuZXJhdG9yc1tnZW5JbmRleF07XG5cbiAgICAgICAgdmFyIGl0ZXI7XG4gICAgICAgIGlmIChnZW5JbmRleCA9PT0gMCkge1xuICAgICAgICAgICAgLy8gdGhlIG91dGVyIG1vc3QgaXRlcmF0b3IgaXMgZXZhbHVhdGVkIGluIHRoZSBzY29wZSBvdXRzaWRlIHNvIHdlXG4gICAgICAgICAgICAvLyBoYXZlIHRvIGV2YWx1YXRlIGl0IG91dHNpZGUgYW5kIHN0b3JlIGl0IGludG8gdGhlIGdlbmVyYXRvciBhcyBhXG4gICAgICAgICAgICAvLyBsb2NhbCwgd2hpY2ggd2UgcmV0cmlldmUgaGVyZS5cbiAgICAgICAgICAgIGl0ZXIgPSBcIiRsb2MuJGl0ZXIwXCI7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgdG9pdGVyID0gdGhpcy52ZXhwcihnZS5pdGVyKTtcbiAgICAgICAgICAgIGl0ZXIgPSBcIiRsb2MuXCIgKyB0aGlzLmdlbnN5bShcIml0ZXJcIik7XG4gICAgICAgICAgICBvdXQoaXRlciwgXCI9XCIsIFwiU2suYWJzdHIuaXRlcihcIiwgdG9pdGVyLCBcIik7XCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2p1bXAoc3RhcnQpO1xuICAgICAgICB0aGlzLnNldEJsb2NrKHN0YXJ0KTtcblxuICAgICAgICAvLyBsb2FkIHRhcmdldHNcbiAgICAgICAgdmFyIG5leHRpID0gdGhpcy5fZ3IoJ25leHQnLCBcIlNrLmFic3RyLml0ZXJuZXh0KFwiLCBpdGVyLCBcIilcIik7XG4gICAgICAgIHRoaXMuX2p1bXB1bmRlZihuZXh0aSwgZW5kKTsgLy8gdG9kbzsgdGhpcyBzaG91bGQgYmUgaGFuZGxlZCBieSBTdG9wSXRlcmF0aW9uXG4gICAgICAgIHZhciB0YXJnZXQgPSB0aGlzLnZleHByKGdlLnRhcmdldCwgbmV4dGkpO1xuXG4gICAgICAgIHZhciBuID0gZ2UuaWZzLmxlbmd0aDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHtcbiAgICAgICAgICAgIHZhciBpZnJlcyA9IHRoaXMudmV4cHIoZ2UuaWZzW2ldKTtcbiAgICAgICAgICAgIHRoaXMuX2p1bXBmYWxzZShpZnJlcywgc3RhcnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCsrZ2VuSW5kZXggPCBnZW5lcmF0b3JzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy5jZ2VuZXhwZ2VuKGdlbmVyYXRvcnMsIGdlbkluZGV4LCBlbHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGdlbkluZGV4ID49IGdlbmVyYXRvcnMubGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgdmVsdCA9IHRoaXMudmV4cHIoZWx0KTtcbiAgICAgICAgICAgIG91dChcInJldHVybiBbXCIsIHNraXAsIFwiLypyZXN1bWUqLyxcIiwgdmVsdCwgXCIvKnJldCovXTtcIik7XG4gICAgICAgICAgICB0aGlzLnNldEJsb2NrKHNraXApO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fanVtcChzdGFydCk7XG5cbiAgICAgICAgdGhpcy5zZXRCbG9jayhlbmQpO1xuXG4gICAgICAgIGlmIChnZW5JbmRleCA9PT0gMSlcbiAgICAgICAgICAgIG91dChcInJldHVybiBudWxsO1wiKTtcbiAgICB9XG5cbiAgICBjZ2VuZXhwKGUpIHtcbiAgICAgICAgdmFyIGdlbiA9IHRoaXMuYnVpbGRjb2Rlb2JqKGUsIFwiPGdlbmV4cHI+XCIsIG51bGwsIG51bGwsXG4gICAgICAgICAgICBmdW5jdGlvbihzY29wZW5hbWUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNnZW5leHBnZW4oZS5nZW5lcmF0b3JzLCAwLCBlLmVsdCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAvLyBjYWxsIHRoZSBnZW5lcmF0b3IgbWFrZXIgdG8gZ2V0IHRoZSBnZW5lcmF0b3IuIHRoaXMgaXMga2luZCBvZiBkdW1iLFxuICAgICAgICAvLyBidXQgdGhlIGNvZGUgYnVpbGRlciBidWlsZHMgYSB3cmFwcGVyIHRoYXQgbWFrZXMgZ2VuZXJhdG9ycyBmb3Igbm9ybWFsXG4gICAgICAgIC8vIGZ1bmN0aW9uIGdlbmVyYXRvcnMsIHNvIHdlIGp1c3QgZG8gaXQgb3V0c2lkZSAoZXZlbiBqdXN0IG5ldydpbmcgaXRcbiAgICAgICAgLy8gaW5saW5lIHdvdWxkIGJlIGZpbmUpLlxuICAgICAgICB2YXIgZ2VuZXIgPSB0aGlzLl9ncihcImdlbmVyXCIsIFwiU2subWlzY2V2YWwuY2FsbHNpbShcIiwgZ2VuLCBcIik7XCIpO1xuICAgICAgICAvLyBzdHVmZiB0aGUgb3V0ZXJtb3N0IGl0ZXJhdG9yIGludG8gdGhlIGdlbmVyYXRvciBhZnRlciBldmFsdWF0aW5nIGl0XG4gICAgICAgIC8vIG91dHNpZGUgb2YgdGhlIGZ1bmN0aW9uLiBpdCdzIHJldHJpZXZlZCBieSB0aGUgZml4ZWQgbmFtZSBhYm92ZS5cbiAgICAgICAgb3V0KGdlbmVyLCBcIi5naSRsb2NhbHMuJGl0ZXIwPVNrLmFic3RyLml0ZXIoXCIsIHRoaXMudmV4cHIoZS5nZW5lcmF0b3JzWzBdLml0ZXIpLCBcIik7XCIpO1xuICAgICAgICByZXR1cm4gZ2VuZXI7XG4gICAgfVxuXG5cblxuICAgIHByaXZhdGUgY2NsYXNzKHM6IGFzdG5vZGVzLkNsYXNzRGVmKSB7XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KHMgaW5zdGFuY2VvZiBhc3Rub2Rlcy5DbGFzc0RlZik7XG4gICAgICAgIHZhciBkZWNvcyA9IHMuZGVjb3JhdG9yX2xpc3Q7XG5cbiAgICAgICAgLy8gZGVjb3JhdG9ycyBhbmQgYmFzZXMgbmVlZCB0byBiZSBldmFsJ2Qgb3V0IGhlcmVcbiAgICAgICAgLy90aGlzLnZzZXFleHByKGRlY29zKTtcblxuICAgICAgICB2YXIgYmFzZXMgPSB0aGlzLnZzZXFleHByKHMuYmFzZXMpO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAY29uc3RcbiAgICAgICAgICogQHR5cGUge3N0cmluZ31cbiAgICAgICAgICovXG4gICAgICAgIHZhciBzY29wZW5hbWU6IHN0cmluZyA9IHRoaXMuZW50ZXJTY29wZShzLm5hbWUsIHMsIHMubGluZW5vKTtcbiAgICAgICAgdmFyIGVudHJ5QmxvY2s6IG51bWJlciA9IHRoaXMubmV3QmxvY2soJ2NsYXNzIGVudHJ5Jyk7XG5cbiAgICAgICAgdGhpcy51LnByZWZpeENvZGUgPSBcInZhciBcIiArIHNjb3BlbmFtZSArIFwiPShmdW5jdGlvbiAkXCIgKyBzLm5hbWUgKyBcIiRjbGFzc19vdXRlcigkZ2xvYmFscywkbG9jYWxzLCRyZXN0KXt2YXIgJGdibD0kZ2xvYmFscywkbG9jPSRsb2NhbHM7XCI7XG4gICAgICAgIHRoaXMudS5zd2l0Y2hDb2RlICs9IFwicmV0dXJuKGZ1bmN0aW9uIFwiICsgcy5uYW1lICsgXCIoKXtcIjtcbiAgICAgICAgdGhpcy51LnN3aXRjaENvZGUgKz0gXCJ2YXIgJGJsaz1cIiArIGVudHJ5QmxvY2sgKyBcIiwkZXhjPVtdO3doaWxlKHRydWUpe3N3aXRjaCgkYmxrKXtcIjtcbiAgICAgICAgdGhpcy51LnN1ZmZpeENvZGUgPSBcIn1icmVhazt9fSkuYXBwbHkobnVsbCwkcmVzdCk7fSk7XCI7XG5cbiAgICAgICAgdGhpcy51LnByaXZhdGVfID0gcy5uYW1lO1xuXG4gICAgICAgIHRoaXMuY2JvZHkocy5ib2R5KTtcbiAgICAgICAgb3V0KFwiYnJlYWs7XCIpO1xuXG4gICAgICAgIC8vIGJ1aWxkIGNsYXNzXG5cbiAgICAgICAgLy8gYXBwbHkgZGVjb3JhdG9yc1xuXG4gICAgICAgIHRoaXMuZXhpdFNjb3BlKCk7XG5cbiAgICAgICAgdmFyIHdyYXBwZWQgPSB0aGlzLl9ncignYnVpbHQnLCAnU2subWlzY2V2YWwuYnVpbGRDbGFzcygkZ2JsLCcsIHNjb3BlbmFtZSwgJywnLCB0b1N0cmluZ0xpdGVyYWxKUyhzLm5hbWUpLCAnLFsnLCBiYXNlcywgJ10pJyk7XG5cbiAgICAgICAgLy8gc3RvcmUgb3VyIG5ldyBjbGFzcyB1bmRlciB0aGUgcmlnaHQgbmFtZVxuICAgICAgICB0aGlzLm5hbWVvcChzLm5hbWUsIGFzdG5vZGVzLlN0b3JlLCB3cmFwcGVkKTtcbiAgICB9XG5cbiAgICBjY29udGludWUocykge1xuICAgICAgICBpZiAodGhpcy51LmNvbnRpbnVlQmxvY2tzLmxlbmd0aCA9PT0gMClcbiAgICAgICAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcihcIidjb250aW51ZScgb3V0c2lkZSBsb29wXCIpO1xuICAgICAgICAvLyB0b2RvOyBjb250aW51ZSBvdXQgb2YgZXhjZXB0aW9uIGJsb2Nrc1xuICAgICAgICB0aGlzLl9qdW1wKHRoaXMudS5jb250aW51ZUJsb2Nrc1t0aGlzLnUuY29udGludWVCbG9ja3MubGVuZ3RoIC0gMV0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGNvbXBpbGVzIGEgc3RhdGVtZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSB2c3RtdChzOiBhc3Rub2Rlcy5zdG10KTogdm9pZCB7XG5cbiAgICAgICAgdGhpcy51LmxpbmVubyA9IHMubGluZW5vO1xuICAgICAgICB0aGlzLnUubGluZW5vU2V0ID0gZmFsc2U7XG5cbiAgICAgICAgdGhpcy5hbm5vdGF0ZVNvdXJjZShzKTtcblxuICAgICAgICBzd2l0Y2ggKHMuY29uc3RydWN0b3IpIHtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuRnVuY3Rpb25EZWY6XG4gICAgICAgICAgICAgICAgdGhpcy5jZnVuY3Rpb24oKDxhc3Rub2Rlcy5GdW5jdGlvbkRlZj5zKSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkNsYXNzRGVmOlxuICAgICAgICAgICAgICAgIHRoaXMuY2NsYXNzKCg8YXN0bm9kZXMuQ2xhc3NEZWY+cykpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5SZXR1cm5fOlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnUuc3RlLmJsb2NrVHlwZSAhPT0gRnVuY3Rpb25CbG9jaylcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKFwiJ3JldHVybicgb3V0c2lkZSBmdW5jdGlvblwiKTtcbiAgICAgICAgICAgICAgICBpZiAoKDxhc3Rub2Rlcy5SZXR1cm5fPnMpLnZhbHVlKVxuICAgICAgICAgICAgICAgICAgICBvdXQoXCJyZXR1cm4gXCIsIHRoaXMudmV4cHIoKDxhc3Rub2Rlcy5SZXR1cm5fPnMpLnZhbHVlKSwgXCI7XCIpO1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgb3V0KFwicmV0dXJuIG51bGw7XCIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5EZWxldGVfOlxuICAgICAgICAgICAgICAgIHRoaXMudnNlcWV4cHIoKDxhc3Rub2Rlcy5EZWxldGVfPnMpLnRhcmdldHMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5Bc3NpZ246XG4gICAgICAgICAgICAgICAgdmFyIG4gPSAoPGFzdG5vZGVzLkFzc2lnbj5zKS50YXJnZXRzLmxlbmd0aDtcbiAgICAgICAgICAgICAgICB2YXIgdmFsID0gdGhpcy52ZXhwcigoPGFzdG5vZGVzLkFzc2lnbj5zKS52YWx1ZSk7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudmV4cHIoKDxhc3Rub2Rlcy5Bc3NpZ24+cykudGFyZ2V0c1tpXSwgdmFsKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuQXVnQXNzaWduOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNhdWdhc3NpZ24ocyk7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlByaW50OlxuICAgICAgICAgICAgICAgIHRoaXMuY3ByaW50KHMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5Gb3JfOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNmb3IoKDxhc3Rub2Rlcy5Gb3JfPnMpKTtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuV2hpbGVfOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmN3aGlsZShzKTtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuSWZfOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNpZihzKTtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuUmFpc2U6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY3JhaXNlKHMpO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5UcnlFeGNlcHQ6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY3RyeWV4Y2VwdChzKTtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuVHJ5RmluYWxseTpcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5jdHJ5ZmluYWxseShzKTtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuQXNzZXJ0OlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNhc3NlcnQoKDxhc3Rub2Rlcy5Bc3NlcnQ+cykpO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5JbXBvcnRfOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNpbXBvcnQocyk7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkltcG9ydEZyb206XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2Zyb21pbXBvcnQocyk7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkdsb2JhbDpcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuRXhwcjpcbiAgICAgICAgICAgICAgICB0aGlzLnZleHByKCg8YXN0bm9kZXMuRXhwcj5zKS52YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlBhc3M6XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkJyZWFrXzpcbiAgICAgICAgICAgICAgICBpZiAodGhpcy51LmJyZWFrQmxvY2tzLmxlbmd0aCA9PT0gMClcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKFwiJ2JyZWFrJyBvdXRzaWRlIGxvb3BcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5fanVtcCh0aGlzLnUuYnJlYWtCbG9ja3NbdGhpcy51LmJyZWFrQmxvY2tzLmxlbmd0aCAtIDFdKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuQ29udGludWVfOlxuICAgICAgICAgICAgICAgIHRoaXMuY2NvbnRpbnVlKHMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBhc3NlcnRzLmZhaWwoXCJ1bmhhbmRsZWQgY2FzZSBpbiB2c3RtdFwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZzZXFzdG10KHN0bXRzKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RtdHMubGVuZ3RoOyArK2kpIHRoaXMudnN0bXQoc3RtdHNbaV0pO1xuICAgIH1cblxuICAgIGlzQ2VsbChuYW1lOiBzdHJpbmcpIHtcbiAgICAgICAgdmFyIG1hbmdsZWQgPSBtYW5nbGVOYW1lKHRoaXMudS5wcml2YXRlXywgbmFtZSk7XG4gICAgICAgIHZhciBzY29wZSA9IHRoaXMudS5zdGUuZ2V0U2NvcGUobWFuZ2xlZCk7XG4gICAgICAgIHZhciBkaWN0ID0gbnVsbDtcbiAgICAgICAgaWYgKHNjb3BlID09PSBzeW10YWJsZS5DRUxMKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBjdHhcbiAgICAgKiBAcGFyYW0ge3N0cmluZz19IGRhdGFUb1N0b3JlXG4gICAgICovXG4gICAgbmFtZW9wKG5hbWU6IHN0cmluZywgY3R4LCBkYXRhVG9TdG9yZT86IHN0cmluZykge1xuICAgICAgICBpZiAoKGN0eCA9PT0gYXN0bm9kZXMuU3RvcmUgfHwgY3R4ID09PSBhc3Rub2Rlcy5BdWdTdG9yZSB8fCBjdHggPT09IGFzdG5vZGVzLkRlbCkgJiYgbmFtZSA9PT0gXCJfX2RlYnVnX19cIikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKFwiY2FuIG5vdCBhc3NpZ24gdG8gX19kZWJ1Z19fXCIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICgoY3R4ID09PSBhc3Rub2Rlcy5TdG9yZSB8fCBjdHggPT09IGFzdG5vZGVzLkF1Z1N0b3JlIHx8IGN0eCA9PT0gYXN0bm9kZXMuRGVsKSAmJiBuYW1lID09PSBcIk5vbmVcIikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKFwiY2FuIG5vdCBhc3NpZ24gdG8gTm9uZVwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChuYW1lID09PSBcIk5vbmVcIikgcmV0dXJuIFwiU2suYnVpbHRpbi5ub25lLm5vbmUkXCI7XG4gICAgICAgIGlmIChuYW1lID09PSBcIlRydWVcIikgcmV0dXJuIFwiU2suZmZpLmJvb2wuVHJ1ZVwiO1xuICAgICAgICBpZiAobmFtZSA9PT0gXCJGYWxzZVwiKSByZXR1cm4gXCJTay5mZmkuYm9vbC5GYWxzZVwiO1xuXG4gICAgICAgIC8vIEhhdmUgdG8gZG8gdGhpcyBiZWZvcmUgbG9va2luZyBpdCB1cCBpbiB0aGUgc2NvcGVcbiAgICAgICAgdmFyIG1hbmdsZWQgPSBtYW5nbGVOYW1lKHRoaXMudS5wcml2YXRlXywgbmFtZSk7XG4gICAgICAgIHZhciBvcCA9IDA7XG4gICAgICAgIHZhciBvcHR5cGUgPSBPUF9OQU1FO1xuICAgICAgICB2YXIgc2NvcGUgPSB0aGlzLnUuc3RlLmdldFNjb3BlKG1hbmdsZWQpO1xuICAgICAgICB2YXIgZGljdCA9IG51bGw7XG4gICAgICAgIHN3aXRjaCAoc2NvcGUpIHtcbiAgICAgICAgICAgIGNhc2UgRlJFRTpcbiAgICAgICAgICAgICAgICBkaWN0ID0gXCIkZnJlZVwiO1xuICAgICAgICAgICAgICAgIG9wdHlwZSA9IE9QX0RFUkVGO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBDRUxMOlxuICAgICAgICAgICAgICAgIGRpY3QgPSBcIiRjZWxsXCI7XG4gICAgICAgICAgICAgICAgb3B0eXBlID0gT1BfREVSRUY7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIExPQ0FMOlxuICAgICAgICAgICAgICAgIC8vIGNhbid0IGRvIEZBU1QgaW4gZ2VuZXJhdG9ycyBvciBhdCBtb2R1bGUvY2xhc3Mgc2NvcGVcbiAgICAgICAgICAgICAgICBpZiAodGhpcy51LnN0ZS5ibG9ja1R5cGUgPT09IEZ1bmN0aW9uQmxvY2sgJiYgIXRoaXMudS5zdGUuZ2VuZXJhdG9yKVxuICAgICAgICAgICAgICAgICAgICBvcHR5cGUgPSBPUF9GQVNUO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBHTE9CQUxfSU1QTElDSVQ6XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudS5zdGUuYmxvY2tUeXBlID09PSBGdW5jdGlvbkJsb2NrKVxuICAgICAgICAgICAgICAgICAgICBvcHR5cGUgPSBPUF9HTE9CQUw7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIEdMT0JBTF9FWFBMSUNJVDpcbiAgICAgICAgICAgICAgICBvcHR5cGUgPSBPUF9HTE9CQUw7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaGF2ZSB0byBkbyB0aGlzIGFmdGVyIGxvb2tpbmcgaXQgdXAgaW4gdGhlIHNjb3BlXG4gICAgICAgIG1hbmdsZWQgPSBmaXhSZXNlcnZlZE5hbWVzKG1hbmdsZWQpO1xuICAgICAgICBtYW5nbGVkID0gZml4UmVzZXJ2ZWRXb3JkcyhtYW5nbGVkKTtcblxuICAgICAgICAvL3ByaW50KFwibWFuZ2xlZFwiLCBtYW5nbGVkKTtcbiAgICAgICAgLy8gVE9ETyBUT0RPIFRPRE8gdG9kbzsgaW1wb3J0ICogYXQgZ2xvYmFsIHNjb3BlIGZhaWxpbmcgaGVyZVxuICAgICAgICBhc3NlcnRzLmFzc2VydChzY29wZSB8fCBuYW1lLmNoYXJBdCgxKSA9PT0gJ18nKTtcblxuICAgICAgICAvLyBpbiBnZW5lcmF0b3Igb3IgYXQgbW9kdWxlIHNjb3BlLCB3ZSBuZWVkIHRvIHN0b3JlIHRvICRsb2MsIHJhdGhlciB0aGF0XG4gICAgICAgIC8vIHRvIGFjdHVhbCBKUyBzdGFjayB2YXJpYWJsZXMuXG4gICAgICAgIHZhciBtYW5nbGVkTm9QcmUgPSBtYW5nbGVkO1xuICAgICAgICBpZiAodGhpcy51LnN0ZS5nZW5lcmF0b3IgfHwgdGhpcy51LnN0ZS5ibG9ja1R5cGUgIT09IEZ1bmN0aW9uQmxvY2spXG4gICAgICAgICAgICBtYW5nbGVkID0gXCIkbG9jLlwiICsgbWFuZ2xlZDtcbiAgICAgICAgZWxzZSBpZiAob3B0eXBlID09PSBPUF9GQVNUIHx8IG9wdHlwZSA9PT0gT1BfTkFNRSlcbiAgICAgICAgICAgIHRoaXMudS5sb2NhbG5hbWVzLnB1c2gobWFuZ2xlZCk7XG5cbiAgICAgICAgc3dpdGNoIChvcHR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgT1BfRkFTVDpcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGN0eCkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkxvYWQ6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuUGFyYW06XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBOZWVkIHRvIGNoZWNrIHRoYXQgaXQgaXMgYm91bmQhXG4gICAgICAgICAgICAgICAgICAgICAgICBvdXQoXCJpZiAodHlwZW9mIFwiLCBtYW5nbGVkLCBcIiA9PT0gJ3VuZGVmaW5lZCcpIHsgdGhyb3cgbmV3IEVycm9yKCdsb2NhbCB2YXJpYWJsZSBcXFxcXFwnXCIsIG1hbmdsZWQsIFwiXFxcXFxcJyByZWZlcmVuY2VkIGJlZm9yZSBhc3NpZ25tZW50Jyk7IH1cXG5cIik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbWFuZ2xlZDtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5TdG9yZTpcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dChtYW5nbGVkLCBcIj1cIiwgZGF0YVRvU3RvcmUsIFwiO1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkRlbDpcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dChcImRlbGV0ZSBcIiwgbWFuZ2xlZCwgXCI7XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NlcnRzLmZhaWwoXCJ1bmhhbmRsZWRcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBPUF9OQU1FOlxuICAgICAgICAgICAgICAgIHN3aXRjaCAoY3R4KSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuTG9hZDpcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB2ID0gdGhpcy5nZW5zeW0oJ2xvYWRuYW1lJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBjYW4ndCBiZSB8fCBmb3IgbG9jLnggPSAwIG9yIG51bGxcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dChcInZhciBcIiwgdiwgXCI9KHR5cGVvZiBcIiwgbWFuZ2xlZCwgXCIgIT09ICd1bmRlZmluZWQnKSA/IFwiLCBtYW5nbGVkLCBcIjpTay5taXNjZXZhbC5sb2FkbmFtZSgnXCIsIG1hbmdsZWROb1ByZSwgXCInLCRnYmwpO1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2O1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlN0b3JlOlxuICAgICAgICAgICAgICAgICAgICAgICAgb3V0KG1hbmdsZWQsIFwiPVwiLCBkYXRhVG9TdG9yZSwgXCI7XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuRGVsOlxuICAgICAgICAgICAgICAgICAgICAgICAgb3V0KFwiZGVsZXRlIFwiLCBtYW5nbGVkLCBcIjtcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5QYXJhbTpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBtYW5nbGVkO1xuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXJ0cy5mYWlsKFwidW5oYW5kbGVkXCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgT1BfR0xPQkFMOlxuICAgICAgICAgICAgICAgIHN3aXRjaCAoY3R4KSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuTG9hZDpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9ncihcImxvYWRnYmxcIiwgXCJTay5taXNjZXZhbC5sb2FkbmFtZSgnXCIsIG1hbmdsZWROb1ByZSwgXCInLCRnYmwpXCIpO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlN0b3JlOlxuICAgICAgICAgICAgICAgICAgICAgICAgb3V0KFwiJGdibC5cIiwgbWFuZ2xlZE5vUHJlLCBcIj1cIiwgZGF0YVRvU3RvcmUsICc7Jyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5EZWw6XG4gICAgICAgICAgICAgICAgICAgICAgICBvdXQoXCJkZWxldGUgJGdibC5cIiwgbWFuZ2xlZE5vUHJlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXJ0cy5mYWlsKFwidW5oYW5kbGVkIGNhc2UgaW4gbmFtZSBvcF9nbG9iYWxcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBPUF9ERVJFRjpcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGN0eCkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkxvYWQ6XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZGljdCArIFwiLlwiICsgbWFuZ2xlZE5vUHJlO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlN0b3JlOlxuICAgICAgICAgICAgICAgICAgICAgICAgb3V0KGRpY3QsIFwiLlwiLCBtYW5nbGVkTm9QcmUsIFwiPVwiLCBkYXRhVG9TdG9yZSwgXCI7XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuUGFyYW06XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbWFuZ2xlZE5vUHJlO1xuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXJ0cy5mYWlsKFwidW5oYW5kbGVkIGNhc2UgaW4gbmFtZSBvcF9kZXJlZlwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGFzc2VydHMuZmFpbChcInVuaGFuZGxlZCBjYXNlXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IFRoZSBnZW5lcmF0ZWQgbmFtZSBvZiB0aGUgc2NvcGUsIHVzdWFsbHkgJHNjb3BlTi5cbiAgICAgKi9cbiAgICBlbnRlclNjb3BlKG5hbWU6IHN0cmluZywga2V5LCBsaW5lbm86IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIHZhciB1ID0gbmV3IENvbXBpbGVyVW5pdCgpO1xuICAgICAgICB1LnN0ZSA9IHRoaXMuc3QuZ2V0U3RzRm9yQXN0KGtleSk7XG4gICAgICAgIHUubmFtZSA9IG5hbWU7XG4gICAgICAgIHUuZmlyc3RsaW5lbm8gPSBsaW5lbm87XG5cbiAgICAgICAgaWYgKHRoaXMudSAmJiB0aGlzLnUucHJpdmF0ZV8pXG4gICAgICAgICAgICB1LnByaXZhdGVfID0gdGhpcy51LnByaXZhdGVfO1xuXG4gICAgICAgIHRoaXMuc3RhY2sucHVzaCh0aGlzLnUpO1xuICAgICAgICB0aGlzLmFsbFVuaXRzLnB1c2godSk7XG4gICAgICAgIHZhciBzY29wZU5hbWU6IHN0cmluZyA9IHRoaXMuZ2Vuc3ltKCdzY29wZScpO1xuICAgICAgICB1LnNjb3BlbmFtZSA9IHNjb3BlTmFtZTtcblxuICAgICAgICB0aGlzLnUgPSB1O1xuICAgICAgICB0aGlzLnUuYWN0aXZhdGVTY29wZSgpO1xuXG4gICAgICAgIHRoaXMubmVzdGxldmVsKys7XG5cbiAgICAgICAgcmV0dXJuIHNjb3BlTmFtZTtcbiAgICB9XG5cbiAgICBleGl0U2NvcGUoKSB7XG4gICAgICAgIHZhciBwcmV2ID0gdGhpcy51O1xuICAgICAgICB0aGlzLm5lc3RsZXZlbC0tO1xuICAgICAgICBpZiAodGhpcy5zdGFjay5sZW5ndGggLSAxID49IDApXG4gICAgICAgICAgICB0aGlzLnUgPSB0aGlzLnN0YWNrLnBvcCgpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLnUgPSBudWxsO1xuICAgICAgICBpZiAodGhpcy51KVxuICAgICAgICAgICAgdGhpcy51LmFjdGl2YXRlU2NvcGUoKTtcblxuICAgICAgICBpZiAocHJldi5uYW1lICE9PSBcIjxtb2R1bGU+XCIpIHtcbiAgICAgICAgICAgIHZhciBtYW5nbGVkID0gcHJldi5uYW1lO1xuICAgICAgICAgICAgbWFuZ2xlZCA9IGZpeFJlc2VydmVkV29yZHMobWFuZ2xlZCk7XG4gICAgICAgICAgICBtYW5nbGVkID0gZml4UmVzZXJ2ZWROYW1lcyhtYW5nbGVkKTtcbiAgICAgICAgICAgIG91dChwcmV2LnNjb3BlbmFtZSwgXCIuY29fbmFtZT1Tay5idWlsdGluLnN0cmluZ1RvUHkoJ1wiLCBtYW5nbGVkLCBcIicpO1wiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgY2JvZHkoc3RtdHM6IGFzdG5vZGVzLnN0bXRbXSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN0bXRzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICB0aGlzLnZzdG10KHN0bXRzW2ldKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNwcmludChzKSB7XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KHMgaW5zdGFuY2VvZiBhc3Rub2Rlcy5QcmludCk7XG4gICAgICAgIHZhciBkZXN0ID0gJ251bGwnO1xuICAgICAgICBpZiAocy5kZXN0KSB7XG4gICAgICAgICAgICBkZXN0ID0gdGhpcy52ZXhwcihzLmRlc3QpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG4gPSBzLnZhbHVlcy5sZW5ndGg7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7XG4gICAgICAgICAgICBvdXQoXCJTay5taXNjZXZhbC5wcmludF8oU2suZmZpLnJlbWFwVG9KcyhuZXcgU2suYnVpbHRpbnMuc3RyKFwiLCB0aGlzLnZleHByKHMudmFsdWVzW2ldKSwgXCIpKSk7XCIpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzLm5sKSB7XG4gICAgICAgICAgICBvdXQoXCJTay5taXNjZXZhbC5wcmludF8oJ1xcXFxuJyk7XCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY21vZChtb2Q6IGFzdG5vZGVzLm1vZCkge1xuICAgICAgICAvKipcbiAgICAgICAgICogQGNvbnN0XG4gICAgICAgICAqIEB0eXBlIHtzdHJpbmd9XG4gICAgICAgICAqL1xuICAgICAgICB2YXIgbW9kZiA9IHRoaXMuZW50ZXJTY29wZShcIjxtb2R1bGU+XCIsIG1vZCwgMCk7XG5cbiAgICAgICAgdmFyIGVudHJ5QmxvY2sgPSB0aGlzLm5ld0Jsb2NrKCdtb2R1bGUgZW50cnknKTtcbiAgICAgICAgdGhpcy51LnByZWZpeENvZGUgPSBcInZhciBcIiArIG1vZGYgKyBcIj0oZnVuY3Rpb24oJG1vZG5hbWUpe1wiO1xuICAgICAgICB0aGlzLnUudmFyRGVjbHNDb2RlID0gXCJ2YXIgJGJsaz1cIiArIGVudHJ5QmxvY2sgKyBcIiwkZXhjPVtdLCRnYmw9e30sJGxvYz0kZ2JsLCRlcnI7JGdibC5fX25hbWVfXz0kbW9kbmFtZTtTay5nbG9iYWxzPSRnYmw7XCI7XG5cbiAgICAgICAgdGhpcy51LnN3aXRjaENvZGUgPSBcInRyeSB7d2hpbGUodHJ1ZSl7dHJ5e3N3aXRjaCgkYmxrKXtcIjtcbiAgICAgICAgdGhpcy51LnN1ZmZpeENvZGUgPSBcIn19Y2F0Y2goZXJyKXtpZiAoJGV4Yy5sZW5ndGg+MCkgeyRlcnI9ZXJyOyRibGs9JGV4Yy5wb3AoKTtjb250aW51ZTt9IGVsc2Uge3Rocm93IGVycjt9fX19Y2F0Y2goZXJyKXtpZiAoZXJyIGluc3RhbmNlb2YgU2suYnVpbHRpbi5TeXN0ZW1FeGl0ICYmICFTay50aHJvd1N5c3RlbUV4aXQpIHsgU2subWlzY2V2YWwucHJpbnRfKGVyci50b1N0cmluZygpICsgJ1xcXFxuJyk7IHJldHVybiAkbG9jOyB9IGVsc2UgeyB0aHJvdyBlcnI7IH0gfSB9KTtcIjtcblxuICAgICAgICBzd2l0Y2ggKG1vZC5jb25zdHJ1Y3Rvcikge1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5Nb2R1bGU6XG4gICAgICAgICAgICAgICAgdGhpcy5jYm9keSgoPGFzdG5vZGVzLk1vZHVsZT5tb2QpLmJvZHkpO1xuICAgICAgICAgICAgICAgIG91dChcInJldHVybiAkbG9jO1wiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgYXNzZXJ0cy5mYWlsKFwidG9kbzsgdW5oYW5kbGVkIGNhc2UgaW4gY29tcGlsZXJNb2RcIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5leGl0U2NvcGUoKTtcblxuICAgICAgICB0aGlzLnJlc3VsdC5wdXNoKHRoaXMub3V0cHV0QWxsVW5pdHMoKSk7XG4gICAgICAgIHJldHVybiBtb2RmO1xuICAgIH1cblxufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBzb3VyY2UgdGhlIGNvZGVcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWxlTmFtZSB3aGVyZSBpdCBjYW1lIGZyb21cbiAqXG4gKiBAcmV0dXJuIHt7ZnVuY25hbWU6IHN0cmluZywgY29kZTogc3RyaW5nfX1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXBpbGUoc291cmNlOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcpOiB7ZnVuY25hbWU6IHN0cmluZzsgY29kZTogc3RyaW5nfSB7XG4gICAgdmFyIGNzdCA9IHBhcnNlci5wYXJzZShmaWxlTmFtZSwgc291cmNlKTtcbiAgICB2YXIgYXN0ID0gYnVpbGRlci5hc3RGcm9tUGFyc2UoY3N0LCBmaWxlTmFtZSk7XG4gICAgdmFyIHN0OiBzeW10YWJsZS5TeW1ib2xUYWJsZSA9IHN5bXRhYmxlLnN5bWJvbFRhYmxlKGFzdCwgZmlsZU5hbWUpO1xuICAgIC8vIFRoZSBjb21waWxlciBnZXRzIHRvIG1ha2UgdXNlIG9mIHRoZSBzeW1ib2wgdGFibGVcbiAgICB2YXIgYyA9IG5ldyBDb21waWxlcihmaWxlTmFtZSwgc3QsIDAsIHNvdXJjZSk7XG4gICAgLy8gQ29tcGlsYXRpb24gaXMgZHJpdmVuIGZyb20gdGhlIEFic3RyYWN0IFN5bnRheCBUcmVlLlxuICAgIHJldHVybiB7ICdmdW5jbmFtZSc6IGMuY21vZChhc3QpLCAnY29kZSc6IGMucmVzdWx0LmpvaW4oJycpIH07XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRDb21waWxlcigpIHtcbiAgICBnZW5zeW1jb3VudCA9IDA7XG59O1xuIl19