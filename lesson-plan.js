var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS({
  "node_modules/ajv/dist/compile/codegen/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
    var _CodeOrName = class {
    };
    exports._CodeOrName = _CodeOrName;
    exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    var Name = class extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports.IDENTIFIER.test(s))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return false;
      }
      get names() {
        return { [this.str]: 1 };
      }
    };
    exports.Name = Name;
    var _Code = class extends _CodeOrName {
      constructor(code) {
        super();
        this._items = typeof code === "string" ? [code] : code;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return false;
        const item = this._items[0];
        return item === "" || item === '""';
      }
      get str() {
        var _a;
        return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
      }
      get names() {
        var _a;
        return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c) => {
          if (c instanceof Name)
            names[c.str] = (names[c.str] || 0) + 1;
          return names;
        }, {});
      }
    };
    exports._Code = _Code;
    exports.nil = new _Code("");
    function _(strs, ...args) {
      const code = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code, args[i]);
        code.push(strs[++i]);
      }
      return new _Code(code);
    }
    exports._ = _;
    var plus = new _Code("+");
    function str(strs, ...args) {
      const expr = [safeStringify(strs[0])];
      let i = 0;
      while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
      }
      optimize(expr);
      return new _Code(expr);
    }
    exports.str = str;
    function addCodeArg(code, arg) {
      if (arg instanceof _Code)
        code.push(...arg._items);
      else if (arg instanceof Name)
        code.push(arg);
      else
        code.push(interpolate(arg));
    }
    exports.addCodeArg = addCodeArg;
    function optimize(expr) {
      let i = 1;
      while (i < expr.length - 1) {
        if (expr[i] === plus) {
          const res = mergeExprItems(expr[i - 1], expr[i + 1]);
          if (res !== void 0) {
            expr.splice(i - 1, 3, res);
            continue;
          }
          expr[i++] = "+";
        }
        i++;
      }
    }
    function mergeExprItems(a, b) {
      if (b === '""')
        return a;
      if (a === '""')
        return b;
      if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
          return;
        if (typeof b != "string")
          return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
          return a.slice(0, -1) + b.slice(1);
        return;
      }
      if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
      return;
    }
    function strConcat(c1, c2) {
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
    }
    exports.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports.safeStringify = safeStringify;
    function getProperty(key) {
      return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports.getProperty = getProperty;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports.regexpCode = regexpCode;
  }
});

// node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS({
  "node_modules/ajv/dist/compile/codegen/scope.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
    var code_1 = require_code();
    var ValueError = class extends Error {
      constructor(name) {
        super(`CodeGen: "code" for ${name} not defined`);
        this.value = name.value;
      }
    };
    var UsedValueState;
    (function(UsedValueState2) {
      UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
      UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
    exports.varKinds = {
      const: new code_1.Name("const"),
      let: new code_1.Name("let"),
      var: new code_1.Name("var")
    };
    var Scope = class {
      constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
      }
      toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
      }
      name(prefix) {
        return new code_1.Name(this._newName(prefix));
      }
      _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
      }
      _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
          throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return this._names[prefix] = { prefix, index: 0 };
      }
    };
    exports.Scope = Scope;
    var ValueScopeName = class extends code_1.Name {
      constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
      }
      setValue(value2, { property, itemIndex }) {
        this.value = value2;
        this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
      }
    };
    exports.ValueScopeName = ValueScopeName;
    var line = (0, code_1._)`\n`;
    var ValueScope = class extends Scope {
      constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
      }
      get() {
        return this._scope;
      }
      name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
      }
      value(nameOrPrefix, value2) {
        var _a;
        if (value2.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const name = this.toName(nameOrPrefix);
        const { prefix } = name;
        const valueKey = (_a = value2.key) !== null && _a !== void 0 ? _a : value2.ref;
        let vs = this._values[prefix];
        if (vs) {
          const _name = vs.get(valueKey);
          if (_name)
            return _name;
        } else {
          vs = this._values[prefix] = /* @__PURE__ */ new Map();
        }
        vs.set(valueKey, name);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value2.ref;
        name.setValue(value2, { property: prefix, itemIndex });
        return name;
      }
      getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
          return;
        return vs.get(keyOrRef);
      }
      scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name) => {
          if (name.scopePath === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return (0, code_1._)`${scopeName}${name.scopePath}`;
        });
      }
      scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name) => {
          if (name.value === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return name.value.code;
        }, usedValues, getCode);
      }
      _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code = code_1.nil;
        for (const prefix in values) {
          const vs = values[prefix];
          if (!vs)
            continue;
          const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
          vs.forEach((name) => {
            if (nameSet.has(name))
              return;
            nameSet.set(name, UsedValueState.Started);
            let c = valueCode(name);
            if (c) {
              const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
              code = (0, code_1._)`${code}${def} ${name} = ${c};${this.opts._n}`;
            } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) {
              code = (0, code_1._)`${code}${c}${this.opts._n}`;
            } else {
              throw new ValueError(name);
            }
            nameSet.set(name, UsedValueState.Completed);
          });
        }
        return code;
      }
    };
    exports.ValueScope = ValueScope;
  }
});

// node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS({
  "node_modules/ajv/dist/compile/codegen/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
    var code_1 = require_code();
    var scope_1 = require_scope();
    var code_2 = require_code();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = require_scope();
    Object.defineProperty(exports, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports.operators = {
      GT: new code_1._Code(">"),
      GTE: new code_1._Code(">="),
      LT: new code_1._Code("<"),
      LTE: new code_1._Code("<="),
      EQ: new code_1._Code("==="),
      NEQ: new code_1._Code("!=="),
      NOT: new code_1._Code("!"),
      OR: new code_1._Code("||"),
      AND: new code_1._Code("&&"),
      ADD: new code_1._Code("+")
    };
    var Node = class {
      optimizeNodes() {
        return this;
      }
      optimizeNames(_names, _constants) {
        return this;
      }
    };
    var Def = class extends Node {
      constructor(varKind, name, rhs) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.rhs = rhs;
      }
      render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (!names[this.name.str])
          return;
        if (this.rhs)
          this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
      }
    };
    var Assign = class extends Node {
      constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
      }
      render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
          return;
        this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names, this.rhs);
      }
    };
    var AssignOp = class extends Assign {
      constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
      }
      render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
      }
    };
    var Label = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        return `${this.label}:` + _n;
      }
    };
    var Break = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
      }
    };
    var Throw = class extends Node {
      constructor(error) {
        super();
        this.error = error;
      }
      render({ _n }) {
        return `throw ${this.error};` + _n;
      }
      get names() {
        return this.error.names;
      }
    };
    var AnyCode = class extends Node {
      constructor(code) {
        super();
        this.code = code;
      }
      render({ _n }) {
        return `${this.code};` + _n;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(names, constants) {
        this.code = optimizeExpr(this.code, names, constants);
        return this;
      }
      get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
      }
    };
    var ParentNode = class extends Node {
      constructor(nodes = []) {
        super();
        this.nodes = nodes;
      }
      render(opts) {
        return this.nodes.reduce((code, n) => code + n.render(opts), "");
      }
      optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i].optimizeNodes();
          if (Array.isArray(n))
            nodes.splice(i, 1, ...n);
          else if (n)
            nodes[i] = n;
          else
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      optimizeNames(names, constants) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i];
          if (n.optimizeNames(names, constants))
            continue;
          subtractNames(names, n.names);
          nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((names, n) => addNames(names, n.names), {});
      }
    };
    var BlockNode = class extends ParentNode {
      render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
      }
    };
    var Root = class extends ParentNode {
    };
    var Else = class extends BlockNode {
    };
    Else.kind = "else";
    var If = class _If extends BlockNode {
      constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
      }
      render(opts) {
        let code = `if(${this.condition})` + super.render(opts);
        if (this.else)
          code += "else " + this.else.render(opts);
        return code;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
          return this.nodes;
        let e = this.else;
        if (e) {
          const ns = e.optimizeNodes();
          e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
          if (cond === false)
            return e instanceof _If ? e : e.nodes;
          if (this.nodes.length)
            return this;
          return new _If(not(cond), e instanceof _If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
          return void 0;
        return this;
      }
      optimizeNames(names, constants) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        if (!(super.optimizeNames(names, constants) || this.else))
          return;
        this.condition = optimizeExpr(this.condition, names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        addExprNames(names, this.condition);
        if (this.else)
          addNames(names, this.else.names);
        return names;
      }
    };
    If.kind = "if";
    var For = class extends BlockNode {
    };
    For.kind = "for";
    var ForLoop = class extends For {
      constructor(iteration) {
        super();
        this.iteration = iteration;
      }
      render(opts) {
        return `for(${this.iteration})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iteration = optimizeExpr(this.iteration, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iteration.names);
      }
    };
    var ForRange = class extends For {
      constructor(varKind, name, from, to) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.from = from;
        this.to = to;
      }
      render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name, from, to } = this;
        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
      }
      get names() {
        const names = addExprNames(super.names, this.from);
        return addExprNames(names, this.to);
      }
    };
    var ForIter = class extends For {
      constructor(loop, varKind, name, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name;
        this.iterable = iterable;
      }
      render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iterable = optimizeExpr(this.iterable, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iterable.names);
      }
    };
    var Func = class extends BlockNode {
      constructor(name, args, async) {
        super();
        this.name = name;
        this.args = args;
        this.async = async;
      }
      render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
      }
    };
    Func.kind = "func";
    var Return = class extends ParentNode {
      render(opts) {
        return "return " + super.render(opts);
      }
    };
    Return.kind = "return";
    var Try = class extends BlockNode {
      render(opts) {
        let code = "try" + super.render(opts);
        if (this.catch)
          code += this.catch.render(opts);
        if (this.finally)
          code += this.finally.render(opts);
        return code;
      }
      optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
      }
      optimizeNames(names, constants) {
        var _a, _b;
        super.optimizeNames(names, constants);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        if (this.catch)
          addNames(names, this.catch.names);
        if (this.finally)
          addNames(names, this.finally.names);
        return names;
      }
    };
    var Catch = class extends BlockNode {
      constructor(error) {
        super();
        this.error = error;
      }
      render(opts) {
        return `catch(${this.error})` + super.render(opts);
      }
    };
    Catch.kind = "catch";
    var Finally = class extends BlockNode {
      render(opts) {
        return "finally" + super.render(opts);
      }
    };
    Finally.kind = "finally";
    var CodeGen = class {
      constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(prefix) {
        return this._scope.name(prefix);
      }
      // reserves unique name in the external scope
      scopeName(prefix) {
        return this._extScope.name(prefix);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(prefixOrName, value2) {
        const name = this._extScope.value(prefixOrName, value2);
        const vs = this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set());
        vs.add(name);
        return name;
      }
      getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(varKind, nameOrPrefix, rhs, constant) {
        const name = this._scope.toName(nameOrPrefix);
        if (rhs !== void 0 && constant)
          this._constants[name.str] = rhs;
        this._leafNode(new Def(varKind, name, rhs));
        return name;
      }
      // `const` declaration (`var` in es5 mode)
      const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
      }
      // `var` declaration with optional assignment
      var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
      }
      // assignment code
      assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
      }
      // `+=` code
      add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
      }
      // appends passed SafeExpr to code or executes Block
      code(c) {
        if (typeof c == "function")
          c();
        else if (c !== code_1.nil)
          this._leafNode(new AnyCode(c));
        return this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...keyValues) {
        const code = ["{"];
        for (const [key, value2] of keyValues) {
          if (code.length > 1)
            code.push(",");
          code.push(key);
          if (key !== value2 || this.opts.es5) {
            code.push(":");
            (0, code_1.addCodeArg)(code, value2);
          }
        }
        code.push("}");
        return new code_1._Code(code);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
          this.code(thenBody).else().code(elseBody).endIf();
        } else if (thenBody) {
          this.code(thenBody).endIf();
        } else if (elseBody) {
          throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(condition) {
        return this._elseNode(new If(condition));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new Else());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(If, Else);
      }
      _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
          this.code(forBody).endFor();
        return this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
      }
      // `for` statement for a range of values
      forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
          const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
          return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
            this.var(name, (0, code_1._)`${arr}[${i}]`);
            forBody(name);
          });
        }
        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
          return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
        }
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(For);
      }
      // `label` statement
      label(label) {
        return this._leafNode(new Label(label));
      }
      // `break` statement
      break(label) {
        return this._leafNode(new Break(label));
      }
      // `return` statement
      return(value2) {
        const node = new Return();
        this._blockNode(node);
        this.code(value2);
        if (node.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node.finally = new Finally();
          this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
      }
      // `throw` statement
      throw(error) {
        return this._leafNode(new Throw(error));
      }
      // start self-balancing block
      block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
          this.code(body).endBlock(nodeCount);
        return this;
      }
      // end the current self-balancing block
      endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
          throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(name, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name, args, async));
        if (funcBody)
          this.code(funcBody).endFunc();
        return this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(Func);
      }
      optimize(n = 1) {
        while (n-- > 0) {
          this._root.optimizeNodes();
          this._root.optimizeNames(this._root.names, this._constants);
        }
      }
      _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
      }
      _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
      }
    };
    exports.CodeGen = CodeGen;
    function addNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) + (from[n] || 0);
      return names;
    }
    function addExprNames(names, from) {
      return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
    }
    function optimizeExpr(expr, names, constants) {
      if (expr instanceof code_1.Name)
        return replaceName(expr);
      if (!canOptimize(expr))
        return expr;
      return new code_1._Code(expr._items.reduce((items, c) => {
        if (c instanceof code_1.Name)
          c = replaceName(c);
        if (c instanceof code_1._Code)
          items.push(...c._items);
        else
          items.push(c);
        return items;
      }, []));
      function replaceName(n) {
        const c = constants[n.str];
        if (c === void 0 || names[n.str] !== 1)
          return n;
        delete names[n.str];
        return c;
      }
      function canOptimize(e) {
        return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== void 0);
      }
    }
    function subtractNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) - (from[n] || 0);
    }
    function not(x) {
      return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
    }
    exports.not = not;
    var andCode = mappend(exports.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports.and = and;
    var orCode = mappend(exports.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports.or = or;
    function mappend(op) {
      return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
    }
    function par(x) {
      return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
    }
  }
});

// node_modules/ajv/dist/compile/util.js
var require_util = __commonJS({
  "node_modules/ajv/dist/compile/util.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = void 0;
    var codegen_1 = require_codegen();
    var code_1 = require_code();
    function toHash(arr) {
      const hash = {};
      for (const item of arr)
        hash[item] = true;
      return hash;
    }
    exports.toHash = toHash;
    function alwaysValidSchema(it, schema) {
      if (typeof schema == "boolean")
        return schema;
      if (Object.keys(schema).length === 0)
        return true;
      checkUnknownRules(it, schema);
      return !schemaHasRules(schema, it.self.RULES.all);
    }
    exports.alwaysValidSchema = alwaysValidSchema;
    function checkUnknownRules(it, schema = it.schema) {
      const { opts, self } = it;
      if (!opts.strictSchema)
        return;
      if (typeof schema === "boolean")
        return;
      const rules = self.RULES.keywords;
      for (const key in schema) {
        if (!rules[key])
          checkStrictMode(it, `unknown keyword: "${key}"`);
      }
    }
    exports.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema, rules) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (rules[key])
          return true;
      return false;
    }
    exports.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema, RULES) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (key !== "$ref" && RULES.all[key])
          return true;
      return false;
    }
    exports.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
      if (!$data) {
        if (typeof schema == "number" || typeof schema == "boolean")
          return schema;
        if (typeof schema == "string")
          return (0, codegen_1._)`${schema}`;
      }
      return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
    }
    exports.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str) {
      return unescapeJsonPointer(decodeURIComponent(str));
    }
    exports.unescapeFragment = unescapeFragment;
    function escapeFragment(str) {
      return encodeURIComponent(escapeJsonPointer(str));
    }
    exports.escapeFragment = escapeFragment;
    function escapeJsonPointer(str) {
      if (typeof str == "number")
        return `${str}`;
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str) {
      return str.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports.unescapeJsonPointer = unescapeJsonPointer;
    function eachItem(xs, f) {
      if (Array.isArray(xs)) {
        for (const x of xs)
          f(x);
      } else {
        f(xs);
      }
    }
    exports.eachItem = eachItem;
    function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
      return (gen, from, to, toName) => {
        const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
      };
    }
    exports.mergeEvaluated = {
      props: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
          gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
        }),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
          if (from === true) {
            gen.assign(to, true);
          } else {
            gen.assign(to, (0, codegen_1._)`${to} || {}`);
            setEvaluated(gen, to, from);
          }
        }),
        mergeValues: (from, to) => from === true ? true : { ...from, ...to },
        resultToName: evaluatedPropsToName
      }),
      items: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
        mergeValues: (from, to) => from === true ? true : Math.max(from, to),
        resultToName: (gen, items) => gen.var("items", items)
      })
    };
    function evaluatedPropsToName(gen, ps) {
      if (ps === true)
        return gen.var("props", true);
      const props = gen.var("props", (0, codegen_1._)`{}`);
      if (ps !== void 0)
        setEvaluated(gen, props, ps);
      return props;
    }
    exports.evaluatedPropsToName = evaluatedPropsToName;
    function setEvaluated(gen, props, ps) {
      Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
    }
    exports.setEvaluated = setEvaluated;
    var snippets = {};
    function useFunc(gen, f) {
      return gen.scopeValue("func", {
        ref: f,
        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
      });
    }
    exports.useFunc = useFunc;
    var Type;
    (function(Type2) {
      Type2[Type2["Num"] = 0] = "Num";
      Type2[Type2["Str"] = 1] = "Str";
    })(Type || (exports.Type = Type = {}));
    function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
      if (dataProp instanceof codegen_1.Name) {
        const isNumber = dataPropType === Type.Num;
        return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
      }
      return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
    }
    exports.getErrorPath = getErrorPath;
    function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
      if (!mode)
        return;
      msg = `strict mode: ${msg}`;
      if (mode === true)
        throw new Error(msg);
      it.self.logger.warn(msg);
    }
    exports.checkStrictMode = checkStrictMode;
  }
});

// node_modules/ajv/dist/compile/names.js
var require_names = __commonJS({
  "node_modules/ajv/dist/compile/names.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var names = {
      // validation function arguments
      data: new codegen_1.Name("data"),
      // data passed to validation function
      // args passed from referencing schema
      valCxt: new codegen_1.Name("valCxt"),
      // validation/data context - should not be used directly, it is destructured to the names below
      instancePath: new codegen_1.Name("instancePath"),
      parentData: new codegen_1.Name("parentData"),
      parentDataProperty: new codegen_1.Name("parentDataProperty"),
      rootData: new codegen_1.Name("rootData"),
      // root data - same as the data passed to the first/top validation function
      dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
      // used to support recursiveRef and dynamicRef
      // function scoped variables
      vErrors: new codegen_1.Name("vErrors"),
      // null or array of validation errors
      errors: new codegen_1.Name("errors"),
      // counter of validation errors
      this: new codegen_1.Name("this"),
      // "globals"
      self: new codegen_1.Name("self"),
      scope: new codegen_1.Name("scope"),
      // JTD serialize/parse name for JSON string and position
      json: new codegen_1.Name("json"),
      jsonPos: new codegen_1.Name("jsonPos"),
      jsonLen: new codegen_1.Name("jsonLen"),
      jsonPart: new codegen_1.Name("jsonPart")
    };
    exports.default = names;
  }
});

// node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS({
  "node_modules/ajv/dist/compile/errors.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    exports.keywordError = {
      message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
    };
    exports.keyword$DataError = {
      message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports.reportError = reportError;
    function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
      if (errsCount === void 0)
        throw new Error("ajv implementation error");
      const err = gen.name("err");
      gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
        if (it.opts.verbose) {
          gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
          gen.assign((0, codegen_1._)`${err}.data`, data);
        }
      });
    }
    exports.extendErrors = extendErrors;
    function addError(gen, errObj) {
      const err = gen.const("err", errObj);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
      gen.code((0, codegen_1._)`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
      const { gen, validateName, schemaEnv } = it;
      if (schemaEnv.$async) {
        gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
        gen.return(false);
      }
    }
    var E = {
      keyword: new codegen_1.Name("keyword"),
      schemaPath: new codegen_1.Name("schemaPath"),
      // also used in JTD errors
      params: new codegen_1.Name("params"),
      propertyName: new codegen_1.Name("propertyName"),
      message: new codegen_1.Name("message"),
      schema: new codegen_1.Name("schema"),
      parentSchema: new codegen_1.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
      const { createErrors } = cxt.it;
      if (createErrors === false)
        return (0, codegen_1._)`{}`;
      return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {}) {
      const { gen, it } = cxt;
      const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths)
      ];
      extraErrorProps(cxt, error, keyValues);
      return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath }, { instancePath }) {
      const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
      return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
    }
    function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
      let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
      if (schemaPath) {
        schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
      }
      return [E.schemaPath, schPath];
    }
    function extraErrorProps(cxt, { params, message }, keyValues) {
      const { keyword, data, schemaValue, it } = cxt;
      const { opts, propertyName, topSchemaRef, schemaPath } = it;
      keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
      if (opts.messages) {
        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
      }
      if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
      }
      if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
    }
  }
});

// node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = __commonJS({
  "node_modules/ajv/dist/compile/validate/boolSchema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = void 0;
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var boolError = {
      message: "boolean schema is false"
    };
    function topBoolOrEmptySchema(it) {
      const { gen, schema, validateName } = it;
      if (schema === false) {
        falseSchemaError(it, false);
      } else if (typeof schema == "object" && schema.$async === true) {
        gen.return(names_1.default.data);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, null);
        gen.return(true);
      }
    }
    exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
      const { gen, schema } = it;
      if (schema === false) {
        gen.var(valid, false);
        falseSchemaError(it);
      } else {
        gen.var(valid, true);
      }
    }
    exports.boolOrEmptySchema = boolOrEmptySchema;
    function falseSchemaError(it, overrideAllErrors) {
      const { gen, data } = it;
      const cxt = {
        gen,
        keyword: "false schema",
        data,
        schema: false,
        schemaCode: false,
        schemaValue: false,
        params: {},
        it
      };
      (0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
    }
  }
});

// node_modules/ajv/dist/compile/rules.js
var require_rules = __commonJS({
  "node_modules/ajv/dist/compile/rules.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getRules = exports.isJSONType = void 0;
    var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
    var jsonTypes = new Set(_jsonTypes);
    function isJSONType(x) {
      return typeof x == "string" && jsonTypes.has(x);
    }
    exports.isJSONType = isJSONType;
    function getRules() {
      const groups = {
        number: { type: "number", rules: [] },
        string: { type: "string", rules: [] },
        array: { type: "array", rules: [] },
        object: { type: "object", rules: [] }
      };
      return {
        types: { ...groups, integer: true, boolean: true, null: true },
        rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
        post: { rules: [] },
        all: {},
        keywords: {}
      };
    }
    exports.getRules = getRules;
  }
});

// node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS({
  "node_modules/ajv/dist/compile/validate/applicability.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = void 0;
    function schemaHasRulesForType({ schema, self }, type) {
      const group = self.RULES.types[type];
      return group && group !== true && shouldUseGroup(schema, group);
    }
    exports.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema, group) {
      return group.rules.some((rule) => shouldUseRule(schema, rule));
    }
    exports.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema, rule) {
      var _a;
      return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
    }
    exports.shouldUseRule = shouldUseRule;
  }
});

// node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS({
  "node_modules/ajv/dist/compile/validate/dataType.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = void 0;
    var rules_1 = require_rules();
    var applicability_1 = require_applicability();
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var DataType;
    (function(DataType2) {
      DataType2[DataType2["Correct"] = 0] = "Correct";
      DataType2[DataType2["Wrong"] = 1] = "Wrong";
    })(DataType || (exports.DataType = DataType = {}));
    function getSchemaTypes(schema) {
      const types = getJSONTypes(schema.type);
      const hasNull = types.includes("null");
      if (hasNull) {
        if (schema.nullable === false)
          throw new Error("type: null contradicts nullable: false");
      } else {
        if (!types.length && schema.nullable !== void 0) {
          throw new Error('"nullable" cannot be used without "type"');
        }
        if (schema.nullable === true)
          types.push("null");
      }
      return types;
    }
    exports.getSchemaTypes = getSchemaTypes;
    function getJSONTypes(ts) {
      const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
      if (types.every(rules_1.isJSONType))
        return types;
      throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
    }
    exports.getJSONTypes = getJSONTypes;
    function coerceAndCheckDataType(it, types) {
      const { gen, data, opts } = it;
      const coerceTo = coerceToTypes(types, opts.coerceTypes);
      const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
      if (checkTypes) {
        const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
        gen.if(wrongType, () => {
          if (coerceTo.length)
            coerceData(it, types, coerceTo);
          else
            reportTypeError(it);
        });
      }
      return checkTypes;
    }
    exports.coerceAndCheckDataType = coerceAndCheckDataType;
    var COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
    function coerceToTypes(types, coerceTypes) {
      return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
    }
    function coerceData(it, types, coerceTo) {
      const { gen, data, opts } = it;
      const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
      const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
      if (opts.coerceTypes === "array") {
        gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
      }
      gen.if((0, codegen_1._)`${coerced} !== undefined`);
      for (const t of coerceTo) {
        if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
          coerceSpecificType(t);
        }
      }
      gen.else();
      reportTypeError(it);
      gen.endIf();
      gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
        gen.assign(data, coerced);
        assignParentData(it, coerced);
      });
      function coerceSpecificType(t) {
        switch (t) {
          case "string":
            gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
            return;
          case "number":
            gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "integer":
            gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "boolean":
            gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
            return;
          case "null":
            gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
            gen.assign(coerced, null);
            return;
          case "array":
            gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
        }
      }
    }
    function assignParentData({ gen, parentData, parentDataProperty }, expr) {
      gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
    }
    function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
      const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
      let cond;
      switch (dataType) {
        case "null":
          return (0, codegen_1._)`${data} ${EQ} null`;
        case "array":
          cond = (0, codegen_1._)`Array.isArray(${data})`;
          break;
        case "object":
          cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
          break;
        case "integer":
          cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
          break;
        case "number":
          cond = numCond();
          break;
        default:
          return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
      }
      return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
      function numCond(_cond = codegen_1.nil) {
        return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
      }
    }
    exports.checkDataType = checkDataType;
    function checkDataTypes(dataTypes, data, strictNums, correct) {
      if (dataTypes.length === 1) {
        return checkDataType(dataTypes[0], data, strictNums, correct);
      }
      let cond;
      const types = (0, util_1.toHash)(dataTypes);
      if (types.array && types.object) {
        const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
        cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
        delete types.null;
        delete types.array;
        delete types.object;
      } else {
        cond = codegen_1.nil;
      }
      if (types.number)
        delete types.integer;
      for (const t in types)
        cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
      return cond;
    }
    exports.checkDataTypes = checkDataTypes;
    var typeError = {
      message: ({ schema }) => `must be ${schema}`,
      params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
      const cxt = getTypeErrorContext(it);
      (0, errors_1.reportError)(cxt, typeError);
    }
    exports.reportTypeError = reportTypeError;
    function getTypeErrorContext(it) {
      const { gen, data, schema } = it;
      const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
      return {
        gen,
        keyword: "type",
        data,
        schema: schema.type,
        schemaCode,
        schemaValue: schemaCode,
        parentSchema: schema,
        params: {},
        it
      };
    }
  }
});

// node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = __commonJS({
  "node_modules/ajv/dist/compile/validate/defaults.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.assignDefaults = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function assignDefaults(it, ty) {
      const { properties, items } = it.schema;
      if (ty === "object" && properties) {
        for (const key in properties) {
          assignDefault(it, key, properties[key].default);
        }
      } else if (ty === "array" && Array.isArray(items)) {
        items.forEach((sch, i) => assignDefault(it, i, sch.default));
      }
    }
    exports.assignDefaults = assignDefaults;
    function assignDefault(it, prop, defaultValue) {
      const { gen, compositeRule, data, opts } = it;
      if (defaultValue === void 0)
        return;
      const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
      if (compositeRule) {
        (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
        return;
      }
      let condition = (0, codegen_1._)`${childData} === undefined`;
      if (opts.useDefaults === "empty") {
        condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
      }
      gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
    }
  }
});

// node_modules/ajv/dist/vocabularies/code.js
var require_code2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var util_2 = require_util();
    function checkReportMissingProp(cxt, prop) {
      const { gen, data, it } = cxt;
      gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
        cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
        cxt.error();
      });
    }
    exports.checkReportMissingProp = checkReportMissingProp;
    function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
      return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
    }
    exports.checkMissingProp = checkMissingProp;
    function reportMissingProp(cxt, missing) {
      cxt.setParams({ missingProperty: missing }, true);
      cxt.error();
    }
    exports.reportMissingProp = reportMissingProp;
    function hasPropFunc(gen) {
      return gen.scopeValue("func", {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ref: Object.prototype.hasOwnProperty,
        code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
      });
    }
    exports.hasPropFunc = hasPropFunc;
    function isOwnProperty(gen, data, property) {
      return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
    }
    exports.isOwnProperty = isOwnProperty;
    function propertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
      return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
    }
    exports.propertyInData = propertyInData;
    function noPropertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
      return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
    }
    exports.noPropertyInData = noPropertyInData;
    function allSchemaProperties(schemaMap) {
      return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
    }
    exports.allSchemaProperties = allSchemaProperties;
    function schemaProperties(it, schemaMap) {
      return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
    }
    exports.schemaProperties = schemaProperties;
    function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
      const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
      const valCxt = [
        [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
        [names_1.default.parentData, it.parentData],
        [names_1.default.parentDataProperty, it.parentDataProperty],
        [names_1.default.rootData, names_1.default.rootData]
      ];
      if (it.opts.dynamicRef)
        valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
      const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
      return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
    }
    exports.callValidateCode = callValidateCode;
    var newRegExp = (0, codegen_1._)`new RegExp`;
    function usePattern({ gen, it: { opts } }, pattern) {
      const u = opts.unicodeRegExp ? "u" : "";
      const { regExp } = opts.code;
      const rx = regExp(pattern, u);
      return gen.scopeValue("pattern", {
        key: rx.toString(),
        ref: rx,
        code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
      });
    }
    exports.usePattern = usePattern;
    function validateArray(cxt) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      if (it.allErrors) {
        const validArr = gen.let("valid", true);
        validateItems(() => gen.assign(validArr, false));
        return validArr;
      }
      gen.var(valid, true);
      validateItems(() => gen.break());
      return valid;
      function validateItems(notValid) {
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword,
            dataProp: i,
            dataPropType: util_1.Type.Num
          }, valid);
          gen.if((0, codegen_1.not)(valid), notValid);
        });
      }
    }
    exports.validateArray = validateArray;
    function validateUnion(cxt) {
      const { gen, schema, keyword, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
      if (alwaysValid && !it.opts.unevaluated)
        return;
      const valid = gen.let("valid", false);
      const schValid = gen.name("_valid");
      gen.block(() => schema.forEach((_sch, i) => {
        const schCxt = cxt.subschema({
          keyword,
          schemaProp: i,
          compositeRule: true
        }, schValid);
        gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
        const merged = cxt.mergeValidEvaluated(schCxt, schValid);
        if (!merged)
          gen.if((0, codegen_1.not)(valid));
      }));
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
    }
    exports.validateUnion = validateUnion;
  }
});

// node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS({
  "node_modules/ajv/dist/compile/validate/keyword.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var code_1 = require_code2();
    var errors_1 = require_errors();
    function macroKeywordCode(cxt, def) {
      const { gen, keyword, schema, parentSchema, it } = cxt;
      const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
      const schemaRef = useKeyword(gen, keyword, macroSchema);
      if (it.opts.validateSchema !== false)
        it.self.validateSchema(macroSchema, true);
      const valid = gen.name("valid");
      cxt.subschema({
        schema: macroSchema,
        schemaPath: codegen_1.nil,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`,
        topSchemaRef: schemaRef,
        compositeRule: true
      }, valid);
      cxt.pass(valid, () => cxt.error(true));
    }
    exports.macroKeywordCode = macroKeywordCode;
    function funcKeywordCode(cxt, def) {
      var _a;
      const { gen, keyword, schema, parentSchema, $data, it } = cxt;
      checkAsyncKeyword(it, def);
      const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
      const validateRef = useKeyword(gen, keyword, validate);
      const valid = gen.let("valid");
      cxt.block$data(valid, validateKeyword);
      cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
      function validateKeyword() {
        if (def.errors === false) {
          assignValid();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => cxt.error());
        } else {
          const ruleErrs = def.async ? validateAsync() : validateSync();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => addErrs(cxt, ruleErrs));
        }
      }
      function validateAsync() {
        const ruleErrs = gen.let("ruleErrs", null);
        gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
        return ruleErrs;
      }
      function validateSync() {
        const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
        gen.assign(validateErrs, null);
        assignValid(codegen_1.nil);
        return validateErrs;
      }
      function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
        const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
        const passSchema = !("compile" in def && !$data || def.schema === false);
        gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
      }
      function reportErrs(errors) {
        var _a2;
        gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors);
      }
    }
    exports.funcKeywordCode = funcKeywordCode;
    function modifyData(cxt) {
      const { gen, data, it } = cxt;
      gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
    }
    function addErrs(cxt, errs) {
      const { gen } = cxt;
      gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
        (0, errors_1.extendErrors)(cxt);
      }, () => cxt.error());
    }
    function checkAsyncKeyword({ schemaEnv }, def) {
      if (def.async && !schemaEnv.$async)
        throw new Error("async keyword in sync schema");
    }
    function useKeyword(gen, keyword, result) {
      if (result === void 0)
        throw new Error(`keyword "${keyword}" failed to compile`);
      return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
    }
    function validSchemaType(schema, schemaType, allowUndefined = false) {
      return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
    }
    exports.validSchemaType = validSchemaType;
    function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
      if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
        throw new Error("ajv implementation error");
      }
      const deps = def.dependencies;
      if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
      }
      if (def.validateSchema) {
        const valid = def.validateSchema(schema[keyword]);
        if (!valid) {
          const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
          if (opts.validateSchema === "log")
            self.logger.error(msg);
          else
            throw new Error(msg);
        }
      }
    }
    exports.validateKeywordUsage = validateKeywordUsage;
  }
});

// node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS({
  "node_modules/ajv/dist/compile/validate/subschema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
      if (keyword !== void 0 && schema !== void 0) {
        throw new Error('both "keyword" and "schema" passed, only one allowed');
      }
      if (keyword !== void 0) {
        const sch = it.schema[keyword];
        return schemaProp === void 0 ? {
          schema: sch,
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}`
        } : {
          schema: sch[schemaProp],
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
        };
      }
      if (schema !== void 0) {
        if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
          throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
        }
        return {
          schema,
          schemaPath,
          topSchemaRef,
          errSchemaPath
        };
      }
      throw new Error('either "keyword" or "schema" must be passed');
    }
    exports.getSubschema = getSubschema;
    function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
      if (data !== void 0 && dataProp !== void 0) {
        throw new Error('both "data" and "dataProp" passed, only one allowed');
      }
      const { gen } = it;
      if (dataProp !== void 0) {
        const { errorPath, dataPathArr, opts } = it;
        const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
        dataContextProps(nextData);
        subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
        subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
        subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
      }
      if (data !== void 0) {
        const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
        dataContextProps(nextData);
        if (propertyName !== void 0)
          subschema.propertyName = propertyName;
      }
      if (dataTypes)
        subschema.dataTypes = dataTypes;
      function dataContextProps(_nextData) {
        subschema.data = _nextData;
        subschema.dataLevel = it.dataLevel + 1;
        subschema.dataTypes = [];
        it.definedProperties = /* @__PURE__ */ new Set();
        subschema.parentData = it.data;
        subschema.dataNames = [...it.dataNames, _nextData];
      }
    }
    exports.extendSubschemaData = extendSubschemaData;
    function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
      if (compositeRule !== void 0)
        subschema.compositeRule = compositeRule;
      if (createErrors !== void 0)
        subschema.createErrors = createErrors;
      if (allErrors !== void 0)
        subschema.allErrors = allErrors;
      subschema.jtdDiscriminator = jtdDiscriminator;
      subschema.jtdMetadata = jtdMetadata;
    }
    exports.extendSubschemaMode = extendSubschemaMode;
  }
});

// node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "node_modules/fast-deep-equal/index.js"(exports, module) {
    "use strict";
    module.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS({
  "node_modules/json-schema-traverse/index.js"(exports, module) {
    "use strict";
    var traverse = module.exports = function(schema, opts, cb) {
      if (typeof opts == "function") {
        cb = opts;
        opts = {};
      }
      cb = opts.cb || cb;
      var pre = typeof cb == "function" ? cb : cb.pre || function() {
      };
      var post = cb.post || function() {
      };
      _traverse(opts, pre, post, schema, "", schema);
    };
    traverse.keywords = {
      additionalItems: true,
      items: true,
      contains: true,
      additionalProperties: true,
      propertyNames: true,
      not: true,
      if: true,
      then: true,
      else: true
    };
    traverse.arrayKeywords = {
      items: true,
      allOf: true,
      anyOf: true,
      oneOf: true
    };
    traverse.propsKeywords = {
      $defs: true,
      definitions: true,
      properties: true,
      patternProperties: true,
      dependencies: true
    };
    traverse.skipKeywords = {
      default: true,
      enum: true,
      const: true,
      required: true,
      maximum: true,
      minimum: true,
      exclusiveMaximum: true,
      exclusiveMinimum: true,
      multipleOf: true,
      maxLength: true,
      minLength: true,
      pattern: true,
      format: true,
      maxItems: true,
      minItems: true,
      uniqueItems: true,
      maxProperties: true,
      minProperties: true
    };
    function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
      if (schema && typeof schema == "object" && !Array.isArray(schema)) {
        pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        for (var key in schema) {
          var sch = schema[key];
          if (Array.isArray(sch)) {
            if (key in traverse.arrayKeywords) {
              for (var i = 0; i < sch.length; i++)
                _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
            }
          } else if (key in traverse.propsKeywords) {
            if (sch && typeof sch == "object") {
              for (var prop in sch)
                _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
            }
          } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
            _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
          }
        }
        post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      }
    }
    function escapeJsonPtr(str) {
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
  }
});

// node_modules/ajv/dist/compile/resolve.js
var require_resolve = __commonJS({
  "node_modules/ajv/dist/compile/resolve.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = void 0;
    var util_1 = require_util();
    var equal = require_fast_deep_equal();
    var traverse = require_json_schema_traverse();
    var SIMPLE_INLINED = /* @__PURE__ */ new Set([
      "type",
      "format",
      "pattern",
      "maxLength",
      "minLength",
      "maxProperties",
      "minProperties",
      "maxItems",
      "minItems",
      "maximum",
      "minimum",
      "uniqueItems",
      "multipleOf",
      "required",
      "enum",
      "const"
    ]);
    function inlineRef(schema, limit = true) {
      if (typeof schema == "boolean")
        return true;
      if (limit === true)
        return !hasRef(schema);
      if (!limit)
        return false;
      return countKeys(schema) <= limit;
    }
    exports.inlineRef = inlineRef;
    var REF_KEYWORDS = /* @__PURE__ */ new Set([
      "$ref",
      "$recursiveRef",
      "$recursiveAnchor",
      "$dynamicRef",
      "$dynamicAnchor"
    ]);
    function hasRef(schema) {
      for (const key in schema) {
        if (REF_KEYWORDS.has(key))
          return true;
        const sch = schema[key];
        if (Array.isArray(sch) && sch.some(hasRef))
          return true;
        if (typeof sch == "object" && hasRef(sch))
          return true;
      }
      return false;
    }
    function countKeys(schema) {
      let count = 0;
      for (const key in schema) {
        if (key === "$ref")
          return Infinity;
        count++;
        if (SIMPLE_INLINED.has(key))
          continue;
        if (typeof schema[key] == "object") {
          (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
        }
        if (count === Infinity)
          return Infinity;
      }
      return count;
    }
    function getFullPath(resolver, id = "", normalize2) {
      if (normalize2 !== false)
        id = normalizeId(id);
      const p = resolver.parse(id);
      return _getFullPath(resolver, p);
    }
    exports.getFullPath = getFullPath;
    function _getFullPath(resolver, p) {
      const serialized = resolver.serialize(p);
      return serialized.split("#")[0] + "#";
    }
    exports._getFullPath = _getFullPath;
    var TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id) {
      return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
    }
    exports.normalizeId = normalizeId;
    function resolveUrl(resolver, baseId, id) {
      id = normalizeId(id);
      return resolver.resolve(baseId, id);
    }
    exports.resolveUrl = resolveUrl;
    var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
    function getSchemaRefs(schema, baseId) {
      if (typeof schema == "boolean")
        return {};
      const { schemaId, uriResolver } = this.opts;
      const schId = normalizeId(schema[schemaId] || baseId);
      const baseIds = { "": schId };
      const pathPrefix = getFullPath(uriResolver, schId, false);
      const localRefs = {};
      const schemaRefs = /* @__PURE__ */ new Set();
      traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
        if (parentJsonPtr === void 0)
          return;
        const fullPath = pathPrefix + jsonPtr;
        let innerBaseId = baseIds[parentJsonPtr];
        if (typeof sch[schemaId] == "string")
          innerBaseId = addRef.call(this, sch[schemaId]);
        addAnchor.call(this, sch.$anchor);
        addAnchor.call(this, sch.$dynamicAnchor);
        baseIds[jsonPtr] = innerBaseId;
        function addRef(ref) {
          const _resolve = this.opts.uriResolver.resolve;
          ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
          if (schemaRefs.has(ref))
            throw ambiguos(ref);
          schemaRefs.add(ref);
          let schOrRef = this.refs[ref];
          if (typeof schOrRef == "string")
            schOrRef = this.refs[schOrRef];
          if (typeof schOrRef == "object") {
            checkAmbiguosRef(sch, schOrRef.schema, ref);
          } else if (ref !== normalizeId(fullPath)) {
            if (ref[0] === "#") {
              checkAmbiguosRef(sch, localRefs[ref], ref);
              localRefs[ref] = sch;
            } else {
              this.refs[ref] = fullPath;
            }
          }
          return ref;
        }
        function addAnchor(anchor) {
          if (typeof anchor == "string") {
            if (!ANCHOR.test(anchor))
              throw new Error(`invalid anchor "${anchor}"`);
            addRef.call(this, `#${anchor}`);
          }
        }
      });
      return localRefs;
      function checkAmbiguosRef(sch1, sch2, ref) {
        if (sch2 !== void 0 && !equal(sch1, sch2))
          throw ambiguos(ref);
      }
      function ambiguos(ref) {
        return new Error(`reference "${ref}" resolves to more than one schema`);
      }
    }
    exports.getSchemaRefs = getSchemaRefs;
  }
});

// node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS({
  "node_modules/ajv/dist/compile/validate/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getData = exports.KeywordCxt = exports.validateFunctionCode = void 0;
    var boolSchema_1 = require_boolSchema();
    var dataType_1 = require_dataType();
    var applicability_1 = require_applicability();
    var dataType_2 = require_dataType();
    var defaults_1 = require_defaults();
    var keyword_1 = require_keyword();
    var subschema_1 = require_subschema();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var errors_1 = require_errors();
    function validateFunctionCode(it) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          topSchemaObjCode(it);
          return;
        }
      }
      validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
    }
    exports.validateFunctionCode = validateFunctionCode;
    function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
      if (opts.code.es5) {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
          gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
          destructureValCxtES5(gen, opts);
          gen.code(body);
        });
      } else {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
      }
    }
    function destructureValCxt(opts) {
      return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
    }
    function destructureValCxtES5(gen, opts) {
      gen.if(names_1.default.valCxt, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
        gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
      }, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.rootData, names_1.default.data);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
      });
    }
    function topSchemaObjCode(it) {
      const { schema, opts, gen } = it;
      validateFunction(it, () => {
        if (opts.$comment && schema.$comment)
          commentKeyword(it);
        checkNoDefault(it);
        gen.let(names_1.default.vErrors, null);
        gen.let(names_1.default.errors, 0);
        if (opts.unevaluated)
          resetEvaluated(it);
        typeAndKeywords(it);
        returnResults(it);
      });
      return;
    }
    function resetEvaluated(it) {
      const { gen, validateName } = it;
      it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
    }
    function funcSourceUrl(schema, opts) {
      const schId = typeof schema == "object" && schema[opts.schemaId];
      return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
    }
    function subschemaCode(it, valid) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          subSchemaObjCode(it, valid);
          return;
        }
      }
      (0, boolSchema_1.boolOrEmptySchema)(it, valid);
    }
    function schemaCxtHasRules({ schema, self }) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (self.RULES.all[key])
          return true;
      return false;
    }
    function isSchemaObj(it) {
      return typeof it.schema != "boolean";
    }
    function subSchemaObjCode(it, valid) {
      const { schema, gen, opts } = it;
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      updateContext(it);
      checkAsyncSchema(it);
      const errsCount = gen.const("_errs", names_1.default.errors);
      typeAndKeywords(it, errsCount);
      gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
    }
    function checkKeywords(it) {
      (0, util_1.checkUnknownRules)(it);
      checkRefsAndKeywords(it);
    }
    function typeAndKeywords(it, errsCount) {
      if (it.opts.jtd)
        return schemaKeywords(it, [], false, errsCount);
      const types = (0, dataType_1.getSchemaTypes)(it.schema);
      const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
      schemaKeywords(it, types, !checkedTypes, errsCount);
    }
    function checkRefsAndKeywords(it) {
      const { schema, errSchemaPath, opts, self } = it;
      if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
      }
    }
    function checkNoDefault(it) {
      const { schema, opts } = it;
      if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
        (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
      }
    }
    function updateContext(it) {
      const schId = it.schema[it.opts.schemaId];
      if (schId)
        it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
    }
    function checkAsyncSchema(it) {
      if (it.schema.$async && !it.schemaEnv.$async)
        throw new Error("async schema in sync schema");
    }
    function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
      const msg = schema.$comment;
      if (opts.$comment === true) {
        gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
      } else if (typeof opts.$comment == "function") {
        const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
        const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
        gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
      }
    }
    function returnResults(it) {
      const { gen, schemaEnv, validateName, ValidationError, opts } = it;
      if (schemaEnv.$async) {
        gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
        if (opts.unevaluated)
          assignEvaluated(it);
        gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
      }
    }
    function assignEvaluated({ gen, evaluated, props, items }) {
      if (props instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.props`, props);
      if (items instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.items`, items);
    }
    function schemaKeywords(it, types, typeErrors, errsCount) {
      const { gen, schema, data, allErrors, opts, self } = it;
      const { RULES } = self;
      if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
        gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
        return;
      }
      if (!opts.jtd)
        checkStrictTypes(it, types);
      gen.block(() => {
        for (const group of RULES.rules)
          groupKeywords(group);
        groupKeywords(RULES.post);
      });
      function groupKeywords(group) {
        if (!(0, applicability_1.shouldUseGroup)(schema, group))
          return;
        if (group.type) {
          gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
          iterateKeywords(it, group);
          if (types.length === 1 && types[0] === group.type && typeErrors) {
            gen.else();
            (0, dataType_2.reportTypeError)(it);
          }
          gen.endIf();
        } else {
          iterateKeywords(it, group);
        }
        if (!allErrors)
          gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
      }
    }
    function iterateKeywords(it, group) {
      const { gen, schema, opts: { useDefaults } } = it;
      if (useDefaults)
        (0, defaults_1.assignDefaults)(it, group.type);
      gen.block(() => {
        for (const rule of group.rules) {
          if ((0, applicability_1.shouldUseRule)(schema, rule)) {
            keywordCode(it, rule.keyword, rule.definition, group.type);
          }
        }
      });
    }
    function checkStrictTypes(it, types) {
      if (it.schemaEnv.meta || !it.opts.strictTypes)
        return;
      checkContextTypes(it, types);
      if (!it.opts.allowUnionTypes)
        checkMultipleTypes(it, types);
      checkKeywordTypes(it, it.dataTypes);
    }
    function checkContextTypes(it, types) {
      if (!types.length)
        return;
      if (!it.dataTypes.length) {
        it.dataTypes = types;
        return;
      }
      types.forEach((t) => {
        if (!includesType(it.dataTypes, t)) {
          strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
        }
      });
      narrowSchemaTypes(it, types);
    }
    function checkMultipleTypes(it, ts) {
      if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
        strictTypesError(it, "use allowUnionTypes to allow union type keyword");
      }
    }
    function checkKeywordTypes(it, ts) {
      const rules = it.self.RULES.all;
      for (const keyword in rules) {
        const rule = rules[keyword];
        if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
          const { type } = rule.definition;
          if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
            strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
          }
        }
      }
    }
    function hasApplicableType(schTs, kwdT) {
      return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
    }
    function includesType(ts, t) {
      return ts.includes(t) || t === "integer" && ts.includes("number");
    }
    function narrowSchemaTypes(it, withTypes) {
      const ts = [];
      for (const t of it.dataTypes) {
        if (includesType(withTypes, t))
          ts.push(t);
        else if (withTypes.includes("integer") && t === "number")
          ts.push("integer");
      }
      it.dataTypes = ts;
    }
    function strictTypesError(it, msg) {
      const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
      msg += ` at "${schemaPath}" (strictTypes)`;
      (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
    }
    var KeywordCxt = class {
      constructor(it, def, keyword) {
        (0, keyword_1.validateKeywordUsage)(it, def, keyword);
        this.gen = it.gen;
        this.allErrors = it.allErrors;
        this.keyword = keyword;
        this.data = it.data;
        this.schema = it.schema[keyword];
        this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
        this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
        this.schemaType = def.schemaType;
        this.parentSchema = it.schema;
        this.params = {};
        this.it = it;
        this.def = def;
        if (this.$data) {
          this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
        } else {
          this.schemaCode = this.schemaValue;
          if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
            throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
          }
        }
        if ("code" in def ? def.trackErrors : def.errors !== false) {
          this.errsCount = it.gen.const("_errs", names_1.default.errors);
        }
      }
      result(condition, successAction, failAction) {
        this.failResult((0, codegen_1.not)(condition), successAction, failAction);
      }
      failResult(condition, successAction, failAction) {
        this.gen.if(condition);
        if (failAction)
          failAction();
        else
          this.error();
        if (successAction) {
          this.gen.else();
          successAction();
          if (this.allErrors)
            this.gen.endIf();
        } else {
          if (this.allErrors)
            this.gen.endIf();
          else
            this.gen.else();
        }
      }
      pass(condition, failAction) {
        this.failResult((0, codegen_1.not)(condition), void 0, failAction);
      }
      fail(condition) {
        if (condition === void 0) {
          this.error();
          if (!this.allErrors)
            this.gen.if(false);
          return;
        }
        this.gen.if(condition);
        this.error();
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
      fail$data(condition) {
        if (!this.$data)
          return this.fail(condition);
        const { schemaCode } = this;
        this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
      }
      error(append, errorParams, errorPaths) {
        if (errorParams) {
          this.setParams(errorParams);
          this._error(append, errorPaths);
          this.setParams({});
          return;
        }
        this._error(append, errorPaths);
      }
      _error(append, errorPaths) {
        ;
        (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
      }
      $dataError() {
        (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
      }
      reset() {
        if (this.errsCount === void 0)
          throw new Error('add "trackErrors" to keyword definition');
        (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
      }
      ok(cond) {
        if (!this.allErrors)
          this.gen.if(cond);
      }
      setParams(obj, assign) {
        if (assign)
          Object.assign(this.params, obj);
        else
          this.params = obj;
      }
      block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
        this.gen.block(() => {
          this.check$data(valid, $dataValid);
          codeBlock();
        });
      }
      check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
        if (!this.$data)
          return;
        const { gen, schemaCode, schemaType, def } = this;
        gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
        if (valid !== codegen_1.nil)
          gen.assign(valid, true);
        if (schemaType.length || def.validateSchema) {
          gen.elseIf(this.invalid$data());
          this.$dataError();
          if (valid !== codegen_1.nil)
            gen.assign(valid, false);
        }
        gen.else();
      }
      invalid$data() {
        const { gen, schemaCode, schemaType, def, it } = this;
        return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
        function wrong$DataType() {
          if (schemaType.length) {
            if (!(schemaCode instanceof codegen_1.Name))
              throw new Error("ajv implementation error");
            const st = Array.isArray(schemaType) ? schemaType : [schemaType];
            return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
          }
          return codegen_1.nil;
        }
        function invalid$DataSchema() {
          if (def.validateSchema) {
            const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
            return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
          }
          return codegen_1.nil;
        }
      }
      subschema(appl, valid) {
        const subschema = (0, subschema_1.getSubschema)(this.it, appl);
        (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
        (0, subschema_1.extendSubschemaMode)(subschema, appl);
        const nextContext = { ...this.it, ...subschema, items: void 0, props: void 0 };
        subschemaCode(nextContext, valid);
        return nextContext;
      }
      mergeEvaluated(schemaCxt, toName) {
        const { it, gen } = this;
        if (!it.opts.unevaluated)
          return;
        if (it.props !== true && schemaCxt.props !== void 0) {
          it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
        }
        if (it.items !== true && schemaCxt.items !== void 0) {
          it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
        }
      }
      mergeValidEvaluated(schemaCxt, valid) {
        const { it, gen } = this;
        if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
          gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
          return true;
        }
      }
    };
    exports.KeywordCxt = KeywordCxt;
    function keywordCode(it, keyword, def, ruleType) {
      const cxt = new KeywordCxt(it, def, keyword);
      if ("code" in def) {
        def.code(cxt, ruleType);
      } else if (cxt.$data && def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      } else if ("macro" in def) {
        (0, keyword_1.macroKeywordCode)(cxt, def);
      } else if (def.compile || def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      }
    }
    var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
    var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function getData($data, { dataLevel, dataNames, dataPathArr }) {
      let jsonPointer;
      let data;
      if ($data === "")
        return names_1.default.rootData;
      if ($data[0] === "/") {
        if (!JSON_POINTER.test($data))
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        jsonPointer = $data;
        data = names_1.default.rootData;
      } else {
        const matches = RELATIVE_JSON_POINTER.exec($data);
        if (!matches)
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        const up = +matches[1];
        jsonPointer = matches[2];
        if (jsonPointer === "#") {
          if (up >= dataLevel)
            throw new Error(errorMsg("property/index", up));
          return dataPathArr[dataLevel - up];
        }
        if (up > dataLevel)
          throw new Error(errorMsg("data", up));
        data = dataNames[dataLevel - up];
        if (!jsonPointer)
          return data;
      }
      let expr = data;
      const segments = jsonPointer.split("/");
      for (const segment of segments) {
        if (segment) {
          data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
          expr = (0, codegen_1._)`${expr} && ${data}`;
        }
      }
      return expr;
      function errorMsg(pointerType, up) {
        return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
      }
    }
    exports.getData = getData;
  }
});

// node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS({
  "node_modules/ajv/dist/runtime/validation_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ValidationError = class extends Error {
      constructor(errors) {
        super("validation failed");
        this.errors = errors;
        this.ajv = this.validation = true;
      }
    };
    exports.default = ValidationError;
  }
});

// node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS({
  "node_modules/ajv/dist/compile/ref_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var resolve_1 = require_resolve();
    var MissingRefError = class extends Error {
      constructor(resolver, baseId, ref, msg) {
        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
      }
    };
    exports.default = MissingRefError;
  }
});

// node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS({
  "node_modules/ajv/dist/compile/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = void 0;
    var codegen_1 = require_codegen();
    var validation_error_1 = require_validation_error();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var validate_1 = require_validate();
    var SchemaEnv = class {
      constructor(env) {
        var _a;
        this.refs = {};
        this.dynamicAnchors = {};
        let schema;
        if (typeof env.schema == "object")
          schema = env.schema;
        this.schema = env.schema;
        this.schemaId = env.schemaId;
        this.root = env.root || this;
        this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
        this.schemaPath = env.schemaPath;
        this.localRefs = env.localRefs;
        this.meta = env.meta;
        this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
        this.refs = {};
      }
    };
    exports.SchemaEnv = SchemaEnv;
    function compileSchema(sch) {
      const _sch = getCompilingSchema.call(this, sch);
      if (_sch)
        return _sch;
      const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
      const { es5, lines } = this.opts.code;
      const { ownProperties } = this.opts;
      const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
      let _ValidationError;
      if (sch.$async) {
        _ValidationError = gen.scopeValue("Error", {
          ref: validation_error_1.default,
          code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
        });
      }
      const validateName = gen.scopeName("validate");
      sch.validateName = validateName;
      const schemaCxt = {
        gen,
        allErrors: this.opts.allErrors,
        data: names_1.default.data,
        parentData: names_1.default.parentData,
        parentDataProperty: names_1.default.parentDataProperty,
        dataNames: [names_1.default.data],
        dataPathArr: [codegen_1.nil],
        // TODO can its length be used as dataLevel if nil is removed?
        dataLevel: 0,
        dataTypes: [],
        definedProperties: /* @__PURE__ */ new Set(),
        topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
        validateName,
        ValidationError: _ValidationError,
        schema: sch.schema,
        schemaEnv: sch,
        rootId,
        baseId: sch.baseId || rootId,
        schemaPath: codegen_1.nil,
        errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
        errorPath: (0, codegen_1._)`""`,
        opts: this.opts,
        self: this
      };
      let sourceCode;
      try {
        this._compilations.add(sch);
        (0, validate_1.validateFunctionCode)(schemaCxt);
        gen.optimize(this.opts.code.optimize);
        const validateCode = gen.toString();
        sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
        if (this.opts.code.process)
          sourceCode = this.opts.code.process(sourceCode, sch);
        const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
        const validate = makeValidate(this, this.scope.get());
        this.scope.value(validateName, { ref: validate });
        validate.errors = null;
        validate.schema = sch.schema;
        validate.schemaEnv = sch;
        if (sch.$async)
          validate.$async = true;
        if (this.opts.code.source === true) {
          validate.source = { validateName, validateCode, scopeValues: gen._values };
        }
        if (this.opts.unevaluated) {
          const { props, items } = schemaCxt;
          validate.evaluated = {
            props: props instanceof codegen_1.Name ? void 0 : props,
            items: items instanceof codegen_1.Name ? void 0 : items,
            dynamicProps: props instanceof codegen_1.Name,
            dynamicItems: items instanceof codegen_1.Name
          };
          if (validate.source)
            validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
        }
        sch.validate = validate;
        return sch;
      } catch (e) {
        delete sch.validate;
        delete sch.validateName;
        if (sourceCode)
          this.logger.error("Error compiling schema, function code:", sourceCode);
        throw e;
      } finally {
        this._compilations.delete(sch);
      }
    }
    exports.compileSchema = compileSchema;
    function resolveRef(root, baseId, ref) {
      var _a;
      ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
      const schOrFunc = root.refs[ref];
      if (schOrFunc)
        return schOrFunc;
      let _sch = resolve.call(this, root, ref);
      if (_sch === void 0) {
        const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
        const { schemaId } = this.opts;
        if (schema)
          _sch = new SchemaEnv({ schema, schemaId, root, baseId });
      }
      if (_sch === void 0)
        return;
      return root.refs[ref] = inlineOrCompile.call(this, _sch);
    }
    exports.resolveRef = resolveRef;
    function inlineOrCompile(sch) {
      if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
        return sch.schema;
      return sch.validate ? sch : compileSchema.call(this, sch);
    }
    function getCompilingSchema(schEnv) {
      for (const sch of this._compilations) {
        if (sameSchemaEnv(sch, schEnv))
          return sch;
      }
    }
    exports.getCompilingSchema = getCompilingSchema;
    function sameSchemaEnv(s1, s2) {
      return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
    }
    function resolve(root, ref) {
      let sch;
      while (typeof (sch = this.refs[ref]) == "string")
        ref = sch;
      return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
    }
    function resolveSchema(root, ref) {
      const p = this.opts.uriResolver.parse(ref);
      const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
      let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
      if (Object.keys(root.schema).length > 0 && refPath === baseId) {
        return getJsonPointer.call(this, p, root);
      }
      const id = (0, resolve_1.normalizeId)(refPath);
      const schOrRef = this.refs[id] || this.schemas[id];
      if (typeof schOrRef == "string") {
        const sch = resolveSchema.call(this, root, schOrRef);
        if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
          return;
        return getJsonPointer.call(this, p, sch);
      }
      if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
        return;
      if (!schOrRef.validate)
        compileSchema.call(this, schOrRef);
      if (id === (0, resolve_1.normalizeId)(ref)) {
        const { schema } = schOrRef;
        const { schemaId } = this.opts;
        const schId = schema[schemaId];
        if (schId)
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        return new SchemaEnv({ schema, schemaId, root, baseId });
      }
      return getJsonPointer.call(this, p, schOrRef);
    }
    exports.resolveSchema = resolveSchema;
    var PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
      "properties",
      "patternProperties",
      "enum",
      "dependencies",
      "definitions"
    ]);
    function getJsonPointer(parsedRef, { baseId, schema, root }) {
      var _a;
      if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
        return;
      for (const part of parsedRef.fragment.slice(1).split("/")) {
        if (typeof schema === "boolean")
          return;
        const partSchema = schema[(0, util_1.unescapeFragment)(part)];
        if (partSchema === void 0)
          return;
        schema = partSchema;
        const schId = typeof schema === "object" && schema[this.opts.schemaId];
        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        }
      }
      let env;
      if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
        env = resolveSchema.call(this, root, $ref);
      }
      const { schemaId } = this.opts;
      env = env || new SchemaEnv({ schema, schemaId, root, baseId });
      if (env.schema !== env.root.schema)
        return env;
      return void 0;
    }
  }
});

// node_modules/ajv/dist/refs/data.json
var require_data = __commonJS({
  "node_modules/ajv/dist/refs/data.json"(exports, module) {
    module.exports = {
      $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
      description: "Meta-schema for $data reference (JSON AnySchema extension proposal)",
      type: "object",
      required: ["$data"],
      properties: {
        $data: {
          type: "string",
          anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }]
        }
      },
      additionalProperties: false
    };
  }
});

// node_modules/fast-uri/lib/utils.js
var require_utils = __commonJS({
  "node_modules/fast-uri/lib/utils.js"(exports, module) {
    "use strict";
    var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
    var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
    var isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
    var isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
    var isPathCharacter = RegExp.prototype.test.bind(/^[\da-z\-._~!$&'()*+,;=:@/]$/iu);
    function stringArrayToHexStripped(input) {
      let acc = "";
      let code = 0;
      let i = 0;
      for (i = 0; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (code === 48) {
          continue;
        }
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
        break;
      }
      for (i += 1; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
      }
      return acc;
    }
    var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
    function consumeIsZone(buffer) {
      buffer.length = 0;
      return true;
    }
    function consumeHextets(buffer, address, output) {
      if (buffer.length) {
        const hex = stringArrayToHexStripped(buffer);
        if (hex !== "") {
          address.push(hex);
        } else {
          output.error = true;
          return false;
        }
        buffer.length = 0;
      }
      return true;
    }
    function getIPV6(input) {
      let tokenCount = 0;
      const output = { error: false, address: "", zone: "" };
      const address = [];
      const buffer = [];
      let endipv6Encountered = false;
      let endIpv6 = false;
      let consume = consumeHextets;
      for (let i = 0; i < input.length; i++) {
        const cursor = input[i];
        if (cursor === "[" || cursor === "]") {
          continue;
        }
        if (cursor === ":") {
          if (endipv6Encountered === true) {
            endIpv6 = true;
          }
          if (!consume(buffer, address, output)) {
            break;
          }
          if (++tokenCount > 7) {
            output.error = true;
            break;
          }
          if (i > 0 && input[i - 1] === ":") {
            endipv6Encountered = true;
          }
          address.push(":");
          continue;
        } else if (cursor === "%") {
          if (!consume(buffer, address, output)) {
            break;
          }
          consume = consumeIsZone;
        } else {
          buffer.push(cursor);
          continue;
        }
      }
      if (buffer.length) {
        if (consume === consumeIsZone) {
          output.zone = buffer.join("");
        } else if (endIpv6) {
          address.push(buffer.join(""));
        } else {
          address.push(stringArrayToHexStripped(buffer));
        }
      }
      output.address = address.join("");
      return output;
    }
    function normalizeIPv6(host) {
      if (findToken(host, ":") < 2) {
        return { host, isIPV6: false };
      }
      const ipv6 = getIPV6(host);
      if (!ipv6.error) {
        let newHost = ipv6.address;
        let escapedHost = ipv6.address;
        if (ipv6.zone) {
          newHost += "%" + ipv6.zone;
          escapedHost += "%25" + ipv6.zone;
        }
        return { host: newHost, isIPV6: true, escapedHost };
      } else {
        return { host, isIPV6: false };
      }
    }
    function findToken(str, token) {
      let ind = 0;
      for (let i = 0; i < str.length; i++) {
        if (str[i] === token) ind++;
      }
      return ind;
    }
    function removeDotSegments(path) {
      let input = path;
      const output = [];
      let nextSlash = -1;
      let len = 0;
      while (len = input.length) {
        if (len === 1) {
          if (input === ".") {
            break;
          } else if (input === "/") {
            output.push("/");
            break;
          } else {
            output.push(input);
            break;
          }
        } else if (len === 2) {
          if (input[0] === ".") {
            if (input[1] === ".") {
              break;
            } else if (input[1] === "/") {
              input = input.slice(2);
              continue;
            }
          } else if (input[0] === "/") {
            if (input[1] === "." || input[1] === "/") {
              output.push("/");
              break;
            }
          }
        } else if (len === 3) {
          if (input === "/..") {
            if (output.length !== 0) {
              output.pop();
            }
            output.push("/");
            break;
          }
        }
        if (input[0] === ".") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(3);
              continue;
            }
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(2);
              continue;
            } else if (input[2] === ".") {
              if (input[3] === "/") {
                input = input.slice(3);
                if (output.length !== 0) {
                  output.pop();
                }
                continue;
              }
            }
          }
        }
        if ((nextSlash = input.indexOf("/", 1)) === -1) {
          output.push(input);
          break;
        } else {
          output.push(input.slice(0, nextSlash));
          input = input.slice(nextSlash);
        }
      }
      return output.join("");
    }
    var HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
    var HOST_DELIM_RE = /[@/?#:]/g;
    var HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
    function reescapeHostDelimiters(host, isIP) {
      const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
      re.lastIndex = 0;
      return host.replace(re, (ch) => HOST_DELIMS[ch]);
    }
    function normalizePercentEncoding(input, decodeUnreserved = false) {
      if (input.indexOf("%") === -1) {
        return input;
      }
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decodeUnreserved && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        output += input[i];
      }
      return output;
    }
    function normalizePathEncoding(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decoded !== "." && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        if (isPathCharacter(input[i])) {
          output += input[i];
        } else {
          output += escape(input[i]);
        }
      }
      return output;
    }
    function escapePreservingEscapes(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        output += escape(input[i]);
      }
      return output;
    }
    function recomposeAuthority(component) {
      const uriTokens = [];
      if (component.userinfo !== void 0) {
        uriTokens.push(component.userinfo);
        uriTokens.push("@");
      }
      if (component.host !== void 0) {
        let host = unescape(component.host);
        if (!isIPv4(host)) {
          const ipV6res = normalizeIPv6(host);
          if (ipV6res.isIPV6 === true) {
            host = `[${ipV6res.escapedHost}]`;
          } else {
            host = reescapeHostDelimiters(host, false);
          }
        }
        uriTokens.push(host);
      }
      if (typeof component.port === "number" || typeof component.port === "string") {
        uriTokens.push(":");
        uriTokens.push(String(component.port));
      }
      return uriTokens.length ? uriTokens.join("") : void 0;
    }
    module.exports = {
      nonSimpleDomain,
      recomposeAuthority,
      reescapeHostDelimiters,
      normalizePercentEncoding,
      normalizePathEncoding,
      escapePreservingEscapes,
      removeDotSegments,
      isIPv4,
      isUUID,
      normalizeIPv6,
      stringArrayToHexStripped
    };
  }
});

// node_modules/fast-uri/lib/schemes.js
var require_schemes = __commonJS({
  "node_modules/fast-uri/lib/schemes.js"(exports, module) {
    "use strict";
    var { isUUID } = require_utils();
    var URN_REG = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu;
    var supportedSchemeNames = (
      /** @type {const} */
      [
        "http",
        "https",
        "ws",
        "wss",
        "urn",
        "urn:uuid"
      ]
    );
    function isValidSchemeName(name) {
      return supportedSchemeNames.indexOf(
        /** @type {*} */
        name
      ) !== -1;
    }
    function wsIsSecure(wsComponent) {
      if (wsComponent.secure === true) {
        return true;
      } else if (wsComponent.secure === false) {
        return false;
      } else if (wsComponent.scheme) {
        return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
      } else {
        return false;
      }
    }
    function httpParse(component) {
      if (!component.host) {
        component.error = component.error || "HTTP URIs must have a host.";
      }
      return component;
    }
    function httpSerialize(component) {
      const secure = String(component.scheme).toLowerCase() === "https";
      if (component.port === (secure ? 443 : 80) || component.port === "") {
        component.port = void 0;
      }
      if (!component.path) {
        component.path = "/";
      }
      return component;
    }
    function wsParse(wsComponent) {
      wsComponent.secure = wsIsSecure(wsComponent);
      wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
      wsComponent.path = void 0;
      wsComponent.query = void 0;
      return wsComponent;
    }
    function wsSerialize(wsComponent) {
      if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
        wsComponent.port = void 0;
      }
      if (typeof wsComponent.secure === "boolean") {
        wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
        wsComponent.secure = void 0;
      }
      if (wsComponent.resourceName) {
        const [path, query] = wsComponent.resourceName.split("?");
        wsComponent.path = path && path !== "/" ? path : void 0;
        wsComponent.query = query;
        wsComponent.resourceName = void 0;
      }
      wsComponent.fragment = void 0;
      return wsComponent;
    }
    function urnParse(urnComponent, options) {
      if (!urnComponent.path) {
        urnComponent.error = "URN can not be parsed";
        return urnComponent;
      }
      const matches = urnComponent.path.match(URN_REG);
      if (matches) {
        const scheme = options.scheme || urnComponent.scheme || "urn";
        urnComponent.nid = matches[1].toLowerCase();
        urnComponent.nss = matches[2];
        const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
        const schemeHandler = getSchemeHandler(urnScheme);
        urnComponent.path = void 0;
        if (schemeHandler) {
          urnComponent = schemeHandler.parse(urnComponent, options);
        }
      } else {
        urnComponent.error = urnComponent.error || "URN can not be parsed.";
      }
      return urnComponent;
    }
    function urnSerialize(urnComponent, options) {
      if (urnComponent.nid === void 0) {
        throw new Error("URN without nid cannot be serialized");
      }
      const scheme = options.scheme || urnComponent.scheme || "urn";
      const nid = urnComponent.nid.toLowerCase();
      const urnScheme = `${scheme}:${options.nid || nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      if (schemeHandler) {
        urnComponent = schemeHandler.serialize(urnComponent, options);
      }
      const uriComponent = urnComponent;
      const nss = urnComponent.nss;
      uriComponent.path = `${nid || options.nid}:${nss}`;
      options.skipEscape = true;
      return uriComponent;
    }
    function urnuuidParse(urnComponent, options) {
      const uuidComponent = urnComponent;
      uuidComponent.uuid = uuidComponent.nss;
      uuidComponent.nss = void 0;
      if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
        uuidComponent.error = uuidComponent.error || "UUID is not valid.";
      }
      return uuidComponent;
    }
    function urnuuidSerialize(uuidComponent) {
      const urnComponent = uuidComponent;
      urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
      return urnComponent;
    }
    var http = (
      /** @type {SchemeHandler} */
      {
        scheme: "http",
        domainHost: true,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var https = (
      /** @type {SchemeHandler} */
      {
        scheme: "https",
        domainHost: http.domainHost,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var ws = (
      /** @type {SchemeHandler} */
      {
        scheme: "ws",
        domainHost: true,
        parse: wsParse,
        serialize: wsSerialize
      }
    );
    var wss = (
      /** @type {SchemeHandler} */
      {
        scheme: "wss",
        domainHost: ws.domainHost,
        parse: ws.parse,
        serialize: ws.serialize
      }
    );
    var urn = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn",
        parse: urnParse,
        serialize: urnSerialize,
        skipNormalize: true
      }
    );
    var urnuuid = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn:uuid",
        parse: urnuuidParse,
        serialize: urnuuidSerialize,
        skipNormalize: true
      }
    );
    var SCHEMES = (
      /** @type {Record<SchemeName, SchemeHandler>} */
      {
        http,
        https,
        ws,
        wss,
        urn,
        "urn:uuid": urnuuid
      }
    );
    Object.setPrototypeOf(SCHEMES, null);
    function getSchemeHandler(scheme) {
      return scheme && (SCHEMES[
        /** @type {SchemeName} */
        scheme
      ] || SCHEMES[
        /** @type {SchemeName} */
        scheme.toLowerCase()
      ]) || void 0;
    }
    module.exports = {
      wsIsSecure,
      SCHEMES,
      isValidSchemeName,
      getSchemeHandler
    };
  }
});

// node_modules/fast-uri/index.js
var require_fast_uri = __commonJS({
  "node_modules/fast-uri/index.js"(exports, module) {
    "use strict";
    var { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, escapePreservingEscapes, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = require_utils();
    var { SCHEMES, getSchemeHandler } = require_schemes();
    function normalize2(uri, options) {
      if (typeof uri === "string") {
        uri = /** @type {T} */
        normalizeString(uri, options);
      } else if (typeof uri === "object") {
        uri = /** @type {T} */
        parse(serialize(uri, options), options);
      }
      return uri;
    }
    function resolve(baseURI, relativeURI, options) {
      const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
      const { parsed: baseParsed, malformedAuthorityOrPort: baseMalformed } = parseWithStatus(baseURI, schemelessOptions);
      const { parsed: relativeParsed, malformedAuthorityOrPort: relativeMalformed } = parseWithStatus(relativeURI, schemelessOptions);
      if (baseMalformed || relativeMalformed) {
        throw new Error(baseParsed.error || relativeParsed.error || "URI is malformed.");
      }
      const resolved = resolveComponent(baseParsed, relativeParsed, schemelessOptions, true);
      schemelessOptions.skipEscape = true;
      return serialize(resolved, schemelessOptions);
    }
    function resolveComponent(base, relative, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse(serialize(base, options), options);
        relative = parse(serialize(relative, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative.scheme) {
        target.scheme = relative.scheme;
        target.userinfo = relative.userinfo;
        target.host = relative.host;
        target.port = relative.port;
        target.path = removeDotSegments(relative.path || "");
        target.query = relative.query;
      } else {
        if (relative.userinfo !== void 0 || relative.host !== void 0 || relative.port !== void 0) {
          target.userinfo = relative.userinfo;
          target.host = relative.host;
          target.port = relative.port;
          target.path = removeDotSegments(relative.path || "");
          target.query = relative.query;
        } else {
          if (!relative.path) {
            target.path = base.path;
            if (relative.query !== void 0) {
              target.query = relative.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative.path[0] === "/") {
              target.path = removeDotSegments(relative.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative.path;
              } else if (!base.path) {
                target.path = relative.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative.fragment;
      return target;
    }
    function equal(uriA, uriB, options) {
      const normalizedA = normalizeComparableURI(uriA, options);
      const normalizedB = normalizeComparableURI(uriB, options);
      return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA.toLowerCase() === normalizedB.toLowerCase();
    }
    function serialize(cmpts, opts) {
      const component = {
        host: cmpts.host,
        scheme: cmpts.scheme,
        userinfo: cmpts.userinfo,
        port: cmpts.port,
        path: cmpts.path,
        query: cmpts.query,
        nid: cmpts.nid,
        nss: cmpts.nss,
        uuid: cmpts.uuid,
        fragment: cmpts.fragment,
        reference: cmpts.reference,
        resourceName: cmpts.resourceName,
        secure: cmpts.secure,
        error: ""
      };
      const options = Object.assign({}, opts);
      const uriTokens = [];
      const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
      if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
      if (component.path !== void 0) {
        if (!options.skipEscape) {
          component.path = escapePreservingEscapes(component.path);
          if (component.scheme !== void 0) {
            component.path = component.path.split("%3A").join(":");
          }
        } else {
          component.path = normalizePercentEncoding(component.path);
        }
      }
      if (options.reference !== "suffix" && component.scheme) {
        uriTokens.push(component.scheme, ":");
      }
      const authority = recomposeAuthority(component);
      if (authority !== void 0) {
        if (options.reference !== "suffix") {
          uriTokens.push("//");
        }
        uriTokens.push(authority);
        if (component.path && component.path[0] !== "/") {
          uriTokens.push("/");
        }
      }
      if (component.path !== void 0) {
        let s = component.path;
        if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
          s = removeDotSegments(s);
        }
        if (authority === void 0 && s[0] === "/" && s[1] === "/") {
          s = "/%2F" + s.slice(2);
        }
        uriTokens.push(s);
      }
      if (component.query !== void 0) {
        uriTokens.push("?", component.query);
      }
      if (component.fragment !== void 0) {
        uriTokens.push("#", component.fragment);
      }
      return uriTokens.join("");
    }
    var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
    var AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
    var AUTHORITY_INTRODUCER_REGION = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
    function getParseError(parsed, matches) {
      if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") {
        return 'URI path must start with "/" when authority is present.';
      }
      if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
        return "URI port is malformed.";
      }
      return void 0;
    }
    function parseWithStatus(uri, opts) {
      const options = Object.assign({}, opts);
      const parsed = {
        scheme: void 0,
        userinfo: void 0,
        host: "",
        port: void 0,
        path: "",
        query: void 0,
        fragment: void 0
      };
      let malformedAuthorityOrPort = false;
      let isIP = false;
      if (options.reference === "suffix") {
        if (options.scheme) {
          uri = options.scheme + ":" + uri;
        } else {
          uri = "//" + uri;
        }
      }
      const authorityMatch = uri.match(AUTHORITY_PREFIX);
      if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
        parsed.error = "URI authority must not contain a literal backslash.";
        malformedAuthorityOrPort = true;
      }
      const introducerMatch = uri.match(AUTHORITY_INTRODUCER_REGION);
      if (introducerMatch !== null) {
        const region = introducerMatch[1];
        const normalizedRegion = region.replace(/[\t\n\r]/g, "");
        if (normalizedRegion.length >= 2) {
          if (normalizedRegion.slice(0, 2) !== "//") {
            parsed.error = parsed.error || "URI authority must not contain a literal backslash.";
            malformedAuthorityOrPort = true;
          } else if (region.length !== normalizedRegion.length) {
            parsed.error = parsed.error || "URI authority introducer must not contain whitespace.";
            malformedAuthorityOrPort = true;
          }
        }
      }
      const matches = uri.match(URI_PARSE);
      if (matches) {
        parsed.scheme = matches[1];
        parsed.userinfo = matches[3];
        parsed.host = matches[4];
        parsed.port = parseInt(matches[5], 10);
        parsed.path = matches[6] || "";
        parsed.query = matches[7];
        parsed.fragment = matches[8];
        if (isNaN(parsed.port)) {
          parsed.port = matches[5];
        }
        const parseError = getParseError(parsed, matches);
        if (parseError !== void 0) {
          parsed.error = parsed.error || parseError;
          malformedAuthorityOrPort = true;
        }
        if (parsed.host) {
          const ipv4result = isIPv4(parsed.host);
          if (ipv4result === false) {
            const ipv6result = normalizeIPv6(parsed.host);
            parsed.host = ipv6result.host.toLowerCase();
            isIP = ipv6result.isIPV6;
          } else {
            isIP = true;
          }
        }
        if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
          parsed.reference = "same-document";
        } else if (parsed.scheme === void 0) {
          parsed.reference = "relative";
        } else if (parsed.fragment === void 0) {
          parsed.reference = "absolute";
        } else {
          parsed.reference = "uri";
        }
        if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
          parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
        }
        const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
        if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport)) {
          if (parsed.host && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
            try {
              parsed.host = new URL("http://" + parsed.host).hostname;
            } catch (e) {
              parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
            }
          }
        }
        if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
          if (uri.indexOf("%") !== -1) {
            if (parsed.scheme !== void 0) {
              parsed.scheme = unescape(parsed.scheme);
            }
            if (parsed.host !== void 0) {
              parsed.host = reescapeHostDelimiters(unescape(parsed.host), isIP);
            }
          }
          if (parsed.path) {
            parsed.path = normalizePathEncoding(parsed.path);
          }
          if (parsed.fragment) {
            try {
              parsed.fragment = encodeURI(decodeURIComponent(parsed.fragment));
            } catch {
              parsed.error = parsed.error || "URI malformed";
            }
          }
        }
        if (schemeHandler && schemeHandler.parse) {
          schemeHandler.parse(parsed, options);
        }
      } else {
        parsed.error = parsed.error || "URI can not be parsed.";
      }
      return { parsed, malformedAuthorityOrPort };
    }
    function parse(uri, opts) {
      return parseWithStatus(uri, opts).parsed;
    }
    function normalizeString(uri, opts) {
      return normalizeStringWithStatus(uri, opts).normalized;
    }
    function normalizeStringWithStatus(uri, opts) {
      const { parsed, malformedAuthorityOrPort } = parseWithStatus(uri, opts);
      return {
        normalized: malformedAuthorityOrPort ? uri : serialize(parsed, opts),
        malformedAuthorityOrPort
      };
    }
    function normalizeComparableURI(uri, opts) {
      if (typeof uri === "string") {
        const { normalized, malformedAuthorityOrPort } = normalizeStringWithStatus(uri, opts);
        return malformedAuthorityOrPort ? void 0 : normalized;
      }
      if (typeof uri === "object") {
        return serialize(uri, opts);
      }
    }
    var fastUri = {
      SCHEMES,
      normalize: normalize2,
      resolve,
      resolveComponent,
      equal,
      serialize,
      parse
    };
    module.exports = fastUri;
    module.exports.default = fastUri;
    module.exports.fastUri = fastUri;
  }
});

// node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS({
  "node_modules/ajv/dist/runtime/uri.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var uri = require_fast_uri();
    uri.code = 'require("ajv/dist/runtime/uri").default';
    exports.default = uri;
  }
});

// node_modules/ajv/dist/core.js
var require_core = __commonJS({
  "node_modules/ajv/dist/core.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    var ref_error_1 = require_ref_error();
    var rules_1 = require_rules();
    var compile_1 = require_compile();
    var codegen_2 = require_codegen();
    var resolve_1 = require_resolve();
    var dataType_1 = require_dataType();
    var util_1 = require_util();
    var $dataRefSchema = require_data();
    var uri_1 = require_uri();
    var defaultRegExp = (str, flags) => new RegExp(str, flags);
    defaultRegExp.code = "new RegExp";
    var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
    var EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]);
    var removedOptions = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    };
    var deprecatedOptions = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    var MAX_EXPRESSION = 200;
    function requiredOptions(o) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
      const s = o.strict;
      const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
      const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
      const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
      const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
      return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver
      };
    }
    var Ajv = class {
      constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = /* @__PURE__ */ Object.create(null);
        this._compilations = /* @__PURE__ */ new Set();
        this._loading = {};
        this._cache = /* @__PURE__ */ new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
          addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
          addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
          this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data, meta, schemaId } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId === "id") {
          _dataRefSchema = { ...$dataRefSchema };
          _dataRefSchema.id = _dataRefSchema.$id;
          delete _dataRefSchema.$id;
        }
        if (meta && $data)
          this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
      }
      defaultMeta() {
        const { meta, schemaId } = this.opts;
        return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
      }
      validate(schemaKeyRef, data) {
        let v;
        if (typeof schemaKeyRef == "string") {
          v = this.getSchema(schemaKeyRef);
          if (!v)
            throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        } else {
          v = this.compile(schemaKeyRef);
        }
        const valid = v(data);
        if (!("$async" in v))
          this.errors = v.errors;
        return valid;
      }
      compile(schema, _meta) {
        const sch = this._addSchema(schema, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema } = this.opts;
        return runCompileAsync.call(this, schema, meta);
        async function runCompileAsync(_schema, _meta) {
          await loadMetaSchema.call(this, _schema.$schema);
          const sch = this._addSchema(_schema, _meta);
          return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
          if ($ref && !this.getSchema($ref)) {
            await runCompileAsync.call(this, { $ref }, true);
          }
        }
        async function _compileAsync(sch) {
          try {
            return this._compileSchemaEnv(sch);
          } catch (e) {
            if (!(e instanceof ref_error_1.default))
              throw e;
            checkLoaded.call(this, e);
            await loadMissingSchema.call(this, e.missingSchema);
            return _compileAsync.call(this, sch);
          }
        }
        function checkLoaded({ missingSchema: ref, missingRef }) {
          if (this.refs[ref]) {
            throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
          }
        }
        async function loadMissingSchema(ref) {
          const _schema = await _loadSchema.call(this, ref);
          if (!this.refs[ref])
            await loadMetaSchema.call(this, _schema.$schema);
          if (!this.refs[ref])
            this.addSchema(_schema, ref, meta);
        }
        async function _loadSchema(ref) {
          const p = this._loading[ref];
          if (p)
            return p;
          try {
            return await (this._loading[ref] = loadSchema(ref));
          } finally {
            delete this._loading[ref];
          }
        }
      }
      // Adds schema to the instance
      addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema)) {
          for (const sch of schema)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id;
        if (typeof schema === "object") {
          const { schemaId } = this.opts;
          id = schema[schemaId];
          if (id !== void 0 && typeof id != "string") {
            throw new Error(`schema ${schemaId} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema, throwOrLogError) {
        if (typeof schema == "boolean")
          return true;
        let $schema;
        $schema = schema.$schema;
        if ($schema !== void 0 && typeof $schema != "string") {
          throw new Error("$schema must be a string");
        }
        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid = this.validate($schema, schema);
        if (!valid && throwOrLogError) {
          const message = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(message);
          else
            throw new Error(message);
        }
        return valid;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
          keyRef = sch;
        if (sch === void 0) {
          const { schemaId } = this.opts;
          const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
          sch = compile_1.resolveSchema.call(this, root, keyRef);
          if (!sch)
            return;
          this.refs[keyRef] = sch;
        }
        return sch.validate || this._compileSchemaEnv(sch);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
          this._removeAllSchemas(this.schemas, schemaKeyRef);
          this._removeAllSchemas(this.refs, schemaKeyRef);
          return this;
        }
        switch (typeof schemaKeyRef) {
          case "undefined":
            this._removeAllSchemas(this.schemas);
            this._removeAllSchemas(this.refs);
            this._cache.clear();
            return this;
          case "string": {
            const sch = getSchEnv.call(this, schemaKeyRef);
            if (typeof sch == "object")
              this._cache.delete(sch.schema);
            delete this.schemas[schemaKeyRef];
            delete this.refs[schemaKeyRef];
            return this;
          }
          case "object": {
            const cacheKey = schemaKeyRef;
            this._cache.delete(cacheKey);
            let id = schemaKeyRef[this.opts.schemaId];
            if (id) {
              id = (0, resolve_1.normalizeId)(id);
              delete this.schemas[id];
              delete this.refs[id];
            }
            return this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(definitions) {
        for (const def of definitions)
          this.addKeyword(def);
        return this;
      }
      addKeyword(kwdOrDef, def) {
        let keyword;
        if (typeof kwdOrDef == "string") {
          keyword = kwdOrDef;
          if (typeof def == "object") {
            this.logger.warn("these parameters are deprecated, see docs for addKeyword");
            def.keyword = keyword;
          }
        } else if (typeof kwdOrDef == "object" && def === void 0) {
          def = kwdOrDef;
          keyword = def.keyword;
          if (Array.isArray(keyword) && !keyword.length) {
            throw new Error("addKeywords: keyword must be string or non-empty array");
          }
        } else {
          throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword, def);
        if (!def) {
          (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
          return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
          ...def,
          type: (0, dataType_1.getJSONTypes)(def.type),
          schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
        };
        (0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
      }
      getKeyword(keyword) {
        const rule = this.RULES.all[keyword];
        return typeof rule == "object" ? rule.definition : !!rule;
      }
      // Remove keyword
      removeKeyword(keyword) {
        const { RULES } = this;
        delete RULES.keywords[keyword];
        delete RULES.all[keyword];
        for (const group of RULES.rules) {
          const i = group.rules.findIndex((rule) => rule.keyword === keyword);
          if (i >= 0)
            group.rules.splice(i, 1);
        }
        return this;
      }
      // Add format
      addFormat(name, format) {
        if (typeof format == "string")
          format = new RegExp(format);
        this.formats[name] = format;
        return this;
      }
      errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
        if (!errors || errors.length === 0)
          return "No errors";
        return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text3, msg) => text3 + separator + msg);
      }
      $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
          const segments = jsonPointer.split("/").slice(1);
          let keywords = metaSchema;
          for (const seg of segments)
            keywords = keywords[seg];
          for (const key in rules) {
            const rule = rules[key];
            if (typeof rule != "object")
              continue;
            const { $data } = rule.definition;
            const schema = keywords[key];
            if ($data && schema)
              keywords[key] = schemaOrData(schema);
          }
        }
        return metaSchema;
      }
      _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
          const sch = schemas[keyRef];
          if (!regex || regex.test(keyRef)) {
            if (typeof sch == "string") {
              delete schemas[keyRef];
            } else if (sch && !sch.meta) {
              this._cache.delete(sch.schema);
              delete schemas[keyRef];
            }
          }
        }
      }
      _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id;
        const { schemaId } = this.opts;
        if (typeof schema == "object") {
          id = schema[schemaId];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
        sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema)
          this.validateSchema(schema, true);
        return sch;
      }
      _checkUnique(id) {
        if (this.schemas[id] || this.refs[id]) {
          throw new Error(`schema with key or id "${id}" already exists`);
        }
      }
      _compileSchemaEnv(sch) {
        if (sch.meta)
          this._compileMetaSchema(sch);
        else
          compile_1.compileSchema.call(this, sch);
        if (!sch.validate)
          throw new Error("ajv implementation error");
        return sch.validate;
      }
      _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
          compile_1.compileSchema.call(this, sch);
        } finally {
          this.opts = currentOpts;
        }
      }
    };
    Ajv.ValidationError = validation_error_1.default;
    Ajv.MissingRefError = ref_error_1.default;
    exports.default = Ajv;
    function checkOptions(checkOpts, options, msg, log = "error") {
      for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
          this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
      }
    }
    function getSchEnv(keyRef) {
      keyRef = (0, resolve_1.normalizeId)(keyRef);
      return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
      const optsSchemas = this.opts.schemas;
      if (!optsSchemas)
        return;
      if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
      else
        for (const key in optsSchemas)
          this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
      for (const name in this.opts.formats) {
        const format = this.opts.formats[name];
        if (format)
          this.addFormat(name, format);
      }
    }
    function addInitialKeywords(defs) {
      if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const keyword in defs) {
        const def = defs[keyword];
        if (!def.keyword)
          def.keyword = keyword;
        this.addKeyword(def);
      }
    }
    function getMetaSchemaOptions() {
      const metaOpts = { ...this.opts };
      for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
      return metaOpts;
    }
    var noLogs = { log() {
    }, warn() {
    }, error() {
    } };
    function getLogger(logger) {
      if (logger === false)
        return noLogs;
      if (logger === void 0)
        return console;
      if (logger.log && logger.warn && logger.error)
        return logger;
      throw new Error("logger must implement log, warn and error methods");
    }
    var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword, def) {
      const { RULES } = this;
      (0, util_1.eachItem)(keyword, (kwd) => {
        if (RULES.keywords[kwd])
          throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
          throw new Error(`Keyword ${kwd} has invalid name`);
      });
      if (!def)
        return;
      if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
    }
    function addRule(keyword, definition, dataType) {
      var _a;
      const post = definition === null || definition === void 0 ? void 0 : definition.post;
      if (dataType && post)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES } = this;
      let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
      if (!ruleGroup) {
        ruleGroup = { type: dataType, rules: [] };
        RULES.rules.push(ruleGroup);
      }
      RULES.keywords[keyword] = true;
      if (!definition)
        return;
      const rule = {
        keyword,
        definition: {
          ...definition,
          type: (0, dataType_1.getJSONTypes)(definition.type),
          schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
        }
      };
      if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule, definition.before);
      else
        ruleGroup.rules.push(rule);
      RULES.all[keyword] = rule;
      (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
    }
    function addBeforeRule(ruleGroup, rule, before) {
      const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
      if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule);
      } else {
        ruleGroup.rules.push(rule);
        this.logger.warn(`rule ${before} is not defined`);
      }
    }
    function keywordMetaschema(def) {
      let { metaSchema } = def;
      if (metaSchema === void 0)
        return;
      if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
      def.validateSchema = this.compile(metaSchema, true);
    }
    var $dataRef = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema) {
      return { anyOf: [schema, $dataRef] };
    }
  }
});

// node_modules/ajv/dist/vocabularies/core/id.js
var require_id = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/id.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var def = {
      keyword: "id",
      code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/ref.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.callRef = exports.getValidate = void 0;
    var ref_error_1 = require_ref_error();
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var util_1 = require_util();
    var def = {
      keyword: "$ref",
      schemaType: "string",
      code(cxt) {
        const { gen, schema: $ref, it } = cxt;
        const { baseId, schemaEnv: env, validateName, opts, self } = it;
        const { root } = env;
        if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
          return callRootRef();
        const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
        if (schOrEnv === void 0)
          throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
        if (schOrEnv instanceof compile_1.SchemaEnv)
          return callValidate(schOrEnv);
        return inlineRefSchema(schOrEnv);
        function callRootRef() {
          if (env === root)
            return callRef(cxt, validateName, env, env.$async);
          const rootName = gen.scopeValue("root", { ref: root });
          return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
        }
        function callValidate(sch) {
          const v = getValidate(cxt, sch);
          callRef(cxt, v, sch, sch.$async);
        }
        function inlineRefSchema(sch) {
          const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
          const valid = gen.name("valid");
          const schCxt = cxt.subschema({
            schema: sch,
            dataTypes: [],
            schemaPath: codegen_1.nil,
            topSchemaRef: schName,
            errSchemaPath: $ref
          }, valid);
          cxt.mergeEvaluated(schCxt);
          cxt.ok(valid);
        }
      }
    };
    function getValidate(cxt, sch) {
      const { gen } = cxt;
      return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
    }
    exports.getValidate = getValidate;
    function callRef(cxt, v, sch, $async) {
      const { gen, it } = cxt;
      const { allErrors, schemaEnv: env, opts } = it;
      const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
      if ($async)
        callAsyncRef();
      else
        callSyncRef();
      function callAsyncRef() {
        if (!env.$async)
          throw new Error("async schema referenced by sync schema");
        const valid = gen.let("valid");
        gen.try(() => {
          gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
          addEvaluatedFrom(v);
          if (!allErrors)
            gen.assign(valid, true);
        }, (e) => {
          gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
          addErrorsFrom(e);
          if (!allErrors)
            gen.assign(valid, false);
        });
        cxt.ok(valid);
      }
      function callSyncRef() {
        cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
      }
      function addErrorsFrom(source) {
        const errs = (0, codegen_1._)`${source}.errors`;
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
        gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      }
      function addEvaluatedFrom(source) {
        var _a;
        if (!it.opts.unevaluated)
          return;
        const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
        if (it.props !== true) {
          if (schEvaluated && !schEvaluated.dynamicProps) {
            if (schEvaluated.props !== void 0) {
              it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
            }
          } else {
            const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
            it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
          }
        }
        if (it.items !== true) {
          if (schEvaluated && !schEvaluated.dynamicItems) {
            if (schEvaluated.items !== void 0) {
              it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
            }
          } else {
            const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
            it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
          }
        }
      }
    }
    exports.callRef = callRef;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var id_1 = require_id();
    var ref_1 = require_ref();
    var core = [
      "$schema",
      "$id",
      "$defs",
      "$vocabulary",
      { keyword: "$comment" },
      "definitions",
      id_1.default,
      ref_1.default
    ];
    exports.default = core;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitNumber.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    var def = {
      keyword: Object.keys(KWDs),
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/multipleOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
      params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
    };
    var def = {
      keyword: "multipleOf",
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, it } = cxt;
        const prec = it.opts.multipleOfPrecision;
        const res = gen.let("res");
        const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
        cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value2;
      while (pos < len) {
        length++;
        value2 = str.charCodeAt(pos++);
        if (value2 >= 55296 && value2 <= 56319 && pos < len) {
          value2 = str.charCodeAt(pos);
          if ((value2 & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitLength.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var ucs2length_1 = require_ucs2length();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxLength" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxLength", "minLength"],
      type: "string",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode, it } = cxt;
        const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
        const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
        cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/pattern.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var util_1 = require_util();
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
    };
    var def = {
      keyword: "pattern",
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const u = it.opts.unicodeRegExp ? "u" : "";
        if ($data) {
          const { regExp } = it.opts.code;
          const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
          const valid = gen.let("valid");
          gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
          cxt.fail$data((0, codegen_1._)`!${valid}`);
        } else {
          const regExp = (0, code_1.usePattern)(cxt, schema);
          cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxProperties" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxProperties", "minProperties"],
      type: "object",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/required.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
      params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
    };
    var def = {
      keyword: "required",
      type: "object",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, schema, schemaCode, data, $data, it } = cxt;
        const { opts } = it;
        if (!$data && schema.length === 0)
          return;
        const useLoop = schema.length >= opts.loopRequired;
        if (it.allErrors)
          allErrorsMode();
        else
          exitOnErrorMode();
        if (opts.strictRequired) {
          const props = cxt.parentSchema.properties;
          const { definedProperties } = cxt.it;
          for (const requiredKey of schema) {
            if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
              const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
              const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
              (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
            }
          }
        }
        function allErrorsMode() {
          if (useLoop || $data) {
            cxt.block$data(codegen_1.nil, loopAllRequired);
          } else {
            for (const prop of schema) {
              (0, code_1.checkReportMissingProp)(cxt, prop);
            }
          }
        }
        function exitOnErrorMode() {
          const missing = gen.let("missing");
          if (useLoop || $data) {
            const valid = gen.let("valid", true);
            cxt.block$data(valid, () => loopUntilMissing(missing, valid));
            cxt.ok(valid);
          } else {
            gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
            (0, code_1.reportMissingProp)(cxt, missing);
            gen.else();
          }
        }
        function loopAllRequired() {
          gen.forOf("prop", schemaCode, (prop) => {
            cxt.setParams({ missingProperty: prop });
            gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
          });
        }
        function loopUntilMissing(missing, valid) {
          cxt.setParams({ missingProperty: missing });
          gen.forOf(missing, schemaCode, () => {
            gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.error();
              gen.break();
            });
          }, codegen_1.nil);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxItems" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxItems", "minItems"],
      type: "array",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "node_modules/ajv/dist/runtime/equal.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports.default = equal;
  }
});

// node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/uniqueItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dataType_1 = require_dataType();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
      params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
    };
    var def = {
      keyword: "uniqueItems",
      type: "array",
      schemaType: "boolean",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
        if (!$data && !schema)
          return;
        const valid = gen.let("valid");
        const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
        cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
        cxt.ok(valid);
        function validateUniqueItems() {
          const i = gen.let("i", (0, codegen_1._)`${data}.length`);
          const j = gen.let("j");
          cxt.setParams({ i, j });
          gen.assign(valid, true);
          gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
        }
        function canOptimize() {
          return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
        }
        function loopN(i, j) {
          const item = gen.name("item");
          const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
          const indices = gen.const("indices", (0, codegen_1._)`{}`);
          gen.for((0, codegen_1._)`;${i}--;`, () => {
            gen.let(item, (0, codegen_1._)`${data}[${i}]`);
            gen.if(wrongType, (0, codegen_1._)`continue`);
            if (itemTypes.length > 1)
              gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
            gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
              gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
              cxt.error();
              gen.assign(valid, false).break();
            }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
          });
        }
        function loopN2(i, j) {
          const eql = (0, util_1.useFunc)(gen, equal_1.default);
          const outer = gen.name("outer");
          gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
            cxt.error();
            gen.assign(valid, false).break(outer);
          })));
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/const.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to constant",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
    };
    var def = {
      keyword: "const",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schemaCode, schema } = cxt;
        if ($data || schema && typeof schema == "object") {
          cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
        } else {
          cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/enum.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to one of the allowed values",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
    };
    var def = {
      keyword: "enum",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        if (!$data && schema.length === 0)
          throw new Error("enum must have non-empty array");
        const useLoop = schema.length >= it.opts.loopEnum;
        let eql;
        const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
        let valid;
        if (useLoop || $data) {
          valid = gen.let("valid");
          cxt.block$data(valid, loopEnum);
        } else {
          if (!Array.isArray(schema))
            throw new Error("ajv implementation error");
          const vSchema = gen.const("vSchema", schemaCode);
          valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
        }
        cxt.pass(valid);
        function loopEnum() {
          gen.assign(valid, false);
          gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
        }
        function equalCode(vSchema, i) {
          const sch = schema[i];
          return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var limitNumber_1 = require_limitNumber();
    var multipleOf_1 = require_multipleOf();
    var limitLength_1 = require_limitLength();
    var pattern_1 = require_pattern();
    var limitProperties_1 = require_limitProperties();
    var required_1 = require_required();
    var limitItems_1 = require_limitItems();
    var uniqueItems_1 = require_uniqueItems();
    var const_1 = require_const();
    var enum_1 = require_enum();
    var validation = [
      // number
      limitNumber_1.default,
      multipleOf_1.default,
      // string
      limitLength_1.default,
      pattern_1.default,
      // object
      limitProperties_1.default,
      required_1.default,
      // array
      limitItems_1.default,
      uniqueItems_1.default,
      // any
      { keyword: "type", schemaType: ["string", "array"] },
      { keyword: "nullable", schemaType: "boolean" },
      const_1.default,
      enum_1.default
    ];
    exports.default = validation;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateAdditionalItems = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "additionalItems",
      type: "array",
      schemaType: ["boolean", "object"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { parentSchema, it } = cxt;
        const { items } = parentSchema;
        if (!Array.isArray(items)) {
          (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
          return;
        }
        validateAdditionalItems(cxt, items);
      }
    };
    function validateAdditionalItems(cxt, items) {
      const { gen, schema, data, keyword, it } = cxt;
      it.items = true;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items.length });
        cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
        cxt.ok(valid);
      }
      function validateItems(valid) {
        gen.forRange("i", items.length, len, (i) => {
          cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
    exports.validateAdditionalItems = validateAdditionalItems;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateTuple = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "array", "boolean"],
      before: "uniqueItems",
      code(cxt) {
        const { schema, it } = cxt;
        if (Array.isArray(schema))
          return validateTuple(cxt, "additionalItems", schema);
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    function validateTuple(cxt, extraItems, schArr = cxt.schema) {
      const { gen, parentSchema, data, keyword, it } = cxt;
      checkStrictTuple(parentSchema);
      if (it.opts.unevaluated && schArr.length && it.items !== true) {
        it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
      }
      const valid = gen.name("valid");
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      schArr.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
          keyword,
          schemaProp: i,
          dataProp: i
        }, valid));
        cxt.ok(valid);
      });
      function checkStrictTuple(sch) {
        const { opts, errSchemaPath } = it;
        const l = schArr.length;
        const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
        if (opts.strictTuples && !fullTuple) {
          const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
          (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
        }
      }
    }
    exports.validateTuple = validateTuple;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/prefixItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var items_1 = require_items();
    var def = {
      keyword: "prefixItems",
      type: "array",
      schemaType: ["array"],
      before: "uniqueItems",
      code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var additionalItems_1 = require_additionalItems();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { schema, parentSchema, it } = cxt;
        const { prefixItems } = parentSchema;
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        if (prefixItems)
          (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
        else
          cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/contains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
      params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
    };
    var def = {
      keyword: "contains",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        let min;
        let max;
        const { minContains, maxContains } = parentSchema;
        if (it.opts.next) {
          min = minContains === void 0 ? 1 : minContains;
          max = maxContains;
        } else {
          min = 1;
        }
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        cxt.setParams({ min, max });
        if (max === void 0 && min === 0) {
          (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
          return;
        }
        if (max !== void 0 && min > max) {
          (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
          cxt.fail();
          return;
        }
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          let cond = (0, codegen_1._)`${len} >= ${min}`;
          if (max !== void 0)
            cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
          cxt.pass(cond);
          return;
        }
        it.items = true;
        const valid = gen.name("valid");
        if (max === void 0 && min === 1) {
          validateItems(valid, () => gen.if(valid, () => gen.break()));
        } else if (min === 0) {
          gen.let(valid, true);
          if (max !== void 0)
            gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
        } else {
          gen.let(valid, false);
          validateItemsWithCount();
        }
        cxt.result(valid, () => cxt.reset());
        function validateItemsWithCount() {
          const schValid = gen.name("_valid");
          const count = gen.let("count", 0);
          validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
        }
        function validateItems(_valid, block) {
          gen.forRange("i", 0, len, (i) => {
            cxt.subschema({
              keyword: "contains",
              dataProp: i,
              dataPropType: util_1.Type.Num,
              compositeRule: true
            }, _valid);
            block();
          });
        }
        function checkLimits(count) {
          gen.code((0, codegen_1._)`${count}++`);
          if (max === void 0) {
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
          } else {
            gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
            if (min === 1)
              gen.assign(valid, true);
            else
              gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependencies.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    exports.error = {
      message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
      },
      params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
      // TODO change to reference
    };
    var def = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: exports.error,
      code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
      }
    };
    function splitDependencies({ schema }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema[key];
      }
      return [propertyDeps, schemaDeps];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
      const { gen, data, it } = cxt;
      if (Object.keys(propertyDeps).length === 0)
        return;
      const missing = gen.let("missing");
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
          continue;
        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", ")
        });
        if (it.allErrors) {
          gen.if(hasProperty, () => {
            for (const depProp of deps) {
              (0, code_1.checkReportMissingProp)(cxt, depProp);
            }
          });
        } else {
          gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
    }
    exports.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
          continue;
        gen.if(
          (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties),
          () => {
            const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
            cxt.mergeValidEvaluated(schCxt, valid);
          },
          () => gen.var(valid, true)
          // TODO var
        );
        cxt.ok(valid);
      }
    }
    exports.validateSchemaDeps = validateSchemaDeps;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/propertyNames.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "property name must be valid",
      params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
    };
    var def = {
      keyword: "propertyNames",
      type: "object",
      schemaType: ["object", "boolean"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        const valid = gen.name("valid");
        gen.forIn("key", data, (key) => {
          cxt.setParams({ propertyName: key });
          cxt.subschema({
            keyword: "propertyNames",
            data: key,
            dataTypes: ["string"],
            propertyName: key,
            compositeRule: true
          }, valid);
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error(true);
            if (!it.allErrors)
              gen.break();
          });
        });
        cxt.ok(valid);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var util_1 = require_util();
    var error = {
      message: "must NOT have additional properties",
      params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
    };
    var def = {
      keyword: "additionalProperties",
      type: ["object"],
      schemaType: ["boolean", "object"],
      allowUndefined: true,
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, opts } = it;
        it.props = true;
        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
          return;
        const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
        const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
        checkAdditionalProperties();
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function checkAdditionalProperties() {
          gen.forIn("key", data, (key) => {
            if (!props.length && !patProps.length)
              additionalPropertyCode(key);
            else
              gen.if(isAdditional(key), () => additionalPropertyCode(key));
          });
        }
        function isAdditional(key) {
          let definedProp;
          if (props.length > 8) {
            const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
            definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
          } else if (props.length) {
            definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
          } else {
            definedProp = codegen_1.nil;
          }
          if (patProps.length) {
            definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
          }
          return (0, codegen_1.not)(definedProp);
        }
        function deleteAdditional(key) {
          gen.code((0, codegen_1._)`delete ${data}[${key}]`);
        }
        function additionalPropertyCode(key) {
          if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
            deleteAdditional(key);
            return;
          }
          if (schema === false) {
            cxt.setParams({ additionalProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            if (opts.removeAdditional === "failing") {
              applyAdditionalSchema(key, valid, false);
              gen.if((0, codegen_1.not)(valid), () => {
                cxt.reset();
                deleteAdditional(key);
              });
            } else {
              applyAdditionalSchema(key, valid);
              if (!allErrors)
                gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          }
        }
        function applyAdditionalSchema(key, valid, errors) {
          const subschema = {
            keyword: "additionalProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          };
          if (errors === false) {
            Object.assign(subschema, {
              compositeRule: true,
              createErrors: false,
              allErrors: false
            });
          }
          cxt.subschema(subschema, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/properties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var validate_1 = require_validate();
    var code_1 = require_code2();
    var util_1 = require_util();
    var additionalProperties_1 = require_additionalProperties();
    var def = {
      keyword: "properties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
          additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
        }
        const allProps = (0, code_1.allSchemaProperties)(schema);
        for (const prop of allProps) {
          it.definedProperties.add(prop);
        }
        if (it.opts.unevaluated && allProps.length && it.props !== true) {
          it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
        }
        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
        if (properties.length === 0)
          return;
        const valid = gen.name("valid");
        for (const prop of properties) {
          if (hasDefault(prop)) {
            applyPropertySchema(prop);
          } else {
            gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
            applyPropertySchema(prop);
            if (!it.allErrors)
              gen.else().var(valid, true);
            gen.endIf();
          }
          cxt.it.definedProperties.add(prop);
          cxt.ok(valid);
        }
        function hasDefault(prop) {
          return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
        }
        function applyPropertySchema(prop) {
          cxt.subschema({
            keyword: "properties",
            schemaProp: prop,
            dataProp: prop
          }, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/patternProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var util_2 = require_util();
    var def = {
      keyword: "patternProperties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, data, parentSchema, it } = cxt;
        const { opts } = it;
        const patterns = (0, code_1.allSchemaProperties)(schema);
        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
        if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
          return;
        }
        const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
        const valid = gen.name("valid");
        if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
          it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
        }
        const { props } = it;
        validatePatternProperties();
        function validatePatternProperties() {
          for (const pat of patterns) {
            if (checkProperties)
              checkMatchingProperties(pat);
            if (it.allErrors) {
              validateProperties(pat);
            } else {
              gen.var(valid, true);
              validateProperties(pat);
              gen.if(valid);
            }
          }
        }
        function checkMatchingProperties(pat) {
          for (const prop in checkProperties) {
            if (new RegExp(pat).test(prop)) {
              (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
            }
          }
        }
        function validateProperties(pat) {
          gen.forIn("key", data, (key) => {
            gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
              const alwaysValid = alwaysValidPatterns.includes(pat);
              if (!alwaysValid) {
                cxt.subschema({
                  keyword: "patternProperties",
                  schemaProp: pat,
                  dataProp: key,
                  dataPropType: util_2.Type.Str
                }, valid);
              }
              if (it.opts.unevaluated && props !== true) {
                gen.assign((0, codegen_1._)`${props}[${key}]`, true);
              } else if (!alwaysValid && !it.allErrors) {
                gen.if((0, codegen_1.not)(valid), () => gen.break());
              }
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/not.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "not",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      code(cxt) {
        const { gen, schema, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          cxt.fail();
          return;
        }
        const valid = gen.name("valid");
        cxt.subschema({
          keyword: "not",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, valid);
        cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
      },
      error: { message: "must NOT be valid" }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/anyOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var def = {
      keyword: "anyOf",
      schemaType: "array",
      trackErrors: true,
      code: code_1.validateUnion,
      error: { message: "must match a schema in anyOf" }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/oneOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "must match exactly one schema in oneOf",
      params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
    };
    var def = {
      keyword: "oneOf",
      schemaType: "array",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        if (it.opts.discriminator && parentSchema.discriminator)
          return;
        const schArr = schema;
        const valid = gen.let("valid", false);
        const passing = gen.let("passing", null);
        const schValid = gen.name("_valid");
        cxt.setParams({ passing });
        gen.block(validateOneOf);
        cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
        function validateOneOf() {
          schArr.forEach((sch, i) => {
            let schCxt;
            if ((0, util_1.alwaysValidSchema)(it, sch)) {
              gen.var(schValid, true);
            } else {
              schCxt = cxt.subschema({
                keyword: "oneOf",
                schemaProp: i,
                compositeRule: true
              }, schValid);
            }
            if (i > 0) {
              gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
            }
            gen.if(schValid, () => {
              gen.assign(valid, true);
              gen.assign(passing, i);
              if (schCxt)
                cxt.mergeEvaluated(schCxt, codegen_1.Name);
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/allOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "allOf",
      schemaType: "array",
      code(cxt) {
        const { gen, schema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const valid = gen.name("valid");
        schema.forEach((sch, i) => {
          if ((0, util_1.alwaysValidSchema)(it, sch))
            return;
          const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
          cxt.ok(valid);
          cxt.mergeEvaluated(schCxt);
        });
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/if.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
      params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
    };
    var def = {
      keyword: "if",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, parentSchema, it } = cxt;
        if (parentSchema.then === void 0 && parentSchema.else === void 0) {
          (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
        }
        const hasThen = hasSchema(it, "then");
        const hasElse = hasSchema(it, "else");
        if (!hasThen && !hasElse)
          return;
        const valid = gen.let("valid", true);
        const schValid = gen.name("_valid");
        validateIf();
        cxt.reset();
        if (hasThen && hasElse) {
          const ifClause = gen.let("ifClause");
          cxt.setParams({ ifClause });
          gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
        } else if (hasThen) {
          gen.if(schValid, validateClause("then"));
        } else {
          gen.if((0, codegen_1.not)(schValid), validateClause("else"));
        }
        cxt.pass(valid, () => cxt.error(true));
        function validateIf() {
          const schCxt = cxt.subschema({
            keyword: "if",
            compositeRule: true,
            createErrors: false,
            allErrors: false
          }, schValid);
          cxt.mergeEvaluated(schCxt);
        }
        function validateClause(keyword, ifClause) {
          return () => {
            const schCxt = cxt.subschema({ keyword }, schValid);
            gen.assign(valid, schValid);
            cxt.mergeValidEvaluated(schCxt, valid);
            if (ifClause)
              gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
            else
              cxt.setParams({ ifClause: keyword });
          };
        }
      }
    };
    function hasSchema(it, keyword) {
      const schema = it.schema[keyword];
      return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
    }
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/thenElse.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["then", "else"],
      schemaType: ["object", "boolean"],
      code({ keyword, parentSchema, it }) {
        if (parentSchema.if === void 0)
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var additionalItems_1 = require_additionalItems();
    var prefixItems_1 = require_prefixItems();
    var items_1 = require_items();
    var items2020_1 = require_items2020();
    var contains_1 = require_contains();
    var dependencies_1 = require_dependencies();
    var propertyNames_1 = require_propertyNames();
    var additionalProperties_1 = require_additionalProperties();
    var properties_1 = require_properties();
    var patternProperties_1 = require_patternProperties();
    var not_1 = require_not();
    var anyOf_1 = require_anyOf();
    var oneOf_1 = require_oneOf();
    var allOf_1 = require_allOf();
    var if_1 = require_if();
    var thenElse_1 = require_thenElse();
    function getApplicator(draft2020 = false) {
      const applicator = [
        // any
        not_1.default,
        anyOf_1.default,
        oneOf_1.default,
        allOf_1.default,
        if_1.default,
        thenElse_1.default,
        // object
        propertyNames_1.default,
        additionalProperties_1.default,
        dependencies_1.default,
        properties_1.default,
        patternProperties_1.default
      ];
      if (draft2020)
        applicator.push(prefixItems_1.default, items2020_1.default);
      else
        applicator.push(additionalItems_1.default, items_1.default);
      applicator.push(contains_1.default);
      return applicator;
    }
    exports.default = getApplicator;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js
var require_dynamicAnchor = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicAnchor = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicAnchor",
      schemaType: "string",
      code: (cxt) => dynamicAnchor(cxt, cxt.schema)
    };
    function dynamicAnchor(cxt, anchor) {
      const { gen, it } = cxt;
      it.schemaEnv.root.dynamicAnchors[anchor] = true;
      const v = (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
      const validate = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
      gen.if((0, codegen_1._)`!${v}`, () => gen.assign(v, validate));
    }
    exports.dynamicAnchor = dynamicAnchor;
    function _getValidate(cxt) {
      const { schemaEnv, schema, self } = cxt.it;
      const { root, baseId, localRefs, meta } = schemaEnv.root;
      const { schemaId } = self.opts;
      const sch = new compile_1.SchemaEnv({ schema, schemaId, root, baseId, localRefs, meta });
      compile_1.compileSchema.call(self, sch);
      return (0, ref_1.getValidate)(cxt, sch);
    }
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js
var require_dynamicRef = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicRef = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicRef",
      schemaType: "string",
      code: (cxt) => dynamicRef(cxt, cxt.schema)
    };
    function dynamicRef(cxt, ref) {
      const { gen, keyword, it } = cxt;
      if (ref[0] !== "#")
        throw new Error(`"${keyword}" only supports hash fragment reference`);
      const anchor = ref.slice(1);
      if (it.allErrors) {
        _dynamicRef();
      } else {
        const valid = gen.let("valid", false);
        _dynamicRef(valid);
        cxt.ok(valid);
      }
      function _dynamicRef(valid) {
        if (it.schemaEnv.root.dynamicAnchors[anchor]) {
          const v = gen.let("_v", (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
          gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
        } else {
          _callRef(it.validateName, valid)();
        }
      }
      function _callRef(validate, valid) {
        return valid ? () => gen.block(() => {
          (0, ref_1.callRef)(cxt, validate);
          gen.let(valid, true);
        }) : () => (0, ref_1.callRef)(cxt, validate);
      }
    }
    exports.dynamicRef = dynamicRef;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js
var require_recursiveAnchor = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var util_1 = require_util();
    var def = {
      keyword: "$recursiveAnchor",
      schemaType: "boolean",
      code(cxt) {
        if (cxt.schema)
          (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
        else
          (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js
var require_recursiveRef = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicRef_1 = require_dynamicRef();
    var def = {
      keyword: "$recursiveRef",
      schemaType: "string",
      code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/index.js
var require_dynamic = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var dynamicRef_1 = require_dynamicRef();
    var recursiveAnchor_1 = require_recursiveAnchor();
    var recursiveRef_1 = require_recursiveRef();
    var dynamic = [dynamicAnchor_1.default, dynamicRef_1.default, recursiveAnchor_1.default, recursiveRef_1.default];
    exports.default = dynamic;
  }
});

// node_modules/ajv/dist/vocabularies/validation/dependentRequired.js
var require_dependentRequired = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/dependentRequired.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentRequired",
      type: "object",
      schemaType: "object",
      error: dependencies_1.error,
      code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js
var require_dependentSchemas = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentSchemas",
      type: "object",
      schemaType: "object",
      code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitContains.js
var require_limitContains = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitContains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["maxContains", "minContains"],
      type: "array",
      schemaType: "number",
      code({ keyword, parentSchema, it }) {
        if (parentSchema.contains === void 0) {
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "contains" is ignored`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/next.js
var require_next = __commonJS({
  "node_modules/ajv/dist/vocabularies/next.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependentRequired_1 = require_dependentRequired();
    var dependentSchemas_1 = require_dependentSchemas();
    var limitContains_1 = require_limitContains();
    var next = [dependentRequired_1.default, dependentSchemas_1.default, limitContains_1.default];
    exports.default = next;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js
var require_unevaluatedProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var error = {
      message: "must NOT have unevaluated properties",
      params: ({ params }) => (0, codegen_1._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
    };
    var def = {
      keyword: "unevaluatedProperties",
      type: "object",
      schemaType: ["boolean", "object"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, props } = it;
        if (props instanceof codegen_1.Name) {
          gen.if((0, codegen_1._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
        } else if (props !== true) {
          gen.forIn("key", data, (key) => props === void 0 ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
        }
        it.props = true;
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function unevaluatedPropCode(key) {
          if (schema === false) {
            cxt.setParams({ unevaluatedProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (!(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            cxt.subschema({
              keyword: "unevaluatedProperties",
              dataProp: key,
              dataPropType: util_1.Type.Str
            }, valid);
            if (!allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          }
        }
        function unevaluatedDynamic(evaluatedProps, key) {
          return (0, codegen_1._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
        }
        function unevaluatedStatic(evaluatedProps, key) {
          const ps = [];
          for (const p in evaluatedProps) {
            if (evaluatedProps[p] === true)
              ps.push((0, codegen_1._)`${key} !== ${p}`);
          }
          return (0, codegen_1.and)(...ps);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js
var require_unevaluatedItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "unevaluatedItems",
      type: "array",
      schemaType: ["boolean", "object"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        const items = it.items || 0;
        if (items === true)
          return;
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        if (schema === false) {
          cxt.setParams({ len: items });
          cxt.fail((0, codegen_1._)`${len} > ${items}`);
        } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items}`);
          gen.if((0, codegen_1.not)(valid), () => validateItems(valid, items));
          cxt.ok(valid);
        }
        it.items = true;
        function validateItems(valid, from) {
          gen.forRange("i", from, len, (i) => {
            cxt.subschema({ keyword: "unevaluatedItems", dataProp: i, dataPropType: util_1.Type.Num }, valid);
            if (!it.allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/index.js
var require_unevaluated = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var unevaluatedProperties_1 = require_unevaluatedProperties();
    var unevaluatedItems_1 = require_unevaluatedItems();
    var unevaluated = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
    exports.default = unevaluated;
  }
});

// node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/format.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
    };
    var def = {
      keyword: "format",
      type: ["number", "string"],
      schemaType: "string",
      $data: true,
      error,
      code(cxt, ruleType) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const { opts, errSchemaPath, schemaEnv, self } = it;
        if (!opts.validateFormats)
          return;
        if ($data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
          const fType = gen.let("fType");
          const format = gen.let("format");
          gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
          cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
          function unknownFmt() {
            if (opts.strictSchema === false)
              return codegen_1.nil;
            return (0, codegen_1._)`${schemaCode} && !${format}`;
          }
          function invalidFmt() {
            const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
            const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
            return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
          }
        }
        function validateFormat() {
          const formatDef = self.formats[schema];
          if (!formatDef) {
            unknownFormat();
            return;
          }
          if (formatDef === true)
            return;
          const [fmtType, format, fmtRef] = getFormat(formatDef);
          if (fmtType === ruleType)
            cxt.pass(validCondition());
          function unknownFormat() {
            if (opts.strictSchema === false) {
              self.logger.warn(unknownMsg());
              return;
            }
            throw new Error(unknownMsg());
            function unknownMsg() {
              return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
            }
          }
          function getFormat(fmtDef) {
            const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
            const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code });
            if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
              return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
            }
            return ["string", fmtDef, fmt];
          }
          function validCondition() {
            if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
              if (!schemaEnv.$async)
                throw new Error("async format in sync schema");
              return (0, codegen_1._)`await ${fmtRef}(${data})`;
            }
            return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var format_1 = require_format();
    var format = [format_1.default];
    exports.default = format;
  }
});

// node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS({
  "node_modules/ajv/dist/vocabularies/metadata.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.contentVocabulary = exports.metadataVocabulary = void 0;
    exports.metadataVocabulary = [
      "title",
      "description",
      "default",
      "deprecated",
      "readOnly",
      "writeOnly",
      "examples"
    ];
    exports.contentVocabulary = [
      "contentMediaType",
      "contentEncoding",
      "contentSchema"
    ];
  }
});

// node_modules/ajv/dist/vocabularies/draft2020.js
var require_draft2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/draft2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation();
    var applicator_1 = require_applicator();
    var dynamic_1 = require_dynamic();
    var next_1 = require_next();
    var unevaluated_1 = require_unevaluated();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft2020Vocabularies = [
      dynamic_1.default,
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(true),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary,
      next_1.default,
      unevaluated_1.default
    ];
    exports.default = draft2020Vocabularies;
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/types.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DiscrError = void 0;
    var DiscrError;
    (function(DiscrError2) {
      DiscrError2["Tag"] = "tag";
      DiscrError2["Mapping"] = "mapping";
    })(DiscrError || (exports.DiscrError = DiscrError = {}));
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var types_1 = require_types();
    var compile_1 = require_compile();
    var ref_error_1 = require_ref_error();
    var util_1 = require_util();
    var error = {
      message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
      params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
    };
    var def = {
      keyword: "discriminator",
      type: "object",
      schemaType: "object",
      error,
      code(cxt) {
        const { gen, data, schema, parentSchema, it } = cxt;
        const { oneOf } = parentSchema;
        if (!it.opts.discriminator) {
          throw new Error("discriminator: requires discriminator option");
        }
        const tagName = schema.propertyName;
        if (typeof tagName != "string")
          throw new Error("discriminator: requires propertyName");
        if (schema.mapping)
          throw new Error("discriminator: mapping is not supported");
        if (!oneOf)
          throw new Error("discriminator: requires oneOf keyword");
        const valid = gen.let("valid", false);
        const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
        gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
        cxt.ok(valid);
        function validateMapping() {
          const mapping = getMapping();
          gen.if(false);
          for (const tagValue in mapping) {
            gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
            gen.assign(valid, applyTagSchema(mapping[tagValue]));
          }
          gen.else();
          cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
          gen.endIf();
        }
        function applyTagSchema(schemaProp) {
          const _valid = gen.name("valid");
          const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
          cxt.mergeEvaluated(schCxt, codegen_1.Name);
          return _valid;
        }
        function getMapping() {
          var _a;
          const oneOfMapping = {};
          const topRequired = hasRequired(parentSchema);
          let tagRequired = true;
          for (let i = 0; i < oneOf.length; i++) {
            let sch = oneOf[i];
            if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
              const ref = sch.$ref;
              sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
              if (sch instanceof compile_1.SchemaEnv)
                sch = sch.schema;
              if (sch === void 0)
                throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
            }
            const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
            if (typeof propSch != "object") {
              throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
            }
            tagRequired = tagRequired && (topRequired || hasRequired(sch));
            addMappings(propSch, i);
          }
          if (!tagRequired)
            throw new Error(`discriminator: "${tagName}" must be required`);
          return oneOfMapping;
          function hasRequired({ required }) {
            return Array.isArray(required) && required.includes(tagName);
          }
          function addMappings(sch, i) {
            if (sch.const) {
              addMapping(sch.const, i);
            } else if (sch.enum) {
              for (const tagValue of sch.enum) {
                addMapping(tagValue, i);
              }
            } else {
              throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
            }
          }
          function addMapping(tagValue, i) {
            if (typeof tagValue != "string" || tagValue in oneOfMapping) {
              throw new Error(`discriminator: "${tagName}" values must be unique strings`);
            }
            oneOfMapping[tagValue] = i;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/schema.json
var require_schema = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/schema.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/schema",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true,
        "https://json-schema.org/draft/2020-12/vocab/applicator": true,
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
        "https://json-schema.org/draft/2020-12/vocab/validation": true,
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true,
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Core and Validation specifications meta-schema",
      allOf: [
        { $ref: "meta/core" },
        { $ref: "meta/applicator" },
        { $ref: "meta/unevaluated" },
        { $ref: "meta/validation" },
        { $ref: "meta/meta-data" },
        { $ref: "meta/format-annotation" },
        { $ref: "meta/content" }
      ],
      type: ["object", "boolean"],
      $comment: "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.",
      properties: {
        definitions: {
          $comment: '"definitions" has been replaced by "$defs".',
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          deprecated: true,
          default: {}
        },
        dependencies: {
          $comment: '"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.',
          type: "object",
          additionalProperties: {
            anyOf: [{ $dynamicRef: "#meta" }, { $ref: "meta/validation#/$defs/stringArray" }]
          },
          deprecated: true,
          default: {}
        },
        $recursiveAnchor: {
          $comment: '"$recursiveAnchor" has been replaced by "$dynamicAnchor".',
          $ref: "meta/core#/$defs/anchorString",
          deprecated: true
        },
        $recursiveRef: {
          $comment: '"$recursiveRef" has been replaced by "$dynamicRef".',
          $ref: "meta/core#/$defs/uriReferenceString",
          deprecated: true
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json
var require_applicator2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/applicator",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/applicator": true
      },
      $dynamicAnchor: "meta",
      title: "Applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        prefixItems: { $ref: "#/$defs/schemaArray" },
        items: { $dynamicRef: "#meta" },
        contains: { $dynamicRef: "#meta" },
        additionalProperties: { $dynamicRef: "#meta" },
        properties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependentSchemas: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        propertyNames: { $dynamicRef: "#meta" },
        if: { $dynamicRef: "#meta" },
        then: { $dynamicRef: "#meta" },
        else: { $dynamicRef: "#meta" },
        allOf: { $ref: "#/$defs/schemaArray" },
        anyOf: { $ref: "#/$defs/schemaArray" },
        oneOf: { $ref: "#/$defs/schemaArray" },
        not: { $dynamicRef: "#meta" }
      },
      $defs: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $dynamicRef: "#meta" }
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json
var require_unevaluated2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/unevaluated",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true
      },
      $dynamicAnchor: "meta",
      title: "Unevaluated applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        unevaluatedItems: { $dynamicRef: "#meta" },
        unevaluatedProperties: { $dynamicRef: "#meta" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json
var require_content = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/content",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Content vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        contentEncoding: { type: "string" },
        contentMediaType: { type: "string" },
        contentSchema: { $dynamicRef: "#meta" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json
var require_core3 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/core",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true
      },
      $dynamicAnchor: "meta",
      title: "Core vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        $id: {
          $ref: "#/$defs/uriReferenceString",
          $comment: "Non-empty fragments not allowed.",
          pattern: "^[^#]*#?$"
        },
        $schema: { $ref: "#/$defs/uriString" },
        $ref: { $ref: "#/$defs/uriReferenceString" },
        $anchor: { $ref: "#/$defs/anchorString" },
        $dynamicRef: { $ref: "#/$defs/uriReferenceString" },
        $dynamicAnchor: { $ref: "#/$defs/anchorString" },
        $vocabulary: {
          type: "object",
          propertyNames: { $ref: "#/$defs/uriString" },
          additionalProperties: {
            type: "boolean"
          }
        },
        $comment: {
          type: "string"
        },
        $defs: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" }
        }
      },
      $defs: {
        anchorString: {
          type: "string",
          pattern: "^[A-Za-z_][-A-Za-z0-9._]*$"
        },
        uriString: {
          type: "string",
          format: "uri"
        },
        uriReferenceString: {
          type: "string",
          format: "uri-reference"
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json
var require_format_annotation = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/format-annotation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true
      },
      $dynamicAnchor: "meta",
      title: "Format vocabulary meta-schema for annotation results",
      type: ["object", "boolean"],
      properties: {
        format: { type: "string" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json
var require_meta_data = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/meta-data",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true
      },
      $dynamicAnchor: "meta",
      title: "Meta-data vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        deprecated: {
          type: "boolean",
          default: false
        },
        readOnly: {
          type: "boolean",
          default: false
        },
        writeOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json
var require_validation2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/validation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/validation": true
      },
      $dynamicAnchor: "meta",
      title: "Validation vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        type: {
          anyOf: [
            { $ref: "#/$defs/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/$defs/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        const: true,
        enum: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/$defs/nonNegativeInteger" },
        minLength: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        maxItems: { $ref: "#/$defs/nonNegativeInteger" },
        minItems: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        maxContains: { $ref: "#/$defs/nonNegativeInteger" },
        minContains: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 1
        },
        maxProperties: { $ref: "#/$defs/nonNegativeInteger" },
        minProperties: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        required: { $ref: "#/$defs/stringArray" },
        dependentRequired: {
          type: "object",
          additionalProperties: {
            $ref: "#/$defs/stringArray"
          }
        }
      },
      $defs: {
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 0
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/index.js
var require_json_schema_2020_12 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var metaSchema = require_schema();
    var applicator = require_applicator2();
    var unevaluated = require_unevaluated2();
    var content = require_content();
    var core = require_core3();
    var format = require_format_annotation();
    var metadata = require_meta_data();
    var validation = require_validation2();
    var META_SUPPORT_DATA = ["/properties"];
    function addMetaSchema2020($data) {
      ;
      [
        metaSchema,
        applicator,
        unevaluated,
        content,
        core,
        with$data(this, format),
        metadata,
        with$data(this, validation)
      ].forEach((sch) => this.addMetaSchema(sch, void 0, false));
      return this;
      function with$data(ajv2, sch) {
        return $data ? ajv2.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
      }
    }
    exports.default = addMetaSchema2020;
  }
});

// node_modules/ajv/dist/2020.js
var require__ = __commonJS({
  "node_modules/ajv/dist/2020.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2020 = void 0;
    var core_1 = require_core();
    var draft2020_1 = require_draft2020();
    var discriminator_1 = require_discriminator();
    var json_schema_2020_12_1 = require_json_schema_2020_12();
    var META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";
    var Ajv20202 = class extends core_1.default {
      constructor(opts = {}) {
        super({
          ...opts,
          dynamicRef: true,
          next: true,
          unevaluated: true
        });
      }
      _addVocabularies() {
        super._addVocabularies();
        draft2020_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        const { $data, meta } = this.opts;
        if (!meta)
          return;
        json_schema_2020_12_1.default.call(this, $data);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports.Ajv2020 = Ajv20202;
    module.exports = exports = Ajv20202;
    module.exports.Ajv2020 = Ajv20202;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv20202;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// node_modules/octos-lesson-language/dist/packages/core/src/numeric-answer.js
var FULL_WIDTH = {
  "\uFF0D": "-",
  "\u2212": "-",
  "\u2013": "-",
  "\uFF0F": "/",
  "\xF7": "/",
  "\uFF0E": ".",
  "\u3002": ".",
  "\uFF0C": ",",
  "\u3000": " "
};
function normalize(text3) {
  return text3.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 65248)).replace(/[－−–／÷．。，　]/g, (char) => FULL_WIDTH[char]).trim().replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").replace(/^-\s+/, "-");
}
var INTEGER = /^(-?)(\d{1,3}(?:,\d{3})+|\d+)$/;
var DECIMAL = /^(-?)(\d{1,3}(?:,\d{3})+|\d*)\.(\d+)$/;
var FRACTION = /^(-?)(\d+)\/(\d+)$/;
var MIXED = /^(-?)(\d+) (\d+)\/(\d+)$/;
function safe(...values) {
  return values.every(Number.isSafeInteger);
}
function parseNumericAnswer(text3) {
  if (typeof text3 !== "string" || text3.length > 64)
    return void 0;
  const written = normalize(text3);
  let match = INTEGER.exec(written);
  if (match) {
    const value2 = Number(match[2].replace(/,/g, ""));
    if (!safe(value2))
      return void 0;
    return { value: match[1] && value2 !== 0 ? -value2 : value2, form: "integer" };
  }
  match = DECIMAL.exec(written);
  if (match) {
    const value2 = Number(`${match[2].replace(/,/g, "") || "0"}.${match[3]}`);
    if (!Number.isFinite(value2))
      return void 0;
    return { value: match[1] && value2 !== 0 ? -value2 : value2, form: "decimal" };
  }
  match = FRACTION.exec(written);
  if (match) {
    const numerator = Number(match[2]), denominator = Number(match[3]);
    if (!safe(numerator, denominator) || denominator === 0)
      return void 0;
    const value2 = numerator / denominator;
    return { value: match[1] && value2 !== 0 ? -value2 : value2, form: "fraction", numerator, denominator };
  }
  match = MIXED.exec(written);
  if (match) {
    const whole = Number(match[2]), numerator = Number(match[3]), denominator = Number(match[4]);
    if (!safe(whole, numerator, denominator) || denominator === 0 || numerator === 0 || numerator >= denominator || !safe(whole * denominator + numerator))
      return void 0;
    const value2 = (whole * denominator + numerator) / denominator;
    return { value: match[1] ? -value2 : value2, form: "mixed", numerator, denominator };
  }
  return void 0;
}
function greatestCommonDivisor(left, right) {
  while (right)
    [left, right] = [right, left % right];
  return left;
}
function isSimplestFraction(answer) {
  if (answer.form === "integer")
    return true;
  if (answer.form === "decimal")
    return false;
  if (answer.form === "fraction" && answer.denominator === 1)
    return false;
  return greatestCommonDivisor(answer.numerator, answer.denominator) === 1;
}

// node_modules/octos-lesson-language/dist/packages/core/src/index.js
var import__ = __toESM(require__(), 1);

// node_modules/octos-lesson-language/dist/schema/authoring/v0.1.schema.json
var v0_1_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://octos.dev/schema/lesson/authoring/0.1",
  title: "OLL Authoring Profile 0.1 Exploration",
  type: "object",
  required: ["dsl", "version", "profile", "lesson", "steps", "close"],
  additionalProperties: false,
  properties: {
    dsl: { const: "octos.lesson" },
    version: { const: "0.1" },
    profile: { const: "authoring" },
    board_context: {
      type: "object",
      required: ["board_id", "revision", "references"],
      additionalProperties: false,
      properties: {
        board_id: { type: "string", minLength: 1 },
        revision: { type: "integer", minimum: 0 },
        references: {
          type: "array",
          maxItems: 12,
          items: { $ref: "#/$defs/externalBoardReference" }
        }
      }
    },
    lesson: {
      type: "object",
      required: ["mode", "language", "title", "goals"],
      additionalProperties: false,
      properties: {
        mode: { enum: ["explain", "learner_taught"] },
        author: {
          type: "object",
          required: ["kind", "learner_ref", "presented_by"],
          additionalProperties: false,
          properties: {
            kind: { const: "learner" },
            learner_ref: { type: "string", pattern: "^learner:[A-Za-z0-9_-]{1,64}$" },
            presented_by: {
              type: "object",
              required: ["avatar_ref", "voice_ref"],
              additionalProperties: false,
              properties: {
                avatar_ref: { type: "string", pattern: "^avatar:[a-z0-9-]{1,48}$" },
                voice_ref: { type: "string", pattern: "^voice:[a-z0-9-]{1,48}$" }
              }
            }
          }
        },
        language: { type: "string", minLength: 2, maxLength: 32 },
        title: { type: "string", minLength: 1, maxLength: 160 },
        goals: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
        variables: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: { $ref: "#/$defs/lessonVariable" }
        },
        tasks: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: { $ref: "#/$defs/studentTask" }
        },
        reflections: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { $ref: "#/$defs/reflection" }
        },
        adaptation: {
          type: "object",
          properties: {
            strategies: { type: "array", items: { type: "string" } },
            context_refs: { type: "array", items: { type: "string" } }
          }
        }
      }
    },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 24,
      items: { $ref: "#/$defs/step" }
    },
    close: {
      type: "object",
      required: ["summary", "focus"],
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        focus: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/alias" }
        }
      }
    }
  },
  $defs: {
    externalBoardReference: {
      type: "object",
      required: ["as", "type", "target_id", "fragments"],
      additionalProperties: false,
      properties: {
        as: { $ref: "#/$defs/alias" },
        type: { enum: ["node", "group", "connection"] },
        target_id: { type: "string", minLength: 1 },
        label: { type: "string" },
        fragments: {
          type: "array",
          maxItems: 24,
          items: {
            type: "object",
            required: ["as", "target_id"],
            additionalProperties: false,
            properties: {
              as: { $ref: "#/$defs/alias" },
              target_id: { type: "string", minLength: 1 }
            }
          }
        }
      }
    },
    reflection: {
      type: "object",
      required: ["as", "prompt", "answer", "anchor", "availability"],
      additionalProperties: false,
      properties: {
        as: { $ref: "#/$defs/alias" },
        prompt: { type: "string", minLength: 1, maxLength: 480 },
        answer: { type: "string", minLength: 1, maxLength: 960 },
        anchor: { $ref: "#/$defs/alias" },
        availability: {
          type: "object",
          required: ["kind"],
          additionalProperties: false,
          properties: { kind: { const: "after_lesson" } }
        }
      }
    },
    studentTask: {
      type: "object",
      required: ["as", "prompt", "availability", "allowed_operations", "completion", "hints"],
      additionalProperties: false,
      properties: {
        start: { $ref: "#/$defs/phaseStart" },
        as: { $ref: "#/$defs/alias" },
        anchor: { $ref: "#/$defs/alias" },
        prompt: { type: "string", minLength: 1, maxLength: 480 },
        availability: {
          type: "object",
          required: ["kind"],
          additionalProperties: false,
          properties: {
            kind: { const: "after_lesson" }
          }
        },
        allowed_operations: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: {
            oneOf: [
              {
                type: "object",
                required: ["kind", "variable", "controls"],
                additionalProperties: false,
                properties: {
                  kind: { const: "variable_change" },
                  variable: { type: "string", pattern: "^[a-z][a-z0-9_]{0,63}$" },
                  controls: {
                    type: "array",
                    minItems: 1,
                    items: { enum: ["slider", "geometry_point", "number_line_point"] }
                  }
                }
              },
              {
                type: "object",
                required: ["kind", "node", "controls"],
                additionalProperties: false,
                properties: {
                  kind: { const: "scene3d_view" },
                  node: { $ref: "#/$defs/alias" },
                  controls: {
                    type: "array",
                    minItems: 1,
                    items: { enum: ["orbit", "zoom", "preset", "reset"] }
                  }
                }
              },
              {
                type: "object",
                required: ["kind"],
                additionalProperties: false,
                properties: {
                  kind: { const: "answer_entry" }
                }
              }
            ]
          }
        },
        completion: {
          oneOf: [
            {
              type: "object",
              required: ["kind", "expression", "value", "tolerance"],
              additionalProperties: false,
              properties: {
                kind: { const: "expression_target" },
                expression: { type: "string", minLength: 1, maxLength: 256 },
                value: { type: "number" },
                tolerance: { type: "number", exclusiveMinimum: 0 }
              }
            },
            {
              type: "object",
              required: ["kind", "node", "yaw", "pitch", "zoom", "angular_tolerance", "zoom_tolerance"],
              additionalProperties: false,
              properties: {
                kind: { const: "scene3d_view_target" },
                node: { $ref: "#/$defs/alias" },
                match: { enum: ["view_direction", "camera_pose"] },
                yaw: { type: "number" },
                pitch: { type: "number", minimum: -1.5707963267948966, maximum: 1.5707963267948966 },
                zoom: { type: "number", minimum: 0.2, maximum: 5 },
                angular_tolerance: { type: "number", exclusiveMinimum: 0 },
                zoom_tolerance: { type: "number", exclusiveMinimum: 0 }
              }
            },
            {
              type: "object",
              required: ["kind", "answer"],
              additionalProperties: false,
              properties: {
                kind: { const: "numeric_answer" },
                answer: { type: "string", minLength: 1, maxLength: 64 },
                tolerance: { type: "number", minimum: 0 },
                unit: { type: "string", minLength: 1, maxLength: 16 },
                form: { enum: ["any", "simplest_fraction"] }
              }
            }
          ]
        },
        hints: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { type: "string", minLength: 1, maxLength: 480 }
        },
        hint_after_attempts: { type: "integer", minimum: 1, maximum: 20 },
        success_message: { type: "string", minLength: 1, maxLength: 480 }
      },
      if: { properties: { completion: { properties: { kind: { const: "numeric_answer" } }, required: ["kind"] } }, required: ["completion"] },
      then: { required: ["anchor"] },
      else: { not: { required: ["anchor"] } }
    },
    step: {
      type: "object",
      required: ["key", "purpose", "beats"],
      additionalProperties: false,
      properties: {
        key: { $ref: "#/$defs/alias" },
        purpose: { type: "string", minLength: 1, maxLength: 240 },
        beats: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: { $ref: "#/$defs/beat" }
        }
      }
    },
    phaseStart: {
      type: "object",
      required: ["kind"],
      additionalProperties: false,
      properties: {
        kind: { enum: ["continue", "replay", "practice"] },
        variables: { type: "array", minItems: 1, maxItems: 16, uniqueItems: true, items: { type: "string" } },
        values: { type: "object", additionalProperties: { type: "number" } }
      }
    },
    beat: {
      type: "object",
      required: ["key", "actions"],
      additionalProperties: false,
      properties: {
        start: { $ref: "#/$defs/phaseStart" },
        key: { $ref: "#/$defs/alias" },
        say: { type: "string", maxLength: 1200 },
        delivery: { enum: ["neutral", "patient", "encouraging", "careful", "emphatic"] },
        pace: { enum: ["continuous"] },
        actions: {
          type: "array",
          minItems: 0,
          maxItems: 24,
          items: { $ref: "#/$defs/action" }
        }
      }
    },
    action: {
      type: "object",
      required: ["do"],
      additionalProperties: false,
      properties: {
        do: { enum: ["write", "revise", "emphasize", "connect", "group", "focus", "point", "expression", "animate", "hide", "view"] },
        when: { enum: ["before_speech", "during_speech", "after_speech"] },
        as: { $ref: "#/$defs/alias" },
        kind: { enum: ["text", "math", "shape", "diagram", "geometry", "plot", "scene3d", "image", "table", "note", "ink", "number_line"] },
        role: { type: "string" },
        content: { type: "object" },
        place: { $ref: "#/$defs/placement" },
        target: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        relation: { type: "string" },
        label: { type: "string" },
        emphasis: { type: "string" },
        members: { type: "array", items: { type: "string" } },
        targets: { type: "array", items: { type: "string" } },
        intent: { type: "string" },
        expression: { type: "string" },
        variable: { type: "string", pattern: "^[a-z][a-z0-9_]{0,63}$" },
        value: { type: "number" },
        easing: { enum: ["linear", "ease_in_out"] },
        duration_intent: { enum: ["brief", "normal", "extended"] },
        reason: { type: "string" },
        show: { type: "string" },
        preset: { enum: ["front", "top", "side", "isometric"] },
        source: {
          type: "object",
          required: ["selection", "confirmed_by"],
          additionalProperties: false,
          properties: {
            selection: { type: "string", pattern: "^sel-[A-Za-z0-9_-]{1,96}$" },
            confirmed_by: { const: "learner" }
          }
        }
      },
      allOf: [
        {
          if: { properties: { do: { const: "write" } } },
          then: { required: ["as", "kind", "role", "content", "place"] }
        },
        {
          if: {
            required: ["do", "kind"],
            properties: { do: { const: "write" }, kind: { const: "image" } }
          },
          then: { properties: { content: { $ref: "#/$defs/imageContent" } } }
        },
        {
          if: {
            required: ["do", "kind"],
            properties: { do: { const: "write" }, kind: { const: "ink" } }
          },
          then: { properties: { content: { $ref: "#/$defs/inkContent" } } }
        },
        {
          if: {
            required: ["do", "kind"],
            properties: { do: { const: "write" }, kind: { const: "geometry" } }
          },
          then: { properties: { content: { $ref: "#/$defs/geometryContent" } } }
        },
        {
          if: {
            required: ["do", "kind"],
            properties: { do: { const: "write" }, kind: { const: "plot" } }
          },
          then: { properties: { content: { $ref: "#/$defs/plotContent" } } }
        },
        {
          if: {
            required: ["do", "kind"],
            properties: { do: { const: "write" }, kind: { const: "scene3d" } }
          },
          then: { properties: { content: { $ref: "#/$defs/scene3dContent" } } }
        },
        {
          if: {
            required: ["do", "kind"],
            properties: { do: { const: "write" }, kind: { const: "number_line" } }
          },
          then: { properties: { content: { $ref: "#/$defs/numberLineContent" } } }
        },
        {
          if: { properties: { do: { const: "revise" } } },
          then: { required: ["target", "content", "reason"] }
        },
        {
          if: { properties: { do: { const: "emphasize" } } },
          then: { required: ["target", "emphasis"] }
        },
        {
          if: { properties: { do: { const: "connect" } } },
          then: { required: ["as", "from", "to", "relation"] }
        },
        {
          if: { properties: { do: { const: "group" } } },
          then: { required: ["as", "role", "label", "members"] }
        },
        {
          if: { properties: { do: { const: "focus" } } },
          then: { required: ["targets", "intent"] }
        },
        {
          if: { properties: { do: { const: "point" } } },
          then: { required: ["target"] }
        },
        {
          if: { properties: { do: { const: "hide" } } },
          then: { required: ["target"] }
        },
        {
          if: { properties: { do: { const: "view" } } },
          then: { required: ["target"] }
        },
        {
          if: { properties: { do: { const: "expression" } } },
          then: { required: ["expression"] }
        },
        {
          if: { properties: { do: { const: "animate" } } },
          then: { required: ["variable", "value"] }
        }
      ]
    },
    geometryContent: {
      type: "object",
      required: ["axes", "points"],
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        caption: { type: "string" },
        axes: {
          type: "object",
          required: ["x", "y", "equal_scale"],
          additionalProperties: false,
          properties: {
            x: { $ref: "#/$defs/geometryAxis" },
            y: { $ref: "#/$defs/geometryAxis" },
            equal_scale: { const: true }
          }
        },
        points: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["as", "x", "y"],
            additionalProperties: false,
            properties: {
              as: { $ref: "#/$defs/alias" },
              x: { type: "number" },
              y: { type: "number" },
              label: { type: "string" },
              visible: { type: "boolean" },
              interaction: {
                type: "object",
                required: ["kind", "variable", "center"],
                additionalProperties: false,
                properties: {
                  kind: { const: "angle_control" },
                  variable: { type: "string", pattern: "^[a-z][a-z0-9_]{0,63}$" },
                  center: { $ref: "#/$defs/alias" }
                }
              }
            }
          }
        },
        polygons: {
          type: "array",
          items: {
            type: "object",
            required: ["as", "points"],
            additionalProperties: false,
            properties: {
              as: { $ref: "#/$defs/alias" },
              points: {
                type: "array",
                minItems: 3,
                items: { $ref: "#/$defs/alias" }
              },
              label: { type: "string" },
              tone: { enum: ["primary", "secondary", "accent", "neutral"] }
            }
          }
        },
        regular_polygons: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            required: ["as", "center", "radius", "sides", "relation"],
            additionalProperties: false,
            properties: {
              as: { $ref: "#/$defs/alias" },
              center: { $ref: "#/$defs/alias" },
              radius: { type: "number", exclusiveMinimum: 0 },
              sides: { type: "integer", minimum: 3, maximum: 384 },
              relation: { enum: ["inscribed", "circumscribed"] },
              rotation: { type: "number" },
              label: { type: "string" },
              tone: { enum: ["primary", "secondary", "accent", "neutral"] },
              show_measurements: { type: "boolean" }
            }
          }
        },
        circles: {
          type: "array",
          items: {
            type: "object",
            required: ["as", "center", "radius"],
            additionalProperties: false,
            properties: {
              as: { $ref: "#/$defs/alias" },
              center: { $ref: "#/$defs/alias" },
              radius: { type: "number", minimum: 0 },
              label: { type: "string" }
            }
          }
        },
        segments: {
          type: "array",
          items: {
            type: "object",
            required: ["as", "from", "to"],
            additionalProperties: false,
            properties: {
              as: { $ref: "#/$defs/alias" },
              from: { $ref: "#/$defs/alias" },
              to: { $ref: "#/$defs/alias" },
              label: { type: "string" },
              style: { enum: ["solid", "dashed", "projection"] }
            }
          }
        },
        arcs: {
          type: "array",
          items: {
            type: "object",
            required: ["as", "center", "radius", "start_angle", "end_angle"],
            additionalProperties: false,
            properties: {
              as: { $ref: "#/$defs/alias" },
              center: { $ref: "#/$defs/alias" },
              radius: { type: "number", minimum: 0 },
              start_angle: { type: "number" },
              end_angle: { type: "number" },
              filled: { type: "boolean" },
              label: { type: "string" }
            }
          }
        },
        bindings: {
          type: "array",
          minItems: 1,
          maxItems: 64,
          items: { $ref: "#/$defs/valueBinding" }
        }
      }
    },
    lessonVariable: {
      type: "object",
      required: ["as", "initial", "min", "max"],
      additionalProperties: false,
      properties: {
        as: { type: "string", pattern: "^[a-z][a-z0-9_]{0,63}$" },
        initial: { type: "number" },
        min: { type: "number" },
        max: { type: "number" },
        wrap: { const: true },
        label: { type: "string", maxLength: 80 },
        unit: { type: "string", maxLength: 32 },
        control: {
          type: "object",
          required: ["kind"],
          additionalProperties: false,
          properties: {
            kind: { const: "slider" },
            step: { type: "number", exclusiveMinimum: 0 }
          }
        }
      }
    },
    plotContent: {
      type: "object",
      properties: {
        bindings: {
          type: "array",
          minItems: 1,
          maxItems: 64,
          items: { $ref: "#/$defs/valueBinding" }
        }
      }
    },
    numberLineContent: {
      type: "object",
      required: ["range"],
      properties: {
        range: { type: "object", required: ["min", "max"] },
        bindings: {
          type: "array",
          minItems: 1,
          maxItems: 64,
          items: { $ref: "#/$defs/valueBinding" }
        }
      }
    },
    scene3dContent: {
      type: "object",
      required: ["objects", "camera", "fallback"],
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        caption: { type: "string" },
        fallback: { type: "string", minLength: 1, maxLength: 480 },
        axes: { type: "boolean" },
        camera: {
          type: "object",
          required: ["yaw", "pitch", "zoom"],
          additionalProperties: false,
          properties: {
            yaw: { type: "number" },
            pitch: { type: "number" },
            zoom: { type: "number", exclusiveMinimum: 0 }
          }
        },
        objects: {
          type: "array",
          minItems: 1,
          maxItems: 24,
          items: {
            type: "object",
            required: ["as", "kind"],
            additionalProperties: false,
            properties: {
              as: { $ref: "#/$defs/alias" },
              kind: { enum: ["box", "sphere", "cylinder", "cone", "surface", "implicit_surface", "prism", "pyramid", "frustum", "hemisphere", "torus", "tetrahedron", "octahedron", "dodecahedron", "icosahedron", "ellipsoid"] },
              label: { type: "string" },
              color: { type: "string" },
              center: { $ref: "#/$defs/point3d" },
              size: { $ref: "#/$defs/size3d" },
              radius: { type: "number", exclusiveMinimum: 0 },
              height: { type: "number", exclusiveMinimum: 0 },
              sides: { type: "integer", minimum: 3, maximum: 12 },
              top_radius: { type: "number", exclusiveMinimum: 0 },
              tube: { type: "number", exclusiveMinimum: 0 },
              radii: {
                type: "object",
                required: ["x", "y", "z"],
                additionalProperties: false,
                properties: { x: { type: "number", exclusiveMinimum: 0 }, y: { type: "number", exclusiveMinimum: 0 }, z: { type: "number", exclusiveMinimum: 0 } }
              },
              base: { type: "array", minItems: 3, maxItems: 12, items: {
                type: "object",
                required: ["x", "y"],
                additionalProperties: false,
                properties: { x: { type: "number" }, y: { type: "number" } }
              } },
              top_scale: { type: "number", minimum: 0, exclusiveMaximum: 1 },
              unfold: { type: "number", minimum: 0, maximum: 1 },
              face_targets: { type: "boolean" },
              expression: { type: "string", minLength: 1, maxLength: 256 },
              x_range: { $ref: "#/$defs/range3d" },
              y_range: { $ref: "#/$defs/range3d" },
              z_range: { $ref: "#/$defs/range3d" },
              level: { type: "number" },
              samples: { type: "integer", minimum: 4, maximum: 24 }
            }
          }
        },
        sections: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            required: ["as", "axis", "value"],
            additionalProperties: false,
            properties: {
              as: { $ref: "#/$defs/alias" },
              axis: { enum: ["x", "y", "z"] },
              value: { type: "number" },
              targets: {
                type: "array",
                minItems: 1,
                maxItems: 24,
                uniqueItems: true,
                items: { $ref: "#/$defs/alias" }
              },
              display: { enum: ["plane", "intersection", "plane_and_intersection"] },
              label: { type: "string" },
              color: { type: "string" }
            }
          }
        },
        highlights: {
          type: "array",
          maxItems: 24,
          items: {
            type: "object",
            required: ["as", "kind", "points"],
            additionalProperties: false,
            properties: {
              as: { $ref: "#/$defs/alias" },
              kind: { enum: ["point", "edge", "face"] },
              points: {
                type: "array",
                minItems: 1,
                maxItems: 12,
                items: { $ref: "#/$defs/point3d" }
              },
              label: { type: "string" },
              color: { type: "string" },
              shown: { enum: ["always", "when_emphasized"] }
            }
          }
        },
        bindings: {
          type: "array",
          minItems: 1,
          maxItems: 64,
          items: { $ref: "#/$defs/valueBinding" }
        }
      }
    },
    point3d: {
      type: "object",
      required: ["x", "y", "z"],
      additionalProperties: false,
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" }
      }
    },
    size3d: {
      type: "object",
      required: ["x", "y", "z"],
      additionalProperties: false,
      properties: {
        x: { type: "number", exclusiveMinimum: 0 },
        y: { type: "number", exclusiveMinimum: 0 },
        z: { type: "number", exclusiveMinimum: 0 }
      }
    },
    range3d: {
      type: "object",
      required: ["min", "max"],
      additionalProperties: false,
      properties: {
        min: { type: "number" },
        max: { type: "number" }
      }
    },
    valueBinding: {
      type: "object",
      required: ["target", "expression"],
      additionalProperties: false,
      properties: {
        target: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}\\.[a-z_][a-z0-9_]*$" },
        expression: { type: "string", minLength: 1, maxLength: 256 },
        allow_zero: { const: true },
        hide_when_undefined: { const: true },
        label: {
          type: "object",
          required: ["precision"],
          additionalProperties: false,
          properties: {
            precision: { type: "integer", minimum: 0, maximum: 6 },
            prefix: { type: "string", maxLength: 64 },
            suffix: { type: "string", maxLength: 64 }
          }
        }
      }
    },
    geometryAxis: {
      type: "object",
      required: ["min", "max"],
      additionalProperties: false,
      properties: {
        min: { type: "number" },
        max: { type: "number" },
        label: { type: "string" }
      }
    },
    inkContent: {
      type: "object",
      required: ["snapshot_id", "sha256", "alt"],
      additionalProperties: false,
      properties: {
        snapshot_id: { type: "string", pattern: "^ink-snap:[A-Za-z0-9_.:@-]{1,96}$" },
        sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
        replay: { enum: ["stroke_order", "static"] },
        shown_strokes: { type: "integer", minimum: 1 },
        drawn_size: {
          type: "object",
          required: ["width", "height"],
          additionalProperties: false,
          properties: {
            width: { type: "number", exclusiveMinimum: 0, maximum: 4e3 },
            height: { type: "number", exclusiveMinimum: 0, maximum: 4e3 }
          }
        },
        alt: { type: "string", minLength: 1, maxLength: 480 },
        selections: {
          type: "array",
          maxItems: 24,
          items: {
            type: "object",
            required: ["as", "selection_id"],
            additionalProperties: false,
            properties: {
              as: { $ref: "#/$defs/alias" },
              selection_id: { type: "string", pattern: "^sel-[A-Za-z0-9_-]{1,96}$" },
              label: { type: "string" }
            }
          }
        },
        annotation: {
          type: "object",
          required: ["x", "y", "width", "height"],
          additionalProperties: false,
          properties: {
            x: { type: "number", minimum: -0.5, maximum: 1.5 },
            y: { type: "number", minimum: -0.5, maximum: 1.5 },
            width: { type: "number", exclusiveMinimum: 0, maximum: 2 },
            height: { type: "number", exclusiveMinimum: 0, maximum: 2 }
          }
        }
      }
    },
    imageContent: {
      type: "object",
      required: ["asset_id"],
      additionalProperties: false,
      properties: {
        asset_id: { type: "string", minLength: 1 },
        alt: { type: "string" },
        regions: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/imageRegion" }
        }
      }
    },
    imageRegion: {
      type: "object",
      required: ["as", "source_region"],
      additionalProperties: false,
      properties: {
        as: { $ref: "#/$defs/alias" },
        source_region: { type: "string", minLength: 1 },
        label: { type: "string" },
        confidence: { enum: ["low", "medium", "high", "uncertain"] }
      }
    },
    alias: {
      type: "string",
      pattern: "^[a-z][a-z0-9-]{0,63}$"
    },
    placement: {
      type: "object",
      required: ["relation"],
      additionalProperties: false,
      properties: {
        relation: { enum: ["new_region", "below", "above", "left_of", "right_of", "near", "inside", "overlay", "annotates", "replaces", "continues"] },
        anchor: { $ref: "#/$defs/alias" },
        region_role: { type: "string" },
        align: { enum: ["start", "center", "end", "equals"] },
        offset: {
          type: "object",
          required: ["x", "y"],
          additionalProperties: false,
          properties: {
            x: { type: "number", minimum: -4e3, maximum: 4e3 },
            y: { type: "number", minimum: -4e3, maximum: 4e3 }
          }
        },
        gap: { enum: ["compact", "normal", "spacious"] }
      }
    }
  }
};

// node_modules/octos-lesson-language/dist/packages/core/src/math-expression.js
var FUNCTIONS = {
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  ceil: Math.ceil,
  cos: Math.cos,
  exp: Math.exp,
  floor: Math.floor,
  ln: Math.log,
  // Common logarithm, as students read log(x); ln is the natural logarithm.
  log: Math.log10,
  round: Math.round,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan
};
function normalizeExpression(expression) {
  const normalized = expression.trim().replaceAll("\u03C0", "pi").replaceAll("\u2212", "-").replaceAll("\xD7", "*").replaceAll("\xF7", "/").trim();
  if (!normalized)
    throw new Error("Expression is empty");
  if (normalized.length > 256)
    throw new Error("Expression is too long");
  return normalized;
}
function tokenize(expression) {
  const result = [];
  let cursor = 0;
  while (cursor < expression.length) {
    const remaining = expression.slice(cursor);
    const whitespace = remaining.match(/^\s+/);
    if (whitespace) {
      cursor += whitespace[0].length;
      continue;
    }
    const number = remaining.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) {
      result.push({ kind: "number", value: number[0] });
      cursor += number[0].length;
      continue;
    }
    const identifier = remaining.match(/^[a-z][a-z0-9_]*/i);
    if (identifier) {
      result.push({ kind: "identifier", value: identifier[0].toLowerCase() });
      cursor += identifier[0].length;
      continue;
    }
    const symbol = remaining[0];
    if ("+-*/^()".includes(symbol)) {
      result.push({ kind: "symbol", value: symbol });
      cursor += 1;
      continue;
    }
    throw new Error(`Unsupported token '${symbol}'`);
  }
  result.push({ kind: "eof", value: "" });
  return result;
}
var ExpressionParser = class {
  tokens;
  allowedVariables;
  cursor = 0;
  constructor(tokens, allowedVariables) {
    this.tokens = tokens;
    this.allowedVariables = allowedVariables;
  }
  parse() {
    const expression = this.parseSum();
    if (this.current().kind !== "eof")
      throw new Error(`Unexpected token '${this.current().value}'`);
    return expression;
  }
  current() {
    return this.tokens[this.cursor];
  }
  take(value2) {
    const token = this.current();
    if (value2 !== void 0 && token.value !== value2)
      throw new Error(`Expected '${value2}'`);
    this.cursor += 1;
    return token;
  }
  parseSum() {
    let left = this.parseProduct();
    while (this.current().value === "+" || this.current().value === "-") {
      const operator = this.take().value;
      const right = this.parseProduct();
      const prior = left;
      left = operator === "+" ? (variables) => prior(variables) + right(variables) : (variables) => prior(variables) - right(variables);
    }
    return left;
  }
  parseProduct() {
    let left = this.parseUnary();
    while (this.current().value === "*" || this.current().value === "/") {
      const operator = this.take().value;
      const right = this.parseUnary();
      const prior = left;
      left = operator === "*" ? (variables) => prior(variables) * right(variables) : (variables) => prior(variables) / right(variables);
    }
    return left;
  }
  parseUnary() {
    if (this.current().value === "+") {
      this.take("+");
      return this.parseUnary();
    }
    if (this.current().value === "-") {
      this.take("-");
      const operand = this.parseUnary();
      return (variables) => -operand(variables);
    }
    return this.parsePower();
  }
  parsePower() {
    const base = this.parsePrimary();
    if (this.current().value !== "^")
      return base;
    this.take("^");
    const exponent = this.parseUnary();
    return (variables) => base(variables) ** exponent(variables);
  }
  parsePrimary() {
    const token = this.current();
    if (token.kind === "number") {
      this.take();
      const value2 = Number(token.value);
      return () => value2;
    }
    if (token.value === "(") {
      this.take("(");
      const value2 = this.parseSum();
      this.take(")");
      return value2;
    }
    if (token.kind !== "identifier")
      throw new Error("Expected a number, variable, or function");
    const identifier = this.take().value;
    if (identifier === "pi")
      return () => Math.PI;
    if (identifier === "e")
      return () => Math.E;
    if (this.allowedVariables.has(identifier)) {
      return (variables) => {
        const value2 = variables[identifier];
        if (!Number.isFinite(value2))
          throw new Error(`Variable '${identifier}' has no finite value`);
        return value2;
      };
    }
    const operation = FUNCTIONS[identifier];
    if (!operation)
      throw new Error(`Unknown variable or function '${identifier}'`);
    this.take("(");
    const argument = this.parseSum();
    this.take(")");
    return (variables) => operation(argument(variables));
  }
};
function compileMathExpression(expression, allowedVariables) {
  const variables = new Set([...allowedVariables].map((value2) => value2.toLowerCase()));
  return new ExpressionParser(tokenize(normalizeExpression(expression)), variables).parse();
}
function referencedMathVariables(expression, allowedVariables) {
  const allowed = new Set([...allowedVariables].map((value2) => value2.toLowerCase()));
  return [...new Set(tokenize(normalizeExpression(expression)).filter((token) => token.kind === "identifier" && allowed.has(token.value)).map((token) => token.value))];
}
function evaluateMathExpression(expression, variables) {
  const result = compileMathExpression(expression, Object.keys(variables))(variables);
  if (!Number.isFinite(result))
    throw new Error("Expression result is not finite");
  return result;
}

// node_modules/octos-lesson-language/dist/packages/core/src/solid-face-targets.js
function solidFaceKeys(object2) {
  const numbered = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
  switch (object2.kind) {
    case "box":
      return ["bottom", "top", ...numbered("side", 4)];
    case "prism":
    case "pyramid": {
      const sides = Array.isArray(object2.base) ? object2.base.length : Number(object2.sides);
      if (!Number.isInteger(sides) || sides < 3 || sides > 12)
        return [];
      return [
        "bottom",
        ...numbered("side", sides),
        ...object2.kind === "prism" || Number(object2.top_scale) > 0 ? ["top"] : []
      ];
    }
    case "cylinder":
    case "frustum":
      return ["bottom", "top", "side"];
    case "cone":
    case "hemisphere":
      return ["bottom", "side"];
    case "sphere":
    case "ellipsoid":
    case "torus":
      return ["side"];
    case "tetrahedron":
      return numbered("face", 4);
    case "octahedron":
      return numbered("face", 8);
    case "dodecahedron":
      return numbered("face", 12);
    case "icosahedron":
      return numbered("face", 20);
    default:
      return [];
  }
}
function solidFaceTarget(objectId, face) {
  return `${objectId}-${face}-face`;
}

// node_modules/octos-lesson-language/dist/packages/plugin-math/src/number-line.js
var NUMBER_LINE_KIND = "number_line";
var NUMBER_LINE_FEATURE = "plugin:math/number-line@1";
var NUMBER_LINE_PLUGIN_VERSION = "0.2.0";
var NUMBER_LINE_BINDINGS = {
  points: ["value"],
  jumps: ["from", "by"],
  intervals: ["from", "to"]
};
var NUMBER_LINE_LIMITS = {
  points: 12,
  jumps: 8,
  intervals: 4,
  /** Smallest ticks across the whole range. */
  ticks: 240,
  subdivisions: 12,
  denominator: 1e3,
  /** A jump drawn hop by hop has at most this many hops. */
  hops: 24
};
var FRACTION2 = /^\s*(-)?\s*(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)\s*$/u;
var gcd = (a, b) => b === 0 ? Math.abs(a) : gcd(b, a % b);
function parseFraction(text3) {
  const match = FRACTION2.exec(text3);
  if (!match)
    return void 0;
  const [, sign, whole, top, bottom] = match;
  const denominator = Number(bottom);
  if (!Number.isSafeInteger(denominator) || denominator < 1 || denominator > NUMBER_LINE_LIMITS.denominator)
    return void 0;
  const numerator = Number(whole ?? 0) * denominator + Number(top);
  if (!Number.isSafeInteger(numerator))
    return void 0;
  return { numerator: sign ? -numerator : numerator, denominator };
}
function numberLineValue(value2) {
  if (typeof value2 === "number")
    return Number.isFinite(value2) ? value2 : void 0;
  if (typeof value2 !== "string")
    return void 0;
  const fraction = parseFraction(value2);
  return fraction ? fraction.numerator / fraction.denominator : void 0;
}
function record(value2, path, fail4) {
  if (!value2 || typeof value2 !== "object" || Array.isArray(value2))
    fail4(path, "Expected an object");
  return value2;
}
function only(value2, allowed, path, fail4) {
  for (const key of Object.keys(value2))
    if (!allowed.includes(key))
      fail4(`${path}/${key}`, `Unknown number line field '${key}'`);
}
function value(raw, path, fail4) {
  const parsed = numberLineValue(raw);
  if (parsed === void 0)
    fail4(path, 'Expected a finite number or an exact fraction such as "3/4"');
  return parsed;
}
function text(raw, path, fail4, max = 120) {
  if (raw !== void 0 && (typeof raw !== "string" || raw.length > max))
    fail4(path, `Expected text of at most ${max} characters`);
}
function list(raw, path, limit, fail4) {
  if (raw === void 0)
    return [];
  if (!Array.isArray(raw))
    fail4(path, "Expected an array");
  if (raw.length > limit)
    fail4(path, `A number line has at most ${limit} of these`);
  return raw.map((item, index) => record(item, `${path}/${index}`, fail4));
}
function planTickStep(content) {
  if (content.ticks?.step !== void 0)
    return content.ticks.step;
  const span2 = content.range.max - content.range.min;
  const raw = span2 / 10;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= raw * (1 - 1e-9)) ?? 10 * power;
  return Number(step.toPrecision(12));
}
var near = (a, b, scale = 1) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(scale));
function validateNumberLineContent(raw, path, fail4, options = {}) {
  const content = record(raw, path, fail4);
  only(content, ["title", "caption", "range", "ticks", "points", "jumps", "intervals", "bindings"], path, fail4);
  text(content.title, `${path}/title`, fail4);
  text(content.caption, `${path}/caption`, fail4, 480);
  const range = record(content.range, `${path}/range`, fail4);
  only(range, ["min", "max"], `${path}/range`, fail4);
  const min = value(range.min, `${path}/range/min`, fail4);
  const max = value(range.max, `${path}/range/max`, fail4);
  if (typeof range.min !== "number" || typeof range.max !== "number")
    fail4(`${path}/range`, "The range is given as numbers");
  if (!(min < max) || max - min > 1e6)
    fail4(`${path}/range`, "The range needs min < max and a span of at most 1,000,000");
  const ticks = content.ticks === void 0 ? {} : record(content.ticks, `${path}/ticks`, fail4);
  only(ticks, ["step", "subdivisions", "labels", "format"], `${path}/ticks`, fail4);
  if (ticks.step !== void 0 && !(typeof ticks.step === "number" && ticks.step > 0 && Number.isFinite(ticks.step)))
    fail4(`${path}/ticks/step`, "The tick step is a positive number");
  const subdivisions = ticks.subdivisions ?? 1;
  if (!Number.isInteger(subdivisions) || subdivisions < 1 || subdivisions > NUMBER_LINE_LIMITS.subdivisions) {
    fail4(`${path}/ticks/subdivisions`, `Subdivisions are a whole number from 1 to ${NUMBER_LINE_LIMITS.subdivisions}`);
  }
  if (ticks.labels !== void 0 && !["major", "all", "none"].includes(ticks.labels))
    fail4(`${path}/ticks/labels`, "Tick labels are major, all or none");
  if (ticks.format !== void 0 && !["integer", "decimal", "fraction", "mixed"].includes(ticks.format))
    fail4(`${path}/ticks/format`, "The tick format is integer, decimal, fraction or mixed");
  const shape = { range: { min, max }, ticks };
  const step = planTickStep(shape);
  const unit = step / subdivisions;
  if ((max - min) / unit > NUMBER_LINE_LIMITS.ticks + 1e-9)
    fail4(`${path}/ticks`, `The range holds more than ${NUMBER_LINE_LIMITS.ticks} of the smallest ticks; use a larger step or fewer subdivisions`);
  if ((ticks.format === "fraction" || ticks.format === "mixed") && !Number.isInteger(step))
    fail4(`${path}/ticks/format`, "Fraction labels need a whole-number major step");
  if (ticks.format === "integer" && !Number.isInteger(step))
    fail4(`${path}/ticks/format`, "Integer labels need a whole-number major step");
  if (ticks.format === "integer" && ticks.labels === "all" && !Number.isInteger(unit)) {
    fail4(`${path}/ticks`, "Integer labels on every tick need whole-number ticks; label only the major ticks, or use fraction or decimal labels");
  }
  const pointAliases = /* @__PURE__ */ new Set();
  for (const [index, point] of list(content.points, `${path}/points`, NUMBER_LINE_LIMITS.points, fail4).entries()) {
    const pointPath = `${path}/points/${index}`;
    only(point, ["as", "value", "label", "style", "shown", "interaction"], pointPath, fail4);
    const at = value(point.value, `${pointPath}/value`, fail4);
    if (at < min - 1e-9 || at > max + 1e-9)
      fail4(`${pointPath}/value`, "A point lies inside the line's range");
    text(point.label, `${pointPath}/label`, fail4, 64);
    if (point.style !== void 0 && point.style !== "closed" && point.style !== "open")
      fail4(`${pointPath}/style`, "A point is closed or open");
    if (point.shown !== void 0 && point.shown !== "always" && point.shown !== "when_emphasized")
      fail4(`${pointPath}/shown`, "A point is shown always or when emphasized");
    if (point.interaction !== void 0) {
      const interaction = record(point.interaction, `${pointPath}/interaction`, fail4);
      only(interaction, ["kind", "variable"], `${pointPath}/interaction`, fail4);
      if (interaction.kind !== "drag" || typeof interaction.variable !== "string")
        fail4(`${pointPath}/interaction`, `A point's interaction is {kind: "drag", variable}`);
    }
    if (typeof point.as === "string")
      pointAliases.add(point.as);
  }
  const bound = new Set((Array.isArray(content.bindings) ? content.bindings : []).map((binding) => binding.target).filter((target) => typeof target === "string"));
  for (const [index, jump] of list(content.jumps, `${path}/jumps`, NUMBER_LINE_LIMITS.jumps, fail4).entries()) {
    const jumpPath = `${path}/jumps/${index}`;
    only(jump, ["as", "from", "by", "label", "hops"], jumpPath, fail4);
    const loose = options.boundValues || bound.has(`${jump.as}.by`) || bound.has(`${jump.as}.from`);
    let start;
    if (typeof jump.from === "string" && numberLineValue(jump.from) === void 0) {
      if (!pointAliases.has(jump.from))
        fail4(`${jumpPath}/from`, `Jump start '${jump.from}' is not a point of this number line`);
      const point = content.points.find((candidate) => candidate.as === jump.from);
      start = numberLineValue(point.value);
    } else {
      start = value(jump.from, `${jumpPath}/from`, fail4);
    }
    const by = value(jump.by, `${jumpPath}/by`, fail4);
    if (by === 0 && !loose)
      fail4(`${jumpPath}/by`, "A jump moves by a nonzero amount");
    const end = start + by;
    if (start < min - 1e-9 || start > max + 1e-9 || end < min - 1e-9 || end > max + 1e-9)
      fail4(jumpPath, "A jump starts and ends inside the line's range");
    text(jump.label, `${jumpPath}/label`, fail4, 32);
    if (jump.hops !== void 0 && typeof jump.hops !== "boolean")
      fail4(`${jumpPath}/hops`, "hops is true or false");
    if (jump.hops) {
      const count = Math.abs(by) / unit;
      const whole = near(count, Math.round(count), count);
      if (!whole && !loose || Math.ceil(count - 1e-9) > NUMBER_LINE_LIMITS.hops) {
        fail4(`${jumpPath}/hops`, `A jump drawn hop by hop moves a whole number of the smallest ticks, at most ${NUMBER_LINE_LIMITS.hops}`);
      }
    }
  }
  for (const [index, interval] of list(content.intervals, `${path}/intervals`, NUMBER_LINE_LIMITS.intervals, fail4).entries()) {
    const intervalPath = `${path}/intervals/${index}`;
    only(interval, ["as", "from", "to", "from_closed", "to_closed", "label"], intervalPath, fail4);
    if (!("from" in interval) || !("to" in interval))
      fail4(intervalPath, "An interval has from and to (null for an unbounded end)");
    const from = interval.from === null ? -Infinity : value(interval.from, `${intervalPath}/from`, fail4);
    const to = interval.to === null ? Infinity : value(interval.to, `${intervalPath}/to`, fail4);
    if (!(from < to))
      fail4(intervalPath, "An interval runs from a smaller value to a larger one");
    if (from !== -Infinity && (from < min - 1e-9 || from > max + 1e-9))
      fail4(`${intervalPath}/from`, "An interval's ends lie inside the line's range");
    if (to !== Infinity && (to < min - 1e-9 || to > max + 1e-9))
      fail4(`${intervalPath}/to`, "An interval's ends lie inside the line's range");
    for (const end of ["from_closed", "to_closed"]) {
      if (interval[end] !== void 0 && typeof interval[end] !== "boolean")
        fail4(`${intervalPath}/${end}`, `${end} is true or false`);
    }
    if (interval.from === null && interval.from_closed === true || interval.to === null && interval.to_closed === true) {
      fail4(intervalPath, "An unbounded end cannot be closed");
    }
    text(interval.label, `${intervalPath}/label`, fail4, 64);
  }
}
function decimalPlaces(unit) {
  for (let digits = 0; digits <= 6; digits += 1) {
    const scaled = unit * 10 ** digits;
    if (Math.abs(scaled - Math.round(scaled)) <= 1e-9 * Math.max(1, Math.abs(scaled)))
      return digits;
  }
  return 3;
}
function formatDecimal(value2, unit) {
  const text3 = value2.toFixed(decimalPlaces(unit)).replace(/(\.\d*?)0+$/u, "$1").replace(/\.$/u, "");
  return text3 === "-0" || text3 === "\u22120" ? "0" : text3.replace("-", "\u2212");
}
function planNumberLineTicks(content) {
  const step = planTickStep(content);
  const subdivisions = content.ticks?.subdivisions ?? 1;
  const unit = step / subdivisions;
  const labels = content.ticks?.labels ?? "major";
  const format = content.ticks?.format ?? (Number.isInteger(step) ? subdivisions > 1 ? "fraction" : "integer" : "decimal");
  const first = Math.ceil(content.range.min / unit - 1e-9);
  const last = Math.floor(content.range.max / unit + 1e-9);
  const ticks = [];
  for (let index = first; index <= last; index += 1) {
    const tickValue = Number((index * unit).toPrecision(12));
    const major = index % subdivisions === 0;
    const labelled = labels === "all" || labels === "major" && major;
    let label;
    if (labelled) {
      if (format === "fraction" || format === "mixed") {
        const common = gcd(step, subdivisions);
        const denominator = subdivisions / common;
        const numerator = index * (step / common);
        if (numerator % denominator === 0) {
          label = { kind: "text", text: formatDecimal(numerator / denominator, 1) };
        } else {
          const negative = numerator < 0;
          const size = Math.abs(numerator);
          label = format === "mixed" && size > denominator ? { kind: "fraction", negative, whole: Math.floor(size / denominator), numerator: size % denominator, denominator } : { kind: "fraction", negative, numerator: size, denominator };
        }
      } else {
        label = format === "integer" && !Number.isInteger(tickValue) ? void 0 : { kind: "text", text: formatDecimal(tickValue, format === "integer" ? 1 : unit) };
      }
    }
    ticks.push({ value: tickValue, major, ...label ? { label } : {} });
  }
  return ticks;
}

// node_modules/octos-lesson-language/dist/packages/core/src/capabilities.js
var OLL_NODE_KINDS = [
  "text",
  "math",
  "shape",
  "diagram",
  "geometry",
  "plot",
  "scene3d",
  "image",
  "table",
  "note",
  "ink"
];
var OLL_ACTION_NAMES = [
  "write",
  "revise",
  "emphasize",
  "connect",
  "group",
  "focus",
  "point",
  "expression",
  "animate",
  "hide",
  "view"
];
var OLL_BINDING_CAPABILITIES = {
  geometry: {
    points: ["x", "y"],
    circles: ["radius"],
    regular_polygons: ["sides", "radius", "rotation"],
    arcs: ["radius", "start_angle", "end_angle"]
  },
  plot: {
    points: ["x", "y"],
    guides: ["value"]
  },
  scene3d: {
    sections: ["value"],
    objects: ["unfold"]
  },
  number_line: NUMBER_LINE_BINDINGS
};
var EMPTY_BINDING_COLLECTIONS = Object.freeze({});
function bindingCapabilitiesForNodeKind(kind) {
  if (Object.hasOwn(OLL_BINDING_CAPABILITIES, kind)) {
    return OLL_BINDING_CAPABILITIES[kind];
  }
  return EMPTY_BINDING_COLLECTIONS;
}
function collectBindingCapabilities() {
  const collected = {};
  for (const collections of Object.values(OLL_BINDING_CAPABILITIES)) {
    for (const [collection, properties] of Object.entries(collections)) {
      const values = collected[collection] ?? [];
      for (const property of properties) {
        if (!values.includes(property))
          values.push(property);
      }
      collected[collection] = values;
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(collected).map(([collection, properties]) => [
    collection,
    Object.freeze(properties)
  ])));
}
var OLL_CANONICAL_BINDING_CAPABILITIES = collectBindingCapabilities();

// node_modules/octos-lesson-language/dist/packages/plugin-math/src/manifest.js
var MATH_PLUGIN_MANIFEST = {
  id: "math",
  // 0.2.0: the number line (decision 0013).
  version: "0.2.0",
  // Every subject plugin depends on the shared tools (decision 0012).
  depends: { shared: "0.1.0" },
  ollCore: ">=0.10.0"
};

// node_modules/octos-lesson-language/dist/packages/core/src/execution-requirements.js
var OLL_EXECUTION_FEATURES = Object.freeze({
  "canonical:0.1": "0.1.0",
  ...Object.fromEntries(OLL_NODE_KINDS.map((kind) => [`node:${kind}`, "0.1.0"])),
  ...Object.fromEntries([
    "board.create",
    "board.revise",
    "board.emphasize",
    "board.connect",
    "board.group",
    "board.focus",
    "teacher.point",
    "teacher.expression",
    "lesson.variable.animate"
  ].map((op) => [`action:${op}`, "0.1.0"])),
  "variables": "0.1.0",
  "geometry:regular-polygons": "0.4.0",
  "value-bindings": "0.1.0",
  "binding-labels": "0.2.0",
  "bound-zero-radius": "0.2.0",
  "action:lesson.phase.start": "0.2.0",
  "practice-start": "0.2.0",
  "student-tasks:expression_target": "0.1.0",
  "student-tasks:scene3d_view_target": "0.1.0",
  "student-tasks:numeric_answer": "0.5.0",
  "reflections": "0.3.0",
  "binding-hide-undefined": "0.3.0",
  "lesson-mode:learner_taught": "0.6.0",
  "node:ink": "0.6.0",
  "placement:annotates": "0.6.0",
  "placement:replaces": "0.6.0",
  "action:board.hide": "0.6.0",
  "write-source": "0.6.0",
  "action:scene3d.view": "0.6.0",
  "emphasis:none": "0.7.0",
  "variables:wrap": "0.7.0",
  "scene3d:latent-highlights": "0.7.0",
  "ink:shown-strokes": "0.8.0",
  "beat-pace:continuous": "0.8.0",
  "placement:continues": "0.9.0",
  "ink:drawn-size": "0.9.0",
  "scene3d:more-solids": "0.9.0",
  "scene3d:unfold": "0.9.0",
  "scene3d:face-targets": "0.10.0"
});
var looksLikeNumberLine = (content) => typeof content.range === "object" && content.range !== null && ["points", "jumps", "intervals", "ticks"].some((field) => field in content);
var FIRST_PARTY_EXTENSIONS = Object.freeze([
  {
    plugin: { id: MATH_PLUGIN_MANIFEST.id, version: MATH_PLUGIN_MANIFEST.version },
    features: { [NUMBER_LINE_FEATURE]: NUMBER_LINE_PLUGIN_VERSION },
    detect(content, kind, use) {
      if (kind === NUMBER_LINE_KIND || kind === void 0 && looksLikeNumberLine(content))
        use(NUMBER_LINE_FEATURE);
    }
  }
]);
var FIRST_PARTY_FEATURES = Object.freeze(Object.assign({}, ...FIRST_PARTY_EXTENSIONS.map((extension) => extension.features)));
var PLUGIN_NODE_FEATURES = Object.freeze({ [NUMBER_LINE_KIND]: NUMBER_LINE_FEATURE });

// node_modules/octos-lesson-language/dist/packages/core/src/opening.js
function applyLessonOpeningPolicy(source, policy = { kind: "preserve" }) {
  const result = structuredClone(source);
  if (policy.kind === "preserve" || source.board_context?.references.length)
    return result;
  const first = result.steps[0]?.beats[0];
  if (!first?.say?.trim())
    return result;
  if (policy.kind === "introduction") {
    const introduction = first.actions.find((a) => a.do === "write" && a.as === policy.alias);
    if (!introduction || introduction.do !== "write" || !["text", "math", "note"].includes(introduction.kind))
      throw new Error("Opening introduction must explicitly identify a text, math or note write in the first beat");
    if (introduction.content.bindings)
      throw new Error("Opening introduction cannot have value bindings");
    introduction.when = "before_speech";
    return result;
  }
  if (first.actions.some((a) => a.do === "write" && a.when !== "after_speech"))
    return result;
  const aliases = new Set(result.steps.flatMap((s) => s.beats).flatMap((b) => b.actions).flatMap((a) => "as" in a ? [a.as] : []));
  let alias = "opening-title", suffix = 1;
  while (aliases.has(alias))
    alias = `opening-title-${suffix++}`;
  first.actions.unshift({ do: "write", as: alias, kind: "note", role: "explanation", content: { title: source.lesson.title, items: ["\u672C\u8BFE\u5BFC\u5165"] }, place: { relation: "new_region" }, when: "before_speech" });
  return result;
}

// node_modules/octos-lesson-language/dist/packages/core/src/index.js
var ajv = new import__.Ajv2020({ allErrors: true, strict: false });
var validateAuthoringDocument = ajv.compile(v0_1_schema_default);
var ALIAS_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
var VARIABLE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
var RESERVED_MATH_NAMES = /* @__PURE__ */ new Set([
  "abs",
  "acos",
  "asin",
  "atan",
  "ceil",
  "cos",
  "e",
  "exp",
  "floor",
  "ln",
  "log",
  "pi",
  "round",
  "sin",
  "sqrt",
  "tan"
]);
var ACTIONS = new Set(OLL_ACTION_NAMES);
var PHASES = /* @__PURE__ */ new Set(["before_speech", "during_speech", "after_speech"]);
var ANIMATION_EASINGS = /* @__PURE__ */ new Set(["linear", "ease_in_out"]);
var ANIMATION_DURATION_INTENTS = /* @__PURE__ */ new Set(["brief", "normal", "extended"]);
var UNFOLDING_KINDS = /* @__PURE__ */ new Set(["box", "prism", "pyramid", "cylinder", "cone"]);
function convexPolygon(base) {
  if (!Array.isArray(base) || base.length < 3 || base.length > 12)
    return false;
  if (!base.every((point) => point && typeof point === "object" && Number.isFinite(point.x) && Number.isFinite(point.y)))
    return false;
  const area = base.reduce((sum, point, index) => {
    const next = base[(index + 1) % base.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
  if (Math.abs(area) < 1e-9)
    return false;
  return base.every((point, index) => {
    const next = base[(index + 1) % base.length], after = base[(index + 2) % base.length];
    return Math.sign(area) * ((next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x)) > -1e-9;
  });
}
var SOLID_KINDS = /* @__PURE__ */ new Set(["sphere", "cylinder", "cone", "prism", "pyramid", "frustum", "hemisphere", "torus", "tetrahedron", "octahedron", "dodecahedron", "icosahedron"]);
var PLACEMENT_RELATIONS = /* @__PURE__ */ new Set(["new_region", "below", "above", "left_of", "right_of", "near", "inside", "overlay", "annotates", "replaces", "continues"]);
var ACTION_FIELDS = /* @__PURE__ */ new Set([
  "do",
  "when",
  "as",
  "kind",
  "role",
  "content",
  "place",
  "target",
  "from",
  "to",
  "relation",
  "label",
  "emphasis",
  "members",
  "targets",
  "intent",
  "expression",
  "reason",
  "variable",
  "value",
  "easing",
  "duration_intent",
  "source",
  "show",
  "preset"
]);
var OllError = class extends Error {
  code;
  path;
  constructor(code, path, message) {
    super(message);
    this.name = "OllError";
    this.code = code;
    this.path = path;
  }
};
function fail(code, path, message) {
  throw new OllError(code, path, message);
}
function requireObject(value2, path) {
  if (!value2 || typeof value2 !== "object" || Array.isArray(value2)) {
    fail("OLL_INVALID_TYPE", path, "Expected an object");
  }
}
function requireArray(value2, path) {
  if (!Array.isArray(value2) || value2.length === 0) {
    fail("OLL_INVALID_TYPE", path, "Expected a non-empty array");
  }
}
function requireString(value2, path) {
  if (typeof value2 !== "string" || value2.length === 0) {
    fail("OLL_INVALID_TYPE", path, "Expected a non-empty string");
  }
}
function requireAlias(value2, path) {
  if (typeof value2 !== "string" || !ALIAS_PATTERN.test(value2)) {
    fail("OLL_INVALID_ALIAS", path, `Invalid local alias '${String(value2)}'`);
  }
}
function requireVariableAlias(value2, path) {
  if (typeof value2 !== "string" || !VARIABLE_PATTERN.test(value2)) {
    fail("OLL_INVALID_VARIABLE", path, `Invalid variable alias '${String(value2)}'`);
  }
}
function validateLessonAuthor(document2) {
  const { mode, author } = document2.lesson;
  if (mode !== "explain" && mode !== "learner_taught") {
    fail("OLL_INVALID_OPERATION_PAYLOAD", "/lesson/mode", `Unknown lesson mode '${String(mode)}'`);
  }
  if (mode === "learner_taught" && !author) {
    fail("OLL_INVALID_OPERATION_PAYLOAD", "/lesson/author", "A learner-taught lesson must name its learner author");
  }
  if (mode !== "learner_taught" && author) {
    fail("OLL_INVALID_OPERATION_PAYLOAD", "/lesson/author", "Only learner-taught lessons have a learner author");
  }
}
function isLearnerTaught(document2) {
  return document2.lesson.mode === "learner_taught";
}
function validateLessonVariables(document2) {
  const values = /* @__PURE__ */ new Map();
  for (const [index, variable] of (document2.lesson.variables ?? []).entries()) {
    const path = `/lesson/variables/${index}`;
    requireObject(variable, path);
    requireVariableAlias(variable.as, `${path}/as`);
    if (RESERVED_MATH_NAMES.has(variable.as))
      fail("OLL_INVALID_VARIABLE", `${path}/as`, `Variable '${variable.as}' uses a reserved math name`);
    if (values.has(variable.as))
      fail("OLL_DUPLICATE_ALIAS", `${path}/as`, `Variable '${variable.as}' is duplicated`);
    const initial = requireFiniteNumber(variable.initial, `${path}/initial`);
    const min = requireFiniteNumber(variable.min, `${path}/min`);
    const max = requireFiniteNumber(variable.max, `${path}/max`);
    if (max <= min)
      fail("OLL_INVALID_VARIABLE", path, "Variable max must be greater than min");
    if (initial < min || initial > max)
      fail("OLL_INVALID_VARIABLE", `${path}/initial`, "Variable initial value is outside its range");
    if (variable.wrap !== void 0 && variable.wrap !== true)
      fail("OLL_INVALID_VARIABLE", `${path}/wrap`, "Variable wrap must be true when present");
    if (variable.control?.step !== void 0) {
      const step = requireFiniteNumber(variable.control.step, `${path}/control/step`);
      if (step <= 0 || step > max - min)
        fail("OLL_INVALID_VARIABLE", `${path}/control/step`, "Slider step must be greater than zero and no larger than the variable range");
    }
    values.set(variable.as, initial);
  }
  return values;
}
function scene3dViewDirection(view) {
  const cosPitch = Math.cos(view.pitch);
  return {
    x: cosPitch * Math.sin(view.yaw),
    y: cosPitch * Math.cos(view.yaw),
    z: Math.sin(view.pitch)
  };
}
var SCENE3D_PRESET_VIEWS = {
  front: { yaw: 0, pitch: 0 },
  side: { yaw: Math.PI / 2, pitch: 0 },
  top: { yaw: 0, pitch: Math.PI / 2 },
  isometric: { yaw: 0.72, pitch: 0.55 }
};
function scene3dViewTargetScore(view, target) {
  let angularDistance;
  if (target.match === "view_direction") {
    const actual = scene3dViewDirection(view);
    const expected = scene3dViewDirection(target);
    const dot = Math.max(-1, Math.min(1, actual.x * expected.x + actual.y * expected.y + actual.z * expected.z));
    return Math.acos(dot) / target.angular_tolerance;
  }
  const yawDistance = Math.abs(Math.atan2(Math.sin(view.yaw - target.yaw), Math.cos(view.yaw - target.yaw)));
  angularDistance = Math.max(yawDistance, Math.abs(view.pitch - target.pitch));
  return Math.max(angularDistance / target.angular_tolerance, Math.abs(view.zoom - target.zoom) / target.zoom_tolerance);
}
function validateScene3dStudentTask(task, path, scene3dCameras) {
  const completion = task.completion;
  requireAlias(completion.node, `${path}/completion/node`);
  const initial = scene3dCameras.get(completion.node);
  if (!initial)
    fail("OLL_REFERENCE_NOT_FOUND", `${path}/completion/node`, `3D scene '${completion.node}' is not declared`);
  const target = {
    kind: "scene3d_view_target",
    node: completion.node,
    ...completion.match ? { match: completion.match } : {},
    yaw: requireFiniteNumber(completion.yaw, `${path}/completion/yaw`),
    pitch: requireFiniteNumber(completion.pitch, `${path}/completion/pitch`),
    zoom: requireFiniteNumber(completion.zoom, `${path}/completion/zoom`),
    angular_tolerance: requireFiniteNumber(completion.angular_tolerance, `${path}/completion/angular_tolerance`),
    zoom_tolerance: requireFiniteNumber(completion.zoom_tolerance, `${path}/completion/zoom_tolerance`)
  };
  const angularTolerance = target.angular_tolerance;
  const zoomTolerance = target.zoom_tolerance;
  if (completion.match !== void 0 && completion.match !== "view_direction" && completion.match !== "camera_pose") {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/completion/match`, `Unsupported 3D view match '${String(completion.match)}'`);
  }
  if (target.pitch < -Math.PI / 2 || target.pitch > Math.PI / 2 || target.zoom < 0.2 || target.zoom > 5) {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/completion`, "3D target view is outside the supported camera range");
  }
  if (angularTolerance <= 0 || angularTolerance > Math.PI || zoomTolerance <= 0 || zoomTolerance > 4.8) {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/completion`, "3D task tolerances must be positive and within the camera range");
  }
  requireArray(task.allowed_operations, `${path}/allowed_operations`);
  const controls = /* @__PURE__ */ new Set();
  task.allowed_operations.forEach((operation, operationIndex) => {
    const operationPath = `${path}/allowed_operations/${operationIndex}`;
    requireObject(operation, operationPath);
    if (operation.kind !== "scene3d_view" || operation.node !== completion.node) {
      fail("OLL_INVALID_STUDENT_TASK", operationPath, "3D view tasks must reference the completion scene");
    }
    requireArray(operation.controls, `${operationPath}/controls`);
    operation.controls.forEach((control, controlIndex) => {
      if (!["orbit", "zoom", "preset", "reset"].includes(String(control))) {
        fail("OLL_INVALID_STUDENT_TASK", `${operationPath}/controls/${controlIndex}`, `Unsupported 3D task control '${String(control)}'`);
      }
      if (controls.has(String(control))) {
        fail("OLL_INVALID_STUDENT_TASK", `${operationPath}/controls/${controlIndex}`, `3D task control '${String(control)}' is duplicated`);
      }
      controls.add(String(control));
    });
  });
  if (scene3dViewTargetScore(initial, target) <= 1) {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/completion`, "3D task is already complete at the initial camera view");
  }
  const presets = [
    { yaw: 0.72, pitch: 0.55, zoom: 1 },
    { yaw: 0, pitch: 0, zoom: 1 },
    { yaw: 0, pitch: Math.PI / 2, zoom: 1 }
  ];
  const presetReachable = controls.has("preset") && presets.some((preset) => scene3dViewTargetScore(preset, target) <= 1);
  const orbitReachable = controls.has("orbit") && (target.match === "view_direction" || Math.abs(initial.zoom - target.zoom) <= zoomTolerance || controls.has("zoom"));
  const zoomOnlyReachable = controls.has("zoom") && scene3dViewTargetScore({ ...initial, zoom: target.zoom }, target) <= 1;
  if (!presetReachable && !orbitReachable && !zoomOnlyReachable) {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/allowed_operations`, "No allowed 3D control can reach the target view");
  }
  validateTaskFeedback(task, path);
}
function validateAnswerStudentTask(task, path, registry) {
  resolveLocal(registry, task.anchor, `${path}/anchor`, ["node"]);
  requireArray(task.allowed_operations, `${path}/allowed_operations`);
  if (task.allowed_operations.length !== 1 || task.allowed_operations[0]?.kind !== "answer_entry") {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/allowed_operations`, "Numeric answer tasks allow exactly one answer_entry operation");
  }
  const completion = task.completion;
  const expected = typeof completion.answer === "string" ? parseNumericAnswer(completion.answer) : void 0;
  if (!expected) {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/completion/answer`, "Expected answer must be a whole number, decimal, fraction or mixed number");
  }
  if (completion.tolerance !== void 0 && requireFiniteNumber(completion.tolerance, `${path}/completion/tolerance`) < 0) {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/completion/tolerance`, "Answer tolerance must not be negative");
  }
  if (completion.form !== void 0 && completion.form !== "any" && completion.form !== "simplest_fraction") {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/completion/form`, `Unsupported answer form '${String(completion.form)}'`);
  }
  if (completion.form === "simplest_fraction" && !isSimplestFraction(expected)) {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/completion/answer`, "Expected answer is not written in its simplest form");
  }
  if (completion.unit !== void 0 && (typeof completion.unit !== "string" || !completion.unit.trim() || completion.unit.length > 16)) {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/completion/unit`, "Answer unit must be 1 to 16 characters");
  }
  validateTaskFeedback(task, path);
}
function validateTaskFeedback(task, path) {
  requireArray(task.hints, `${path}/hints`);
  if (task.hints.some((hint) => typeof hint !== "string" || !hint.trim())) {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/hints`, "Task hints must not be empty");
  }
  if (task.hint_after_attempts !== void 0 && (!Number.isInteger(task.hint_after_attempts) || task.hint_after_attempts < 1 || task.hint_after_attempts > 20)) {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/hint_after_attempts`, "hint_after_attempts must be an integer from 1 to 20");
  }
  if (task.success_message !== void 0 && (typeof task.success_message !== "string" || !task.success_message.trim())) {
    fail("OLL_INVALID_STUDENT_TASK", `${path}/success_message`, "Task success_message must not be empty");
  }
}
function resolvePhaseStart(policy, variables, path) {
  requireObject(policy, path);
  if (Object.keys(policy).some((key) => !["kind", "variables", "values"].includes(key))) {
    fail("OLL_INVALID_PHASE_START", path, "Unknown phase start field");
  }
  if (policy.kind === "continue") {
    if (policy.variables !== void 0 || policy.values !== void 0)
      fail("OLL_INVALID_PHASE_START", path, "Continuation inherits state without reset targets");
    return {};
  }
  if (policy.kind !== "replay" && policy.kind !== "practice")
    fail("OLL_INVALID_PHASE_START", path, "Unknown phase kind");
  if (!Array.isArray(policy.variables) || !policy.variables.length || new Set(policy.variables).size !== policy.variables.length) {
    fail("OLL_INVALID_PHASE_START", path, "Independent phases require distinct selected variables");
  }
  if (policy.values !== void 0)
    requireObject(policy.values, `${path}/values`);
  if (Object.keys(policy.values ?? {}).some((alias) => !policy.variables.includes(alias))) {
    fail("OLL_INVALID_PHASE_START", path, "Start values must belong to selected variables");
  }
  return Object.fromEntries(policy.variables.map((alias) => {
    const variable = variables.find((candidate) => candidate.as === alias);
    if (!variable)
      fail("OLL_INVALID_PHASE_START", path, `Unknown start variable '${alias}'`);
    const value2 = policy.values && Object.hasOwn(policy.values, alias) ? policy.values[alias] : variable.initial;
    if (!Number.isFinite(value2) || value2 < variable.min || value2 > variable.max) {
      fail("OLL_INVALID_PHASE_START", path, `Start value for '${alias}' is outside its domain`);
    }
    return [alias, value2];
  }));
}
function validateReflections(document2, registry) {
  const reflections = document2.lesson.reflections;
  if (reflections === void 0)
    return;
  requireArray(reflections, "/lesson/reflections");
  const taskAliases = new Set((document2.lesson.tasks ?? []).map((task) => task.as));
  const aliases = /* @__PURE__ */ new Set();
  reflections.forEach((reflection, index) => {
    const path = `/lesson/reflections/${index}`;
    requireObject(reflection, path);
    requireAlias(reflection.as, `${path}/as`);
    if (aliases.has(reflection.as) || taskAliases.has(reflection.as)) {
      fail("OLL_DUPLICATE_ALIAS", `${path}/as`, `Reflection '${reflection.as}' is duplicated`);
    }
    aliases.add(reflection.as);
    for (const field of ["prompt", "answer"]) {
      if (typeof reflection[field] !== "string" || !reflection[field].trim()) {
        fail("OLL_INVALID_REFLECTION", `${path}/${field}`, `Reflection ${field} must not be empty`);
      }
    }
    requireObject(reflection.availability, `${path}/availability`);
    if (reflection.availability.kind !== "after_lesson") {
      fail("OLL_INVALID_REFLECTION", `${path}/availability/kind`, `Unsupported reflection availability '${String(reflection.availability.kind)}'`);
    }
    resolveLocal(registry, reflection.anchor, `${path}/anchor`, ["node"]);
  });
}
function validateStudentTasks(document2, variables, availableControls, scene3dCameras, registry, numberLineGrids = /* @__PURE__ */ new Map()) {
  const taskAliases = /* @__PURE__ */ new Set();
  for (const [index, task] of (document2.lesson.tasks ?? []).entries()) {
    const path = `/lesson/tasks/${index}`;
    requireObject(task, path);
    requireAlias(task.as, `${path}/as`);
    if (taskAliases.has(task.as))
      fail("OLL_DUPLICATE_ALIAS", `${path}/as`, `Student task '${task.as}' is duplicated`);
    taskAliases.add(task.as);
    if (typeof task.prompt !== "string" || !task.prompt.trim()) {
      fail("OLL_INVALID_STUDENT_TASK", `${path}/prompt`, "Student task prompt must not be empty");
    }
    requireObject(task.availability, `${path}/availability`);
    if (task.availability.kind !== "after_lesson") {
      fail("OLL_INVALID_STUDENT_TASK", `${path}/availability/kind`, `Unsupported task availability '${String(task.availability.kind)}'`);
    }
    requireObject(task.completion, `${path}/completion`);
    if (task.start && (task.start.kind !== "practice" || task.completion.kind !== "expression_target")) {
      fail("OLL_INVALID_PHASE_START", `${path}/start`, "Practice starts currently require an expression task");
    }
    const startValues = task.start ? resolvePhaseStart(task.start, document2.lesson.variables ?? [], `${path}/start`) : {};
    if (task.completion.kind === "scene3d_view_target") {
      validateScene3dStudentTask(task, path, scene3dCameras);
      continue;
    }
    if (task.completion.kind === "numeric_answer") {
      validateAnswerStudentTask(task, path, registry);
      continue;
    }
    const expressionTask = task;
    requireArray(expressionTask.allowed_operations, `${path}/allowed_operations`);
    const allowedVariables = /* @__PURE__ */ new Set();
    expressionTask.allowed_operations.forEach((operation, operationIndex) => {
      const operationPath = `${path}/allowed_operations/${operationIndex}`;
      requireObject(operation, operationPath);
      if (operation.kind !== "variable_change") {
        fail("OLL_INVALID_STUDENT_TASK", `${operationPath}/kind`, `Unsupported student task operation '${String(operation.kind)}'`);
      }
      requireVariableAlias(operation.variable, `${operationPath}/variable`);
      if (!variables.has(operation.variable)) {
        fail("OLL_REFERENCE_NOT_FOUND", `${operationPath}/variable`, `Variable '${operation.variable}' is not declared`);
      }
      if (allowedVariables.has(operation.variable)) {
        fail("OLL_INVALID_STUDENT_TASK", `${operationPath}/variable`, `Variable '${operation.variable}' has duplicate allowed-operation entries`);
      }
      allowedVariables.add(operation.variable);
      requireArray(operation.controls, `${operationPath}/controls`);
      const controls = /* @__PURE__ */ new Set();
      operation.controls.forEach((control, controlIndex) => {
        if (control !== "slider" && control !== "geometry_point" && control !== "number_line_point") {
          fail("OLL_INVALID_STUDENT_TASK", `${operationPath}/controls/${controlIndex}`, `Unsupported task control '${String(control)}'`);
        }
        if (controls.has(control)) {
          fail("OLL_INVALID_STUDENT_TASK", `${operationPath}/controls/${controlIndex}`, `Task control '${control}' is duplicated`);
        }
        if (!availableControls.get(operation.variable)?.has(control)) {
          fail("OLL_INVALID_STUDENT_TASK", `${operationPath}/controls/${controlIndex}`, `Task control '${control}' is not available for variable '${operation.variable}' in this lesson`);
        }
        controls.add(control);
      });
    });
    const target = requireFiniteNumber(expressionTask.completion.value, `${path}/completion/value`);
    const tolerance = requireFiniteNumber(expressionTask.completion.tolerance, `${path}/completion/tolerance`);
    if (tolerance <= 0)
      fail("OLL_INVALID_STUDENT_TASK", `${path}/completion/tolerance`, "Task tolerance must be greater than zero");
    try {
      const evaluate2 = compileMathExpression(expressionTask.completion.expression, variables.keys());
      if (task.start && [...allowedVariables].some((alias) => !Object.hasOwn(startValues, alias))) {
        throw new Error("Practice start must specify all task variables");
      }
      const initial = evaluate2({ ...Object.fromEntries(variables), ...startValues });
      if (!Number.isFinite(initial) || !Number.isFinite(target))
        throw new Error("Task completion result is not finite");
      const referenced = new Set(referencedMathVariables(expressionTask.completion.expression, variables.keys()));
      if (referenced.size === 0)
        throw new Error("Task completion expression must read an allowed lesson variable");
      for (const variable of referenced) {
        if (!allowedVariables.has(variable)) {
          throw new Error(`Task completion expression reads '${variable}', but students are not allowed to change it`);
        }
      }
      for (const variable of allowedVariables) {
        if (!referenced.has(variable)) {
          throw new Error(`Allowed variable '${variable}' does not affect the task completion expression`);
        }
      }
      if (Math.abs(initial - target) <= tolerance) {
        throw new Error("Task completion condition is already satisfied by the lesson's initial values");
      }
      if (allowedVariables.size === 1) {
        const [variableAlias2] = allowedVariables;
        const declaration = document2.lesson.variables?.find((variable) => variable.as === variableAlias2);
        if (declaration) {
          let reachable = false;
          const check = (value2) => {
            if (reachable)
              return;
            const actual = evaluate2({ [variableAlias2]: value2 });
            if (Number.isFinite(actual) && Math.abs(actual - target) <= tolerance) {
              reachable = true;
            }
          };
          const allowed = expressionTask.allowed_operations.find((operation) => operation.variable === variableAlias2);
          const exactSliderSteps = declaration.control?.step ? Math.floor((declaration.max - declaration.min) / declaration.control.step + 1e-12) : -1;
          if (allowed?.controls.includes("slider") && exactSliderSteps > 2e4 && !allowed.controls.includes("geometry_point")) {
            throw new Error("Task slider has too many discrete steps to verify reachability");
          }
          if (allowed?.controls.includes("slider") && exactSliderSteps >= 0 && exactSliderSteps <= 2e4) {
            for (let sample = 0; sample <= exactSliderSteps && !reachable; sample += 1) {
              check(declaration.min + sample * declaration.control.step);
            }
          }
          const grid = numberLineGrids.get(variableAlias2);
          if (!reachable && grid && allowed?.controls.includes("number_line_point")) {
            for (const tick of planNumberLineTicks(grid)) {
              if (tick.value >= declaration.min - 1e-9 && tick.value <= declaration.max + 1e-9)
                check(tick.value);
            }
          }
          if (!reachable && allowed?.controls.includes("geometry_point")) {
            const sampleCount = 2e4;
            for (let sample = 0; sample <= sampleCount && !reachable; sample += 1) {
              check(declaration.min + (declaration.max - declaration.min) * sample / sampleCount);
            }
          }
          if (!reachable) {
            throw new Error("No reachable value in the lesson variable range satisfies the task completion condition");
          }
        }
      }
    } catch (error) {
      fail("OLL_INVALID_STUDENT_TASK", `${path}/completion/expression`, `Invalid task completion expression: ${error.message}`);
    }
    validateTaskFeedback(task, path);
  }
}
function splitBindingTarget(value2, path) {
  if (typeof value2 !== "string")
    fail("OLL_INVALID_BINDING", path, "Binding target must be a string");
  const separator = value2.lastIndexOf(".");
  if (separator <= 0 || separator === value2.length - 1)
    fail("OLL_INVALID_BINDING", path, `Invalid binding target '${value2}'`);
  const alias = value2.slice(0, separator);
  const property = value2.slice(separator + 1);
  requireAlias(alias, path);
  if (!/^[a-z_][a-z0-9_]*$/.test(property))
    fail("OLL_INVALID_BINDING", path, `Invalid binding property '${property}'`);
  return { alias, property };
}
function bindableTargets(action) {
  const targets = /* @__PURE__ */ new Map();
  const add = (field, properties) => {
    for (const item of Array.isArray(action.content[field]) ? action.content[field] : []) {
      if (typeof item?.as === "string")
        targets.set(item.as, new Set(properties));
    }
  };
  for (const [field, properties] of Object.entries(bindingCapabilitiesForNodeKind(action.kind))) {
    add(field, properties);
  }
  return targets;
}
function validateValueBindings(action, path, variables) {
  if (action.content.bindings === void 0)
    return;
  if (action.kind !== "geometry" && action.kind !== "plot" && action.kind !== "scene3d" && action.kind !== NUMBER_LINE_KIND) {
    fail("OLL_INVALID_BINDING", `${path}/content/bindings`, "Bindings are only supported on geometry, plot, scene3d and number_line nodes");
  }
  requireArray(action.content.bindings, `${path}/content/bindings`);
  const targets = bindableTargets(action);
  const seen = /* @__PURE__ */ new Set();
  const labeled = /* @__PURE__ */ new Set();
  action.content.bindings.forEach((binding, index) => {
    const bindingPath = `${path}/content/bindings/${index}`;
    requireObject(binding, bindingPath);
    for (const field of Object.keys(binding)) {
      if (!["target", "expression", "label", "allow_zero", "hide_when_undefined"].includes(field))
        fail("OLL_INVALID_BINDING", `${bindingPath}/${field}`, `Unknown binding field '${field}'`);
    }
    const { alias, property } = splitBindingTarget(binding.target, `${bindingPath}/target`);
    if (!targets.get(alias)?.has(property)) {
      fail("OLL_REFERENCE_NOT_FOUND", `${bindingPath}/target`, `Binding target '${binding.target}' is not a supported numeric field`);
    }
    if (binding.hide_when_undefined !== void 0 && (binding.hide_when_undefined !== true || action.kind !== "plot" && action.kind !== "geometry" || !["x", "y"].includes(property))) {
      fail("OLL_INVALID_BINDING", `${bindingPath}/hide_when_undefined`, "hide_when_undefined is only valid on point x/y bindings and must be true");
    }
    if (binding.allow_zero !== void 0 && (binding.allow_zero !== true || property !== "radius")) {
      fail("OLL_INVALID_BINDING", `${bindingPath}/allow_zero`, "allow_zero is only valid on radius bindings and must be true");
    }
    if (binding.label !== void 0) {
      requireObject(binding.label, `${bindingPath}/label`);
      const label = binding.label;
      if (Object.keys(label).some((key) => !["prefix", "suffix", "precision"].includes(key)) || !Number.isInteger(label.precision) || Number(label.precision) < 0 || Number(label.precision) > 6 || [label.prefix, label.suffix].some((value2) => value2 !== void 0 && (typeof value2 !== "string" || value2.length > 64))) {
        fail("OLL_INVALID_BINDING", `${bindingPath}/label`, "Label requires precision 0..6 and optional prefix/suffix up to 64 characters");
      }
      if (labeled.has(alias))
        fail("OLL_INVALID_BINDING", `${bindingPath}/label`, "A fragment may have only one generated label");
      labeled.add(alias);
    }
    if (seen.has(binding.target))
      fail("OLL_INVALID_BINDING", `${bindingPath}/target`, `Binding target '${binding.target}' is duplicated`);
    seen.add(binding.target);
    requireString(binding.expression, `${bindingPath}/expression`);
    try {
      const evaluate2 = compileMathExpression(binding.expression, variables.keys());
      const result = evaluate2(Object.fromEntries(variables));
      if (!Number.isFinite(result))
        throw new Error("result is not finite");
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid expression";
      fail("OLL_INVALID_BINDING", `${bindingPath}/expression`, message);
    }
  });
}
function splitTarget(value2, path) {
  if (typeof value2 !== "string") {
    fail("OLL_INVALID_REFERENCE", path, "Reference must be a string");
  }
  const [alias, fragment, ...rest] = value2.split("#");
  requireAlias(alias, path);
  if (rest.length > 0 || fragment !== void 0 && !fragment) {
    fail("OLL_INVALID_REFERENCE", path, `Invalid reference '${value2}'`);
  }
  if (fragment !== void 0)
    requireAlias(fragment, path);
  return { alias, fragment };
}
function register(registry, alias, type, path, fragments = []) {
  requireAlias(alias, path);
  if (registry.has(alias)) {
    fail("OLL_DUPLICATE_ALIAS", path, `Alias '${alias}' is already defined`);
  }
  registry.set(alias, { type, fragments: new Set(fragments) });
}
function validateContentFragments(content, path) {
  if (!content?.fragments)
    return [];
  requireArray(content.fragments, `${path}/fragments`);
  const seen = /* @__PURE__ */ new Set();
  return content.fragments.map((fragment, index) => {
    const fragmentPath = `${path}/fragments/${index}`;
    requireObject(fragment, fragmentPath);
    requireAlias(fragment.as, `${fragmentPath}/as`);
    if (seen.has(fragment.as)) {
      fail("OLL_DUPLICATE_ALIAS", `${fragmentPath}/as`, `Fragment '${fragment.as}' is duplicated`);
    }
    seen.add(fragment.as);
    return fragment.as;
  });
}
function collectAddressableContent(content, path = "/content") {
  const result = validateContentFragments(content, path);
  for (const field of ["curves", "points", "guides", "regions", "elements", "edges", "polygons", "regular_polygons", "circles", "segments", "arcs", "objects", "sections", "highlights", "selections", "jumps", "intervals"]) {
    if (!content?.[field])
      continue;
    for (const [index, item] of content[field].entries()) {
      if (item?.as)
        result.push(item.as);
      if (field === "objects" && item?.face_targets === true && typeof item.as === "string") {
        const faces = solidFaceKeys(item).map((face) => solidFaceTarget(item.as, face));
        if (ALIAS_PATTERN.test(item.as) && faces.some((face) => !ALIAS_PATTERN.test(face))) {
          fail("OLL_INVALID_ALIAS", `${path}/objects/${index}/as`, "Shorten the object alias to leave room for its face target names");
        }
        result.push(...faces);
      }
    }
  }
  return result;
}
function validateStructuredContent(content, path, addressable) {
  if (Array.isArray(content?.edges)) {
    content.edges.forEach((edge, index) => {
      for (const field of ["from", "to"]) {
        if (!addressable.has(edge[field])) {
          fail("OLL_REFERENCE_NOT_FOUND", `${path}/edges/${index}/${field}`, `Diagram element '${edge[field]}' is not defined`);
        }
      }
    });
  }
  if (Array.isArray(content?.regions)) {
    content.regions.forEach((region, regionIndex) => {
      if (!Array.isArray(region.members))
        return;
      region.members.forEach((member, memberIndex) => {
        if (!addressable.has(member)) {
          fail("OLL_REFERENCE_NOT_FOUND", `${path}/regions/${regionIndex}/members/${memberIndex}`, `Diagram element '${member}' is not defined`);
        }
      });
    });
  }
}
function checkNumberLineBoundValues(content, path, declarations) {
  const bindings = Array.isArray(content.bindings) ? content.bindings : [];
  if (!bindings.length)
    return;
  const known = new Map(declarations.map((declaration) => [declaration.as, declaration]));
  const referenced = [...new Set(bindings.flatMap((binding) => referencedMathVariables(String(binding.expression), known.keys())))].slice(0, 4);
  let combinations = [{}];
  for (const variable of referenced) {
    const { min, max, initial } = known.get(variable);
    combinations = combinations.flatMap((combination) => [.../* @__PURE__ */ new Set([min, max, initial])].map((value2) => ({ ...combination, [variable]: value2 })));
  }
  const withIds = (value2) => {
    const clone = structuredClone(value2);
    for (const field of ["points", "jumps", "intervals"]) {
      if (Array.isArray(clone[field]))
        clone[field] = clone[field].map((item) => ({ ...item, id: item.as }));
    }
    return clone;
  };
  for (const combination of combinations) {
    const values = { ...Object.fromEntries(declarations.map((declaration) => [declaration.as, declaration.initial])), ...combination };
    const where = Object.entries(combination).map(([name, value2]) => `${name} = ${value2}`).join(", ");
    let evaluated;
    try {
      evaluated = evaluateContentBindings(withIds(content), values);
    } catch (error) {
      fail("OLL_INVALID_BINDING", `${path}/bindings`, `When ${where}: ${error.message}`);
    }
    for (const field of ["points", "jumps", "intervals"]) {
      if (Array.isArray(evaluated[field]))
        evaluated[field] = evaluated[field].map(({ id: _id, ...item }) => item);
    }
    validateNumberLineContent(evaluated, path, (failPath, message) => fail("OLL_INVALID_BINDING", failPath, `When ${where}: ${message}`), { boundValues: true });
  }
}
function requireFiniteNumber(value2, path) {
  const number = Number(value2);
  if (!Number.isFinite(number))
    fail("OLL_INVALID_OPERATION_PAYLOAD", path, "Expected a finite number");
  return number;
}
function validateGeometryContent(action, path, variables) {
  if (action.kind !== "geometry")
    return;
  const content = action.content;
  requireObject(content.axes, `${path}/content/axes`);
  for (const axisName of ["x", "y"]) {
    const axisPath = `${path}/content/axes/${axisName}`;
    requireObject(content.axes[axisName], axisPath);
    const min = requireFiniteNumber(content.axes[axisName].min, `${axisPath}/min`);
    const max = requireFiniteNumber(content.axes[axisName].max, `${axisPath}/max`);
    if (max <= min)
      fail("OLL_INVALID_OPERATION_PAYLOAD", axisPath, "Geometry axis max must be greater than min");
  }
  if (content.axes.equal_scale !== true) {
    fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/axes/equal_scale`, "Geometry requires equal_scale=true");
  }
  requireArray(content.points, `${path}/content/points`);
  const pointAliases = /* @__PURE__ */ new Set();
  content.points.forEach((point, index) => {
    const pointPath = `${path}/content/points/${index}`;
    requireObject(point, pointPath);
    requireAlias(point.as, `${pointPath}/as`);
    pointAliases.add(point.as);
    requireFiniteNumber(point.x, `${pointPath}/x`);
    requireFiniteNumber(point.y, `${pointPath}/y`);
  });
  content.points.forEach((point, index) => {
    requireObject(point, `${path}/content/points/${index}`);
    if (point.interaction === void 0)
      return;
    const interactionPath = `${path}/content/points/${index}/interaction`;
    requireObject(point.interaction, interactionPath);
    if (point.interaction.kind !== "angle_control") {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${interactionPath}/kind`, "Geometry point interaction kind must be 'angle_control'");
    }
    requireVariableAlias(point.interaction.variable, `${interactionPath}/variable`);
    if (!variables.has(point.interaction.variable)) {
      fail("OLL_REFERENCE_NOT_FOUND", `${interactionPath}/variable`, `Lesson variable '${point.interaction.variable}' is not defined`);
    }
    requireAlias(point.interaction.center, `${interactionPath}/center`);
    if (!pointAliases.has(point.interaction.center)) {
      fail("OLL_REFERENCE_NOT_FOUND", `${interactionPath}/center`, `Geometry point '${point.interaction.center}' is not defined`);
    }
    if (point.interaction.center === point.as) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${interactionPath}/center`, "An angle control point cannot use itself as its center");
    }
  });
  const requirePointReference = (value2, referencePath) => {
    requireAlias(value2, referencePath);
    if (!pointAliases.has(value2)) {
      fail("OLL_REFERENCE_NOT_FOUND", referencePath, `Geometry point '${value2}' is not defined`);
    }
  };
  if (content.polygons !== void 0) {
    if (!Array.isArray(content.polygons)) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/polygons`, "Expected an array");
    }
    content.polygons.forEach((polygon, index) => {
      const polygonPath = `${path}/content/polygons/${index}`;
      requireObject(polygon, polygonPath);
      if (!Array.isArray(polygon.points) || polygon.points.length < 3) {
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${polygonPath}/points`, "A geometry polygon requires at least three points");
      }
      polygon.points.forEach((point, pointIndex) => {
        requirePointReference(point, `${polygonPath}/points/${pointIndex}`);
      });
      if (new Set(polygon.points).size < 3) {
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${polygonPath}/points`, "A geometry polygon requires at least three distinct points");
      }
    });
  }
  if (content.regular_polygons !== void 0) {
    requireArray(content.regular_polygons, `${path}/content/regular_polygons`);
    if (content.regular_polygons.length > 8)
      fail("OLL_INVALID_OPERATION_PAYLOAD", path, "At most 8 regular polygons");
    content.regular_polygons.forEach((polygon, index) => {
      const p = `${path}/content/regular_polygons/${index}`;
      requireObject(polygon, p);
      requireAlias(polygon.as, `${p}/as`);
      requirePointReference(polygon.center, `${p}/center`);
      const radius = requireFiniteNumber(polygon.radius, `${p}/radius`);
      const sides = requireFiniteNumber(polygon.sides, `${p}/sides`);
      if (radius <= 0 || !Number.isInteger(sides) || sides < 3 || sides > 384)
        fail("OLL_INVALID_OPERATION_PAYLOAD", p, "Regular polygons require positive radius and integer sides 3..384");
      if (polygon.relation !== "inscribed" && polygon.relation !== "circumscribed")
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${p}/relation`, "Expected inscribed or circumscribed");
      if (polygon.rotation !== void 0)
        requireFiniteNumber(polygon.rotation, `${p}/rotation`);
    });
  }
  for (const [field, references] of [
    ["circles", ["center"]],
    ["segments", ["from", "to"]],
    ["arcs", ["center"]]
  ]) {
    if (content[field] === void 0)
      continue;
    if (!Array.isArray(content[field])) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/${field}`, "Expected an array");
    }
    content[field].forEach((item, index) => {
      const itemPath = `${path}/content/${field}/${index}`;
      requireObject(item, itemPath);
      for (const reference of references)
        requirePointReference(item[reference], `${itemPath}/${reference}`);
      if (field === "circles" || field === "arcs") {
        const radius = requireFiniteNumber(item.radius, `${itemPath}/radius`);
        const zeroAllowed = radius === 0 && (content.bindings ?? []).some((binding) => binding.target === `${item.as}.radius` && binding.allow_zero === true);
        if (radius < 0 || radius === 0 && !zeroAllowed)
          fail("OLL_INVALID_OPERATION_PAYLOAD", `${itemPath}/radius`, "Radius must be positive unless explicitly bound with allow_zero");
      }
      if (field === "arcs") {
        if (item.filled !== void 0 && typeof item.filled !== "boolean")
          fail("OLL_INVALID_OPERATION_PAYLOAD", `${itemPath}/filled`, "Sector fill must be boolean");
        requireFiniteNumber(item.start_angle, `${itemPath}/start_angle`);
        requireFiniteNumber(item.end_angle, `${itemPath}/end_angle`);
      }
    });
  }
}
function validateScene3dContent(action, path, variables) {
  if (action.kind !== "scene3d")
    return;
  const content = action.content;
  requireString(content.fallback, `${path}/content/fallback`);
  requireObject(content.camera, `${path}/content/camera`);
  requireFiniteNumber(content.camera.yaw, `${path}/content/camera/yaw`);
  const pitch = requireFiniteNumber(content.camera.pitch, `${path}/content/camera/pitch`);
  const zoom = requireFiniteNumber(content.camera.zoom, `${path}/content/camera/zoom`);
  if (pitch < -Math.PI / 2 || pitch > Math.PI / 2) {
    fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/camera/pitch`, "3D camera pitch must be between -pi/2 and pi/2");
  }
  if (zoom < 0.2 || zoom > 5) {
    fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/camera/zoom`, "3D camera zoom must be from 0.2 to 5");
  }
  requireArray(content.objects, `${path}/content/objects`);
  if (content.objects.length === 0 || content.objects.length > 24) {
    fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/objects`, "A 3D scene requires 1 to 24 objects");
  }
  const aliases = /* @__PURE__ */ new Set();
  const objectAliases = /* @__PURE__ */ new Set();
  const point = (value2, pointPath) => {
    requireObject(value2, pointPath);
    for (const axis of ["x", "y", "z"]) {
      requireFiniteNumber(value2[axis], `${pointPath}/${axis}`);
    }
  };
  const size = (value2, sizePath) => {
    requireObject(value2, sizePath);
    for (const axis of ["x", "y", "z"]) {
      if (requireFiniteNumber(value2[axis], `${sizePath}/${axis}`) <= 0)
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${sizePath}/${axis}`, "3D size must be greater than zero");
    }
  };
  const range = (value2, rangePath) => {
    requireObject(value2, rangePath);
    const min = requireFiniteNumber(value2.min, `${rangePath}/min`);
    const max = requireFiniteNumber(value2.max, `${rangePath}/max`);
    if (max <= min)
      fail("OLL_INVALID_OPERATION_PAYLOAD", rangePath, "3D range max must be greater than min");
    return { min, max };
  };
  content.objects.forEach((rawObject, index) => {
    const objectPath = `${path}/content/objects/${index}`;
    requireObject(rawObject, objectPath);
    const object2 = rawObject;
    requireAlias(object2.as, `${objectPath}/as`);
    if (aliases.has(object2.as))
      fail("OLL_DUPLICATE_ALIAS", `${objectPath}/as`, `3D object '${object2.as}' is duplicated`);
    aliases.add(object2.as);
    objectAliases.add(object2.as);
    const objectKind = String(object2.kind);
    if (!["box", "sphere", "cylinder", "cone", "surface", "implicit_surface", "prism", "pyramid", "frustum", "hemisphere", "torus", "tetrahedron", "octahedron", "dodecahedron", "icosahedron", "ellipsoid"].includes(objectKind)) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/kind`, `Unknown 3D object kind '${object2.kind}'`);
    }
    if (object2.face_targets === true && !solidFaceKeys(object2).length) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/face_targets`, "Face targets require a solid with selectable surfaces");
    }
    if (object2.unfold !== void 0) {
      if (!UNFOLDING_KINDS.has(objectKind))
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/unfold`, "Only a box, prism, pyramid, cylinder or cone unfolds into a net");
      const unfold = requireFiniteNumber(object2.unfold, `${objectPath}/unfold`);
      if (unfold < 0 || unfold > 1)
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/unfold`, "unfold is between 0 (closed) and 1 (a flat net)");
    }
    if (object2.color !== void 0 && (typeof object2.color !== "string" || !/^(#[0-9a-fA-F]{6}|teal|blue|purple|orange|red|gray)$/.test(object2.color))) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/color`, "3D colors must use a safe palette name or six-digit hex value");
    }
    if (objectKind === "box") {
      point(object2.center, `${objectPath}/center`);
      size(object2.size, `${objectPath}/size`);
    } else if (objectKind === "ellipsoid") {
      point(object2.center, `${objectPath}/center`);
      const radii = object2.radii;
      if (!radii || !["x", "y", "z"].every((axis) => typeof radii[axis] === "number" && radii[axis] > 0)) {
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/radii`, "An ellipsoid needs three radii above zero");
      }
    } else if (SOLID_KINDS.has(objectKind)) {
      point(object2.center, `${objectPath}/center`);
      const based = (objectKind === "prism" || objectKind === "pyramid") && object2.base !== void 0;
      const radius = based ? 1 : requireFiniteNumber(object2.radius, `${objectPath}/radius`);
      if (radius <= 0)
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/radius`, "3D radius must be greater than zero");
      if (["cylinder", "cone", "prism", "pyramid", "frustum"].includes(objectKind)) {
        const height = requireFiniteNumber(object2.height, `${objectPath}/height`);
        if (height <= 0)
          fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/height`, "3D height must be greater than zero");
      }
      if (based) {
        if (object2.sides !== void 0)
          fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/sides`, "A prism or pyramid has either sides (a regular base) or a base polygon, not both");
        if (!convexPolygon(object2.base))
          fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/base`, "A base is a convex polygon of 3 to 12 corners with an area");
      } else if (objectKind === "prism" || objectKind === "pyramid") {
        const sides = Number(object2.sides);
        if (!Number.isInteger(sides) || sides < 3 || sides > 12)
          fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/sides`, "A prism or pyramid has 3 to 12 sides");
      }
      if (object2.top_scale !== void 0 && objectKind !== "pyramid")
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/top_scale`, "Only a pyramid is truncated (top_scale)");
      if (objectKind === "frustum") {
        const top = requireFiniteNumber(object2.top_radius, `${objectPath}/top_radius`);
        if (top <= 0)
          fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/top_radius`, "A frustum's top radius must be greater than zero");
      }
      if (objectKind === "torus") {
        const tube = requireFiniteNumber(object2.tube, `${objectPath}/tube`);
        if (tube <= 0 || tube >= radius)
          fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/tube`, "A torus's tube must be thinner than its ring: 0 < tube < radius");
      }
    } else if (objectKind === "implicit_surface") {
      requireString(object2.expression, `${objectPath}/expression`);
      const xRange = range(object2.x_range, `${objectPath}/x_range`);
      const yRange = range(object2.y_range, `${objectPath}/y_range`);
      const zRange = range(object2.z_range, `${objectPath}/z_range`);
      const level = object2.level === void 0 ? 0 : requireFiniteNumber(object2.level, `${objectPath}/level`);
      const sampleCount = Number(object2.samples ?? 12);
      if (!Number.isInteger(sampleCount) || sampleCount < 4 || sampleCount > 18) {
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/samples`, "3D implicit surface samples must be an integer from 4 to 18");
      }
      try {
        const variableNames = ["x", "y", "z", ...variables.keys()];
        const evaluate2 = compileMathExpression(object2.expression, variableNames);
        const values = Object.fromEntries(variables);
        const sampled = [];
        for (let xIndex = 0; xIndex <= sampleCount; xIndex += 1) {
          const x = xRange.min + (xRange.max - xRange.min) * xIndex / sampleCount;
          for (let yIndex = 0; yIndex <= sampleCount; yIndex += 1) {
            const y = yRange.min + (yRange.max - yRange.min) * yIndex / sampleCount;
            for (let zIndex = 0; zIndex <= sampleCount; zIndex += 1) {
              const z = zRange.min + (zRange.max - zRange.min) * zIndex / sampleCount;
              const value2 = evaluate2({ ...values, x, y, z });
              if (Number.isFinite(value2))
                sampled.push(value2);
            }
          }
        }
        if (sampled.length === 0 || Math.min(...sampled) > level || Math.max(...sampled) < level) {
          throw new Error("the requested level is outside the sampled value range");
        }
      } catch (error) {
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/expression`, `Invalid 3D implicit surface expression: ${error.message}`);
      }
    } else {
      requireString(object2.expression, `${objectPath}/expression`);
      const xRange = range(object2.x_range, `${objectPath}/x_range`);
      const yRange = range(object2.y_range, `${objectPath}/y_range`);
      const sampleCount = Number(object2.samples ?? 12);
      if (!Number.isInteger(sampleCount) || sampleCount < 4 || sampleCount > 24) {
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/samples`, "3D surface samples must be an integer from 4 to 24");
      }
      try {
        const variableNames = ["x", "y", ...variables.keys()];
        const evaluate2 = compileMathExpression(object2.expression, variableNames);
        const values = Object.fromEntries(variables);
        for (const x of [xRange.min, (xRange.min + xRange.max) / 2, xRange.max]) {
          for (const y of [yRange.min, (yRange.min + yRange.max) / 2, yRange.max]) {
            if (!Number.isFinite(evaluate2({ ...values, x, y })))
              throw new Error("surface is not finite");
          }
        }
      } catch (error) {
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${objectPath}/expression`, `Invalid 3D surface expression: ${error.message}`);
      }
    }
  });
  if (content.sections !== void 0) {
    requireArray(content.sections, `${path}/content/sections`);
    if (content.sections.length > 8)
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/sections`, "A 3D scene supports at most 8 sections");
    content.sections.forEach((rawSection, index) => {
      const sectionPath = `${path}/content/sections/${index}`;
      requireObject(rawSection, sectionPath);
      const section = rawSection;
      requireAlias(section.as, `${sectionPath}/as`);
      if (aliases.has(section.as))
        fail("OLL_DUPLICATE_ALIAS", `${sectionPath}/as`, `3D element '${section.as}' is duplicated`);
      aliases.add(section.as);
      if (!["x", "y", "z"].includes(String(section.axis)))
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${sectionPath}/axis`, "3D section axis must be x, y, or z");
      requireFiniteNumber(section.value, `${sectionPath}/value`);
      const display = String(section.display ?? "plane");
      if (!["plane", "intersection", "plane_and_intersection"].includes(display)) {
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${sectionPath}/display`, `Unknown 3D section display '${display}'`);
      }
      if (section.targets !== void 0) {
        requireArray(section.targets, `${sectionPath}/targets`);
        if (section.targets.length === 0 || section.targets.length > 24) {
          fail("OLL_INVALID_OPERATION_PAYLOAD", `${sectionPath}/targets`, "3D section targets must contain 1 to 24 objects");
        }
        const seenTargets = /* @__PURE__ */ new Set();
        section.targets.forEach((target, targetIndex) => {
          requireAlias(target, `${sectionPath}/targets/${targetIndex}`);
          if (!objectAliases.has(target)) {
            fail("OLL_REFERENCE_NOT_FOUND", `${sectionPath}/targets/${targetIndex}`, `3D section target '${String(target)}' does not exist`);
          }
          if (seenTargets.has(target)) {
            fail("OLL_INVALID_OPERATION_PAYLOAD", `${sectionPath}/targets/${targetIndex}`, `3D section target '${String(target)}' is duplicated`);
          }
          seenTargets.add(target);
        });
      } else if (display !== "plane") {
        fail("OLL_REFERENCE_NOT_FOUND", `${sectionPath}/targets`, `3D section display '${display}' requires at least one target object`);
      }
    });
  }
  if (content.highlights !== void 0) {
    requireArray(content.highlights, `${path}/content/highlights`);
    if (content.highlights.length > 24) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/highlights`, "A 3D scene supports at most 24 highlights");
    }
    content.highlights.forEach((rawHighlight, index) => {
      const highlightPath = `${path}/content/highlights/${index}`;
      requireObject(rawHighlight, highlightPath);
      const highlight = rawHighlight;
      requireAlias(highlight.as, `${highlightPath}/as`);
      if (aliases.has(highlight.as))
        fail("OLL_DUPLICATE_ALIAS", `${highlightPath}/as`, `3D element '${highlight.as}' is duplicated`);
      aliases.add(highlight.as);
      if (!["point", "edge", "face"].includes(String(highlight.kind))) {
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${highlightPath}/kind`, `Unknown 3D highlight kind '${String(highlight.kind)}'`);
      }
      if (highlight.shown !== void 0 && highlight.shown !== "always" && highlight.shown !== "when_emphasized") {
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${highlightPath}/shown`, "3D highlight shown must be 'always' or 'when_emphasized'");
      }
      requireArray(highlight.points, `${highlightPath}/points`);
      const requiredCount = highlight.kind === "point" ? 1 : highlight.kind === "edge" ? 2 : 3;
      if (highlight.points.length < requiredCount || highlight.kind !== "face" && highlight.points.length !== requiredCount || highlight.points.length > 12) {
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${highlightPath}/points`, `3D ${String(highlight.kind)} highlight has an invalid point count`);
      }
      highlight.points.forEach((rawPoint, pointIndex) => point(rawPoint, `${highlightPath}/points/${pointIndex}`));
    });
  }
}
function validatePlotContent(action, path, variables) {
  if (action.kind !== "plot" || !Array.isArray(action.content.curves))
    return;
  const axes = action.content.axes ?? {};
  if (axes.layout !== void 0 && (axes.layout !== "adaptive" || axes.equal_scale !== true)) {
    fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/axes/layout`, "Adaptive plot layout requires equal_scale=true");
  }
  if (axes.follow_samples !== void 0 && typeof axes.follow_samples !== "boolean") {
    fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/axes/follow_samples`, "Sample following must be a boolean");
  }
  for (const axis of ["x", "y"]) {
    const ticks = axes[axis]?.ticks;
    if (ticks !== void 0 && ticks !== "pi") {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/axes/${axis}/ticks`, 'Axis ticks may only be "pi"');
    }
  }
  action.content.curves.forEach((curve, index) => {
    const holes = curve?.holes;
    if (holes === void 0)
      return;
    if (!Array.isArray(holes) || holes.length > 16 || !holes.every((hole) => hole && typeof hole === "object" && Number.isFinite(hole.x) && Number.isFinite(hole.y))) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/curves/${index}/holes`, "Curve holes are up to 16 finite {x, y} points");
    }
  });
  const plotRange = (value2, rangePath, fallback) => {
    if (value2 === void 0)
      return fallback;
    requireObject(value2, rangePath);
    const min = requireFiniteNumber(value2.min, `${rangePath}/min`);
    const max = requireFiniteNumber(value2.max, `${rangePath}/max`);
    if (max <= min) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", rangePath, "Plot range max must be greater than min");
    }
    return { min, max };
  };
  const xRange = plotRange(axes.x, `${path}/content/axes/x`, { min: -5, max: 5 });
  const yRange = plotRange(axes.y, `${path}/content/axes/y`, { min: -5, max: 5 });
  action.content.curves.forEach((rawCurve, index) => {
    const curvePath = `${path}/content/curves/${index}`;
    requireObject(rawCurve, curvePath);
    const curve = rawCurve;
    requireString(curve.expression, `${curvePath}/expression`);
    if (curve.kind !== "implicit") {
      const expression = curve.expression.trim().replace(/^y\s*=/iu, "").trim();
      try {
        compileMathExpression(expression, ["x", ...variables.keys()]);
      } catch (error) {
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${curvePath}/expression`, `Invalid plot expression: ${error.message}`);
      }
      return;
    }
    const level = curve.level === void 0 ? 0 : requireFiniteNumber(curve.level, `${curvePath}/level`);
    const sampleCount = Number(curve.samples ?? 80);
    if (!Number.isInteger(sampleCount) || sampleCount < 16 || sampleCount > 200) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${curvePath}/samples`, "Implicit plot samples must be an integer from 16 to 200");
    }
    try {
      const evaluate2 = compileMathExpression(curve.expression, ["x", "y", ...variables.keys()]);
      const values = Object.fromEntries(variables);
      let minimum = Infinity;
      let maximum = -Infinity;
      for (let xIndex = 0; xIndex <= sampleCount; xIndex += 1) {
        const x = xRange.min + (xRange.max - xRange.min) * xIndex / sampleCount;
        for (let yIndex = 0; yIndex <= sampleCount; yIndex += 1) {
          const y = yRange.min + (yRange.max - yRange.min) * yIndex / sampleCount;
          const result = evaluate2({ ...values, x, y });
          if (!Number.isFinite(result))
            continue;
          minimum = Math.min(minimum, result);
          maximum = Math.max(maximum, result);
        }
      }
      if (!Number.isFinite(minimum) || minimum > level || maximum < level) {
        throw new Error("the requested level has no visible contour in the plot range");
      }
    } catch (error) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${curvePath}/expression`, `Invalid implicit plot expression: ${error.message}`);
    }
  });
}
function validateImageResource(action, path, resourceContext) {
  if (action.kind !== "image")
    return;
  const assetId = action.content?.asset_id;
  if (typeof assetId !== "string" || assetId.length === 0) {
    fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/asset_id`, "Image requires a controlled asset_id");
  }
  if (!resourceContext)
    return;
  const asset = resourceContext.assets?.find((candidate) => candidate.asset_id === assetId);
  if (!asset)
    fail("OLL_RESOURCE_DENIED", `${path}/content/asset_id`, `Asset '${assetId}' is not available in Session Context`);
  const allowedRegions = new Set((asset.regions ?? []).map((region) => region.region_id));
  (action.content.regions ?? []).forEach((region, index) => {
    if (!allowedRegions.has(region.source_region)) {
      fail("OLL_RESOURCE_DENIED", `${path}/content/regions/${index}/source_region`, `Region '${region.source_region}' is not available for '${assetId}'`);
    }
  });
}
function validateInkResource(action, path, resourceContext) {
  if (action.kind !== "ink")
    return;
  const content = action.content;
  if (content.annotation !== void 0 && action.place.relation !== "annotates") {
    fail("OLL_INVALID_PLACEMENT", `${path}/content/annotation`, "Only an annotation carries a position on its anchor");
  }
  if (action.place.relation === "annotates" && content.annotation === void 0) {
    fail("OLL_INVALID_PLACEMENT", `${path}/content/annotation`, "An annotation needs its position on the anchor");
  }
  if (content.shown_strokes !== void 0 && (!Number.isInteger(content.shown_strokes) || content.shown_strokes < 1)) {
    fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/content/shown_strokes`, "shown_strokes is a whole number of strokes, at least 1");
  }
  validateDrawnSize(content.drawn_size, `${path}/content/drawn_size`);
  if (!resourceContext)
    return;
  const snapshot = resourceContext.ink_snapshots?.find((candidate) => candidate.snapshot_id === content.snapshot_id);
  if (!snapshot)
    fail("OLL_RESOURCE_DENIED", `${path}/content/snapshot_id`, `Ink snapshot '${content.snapshot_id}' is not available in Session Context`);
  if (snapshot.sha256 !== content.sha256)
    fail("OLL_RESOURCE_DENIED", `${path}/content/sha256`, `Ink snapshot '${content.snapshot_id}' does not match its checksum`);
  const allowed = new Set(snapshot.selection_ids ?? []);
  (content.selections ?? []).forEach((selection, index) => {
    if (!allowed.has(selection.selection_id)) {
      fail("OLL_RESOURCE_DENIED", `${path}/content/selections/${index}/selection_id`, `Selection '${selection.selection_id}' is not part of '${content.snapshot_id}'`);
    }
  });
}
function validateDrawnSize(size, path) {
  if (size === void 0)
    return;
  const value2 = size;
  const fine = (n) => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 4e3;
  if (!size || typeof size !== "object" || Array.isArray(size) || !fine(value2.width) || !fine(value2.height) || Object.keys(size).some((key) => key !== "width" && key !== "height")) {
    fail("OLL_INVALID_OPERATION_PAYLOAD", path, "drawn_size is { width, height } in board units, each above 0 and at most 4000");
  }
}
function validatePlacement(place5, path, registry) {
  requireObject(place5, path);
  if (!PLACEMENT_RELATIONS.has(place5.relation)) {
    fail("OLL_INVALID_PLACEMENT", `${path}/relation`, `Unknown placement relation '${place5.relation}'`);
  }
  for (const forbidden of ["x", "y", "width", "height", "zoom", "duration_ms"]) {
    if (forbidden in place5)
      fail("OLL_INVALID_PLACEMENT", `${path}/${forbidden}`, `Authoring Profile cannot set '${forbidden}'`);
  }
  if (place5.relation === "continues") {
    const offset = place5.offset;
    const fine = (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 4e3;
    if (!offset || typeof offset !== "object" || Array.isArray(offset) || !fine(offset.x) || !fine(offset.y) || Object.keys(offset).some((key) => key !== "x" && key !== "y")) {
      fail("OLL_INVALID_PLACEMENT", `${path}/offset`, "A continuation needs its offset { x, y } from the anchor's top-left, in board units within \xB14000");
    }
  } else {
    if (place5.offset !== void 0)
      fail("OLL_INVALID_PLACEMENT", `${path}/offset`, "Only a continuation has an offset");
    if (place5.align === "equals" && place5.relation !== "replaces")
      fail("OLL_INVALID_PLACEMENT", `${path}/align`, "Only a continuation, or what replaces one, lines up its '='");
  }
  if (place5.relation === "new_region") {
    if (place5.anchor !== void 0)
      fail("OLL_INVALID_PLACEMENT", `${path}/anchor`, "new_region cannot use an anchor");
  } else if (place5.relation === "annotates" || place5.relation === "replaces" || place5.relation === "continues") {
    resolveLocal(registry, place5.anchor, `${path}/anchor`, ["node"]);
  } else {
    resolveLocal(registry, place5.anchor, `${path}/anchor`, ["node", "group"]);
  }
}
function validateActionPayload(action, path) {
  for (const field of Object.keys(action)) {
    if (!ACTION_FIELDS.has(field))
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/${field}`, `Unknown action field '${field}'`);
  }
  if (action.do !== "write" && "source" in action) {
    fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/source`, "Only a new card has a source");
  }
  if (action.do === "write") {
    requireAlias(action.as, `${path}/as`);
    requireString(action.kind, `${path}/kind`);
    requireString(action.role, `${path}/role`);
    requireObject(action.content, `${path}/content`);
    requireObject(action.place, `${path}/place`);
  } else if (action.do === "revise") {
    requireString(action.target, `${path}/target`);
    requireObject(action.content, `${path}/content`);
    if (action.content.bindings !== void 0) {
      fail("OLL_INVALID_BINDING", `${path}/content/bindings`, "Authoring bindings must be declared when a geometry or plot node is created");
    }
    requireString(action.reason, `${path}/reason`);
  } else if (action.do === "emphasize") {
    requireString(action.target, `${path}/target`);
    requireString(action.emphasis, `${path}/emphasis`);
  } else if (action.do === "connect") {
    requireAlias(action.as, `${path}/as`);
    requireString(action.from, `${path}/from`);
    requireString(action.to, `${path}/to`);
    requireString(action.relation, `${path}/relation`);
  } else if (action.do === "group") {
    requireAlias(action.as, `${path}/as`);
    requireString(action.role, `${path}/role`);
    requireString(action.label, `${path}/label`);
    requireArray(action.members, `${path}/members`);
  } else if (action.do === "focus") {
    requireArray(action.targets, `${path}/targets`);
    requireString(action.intent, `${path}/intent`);
  } else if (action.do === "point" || action.do === "hide") {
    requireString(action.target, `${path}/target`);
  } else if (action.do === "view") {
    requireString(action.target, `${path}/target`);
    if (action.show === void 0 === (action.preset === void 0)) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", path, "A view shows either one highlighted part or one preset");
    }
  } else if (action.do === "expression") {
    requireString(action.expression, `${path}/expression`);
  } else if (action.do === "animate") {
    requireVariableAlias(action.variable, `${path}/variable`);
    requireFiniteNumber(action.value, `${path}/value`);
    if (action.easing !== void 0 && !ANIMATION_EASINGS.has(action.easing)) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/easing`, `Unknown animation easing '${action.easing}'`);
    }
    if (action.duration_intent !== void 0 && !ANIMATION_DURATION_INTENTS.has(action.duration_intent)) {
      fail("OLL_INVALID_OPERATION_PAYLOAD", `${path}/duration_intent`, `Unknown animation duration intent '${action.duration_intent}'`);
    }
  }
}
function resolveLocal(registry, value2, path, allowedTypes = null) {
  const { alias, fragment } = splitTarget(value2, path);
  const entry = registry.get(alias);
  if (!entry) {
    fail("OLL_REFERENCE_NOT_FOUND", path, `Alias '${alias}' is not defined before use`);
  }
  if (allowedTypes && !allowedTypes.includes(entry.type)) {
    fail("OLL_INVALID_REFERENCE", path, `Alias '${alias}' has type '${entry.type}'`);
  }
  if (fragment && !entry.fragments.has(fragment)) {
    fail("OLL_REFERENCE_NOT_FOUND", path, `Fragment '${fragment}' does not exist on '${alias}'`);
  }
  return { alias, fragment, type: entry.type };
}
function validateAuthoringSchema(document2) {
  const valid = validateAuthoringDocument(document2);
  return {
    valid: Boolean(valid),
    errors: (validateAuthoringDocument.errors ?? []).map((error) => ({
      instancePath: error.instancePath,
      schemaPath: error.schemaPath,
      keyword: error.keyword,
      message: error.message ?? "Schema validation failed"
    }))
  };
}
function validateAuthoringLesson(document2, resourceContext = null) {
  requireObject(document2, "");
  if (document2.dsl !== "octos.lesson" || document2.version !== "0.1" || document2.profile !== "authoring") {
    fail("OLL_UNSUPPORTED_PROFILE", "", "Expected octos.lesson 0.1 Authoring Profile");
  }
  requireObject(document2.lesson, "/lesson");
  requireArray(document2.lesson.goals, "/lesson/goals");
  validateLessonAuthor(document2);
  const lessonVariables = validateLessonVariables(document2);
  const availableStudentControls = /* @__PURE__ */ new Map();
  const numberLineGrids = /* @__PURE__ */ new Map();
  const scene3dCameras = /* @__PURE__ */ new Map();
  for (const variable of document2.lesson.variables ?? []) {
    if (variable.control?.kind === "slider") {
      availableStudentControls.set(variable.as, /* @__PURE__ */ new Set(["slider"]));
    }
  }
  requireArray(document2.steps, "/steps");
  requireObject(document2.close, "/close");
  requireArray(document2.close.focus, "/close/focus");
  const registry = /* @__PURE__ */ new Map();
  const hidden = /* @__PURE__ */ new Set();
  const inkNodes = /* @__PURE__ */ new Map();
  const numberLineNodes = /* @__PURE__ */ new Set();
  const scene3dHighlights = /* @__PURE__ */ new Map();
  const knownSelections = new Set((resourceContext?.ink_snapshots ?? []).flatMap((snapshot) => snapshot.selection_ids ?? []));
  const requireLearnerTaught = (path, what) => {
    if (!isLearnerTaught(document2))
      fail("OLL_INVALID_OPERATION", path, `${what} is only available in learner-taught lessons`);
  };
  const requireVisible = (value2, path) => {
    if (typeof value2 !== "string")
      return;
    const alias = value2.split("#")[0];
    if (hidden.has(alias))
      fail("OLL_INVALID_REFERENCE", path, `'${alias}' is hidden`);
  };
  if (document2.board_context) {
    requireString(document2.board_context.board_id, "/board_context/board_id");
    if (!Number.isSafeInteger(document2.board_context.revision) || document2.board_context.revision < 0) {
      fail("OLL_INVALID_REFERENCE", "/board_context/revision", "Board revision must be a non-negative integer");
    }
    if (!Array.isArray(document2.board_context.references)) {
      fail("OLL_INVALID_REFERENCE", "/board_context/references", "Board references must be an array");
    }
    document2.board_context.references.forEach((reference, index) => {
      const path = `/board_context/references/${index}`;
      requireAlias(reference.as, `${path}/as`);
      if (registry.has(reference.as)) {
        fail("OLL_DUPLICATE_ALIAS", `${path}/as`, `Alias '${reference.as}' is already defined`);
      }
      if (!["node", "group", "connection"].includes(reference.type)) {
        fail("OLL_INVALID_REFERENCE", `${path}/type`, `Unknown reference type '${reference.type}'`);
      }
      requireString(reference.target_id, `${path}/target_id`);
      if (!Array.isArray(reference.fragments)) {
        fail("OLL_INVALID_REFERENCE", `${path}/fragments`, "Reference fragments must be an array");
      }
      const fragmentIds = /* @__PURE__ */ new Map();
      reference.fragments.forEach((fragment, fragmentIndex) => {
        const fragmentPath = `${path}/fragments/${fragmentIndex}`;
        requireAlias(fragment.as, `${fragmentPath}/as`);
        requireString(fragment.target_id, `${fragmentPath}/target_id`);
        if (fragmentIds.has(fragment.as)) {
          fail("OLL_DUPLICATE_ALIAS", `${fragmentPath}/as`, `Fragment '${fragment.as}' is duplicated`);
        }
        fragmentIds.set(fragment.as, fragment.target_id);
      });
      if (reference.type !== "node" && fragmentIds.size > 0) {
        fail("OLL_INVALID_REFERENCE", `${path}/fragments`, "Only node references can expose fragments");
      }
      registry.set(reference.as, {
        type: reference.type,
        id: reference.target_id,
        fragments: new Set(fragmentIds.keys()),
        fragmentIds,
        external: true
      });
    });
  }
  const stepKeys = /* @__PURE__ */ new Set();
  document2.steps.forEach((step, stepIndex) => {
    const stepPath = `/steps/${stepIndex}`;
    requireObject(step, stepPath);
    requireAlias(step.key, `${stepPath}/key`);
    if (stepKeys.has(step.key))
      fail("OLL_DUPLICATE_ALIAS", `${stepPath}/key`, `Step '${step.key}' is duplicated`);
    stepKeys.add(step.key);
    requireArray(step.beats, `${stepPath}/beats`);
    const beatKeys = /* @__PURE__ */ new Set();
    step.beats.forEach((beat, beatIndex) => {
      const beatPath = `${stepPath}/beats/${beatIndex}`;
      requireObject(beat, beatPath);
      requireAlias(beat.key, `${beatPath}/key`);
      if (beatKeys.has(beat.key))
        fail("OLL_DUPLICATE_ALIAS", `${beatPath}/key`, `Beat '${beat.key}' is duplicated`);
      beatKeys.add(beat.key);
      if (!Array.isArray(beat.actions))
        fail("OLL_INVALID_TYPE", `${beatPath}/actions`, "Expected an array");
      if (!beat.actions.length && !(isLearnerTaught(document2) && beat.say?.trim())) {
        fail("OLL_INVALID_OPERATION_PAYLOAD", `${beatPath}/actions`, "A beat needs at least one action; only a learner-taught beat may be words alone");
      }
      if (beat.start) {
        if (beat.start.kind === "practice")
          fail("OLL_INVALID_PHASE_START", `${beatPath}/start`, "Practice belongs on a student task");
        resolvePhaseStart(beat.start, document2.lesson.variables ?? [], `${beatPath}/start`);
      }
      beat.actions.forEach((action, actionIndex) => {
        const actionPath = `${beatPath}/actions/${actionIndex}`;
        requireObject(action, actionPath);
        if (!ACTIONS.has(action.do))
          fail("OLL_INVALID_OPERATION", `${actionPath}/do`, `Unknown action '${action.do}'`);
        validateActionPayload(action, actionPath);
        const phase = action.when ?? "during_speech";
        if (!PHASES.has(phase))
          fail("OLL_INVALID_PHASE", `${actionPath}/when`, `Unknown phase '${phase}'`);
        if (action.do === "write") {
          requireAlias(action.as, `${actionPath}/as`);
          requireObject(action.content, `${actionPath}/content`);
          validatePlacement(action.place, `${actionPath}/place`, registry);
          if (action.kind === "ink")
            requireLearnerTaught(`${actionPath}/kind`, "Learner ink");
          if (action.place.relation === "annotates") {
            requireLearnerTaught(`${actionPath}/place/relation`, "Annotating a card");
            if (action.kind !== "ink")
              fail("OLL_INVALID_PLACEMENT", `${actionPath}/place/relation`, "Only learner ink annotates a card");
          }
          if (action.place.anchor !== void 0)
            requireVisible(action.place.anchor, `${actionPath}/place/anchor`);
          if (action.place.relation === "replaces" && action.place.align === "equals" && action.kind !== "math") {
            fail("OLL_INVALID_PLACEMENT", `${actionPath}/place/align`, "Only math lines up its '='");
          }
          if (action.place.relation === "continues") {
            requireLearnerTaught(`${actionPath}/place/relation`, "Continuing a card");
            if (action.kind !== "ink" && action.kind !== "math")
              fail("OLL_INVALID_PLACEMENT", `${actionPath}/place/relation`, "Only learner ink or math continues a card");
            if (action.place.align === "equals" && action.kind !== "math")
              fail("OLL_INVALID_PLACEMENT", `${actionPath}/place/align`, "Only math lines up its '='");
          }
          if (action.place.relation === "replaces") {
            requireLearnerTaught(`${actionPath}/place/relation`, "Replacing a card");
            if (registry.get(action.place.anchor)?.external) {
              fail("OLL_INVALID_REFERENCE", `${actionPath}/place/anchor`, "External board references are read-only");
            }
            hidden.add(action.place.anchor);
          }
          validateInkResource(action, actionPath, resourceContext);
          if (action.kind === "ink") {
            inkNodes.set(action.as, action.place.relation);
            for (const selection of action.content.selections ?? [])
              knownSelections.add(selection.selection_id);
          }
          if (action.source !== void 0) {
            requireLearnerTaught(`${actionPath}/source`, "A learner-confirmed source");
            if (!knownSelections.has(action.source.selection)) {
              fail("OLL_REFERENCE_NOT_FOUND", `${actionPath}/source/selection`, `Selection '${action.source.selection}' is not part of this lesson's ink`);
            }
          }
          const fragments = collectAddressableContent(action.content, `${actionPath}/content`);
          const uniqueFragments = /* @__PURE__ */ new Set();
          for (const fragment of fragments) {
            requireAlias(fragment, `${actionPath}/content`);
            if (uniqueFragments.has(fragment))
              fail("OLL_DUPLICATE_ALIAS", `${actionPath}/content`, `Fragment '${fragment}' is duplicated`);
            uniqueFragments.add(fragment);
          }
          validateStructuredContent(action.content, `${actionPath}/content`, uniqueFragments);
          validateImageResource(action, actionPath, resourceContext);
          validateGeometryContent(action, actionPath, lessonVariables);
          validatePlotContent(action, actionPath, lessonVariables);
          validateScene3dContent(action, actionPath, lessonVariables);
          if (action.kind === NUMBER_LINE_KIND) {
            numberLineNodes.add(action.as);
            validateNumberLineContent(action.content, `${actionPath}/content`, (failPath, message) => fail("OLL_INVALID_OPERATION_PAYLOAD", failPath, message));
            for (const [pointIndex, point] of (action.content.points ?? []).entries()) {
              const variable = point.interaction?.variable;
              if (typeof variable !== "string")
                continue;
              const pointPath = `${actionPath}/content/points/${pointIndex}/interaction/variable`;
              if (!lessonVariables.has(variable))
                fail("OLL_REFERENCE_NOT_FOUND", pointPath, `Variable '${variable}' is not declared`);
              const bound = (action.content.bindings ?? []).some((binding) => binding.target === `${point.as}.value` && String(binding.expression).trim() === variable);
              if (!bound)
                fail("OLL_INVALID_BINDING", pointPath, `A draggable point is bound to its variable: add {"target": "${point.as}.value", "expression": "${variable}"}`);
              if (numberLineGrids.has(variable))
                fail("OLL_INVALID_OPERATION_PAYLOAD", pointPath, `Variable '${variable}' is already dragged on a number line`);
              numberLineGrids.set(variable, action.content);
              const controls = availableStudentControls.get(variable) ?? /* @__PURE__ */ new Set();
              controls.add("number_line_point");
              availableStudentControls.set(variable, controls);
            }
          }
          if (action.kind === "scene3d") {
            scene3dHighlights.set(action.as, new Set((action.content.highlights ?? []).map((highlight) => highlight.as)));
            const camera = action.content.camera;
            scene3dCameras.set(action.as, {
              yaw: camera.yaw,
              pitch: camera.pitch,
              zoom: camera.zoom
            });
          }
          if (action.kind === "geometry" && Array.isArray(action.content.points)) {
            for (const point of action.content.points) {
              const interaction = point?.interaction;
              if (interaction?.kind !== "angle_control" || typeof interaction.variable !== "string")
                continue;
              const controls = availableStudentControls.get(interaction.variable) ?? /* @__PURE__ */ new Set();
              controls.add("geometry_point");
              availableStudentControls.set(interaction.variable, controls);
            }
          }
          validateValueBindings(action, actionPath, lessonVariables);
          if (action.kind === NUMBER_LINE_KIND)
            checkNumberLineBoundValues(action.content, `${actionPath}/content`, document2.lesson.variables ?? []);
          register(registry, action.as, "node", `${actionPath}/as`, fragments);
          return;
        }
        if (action.do === "animate") {
          const variable = document2.lesson.variables?.find((candidate) => candidate.as === action.variable);
          if (!variable)
            fail("OLL_REFERENCE_NOT_FOUND", `${actionPath}/variable`, `Variable '${action.variable}' is not declared`);
          if (action.value < variable.min || action.value > variable.max) {
            fail("OLL_INVALID_VARIABLE", `${actionPath}/value`, `Animation target for '${action.variable}' is outside its range`);
          }
          return;
        }
        if (["emphasize", "point"].includes(action.do)) {
          resolveLocal(registry, action.target, `${actionPath}/target`, ["node", "connection", "group"]);
          requireVisible(action.target, `${actionPath}/target`);
          return;
        }
        if (action.do === "view") {
          const target = resolveLocal(registry, action.target, `${actionPath}/target`, ["node"]);
          const highlights = scene3dHighlights.get(target.alias);
          if (!highlights || target.fragment)
            fail("OLL_INVALID_REFERENCE", `${actionPath}/target`, "A view turns a whole 3D scene of this lesson");
          requireVisible(action.target, `${actionPath}/target`);
          if (action.show !== void 0) {
            const shown = resolveLocal(registry, action.show, `${actionPath}/show`, ["node"]);
            if (shown.alias !== target.alias || !shown.fragment || !highlights.has(shown.fragment)) {
              fail("OLL_INVALID_REFERENCE", `${actionPath}/show`, "A view shows a highlighted part of the same scene");
            }
          }
          return;
        }
        if (action.do === "hide") {
          requireLearnerTaught(`${actionPath}/do`, "Hiding a card");
          const resolved = resolveLocal(registry, action.target, `${actionPath}/target`, ["node"]);
          if (resolved.fragment)
            fail("OLL_INVALID_REFERENCE", `${actionPath}/target`, "Hide a whole card, not part of it");
          if (registry.get(resolved.alias)?.external) {
            fail("OLL_INVALID_REFERENCE", `${actionPath}/target`, "External board references are read-only");
          }
          requireVisible(action.target, `${actionPath}/target`);
          hidden.add(resolved.alias);
          return;
        }
        if (action.do === "revise") {
          const resolved = resolveLocal(registry, action.target, `${actionPath}/target`, ["node"]);
          if (registry.get(resolved.alias)?.external) {
            fail("OLL_INVALID_REFERENCE", `${actionPath}/target`, "External board references are read-only");
          }
          requireVisible(action.target, `${actionPath}/target`);
          if (inkNodes.has(resolved.alias)) {
            validateInkResource({ do: "write", as: resolved.alias, kind: "ink", role: "ink", content: action.content, place: { relation: inkNodes.get(resolved.alias) } }, actionPath, resourceContext);
          }
          if (numberLineNodes.has(resolved.alias)) {
            validateNumberLineContent(action.content, `${actionPath}/content`, (failPath, message) => fail("OLL_INVALID_OPERATION_PAYLOAD", failPath, message));
            if ((action.content.points ?? []).some((point) => point.interaction !== void 0)) {
              fail("OLL_INVALID_OPERATION_PAYLOAD", `${actionPath}/content/points`, "A draggable point is declared when the number line is written");
            }
          }
          const revisedFragments = collectAddressableContent(action.content, `${actionPath}/content`);
          if (revisedFragments.length) {
            const unique = /* @__PURE__ */ new Set();
            for (const fragment of revisedFragments) {
              requireAlias(fragment, `${actionPath}/content`);
              if (unique.has(fragment))
                fail("OLL_DUPLICATE_ALIAS", `${actionPath}/content`, `Fragment '${fragment}' is duplicated`);
              unique.add(fragment);
            }
            validateStructuredContent(action.content, `${actionPath}/content`, unique);
            registry.get(resolved.alias).fragments = unique;
          }
          return;
        }
        if (action.do === "connect") {
          resolveLocal(registry, action.from, `${actionPath}/from`);
          resolveLocal(registry, action.to, `${actionPath}/to`);
          requireVisible(action.from, `${actionPath}/from`);
          requireVisible(action.to, `${actionPath}/to`);
          register(registry, action.as, "connection", `${actionPath}/as`);
          return;
        }
        if (action.do === "group") {
          requireArray(action.members, `${actionPath}/members`);
          for (let index = 0; index < action.members.length; index += 1) {
            resolveLocal(registry, action.members[index], `${actionPath}/members/${index}`, ["node", "group"]);
          }
          register(registry, action.as, "group", `${actionPath}/as`);
          return;
        }
        if (action.do === "focus") {
          requireArray(action.targets, `${actionPath}/targets`);
          for (let index = 0; index < action.targets.length; index += 1) {
            resolveLocal(registry, action.targets[index], `${actionPath}/targets/${index}`, ["node", "group", "connection"]);
            requireVisible(action.targets[index], `${actionPath}/targets/${index}`);
          }
        }
      });
    });
  });
  validateStudentTasks(document2, lessonVariables, availableStudentControls, scene3dCameras, registry, numberLineGrids);
  validateReflections(document2, registry);
  if (document2.close?.focus) {
    for (let index = 0; index < document2.close.focus.length; index += 1) {
      resolveLocal(registry, document2.close.focus[index], `/close/focus/${index}`, ["node", "group", "connection"]);
      requireVisible(document2.close.focus[index], `/close/focus/${index}`);
    }
  }
  return { registry };
}
function stableId(host, type, alias) {
  return `${host.lessonId}:${type}:${alias}`;
}
function normalizeAddressableContent(_host, nodeId, content) {
  const clone = structuredClone(content);
  for (const field of ["fragments", "curves", "points", "guides", "regions", "elements", "edges", "polygons", "regular_polygons", "circles", "segments", "arcs", "objects", "sections", "highlights", "selections", "jumps", "intervals"]) {
    if (!Array.isArray(clone?.[field]))
      continue;
    clone[field] = clone[field].map((item) => {
      if (!item.as)
        return item;
      const { as, ...rest } = item;
      const normalized = { id: `${nodeId}:fragment:${as}`, ...rest };
      if (field === "edges") {
        normalized.from = `${nodeId}:fragment:${item.from}`;
        normalized.to = `${nodeId}:fragment:${item.to}`;
      }
      if (field === "circles" || field === "regular_polygons") {
        normalized.center = `${nodeId}:fragment:${item.center}`;
      }
      if (field === "segments") {
        normalized.from = `${nodeId}:fragment:${item.from}`;
        normalized.to = `${nodeId}:fragment:${item.to}`;
      }
      if (field === "arcs") {
        normalized.center = `${nodeId}:fragment:${item.center}`;
      }
      if (field === "jumps" && typeof item.from === "string" && numberLineValue(item.from) === void 0) {
        normalized.from = `${nodeId}:fragment:${item.from}`;
      }
      if (field === "polygons" && Array.isArray(item.points)) {
        normalized.points = item.points.map((point) => `${nodeId}:fragment:${point}`);
      }
      if (field === "points" && item.interaction?.kind === "angle_control") {
        normalized.interaction = {
          ...structuredClone(item.interaction),
          center: `${nodeId}:fragment:${item.interaction.center}`
        };
      }
      if (field === "regions" && Array.isArray(item.members)) {
        normalized.members = item.members.map((member) => `${nodeId}:fragment:${member}`);
      }
      if (field === "sections" && Array.isArray(item.targets)) {
        normalized.targets = item.targets.map((target) => `${nodeId}:fragment:${target}`);
      }
      return normalized;
    });
  }
  if (Array.isArray(clone.bindings)) {
    clone.bindings = clone.bindings.map((binding) => {
      const { alias, property } = splitBindingTarget(binding.target, "content.bindings.target");
      return {
        target: `${nodeId}:fragment:${alias}.${property}`,
        expression: binding.expression,
        ...binding.label !== void 0 ? { label: structuredClone(binding.label) } : {},
        ...binding.allow_zero === true ? { allow_zero: true } : {},
        ...binding.hide_when_undefined === true ? { hide_when_undefined: true } : {}
      };
    });
  }
  return clone;
}
function buildCanonicalRegistry(document2, host) {
  const registry = /* @__PURE__ */ new Map();
  for (const reference of document2.board_context?.references ?? []) {
    registry.set(reference.as, {
      type: reference.type,
      id: reference.target_id,
      fragments: new Set(reference.fragments.map((fragment) => fragment.as)),
      fragmentIds: new Map(reference.fragments.map((fragment) => [
        fragment.as,
        fragment.target_id
      ])),
      external: true
    });
  }
  for (const step of document2.steps) {
    for (const beat of step.beats) {
      for (const action of beat.actions) {
        if (action.do === "write") {
          registry.set(action.as, {
            type: "node",
            id: stableId(host, "node", action.as),
            fragments: new Set(collectAddressableContent(action.content))
          });
        } else if (action.do === "connect") {
          registry.set(action.as, { type: "connection", id: stableId(host, "connection", action.as), fragments: /* @__PURE__ */ new Set() });
        } else if (action.do === "group") {
          registry.set(action.as, { type: "group", id: stableId(host, "group", action.as), fragments: /* @__PURE__ */ new Set() });
        }
      }
    }
  }
  return registry;
}
function canonicalTarget(registry, value2) {
  const { alias, fragment } = splitTarget(value2, "target");
  const entry = registry.get(alias);
  if (!entry)
    fail("OLL_REFERENCE_NOT_FOUND", "target", `Unknown alias '${alias}'`);
  if (entry.type === "group")
    return { group_id: entry.id };
  if (entry.type === "connection")
    return { connection_id: entry.id };
  return {
    node_id: entry.id,
    ...fragment ? {
      fragment_id: entry.fragmentIds?.get(fragment) ?? `${entry.id}:fragment:${fragment}`
    } : {}
  };
}
function requireRegistryId(registry, alias) {
  const id = registry.get(alias)?.id;
  if (!id)
    fail("OLL_REFERENCE_NOT_FOUND", "target", `No canonical ID exists for alias '${alias}'`);
  return id;
}
function requireCanonicalId(target) {
  const id = target.node_id ?? target.group_id ?? target.connection_id;
  if (!id)
    fail("OLL_REFERENCE_NOT_FOUND", "target", "Canonical target has no addressable ID");
  return id;
}
function normalizePlacement(registry, place5) {
  const result = { ...place5 };
  if (place5.anchor) {
    const target = canonicalTarget(registry, place5.anchor);
    delete result.anchor;
    result.anchor = requireCanonicalId(target);
  }
  return result;
}
function normalizeAction(action, context) {
  const { host, registry, sequence, beatIndex, actionIndex } = context;
  const actionId = `${host.lessonId}:action:${sequence}:${beatIndex + 1}:${actionIndex + 1}`;
  if (action.do === "write") {
    const nodeId = requireRegistryId(registry, action.as);
    return {
      action_id: actionId,
      op: "board.create",
      node: {
        id: nodeId,
        kind: action.kind,
        role: action.role,
        content: normalizeAddressableContent(host, nodeId, action.content),
        placement: normalizePlacement(registry, action.place),
        ...action.source ? { source: structuredClone(action.source) } : {},
        ...host.regionId ? { region_id: host.regionId } : {}
      }
    };
  }
  if (action.do === "emphasize") {
    return { action_id: actionId, op: "board.emphasize", target: canonicalTarget(registry, action.target), emphasis: action.emphasis };
  }
  if (action.do === "point") {
    return { action_id: actionId, op: "teacher.point", target: canonicalTarget(registry, action.target) };
  }
  if (action.do === "expression") {
    return { action_id: actionId, op: "teacher.expression", expression: action.expression };
  }
  if (action.do === "animate") {
    return {
      action_id: actionId,
      op: "lesson.variable.animate",
      animation: {
        variable: action.variable,
        to: action.value,
        easing: action.easing ?? "linear",
        duration_intent: action.duration_intent ?? "normal"
      }
    };
  }
  if (action.do === "connect") {
    return {
      action_id: actionId,
      op: "board.connect",
      connection: {
        id: requireRegistryId(registry, action.as),
        from: canonicalTarget(registry, action.from),
        to: canonicalTarget(registry, action.to),
        relation: action.relation,
        ...action.label ? { label: action.label } : {}
      }
    };
  }
  if (action.do === "group") {
    return {
      action_id: actionId,
      op: "board.group",
      group: {
        id: requireRegistryId(registry, action.as),
        title: action.label,
        role: action.role,
        members: action.members.map((member) => {
          const target = canonicalTarget(registry, member);
          return requireCanonicalId(target);
        })
      }
    };
  }
  if (action.do === "focus") {
    return {
      action_id: actionId,
      op: "board.focus",
      focus: {
        targets: action.targets.map((target) => {
          const resolved = canonicalTarget(registry, target);
          return requireCanonicalId(resolved);
        }),
        intent: action.intent
      }
    };
  }
  if (action.do === "hide") {
    return { action_id: actionId, op: "board.hide", target: canonicalTarget(registry, action.target) };
  }
  if (action.do === "view") {
    return {
      action_id: actionId,
      op: "scene3d.view",
      target: canonicalTarget(registry, action.target),
      view: action.show !== void 0 ? { show: canonicalTarget(registry, action.show) } : { preset: action.preset }
    };
  }
  if (action.do === "revise") {
    const target = canonicalTarget(registry, action.target);
    return {
      action_id: actionId,
      op: "board.revise",
      target,
      revision: {
        content: normalizeAddressableContent(host, target.node_id, action.content),
        reason: action.reason
      }
    };
  }
  fail("OLL_INVALID_OPERATION", "action", "Unsupported authoring action");
}
function normalizeAuthoringLesson(document2, host) {
  validateAuthoringLesson(document2, host?.resourceContext);
  requireObject(host, "host");
  for (const field of ["lessonId", "boardId", "baseRevision"]) {
    if (host[field] === void 0 || host[field] === null)
      fail("OLL_MISSING_HOST_FIELD", `host/${field}`, `Missing host field '${field}'`);
  }
  if (document2.board_context) {
    if (document2.board_context.board_id !== host.boardId) {
      fail("OLL_INVALID_REFERENCE", "/board_context/board_id", "Board context does not match the host board");
    }
    if (document2.board_context.revision !== host.baseRevision) {
      fail("OLL_INVALID_REFERENCE", "/board_context/revision", "Board context revision does not match the host revision");
    }
  }
  const registry = buildCanonicalRegistry(document2, host);
  const canonicalLesson = structuredClone(document2.lesson);
  for (const reflection of canonicalLesson.reflections ?? []) {
    reflection.anchor = requireRegistryId(registry, reflection.anchor);
  }
  for (const candidate of canonicalLesson.tasks ?? []) {
    if (candidate.start)
      candidate.start.values = resolvePhaseStart(candidate.start, document2.lesson.variables ?? [], `/lesson/tasks/${candidate.as}/start`);
    if (candidate.completion.kind === "numeric_answer") {
      const answerTask = candidate;
      answerTask.anchor = requireRegistryId(registry, answerTask.anchor);
      continue;
    }
    const task = candidate;
    if (task.completion.kind !== "scene3d_view_target")
      continue;
    task.completion.node = requireRegistryId(registry, task.completion.node);
    for (const operation of task.allowed_operations) {
      operation.node = requireRegistryId(registry, operation.node);
    }
  }
  const events = [
    {
      dsl: "octos.lesson",
      version: "0.1",
      profile: "canonical",
      event: "lesson.open",
      lesson_id: host.lessonId,
      sequence: 0,
      board: {
        board_id: host.boardId,
        base_revision: host.baseRevision,
        region_intent: host.regionIntent ?? "new_topic",
        ...host.regionId ? { region_id: host.regionId } : {}
      },
      lesson: canonicalLesson
    }
  ];
  document2.steps.forEach((step, stepIndex) => {
    const sequence = stepIndex + 1;
    events.push({
      dsl: "octos.lesson",
      version: "0.1",
      profile: "canonical",
      event: "lesson.step",
      lesson_id: host.lessonId,
      sequence,
      step: {
        id: stableId(host, "step", step.key),
        purpose: step.purpose,
        beats: step.beats.map((beat, beatIndex) => {
          const stage = { before_speech: [], during_speech: [], after_speech: [] };
          beat.actions.forEach((action, actionIndex) => {
            const phase = action.when ?? "during_speech";
            stage[phase].push(normalizeAction(action, { host, registry, sequence, beatIndex, actionIndex }));
          });
          if (beat.start?.kind === "replay") {
            stage.before_speech.unshift({
              action_id: `${stableId(host, "step", step.key)}:beat:${beat.key}:phase-start`,
              op: "lesson.phase.start",
              transition: {
                kind: "replay",
                values: resolvePhaseStart(beat.start, document2.lesson.variables ?? [], `/steps/${stepIndex}/beats/${beatIndex}/start`),
                source_path: `/steps/${stepIndex}/beats/${beatIndex}/start`
              }
            });
          }
          return {
            id: `${stableId(host, "step", step.key)}:beat:${beat.key}`,
            ...beat.say ? { narration: { text: beat.say, ...beat.delivery ? { delivery: beat.delivery } : {} } } : {},
            ...beat.pace ? { pace: beat.pace } : {},
            stage
          };
        })
      }
    });
  });
  const focus = (document2.close?.focus ?? []).map((target) => {
    const resolved = canonicalTarget(registry, target);
    return requireCanonicalId(resolved);
  });
  events.push({
    dsl: "octos.lesson",
    version: "0.1",
    profile: "canonical",
    event: "lesson.close",
    lesson_id: host.lessonId,
    sequence: document2.steps.length + 1,
    result: {
      summary: document2.close?.summary ?? "",
      summary_node_refs: [],
      suggested_focus: focus
    }
  });
  return events;
}
function createSemanticBoardState(open) {
  if (open.event !== "lesson.open")
    fail("OLL_INVALID_EVENT", "/0/event", "First event must be lesson.open");
  if (!open.board)
    fail("OLL_INVALID_EVENT", "/0/board", "lesson.open must include board state");
  const variables = Object.fromEntries((open.lesson?.variables ?? []).map((variable) => [
    variable.as,
    {
      value: variable.initial,
      initial: variable.initial,
      min: variable.min,
      max: variable.max,
      ...variable.wrap ? { wrap: true } : {},
      ...variable.label ? { label: variable.label } : {},
      ...variable.unit ? { unit: variable.unit } : {},
      ...variable.control ? { control: structuredClone(variable.control) } : {}
    }
  ]));
  return {
    board_id: open.board.board_id,
    revision: open.board.base_revision,
    nodes: {},
    connections: {},
    groups: {},
    focus: [],
    applied_lessons: [open.lesson_id],
    applied_steps: [],
    applied_actions: [],
    ...Object.keys(variables).length ? { variables } : {}
  };
}
function bindingValues(state) {
  return Object.fromEntries(Object.entries(state.variables ?? {}).map(([alias, variable]) => [alias, variable.value]));
}
function bindingTarget(content, target) {
  const separator = target.lastIndexOf(".");
  if (separator <= 0)
    fail("OLL_INVALID_BINDING", "content.bindings.target", `Invalid canonical binding target '${target}'`);
  const fragmentId = target.slice(0, separator);
  const property = target.slice(separator + 1);
  for (const [field, properties] of Object.entries(OLL_CANONICAL_BINDING_CAPABILITIES)) {
    const record3 = (Array.isArray(content[field]) ? content[field] : []).find((item) => item.id === fragmentId);
    if (record3 && properties.includes(property))
      return { record: record3, property };
    if (record3)
      fail("OLL_INVALID_BINDING", "content.bindings.target", `Property '${property}' cannot be bound on '${field}'`);
  }
  fail("OLL_REFERENCE_NOT_FOUND", "content.bindings.target", `Canonical binding target '${target}' was not found`);
}
function formatBoundNumericLabel(value2, format) {
  if (!Number.isFinite(value2) || !Number.isInteger(format.precision) || format.precision < 0 || format.precision > 6) {
    fail("OLL_INVALID_BINDING", "binding.label", "Cannot format a non-finite value or invalid precision");
  }
  const rounded = Number(value2.toFixed(format.precision));
  return `${format.prefix ?? ""}${Object.is(rounded, -0) ? 0 : rounded}${format.suffix ?? ""}`;
}
function evaluateContentBindings(content, variables) {
  const evaluated = structuredClone(content);
  for (const binding of Array.isArray(evaluated.bindings) ? evaluated.bindings : []) {
    if (binding.hide_when_undefined === true)
      delete bindingTarget(evaluated, binding.target).record.binding_undefined;
  }
  for (const binding of Array.isArray(evaluated.bindings) ? evaluated.bindings : []) {
    const { record: record3, property } = bindingTarget(evaluated, binding.target);
    if (binding.hide_when_undefined === true) {
      let value2;
      try {
        value2 = evaluateMathExpression(binding.expression, variables);
      } catch {
        value2 = void 0;
      }
      if (value2 === void 0 || !Number.isFinite(value2)) {
        record3.binding_undefined = true;
        continue;
      }
    }
    try {
      record3[property] = evaluateMathExpression(binding.expression, variables);
      if (property === "radius" && (record3[property] < 0 || record3[property] === 0 && binding.allow_zero !== true)) {
        throw new Error("Bound radius must be positive unless explicitly allowed to degenerate to zero");
      }
      if (property === "unfold")
        record3[property] = Math.min(1, Math.max(0, record3[property]));
      if (property === "sides" && (record3[property] < 3 || record3[property] > 384)) {
        throw new Error("Bound polygon sides must be in 3..384");
      }
      if (binding.label)
        record3.label = formatBoundNumericLabel(record3[property], binding.label);
    } catch (error) {
      const message = error instanceof Error ? error.message : "binding evaluation failed";
      fail("OLL_BINDING_EVALUATION_FAILED", "content.bindings.expression", message);
    }
  }
  return evaluated;
}
function canonicalTargetExists(state, target) {
  if (!target)
    return false;
  if (target.node_id)
    return Boolean(state.nodes[target.node_id]);
  if (target.connection_id)
    return Boolean(state.connections[target.connection_id]);
  if (target.group_id)
    return Boolean(state.groups[target.group_id]);
  return false;
}
function applyCanonicalAction(state, action) {
  if (state.applied_actions.includes(action.action_id))
    return false;
  if (action.op === "board.create") {
    if (!action.node)
      fail("OLL_INVALID_EVENT", "action.node", "board.create requires node");
    if (state.nodes[action.node.id])
      fail("OLL_DUPLICATE_NODE_ID", "action.node.id", `Node '${action.node.id}' already exists`);
    const anchor = action.node.placement?.anchor;
    if (anchor && !state.nodes[anchor] && !state.groups[anchor])
      fail("OLL_REFERENCE_NOT_FOUND", "action.node.placement.anchor", `Anchor '${anchor}' not found`);
    const node = structuredClone(action.node);
    node.content = evaluateContentBindings(node.content, bindingValues(state));
    state.nodes[action.node.id] = node;
    if (action.node.placement?.relation === "replaces") {
      const replaced = state.nodes[anchor];
      if (!replaced)
        fail("OLL_REFERENCE_NOT_FOUND", "action.node.placement.anchor", `Replaced node '${anchor}' not found`);
      replaced.hidden = true;
      replaced.replaced_by = action.node.id;
      state.focus = state.focus.filter((id) => id !== anchor);
    }
  } else if (action.op === "board.connect") {
    if (!action.connection)
      fail("OLL_INVALID_EVENT", "action.connection", "board.connect requires connection");
    if (state.connections[action.connection.id])
      fail("OLL_DUPLICATE_CONNECTION_ID", "action.connection.id", `Connection '${action.connection.id}' already exists`);
    if (!canonicalTargetExists(state, action.connection.from))
      fail("OLL_REFERENCE_NOT_FOUND", "action.connection.from", "Connection source not found");
    if (!canonicalTargetExists(state, action.connection.to))
      fail("OLL_REFERENCE_NOT_FOUND", "action.connection.to", "Connection target not found");
    state.connections[action.connection.id] = structuredClone(action.connection);
  } else if (action.op === "board.group") {
    if (!action.group)
      fail("OLL_INVALID_EVENT", "action.group", "board.group requires group");
    if (state.groups[action.group.id])
      fail("OLL_DUPLICATE_GROUP_ID", "action.group.id", `Group '${action.group.id}' already exists`);
    for (const member of action.group.members ?? []) {
      if (!state.nodes[member] && !state.groups[member])
        fail("OLL_REFERENCE_NOT_FOUND", "action.group.members", `Group member '${member}' not found`);
    }
    state.groups[action.group.id] = structuredClone(action.group);
  } else if (action.op === "board.focus") {
    if (!action.focus)
      fail("OLL_INVALID_EVENT", "action.focus", "board.focus requires focus");
    for (const target of action.focus.targets) {
      if (!state.nodes[target] && !state.groups[target] && !state.connections[target])
        fail("OLL_REFERENCE_NOT_FOUND", "action.focus.targets", `Focus target '${target}' not found`);
    }
    state.focus = [...action.focus.targets];
  } else if (action.op === "board.revise") {
    if (!action.target?.node_id || !action.revision)
      fail("OLL_INVALID_EVENT", "action", "board.revise requires a node target and revision");
    const node = state.nodes[action.target.node_id];
    if (!node)
      fail("OLL_REFERENCE_NOT_FOUND", "action.target", `Node '${action.target.node_id}' not found`);
    node.content = evaluateContentBindings(action.revision.content, bindingValues(state));
  } else if (action.op === "board.emphasize") {
    if (!action.target || !action.emphasis)
      fail("OLL_INVALID_EVENT", "action.target", "board.emphasize requires target and emphasis");
    const target = action.target.node_id ? state.nodes[action.target.node_id] : action.target.connection_id ? state.connections[action.target.connection_id] : action.target.group_id ? state.groups[action.target.group_id] : void 0;
    if (!target)
      fail("OLL_REFERENCE_NOT_FOUND", "action.target", "Emphasis target not found");
    target.emphasis = [...target.emphasis ?? [], { target: action.target, emphasis: action.emphasis }];
  } else if (action.op === "board.hide") {
    const node = action.target?.node_id ? state.nodes[action.target.node_id] : void 0;
    if (!node)
      fail("OLL_REFERENCE_NOT_FOUND", "action.target", "Hidden node not found");
    node.hidden = true;
    state.focus = state.focus.filter((id) => id !== node.id);
  } else if (action.op === "scene3d.view") {
    const node = action.target?.node_id ? state.nodes[action.target.node_id] : void 0;
    if (!node || node.kind !== "scene3d" || !action.view)
      fail("OLL_REFERENCE_NOT_FOUND", "action.target", "View target is not a 3D scene");
    node.view_intent = structuredClone(action.view);
  } else if (action.op === "teacher.point") {
    if (!canonicalTargetExists(state, action.target))
      fail("OLL_REFERENCE_NOT_FOUND", "action.target", "Point target not found");
  } else if (action.op === "teacher.expression") {
    if (!action.expression)
      fail("OLL_INVALID_EVENT", "action.expression", "teacher.expression requires expression");
  } else if (action.op === "lesson.phase.start") {
    if (!action.transition)
      fail("OLL_INVALID_EVENT", "action.transition", "Phase start requires transition targets");
    Object.assign(state, setLessonVariables(state, action.transition.values));
  } else if (action.op === "lesson.variable.animate") {
    if (!action.animation)
      fail("OLL_INVALID_EVENT", "action.animation", "lesson.variable.animate requires animation");
    const updated = setLessonVariable(state, action.animation.variable, action.animation.to);
    Object.assign(state, updated);
  } else {
    fail("OLL_INVALID_OPERATION", "action.op", `Unknown canonical operation '${action.op}'`);
  }
  state.applied_actions.push(action.action_id);
  return true;
}
function setLessonVariable(state, alias, value2) {
  return setLessonVariables(state, { [alias]: value2 });
}
function setLessonVariables(state, changes) {
  const updated = structuredClone(state);
  for (const [alias, value2] of Object.entries(changes)) {
    const variable = updated.variables?.[alias];
    if (!variable)
      fail("OLL_REFERENCE_NOT_FOUND", `variables/${alias}`, `Variable '${alias}' is not defined`);
    if (!Number.isFinite(value2) || value2 < variable.min || value2 > variable.max) {
      fail("OLL_INVALID_VARIABLE", `variables/${alias}/value`, `Variable '${alias}' must be between ${variable.min} and ${variable.max}`);
    }
    variable.value = value2;
  }
  const values = bindingValues(updated);
  for (const node of Object.values(updated.nodes)) {
    node.content = evaluateContentBindings(node.content, values);
  }
  return updated;
}
function commitCanonicalStep(state, stepId) {
  if (state.applied_steps.includes(stepId))
    return false;
  state.applied_steps.push(stepId);
  state.revision += 1;
  return true;
}
function applyLessonClose(state, event) {
  if (event.event !== "lesson.close")
    fail("OLL_INVALID_EVENT", "event", "Expected lesson.close");
  state.focus = [...event.result?.suggested_focus ?? state.focus];
}
function reduceCanonicalEvents(events) {
  requireArray(events, "events");
  const open = events[0];
  const state = createSemanticBoardState(open);
  for (const event of events.slice(1)) {
    if (event.event === "lesson.close") {
      applyLessonClose(state, event);
      continue;
    }
    if (event.event !== "lesson.step")
      fail("OLL_INVALID_EVENT", "event", `Unexpected event '${event.event}'`);
    if (!event.step)
      fail("OLL_INVALID_EVENT", "event.step", "lesson.step must include a step");
    const step = event.step;
    if (state.applied_steps.includes(step.id))
      continue;
    for (const beat of step.beats) {
      for (const phase of ["before_speech", "during_speech", "after_speech"]) {
        for (const action of beat.stage[phase]) {
          applyCanonicalAction(state, action);
        }
      }
    }
    commitCanonicalStep(state, step.id);
  }
  return canonicalizeState(state);
}
function canonicalizeState(state) {
  const sortObject = (value2) => Object.fromEntries(Object.entries(value2).sort(([a], [b]) => a.localeCompare(b)));
  return {
    ...structuredClone(state),
    nodes: sortObject(state.nodes),
    connections: sortObject(state.connections),
    groups: sortObject(state.groups),
    ...state.variables ? { variables: sortObject(state.variables) } : {},
    applied_actions: [...state.applied_actions]
  };
}

// node_modules/octos-lesson-language/dist/packages/plugin-math/src/solids.js
var POLYHEDRON_REACH = { tetrahedron: 1 / Math.sqrt(3), octahedron: 1, dodecahedron: 0.7947, icosahedron: 0.8507 };

// node_modules/octos-lesson-language/dist/packages/plugin-math/src/rearrangement.js
var REARRANGEMENT_CONSTRUCTIONS = {
  right_triangle_square: {
    title: "\u76F4\u89D2\u4E09\u89D2\u5F62\u91CD\u6392\u4E0E\u9762\u79EF\u5173\u7CFB",
    catalog: "4\u5168\u7B49\u76F4\u89D2\u4E09\u89D2\u5F62\uFF1B\u5916\u6846a+b\uFF1B\u7559\u767Dc\xB2\u2192a\xB2+b\xB2\uFF08\u52FE\u80A1\uFF09",
    pieces: "4\u4E2A\u5168\u7B49\u76F4\u89D2\u4E09\u89D2\u5F62\uFF08\u4E24\u76F4\u89D2\u8FB9a\u3001b\uFF0C\u659C\u8FB9c\uFF09",
    shows: "c\xB2 = a\xB2 + b\xB2",
    container: "\u5916\u6846\u8FB9\u957Fa+b\uFF0C\u9762\u79EF(a+b)\xB2\uFF1B\u4E0D\u662F\u8FB9\u957Fc\u7684\u6B63\u65B9\u5F62",
    initial: "\u56DB\u4E2A\u4E09\u89D2\u5F62\u56F4\u4F4F\u8FB9\u957Fc\u7684\u6B63\u65B9\u5F62\u7559\u767D\uFF0C\u9762\u79EFc\xB2",
    final: "\u4E09\u89D2\u5F62\u62FC\u6210\u4E24\u4E2Aab\u77E9\u5F62\uFF0C\u7559\u767D\u4E3Aa\xB2\u548Cb\xB2\u4E24\u4E2A\u6B63\u65B9\u5F62",
    proof: "\u6BD4\u8F83\u4E24\u4E2A\u7AEF\u70B9\uFF1A(a+b)\xB2 \u2212 4\xD7ab/2 = c\xB2 = a\xB2+b\xB2",
    caption: "\u5916\u6846\u8FB9\u957F a+b\u3002\u8D77\u70B9\u7559\u767D c\xB2 \u2192 \u7EC8\u70B9\u7559\u767D a\xB2+b\xB2\uFF1B\u56DB\u4E2A\u4E09\u89D2\u5F62\u7684\u603B\u9762\u79EF\u59CB\u7EC8\u4E3A 4\xD7ab/2\u3002\u6BD4\u8F83\u4E24\u79CD\u5E03\u5C40\u7684\u7559\u767D\uFF1Ac\xB2 = a\xB2+b\xB2\u3002"
  },
  square_area_identity: {
    title: "\u6B63\u65B9\u5F62\u5206\u5757\u4E0E\u9762\u79EF\u6052\u7B49\u5F0F",
    catalog: "a\xB2\u3001b\xB2\u3001ab\u3001ab\u56DB\u5757\uFF08\u65E0\u4E09\u89D2\u5F62\uFF09\u2192\u8FB9\u957Fa+b\u6B63\u65B9\u5F62\uFF0C\u8BC1(a+b)\xB2=a\xB2+2ab+b\xB2",
    pieces: "a\xB2\u3001b\xB2\u4E24\u4E2A\u6B63\u65B9\u5F62\u548C\u4E24\u4E2Aab\u77E9\u5F62\uFF0C\u65E0\u4E09\u89D2\u5F62",
    shows: "(a+b)\xB2 = a\xB2 + 2ab + b\xB2",
    container: "\u5916\u6846\u8FB9\u957Fa+b\uFF0C\u9762\u79EF(a+b)\xB2",
    initial: "\u56DB\u5757\u5206\u79BB\uFF1Aa\xB2\u3001ab\u3001ab\u3001b\xB2",
    final: "\u56DB\u5757\u586B\u6EE1\u8FB9\u957Fa+b\u7684\u6B63\u65B9\u5F62",
    proof: "\u6574\u5757\u9762\u79EF\u7B49\u4E8E\u56DB\u5757\u9762\u79EF\u4E4B\u548C\uFF1A(a+b)\xB2=a\xB2+2ab+b\xB2",
    caption: "a\xB2\u3001b\xB2 \u4E24\u4E2A\u6B63\u65B9\u5F62\u4E0E\u4E24\u4E2A ab \u77E9\u5F62\u62FC\u5408\uFF0C\u5F97\u5230\u8FB9\u957F a+b \u7684\u6B63\u65B9\u5F62\uFF1A(a+b)\xB2 = a\xB2+2ab+b\xB2\u3002"
  },
  triangle_to_rectangle: {
    title: "\u4E24\u4E2A\u5168\u7B49\u4E09\u89D2\u5F62\u62FC\u6210\u957F\u65B9\u5F62",
    catalog: "2\u5168\u7B49\u76F4\u89D2\u4E09\u89D2\u5F62\u2192ab\u77E9\u5F62\uFF0C\u6BCF\u5757\u9762\u79EFab/2",
    pieces: "2\u4E2A\u5168\u7B49\u76F4\u89D2\u4E09\u89D2\u5F62\u62FC\u6210\u77E9\u5F62",
    shows: "S\u25B3 = ab / 2",
    container: "\u5916\u6846\u662F\u8FB9\u957Fa\u3001b\u7684\u77E9\u5F62\uFF0C\u9762\u79EFab",
    initial: "\u4E24\u4E2A\u5168\u7B49\u76F4\u89D2\u4E09\u89D2\u5F62\u5206\u79BB",
    final: "\u4E24\u4E2A\u4E09\u89D2\u5F62\u586B\u6EE1\u77E9\u5F62",
    proof: "\u4E24\u4E2A\u5168\u7B49\u4E09\u89D2\u5F62\u7684\u9762\u79EF\u4E4B\u548C\u4E3Aab\uFF0C\u6240\u4EE5\u6BCF\u4E2A\u9762\u79EFab/2",
    caption: "\u4E24\u4E2A\u5168\u7B49\u76F4\u89D2\u4E09\u89D2\u5F62\u62FC\u6210\u8FB9\u957F a\u3001b \u7684\u77E9\u5F62\uFF1B\u6BCF\u4E2A\u4E09\u89D2\u5F62\u9762\u79EF S\u25B3 = ab/2\u3002"
  }
};
var REARRANGEMENT_FACTS = REARRANGEMENT_CONSTRUCTIONS;
function rearrangementRecipe(construction, first, second) {
  const definition = REARRANGEMENT_CONSTRUCTIONS[construction];
  if (!definition)
    return void 0;
  const gap = Math.max(first, second) * 0.35;
  if (construction === "right_triangle_square") {
    const side = first + second;
    return {
      title: definition.title,
      relation: definition.shows,
      target: [[0, 0], [side, 0], [side, side], [0, side]],
      pieces: [
        { points: [[0, 0], [first, 0], [0, second]], start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, label: "\u4E09\u89D2\u5F62 1", tone: "primary" },
        { points: [[0, 0], [0, first], [-second, 0]], start: { x: side, y: 0 }, end: { x: side, y: second }, label: "\u4E09\u89D2\u5F62 2", tone: "secondary" },
        { points: [[0, 0], [-first, 0], [0, -second]], start: { x: side, y: side }, end: { x: first, y: second }, label: "\u4E09\u89D2\u5F62 3", tone: "accent" },
        { points: [[0, 0], [0, -first], [second, 0]], start: { x: 0, y: side }, end: { x: first, y: side }, label: "\u4E09\u89D2\u5F62 4", tone: "neutral" }
      ]
    };
  }
  if (construction === "square_area_identity") {
    const side = first + second;
    return {
      title: definition.title,
      relation: definition.shows,
      target: [[0, 0], [side, 0], [side, side], [0, side]],
      pieces: [
        { points: [[0, 0], [first, 0], [first, first], [0, first]], start: { x: -first - gap, y: 0 }, end: { x: 0, y: 0 }, label: "a\xB2", tone: "primary" },
        { points: [[0, 0], [second, 0], [second, first], [0, first]], start: { x: first + gap, y: 0 }, end: { x: first, y: 0 }, label: "ab", tone: "secondary" },
        { points: [[0, 0], [first, 0], [first, second], [0, second]], start: { x: 0, y: side + gap }, end: { x: 0, y: first }, label: "ab", tone: "accent" },
        { points: [[0, 0], [second, 0], [second, second], [0, second]], start: { x: side + gap, y: side + gap }, end: { x: first, y: first }, label: "b\xB2", tone: "neutral" }
      ]
    };
  }
  if (construction === "triangle_to_rectangle") {
    return {
      title: definition.title,
      relation: definition.shows,
      target: [[0, 0], [first, 0], [first, second], [0, second]],
      pieces: [
        { points: [[0, 0], [first, 0], [0, second]], start: { x: -first - gap, y: 0 }, end: { x: 0, y: 0 }, label: "\u4E09\u89D2\u5F62 1", tone: "primary" },
        { points: [[0, 0], [first, 0], [0, second]], start: { x: first + gap, y: 0 }, end: { x: first, y: second, angle: Math.PI }, label: "\u4E09\u89D2\u5F62 2", tone: "accent" }
      ]
    };
  }
  return void 0;
}

// node_modules/octos-lesson-language/dist/packages/plugin-math/src/geometry.js
var write = (input, kind, content) => ({ do: "write", as: input.as, kind, role: input.role, content, place: input.place });
function buildCircleAndArc(input) {
  const { radius, angle, t } = input;
  const angleVariable = input.angle_number?.variable;
  const angleExpression = input.angle_number?.expression;
  const radiusVariable = input.radius_number?.variable;
  const radiusExpression = radiusVariable ?? String(radius);
  const maximumRadius = input.radius_number ? Math.max(Math.abs(input.radius_number.min), Math.abs(input.radius_number.max)) : radius;
  const geometry = {
    title: input.title,
    axes: {
      x: { min: -maximumRadius * 1.25, max: maximumRadius * 1.25, label: "x" },
      y: { min: -maximumRadius * 1.25, max: maximumRadius * 1.25, label: "y" },
      equal_scale: true
    },
    points: [
      { as: "center", x: 0, y: 0, label: "O" },
      {
        as: "moving-point",
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
        label: "P",
        ...angleVariable ? { interaction: { kind: "angle_control", variable: angleVariable, center: "center" } } : {}
      }
    ],
    circles: [{ as: "circle", center: "center", radius, label: radiusVariable ? t("\u534A\u5F84 r") : `r = ${radius}` }],
    segments: [{ as: "radius", from: "center", to: "moving-point", style: "solid" }],
    arcs: [{ as: "arc", center: "center", radius, start_angle: 0, end_angle: angle, label: t("\u5706\u5F27") }],
    ...angleVariable || radiusVariable ? {
      bindings: [
        ...angleExpression ? [
          { target: "moving-point.x", expression: `${radiusExpression}*cos(${angleExpression})` },
          { target: "moving-point.y", expression: `${radiusExpression}*sin(${angleExpression})` },
          { target: "arc.end_angle", expression: angleExpression }
        ] : [],
        ...radiusVariable ? [
          { target: "circle.radius", expression: radiusVariable },
          { target: "arc.radius", expression: radiusVariable }
        ] : []
      ]
    } : {}
  };
  const base = input.as;
  return {
    actions: [write(input, "geometry", geometry)],
    whole: base,
    parts: {
      whole: base,
      circle: `${base}#circle`,
      arc: `${base}#arc`,
      radius: `${base}#radius`,
      ...angleVariable ? { primary_control: `${base}#moving-point` } : {}
    }
  };
}
function buildCoordinateCircle(input) {
  const { center, radius, t } = input;
  const extent = input.maximum_radius * 1.5;
  const binding = input.radius_binding;
  const geometry = {
    title: input.title,
    axes: {
      x: { min: center.x - extent, max: center.x + extent, label: "x" },
      y: { min: center.y - extent, max: center.y + extent, label: "y" },
      equal_scale: true
    },
    points: [{ as: "center", x: center.x, y: center.y, label: `(${center.x}, ${center.y})` }],
    circles: [{ as: "circle", center: "center", radius, label: binding ? t("\u534A\u5F84 r") : `r = ${radius}` }],
    ...binding ? { bindings: [{
      target: "circle.radius",
      expression: binding.expression,
      ...binding.formula ? { allow_zero: true, label: { prefix: "r = ", precision: 2 } } : {}
    }] } : {}
  };
  const base = input.as;
  return {
    actions: [write(input, "geometry", geometry)],
    whole: base,
    parts: {
      whole: base,
      circle: `${base}#circle`,
      center: `${base}#center`,
      radius: `${base}#circle`,
      ...binding ? { primary_control: `${base}#circle` } : {}
    }
  };
}
function minimumExpression(value2, variable) {
  return `((${value2})+(${variable})-abs((${value2})-(${variable})))/2`;
}
function buildUnitSquareArray(input) {
  const { t } = input;
  const columnVariable = input.columns.variable;
  const rowVariable = input.rows.variable;
  const columns = Math.round(input.columns.initial);
  const rows = Math.round(input.rows.initial);
  const maximumColumns = Math.round(input.columns.max);
  const maximumRows = Math.round(input.rows.max);
  const points = [
    { as: "boundary-bottom-left", x: 0, y: 0, visible: false },
    { as: "boundary-bottom-right", x: columns, y: 0, visible: false },
    { as: "boundary-top-right", x: columns, y: rows, visible: false },
    { as: "boundary-top-left", x: 0, y: rows, visible: false },
    { as: "unit-bottom-left", x: 0, y: 0, visible: false },
    { as: "unit-bottom-right", x: 1, y: 0, visible: false },
    { as: "unit-top-right", x: 1, y: 1, visible: false },
    { as: "unit-top-left", x: 0, y: 1, visible: false }
  ];
  const segments = [];
  const bindings = [
    { target: "boundary-bottom-right.x", expression: columnVariable },
    { target: "boundary-top-right.x", expression: columnVariable },
    { target: "boundary-top-right.y", expression: rowVariable },
    { target: "boundary-top-left.y", expression: rowVariable }
  ];
  for (let column = 0; column <= maximumColumns; column += 1) {
    const x = Math.min(column, columns);
    points.push({ as: `column-${column}-bottom`, x, y: 0, visible: false }, { as: `column-${column}-top`, x, y: rows, visible: false });
    segments.push({
      as: `column-${column}`,
      from: `column-${column}-bottom`,
      to: `column-${column}-top`,
      style: column === 0 || column === maximumColumns ? "solid" : "dashed"
    });
    bindings.push({ target: `column-${column}-bottom.x`, expression: minimumExpression(column, columnVariable) }, { target: `column-${column}-top.x`, expression: minimumExpression(column, columnVariable) }, { target: `column-${column}-top.y`, expression: rowVariable });
  }
  for (let row = 0; row <= maximumRows; row += 1) {
    const y = Math.min(row, rows);
    points.push({ as: `row-${row}-left`, x: 0, y, visible: false }, { as: `row-${row}-right`, x: columns, y, visible: false });
    segments.push({
      as: `row-${row}`,
      from: `row-${row}-left`,
      to: `row-${row}-right`,
      style: row === 0 || row === maximumRows ? "solid" : "dashed"
    });
    bindings.push({ target: `row-${row}-left.y`, expression: minimumExpression(row, rowVariable) }, { target: `row-${row}-right.x`, expression: columnVariable }, { target: `row-${row}-right.y`, expression: minimumExpression(row, rowVariable) });
  }
  const geometry = {
    title: input.title,
    caption: t("\u6BCF\u4E2A\u5C0F\u65B9\u683C\u9762\u79EF\u4E3A 1 \u5E73\u65B9\u5355\u4F4D\uFF1B\u6BCF\u884C\u65B9\u683C\u6570 \xD7 \u884C\u6570 = \u65B9\u683C\u603B\u6570 = \u957F\u65B9\u5F62\u9762\u79EF\u3002"),
    axes: {
      x: { min: -0.75, max: maximumColumns + 0.75, label: t("\u6BCF\u884C\u65B9\u683C\u6570\uFF08\u957F\uFF09") },
      y: { min: -0.75, max: maximumRows + 0.75, label: t("\u884C\u6570\uFF08\u5BBD\uFF09") },
      equal_scale: true
    },
    points,
    polygons: [
      { as: "interior", points: ["boundary-bottom-left", "boundary-bottom-right", "boundary-top-right", "boundary-top-left"], tone: "primary" },
      { as: "unit-square", points: ["unit-bottom-left", "unit-bottom-right", "unit-top-right", "unit-top-left"], label: t("1 \u5E73\u65B9\u5355\u4F4D"), tone: "accent" }
    ],
    segments,
    bindings
  };
  const base = input.as;
  return {
    actions: [write(input, "geometry", geometry)],
    whole: base,
    parts: {
      whole: base,
      unit_square: `${base}#unit-square`,
      row: `${base}#row-1`,
      column: `${base}#column-1`,
      interior: `${base}#interior`,
      boundary: `${base}#interior`,
      primary_control: `${base}#interior`,
      secondary_control: `${base}#interior`
    }
  };
}
function linearExpression(start, end, progress) {
  return `${start}+(${end - start})*(${progress})`;
}
function buildCircleAreaRearrangement(input) {
  const { radius: r, t } = input;
  const base = input.as;
  const progress = input.progress?.expression ?? "0";
  const initial = input.progress?.initial ?? 0;
  const actions = [];
  for (const [panel, n] of [8, 16].entries()) {
    const id = panel === 0 ? base : `${base}-refined`;
    const angle = 2 * Math.PI / n, chord = 2 * r * Math.sin(angle / 2), height = r * Math.cos(angle / 2);
    const points = [];
    const arcs = [];
    const bindings = [];
    for (let i = 0; i < n; i++) {
      const center = `center-${i}`, sector = `sector-${i}`;
      const up = i % 2 === 0;
      const endX = i / 2 * chord, endY = up ? 0 : height;
      const start = i * angle, end = (up ? Math.PI / 2 : -Math.PI / 2) - angle / 2;
      points.push({ as: center, x: endX * initial, y: endY * initial, visible: false });
      arcs.push({ as: sector, center, radius: r, start_angle: start + (end - start) * initial, end_angle: start + angle + (end - start) * initial, filled: true });
      if (input.progress)
        bindings.push({ target: `${center}.x`, expression: `${endX}*(${progress})` }, { target: `${center}.y`, expression: `${endY}*(${progress})` }, { target: `${sector}.start_angle`, expression: linearExpression(start, end, progress) }, { target: `${sector}.end_angle`, expression: linearExpression(start + angle, end + angle, progress) });
    }
    actions.push({ do: "write", as: id, kind: "geometry", role: input.role, place: panel === 0 ? input.place : { relation: "below", anchor: base, gap: "normal" }, content: {
      title: t("{{v0}} \u7B49\u5206\u5706\u7684\u9762\u79EF\u91CD\u6392", { v0: n }),
      caption: t("\u534A\u5F84 r={{v0}}\uFF1B\u6BCF\u5757\u5747\u4E3A\u771F\u5B9E\u6247\u5F62\uFF0C\u91CD\u6392\u9762\u79EF\u4E0D\u53D8\u3002\u6709\u9650\u7B49\u5206\u7684\u8FB9\u7F18\u4ECD\u5F2F\u66F2\uFF1B\u7B49\u5206\u8D8A\u7EC6\uFF0C\u5E95\u8D8B\u8FD1 \u03C0r\uFF0C\u9AD8\u8D8B\u8FD1 r\uFF0C\u9762\u79EF\u4E3A \u03C0r\xB2\u3002", { v0: r }),
      axes: { x: { min: -r * 1.3, max: Math.PI * r + r }, y: { min: -r * 1.3, max: r * 1.6 }, equal_scale: true },
      points,
      arcs,
      ...bindings.length ? { bindings } : {}
    } });
  }
  return { actions, whole: base, parts: { whole: base, ...input.progress ? { primary_control: base } : {} } };
}
function transformedPoint(point, pose) {
  const angle = pose.angle ?? 0;
  return [
    pose.x + point[0] * Math.cos(angle) - point[1] * Math.sin(angle),
    pose.y + point[0] * Math.sin(angle) + point[1] * Math.cos(angle)
  ];
}
function buildGeometricRearrangement(input) {
  const { construction, legs: { a: legA, b: legB } } = input;
  const base = input.as;
  const recipe = rearrangementRecipe(construction, legA, legB);
  if (!recipe)
    throw new Error(`Unsupported geometric construction '${String(construction)}'`);
  const facts = REARRANGEMENT_CONSTRUCTIONS[construction];
  const progressExpression = input.progress?.expression ?? "0";
  const progressInitial = input.progress?.initial ?? 0;
  const pieces = recipe.pieces.map((piece, index) => ({ ...piece, role: `piece-${index + 1}` }));
  const targetPoints = recipe.target.map(([x, y], index) => ({ as: `target-point-${index + 1}`, x, y, visible: false }));
  const points = [
    ...targetPoints,
    ...pieces.flatMap((piece) => {
      const pose = {
        x: piece.start.x + (piece.end.x - piece.start.x) * progressInitial,
        y: piece.start.y + (piece.end.y - piece.start.y) * progressInitial,
        angle: (piece.start.angle ?? 0) + ((piece.end.angle ?? 0) - (piece.start.angle ?? 0)) * progressInitial
      };
      return piece.points.map((point, pointIndex) => {
        const [x, y] = transformedPoint(point, pose);
        return { as: `${piece.role}-point-${pointIndex + 1}`, x, y, visible: false };
      });
    })
  ];
  const polygons = [
    { as: "target-shape", points: targetPoints.map((point) => point.as), tone: "neutral" },
    ...pieces.map((piece) => ({
      as: piece.role,
      points: piece.points.map((_point, index) => `${piece.role}-point-${index + 1}`),
      label: piece.label,
      tone: piece.tone
    }))
  ];
  const segments = [
    ...recipe.target.map((_point, pointIndex) => ({
      as: `target-edge-${pointIndex + 1}`,
      from: `target-point-${pointIndex + 1}`,
      to: `target-point-${(pointIndex + 1) % recipe.target.length + 1}`,
      style: "dashed",
      ...pointIndex === 2 ? { label: construction === "triangle_to_rectangle" ? "a" : "a+b" } : {}
    }))
  ];
  if (construction !== "square_area_identity") {
    segments.push({ as: "leg-a", from: "piece-1-point-1", to: "piece-1-point-2", style: "solid", label: "a" }, { as: "leg-b", from: "piece-1-point-1", to: "piece-1-point-3", style: "solid", label: "b" }, { as: "hypotenuse", from: "piece-1-point-2", to: "piece-1-point-3", style: "solid", label: "c" });
    if (construction === "right_triangle_square") {
      const marker = Math.min(legA, legB) * 0.12;
      const pose = pieces[0].start;
      for (const [index, point] of [[marker, 0], [marker, marker], [0, marker]].entries()) {
        const [x, y] = transformedPoint(point, pose);
        points.push({ as: `right-angle-point-${index + 1}`, x, y, visible: false });
      }
      segments.push({ as: "right-angle-1", from: "right-angle-point-1", to: "right-angle-point-2", style: "solid" }, { as: "right-angle-2", from: "right-angle-point-2", to: "right-angle-point-3", style: "solid" });
    }
  }
  const bindings = input.progress ? pieces.flatMap((piece) => piece.points.flatMap(([localX, localY], pointIndex) => {
    const translateX = linearExpression(piece.start.x, piece.end.x, progressExpression);
    const translateY = linearExpression(piece.start.y, piece.end.y, progressExpression);
    const angle = linearExpression(piece.start.angle ?? 0, piece.end.angle ?? 0, progressExpression);
    const target = `${piece.role}-point-${pointIndex + 1}`;
    return [
      { target: `${target}.x`, expression: `(${translateX})+(${localX})*cos(${angle})-(${localY})*sin(${angle})` },
      { target: `${target}.y`, expression: `(${translateY})+(${localX})*sin(${angle})+(${localY})*cos(${angle})` }
    ];
  })) : [];
  if (construction === "right_triangle_square") {
    const start = (legA + legB) / 2;
    const endX = legA + legB / 2, endY = legB / 2;
    points.push({ as: "central-area", x: start + (endX - start) * progressInitial, y: start + (endY - start) * progressInitial, visible: false });
    if (input.progress)
      bindings.push({ target: "central-area.x", expression: linearExpression(start, endX, progressExpression) }, { target: "central-area.y", expression: linearExpression(start, endY, progressExpression) });
  }
  const endpointPoints = [
    ...recipe.target,
    ...pieces.flatMap((piece) => [piece.start, piece.end].flatMap((pose) => piece.points.map((point) => transformedPoint(point, pose))))
  ];
  const xs = endpointPoints.map((point) => point[0]);
  const ys = endpointPoints.map((point) => point[1]);
  const span2 = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const margin = span2 * 0.1;
  const geometry = {
    // A fixed recipe owns its name just as it owns its shapes and proof.
    title: recipe.title,
    caption: facts.caption,
    axes: {
      x: { min: Math.min(...xs) - margin, max: Math.max(...xs) + margin },
      y: { min: Math.min(...ys) - margin, max: Math.max(...ys) + margin },
      equal_scale: true
    },
    points,
    polygons,
    segments,
    ...bindings.length ? { bindings } : {}
  };
  return {
    actions: [{ do: "write", as: base, kind: "geometry", role: input.role, content: geometry, place: input.place }],
    whole: base,
    parts: {
      whole: base,
      target_shape: `${base}#target-shape`,
      outer_square: `${base}#target-shape`,
      ...Object.fromEntries(pieces.map((piece, index) => [`piece_${index + 1}`, `${base}#${piece.role}`])),
      central_area: `${base}#${construction === "right_triangle_square" ? "central-area" : "target-shape"}`,
      ...construction !== "square_area_identity" ? { leg_a: `${base}#leg-a`, leg_b: `${base}#leg-b`, hypotenuse: `${base}#hypotenuse` } : {},
      ...input.progress ? { primary_control: base } : {}
    }
  };
}

// node_modules/octos-lesson-language/dist/packages/plugin-math/src/scene3d-surfaces.js
var DOMAIN_CANDIDATE_HALF_SPANS = [2, 5, 10, 20, 50, 100];
var DOMAIN_REFINEMENT_STEPS = 12;
var DOMAIN_MARGIN = 1.1;
function expressionUsesVariable(expression, variable) {
  return new RegExp(`(^|[^A-Za-z0-9_])${variable}([^A-Za-z0-9_]|$)`, "u").test(expression);
}
function sampleImplicitSurfaceStatus(evaluate2, variables, level, halfSpan, dependentVariables) {
  const resolution = variables.length === 2 ? 18 : 10;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  const boundaryRanges = /* @__PURE__ */ new Map();
  for (const variable of dependentVariables) {
    boundaryRanges.set(`${variable}:min`, { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY });
    boundaryRanges.set(`${variable}:max`, { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY });
  }
  const observe = (value2, coordinates) => {
    if (!Number.isFinite(value2) || Math.abs(value2) > 1e12)
      return;
    minimum = Math.min(minimum, value2);
    maximum = Math.max(maximum, value2);
    for (const variable of dependentVariables) {
      const coordinate = coordinates[variable];
      const side = Math.abs((coordinate ?? 0) + halfSpan) < 1e-9 ? "min" : Math.abs((coordinate ?? 0) - halfSpan) < 1e-9 ? "max" : void 0;
      if (!side)
        continue;
      const range = boundaryRanges.get(`${variable}:${side}`);
      range.minimum = Math.min(range.minimum, value2);
      range.maximum = Math.max(range.maximum, value2);
    }
  };
  for (let xIndex = 0; xIndex <= resolution; xIndex += 1) {
    const x = -halfSpan + 2 * halfSpan * xIndex / resolution;
    for (let yIndex = 0; yIndex <= resolution; yIndex += 1) {
      const y = -halfSpan + 2 * halfSpan * yIndex / resolution;
      const zIterations = variables.length === 3 ? resolution : 0;
      for (let zIndex = 0; zIndex <= zIterations; zIndex += 1) {
        const z = variables.length === 3 ? -halfSpan + 2 * halfSpan * zIndex / resolution : 0;
        const coordinates = variables.length === 3 ? { x, y, z } : { x, y };
        try {
          observe(evaluate2(coordinates), coordinates);
        } catch {
        }
      }
    }
  }
  if (!(minimum <= level && maximum >= level))
    return "absent";
  const crossesBoundary = [...boundaryRanges.values()].some((range) => range.minimum <= level && range.maximum >= level);
  return crossesBoundary ? "clipped" : "contained";
}
function implicitSurfaceDomain(expression, variables, level) {
  if (!Number.isFinite(level))
    throw new Error("Implicit surface level must be finite");
  const evaluate2 = compileMathExpression(expression, [...variables]);
  const dependentVariables = new Set(variables.filter((variable) => expressionUsesVariable(expression, variable)));
  let firstVisibleHalfSpan;
  let previousHalfSpan = 0;
  for (const candidateHalfSpan of DOMAIN_CANDIDATE_HALF_SPANS) {
    const status = sampleImplicitSurfaceStatus(evaluate2, variables, level, candidateHalfSpan, dependentVariables);
    if (status !== "absent" && firstVisibleHalfSpan === void 0) {
      firstVisibleHalfSpan = candidateHalfSpan;
    }
    if (status === "contained") {
      let lower = previousHalfSpan;
      let upper = candidateHalfSpan;
      for (let step = 0; step < DOMAIN_REFINEMENT_STEPS; step += 1) {
        const middle = (lower + upper) / 2;
        const middleStatus = sampleImplicitSurfaceStatus(evaluate2, variables, level, middle, dependentVariables);
        if (middleStatus === "contained")
          upper = middle;
        else
          lower = middle;
      }
      const dependentHalfSpan = Math.max(2, upper * DOMAIN_MARGIN);
      const rangeFor = (variable) => {
        const halfSpan = dependentVariables.has(variable) ? dependentHalfSpan : Math.max(2, dependentHalfSpan);
        return { min: -halfSpan, max: halfSpan };
      };
      return {
        x: rangeFor("x"),
        y: rangeFor("y"),
        ...variables.length === 3 ? { z: rangeFor("z") } : {}
      };
    }
    previousHalfSpan = candidateHalfSpan;
  }
  if (firstVisibleHalfSpan !== void 0) {
    const range = { min: -firstVisibleHalfSpan, max: firstVisibleHalfSpan };
    return { x: range, y: range, ...variables.length === 3 ? { z: range } : {} };
  }
  throw new Error("Implicit surface level is outside the program-selected viewport");
}
function buildImplicitSurfaceObject(input) {
  const expression = input.expression.trim();
  if (!expression)
    throw new Error("Implicit surface expression must not be empty");
  const domain = implicitSurfaceDomain(expression, ["x", "y", "z"], input.level);
  if (!domain.z)
    throw new Error("Implicit surface requires a three-dimensional viewport");
  const samples = input.samples ?? 12;
  if (!Number.isInteger(samples) || samples < 4 || samples > 24) {
    throw new Error("Implicit surface samples must be an integer from 4 to 24");
  }
  return {
    as: input.as,
    kind: "implicit_surface",
    expression,
    level: input.level,
    x_range: domain.x,
    y_range: domain.y,
    z_range: domain.z,
    samples,
    color: input.color ?? "teal",
    ...input.label ? { label: input.label } : {}
  };
}

// node_modules/octos-lesson-language/dist/packages/plugin-math/src/surfaces.js
var SURFACE_SCENE_CAMERA = { yaw: 0.72, pitch: 0.55, zoom: 1 };
function sectionScene(input, content, section, parts) {
  const base = input.as;
  return {
    actions: [{ do: "write", as: base, kind: "scene3d", role: input.role, content: {
      ...content,
      ...section.variable ? { bindings: [{ target: "section.value", expression: section.variable }] } : {}
    }, place: input.place }],
    whole: base,
    parts: { whole: base, ...parts, ...section.variable ? { primary_control: `${base}#section` } : {} }
  };
}
function buildCubeWithSection(input) {
  const { t } = input;
  const base = input.as;
  return sectionScene(input, {
    title: input.title,
    fallback: t("\u4E00\u4E2A\u4E2D\u5FC3\u5728\u539F\u70B9\u3001\u8FB9\u957F\u4E3A 2 \u7684\u6B63\u65B9\u4F53\uFF0C\u6807\u51FA\u4E86\u9876\u70B9\u3001\u68F1\u3001\u9762\u548C\u6C34\u5E73\u622A\u9762\u3002"),
    axes: true,
    camera: { ...SURFACE_SCENE_CAMERA },
    objects: [{
      as: "solid",
      kind: "box",
      label: t("\u6B63\u65B9\u4F53"),
      color: "teal",
      center: { x: 0, y: 0, z: 0 },
      size: { x: 2, y: 2, z: 2 }
    }],
    sections: [{
      as: "section",
      axis: "z",
      value: input.section.value,
      targets: ["solid"],
      display: "plane_and_intersection",
      label: t("\u6C34\u5E73\u622A\u9762"),
      color: "orange"
    }],
    highlights: [
      { as: "vertex", kind: "point", points: [{ x: -1, y: -1, z: 1 }], label: t("\u9876\u70B9"), color: "red" },
      { as: "edge", kind: "edge", points: [{ x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }], label: t("\u68F1"), color: "orange" },
      { as: "face", kind: "face", points: [{ x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }], label: t("\u9762"), color: "purple" }
    ]
  }, input.section, {
    solid: `${base}#solid`,
    vertex: `${base}#vertex`,
    edge: `${base}#edge`,
    face: `${base}#face`,
    section: `${base}#section`
  });
}
function buildFunctionSurface(input) {
  const { t, expression } = input;
  const base = input.as;
  return sectionScene(input, {
    title: input.title,
    fallback: t("\u51FD\u6570\u66F2\u9762 z={{v0}} \u4E0E\u53EF\u53D8\u622A\u9762\u3002", { v0: expression }),
    axes: true,
    camera: { ...SURFACE_SCENE_CAMERA },
    objects: [{
      as: "surface",
      kind: "surface",
      label: `z=${expression}`,
      color: "teal",
      expression,
      x_range: input.x_range,
      y_range: input.y_range,
      samples: input.samples
    }],
    sections: [{
      as: "section",
      axis: input.axis,
      value: input.section.value,
      targets: ["surface"],
      display: "plane_and_intersection",
      label: t("\u622A\u9762"),
      color: "orange"
    }]
  }, input.section, { surface: `${base}#surface`, section: `${base}#section`, intersection: `${base}#section` });
}
function buildImplicitSurface(input) {
  const { t, expression, level } = input;
  const base = input.as;
  const surface = buildImplicitSurfaceObject({ as: "surface", expression, level, samples: 12, color: "teal", label: `${expression}=${level}` });
  return sectionScene(input, {
    title: input.title,
    fallback: t("\u9690\u5F0F\u66F2\u9762 {{v0}}={{v1}} \u4E0E\u53EF\u53D8\u8F74\u5411\u622A\u9762\u3002", { v0: expression, v1: level }),
    axes: true,
    camera: { ...SURFACE_SCENE_CAMERA },
    objects: [surface],
    sections: [{
      as: "section",
      axis: input.axis,
      value: input.section.value,
      targets: ["surface"],
      display: "plane_and_intersection",
      label: t("\u622A\u9762"),
      color: "orange"
    }]
  }, input.section, { surface: `${base}#surface`, section: `${base}#section`, intersection: `${base}#section` });
}

// node_modules/octos-lesson-language/dist/packages/plugin-math/src/number-line-builder.js
var driven = (value2) => typeof value2 === "object" && value2 !== null && typeof value2.expression === "string";
function buildNumberLine(input) {
  const bindings = [];
  const resolve = (value2, target) => {
    if (!driven(value2))
      return value2;
    bindings.push({ target, expression: value2.expression });
    return value2.initial;
  };
  const content = {
    ...input.title !== void 0 ? { title: input.title } : {},
    ...input.caption !== void 0 ? { caption: input.caption } : {},
    range: { ...input.range },
    ...input.ticks ? { ticks: { ...input.ticks } } : {}
  };
  if (input.points?.length) {
    content.points = input.points.map((point) => {
      const value2 = point.draggable && !driven(point.value) ? (bindings.push({ target: `${point.as}.value`, expression: point.draggable.variable }), point.value) : resolve(point.value, `${point.as}.value`);
      return {
        as: point.as,
        value: value2,
        ...point.label !== void 0 ? { label: point.label } : {},
        ...point.style ? { style: point.style } : {},
        ...point.shown ? { shown: point.shown } : {},
        ...point.draggable ? { interaction: { kind: "drag", variable: point.draggable.variable } } : {}
      };
    });
  }
  if (input.jumps?.length) {
    content.jumps = input.jumps.map((jump) => ({
      as: jump.as,
      from: typeof jump.from === "string" && input.points?.some((point) => point.as === jump.from) ? jump.from : resolve(jump.from, `${jump.as}.from`),
      by: resolve(jump.by, `${jump.as}.by`),
      ...jump.label !== void 0 ? { label: jump.label } : {},
      ...jump.hops !== void 0 ? { hops: jump.hops } : {}
    }));
  }
  if (input.intervals?.length) {
    content.intervals = input.intervals.map((interval) => ({
      as: interval.as,
      from: interval.from === null ? null : resolve(interval.from, `${interval.as}.from`),
      to: interval.to === null ? null : resolve(interval.to, `${interval.as}.to`),
      ...interval.from_closed !== void 0 ? { from_closed: interval.from_closed } : {},
      ...interval.to_closed !== void 0 ? { to_closed: interval.to_closed } : {},
      ...interval.label !== void 0 ? { label: interval.label } : {}
    }));
  }
  if (bindings.length)
    content.bindings = bindings;
  const parts = { whole: input.as };
  for (const part of [...input.points ?? [], ...input.jumps ?? [], ...input.intervals ?? []])
    parts[part.as] = `${input.as}#${part.as}`;
  return {
    actions: [{ do: "write", as: input.as, kind: "number_line", role: input.role, content, place: input.place }],
    whole: input.as,
    parts
  };
}

// node_modules/octos-lesson-language/dist/packages/plugin-math/src/index.js
var MATH_SUBJECT_DESCRIPTION = {
  "zh-CN": "\u6570\u5B66\uFF1A\u6570\u4E0E\u8FD0\u7B97\u3001\u4EE3\u6570\u3001\u51FD\u6570\u4E0E\u56FE\u50CF\u3001\u51E0\u4F55\u3001\u7EDF\u8BA1\u4E0E\u6982\u7387",
  "en-US": "Mathematics: number, algebra, functions and graphs, geometry, statistics and probability"
};
function buildUnitCircle(input) {
  const theta = input.angle ? input.angle.initial : input.fixed_angle ?? Math.PI / 3;
  const variable = input.angle?.variable;
  const angleExpression = input.angle?.expression;
  const circle = input.graph ? `${input.as}-circle` : input.as;
  const geometry = {
    ...input.text.title !== void 0 ? { title: input.text.title } : {},
    axes: {
      x: { min: -1.25, max: 1.25, label: "x" },
      y: { min: -1.25, max: 1.25, label: "y" },
      equal_scale: true
    },
    points: [
      { as: "origin", x: 0, y: 0, label: "O" },
      {
        as: "moving-point",
        x: Math.cos(theta),
        y: Math.sin(theta),
        label: input.text.point_label ?? "P(cos \u03B8, sin \u03B8)",
        ...variable ? { interaction: { kind: "angle_control", variable, center: "origin" } } : {}
      },
      { as: "projection-foot", x: Math.cos(theta), y: 0, ...input.text.foot_label !== void 0 ? { label: input.text.foot_label } : {} }
    ],
    circles: [{ as: "unit-circle", center: "origin", radius: 1, label: "r = 1" }],
    segments: [
      { as: "radius", from: "origin", to: "moving-point", ...input.text.radius_label !== void 0 ? { label: input.text.radius_label } : {}, style: "solid" },
      { as: "projection", from: "moving-point", to: "projection-foot", style: "projection", label: "sin \u03B8" }
    ],
    arcs: [{ as: "angle", center: "origin", radius: 0.28, start_angle: 0, end_angle: theta, label: "\u03B8" }],
    ...angleExpression ? {
      bindings: [
        { target: "moving-point.x", expression: `cos(${angleExpression})` },
        { target: "moving-point.y", expression: `sin(${angleExpression})` },
        { target: "projection-foot.x", expression: `cos(${angleExpression})` },
        { target: "angle.end_angle", expression: angleExpression }
      ]
    } : {}
  };
  const circleParts = {
    unit_circle: `${circle}#unit-circle`,
    moving_point: `${circle}#moving-point`,
    radius: `${circle}#radius`,
    projection_line: `${circle}#projection`
  };
  if (!input.graph) {
    return {
      actions: [{ do: "write", as: circle, kind: "geometry", role: input.role, content: geometry, place: input.place }],
      whole: circle,
      parts: { whole: circle, ...circleParts, ...variable ? { primary_control: `${circle}#moving-point` } : {} }
    };
  }
  const { projection, title, link_label, group_label } = input.graph;
  const plot = `${input.as}-plot`;
  const plotContent = {
    title,
    axes: {
      x: { min: input.angle?.min ?? 0, max: input.angle?.max ?? Math.PI * 2, label: "\u03B8" },
      y: { min: -1.2, max: 1.2, label: "y" }
    },
    curves: [{ as: "primary-curve", expression: `${projection}(x)`, label: `y = ${projection}(x)` }],
    points: [{ as: "moving-point", x: theta, y: Math[projection](theta), label: `P(\u03B8, ${projection}(\u03B8))` }],
    ...angleExpression ? {
      bindings: [
        { target: "moving-point.x", expression: angleExpression },
        { target: "moving-point.y", expression: `${projection}(${angleExpression})` }
      ]
    } : {}
  };
  return {
    actions: [
      { do: "write", as: circle, kind: "geometry", role: input.role, content: geometry, place: input.place },
      { do: "write", as: plot, kind: "plot", role: input.role, content: plotContent, place: { relation: "right_of", anchor: circle, gap: "normal" } },
      { do: "connect", as: `${input.as}-link`, from: circle, to: plot, relation: "maps_to", label: link_label },
      { do: "group", as: input.as, role: input.role, label: group_label, members: [circle, plot] }
    ],
    whole: input.as,
    parts: {
      whole: input.as,
      ...circleParts,
      primary_curve: `${plot}#primary-curve`,
      ...variable ? { primary_control: `${circle}#moving-point` } : {}
    }
  };
}
function buildCirclePolygons(input) {
  const { radius } = input;
  const driven2 = typeof input.sides === "number" ? void 0 : input.sides;
  const sides = typeof input.sides === "number" ? input.sides : input.sides.initial;
  const extent = input.circumscribed ? radius / Math.cos(Math.PI / (driven2?.min ?? sides)) * 1.18 : radius * 1.3;
  const polygon = (as, label) => ({
    as,
    center: "center",
    radius,
    sides,
    relation: as,
    ...input.circumscribed ? { tone: as === "inscribed" ? "primary" : "accent" } : {},
    label,
    show_measurements: true
  });
  const content = {
    ...input.text.title !== void 0 ? { title: input.text.title } : {},
    axes: { x: { min: -extent, max: extent, label: "x" }, y: { min: -extent, max: extent, label: "y" }, equal_scale: true },
    points: [{ as: "center", x: 0, y: 0, label: "O" }],
    circles: [{ as: "circle", center: "center", radius, label: `r = ${radius}` }],
    regular_polygons: [
      polygon("inscribed", input.text.inscribed_label),
      ...input.circumscribed ? [polygon("circumscribed", input.text.circumscribed_label)] : []
    ],
    ...input.text.caption !== void 0 ? { caption: input.text.caption } : {},
    ...driven2 ? { bindings: [
      { target: "inscribed.sides", expression: driven2.expression },
      ...input.circumscribed ? [{ target: "circumscribed.sides", expression: driven2.expression }] : []
    ] } : {}
  };
  return {
    actions: [{ do: "write", as: input.as, kind: "geometry", role: input.role, content, place: input.place }],
    whole: input.as,
    parts: {
      whole: input.as,
      circle: `${input.as}#circle`,
      inscribed_polygon: `${input.as}#inscribed`,
      ...input.circumscribed ? { circumscribed_polygon: `${input.as}#circumscribed` } : {},
      primary_control: input.as
    }
  };
}
var functionCurveId = (index) => index === 0 ? "primary-curve" : `curve-${String(index + 1).padStart(2, "0")}`;
function substituteX(expression, value2) {
  const atomic = /^(?:[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?)$/.test(value2);
  return expression.replace(/\bx\b/gu, atomic ? value2 : `(${value2})`);
}
var FUNCTION_PLOT_POINT_IDS = { samples: ["moving-point", "second-point"], references: ["reference-a", "reference-b"] };
function buildFunctionPlot(input) {
  const primary = input.curves[0].expression;
  const content = {
    ...input.title !== void 0 ? { title: input.title } : {},
    axes: input.axes,
    // The builder names the curves; a caller's own "as" is ignored so the part names stay true.
    curves: input.curves.map(({ as: _ignored, ...curve }, index) => ({ as: functionCurveId(index), ...curve }))
  };
  if (input.samples?.length) {
    content.points = input.samples.map((sample, index) => ({ as: FUNCTION_PLOT_POINT_IDS.samples[index], x: sample.x, y: sample.y, label: sample.label }));
    content.bindings = input.samples.flatMap((sample, index) => {
      const point = FUNCTION_PLOT_POINT_IDS.samples[index];
      return [
        { target: `${point}.x`, expression: sample.x_expression },
        { target: `${point}.y`, expression: substituteX(primary, sample.x_expression) }
      ];
    });
    if (input.samples.length === 2)
      content.measurement = "secant";
  } else if (input.references?.length) {
    content.points = input.references.map((reference, index) => ({ as: FUNCTION_PLOT_POINT_IDS.references[index], x: reference.x, y: reference.y, label: reference.label }));
    content.bindings = input.references.map((reference, index) => ({ target: `${FUNCTION_PLOT_POINT_IDS.references[index]}.y`, expression: substituteX(primary, String(reference.x)) }));
    content.measurement = "secant";
    content.sample_input = "fixed_x";
  }
  return {
    actions: [{ do: "write", as: input.as, kind: "plot", role: input.role, content, place: input.place }],
    whole: input.as,
    parts: {
      whole: input.as,
      primary_curve: `${input.as}#primary-curve`,
      ...input.samples?.length ? { moving_point: `${input.as}#moving-point` } : {}
    }
  };
}

// src/rearrangement.ts
var REARRANGEMENT_MODEL_GUIDANCE = "\u91CD\u6392\u8FDB\u5EA6\uFF0C\u4E0D\u6539\u8FB9\u957F\uFF1B" + Object.entries(REARRANGEMENT_CONSTRUCTIONS).map(([name, facts]) => `${name}\uFF1A${facts.catalog}`).join("\uFF1B") + "\u3002\u9762\u79EF\u53EA\u6BD4\u8F83\u7AEF\u70B9\u3002";

// src/plugins/math.ts
var MATH_RECIPES = {
  function_plot: {
    parts: ["whole", "primary_curve", "moving_point", "primary_control"],
    number_inputs: ["curve_parameter_1", "curve_parameter_2", "curve_parameter_3", "curve_parameter_4"],
    number_input_policies: [{ kind: "unbounded" }, { kind: "unbounded" }, { kind: "unbounded" }, { kind: "unbounded" }],
    parameter_names: ["title", "expression", "expressions", "expression_tokens", "sample_x_numbers", "curve_label", "curve_labels", "x_label", "y_label", "x_min", "x_max", "y_min", "y_max"],
    model_parameter_names: ["title", "expression", "expressions", "expression_tokens", "sample_x_numbers", "curve_label", "curve_labels", "x_label", "y_label"],
    required_model_schema_parameters: ["formulas"],
    semantic_parameters: ["expression", "expressions", "expression_tokens", "sample_x_numbers"],
    output_kinds: ["plot"],
    student_controls: ["slider"],
    required_features: ["cartesian_function_curve"],
    model_guidance: "\u51FD\u6570\u56FE\uFF1A\u516C\u5F0F\u5F15\u7528\u6ED1\u5757\u6539\u66F2\u7EBF\uFF1B\u91C7\u6837\u70B9\u53E6\u58F0\u660E"
  },
  unit_circle_projection: {
    parts: ["whole", "unit_circle", "moving_point", "radius", "projection_line", "primary_curve", "primary_control"],
    number_inputs: ["angle"],
    number_input_policies: [{ kind: "angle" }],
    parameter_names: ["title", "projection"],
    model_parameter_names: ["title", "projection"],
    required_model_schema_parameters: ["projection"],
    semantic_parameters: ["projection"],
    output_kinds: ["geometry", "plot"],
    student_controls: ["slider", "geometry_point"],
    required_features: ["unit_circle", "projection", "cartesian_function_curve"],
    model_guidance: "\u5355\u4F4D\u5706\u52A8\u70B9\u3001\u6295\u5F71\u7EBF\u548C\u6B63\u5F26\u6216\u4F59\u5F26\u66F2\u7EBF\u5171\u4EAB\u540C\u4E00\u4E2A\u89D2\u5EA6"
  },
  circle_polygon_bounds: {
    parts: ["whole", "circle", "inscribed_polygon", "circumscribed_polygon", "primary_control"],
    number_inputs: ["side_count"],
    number_input_policies: [{ kind: "side_count" }],
    parameter_names: ["title", "radius"],
    model_parameter_names: ["title", "radius"],
    required_model_schema_parameters: [],
    semantic_parameters: ["radius"],
    output_kinds: ["geometry"],
    student_controls: ["slider"],
    required_features: ["inscribed_regular_polygon", "circumscribed_regular_polygon", "perimeter_bounds"],
    model_guidance: "\u5706\u5468\u7387/\u5272\u5706\u672F\uFF1A\u56FA\u5B9A\u5706\u4E0E\u5185\u63A5\u3001\u5916\u5207\u6B63\u591A\u8FB9\u5F62\uFF0C\u6574\u6570\u8FB9\u65703..384\uFF0C\u5468\u957F\u4E0E\u5468\u957F\xF7\u76F4\u5F84\u4E0A\u4E0B\u754C\u5B9E\u65F6\u8BA1\u7B97\uFF1B\u8FB9\u6570\u4E0D\u662F\u89D2\u5EA6\u3002\u9002\u5408\u5706\u5468\u7387\u6570\u503C\u8BA1\u7B97\u3001\u5272\u5706\u6CD5\u548C\u4E0A\u4E0B\u754C\u903C\u8FD1\uFF0C\u4F8B\u5982\u2018\u5706\u5468\u7387\u662F\u4EC0\u4E48\uFF0C\u5B83\u662F\u5982\u4F55\u8BA1\u7B97\u7684\u2019\uFF1B\u540C\u4E00\u753B\u9762\u4E2D\u7684\u56FA\u5B9A\u5706\u53EF\u4F9B\u5B9A\u4E49\u90E8\u5206\u8BB2\u89E3\u590D\u7528\uFF0C\u914D\u5408\u5468\u957F\u4E0E\u76F4\u5F84\u6BD4\u503C\u516C\u5F0F\uFF0C\u518D\u901A\u8FC7\u589E\u52A0\u591A\u8FB9\u5F62\u8FB9\u6570\u89E3\u91CA\u8BA1\u7B97\u8FC7\u7A0B"
  },
  circle_and_arc: {
    parts: ["whole", "circle", "arc", "radius", "primary_control"],
    number_inputs: ["angle", "radius"],
    number_input_policies: [{ kind: "angle" }, { kind: "positive" }],
    parameter_names: ["title", "radius", "angle"],
    model_parameter_names: ["title", "radius", "angle"],
    required_model_schema_parameters: [],
    semantic_parameters: ["radius", "angle"],
    output_kinds: ["geometry"],
    student_controls: ["slider", "geometry_point"],
    required_features: ["circle", "arc"],
    model_guidance: "\u5706\u3001\u5706\u5FC3\u89D2\u3001\u534A\u5F84\u548C\u5706\u5F27\uFF1B\u4E24\u4E2A\u6570\u503C\u4F9D\u6B21\u63A7\u5236\u89D2\u5EA6\u548C\u534A\u5F84\uFF1B\u4E0D\u652F\u6301\u7528\u8FB9\u6570\u5192\u5145\u89D2\u5EA6\u6216\u7528\u5706\u5F27\u5192\u5145\u6B63\u591A\u8FB9\u5F62\u3002\u9002\u5408\u9700\u8981\u89C2\u5BDF\u5706\u5FC3\u89D2\u3001\u5706\u5F27\u6216\u5F27\u957F\u5173\u7CFB\u7684\u8BB2\u89E3\uFF1B\u82E5\u53EA\u9700\u8981\u5C55\u793A\u6574\u5706\u3001\u89E3\u91CA\u5706\u5468\u957F\u4E0E\u76F4\u5F84\u7684\u6BD4\u503C\uFF0C\u4E0D\u5E94\u4EC5\u56E0\u6D89\u53CA\u2018\u5706\u2019\u5C31\u9009\u62E9\u672C\u80FD\u529B\uFF1B\u672C\u80FD\u529B\u7ED8\u5236\u5706\u3001\u5706\u5F27\u4E0E\u534A\u5F84\uFF0C\u4E0D\u4F1A\u5C55\u793A\u5468\u957F\u4E0E\u76F4\u5F84\u7684\u6BD4\u503C"
  },
  cube_with_section: {
    parts: ["whole", "solid", "vertex", "edge", "face", "section", "primary_control"],
    number_inputs: ["section_height"],
    number_input_policies: [{ kind: "bounded", min: -1, max: 1 }],
    parameter_names: ["title"],
    model_parameter_names: ["title"],
    required_model_schema_parameters: [],
    semantic_parameters: [],
    output_kinds: ["scene3d"],
    student_controls: ["slider", "scene3d_view"],
    required_features: ["solid_3d", "section_plane"],
    model_guidance: "\u53EF\u65CB\u8F6C\u6B63\u65B9\u4F53\u3001\u9876\u70B9\u3001\u68F1\u3001\u9762\u548C\u53EF\u53D8\u6C34\u5E73\u622A\u9762"
  },
  function_surface_with_section: {
    parts: ["whole", "surface", "section", "intersection", "primary_control"],
    number_inputs: ["section_position"],
    number_input_policies: [{ kind: "surface_section" }],
    parameter_names: ["title", "expression", "samples", "section_axis", "section_value", "x_min", "x_max", "y_min", "y_max"],
    model_parameter_names: ["title", "expression", "section_axis", "section_value"],
    required_model_schema_parameters: ["expression", "section_axis"],
    semantic_parameters: ["expression", "section_axis"],
    output_kinds: ["scene3d"],
    student_controls: ["slider", "scene3d_view"],
    required_features: ["function_surface_3d", "section_plane"],
    model_guidance: "\u53EF\u65CB\u8F6C\u4E09\u7EF4\u51FD\u6570\u66F2\u9762\u3001\u53EF\u53D8\u622A\u9762\u548C\u771F\u5B9E\u4EA4\u7EBF"
  },
  implicit_surface_with_section: {
    parts: ["whole", "surface", "section", "intersection", "primary_control"],
    number_inputs: ["section_position"],
    number_input_policies: [{ kind: "surface_section" }],
    parameter_names: ["title", "expression", "level", "section_axis"],
    model_parameter_names: ["title", "expression", "level", "section_axis"],
    required_model_schema_parameters: ["expression", "section_axis"],
    semantic_parameters: ["expression", "level", "section_axis"],
    output_kinds: ["scene3d"],
    student_controls: ["slider", "scene3d_view"],
    required_features: ["implicit_surface_3d", "section_plane"],
    model_guidance: "\u4E09\u53D8\u91CF\u9690\u5F0F\u66F2\u9762 F(x,y,z)=c\uFF0C\u4EE5\u53CA\u5782\u76F4\u4E8E x\u3001y \u6216 z \u8F74\u7684\u53EF\u53D8\u622A\u9762\u548C\u771F\u5B9E\u4EA4\u7EBF"
  },
  coordinate_circle: {
    parts: ["whole", "circle", "center", "radius", "primary_control"],
    number_inputs: ["radius"],
    number_input_policies: [{ kind: "positive" }],
    parameter_names: ["title", "radius", "radius_expression", "center_x", "center_y"],
    model_parameter_names: ["title", "radius", "radius_expression", "center_x", "center_y"],
    required_model_schema_parameters: [],
    semantic_parameters: ["radius", "radius_expression", "center_x", "center_y"],
    output_kinds: ["geometry"],
    student_controls: ["slider"],
    required_features: ["coordinate_circle"],
    model_guidance: "\u5750\u6807\u7CFB\u4E2D\u7684\u5706\uFF1B\u5171\u4EAB\u6570\u503C\u53EF\u901A\u8FC7 radius_expression\uFF08\u4F8B\u5982 sqrt(n1)\uFF09\u9A71\u52A8\u534A\u5F84"
  },
  rectangle_unit_square_array: {
    parts: ["whole", "unit_square", "row", "column", "interior", "boundary", "primary_control", "secondary_control"],
    number_inputs: ["columns_or_length", "rows_or_width"],
    number_input_policies: [{ kind: "positive_integer", max: 8 }, { kind: "positive_integer", max: 8 }],
    parameter_names: ["title"],
    model_parameter_names: ["title"],
    required_model_schema_parameters: [],
    semantic_parameters: [],
    output_kinds: ["geometry"],
    student_controls: ["slider"],
    required_features: ["unit_square_array", "row_column_count", "area_boundary_comparison"],
    model_guidance: "\u5355\u4F4D\u6B63\u65B9\u5F62\u6309\u884C\u5217\u94FA\u6EE1\u957F\u65B9\u5F62\uFF1B\u4E24\u4E2A\u6574\u6570\u4F9D\u6B21\u63A7\u5236\u6BCF\u884C\u65B9\u683C\u6570\uFF08\u957F\uFF09\u548C\u884C\u6570\uFF08\u5BBD\uFF09\uFF0C\u7528\u4E8E\u9762\u79EF\u3001\u5468\u957F\u4E0E\u5E73\u65B9\u5355\u4F4D\u6559\u5B66"
  },
  geometric_rearrangement: {
    parts: ["whole", "target_shape", "outer_square", "piece_1", "piece_2", "piece_3", "piece_4", "central_area", "leg_a", "leg_b", "hypotenuse", "primary_control"],
    number_inputs: ["progress"],
    number_input_policies: [{ kind: "normalized_progress" }],
    parameter_names: ["title", "construction", "leg_a", "leg_b"],
    model_parameter_names: ["title", "construction", "leg_a", "leg_b"],
    required_model_schema_parameters: ["construction"],
    parameter_options: {
      construction: ["right_triangle_square", "square_area_identity", "triangle_to_rectangle"]
    },
    semantic_parameters: ["construction", "leg_a", "leg_b"],
    output_kinds: ["geometry"],
    student_controls: ["slider"],
    required_features: ["polygon_pieces", "rigid_rearrangement", "area_relation"],
    model_guidance: REARRANGEMENT_MODEL_GUIDANCE
  },
  circle_area_rearrangement: {
    parts: ["whole", "primary_control"],
    number_inputs: ["progress"],
    number_input_policies: [{ kind: "normalized_progress" }],
    parameter_names: ["title", "radius"],
    model_parameter_names: ["title", "radius"],
    required_model_schema_parameters: [],
    semantic_parameters: ["radius"],
    output_kinds: ["geometry"],
    student_controls: ["slider"],
    required_features: ["circle_area_rearrangement"],
    model_guidance: "\u5706\u9762\u79EF\uFF1A\u6247\u5F62\u7B49\u79EF\u91CD\u6392\uFF0C\u5E95\u8D8B\u8FD1\u03C0r\u3001\u9AD8\u8D8B\u8FD1r"
  },
  number_line: {
    parts: ["whole", "start", "end", "move", "primary_control"],
    number_inputs: ["start", "change"],
    number_input_policies: [{ kind: "unbounded" }, { kind: "unbounded" }],
    // How finely to split each unit and whether to draw hops are the program's: they follow the numbers.
    parameter_names: ["title"],
    model_parameter_names: ["title"],
    required_model_schema_parameters: [],
    semantic_parameters: [],
    output_kinds: ["number_line"],
    student_controls: ["slider"],
    required_features: ["number_line"],
    model_guidance: "\u6570\u8F74\uFF1A\u4E24\u4E2A\u6570\u503C\u4F9D\u6B21\u662F\u8D77\u70B9\u548C\u79FB\u52A8\u91CF\uFF0C\u7EC8\u70B9\u3001\u523B\u5EA6\u4EFD\u6570\u548C\u662F\u5426\u4E00\u683C\u4E00\u8DF3\u90FD\u7531\u7A0B\u5E8F\u6309\u6570\u503C\u51B3\u5B9A\uFF1B\u9002\u5408\u6574\u6570\u3001\u5206\u6570\u3001\u5C0F\u6570\u7684\u52A0\u51CF\u548C\u6570\u5728\u6570\u8F74\u4E0A\u7684\u4F4D\u7F6E\u3002\u5206\u6570\u7528\u6ED1\u6746\u6B65\u957F\u8868\u793A\uFF08\u5982 0.25 \u5373\u56DB\u5206\u4E4B\u4E00\uFF09\u3002\u4E0D\u7528\u4E8E\u51FD\u6570\u56FE\u50CF"
  }
};
var text2 = { type: "string" };
var MATH_SCHEMA_PROPERTIES = {
  // The compiler derives legends from the formulas when none are supplied.
  function_plot: {
    x_label: text2,
    y_label: text2,
    formulas: { type: "array", minItems: 1, maxItems: 8, items: text2 },
    sample_x_numbers: { type: "array", maxItems: 2, items: { type: "integer" } }
  },
  unit_circle_projection: { projection: { enum: ["sin", "cos"] } },
  circle_polygon_bounds: { radius: { type: "number", minimum: 0 } },
  circle_and_arc: { radius: { type: "number", minimum: 0 }, angle: { type: "number" } },
  function_surface_with_section: { expression: text2, section_axis: { enum: ["x", "y", "z"] }, section_value: { type: "number" } },
  implicit_surface_with_section: { expression: text2, section_axis: { enum: ["x", "y", "z"] }, level: { type: "number" } },
  coordinate_circle: {
    radius: { type: "number", minimum: 0 },
    radius_expression: text2,
    center_x: { type: "number" },
    center_y: { type: "number" }
  },
  geometric_rearrangement: {
    construction: { enum: [...MATH_RECIPES.geometric_rearrangement.parameter_options.construction] },
    leg_a: { type: "number", minimum: 0 },
    leg_b: { type: "number", minimum: 0 }
  },
  circle_area_rearrangement: { radius: { type: "number", minimum: 0 } }
};
var MATH_PLUGIN = {
  // The manifest and the Jev subject line are the OLL shared layer's.
  manifest: MATH_PLUGIN_MANIFEST,
  subject: { description: MATH_SUBJECT_DESCRIPTION },
  recipes: MATH_RECIPES,
  schema_properties: MATH_SCHEMA_PROPERTIES,
  prompt_rules: {
    "outline.visual_choice": "\u591A\u8FB9\u5F62\u91CD\u6392\u9009 polygon_pieces\u3001rigid_rearrangement\u3001area_relation\uFF1B\u5706\u9762\u79EF\u9009 circle_area_rearrangement\u3002",
    "section.formulas": "function_plot\uFF1Aformulas \u5199\u53F3\u4FA7\u516C\u5F0F\uFF0C\u6A2A\u8F74 x\u3002\u5E73\u79FB\u66F2\u7EBF\u5199 -(x-n1)^2+n2\uFF0C\u4E0D\u4EE3\u5165\u521D\u503C\u3002\u56FA\u5B9A\u66F2\u7EBF\u4E0A\u79FB\u52A8\u70B9\u7528 sample_x_numbers=[1,2]\uFF08A/B \u6A2A\u5750\u6807\uFF0C\u5355\u70B9\u53EA\u5199\u4E00\u4E2A\uFF09\uFF1B\u4E0D\u7528 content.numbers\u3002\u591A\u5F0F\u4EC5\u9759\u6001\u6BD4\u8F83\u3002\u56FA\u5B9A\u76F4\u7EBF\u4E24\u70B9\u659C\u7387\u4E0D\u53D8\uFF1B\u91CD\u5408\u662F0/0\u3002\u9661\u5CED\u770B\u659C\u7387\u7EDD\u5BF9\u503C\u3002",
    "section.bounds": "\u5706\u5468\u7387\u5272\u5706/\u6B63\u591A\u8FB9\u5F62\u903C\u8FD1\u9009\u5185\u63A5\u6B63\u591A\u8FB9\u5F62\u3001\u5916\u5207\u6B63\u591A\u8FB9\u5F62\u548C\u5468\u957F\u4E0A\u4E0B\u754C\u7279\u5F81\uFF1B\u8FB9\u6570\u7528\u6574\u6570\uFF0C\u4E0D\u53EF\u7528\u5706\u5F27\u89D2\u5EA6\u66FF\u4EE3\u3002\u4E0A\u4E0B\u754C\u7531\u56FE\u5F62\u8BA1\u7B97\uFF0C\u8BB2\u89E3\u7528 n sin(\u03C0/n) < \u03C0 < n tan(\u03C0/n)\u3002",
    "section.linked_numbers": "\u534A\u5F84\u4E0E\u5171\u4EAB\u91CF\u6709\u51FD\u6570\u5173\u7CFB\u65F6\uFF0Ccoordinate_circle \u5199 radius_expression\uFF08\u5982 sqrt(n1)\uFF09\uFF0C\u4E0D\u5199\u56FA\u5B9A radius=2 \u4EE3\u66FF\u8054\u52A8\uFF0C\u4E5F\u4E0D\u8981\u628A\u9AD8\u5EA6\u76F4\u63A5\u5F53\u534A\u5F84\u3002",
    "section.constructions": "geometric_rearrangement \u6309\u6784\u9020\u4E8B\u5B9E\u8BB2\u89E3\uFF1Ba\u3001b\u56FA\u5B9A\uFF0C\u63A7\u4EF6\u53EA\u6539\u53D8\u91CD\u6392\u8FDB\u5EA6\u3002\u590D\u7528\u4F9D visuals_for_section \u7684\u6784\u9020\u4E0E\u5F53\u524D\u72B6\u6001\uFF0C\u5148\u524D\u52A8\u753B\u7EC8\u503C\u4E0D\u4F1A\u81EA\u52A8\u5F52\u96F6\uFF1B\u91CD\u6F14\u9700\u663E\u5F0F restart_numbers\uFF0C\u5426\u5219\u89C2\u5BDF\u5F53\u524D\u5E03\u5C40\u3002\u5706\u9762\u79EF\u7528 circle_area_rearrangement\u3002\u6570\u503C\u4E3A\u91CD\u6392\u8FDB\u5EA6\uFF1B\u6709\u9650\u6247\u5F62\u975E\u77E9\u5F62\uFF0C\u7B49\u5206\u8D8B\u7EC6\u65F6\u5E95\u2192\u03C0r\u3001\u9AD8\u2192r\u3002"
  }
};

// node_modules/octos-lesson-language/dist/packages/plugin-physics/src/index.js
var PHYSICS_PLUGIN_MANIFEST = {
  id: "physics",
  version: "0.1.0",
  depends: { shared: "0.1.0" },
  ollCore: ">=0.10.0"
};
var PHYSICS_SUBJECT_DESCRIPTION = {
  "zh-CN": "\u7269\u7406\uFF1A\u8FD0\u52A8\u4E0E\u529B\u3001\u80FD\u91CF\u3001\u7535\u8DEF\u3001\u5149\u3001\u58F0\u3001\u6D6E\u529B\u7B49",
  "en-US": "Physics: motion and forces, energy, circuits, light, sound, buoyancy"
};
function buildSpringAndMass(input) {
  const { text: text3 } = input;
  const phase = input.phase ? input.phase.initial : input.fixed_phase ?? 0;
  const expression = input.phase?.expression;
  const motion = `${input.as}-motion`;
  const plot = `${input.as}-plot`;
  const geometry = {
    title: text3.title,
    axes: { x: { min: -1.5, max: 1.5, label: text3.displacement }, y: { min: -0.6, max: 0.6 }, equal_scale: true },
    points: [
      { as: "anchor", x: -1.25, y: 0, label: text3.anchor },
      { as: "equilibrium", x: 0, y: 0, label: text3.equilibrium },
      { as: "mass", x: Math.cos(phase), y: 0, label: text3.mass },
      { as: "force-tip", x: Math.cos(phase) * 0.5, y: 0, visible: false }
    ],
    segments: [
      { as: "spring", from: "anchor", to: "mass", style: "solid" },
      { as: "force-arrow", from: "mass", to: "force-tip", style: "solid", label: text3.restoring_force }
    ],
    ...expression ? {
      bindings: [
        { target: "mass.x", expression: `cos(${expression})` },
        { target: "force-tip.x", expression: `0.5*cos(${expression})` }
      ]
    } : {}
  };
  const plotContent = {
    title: text3.plot_title,
    axes: { x: { min: input.phase?.min ?? 0, max: input.phase?.max ?? Math.PI * 2, label: text3.phase }, y: { min: -1.2, max: 1.2, label: text3.displacement } },
    curves: [{ as: "primary-curve", expression: "cos(x)", label: "x = cos(t)" }],
    points: [{ as: "moving-point", x: phase, y: Math.cos(phase), label: text3.current_state }],
    ...expression ? {
      bindings: [
        { target: "moving-point.x", expression },
        { target: "moving-point.y", expression: `cos(${expression})` }
      ]
    } : {}
  };
  return {
    actions: [
      { do: "write", as: motion, kind: "geometry", role: input.role, content: geometry, place: input.place },
      { do: "write", as: plot, kind: "plot", role: input.role, content: plotContent, place: { relation: "right_of", anchor: motion, gap: "normal" } },
      { do: "connect", as: `${input.as}-link`, from: motion, to: plot, relation: "same_state", label: text3.link_label },
      { do: "group", as: input.as, role: input.role, label: text3.group_label, members: [motion, plot] }
    ],
    whole: input.as,
    parts: {
      whole: input.as,
      spring: `${motion}#spring`,
      mass: `${motion}#mass`,
      equilibrium: `${motion}#equilibrium`,
      force_arrow: `${motion}#force-arrow`,
      primary_curve: `${plot}#primary-curve`,
      moving_point: `${plot}#moving-point`,
      ...expression ? { primary_control: `${plot}#moving-point` } : {}
    }
  };
}
function niceAxisMax(value2) {
  if (!(value2 > 0) || !Number.isFinite(value2))
    return 1;
  const power = 10 ** Math.floor(Math.log10(value2));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= value2 * (1 - 1e-9)) ?? 10;
  return Number((step * power).toPrecision(12));
}
function quantityValue(quantity) {
  return quantity.expression ? `(${quantity.expression})` : String(quantity.initial);
}
function buildConstantSpeedMotion(input) {
  const { text: text3, time, speed } = input;
  if (!(time.max > 0) || !(speed.max > 0))
    throw new Error("constant-speed motion needs a positive time and speed maximum");
  if (time.initial < 0 || time.initial > time.max || speed.initial <= 0 || speed.initial > speed.max) {
    throw new Error("constant-speed motion needs 0 <= time <= its maximum and 0 < speed <= its maximum");
  }
  const track = `${input.as}-track`;
  const graph = `${input.as}-graph`;
  const length = niceAxisMax(time.max * speed.max);
  const distance = time.initial * speed.initial;
  const t = quantityValue(time);
  const v = quantityValue(speed);
  const driven2 = Boolean(time.expression || speed.expression);
  const lane = Number((0.08 * length).toPrecision(12));
  const trackContent = {
    title: text3.title,
    axes: { x: { min: -0.05 * length, max: 1.05 * length, label: text3.distance_axis }, y: { min: -0.1 * length, max: 0.2 * length, label: "" }, equal_scale: true },
    points: [
      { as: "start", x: 0, y: lane, label: text3.start },
      { as: "finish", x: length, y: lane, visible: false },
      { as: "object", x: distance, y: lane, label: driven2 ? `${text3.distance_readout}${distance}${text3.distance_unit ? ` ${text3.distance_unit}` : ""}` : text3.object }
    ],
    segments: [
      { as: "track", from: "start", to: "finish", style: "dashed" },
      { as: "travelled", from: "start", to: "object", style: "solid" }
    ],
    ...driven2 ? {
      bindings: [{
        target: "object.x",
        expression: `${v}*${t}`,
        label: { prefix: text3.distance_readout, suffix: text3.distance_unit ? ` ${text3.distance_unit}` : "", precision: 1 }
      }]
    } : {}
  };
  const graphContent = {
    title: text3.plot_title,
    axes: { x: { min: 0, max: time.max, label: text3.time_axis }, y: { min: 0, max: length, label: text3.distance_axis } },
    curves: [{ as: "primary-curve", expression: `${v}*x`, label: text3.curve_label }],
    points: [{ as: "moving-point", x: time.initial, y: distance, label: text3.current_state }],
    ...driven2 ? {
      bindings: [
        { target: "moving-point.x", expression: t },
        { target: "moving-point.y", expression: `${v}*${t}` }
      ]
    } : {}
  };
  return {
    actions: [
      { do: "write", as: track, kind: "geometry", role: input.role, content: trackContent, place: input.place },
      { do: "write", as: graph, kind: "plot", role: input.role, content: graphContent, place: { relation: "right_of", anchor: track, gap: "normal" } },
      { do: "connect", as: `${input.as}-link`, from: track, to: graph, relation: "same_state", label: text3.link_label },
      { do: "group", as: input.as, role: input.role, label: text3.group_label, members: [track, graph] }
    ],
    whole: input.as,
    parts: {
      whole: input.as,
      start: `${track}#start`,
      object: `${track}#object`,
      track: `${track}#track`,
      travelled: `${track}#travelled`,
      primary_curve: `${graph}#primary-curve`,
      moving_point: `${graph}#moving-point`,
      ...time.expression ? { primary_control: `${graph}#moving-point` } : {}
    }
  };
}

// src/plugins/physics.ts
var PHYSICS_RECIPES = {
  spring_and_mass: {
    parts: ["whole", "spring", "mass", "equilibrium", "force_arrow", "primary_curve", "moving_point", "primary_control"],
    number_inputs: ["phase"],
    number_input_policies: [{ kind: "angle" }],
    parameter_names: ["title"],
    model_parameter_names: ["title"],
    required_model_schema_parameters: [],
    semantic_parameters: [],
    output_kinds: ["geometry", "plot"],
    student_controls: ["slider"],
    required_features: ["spring_mass", "cartesian_function_curve"],
    model_guidance: "\u5F39\u7C27\u3001\u7269\u4F53\u3001\u5E73\u8861\u4F4D\u7F6E\u3001\u56DE\u590D\u529B\u548C\u4F59\u5F26\u53D8\u5316\u66F2\u7EBF\u5171\u4EAB\u76F8\u4F4D"
  },
  constant_speed_motion: {
    parts: ["whole", "start", "object", "track", "travelled", "primary_curve", "moving_point", "primary_control"],
    number_inputs: ["time", "speed"],
    number_input_policies: [{ kind: "bounded", min: 0, max: 1e6 }, { kind: "positive" }],
    parameter_names: ["title", "speed"],
    model_parameter_names: ["title", "speed"],
    required_model_schema_parameters: [],
    semantic_parameters: ["speed"],
    output_kinds: ["geometry", "plot"],
    student_controls: ["slider"],
    required_features: ["uniform_motion", "distance_time_graph"],
    model_guidance: "\u5300\u901F\u76F4\u7EBF\u8FD0\u52A8\uFF1A\u7269\u4F53\u6CBF\u76F4\u7EBF\u524D\u8FDB\uFF0C\u8DEF\u7A0B\u2014\u65F6\u95F4\u56FE\u50CF\u662F\u8FC7\u539F\u70B9\u7684\u76F4\u7EBF\uFF08s = v t\uFF09\uFF1B\u4E24\u4E2A\u6570\u503C\u4F9D\u6B21\u63A7\u5236\u65F6\u95F4\u548C\u901F\u5EA6\uFF0C\u901F\u5EA6\u6539\u53D8\u76F4\u7EBF\u503E\u659C\u7A0B\u5EA6\u3002\u9002\u5408\u901F\u5EA6\u3001\u8DEF\u7A0B\u4E0E\u65F6\u95F4\u5173\u7CFB\u3001\u8BFB\u8DEF\u7A0B\u2014\u65F6\u95F4\u56FE\u50CF\uFF1B\u4E0D\u7528\u4E8E\u53D8\u901F\u3001\u52A0\u901F\u6216\u66F2\u7EBF\u8FD0\u52A8"
  }
};
var PHYSICS_PLUGIN = {
  // The manifest and the Jev subject line are the OLL shared layer's.
  manifest: PHYSICS_PLUGIN_MANIFEST,
  subject: { description: PHYSICS_SUBJECT_DESCRIPTION },
  recipes: PHYSICS_RECIPES,
  schema_properties: {
    constant_speed_motion: { speed: { type: "number", minimum: 0 } }
  },
  prompt_rules: {}
};

// node_modules/octos-lesson-language/dist/packages/plugin-shared/src/index.js
var SHARED_PLUGIN_MANIFEST = {
  id: "shared",
  version: "0.1.0",
  depends: {},
  ollCore: ">=0.10.0"
};
var pad = (index) => String(index).padStart(2, "0");
var processStepId = (index) => `step-${pad(index)}`;
var processEdgeId = (index) => `edge-${pad(index)}`;
var PROCESS_CYCLE_EDGE_ID = "edge-close";
function processDiagramContent(input) {
  const { steps } = input;
  const elements = steps.map((step, index) => ({ as: processStepId(index + 1), label: step.label }));
  const edges = steps.slice(1).map((step, index) => {
    const label = step.link ?? input.link_label;
    return { as: processEdgeId(index + 1), from: processStepId(index + 1), to: processStepId(index + 2), ...label !== void 0 ? { label } : {} };
  });
  if (input.shape === "cycle" && steps.length > 2) {
    edges.push({ as: PROCESS_CYCLE_EDGE_ID, from: processStepId(steps.length), to: processStepId(1) });
  }
  return { ...input.title !== void 0 ? { title: input.title } : {}, elements, edges };
}
function buildProcessDiagram(input) {
  const count = input.steps.length;
  return {
    actions: [{ do: "write", as: input.as, kind: "diagram", role: input.role, content: processDiagramContent(input), place: input.place }],
    whole: input.as,
    parts: {
      whole: input.as,
      first_step: `${input.as}#${processStepId(1)}`,
      current_step: `${input.as}#${processStepId(Math.min(2, count))}`,
      last_step: `${input.as}#${processStepId(count)}`
    }
  };
}

// src/plugins/shared.ts
var PROCESS_DIAGRAM_CONTRACT = {
  min_steps: 2,
  max_steps: 8,
  max_step_characters: 80,
  max_title_characters: 120
};
var SHARED_RECIPES = {
  process_diagram: {
    parts: ["whole", "first_step", "current_step", "last_step"],
    number_inputs: [],
    number_input_policies: [],
    parameter_names: ["title", "steps"],
    model_parameter_names: ["title", "steps"],
    required_model_schema_parameters: ["steps"],
    semantic_parameters: ["steps"],
    output_kinds: ["diagram"],
    student_controls: [],
    required_features: ["ordered_process_steps"],
    model_guidance: "\u6982\u5FF5\u6216\u6B65\u9AA4\u6D41\u7A0B\u56FE\uFF1B\u6CA1\u6709\u51E0\u4F55\u79FB\u52A8\uFF0C\u4E5F\u4E0D\u63A5\u53D7\u6570\u503C\u8F93\u5165"
  }
};
var SHARED_PLUGIN = {
  manifest: SHARED_PLUGIN_MANIFEST,
  recipes: SHARED_RECIPES,
  schema_properties: {
    process_diagram: {
      // Strings carry no length keywords; the validator enforces them.
      steps: { type: "array", minItems: PROCESS_DIAGRAM_CONTRACT.min_steps, maxItems: PROCESS_DIAGRAM_CONTRACT.max_steps, items: { type: "string" } }
    }
  },
  prompt_rules: {
    "outline.visual_choice": "ordered_process_steps \u4EC5\u662F\u9759\u6001\u6D41\u7A0B\u3002",
    "section.constructions": "process_diagram \u65E0\u6570\u503C/\u52A8\u753B\u3002"
  }
};

// node_modules/octos-lesson-language/dist/packages/plugin-chemistry/src/index.js
var CHEMISTRY_PLUGIN_MANIFEST = {
  id: "chemistry",
  version: "0.1.0",
  // Every subject plugin depends on the shared tools (decision 0012).
  depends: { shared: "0.1.0" },
  ollCore: ">=0.10.0"
};
var CHEMISTRY_SUBJECT_DESCRIPTION = {
  "zh-CN": "\u5316\u5B66\uFF1A\u7269\u8D28\u7684\u7EC4\u6210\u4E0E\u7ED3\u6784\u3001\u5316\u5B66\u53CD\u5E94\u3001\u5143\u7D20\u4E0E\u5468\u671F\u8868\u3001\u6EB6\u6DB2\u3001\u9178\u548C\u78B1",
  "en-US": "Chemistry: matter and its structure, chemical reactions, elements and the periodic table, solutions, acids and bases"
};

// src/plugins/chemistry.ts
var CHEMISTRY_PLUGIN = {
  // The manifest and the Jev subject line are the OLL shared layer's.
  manifest: CHEMISTRY_PLUGIN_MANIFEST,
  subject: { description: CHEMISTRY_SUBJECT_DESCRIPTION },
  recipes: {},
  schema_properties: {},
  prompt_rules: {}
};

// node_modules/octos-lesson-language/dist/packages/plugin-biology/src/index.js
var BIOLOGY_PLUGIN_MANIFEST = {
  id: "biology",
  version: "0.1.0",
  // Every subject plugin depends on the shared tools (decision 0012).
  depends: { shared: "0.1.0" },
  ollCore: ">=0.10.0"
};
var BIOLOGY_SUBJECT_DESCRIPTION = {
  "zh-CN": "\u751F\u7269\uFF1A\u7EC6\u80DE\u3001\u9057\u4F20\u4E0E\u8FDB\u5316\u3001\u751F\u6001\u7CFB\u7EDF\u3001\u4EBA\u4F53\u3001\u690D\u7269\u4E0E\u52A8\u7269",
  "en-US": "Biology: cells, heredity and evolution, ecosystems, the human body, plants and animals"
};

// src/plugins/biology.ts
var BIOLOGY_PLUGIN = {
  // The manifest and the Jev subject line are the OLL shared layer's.
  manifest: BIOLOGY_PLUGIN_MANIFEST,
  subject: { description: BIOLOGY_SUBJECT_DESCRIPTION },
  recipes: {},
  schema_properties: {},
  prompt_rules: {}
};

// node_modules/octos-lesson-language/dist/packages/plugin-earth-space/src/index.js
var EARTH_SPACE_PLUGIN_MANIFEST = {
  id: "earth_space",
  version: "0.1.0",
  // Every subject plugin depends on the shared tools (decision 0012).
  depends: { shared: "0.1.0" },
  ollCore: ">=0.10.0"
};
var EARTH_SPACE_SUBJECT_DESCRIPTION = {
  "zh-CN": "\u5730\u7403\u4E0E\u5B87\u5B99\uFF1A\u5929\u6C14\u4E0E\u6C14\u5019\u3001\u6C34\u5FAA\u73AF\u3001\u5CA9\u77F3\u4E0E\u5730\u8C8C\u3001\u5730\u7403\u4E0E\u592A\u9633\u7CFB",
  "en-US": "Earth and space science: weather and climate, the water cycle, rocks and landforms, Earth and the solar system"
};

// src/plugins/earth-space.ts
var EARTH_SPACE_PLUGIN = {
  // The manifest and the Jev subject line are the OLL shared layer's.
  manifest: EARTH_SPACE_PLUGIN_MANIFEST,
  subject: { description: EARTH_SPACE_SUBJECT_DESCRIPTION },
  recipes: {},
  schema_properties: {},
  prompt_rules: {}
};

// src/plugins/index.ts
var INSTALLED_PLUGINS = [
  MATH_PLUGIN,
  PHYSICS_PLUGIN,
  CHEMISTRY_PLUGIN,
  BIOLOGY_PLUGIN,
  EARTH_SPACE_PLUGIN,
  SHARED_PLUGIN
];
var ALL_RECIPES = { ...MATH_PLUGIN.recipes, ...PHYSICS_PLUGIN.recipes, ...SHARED_PLUGIN.recipes };
var RECIPE_CATALOG_ORDER = [
  "function_plot",
  "unit_circle_projection",
  "circle_polygon_bounds",
  "circle_and_arc",
  "spring_and_mass",
  "cube_with_section",
  "function_surface_with_section",
  "implicit_surface_with_section",
  "coordinate_circle",
  "rectangle_unit_square_array",
  "geometric_rearrangement",
  "circle_area_rearrangement",
  "process_diagram"
];
var TRIAL_RECIPES = ["constant_speed_motion", "number_line"];
function enabledTrialRecipes(list2) {
  const named = new Set((list2 ?? "").split(",").map((name) => name.trim()).filter(Boolean));
  return TRIAL_RECIPES.filter((name) => named.has(name));
}
var processEnvironment = globalThis.process?.env;
var OFFERED_RECIPES = [
  ...RECIPE_CATALOG_ORDER,
  ...enabledTrialRecipes(processEnvironment?.LEARNING_COACH_TRIAL_RECIPES)
];
var PLUGIN_RECIPE_REGISTRY = Object.fromEntries(
  OFFERED_RECIPES.map((name) => [name, ALL_RECIPES[name]])
);
var RECIPE_PLUGIN = Object.fromEntries(
  INSTALLED_PLUGINS.flatMap((plugin) => Object.keys(plugin.recipes).map((name) => [name, plugin.manifest.id]))
);
var RECIPE_SCHEMA_PROPERTIES = Object.assign(
  {},
  ...INSTALLED_PLUGINS.map((plugin) => plugin.schema_properties)
);
var SCHEMA_PROPERTY_ORDER = [
  "title",
  "projection",
  "x_label",
  "y_label",
  "formulas",
  "sample_x_numbers",
  "expression",
  "section_axis",
  "section_value",
  "level",
  "radius",
  "angle",
  "radius_expression",
  "center_x",
  "center_y",
  "construction",
  "leg_a",
  "leg_b",
  "steps",
  "speed"
];
function promptSlot(slot, core = "", plugins = INSTALLED_PLUGINS) {
  const text3 = core + plugins.map((plugin) => plugin.prompt_rules[slot] ?? "").join("");
  return text3 ? `- ${text3}` : "";
}

// src/lesson-text.ts
var EN = {
  "\u51FD\u6570\u56FE\u50CF": "Function graph",
  "\u5355\u4F4D\u5706\u4E0E\u6295\u5F71": "Unit circle and projection",
  "{{v0}}\u51FD\u6570\u56FE\u50CF": "{{v0}} function graph",
  "\u6B63\u5F26": "Sine",
  "\u4F59\u5F26": "Cosine",
  "\u65CB\u8F6C\u89D2\u4E0E\u5468\u671F\u6CE2\u52A8": "Rotation angle and periodic variation",
  "\u5355\u4F4D\u5706\u4E0E\u51FD\u6570\u56FE\u50CF": "Unit circle and function graph",
  "\u5706\u4E0E\u6B63\u591A\u8FB9\u5F62\u7684\u5468\u957F\u5939\u903C": "Bounding a circle's circumference with regular polygons",
  "\u5185\u63A5\u6B63\u591A\u8FB9\u5F62": "Inscribed regular polygon",
  "\u5916\u5207\u6B63\u591A\u8FB9\u5F62": "Circumscribed regular polygon",
  "\u7EFF\u8272\u5185\u63A5\u5468\u957F < \u5706\u5468\u957F < \u6A59\u8272\u5916\u5207\u5468\u957F\u3002\u9664\u4EE5\u76F4\u5F84 2r\uFF1An sin(\u03C0/n) < \u03C0 < n tan(\u03C0/n)\u3002\u663E\u793A\u503C\u4E3A\u8FD1\u4F3C\u503C\uFF1B\u8FB9\u6570\u589E\u52A0\u65F6\u4E0A\u4E0B\u754C\u5171\u540C\u903C\u8FD1 \u03C0\u3002": "Green inscribed perimeter < circle circumference < orange circumscribed perimeter. Dividing by the diameter 2r gives n sin(\u03C0/n) < \u03C0 < n tan(\u03C0/n). Displayed values are approximations; both bounds approach \u03C0 as the number of sides increases.",
  "\u5706\u3001\u5706\u5FC3\u89D2\u4E0E\u5706\u5F27": "Circle, central angle, and arc",
  "\u534A\u5F84 r": "Radius r",
  "\u5706\u5F27": "Arc",
  "\u5F39\u7C27\u632F\u5B50\u7684\u5F80\u590D\u8FD0\u52A8": "Oscillation of a spring and mass",
  "\u4F4D\u79FB": "Displacement",
  "\u56FA\u5B9A\u7AEF": "Fixed end",
  "\u5E73\u8861\u4F4D\u7F6E": "Equilibrium position",
  "\u7269\u4F53": "Mass",
  "\u56DE\u590D\u529B": "Restoring force",
  "\u4F4D\u79FB\u968F\u76F8\u4F4D\u53D8\u5316": "Displacement versus phase",
  "\u76F8\u4F4D": "Phase",
  "\u5F53\u524D\u72B6\u6001": "Current state",
  "\u540C\u4E00\u65F6\u523B\u7684\u4F4D\u79FB": "Displacement at the same instant",
  "\u5F39\u7C27\u8FD0\u52A8\u4E0E\u51FD\u6570\u56FE\u50CF": "Spring motion and function graph",
  "\u6570\u8F74": "Number line",
  "\u7EC8\u70B9": "End",
  "\u5300\u901F\u76F4\u7EBF\u8FD0\u52A8": "Motion at constant speed",
  "\u8D77\u70B9": "Start",
  "\u8FD0\u52A8\u7269\u4F53": "Moving object",
  "\u7269\u4F53 s = ": "Object s = ",
  "\u8DEF\u7A0B s": "Distance s",
  "\u65F6\u95F4 t": "Time t",
  "\uFF08{{v0}}\uFF09": " ({{v0}})",
  "\u8DEF\u7A0B\u968F\u65F6\u95F4\u53D8\u5316": "Distance versus time",
  "\u540C\u4E00\u65F6\u523B": "Same instant",
  "\u5300\u901F\u8FD0\u52A8\u4E0E\u8DEF\u7A0B\u2014\u65F6\u95F4\u56FE\u50CF": "Constant-speed motion and its distance\u2013time graph",
  "\u6B63\u65B9\u4F53\u3001\u9876\u70B9\u3001\u68F1\u3001\u9762\u4E0E\u622A\u9762": "Cube, vertices, edges, faces, and sections",
  "\u4E00\u4E2A\u4E2D\u5FC3\u5728\u539F\u70B9\u3001\u8FB9\u957F\u4E3A 2 \u7684\u6B63\u65B9\u4F53\uFF0C\u6807\u51FA\u4E86\u9876\u70B9\u3001\u68F1\u3001\u9762\u548C\u6C34\u5E73\u622A\u9762\u3002": "A cube centred at the origin with side length 2, showing a vertex, an edge, a face, and a horizontal section.",
  "\u6B63\u65B9\u4F53": "Cube",
  "\u6C34\u5E73\u622A\u9762": "Horizontal section",
  "\u9876\u70B9": "Vertex",
  "\u68F1": "Edge",
  "\u9762": "Face",
  "\u51FD\u6570\u66F2\u9762\u4E0E\u622A\u9762": "Function surface and section",
  "\u51FD\u6570\u66F2\u9762 z={{v0}} \u4E0E\u53EF\u53D8\u622A\u9762\u3002": "Function surface z={{v0}} with a variable section.",
  "\u622A\u9762": "Section",
  "\u9690\u5F0F\u66F2\u9762\u4E0E\u622A\u9762": "Implicit surface and section",
  "\u9690\u5F0F\u66F2\u9762 {{v0}}={{v1}} \u4E0E\u53EF\u53D8\u8F74\u5411\u622A\u9762\u3002": "Implicit surface {{v0}}={{v1}} with a variable axis-aligned section.",
  "\u5750\u6807\u7CFB\u4E2D\u7684\u5706": "Circle in a coordinate system",
  "\u5355\u4F4D\u6B63\u65B9\u5F62\u94FA\u6210\u957F\u65B9\u5F62": "Tiling a rectangle with unit squares",
  "\u6BCF\u4E2A\u5C0F\u65B9\u683C\u9762\u79EF\u4E3A 1 \u5E73\u65B9\u5355\u4F4D\uFF1B\u6BCF\u884C\u65B9\u683C\u6570 \xD7 \u884C\u6570 = \u65B9\u683C\u603B\u6570 = \u957F\u65B9\u5F62\u9762\u79EF\u3002": "Each square has an area of 1 square unit. Squares per row \xD7 number of rows = total squares = area of the rectangle.",
  "\u6BCF\u884C\u65B9\u683C\u6570\uFF08\u957F\uFF09": "Squares per row (length)",
  "\u884C\u6570\uFF08\u5BBD\uFF09": "Number of rows (width)",
  "1 \u5E73\u65B9\u5355\u4F4D": "1 square unit",
  "{{v0}} \u7B49\u5206\u5706\u7684\u9762\u79EF\u91CD\u6392": "Rearranging a circle divided into {{v0}} sectors",
  "\u534A\u5F84 r={{v0}}\uFF1B\u6BCF\u5757\u5747\u4E3A\u771F\u5B9E\u6247\u5F62\uFF0C\u91CD\u6392\u9762\u79EF\u4E0D\u53D8\u3002\u6709\u9650\u7B49\u5206\u7684\u8FB9\u7F18\u4ECD\u5F2F\u66F2\uFF1B\u7B49\u5206\u8D8A\u7EC6\uFF0C\u5E95\u8D8B\u8FD1 \u03C0r\uFF0C\u9AD8\u8D8B\u8FD1 r\uFF0C\u9762\u79EF\u4E3A \u03C0r\xB2\u3002": "Radius r={{v0}}. Each piece is a true sector, and rearranging preserves area. With finitely many sectors the edges remain curved. As the sectors become finer, the base approaches \u03C0r and the height approaches r; the area is \u03C0r\xB2.",
  "\u5F00\u59CB": "Start",
  "\u89C2\u5BDF\u53D8\u5316": "Observe the change",
  "\u5F97\u5230\u7ED3\u8BBA": "Draw a conclusion",
  "\u4E0B\u4E00\u6B65": "Next step",
  "\u8FC7\u7A0B\u56FE": "Process diagram",
  "\u6570\u503C": "the value",
  "\u8BF7\u628A{{v0}}\u8C03\u5230 {{v1}}{{v2}}\u3002": "Set {{v0}} to {{v1}}{{v2}}.",
  "\u5B8C\u6210\uFF0C{{v0}}\u5DF2\u7ECF\u8C03\u5230 {{v1}}{{v2}}\u3002": "Done: {{v0}} is now {{v1}}{{v2}}.",
  "\u7EE7\u7EED\u89C2\u5BDF\u5DF2\u6709\u7684\u540C\u4E00\u753B\u9762": "Continue observing the same existing visual",
  "\u7EE7\u7EED\u89C2\u5BDF\u5F53\u524D\u753B\u9762": "Continue observing the current visual",
  "\u62D6\u52A8\u5DE6\u4E0B\u89D2\u7684\u6ED1\u6746\uFF0C\u89C2\u5BDF\u6570\u503C\u548C\u753B\u9762\u540C\u6B65\u53D8\u5316\u3002": "Drag the slider at the bottom left and watch the value and visual change together.",
  "\u76EE\u524D\u8FD8\u4E0D\u80FD\u5B8C\u6574\u751F\u6210\u8FD9\u8282\u8BFE\uFF0C\u56E0\u4E3A\u5176\u4E2D\u5305\u542B\u5C1A\u672A\u652F\u6301\u7684\u753B\u9762\u6216\u4E92\u52A8\u3002": "This lesson cannot be generated in full yet because it includes visuals or interactions that are not supported.",
  "\u76EE\u524D\u8FD8\u4E0D\u80FD\u5728\u540C\u4E00\u5F20\u51FD\u6570\u56FE\u4E2D\u540C\u65F6\u5C55\u793A\u9759\u6001\u66F2\u7EBF\u548C\u7531\u63A7\u4EF6\u6539\u53D8\u7684\u53E6\u4E00\u6761\u66F2\u7EBF\u3002": "A static curve and another curve changed by a control cannot yet be shown together in the same graph.",
  "\u8BFE\u7A0B\u5185\u5BB9\u4ECD\u5728\u7EE7\u7EED\u751F\u6210\u3002": "The rest of the lesson is still being generated.",
  "\u5F53\u524D\u767D\u677F\u53EA\u80FD\u6267\u884C\u4E8C\u7EF4\u56FE\u5F62\u548C\u4E09\u7EF4\u573A\u666F\uFF0C\u4E0D\u80FD\u7CBE\u786E\u6A21\u62DF\u56DB\u7EF4\u8D85\u7ACB\u65B9\u4F53\u7684\u56DB\u7EF4\u65CB\u8F6C\u3002\u4F60\u53EF\u4EE5\u6539\u95EE\u5B83\u7684\u4E09\u7EF4\u6295\u5F71\u539F\u7406\u6216\u57FA\u672C\u7ED3\u6784\u3002": "The board supports 2D diagrams and 3D scenes, but cannot accurately simulate a 4D hypercube rotating in four dimensions. You can ask about its 3D projections or basic structure instead.",
  "A\u70B9\u7684x\u5750\u6807": "x-coordinate of point A",
  "B\u70B9\u7684x\u5750\u6807": "x-coordinate of point B",
  "\u6211\u6CA1\u80FD\u7A33\u5B9A\u8BFB\u6E05\u8FD9\u6B21\u624B\u5199\u9009\u533A\uFF0C\u8BF7\u91CD\u65B0\u6846\u9009\uFF0C\u6216\u8005\u628A\u516C\u5F0F\u5199\u5927\u4E00\u4E9B\u518D\u8BD5\u4E00\u6B21\u3002": "I could not read the selected handwriting reliably. Select it again, or write the formula larger and try again.",
  "\u6211\u6CA1\u80FD\u7A33\u5B9A\u8BFB\u53D6\u8FD9\u6B21\u6444\u50CF\u5934\u753B\u9762\uFF0C\u8BF7\u628A\u9898\u76EE\u6216\u7269\u4F53\u653E\u5230\u753B\u9762\u4E2D\u592E\u540E\u518D\u8BD5\u4E00\u6B21\u3002": "I could not read this camera image reliably. Place the question or object in the centre and try again.",
  "\u76EE\u524D\u8FD8\u4E0D\u80FD\u5B8C\u6574\u751F\u6210\u8FD9\u8282\u8BFE\uFF1A{{v0}}": "This lesson cannot be generated in full yet: {{v0}}"
};
function lessonText(language, source, values = {}) {
  const message = /^en(?:-|$)/i.test(language ?? "") ? EN[source] ?? source : source;
  return message.replace(/\{\{(\w+)\}\}/g, (token, key) => String(values[key] ?? token));
}
var languages = /* @__PURE__ */ new WeakMap();
function setLessonTextLanguage(plan, language) {
  languages.set(plan, language);
}
function compileText(plan, source, values) {
  return lessonText(languages.get(plan), source, values);
}

// src/recipe-kit.ts
var LESSON_PLAN_SCENE_INITIAL_CAMERAS = {
  cube_with_section: { yaw: 0.72, pitch: 0.55, zoom: 1 },
  function_surface_with_section: { yaw: 0.72, pitch: 0.55, zoom: 1 },
  implicit_surface_with_section: { yaw: 0.72, pitch: 0.55, zoom: 1 }
};
function fail2(code, path, message) {
  throw new LessonPlanError(code, path, message);
}
function pad2(index) {
  return String(index).padStart(2, "0");
}
function variableAlias(index) {
  return `number_${pad2(index)}`;
}
function parameters(content) {
  return content.parameters ?? {};
}
function allowParameterKeys(value2, allowed, path) {
  const accepted = new Set(allowed);
  for (const key of Object.keys(value2)) {
    if (!accepted.has(key)) fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.${key}`, "unsupported capability parameter");
  }
}
function optionalText(value2, fallback, path) {
  if (value2 === void 0) return fallback;
  if (typeof value2 !== "string" || value2.trim().length === 0) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", path, "expected a non-empty string");
  }
  return value2;
}
function optionalNumber(value2, fallback, path) {
  if (value2 === void 0) return fallback;
  if (typeof value2 !== "number" || !Number.isFinite(value2)) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", path, "expected a finite number");
  }
  return value2;
}
function optionalInteger(value2, fallback, min, max, path) {
  const result = optionalNumber(value2, fallback, path);
  if (!Number.isInteger(result) || result < min || result > max) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", path, `expected an integer from ${min} to ${max}`);
  }
  return result;
}
function optionalStringArray(value2, fallback, path) {
  if (value2 === void 0) return fallback;
  if (!Array.isArray(value2) || value2.length === 0 || value2.some((item) => typeof item !== "string" || !item.trim())) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", path, "expected a non-empty string array");
  }
  return [...value2];
}
function assertRange(min, max, path) {
  if (!(min < max)) fail2("LESSON_PLAN_CAPABILITY_PARAMETER", path, "range minimum must be smaller than maximum");
}
function replaceIdentifier(expression, source, target) {
  return expression.replace(new RegExp(`\\b${source}\\b`, "gu"), target);
}
var LOG_ALIASES = { log10: "10", lg: "10", log2: "2" };
function expandLogarithmAliases(expression) {
  let result = "";
  let cursor = 0;
  const pattern = /\b(log10|lg|log2)\s*\(/gu;
  for (let match = pattern.exec(expression); match; match = pattern.exec(expression)) {
    if (match.index < cursor) continue;
    const start = match.index + match[0].length;
    let end = start, depth = 1;
    for (; end < expression.length; end += 1) {
      if (expression[end] === "(") depth += 1;
      if (expression[end] === ")" && --depth === 0) break;
    }
    if (depth !== 0) return expression;
    const inner = expandLogarithmAliases(expression.slice(start, end));
    result += `${expression.slice(cursor, match.index)}(ln(${inner})/ln(${LOG_ALIASES[match[1]]}))`;
    cursor = end + 1;
    pattern.lastIndex = cursor;
  }
  return result + expression.slice(cursor);
}
function safeFunctionExpression(value2, fallback, variables, path) {
  const expression = expandLogarithmAliases(optionalText(value2, fallback, path));
  try {
    compileMathExpression(expression, variables);
  } catch (error) {
    fail2(
      "LESSON_PLAN_CAPABILITY_PARAMETER",
      path,
      error instanceof Error ? error.message : "invalid mathematical expression"
    );
  }
  return expression;
}
function evaluate(expression, variables, values, path) {
  try {
    const result = compileMathExpression(expression, variables)(values);
    if (!Number.isFinite(result)) throw new Error("result is not finite");
    return result;
  } catch (error) {
    fail2(
      "LESSON_PLAN_CAPABILITY_PARAMETER",
      path,
      error instanceof Error ? error.message : "expression cannot be evaluated"
    );
  }
}
function mathExpressionToOll(expression) {
  const operators = {
    add: "+",
    subtract: "-",
    multiply: "*",
    divide: "/",
    power: "^"
  };
  const stack = [];
  expression.forEach((token) => {
    if (token.kind === "input") stack.push("x");
    else if (token.kind === "number") stack.push(variableAlias(token.number));
    else if (token.kind === "literal") stack.push(String(token.value));
    else if (token.kind === "constant") stack.push(token.name);
    else if (token.kind === "negate") {
      const value2 = stack.pop();
      if (!value2) fail2("LESSON_PLAN_EXPRESSION", "$expression", "negate is missing an operand");
      stack.push(`-(${value2})`);
    } else if (token.kind === "function") {
      const value2 = stack.pop();
      if (!value2) fail2("LESSON_PLAN_EXPRESSION", "$expression", "function is missing an operand");
      stack.push(`${token.name}(${value2})`);
    } else {
      const right = stack.pop();
      const left = stack.pop();
      if (!left || !right) fail2("LESSON_PLAN_EXPRESSION", "$expression", "operator is missing operands");
      stack.push(`(${left})${operators[token.operator]}(${right})`);
    }
  });
  const result = stack[0];
  if (!result || stack.length !== 1) fail2("LESSON_PLAN_EXPRESSION", "$expression", "expression does not produce one result");
  return result;
}
function place(input, path, reference) {
  const gap = input.gap === "tight" ? "compact" : input.gap === "wide" ? "spacious" : input.gap;
  const sectionMatch = path.match(/sections\[(\d+)\]/u);
  const regionRole = sectionMatch ? `section-${pad2(Number(sectionMatch[1]) + 1)}` : "lesson-content";
  return {
    relation: input.relation,
    ...input.relation === "new_region" ? { region_role: regionRole } : {},
    ...input.reference ? { anchor: reference(`${path}.reference`) } : {},
    ...input.align ? { align: input.align } : {},
    ...gap ? { gap } : {}
  };
}
var SPEECH_PHASE_ORDER = { before_speech: 0, during_speech: 1, after_speech: 2 };
function includeWrittenCardsInFocus(actions) {
  const phase = (action) => SPEECH_PHASE_ORDER[action.when ?? "during_speech"] ?? 1;
  actions.forEach((action, index) => {
    if (action.do !== "focus") return;
    const focus = action;
    for (const earlier of actions.slice(0, index)) {
      const write2 = earlier;
      if (write2.do !== "write" || !write2.as || !["math", "note", "text"].includes(String(write2.kind))) continue;
      if (phase(write2) > phase(action) || focus.targets.includes(write2.as)) continue;
      focus.targets.push(write2.as);
    }
  });
}
function actionWhen(timing) {
  return timing ? { when: timing } : {};
}
function numberDefinition(plan, index, path) {
  const definition = plan.numbers?.[index - 1];
  if (!definition) fail2("LESSON_PLAN_NUMBER_REFERENCE", path, "number reference is unavailable");
  return definition;
}
function namedNumbers(text3, plan) {
  return text3.replace(/\bn([1-9])\b/gu, (placeholder, digit) => {
    const label = plan.numbers?.[Number(digit) - 1]?.label?.trim();
    if (!label) return placeholder;
    return /([A-Za-z\u03b1-\u03c9])$/u.exec(label)?.[1] ?? label;
  });
}
var SUBSCRIPT_DIGITS = "\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089";
var SUPERSCRIPT_DIGITS = "\u2070\xB9\xB2\xB3\u2074\u2075\u2076\u2077\u2078\u2079";
function displayNumberSymbols(plan, indexes) {
  const requested = /* @__PURE__ */ new Map();
  for (const index of [...new Set(indexes)].sort((a, b) => a - b)) {
    const label = plan.numbers?.[index - 1]?.label?.trim();
    const suffix = label && /(?:^|[^A-Za-z\u0370-\u03ff])([A-Za-z\u0370-\u03ff])$/u.exec(label)?.[1];
    requested.set(index, suffix || label || `n${index}`);
  }
  const counts = /* @__PURE__ */ new Map();
  for (const name of requested.values()) counts.set(name, (counts.get(name) ?? 0) + 1);
  const symbols = /* @__PURE__ */ new Map();
  const reserved = /* @__PURE__ */ new Set(["x", "y", "\u03C0", "pi", "e"]);
  const assigned = /* @__PURE__ */ new Set([...reserved, ...requested.values()]);
  for (const [index, name] of requested) {
    if (!reserved.has(name) && counts.get(name) === 1) {
      symbols.set(index, name);
      continue;
    }
    const subscript = [...String(index)].map((digit) => SUBSCRIPT_DIGITS[Number(digit)]).join("");
    let candidate = name + subscript;
    while (assigned.has(candidate)) candidate += subscript;
    assigned.add(candidate);
    symbols.set(index, candidate);
  }
  return symbols;
}
var DISPLAY_LEVEL_ADD = 0;
var DISPLAY_LEVEL_MUL = 1;
var DISPLAY_LEVEL_UNARY = 2;
var DISPLAY_LEVEL_POWER = 3;
var DISPLAY_LEVEL_ATOM = 4;
var SIMPLE_IDENTIFIER = /^[A-Za-z\u0370-\u03ff][₀-₉]*$/u;
function formatMathExpressionDisplay(expression, symbol) {
  const stack = [];
  const pop = (what) => {
    const part = stack.pop();
    if (!part) fail2("LESSON_PLAN_EXPRESSION", "$expression", `${what} is missing an operand`);
    return part;
  };
  const parenthesize = (part) => `(${part.text})`;
  for (const token of expression) {
    if (token.kind === "input") stack.push({ text: "x", level: DISPLAY_LEVEL_ATOM });
    else if (token.kind === "number") {
      const name = symbol(token.number);
      stack.push({ text: /[+−*/^=()·]|\s/u.test(name) ? `[${name}]` : name, level: DISPLAY_LEVEL_ATOM });
    } else if (token.kind === "constant") stack.push({ text: token.name === "pi" ? "\u03C0" : token.name, level: DISPLAY_LEVEL_ATOM });
    else if (token.kind === "literal") {
      const magnitude = String(Math.abs(token.value));
      stack.push(token.value < 0 || Object.is(token.value, -0) ? { text: `\u2212${magnitude}`, level: DISPLAY_LEVEL_UNARY, minus: magnitude } : { text: magnitude, level: DISPLAY_LEVEL_ATOM, literal: token.value });
    } else if (token.kind === "negate") {
      const operand = pop("negate");
      const needsParens = operand.minus !== void 0 || operand.level === DISPLAY_LEVEL_ADD;
      const inner = needsParens ? parenthesize(operand) : operand.text;
      stack.push({ text: `\u2212${inner}`, level: DISPLAY_LEVEL_UNARY, minus: inner });
    } else if (token.kind === "function") {
      const operand = pop("function");
      if (token.name === "abs") stack.push({ text: `|${operand.text}|`, level: DISPLAY_LEVEL_ATOM });
      else if (token.name === "sqrt") {
        stack.push({ text: operand.level === DISPLAY_LEVEL_ATOM && !operand.text.startsWith("(") ? `\u221A${operand.text}` : `\u221A(${operand.text})`, level: DISPLAY_LEVEL_ATOM });
      } else stack.push({ text: `${token.name}(${operand.text})`, level: DISPLAY_LEVEL_ATOM, call: true });
    } else if (token.operator === "power") {
      const exponent = pop("power");
      const base = pop("power");
      const baseText = base.level < DISPLAY_LEVEL_ATOM ? parenthesize(base) : base.text;
      if (exponent.literal !== void 0 && Number.isInteger(exponent.literal) && exponent.literal >= 0 && exponent.literal < 1e6) {
        const superscript = [...String(exponent.literal)].map((digit) => SUPERSCRIPT_DIGITS[Number(digit)]).join("");
        stack.push({ text: `${baseText}${superscript}`, level: DISPLAY_LEVEL_POWER, symbolBase: SIMPLE_IDENTIFIER.test(base.text) || baseText.startsWith("(") });
      } else {
        const exponentText = exponent.level === DISPLAY_LEVEL_ATOM ? exponent.text : parenthesize(exponent);
        stack.push({ text: `${baseText}^${exponentText}`, level: DISPLAY_LEVEL_POWER });
      }
    } else if (token.operator === "multiply" || token.operator === "divide") {
      const right = pop(token.operator);
      const left = pop(token.operator);
      if (token.operator === "multiply" && (left.literal === 1 || left.minus === "1")) {
        if (left.minus === void 0) {
          stack.push(right);
        } else {
          const needsParens = right.level === DISPLAY_LEVEL_ADD || right.minus !== void 0;
          const inner = needsParens ? parenthesize(right) : right.text;
          stack.push({ text: `\u2212${inner}`, level: DISPLAY_LEVEL_UNARY, minus: inner });
        }
        continue;
      }
      const rightNeedsParens = right.minus !== void 0 || right.level < DISPLAY_LEVEL_MUL || token.operator === "divide" && right.level === DISPLAY_LEVEL_MUL;
      const rightText = rightNeedsParens ? parenthesize(right) : right.text;
      const symbolLike = SIMPLE_IDENTIFIER.test(right.text) || right.symbolBase === true;
      const negativeCoefficient = left.minus !== void 0 && /^[0-9.]+$/u.test(left.minus);
      const coefficient = left.literal !== void 0 || negativeCoefficient;
      const rightGroup = right.level === DISPLAY_LEVEL_ADD && right.minus === void 0;
      const leftGroup = left.minus === void 0 && (left.level === DISPLAY_LEVEL_ADD || left.text.endsWith(")"));
      if (token.operator === "multiply" && rightGroup && (leftGroup || left.literal !== void 0)) {
        stack.push({ text: `${left.level === DISPLAY_LEVEL_ADD ? parenthesize(left) : left.text}${parenthesize(right)}`, level: DISPLAY_LEVEL_MUL });
        continue;
      }
      const juxtapose = token.operator === "multiply" && (coefficient && (symbolLike || right.call === true) || SIMPLE_IDENTIFIER.test(left.text) && symbolLike);
      if (juxtapose && negativeCoefficient) {
        stack.push({ text: `\u2212${left.minus}${rightText}`, level: DISPLAY_LEVEL_UNARY, minus: `${left.minus}${rightText}` });
        continue;
      }
      const leftText = left.level < DISPLAY_LEVEL_MUL || left.minus !== void 0 ? parenthesize(left) : left.text;
      stack.push({ text: juxtapose ? `${leftText}${rightText}` : `${leftText}${token.operator === "divide" ? "/" : "\xB7"}${rightText}`, level: DISPLAY_LEVEL_MUL });
    } else {
      const right = pop(token.operator);
      const left = pop(token.operator);
      const leftText = left.level < DISPLAY_LEVEL_ADD ? parenthesize(left) : left.text;
      let text3;
      if (token.operator === "add") {
        text3 = right.minus !== void 0 ? `${leftText} \u2212 ${right.minus}` : `${leftText} + ${right.text}`;
      } else {
        text3 = right.minus !== void 0 ? `${leftText} + ${right.minus}` : `${leftText} \u2212 ${right.level <= DISPLAY_LEVEL_ADD ? parenthesize(right) : right.text}`;
      }
      stack.push({ text: text3, level: DISPLAY_LEVEL_ADD });
    }
  }
  const result = stack[0];
  if (!result || stack.length !== 1) fail2("LESSON_PLAN_EXPRESSION", "$expression", "expression does not produce one result");
  return result.text;
}
function angleScaleForUnit(unit) {
  if (!unit) return 1;
  const normalized = unit.trim().toLowerCase();
  if (/弧度|radian|rad/u.test(normalized)) return 1;
  if (/角度|度|°|degree|deg/u.test(normalized)) return Math.PI / 180;
  return 1;
}
function scaledAngleExpression(variable, scale) {
  return scale === 1 ? variable : `(${variable})*pi/180`;
}

// src/plugins/math-formulas.ts
var formulaFunctions = /* @__PURE__ */ new Set([
  "abs",
  "acos",
  "asin",
  "atan",
  "ceil",
  "cos",
  "exp",
  "floor",
  "ln",
  "log",
  "round",
  "sin",
  "sqrt",
  "tan"
]);
function formulaError(path, message) {
  throw new LessonPlanError("LESSON_PLAN_EXPRESSION", path, message);
}
var atomicBareFunctionPattern = new RegExp(
  `\\b(${[...formulaFunctions].join("|")})\\s+(-?(?:x|n\\d+|pi|e|(?:\\d+(?:\\.\\d*)?|\\.\\d+)))(?=\\s*(?:$|[+\\-*/),]))`,
  "giu"
);
var atomicSubscriptLogPattern = new RegExp(
  `\\blog_\\{?((?:\\d+(?:\\.\\d*)?|\\.\\d+))\\}?\\s+(-?(?:x|n\\d+|pi|e|(?:\\d+(?:\\.\\d*)?|\\.\\d+)))(?=\\s*(?:$|[+\\-*/),]))`,
  "giu"
);
var parenthesizedSubscriptLogPattern = new RegExp(
  `\\blog_?\\{?((?:\\d+(?:\\.\\d*)?|\\.\\d+))\\}?\\s*\\(\\s*(-?(?:x|n\\d+|pi|e|(?:\\d+(?:\\.\\d*)?|\\.\\d+)))\\s*\\)`,
  "giu"
);
function normalizeAtomicBareFunctionCalls(formula) {
  return formula.replace(parenthesizedSubscriptLogPattern, (_match, base, argument) => {
    const numericBase = Number(base);
    if (!(numericBase > 0) || numericBase === 1) return _match;
    return `(log(${argument})/log(${base}))`;
  }).replace(atomicSubscriptLogPattern, (_match, base, argument) => {
    const numericBase = Number(base);
    if (!(numericBase > 0) || numericBase === 1) return _match;
    return `(log(${argument})/log(${base}))`;
  }).replace(atomicBareFunctionPattern, (_match, name, argument) => `${name}(${argument})`);
}
function formulaLexemes(rawFormula, path) {
  if (typeof rawFormula !== "string" || !rawFormula.trim() || rawFormula.length > 256) {
    return formulaError(path, "expected a non-empty formula up to 256 characters");
  }
  let formula = normalizeAtomicBareFunctionCalls(rawFormula.trim()).replaceAll("\u2212", "-").replaceAll("\xD7", "*").replaceAll("\xF7", "/").replaceAll("\u03C0", "pi").replaceAll("\xB2", "^2").replaceAll("\xB3", "^3");
  const equals = [...formula.matchAll(/=/gu)];
  if (equals.length > 1) formulaError(path, "formula may contain at most one equals sign");
  if (equals.length === 1) {
    const index = equals[0].index ?? 0;
    const left = formula.slice(0, index).replaceAll(/\s+/gu, "").toLowerCase();
    if (left !== "y" && left !== "f(x)") {
      formulaError(path, "an optional formula left side must be y or f(x)");
    }
    formula = formula.slice(index + 1);
  }
  const compact = formula.replaceAll(/\s+/gu, "");
  const tokens = [];
  for (let index = 0; index < compact.length; ) {
    const rest = compact.slice(index);
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/iu.exec(rest)?.[0];
    if (number) {
      const value2 = Number(number);
      if (!Number.isFinite(value2)) formulaError(path, `invalid number '${number}'`);
      tokens.push({ kind: "number", value: value2 });
      index += number.length;
      continue;
    }
    const identifier = /^(?:n\d+|[a-z_][a-z_]*)/iu.exec(rest)?.[0];
    if (identifier) {
      tokens.push({ kind: "identifier", value: identifier.toLowerCase() });
      index += identifier.length;
      continue;
    }
    const character = compact[index];
    if (character === "(" || character === ")") {
      tokens.push({ kind: character === "(" ? "left" : "right" });
      index += 1;
      continue;
    }
    if (character === "+" || character === "-" || character === "*" || character === "/" || character === "^") {
      tokens.push({ kind: "operator", value: character });
      index += 1;
      continue;
    }
    formulaError(path, `unsupported formula character '${character}'`);
  }
  const withImplicitMultiplication = [];
  const canEndValue = (token) => token.kind === "number" || token.kind === "identifier" || token.kind === "right";
  const canStartValue = (token) => token.kind === "number" || token.kind === "identifier" || token.kind === "left";
  for (const token of tokens) {
    const previous = withImplicitMultiplication.at(-1);
    const functionCall = previous?.kind === "identifier" && formulaFunctions.has(previous.value) && token.kind === "left";
    if (previous && canEndValue(previous) && canStartValue(token) && !functionCall) {
      withImplicitMultiplication.push({ kind: "operator", value: "*" });
    }
    withImplicitMultiplication.push(token);
  }
  return withImplicitMultiplication;
}
function parseModelFormula(rawFormula, numberCount, path) {
  const lexemes = formulaLexemes(rawFormula, path);
  let position = 0;
  const peek = () => lexemes[position];
  const take = () => lexemes[position++];
  const binary = (left, right, operator) => [...left, ...right, { kind: "operator", operator }];
  let parseExpression;
  let parseUnary;
  const parsePrimary = () => {
    const token = take();
    if (!token) return formulaError(path, "formula ended before a value");
    if (token.kind === "number") return [{ kind: "literal", value: token.value }];
    if (token.kind === "left") {
      const value2 = parseExpression();
      if (take()?.kind !== "right") formulaError(path, "formula has an unclosed parenthesis");
      return value2;
    }
    if (token.kind !== "identifier") return formulaError(path, "expected a number, x, n1, constant, or function");
    if (token.value === "x") return [{ kind: "input" }];
    if (token.value === "pi" || token.value === "e") return [{ kind: "constant", name: token.value }];
    const numberMatch = /^n(\d+)$/u.exec(token.value);
    if (numberMatch) {
      const number = Number(numberMatch[1]);
      if (number < 1 || number > numberCount) {
        formulaError(path, `formula references unavailable numeric control n${number}`);
      }
      return [{ kind: "number", number }];
    }
    if (!formulaFunctions.has(token.value)) formulaError(path, `unsupported formula name '${token.value}'`);
    if (take()?.kind !== "left") formulaError(path, `function ${token.value} requires parentheses`);
    const argument = parseExpression();
    if (take()?.kind !== "right") formulaError(path, `function ${token.value} has an unclosed parenthesis`);
    return [...argument, {
      kind: "function",
      name: token.value
    }];
  };
  const parsePower = () => {
    const left = parsePrimary();
    const token = peek();
    if (token?.kind === "operator" && token.value === "^") {
      take();
      return binary(left, parseUnary(), "power");
    }
    return left;
  };
  parseUnary = () => {
    const token = peek();
    if (token?.kind === "operator" && (token.value === "+" || token.value === "-")) {
      take();
      const value2 = parseUnary();
      return token.value === "-" ? [...value2, { kind: "negate" }] : value2;
    }
    return parsePower();
  };
  const parseProduct = () => {
    let value2 = parseUnary();
    while (true) {
      const token = peek();
      if (token?.kind !== "operator" || token.value !== "*" && token.value !== "/") break;
      take();
      value2 = binary(value2, parseUnary(), token.value === "*" ? "multiply" : "divide");
    }
    return value2;
  };
  parseExpression = () => {
    let value2 = parseProduct();
    while (true) {
      const token = peek();
      if (token?.kind !== "operator" || token.value !== "+" && token.value !== "-") break;
      take();
      value2 = binary(value2, parseProduct(), token.value === "+" ? "add" : "subtract");
    }
    return value2;
  };
  const result = parseExpression();
  if (position !== lexemes.length) formulaError(path, "formula contains an unexpected trailing token");
  if (!result.some((token) => token.kind === "input")) {
    formulaError(path, "a function plot formula must depend on x");
  }
  return result;
}

// src/plugins/plot-bindings.ts
function plotCurveNumbers(parameters3) {
  const tokens = parameters3?.expression_tokens;
  if (!Array.isArray(tokens)) return [];
  return [...new Set(tokens.flatMap((token) => token?.kind === "number" ? [token.number] : []))];
}
function plotSampleNumbers(parameters3) {
  const samples = parameters3?.sample_x_numbers;
  return Array.isArray(samples) ? samples : [];
}
function validatePlotSampleNumbers(value2, numberCount, path) {
  if (value2 === void 0) return [];
  if (!Array.isArray(value2) || !value2.length || value2.length > 2 || new Set(value2).size !== value2.length || value2.some((number) => !Number.isInteger(number) || number < 1 || number > numberCount)) {
    fail2("LESSON_PLAN_NUMBER_REFERENCE", path, "use one or two distinct lesson number indexes for the sample x-coordinates");
  }
  return value2;
}
function candidateSampleNumbers(value2, count) {
  const values = Array.isArray(value2) ? value2 : [value2];
  return values.flatMap((entry) => {
    if (entry && typeof entry === "object" && "number" in entry) entry = entry.number;
    const number = typeof entry === "string" && /^\s*\d+\s*$/u.test(entry) ? Number(entry) : entry;
    return typeof number === "number" && Number.isInteger(number) && number >= 1 && number <= count ? [number] : [];
  });
}
function multiply(a, b) {
  if (a[2] * b[2] !== 0 || a[1] * b[2] + a[2] * b[1] !== 0) return;
  return [a[0] * b[0], a[0] * b[1] + a[1] * b[0], a[0] * b[2] + a[1] * b[1] + a[2] * b[0]];
}
function polynomial(tokens) {
  const stack = [];
  for (const token of tokens) {
    if (token.kind === "input") stack.push([0, 1, 0]);
    else if (token.kind === "literal") stack.push([token.value, 0, 0]);
    else if (token.kind === "negate") {
      const a = stack.pop();
      if (!a) return;
      stack.push([-a[0], -a[1], -a[2]]);
    } else if (token.kind === "operator") {
      const b = stack.pop(), a = stack.pop();
      if (!a || !b) return;
      if (token.operator === "add" || token.operator === "subtract") {
        const sign = token.operator === "add" ? 1 : -1;
        stack.push([a[0] + sign * b[0], a[1] + sign * b[1], a[2] + sign * b[2]]);
      } else if (token.operator === "multiply" || token.operator === "power" && b[0] === 2 && b[1] === 0 && b[2] === 0) {
        const product = multiply(a, token.operator === "power" ? a : b);
        if (!product) return;
        stack.push(product);
      } else return;
    } else return;
  }
  if (stack.length === 1 && stack[0].every(Number.isFinite)) return stack[0];
}
function vertexRole(label) {
  const normalized = label.normalize("NFKC").toLowerCase().trim().replace(/[-‐‑–\s]+/g, "");
  if (/^(?:顶点(?:的)?(?:横坐标|x坐标)h?|vertexxcoordinate|xcoordinateofthevertex|horizontalcoordinateofthevertex)$/u.test(normalized)) return "h";
  if (/^(?:顶点(?:的)?(?:纵坐标|y坐标)k?|vertexycoordinate|ycoordinateofthevertex|verticalcoordinateofthevertex)$/u.test(normalized)) return "k";
}
var vertexInstruction = /(?:调整|移动|平移|拖动)(?:(?:这条|该)?抛物线的|该图的|该|这个)?顶点|(?:move|shift|translate|adjust|drag)\s+(?:the|this)\s+vertex\b/iu;
var sampleIntent = /割线|采样点|曲线上.{0,6}标记|标记.{0,6}沿曲线|点\s*[ABP]\b|\b[ABP]\s*点|两点|两个点|\b(?:secant|sample points?|point\s+[ABP]|two (?:independent )?points)\b/iu;
var interactionVerb = /调整|移动|平移|拖动|拖拽|滑块|\b(?:adjust|move|shift|translate|drag|slider|change)\b/iu;
var negativeInstruction = /不(?:要|能|必|用|会|可)|别(?:拖|动|调整)|没有|无法|\b(?:no|not|never|cannot|can['’]t|don['’]t)\b/iu;
var pastInstruction = /(?:刚才|之前|先前|上[一]?节|上次)|\b(?:previously|earlier|last time|we (?:moved|adjusted|shifted|translated|dragged))\b/iu;
var clauses = (text3) => text3.split(/[。！？!?；;，,]/u);
function sectionVisuals(draft) {
  return draft.moments.flatMap((moment, index) => moment.actions.flatMap((action) => action.action === "create" && action.kind === "visual" ? [{ visual: action.content, moment: index + 1, slot: action.reusable_item, section: draft.section }] : []));
}
function sectionText(draft) {
  return [
    ...draft.moments.flatMap((moment) => clauses(moment.narration)),
    ...(draft.student_activities ?? []).flatMap((activity) => clauses(activity.prompt))
  ];
}
function structuralUse(draft, number) {
  return draft.moments.some((moment) => moment.actions.some((action) => action.action === "animate" && action.number === number)) || (draft.student_activities ?? []).some((activity) => activity.kind === "number_target" && (activity.number_controls.some((control) => control.number === number) || activity.expression?.some((token) => token.kind === "number" && token.number === number)));
}
function positiveInstruction(text3, pattern) {
  return pattern.test(text3) && !negativeInstruction.test(text3) && !pastInstruction.test(text3);
}
function recoverVertex(visual, candidates, outline) {
  const tokens = visual.parameters?.expression_tokens;
  if (!Array.isArray(tokens) || candidates.length !== 2) return false;
  const definitions = candidates.map((index) => outline.numbers?.[index - 1]);
  if (definitions.some((definition) => !definition?.student_control)) return false;
  const roles = definitions.map((definition) => vertexRole(definition?.label ?? ""));
  const hIndex = roles.indexOf("h"), kIndex = roles.indexOf("k");
  if (hIndex < 0 || kIndex < 0) return false;
  const original = polynomial(tokens);
  if (!original || original[2] === 0) return false;
  const [c, b, a] = original;
  const h = definitions[hIndex].initial, k = definitions[kIndex].initial;
  const close = (left, right) => Number.isFinite(right) && Math.abs(left - right) <= Number.EPSILON * 8 * Math.max(Math.abs(left), Math.abs(right));
  if (!close(b, -2 * a * h) || !close(c, a * h * h + k)) return false;
  const expression = `(${a})*(x-n${candidates[hIndex]})^2+n${candidates[kIndex]}`;
  visual.parameters.expression_tokens = parseModelFormula(expression, outline.numbers.length, "$lessonPlanSection.visual.parameters.formulas");
  delete visual.parameters.curve_label;
  delete visual.parameters.curve_labels;
  return true;
}
var omittedControls = /* @__PURE__ */ new WeakMap();
var omittedSamplePlots = /* @__PURE__ */ new WeakMap();
function normalizePlotDraftBindings(draft, context) {
  const { outline, request, accepted, adjust } = context;
  const visuals = sectionVisuals(draft);
  const previousVisuals = accepted.flatMap(sectionVisuals);
  const plots = visuals.filter(({ visual }) => visual.capability === "function_plot");
  const text3 = sectionText(draft);
  const plotText = [...text3, ...clauses(outline.sections[draft.section - 1]?.purpose ?? ""), ...clauses(request)];
  const wantsVertex = plots.length === 1 && text3.some((line) => positiveInstruction(line, vertexInstruction) && (visuals.length === 1 || /抛物线|\bparabola\b/iu.test(line)));
  const asksForSamples = (line) => positiveInstruction(line, sampleIntent) && interactionVerb.test(line);
  const wantsSamples = plotText.some(asksForSamples);
  const hasSampleIntent = plotText.some((line) => positiveInstruction(line, sampleIntent));
  const count = outline.numbers?.length ?? 0;
  const validSamples = (visual) => {
    const raw = visual.parameters?.sample_x_numbers;
    return !plotCurveNumbers(visual.parameters).length && Array.isArray(raw) && raw.length <= 2 && new Set(raw).size === raw.length && raw.every((number) => Number.isInteger(number) && number >= 1 && number <= count) ? raw : [];
  };
  const bound = (visual) => visual.capability === "function_plot" ? [...plotCurveNumbers(visual.parameters), ...validSamples(visual)] : visual.numbers ?? [];
  const controlsNamed = (number) => {
    const label = outline.numbers?.[number - 1]?.label?.trim().toLowerCase();
    if (!label) return false;
    const roleLabel = vertexRole(label) ? label.replace(/[hk]$/u, "").trim() : label;
    const singleSymbol = /^[a-z]$/u.test(roleLabel) ? new RegExp(`\\b${roleLabel}\\b`, "iu") : void 0;
    return text3.some((line) => positiveInstruction(line, interactionVerb) && (singleSymbol ? singleSymbol.test(line) : line.toLowerCase().includes(roleLabel)));
  };
  const dropped = /* @__PURE__ */ new Set();
  const droppedSampleSlots = /* @__PURE__ */ new Set();
  const allVisuals = [...previousVisuals, ...visuals];
  const inUse = (section, slot) => section === draft.section || outline.course_visuals?.some((visual) => visual.create_section === section && visual.reusable_item === slot && visual.use_sections.includes(draft.section));
  const activeSamplePlots = allVisuals.filter((item) => inUse(item.section, item.slot) && item.visual.capability === "function_plot" && validSamples(item.visual).length);
  for (const { visual, moment, slot } of plots) {
    const others = new Set(allVisuals.filter((item) => item.visual !== visual).flatMap((item) => bound(item.visual)));
    const otherSamplePlots = activeSamplePlots.filter((item) => item.visual !== visual);
    const sampleIntentUnmet = wantsSamples && !otherSamplePlots.length;
    const path = `$lessonPlanSection[${draft.section}].moments[${moment}].content.parameters.sample_x_numbers`;
    const declared = visual.numbers ?? [];
    let curve = plotCurveNumbers(visual.parameters);
    const rawSamples = visual.parameters?.sample_x_numbers;
    let samples = [];
    if (curve.length && rawSamples !== void 0) {
      const candidates2 = candidateSampleNumbers(rawSamples, count);
      const onlySampleControl = (number) => !curve.includes(number) && !others.has(number);
      const needed = candidates2.some((number) => onlySampleControl(number) && (structuralUse(draft, number) || controlsNamed(number)));
      const unresolvedUse = (outline.numbers ?? []).some((_, index) => onlySampleControl(index + 1) && structuralUse(draft, index + 1));
      const explicitlyHere = otherSamplePlots.length > 0 && !visuals.some((item) => item.visual !== visual && item.moment === moment && item.visual.capability === "function_plot" && validSamples(item.visual).length) && clauses(draft.moments[moment - 1].narration).some(asksForSamples) && !/另一[张幅]|另一.*图|other (?:plot|graph)/iu.test(draft.moments[moment - 1].narration);
      if (sampleIntentUnmet || explicitlyHere || needed || unresolvedUse) {
        fail2("LESSON_PLAN_INTERACTION_MISMATCH", path, "sample_x_numbers moves points on a fixed curve; keep formula references for changing the curve, or use a separate fixed curve for moving points");
      }
      delete visual.parameters.sample_x_numbers;
      candidates2.filter(onlySampleControl).forEach((number) => dropped.add(number));
      if (slot !== void 0) droppedSampleSlots.add(slot);
      adjust({
        kind: "plot_control_removed",
        section: draft.section,
        moment,
        reason: "unused_samples_on_parameterized_curve",
        detail: `sample_x_numbers=${JSON.stringify(rawSamples)?.slice(0, 120)}`
      });
    } else if (Array.isArray(rawSamples) && !rawSamples.length) {
      delete visual.parameters.sample_x_numbers;
    } else {
      samples = validatePlotSampleNumbers(rawSamples, count, path);
    }
    const unused = (number) => !curve.includes(number) && !samples.includes(number) && !others.has(number);
    const candidates = declared.filter(unused);
    const fixed = !curve.length && !samples.length;
    const singleFormula = Array.isArray(visual.parameters?.expression_tokens);
    const formulasPath = path.replace(/sample_x_numbers$/, "formulas");
    const vertexCandidates = declared.length ? candidates : (outline.numbers ?? []).flatMap((number, index) => number.student_control && unused(index + 1) && vertexRole(number.label ?? "") ? [index + 1] : []);
    if (fixed && wantsVertex && !hasSampleIntent && recoverVertex(visual, vertexCandidates, outline)) {
      curve = plotCurveNumbers(visual.parameters);
      adjust({ kind: "plot_binding_rebuilt", section: draft.section, moment, reason: "quadratic_vertex_from_confirmed_roles" });
    } else {
      if (fixed && singleFormula && sampleIntentUnmet && (plots.length === 1 || candidates.length)) {
        const indexes = candidates.slice(0, 2);
        fail2("LESSON_PLAN_INTERACTION_MISMATCH", path, indexes.length ? `Use parameters.sample_x_numbers: [${indexes.join(",")}] for the sample x-coordinate controls; use one index for one point` : "Use parameters.sample_x_numbers with the lesson number index of each sample's x-coordinate");
      }
      if (wantsVertex && !curve.length && !hasSampleIntent || candidates.some((number) => structuralUse(draft, number) || controlsNamed(number))) {
        fail2("LESSON_PLAN_INTERACTION_MISMATCH", formulasPath, "Use the lesson number references in the curve formula when sliders change the curve");
      }
      if (fixed && singleFormula && plots.length === 1 && (outline.numbers ?? []).some((_, index) => unused(index + 1) && structuralUse(draft, index + 1))) {
        fail2(
          "LESSON_PLAN_INTERACTION_MISMATCH",
          formulasPath,
          "The demonstration uses an unbound number; reference it in the formula for a curve control, or use parameters.sample_x_numbers for a point"
        );
      }
      if (candidates.length) {
        candidates.forEach((number) => dropped.add(number));
        adjust({
          kind: curve.length ? "plot_binding_rebuilt" : "plot_control_removed",
          section: draft.section,
          moment,
          reason: curve.length ? "formula_defines_curve_bindings" : "unused_plot_numbers"
        });
      }
    }
    const actual = [...curve, ...samples];
    if (actual.length) visual.numbers = actual;
    else delete visual.numbers;
  }
  const previousDroppedPlotInUse = accepted.some((earlier) => [...omittedSamplePlots.get(earlier) ?? []].some((slot) => inUse(earlier.section, slot)));
  if (previousDroppedPlotInUse && text3.some(asksForSamples) && !activeSamplePlots.length) {
    fail2(
      "LESSON_PLAN_INTERACTION_MISMATCH",
      `$lessonPlanSection[${draft.section}].moments`,
      "The published graph has no moving sample point; add a fixed curve with sample_x_numbers in this section or revise the instruction"
    );
  }
  const knownBindings = new Set(allVisuals.flatMap((item) => bound(item.visual)));
  if (previousDroppedPlotInUse && (outline.numbers ?? []).some((_, index) => !knownBindings.has(index + 1) && structuralUse(draft, index + 1))) {
    fail2(
      "LESSON_PLAN_INTERACTION_MISMATCH",
      `$lessonPlanSection[${draft.section}].moments`,
      "The demonstration or practice uses a control with no visual binding; bind it in this section"
    );
  }
  const omitted = /* @__PURE__ */ new Set([...accepted.flatMap((earlier) => [...omittedControls.get(earlier) ?? []]), ...dropped]);
  for (const number of omitted) {
    if (knownBindings.has(number)) continue;
    if (structuralUse(draft, number) || controlsNamed(number)) {
      fail2("LESSON_PLAN_INTERACTION_MISMATCH", `$lessonPlanSection[${draft.section}].moments`, `Number ${number} has no control in the published graph; explain the fixed curve or bind a control in a new graph in this section`);
    }
    for (const [index, moment] of draft.moments.entries()) {
      if (!moment.restart_numbers?.includes(number)) continue;
      moment.restart_numbers = moment.restart_numbers.filter((index2) => index2 !== number);
      if (!moment.restart_numbers.length) delete moment.restart_numbers;
      adjust({ kind: "plot_control_removed", section: draft.section, moment: index + 1, reason: "unused_restart_for_omitted_plot_control" });
    }
  }
  if (dropped.size) omittedControls.set(draft, dropped);
  if (droppedSampleSlots.size) omittedSamplePlots.set(draft, droppedSampleSlots);
}

// src/plugins/math-teaching-contracts.ts
function affineTokens(tokens) {
  const stack = [];
  for (const token of tokens) {
    if (token.kind === "input") stack.push(1);
    else if (["literal", "constant", "number"].includes(token.kind)) stack.push(0);
    else if (token.kind === "negate") continue;
    else if (token.kind === "operator") {
      const b = stack.pop(), a = stack.pop();
      if (a === void 0 || b === void 0) return false;
      if (token.operator === "add" || token.operator === "subtract") stack.push(Math.max(a, b));
      else if (token.operator === "multiply") stack.push(a + b);
      else if (token.operator === "divide" && b === 0) stack.push(a);
      else return false;
    } else return false;
  }
  return stack.length === 1 && stack[0] <= 1;
}
function fixedLineSamples(visual) {
  const tokens = visual.parameters?.expression_tokens;
  return visual.capability === "function_plot" && plotSampleNumbers(visual.parameters).length === 2 && Array.isArray(tokens) && !tokens.some((t) => t.kind === "number") && affineTokens(tokens);
}
function normalizePlotInputInstructions(plan) {
  const visuals = plan.sections.flatMap((s) => s.moments.flatMap((m) => m.actions)).filter((a) => a.action === "create" && a.kind === "visual").map((a) => a.content);
  if (visuals.length !== 1 || visuals[0].capability !== "function_plot" || plotSampleNumbers(visuals[0].parameters).length !== 2) return;
  const tokens = visuals[0].parameters?.expression_tokens;
  if (Array.isArray(tokens) && tokens.some((t) => t.kind === "number")) return;
  const samplesFixedLine = fixedLineSamples(visuals[0]);
  for (const section of plan.sections) for (const moment of section.moments) {
    moment.narration = moment.narration.replace(
      /(?:directly\s+)?drag(?:ging)?\s+(?:the\s+)?point\s+([AB])\b/gi,
      (_match, label) => `adjusting the horizontal-coordinate slider for point ${label}`
    ).replace(
      /(?:移动|调整|拖动|拖拽)点\s*([AB])\s*(?:或|和|、)\s*(?:点\s*)?([AB])(?:的)?(?:位置|横坐标)/g,
      (_match, first, second) => `\u8C03\u6574\u70B9 ${first} \u6216\u70B9 ${second} \u7684\u6A2A\u5750\u6807\u6ED1\u5757`
    ).replace(
      /(?:直接)?拖(?:动|拽)(?:图上|图中|曲线上)?(?:的)?点\s*([AB])/g,
      (_match, label) => `\u8C03\u6574\u70B9 ${label} \u7684\u6A2A\u5750\u6807\u6ED1\u5757`
    );
    if (samplesFixedLine) {
      moment.narration = moment.narration.replace(
        /[^。！？!?；;]*斜率如何保持不变或发生变化[^。！？!?；;]*/g,
        "\u89C2\u5BDF \u0394x \u4E0E \u0394y \u5982\u4F55\u540C\u6BD4\u4F8B\u53D8\u5316\uFF0C\u5E76\u9A8C\u8BC1\u659C\u7387\u4FDD\u6301\u4E0D\u53D8"
      ).replace(
        /[^。！？!?；;]*(?:纵向|高度|纵坐标).{0,12}(?:变大|改变|变化).{0,12}(?:横向|横坐标).{0,12}不变[^。！？!?；;]*/g,
        "\u8C03\u6574\u70B9 A \u6216\u70B9 B \u7684\u6A2A\u5750\u6807\u6ED1\u5757\uFF0C\u89C2\u5BDF \u0394x \u4E0E \u0394y \u540C\u6BD4\u4F8B\u53D8\u5316\uFF0C\u659C\u7387\u4FDD\u6301\u4E0D\u53D8"
      ).replace(
        /[^。！？!?；;]*(?:看看|观察).{0,36}(?:斜率|倾斜程度).{0,32}(?:变化|改变)[^。！？!?；;]*/g,
        "\u8C03\u6574\u70B9 A \u6216\u70B9 B \u7684\u6A2A\u5750\u6807\u6ED1\u5757\uFF0C\u89C2\u5BDF \u0394x \u4E0E \u0394y \u540C\u6BD4\u4F8B\u53D8\u5316\uFF0C\u659C\u7387\u4FDD\u6301\u4E0D\u53D8"
      ).replace(
        /[^。！？!?；;]*(?:调整|移动|拖动|拖拽).{0,36}点.{0,36}(?:观察|看看).{0,36}(?:斜率|倾斜程度)[^。！？!?；;]*/g,
        "\u8C03\u6574\u70B9 A \u6216\u70B9 B \u7684\u6A2A\u5750\u6807\u6ED1\u5757\uFF0C\u89C2\u5BDF \u0394x \u4E0E \u0394y \u540C\u6BD4\u4F8B\u53D8\u5316\uFF0C\u659C\u7387\u4FDD\u6301\u4E0D\u53D8"
      );
    }
  }
  if (samplesFixedLine) for (const section of plan.sections) {
    for (const activity of section.student_activities ?? []) {
      if (activity.kind !== "number_target") continue;
      activity.prompt = activity.prompt.replace(/观察.{0,24}斜率.{0,12}(?:变化|改变)/g, "\u89C2\u5BDF \u0394x \u4E0E \u0394y \u540C\u6BD4\u4F8B\u53D8\u5316\uFF0C\u5E76\u9A8C\u8BC1\u659C\u7387\u4FDD\u6301\u4E0D\u53D8").replace(/改变.{0,16}(?:倾斜程度|斜率)/g, "\u9A8C\u8BC1\u56FA\u5B9A\u76F4\u7EBF\u7684\u659C\u7387\u4FDD\u6301\u4E0D\u53D8");
      activity.hints = activity.hints.map((hint) => /变陡|变平缓|(?:倾斜程度|倾斜状态|陡峭程度|比值).{0,16}(?:改变|变化)|(?:改变|变化).{0,16}(?:倾斜程度|斜率|陡峭程度|比值)/.test(hint) ? "\u89C2\u5BDF \u0394x \u4E0E \u0394y \u7684\u6BD4\u503C\u662F\u5426\u4FDD\u6301\u4E0D\u53D8" : hint);
      if (activity.success_message && !/不变|保持/.test(activity.success_message) && /(?:改变|变化|更新|影响).{0,20}(?:倾斜程度|斜率|陡峭程度|比值)|(?:倾斜程度|斜率|陡峭程度|比值).{0,20}(?:改变|变化|更新|影响)|如何随.{0,20}变化/.test(activity.success_message)) {
        activity.success_message = "\u5B8C\u6210\uFF01\u79FB\u52A8\u53D6\u6837\u70B9\u540E\uFF0C\u0394x \u4E0E \u0394y \u540C\u6BD4\u4F8B\u53D8\u5316\uFF0C\u56FA\u5B9A\u76F4\u7EBF\u7684\u659C\u7387\u4FDD\u6301\u4E0D\u53D8\u3002";
      }
    }
  }
}
function validateRearrangementClaims(plan) {
  const local = /* @__PURE__ */ new Map();
  const reusable = /* @__PURE__ */ new Map();
  const byNumber = /* @__PURE__ */ new Map();
  const relatedLocal = /* @__PURE__ */ new Map();
  const relatedReusable = /* @__PURE__ */ new Map();
  const lookup = (reference, section) => {
    if (reference.source === "reusable") {
      const key = `${reference.section}:${reference.item}`, visual = reusable.get(key);
      return visual ? [visual] : [...relatedReusable.get(key) ?? []];
    }
    if (reference.source === "local_board_item") {
      const key = `${section}:${reference.moment}:${reference.item}`, visual = local.get(key);
      return visual ? [visual] : [...relatedLocal.get(key) ?? []];
    }
    return [];
  };
  const check = (text3, visuals, path) => {
    if (visuals.size !== 1) return;
    const visual = [...visuals][0];
    if (visual.capability !== "geometric_rearrangement") return;
    const construction = visual.parameters?.construction ?? "right_triangle_square";
    const facts = REARRANGEMENT_FACTS[construction];
    if (!facts) return;
    const claims = text3.replace(/\\(?:text|mathrm|operatorname)\{([^{}]+)\}/gu, "$1").split(/[。！？!?；;\n]/u).filter((claim) => !/不是|并非|不等于|没有|不能|假设|想象|另一种|另一张|其他构造|如果|not |isn't|imagine|another /iu.test(claim));
    const wrongPieces = construction === "square_area_identity" && claims.some((claim) => /(?:这(?:个|张|些|幅)|图中|图里|内部|里面|画面|包含).{0,20}(?:四|4)\s*(?:个|块|片)?(?:完全相同的|全等的|全等|完全相同|一样的)?(?:直角)?三角形/u.test(claim));
    const wrongFrame = construction === "right_triangle_square" && claims.some((claim) => /(?:外框|外侧正方形|这个大正方形|大正方形)(?:的)?边长.{0,8}(?:是|为|等于|就是).{0,4}(?:斜边\s*)?c(?![a-z])/iu.test(claim) || /(?:中间|中央|中心).{0,8}(?:正方形|留白).{0,8}(?:边长|面积).{0,8}(?:b\s*[-−]\s*a|a\s*[-−]\s*b)/iu.test(claim) || /(?:S_?\{?(?:大正方形|外框)\}?|S[（(](?:大正方形|外框)[）)])\s*=\s*c(?:²|\^\{?2\}?)/u.test(claim));
    const wrongControl = claims.some((claim) => /(?:拖动|拖拽|调整|滑动).{0,12}(?:滑块|滑杆|进度).{0,16}(?:改变|调整).{0,8}(?:边长|三边|斜边|直角边)/u.test(claim));
    const wrongFinal = construction === "right_triangle_square" && claims.some((claim) => /(?:拼成|拼合成|填满).{0,8}斜边正方形/u.test(claim));
    if (wrongPieces || wrongFrame || wrongControl || wrongFinal) {
      throw new LessonPlanError(
        "LESSON_PLAN_TEACHING_MISMATCH",
        path,
        `${construction}: ${facts.pieces}; ${facts.container}; start: ${facts.initial}; end: ${facts.final}; ${facts.proof}. The control moves pieces only, not side lengths. Correct this section without replacing the established visual.`
      );
    }
  };
  for (const [si, section] of plan.sections.entries()) {
    for (const [mi, moment] of section.moments.entries()) {
      const selected = /* @__PURE__ */ new Set();
      let item = 0;
      for (const action of moment.actions) {
        if (action.action !== "create") continue;
        item += 1;
        if (action.kind !== "visual") continue;
        const visual = action.content;
        local.set(`${si + 1}:${mi + 1}:${item}`, visual);
        if (action.reusable_item) reusable.set(`${si + 1}:${action.reusable_item}`, visual);
        selected.add(visual);
        for (const number of visual.numbers ?? []) {
          const bound = byNumber.get(number) ?? /* @__PURE__ */ new Set();
          bound.add(visual);
          byNumber.set(number, bound);
        }
      }
      for (const action of moment.actions) {
        const refs = action.action === "focus" ? action.references : action.action === "point_at" || action.action === "emphasize" || action.action === "revise" ? [action.reference] : [];
        for (const ref of refs) for (const visual of lookup(ref, si + 1)) selected.add(visual);
        if (action.action === "animate") for (const visual of byNumber.get(action.number) ?? []) selected.add(visual);
      }
      const path = `$lessonPlan.sections[${si}].moments[${mi}]`;
      check(moment.narration ?? "", selected, path);
      let boardItem = 0;
      for (const [ai, action] of moment.actions.entries()) {
        if (action.action === "create") {
          boardItem += 1;
          if (action.kind !== "visual") {
            relatedLocal.set(`${si + 1}:${mi + 1}:${boardItem}`, new Set(selected));
            if (action.reusable_item) relatedReusable.set(`${si + 1}:${action.reusable_item}`, new Set(selected));
          }
        }
        if (action.action !== "create" && action.action !== "revise" || action.kind === "visual") continue;
        const content = action.content;
        check(
          [content.latex, content.text, content.title, ...content.items ?? []].filter(Boolean).join("\n"),
          selected,
          `${path}.actions[${ai}]`
        );
      }
    }
    for (const [ai, activity] of (section.student_activities ?? []).entries()) {
      const selected = /* @__PURE__ */ new Set();
      if (activity.kind === "number_target") {
        for (const control of activity.number_controls) for (const visual of byNumber.get(control.number) ?? []) selected.add(visual);
      } else {
        for (const visual of lookup(activity.reference, si + 1)) selected.add(visual);
      }
      check(
        activity.kind === "reflection" ? `${activity.prompt}
${activity.answer}` : [activity.prompt, ...activity.hints, activity.success_message].filter(Boolean).join("\n"),
        selected,
        `$lessonPlan.sections[${si}].student_activities[${ai}]`
      );
    }
  }
}
function validateTeachingClaims(plan) {
  validateRearrangementClaims(plan);
  const plots = plan.sections.flatMap((section) => section.moments.flatMap((moment) => moment.actions)).filter((action) => action.action === "create" && action.kind === "visual").map((action) => action.content).filter((visual) => visual.capability === "function_plot");
  const hasCircleArea = plan.sections.some((section) => section.moments.some((moment) => moment.actions.some((action) => action.action === "create" && action.kind === "visual" && action.content.capability === "circle_area_rearrangement")));
  const onlyFixedLineSamples = plots.length === 1 && fixedLineSamples(plots[0]);
  for (const [si, section] of plan.sections.entries()) {
    for (const [mi, moment] of section.moments.entries()) {
      const text3 = moment.narration ?? "";
      const claims = text3.split(/[。！？!?；;]/);
      const englishClaims = text3.split(/(?<=[.!?;])\s+/u).filter((claim) => !/\?\s*$/.test(claim) && !/\b(?:not|never|cannot|can't|doesn't|isn't|don't|whether|if)\b/i.test(claim));
      if (hasCircleArea && englishClaims.some((claim) => /\b(?:base|height)\b.{0,25}\b(?:exactly|equals?|is)\b.{0,15}(?:πr|pi\s*\*?\s*r|radius|\br\b)/i.test(claim)) && !/\b(?:approach|tend|limit|infinite|finer|approx|curved)\w*\b/i.test(section.moments.slice(0, mi + 1).map((moment2) => moment2.narration).join(" "))) {
        throw new LessonPlanError("LESSON_PLAN_TEACHING_MISMATCH", `$plan.sections[${si}].moments[${mi}]`, "finite sectors have curved edges; base tends to pi*r and height tends to r as subdivisions increase");
      }
      if (onlyFixedLineSamples && englishClaims.some((claim) => /\b(?:slope|steepness)\b.{0,20}\b(?:changes?|changing|varies|varying)\b/i.test(claim) && !/\b(?:unchanged|constant|fixed|invariant|remains?|stays?)\b/i.test(claim))) {
        throw new LessonPlanError("LESSON_PLAN_TEACHING_MISMATCH", `$plan.sections[${si}].moments[${mi}]`, "moving two samples on a fixed straight line preserves its slope; use a nonlinear curve for changing secant slope");
      }
      if (plots.length && englishClaims.some((claim) => /\b(?:larger|greater|increas\w*)\s+(?:signed\s+)?(?:slope|k)\b.{0,45}\bsteeper\b/i.test(claim)) && !/\b(?:absolute|positive|magnitude)\b|k\s*>\s*0/i.test(text3)) {
        throw new LessonPlanError("LESSON_PLAN_TEACHING_MISMATCH", `$plan.sections[${si}].moments[${mi}]`, "steepness depends on absolute slope; larger signed k is not always steeper");
      }
      if (hasCircleArea && /(?:高|底边|底边长|底)(?:度|长度)?(?:正好|恰好|精确|就是|等于|为|是){1,3}.{0,8}(?:半径|πr|r)/.test(text3) && !/趋近|趋于|极限|无限|越来越|近似|接近/.test(section.moments.slice(0, mi + 1).map((m) => m.narration).join(" "))) {
        throw new LessonPlanError("LESSON_PLAN_TEACHING_MISMATCH", `$plan.sections[${si}].moments[${mi}]`, "finite sectors have curved edges; base tends to pi*r and height tends to r as subdivisions increase");
      }
      if (plots.length && /拖(?:动|拽)(?:图上|图中|曲线上|一下|这个|那个|两个|两|的|\s)*(?:点\s*[ABＰP]|[ABＰP]\s*点|两个点|两点)/.test(text3) && !/滑块|滑杆/.test(text3)) {
        throw new LessonPlanError("LESSON_PLAN_INTERACTION_MISMATCH", `$plan.sections[${si}].moments[${mi}]`, "use the point's horizontal-coordinate slider; directly dragging plot points is unavailable");
      }
      if (onlyFixedLineSamples && claims.some((claim) => /(?:斜率|倾斜角度|倾斜程度|倾斜方向|陡峭程度)(?:的数值)?(?:就|也|会|将|随之|随点移动|发生|而|从而|不断|逐渐|产生|有所|明显|直接|可以|能够|能|\s|[，,]){0,8}(?:改变|变化)(?!量|率)|(?:改变|变化)(?:了|着|其|它的|直线的|连线的|割线的|两点连线的|\s){0,5}(?:斜率|倾斜角度|倾斜程度|陡峭程度)/.test(claim) && !/不变|不会|不改变|保持|无论|有没有|是否|会不会/.test(claim))) {
        throw new LessonPlanError("LESSON_PLAN_TEACHING_MISMATCH", `$plan.sections[${si}].moments[${mi}]`, "moving two samples on a fixed straight line preserves its slope; use a nonlinear curve for changing secant slope");
      }
      const steepnessClaim = (text3.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? []).some((sentence) => /(?:斜率|k).{0,10}越大.{0,12}越陡/.test(sentence) && !/[？?]\s*$/.test(sentence) && !/吗|是否|不一定|未必|并不|并非|不是|不总是|不能说/.test(sentence));
      if (steepnessClaim && !/绝对值|正数|为正|大于.?0|k\s*>\s*0/.test(text3)) {
        throw new LessonPlanError("LESSON_PLAN_TEACHING_MISMATCH", `$plan.sections[${si}].moments[${mi}]`, "steepness depends on absolute slope; larger signed k is not always steeper");
      }
    }
    for (const [mi, moment] of section.moments.entries()) {
      const visuals = moment.actions.filter((a) => a.action === "create" && a.kind === "visual");
      for (const action of visuals) {
        if (action.action !== "create" || action.kind !== "visual") continue;
        const visual = action.content;
        const text3 = [section.purpose, moment.narration, visual.parameters?.title].join(" ");
        const path = `$plan.sections[${si}].moments[${mi}]`;
        if (visual.capability === "geometric_rearrangement" && /圆(?:的)?面积|circle.{0,12}area|area.{0,12}circle/i.test(text3) && /证明|推导|拼|重排|prove|derive/i.test(text3)) {
          throw new LessonPlanError("LESSON_PLAN_TEACHING_MISMATCH", path, "circle area requires circle_area_rearrangement; polygon recipes cannot prove pi*r^2");
        }
        if (visual.capability !== "function_plot") continue;
        const tokens = visual.parameters?.expression_tokens;
        const dynamic = Array.isArray(tokens) && tokens.some((t) => t?.kind === "number");
        const count = plotSampleNumbers(visual.parameters).length;
        if (!dynamic && /整条.{0,8}(移动|平移)|(?:平移|移动)整条|translate.{0,12}(curve|parabola)/i.test(text3)) {
          throw new LessonPlanError("LESSON_PLAN_INTERACTION_MISMATCH", path, "moving the whole curve requires formula number references; static sample inputs only move points");
        }
        if (/两个点|两点|two points/i.test(text3) && /分别.{0,8}(移动|调整|拖)|移动.{0,6}(两个点|两点)|独立.{0,8}(点|控制)|move.{0,12}(both|two)/i.test(text3) && count !== 2) {
          throw new LessonPlanError("LESSON_PLAN_INTERACTION_MISMATCH", path, `two independently moving points require a formula without n1/n2 and parameters.sample_x_numbers=[1,2]; received ${count} sample inputs, dynamic=${dynamic}`);
        }
        if (/拖(?:动|拽).{0,10}(图上|图中|曲线上).{0,8}点/.test(text3)) {
          throw new LessonPlanError("LESSON_PLAN_INTERACTION_MISMATCH", path, "plot points use sliders; direct point dragging is unavailable");
        }
      }
    }
  }
}

// src/plugins/math-hooks.ts
function separateInitialSamples(visual, plan, sectionIndex) {
  const words = plan.sections[sectionIndex].moments.map((moment) => moment.narration).join(" ");
  if (/初始.{0,8}重合|先.{0,6}重合|开始.{0,8}重合|(?:initially|at first|start).{0,35}(?:coincid|same position)/i.test(words)) return;
  const samples = plotSampleNumbers(visual.parameters);
  if (samples.length !== 2) return;
  if (plan.sections.slice(0, sectionIndex).some((section) => section.moments.some((moment) => moment.actions.some((action) => action.action === "create" && action.kind === "visual" && action.content.numbers?.includes(samples[1]))))) return;
  const a = plan.numbers?.[samples[0] - 1], b = plan.numbers?.[samples[1] - 1];
  if (!a || !b || a === b || Math.abs(a.initial - b.initial) > 1e-8) return;
  const step = b.student_control?.step ?? (b.max - b.min) / 200;
  const delta = Math.max(step, Math.round((b.max - b.min) / 5 / step) * step);
  b.initial = b.initial + delta <= b.max ? b.initial + delta : Math.max(b.min, b.initial - delta);
}
function surfaceSectionRange(content, path) {
  const input = parameters(content);
  if (content.capability === "implicit_surface_with_section") {
    if (input.expression === void 0) {
      fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.expression`, "an implicit surface requires an expression");
    }
    if (input.level === void 0) {
      fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.level`, "an implicit surface requires a level");
    }
    const expression2 = safeFunctionExpression(input.expression, "", ["x", "y", "z"], `${path}.expression`);
    const level = optionalNumber(input.level, 0, `${path}.level`);
    let domain;
    try {
      domain = implicitSurfaceDomain(expression2, ["x", "y", "z"], level);
    } catch (error) {
      fail2(
        "LESSON_PLAN_CAPABILITY_PARAMETER",
        `${path}.expression`,
        error instanceof Error ? error.message : "implicit surface has no stable finite viewport"
      );
    }
    const axis2 = input.section_axis ?? "z";
    if (axis2 !== "x" && axis2 !== "y" && axis2 !== "z") {
      fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.section_axis`, "expected x, y, or z");
    }
    return axis2 === "x" ? domain.x : axis2 === "y" ? domain.y : domain.z;
  }
  const xMin = optionalNumber(input.x_min, -2, `${path}.x_min`);
  const xMax = optionalNumber(input.x_max, 2, `${path}.x_max`);
  const yMin = optionalNumber(input.y_min, -2, `${path}.y_min`);
  const yMax = optionalNumber(input.y_max, 2, `${path}.y_max`);
  assertRange(xMin, xMax, `${path}.x_range`);
  assertRange(yMin, yMax, `${path}.y_range`);
  const axis = input.section_axis ?? "z";
  if (axis === "x") return { min: xMin, max: xMax };
  if (axis === "y") return { min: yMin, max: yMax };
  const expression = safeFunctionExpression(input.expression, "x^2+y^2", ["x", "y"], `${path}.expression`);
  const evaluateSurface = compileMathExpression(expression, ["x", "y"]);
  const values = [];
  for (let xIndex = 0; xIndex <= 20; xIndex += 1) {
    const x = xMin + (xMax - xMin) * xIndex / 20;
    for (let yIndex = 0; yIndex <= 20; yIndex += 1) {
      const y = yMin + (yMax - yMin) * yIndex / 20;
      try {
        const z = evaluateSurface({ x, y });
        if (Number.isFinite(z) && Math.abs(z) <= 1e12) values.push(z);
      } catch {
      }
    }
  }
  if (values.length < 8) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.expression`, "surface has no stable finite section range");
  }
  return { min: Math.min(...values), max: Math.max(...values) };
}
var MATH_HOOKS = {
  implicit_surface_with_section: {
    section_range: surfaceSectionRange,
    lower_model_parameters(parameters3) {
      if (typeof parameters3.expression !== "string") return;
      const equation = parameters3.expression.split("=").map((part) => part.trim());
      if (equation.length === 2 && equation.every(Boolean)) {
        const rightLevel = Number(equation[1]);
        const leftLevel = Number(equation[0]);
        if (Number.isFinite(rightLevel)) {
          parameters3.expression = equation[0];
          parameters3.level = rightLevel;
        } else if (Number.isFinite(leftLevel)) {
          parameters3.expression = equation[1];
          parameters3.level = leftLevel;
        } else {
          parameters3.expression = `(${equation[0]})-(${equation[1]})`;
          parameters3.level = 0;
        }
      } else if (parameters3.level === void 0) {
        parameters3.level = 0;
      }
    }
  },
  function_plot: {
    lower_model_parameters(parameters3, { numberCount }) {
      const rawFormulas = parameters3.formulas !== void 0 ? parameters3.formulas : typeof parameters3.expression === "string" ? [parameters3.expression] : Array.isArray(parameters3.expressions) ? parameters3.expressions : void 0;
      if (rawFormulas === void 0) return;
      if (!Array.isArray(rawFormulas) || rawFormulas.length < 1 || rawFormulas.length > 8) {
        formulaError(
          "$lessonPlanSection.visual.parameters.formulas",
          "expected one to eight formulas"
        );
      }
      delete parameters3.formulas;
      delete parameters3.expression;
      delete parameters3.expressions;
      delete parameters3.expression_tokens;
      const parsed = rawFormulas.map((formula, index) => parseModelFormula(
        formula,
        numberCount,
        `$lessonPlanSection.visual.parameters.formulas[${index}]`
      ));
      if (parsed.length === 1) {
        parameters3.expression_tokens = parsed[0];
        return;
      }
      if (parsed.some((expression) => expression.some((token) => token.kind === "number"))) {
        formulaError(
          "$lessonPlanSection.visual.parameters.formulas",
          "a multi-curve comparison currently supports static formulas only; use one formula when lesson numbers change the whole curve"
        );
      }
      const canonical = parsed.map(mathExpressionToOll);
      const retainedIndexes = [];
      const seen = /* @__PURE__ */ new Set();
      canonical.forEach((expression, index) => {
        if (seen.has(expression)) return;
        seen.add(expression);
        retainedIndexes.push(index);
      });
      parameters3.expressions = retainedIndexes.map((index) => canonical[index]);
      if (Array.isArray(parameters3.curve_labels) && parameters3.curve_labels.length === canonical.length) {
        parameters3.curve_labels = retainedIndexes.map((index) => parameters3.curve_labels[index]);
      } else {
        delete parameters3.curve_labels;
      }
      delete parameters3.curve_label;
      return { no_numbers: true };
    },
    validate_parameters(parameters3, { path, numberCount, fail: fail4, record: record3, array: array2, validateMathExpression: validateMathExpression2 }) {
      if (parameters3 === void 0) {
        fail4(
          "LESSON_PLAN_EXPRESSION",
          `${path}.parameters`,
          "a function plot requires an explicit mathematical expression"
        );
      }
      const visualParameters = record3(parameters3, `${path}.parameters`);
      const expressionFields = ["expression", "expressions", "expression_tokens"].filter((field) => visualParameters[field] !== void 0);
      if (expressionFields.length !== 1) {
        fail4(
          "LESSON_PLAN_EXPRESSION",
          `${path}.parameters`,
          "a function plot requires exactly one explicit mathematical expression"
        );
      }
      const pathToSamples = `${path}.parameters.sample_x_numbers`;
      const samples = validatePlotSampleNumbers(visualParameters.sample_x_numbers, numberCount, pathToSamples);
      if (samples.length && plotCurveNumbers(visualParameters).length) {
        fail4("LESSON_PLAN_INTERACTION_MISMATCH", pathToSamples, "sample_x_numbers requires a fixed curve; use formula references for curve controls");
      }
      if (visualParameters.expression_tokens !== void 0) {
        const expressionTokens = array2(
          visualParameters.expression_tokens,
          `${path}.parameters.expression_tokens`
        );
        if (!expressionTokens.some((token) => token !== null && typeof token === "object" && !Array.isArray(token) && token.kind === "input")) {
          fail4(
            "LESSON_PLAN_PLOT_INPUT",
            `${path}.parameters.expression_tokens`,
            "a parameterized function curve must explicitly depend on the plot input; a lesson number cannot replace the horizontal-axis input"
          );
        }
        validateMathExpression2(
          visualParameters.expression_tokens,
          `${path}.parameters.expression_tokens`,
          numberCount,
          true
        );
      }
    },
    before_compile: separateInitialSamples,
    bound_numbers(content) {
      return [...plotCurveNumbers(content.parameters), ...plotSampleNumbers(content.parameters)];
    }
  },
  function_surface_with_section: { section_range: surfaceSectionRange },
  coordinate_circle: {
    // A declared radius formula maps an input quantity to radius; its input
    // is not itself a radius. Keep shared height/time/etc. controls intact,
    // and give the input no radius range.
    free_number: (content) => content.parameters?.radius_expression !== void 0
  }
};
function requestsTwoIndependentPoints(request) {
  return /(?:两个|两)\s*(?:个)?(?:可以|可)?(?:分别|独立|各自).{0,8}(?:移动|调整).{0,4}点|(?:分别|独立|各自).{0,8}(?:移动|调整).{0,8}(?:两个点|两点)|two.{0,12}(?:independent|separate).{0,12}(?:point|sample)/i.test(request);
}
function prepareTwoPointOutline(outline, request, language) {
  if (!requestsTwoIndependentPoints(request)) return;
  outline.numbers ??= [];
  while (outline.numbers.length < 2) {
    const index = outline.numbers.length;
    outline.numbers.push({
      initial: index === 0 ? -1 : 2,
      min: -5,
      max: 5,
      label: index === 0 ? lessonText(language, "A\u70B9\u7684x\u5750\u6807") : lessonText(language, "B\u70B9\u7684x\u5750\u6807"),
      student_control: { kind: "slider", step: 0.25 }
    });
  }
  outline.numbers.slice(0, 2).forEach((number, index) => {
    number.label = index === 0 ? lessonText(language, "A\u70B9\u7684x\u5750\u6807") : lessonText(language, "B\u70B9\u7684x\u5750\u6807");
    number.student_control = { kind: "slider", step: number.student_control?.step ?? 0.25 };
  });
}
function specializeTwoPointDraft(draft, outline, request) {
  if (!requestsTwoIndependentPoints(request) || (outline.numbers?.length ?? 0) < 2) return;
  for (const moment of draft.moments) for (const action of moment.actions) {
    if (action.action !== "create" || action.kind !== "visual") continue;
    const content = action.content;
    if (content.capability !== "function_plot" || content.parameters?.sample_x_numbers !== void 0 || Array.isArray(content.parameters?.expressions)) continue;
    const tokens = content.parameters?.expression_tokens;
    if (Array.isArray(tokens)) {
      content.parameters.expression_tokens = tokens.map((token) => token.kind === "number" ? { kind: "literal", value: outline.numbers?.[token.number - 1]?.initial ?? 0 } : token);
    }
    content.parameters = { ...content.parameters, sample_x_numbers: [1, 2] };
    content.numbers = [1, 2];
  }
}
var MATH_PLUGIN_HOOKS = {
  prepare_outline: (outline, { request, language }) => prepareTwoPointOutline(outline, request, language),
  specialize_draft(draft, context) {
    specializeTwoPointDraft(draft, context.outline, context.request);
    normalizePlotDraftBindings(draft, context);
  },
  normalize_plan: normalizePlotInputInstructions,
  check_plan: validateTeachingClaims
};

// src/plugins/shared-hooks.ts
var SHARED_HOOKS = {
  process_diagram: {
    removal_reason(content) {
      const input = content.parameters ?? {};
      const steps = input.steps;
      const title = input.title;
      if (!Array.isArray(steps)) return "missing_steps";
      if (steps.length < PROCESS_DIAGRAM_CONTRACT.min_steps || steps.length > PROCESS_DIAGRAM_CONTRACT.max_steps) {
        return "step_count_out_of_range";
      }
      if (!steps.every((step) => typeof step === "string" && step.trim().length >= 1 && step.trim().length <= PROCESS_DIAGRAM_CONTRACT.max_step_characters)) {
        return "step_text_out_of_range";
      }
      if (title !== void 0 && (typeof title !== "string" || title.trim().length < 1 || title.trim().length > PROCESS_DIAGRAM_CONTRACT.max_title_characters)) {
        return "title_text_out_of_range";
      }
      return void 0;
    }
  }
};

// src/plugins/hooks.ts
var RECIPE_HOOKS = Object.assign(/* @__PURE__ */ Object.create(null), MATH_HOOKS, SHARED_HOOKS);
var PLUGIN_HOOKS = [MATH_PLUGIN_HOOKS];

// src/lesson-plan.ts
var LESSON_PLAN_VERSION = "0.1";
var LESSON_PLAN_CAPABILITY_REGISTRY = PLUGIN_RECIPE_REGISTRY;
var LESSON_PLAN_CAPABILITY_NAMES = Object.keys(LESSON_PLAN_CAPABILITY_REGISTRY);
var LESSON_PLAN_VISUAL_FEATURES = [...new Set(
  LESSON_PLAN_CAPABILITY_NAMES.flatMap((name) => [...LESSON_PLAN_CAPABILITY_REGISTRY[name].required_features])
)];
var LESSON_PLAN_CAPABILITIES = Object.fromEntries(
  LESSON_PLAN_CAPABILITY_NAMES.map((name) => [name, LESSON_PLAN_CAPABILITY_REGISTRY[name].parts])
);
var LESSON_PLAN_CAPABILITY_NUMBER_INPUTS = Object.fromEntries(
  LESSON_PLAN_CAPABILITY_NAMES.map((name) => [name, LESSON_PLAN_CAPABILITY_REGISTRY[name].number_inputs])
);
var LESSON_PLAN_CAPABILITY_NUMBER_LIMITS = Object.fromEntries(
  LESSON_PLAN_CAPABILITY_NAMES.map((name) => [name, LESSON_PLAN_CAPABILITY_REGISTRY[name].number_inputs.length])
);
function matchLessonPlanCapability(features) {
  const requested = [...new Set(features)];
  if (requested.length === 0) {
    throw new LessonPlanError(
      "LESSON_PLAN_CAPABILITY_REQUIREMENTS",
      "$lessonPlanOutline.course_visuals.required_features",
      "a visual requires at least one controlled feature"
    );
  }
  const candidates = LESSON_PLAN_CAPABILITY_NAMES.map((capability2) => {
    const provided = LESSON_PLAN_CAPABILITY_REGISTRY[capability2].required_features;
    return {
      capability: capability2,
      // The model describes the features it needs; it does not select an
      // execution program. A program may provide fixed companion features
      // the model omitted, but it may never omit a requested feature.
      extra: provided.filter((feature) => !requested.includes(feature)).length,
      matches: requested.every((feature) => provided.includes(feature))
    };
  }).filter((candidate) => candidate.matches).sort((left, right) => left.extra - right.extra || left.capability.localeCompare(right.capability));
  if (candidates.length === 0) {
    throw new LessonPlanError(
      "LESSON_PLAN_UNSUPPORTED_REQUIREMENT",
      "$lessonPlanOutline.course_visuals.required_features",
      `no installed visual capability provides: ${requested.join(", ")}`
    );
  }
  const best = candidates[0];
  const equallySpecific = candidates.filter((candidate) => candidate.extra === best.extra);
  if (equallySpecific.length > 1) {
    throw new LessonPlanError(
      "LESSON_PLAN_CAPABILITY_REQUIREMENTS",
      "$lessonPlanOutline.course_visuals.required_features",
      `visual requirements are ambiguous between: ${equallySpecific.map((candidate) => candidate.capability).join(", ")}`
    );
  }
  return best.capability;
}
var LessonPlanError = class extends Error {
  code;
  path;
  constructor(code, path, message) {
    super(`${path}: ${message}`);
    this.name = "LessonPlanError";
    this.code = code;
    this.path = path;
  }
};
var FORBIDDEN_PARAMETER_KEYS = /* @__PURE__ */ new Set([
  "id",
  "as",
  "key",
  "target",
  "targets",
  "anchor",
  "variable",
  "variables",
  "binding",
  "bindings",
  "members",
  "node_id",
  "target_id",
  "action_id",
  "lesson_id",
  "board_id",
  "base_revision"
]);
var timings = /* @__PURE__ */ new Set(["before_speech", "during_speech", "after_speech"]);
var deliveries = /* @__PURE__ */ new Set(["neutral", "patient", "encouraging", "careful", "emphatic"]);
var boardKinds = /* @__PURE__ */ new Set(["text", "math", "shape", "note", "table", "image", "visual"]);
var emphasisValues = /* @__PURE__ */ new Set(["focus", "supporting", "warning", "resolved"]);
var teacherExpressions = /* @__PURE__ */ new Set(["neutral", "encouraging", "careful", "celebrating"]);
function fail3(code, path, message) {
  throw new LessonPlanError(code, path, message);
}
function record2(value2, path) {
  if (!value2 || typeof value2 !== "object" || Array.isArray(value2)) {
    fail3("LESSON_PLAN_TYPE", path, "expected an object");
  }
  return value2;
}
function array(value2, path) {
  if (!Array.isArray(value2)) fail3("LESSON_PLAN_TYPE", path, "expected an array");
  return value2;
}
function allowedKeys(value2, allowed, path) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value2)) {
    if (!allowedSet.has(key)) fail3("LESSON_PLAN_UNKNOWN_FIELD", `${path}.${key}`, "unknown field");
  }
}
function nonEmptyString(value2, path, max = 1200) {
  if (typeof value2 !== "string" || value2.trim().length === 0 || value2.length > max) {
    fail3("LESSON_PLAN_STRING", path, `expected a non-empty string of at most ${max} characters`);
  }
  return value2;
}
function optionalString(value2, path, max = 1200) {
  return value2 === void 0 ? void 0 : nonEmptyString(value2, path, max);
}
function finiteNumber(value2, path) {
  if (typeof value2 !== "number" || !Number.isFinite(value2)) fail3("LESSON_PLAN_NUMBER", path, "expected a finite number");
  return value2;
}
function positiveIndex(value2, path) {
  if (!Number.isInteger(value2) || value2 < 1) fail3("LESSON_PLAN_INDEX", path, "expected a positive integer index");
  return value2;
}
function optionalTiming(value2, path) {
  if (value2 === void 0) return void 0;
  if (typeof value2 !== "string" || !timings.has(value2)) fail3("LESSON_PLAN_TIMING", path, "unsupported timing");
  return value2;
}
function validateParameters(value2, path) {
  if (value2 === null || typeof value2 === "string" || typeof value2 === "boolean") return;
  if (typeof value2 === "number") {
    finiteNumber(value2, path);
    return;
  }
  if (Array.isArray(value2)) {
    value2.forEach((item, index) => validateParameters(item, `${path}[${index}]`));
    return;
  }
  const object2 = record2(value2, path);
  for (const [key, item] of Object.entries(object2)) {
    if (FORBIDDEN_PARAMETER_KEYS.has(key) || key.endsWith("_id")) {
      fail3("LESSON_PLAN_MODEL_ID", `${path}.${key}`, "business identity fields are not allowed in model-authored parameters");
    }
    validateParameters(item, `${path}.${key}`);
  }
}
function recipeValidationContext(path, numberCount) {
  return { path, numberCount, fail: fail3, record: record2, array, validateMathExpression };
}
function validateMathExpression(value2, path, numberCount, allowInput = false) {
  const tokens = array(value2, path);
  if (tokens.length === 0 || tokens.length > 128) fail3("LESSON_PLAN_EXPRESSION", path, "expected 1 to 128 expression tokens");
  let stackDepth = 0;
  const numbers = /* @__PURE__ */ new Set();
  tokens.forEach((entry, index) => {
    const tokenPath = `${path}[${index}]`;
    const token = record2(entry, tokenPath);
    const kind = token.kind;
    if (kind === "input") {
      allowedKeys(token, ["kind"], tokenPath);
      if (!allowInput) fail3("LESSON_PLAN_EXPRESSION", tokenPath, "an independent input is not allowed here");
      stackDepth += 1;
    } else if (kind === "number") {
      allowedKeys(token, ["kind", "number"], tokenPath);
      const number = positiveIndex(token.number, `${tokenPath}.number`);
      if (number > numberCount) fail3("LESSON_PLAN_NUMBER_REFERENCE", `${tokenPath}.number`, "number reference is unavailable");
      numbers.add(number);
      stackDepth += 1;
    } else if (kind === "literal") {
      allowedKeys(token, ["kind", "value"], tokenPath);
      finiteNumber(token.value, `${tokenPath}.value`);
      stackDepth += 1;
    } else if (kind === "constant") {
      allowedKeys(token, ["kind", "name"], tokenPath);
      if (!["pi", "e"].includes(String(token.name))) fail3("LESSON_PLAN_EXPRESSION", `${tokenPath}.name`, "unsupported constant");
      stackDepth += 1;
    } else if (kind === "negate") {
      allowedKeys(token, ["kind"], tokenPath);
      if (stackDepth < 1) fail3("LESSON_PLAN_EXPRESSION", tokenPath, "negate requires one earlier value");
    } else if (kind === "operator") {
      allowedKeys(token, ["kind", "operator"], tokenPath);
      if (!["add", "subtract", "multiply", "divide", "power"].includes(String(token.operator))) fail3("LESSON_PLAN_EXPRESSION", `${tokenPath}.operator`, "unsupported operator");
      if (stackDepth < 2) fail3("LESSON_PLAN_EXPRESSION", tokenPath, "binary operator requires two earlier values");
      stackDepth -= 1;
    } else if (kind === "function") {
      allowedKeys(token, ["kind", "name"], tokenPath);
      if (!["abs", "acos", "asin", "atan", "ceil", "cos", "exp", "floor", "ln", "log", "round", "sin", "sqrt", "tan"].includes(String(token.name))) fail3("LESSON_PLAN_EXPRESSION", `${tokenPath}.name`, "unsupported function");
      if (stackDepth < 1) fail3("LESSON_PLAN_EXPRESSION", tokenPath, "function requires one earlier value");
    } else {
      fail3("LESSON_PLAN_EXPRESSION", `${tokenPath}.kind`, "unsupported expression token");
    }
  });
  if (stackDepth !== 1) fail3("LESSON_PLAN_EXPRESSION", path, "expression tokens must produce exactly one result");
  return [...numbers];
}
function capability(value2, path) {
  if (typeof value2 !== "string" || !(value2 in LESSON_PLAN_CAPABILITIES)) {
    fail3("LESSON_PLAN_CAPABILITY", path, "unsupported capability");
  }
  return value2;
}
function validatePart(value2, path) {
  const part = record2(value2, path);
  const kind = part.kind;
  if (kind === "capability") {
    allowedKeys(part, ["kind", "role"], path);
    return { kind, role: nonEmptyString(part.role, `${path}.role`, 80) };
  }
  if (kind === "index") {
    allowedKeys(part, ["kind", "index"], path);
    return { kind, index: positiveIndex(part.index, `${path}.index`) };
  }
  fail3("LESSON_PLAN_PART", `${path}.kind`, "unsupported part reference");
}
function validateReference(value2, path) {
  const ref = record2(value2, path);
  const part = ref.part === void 0 ? void 0 : validatePart(ref.part, `${path}.part`);
  if (ref.source === "local_board_item" || ref.source === "local_connection" || ref.source === "local_group") {
    allowedKeys(ref, ["source", "moment", "item", "part"], path);
    return {
      source: ref.source,
      moment: positiveIndex(ref.moment, `${path}.moment`),
      item: positiveIndex(ref.item, `${path}.item`),
      ...part ? { part } : {}
    };
  }
  if (ref.source === "reusable") {
    allowedKeys(ref, ["source", "section", "item", "part"], path);
    return {
      source: "reusable",
      section: positiveIndex(ref.section, `${path}.section`),
      item: positiveIndex(ref.item, `${path}.item`),
      ...part ? { part } : {}
    };
  }
  if (ref.source === "host") {
    allowedKeys(ref, ["source", "reference", "part"], path);
    return {
      source: "host",
      reference: positiveIndex(ref.reference, `${path}.reference`),
      ...part ? { part } : {}
    };
  }
  fail3("LESSON_PLAN_REFERENCE", `${path}.source`, "unsupported reference source");
}
function validatePlacement2(value2, path) {
  const placement = record2(value2, path);
  allowedKeys(placement, ["relation", "reference", "align", "gap"], path);
  const relation = placement.relation;
  const relations = /* @__PURE__ */ new Set(["new_region", "below", "above", "left_of", "right_of", "near", "inside", "overlay"]);
  if (typeof relation !== "string" || !relations.has(relation)) fail3("LESSON_PLAN_PLACEMENT", `${path}.relation`, "unsupported placement relation");
  const reference = placement.reference === void 0 ? void 0 : validateReference(placement.reference, `${path}.reference`);
  if (relation === "new_region" && reference) fail3("LESSON_PLAN_PLACEMENT", `${path}.reference`, "new_region cannot have a reference");
  if (relation !== "new_region" && !reference) fail3("LESSON_PLAN_PLACEMENT", `${path}.reference`, "relative placement requires a reference");
  if (placement.align !== void 0 && !["start", "center", "end"].includes(String(placement.align))) fail3("LESSON_PLAN_PLACEMENT", `${path}.align`, "unsupported alignment");
  if (placement.gap !== void 0 && !["tight", "normal", "wide"].includes(String(placement.gap))) fail3("LESSON_PLAN_PLACEMENT", `${path}.gap`, "unsupported gap");
  return placement;
}
function validateBoardContent(kind, value2, path, numberCount, resourceCount) {
  const content = record2(value2, path);
  if (kind === "text" || kind === "shape") {
    allowedKeys(content, ["text"], path);
    nonEmptyString(content.text, `${path}.text`);
  } else if (kind === "math") {
    allowedKeys(content, ["latex"], path);
    nonEmptyString(content.latex, `${path}.latex`);
  } else if (kind === "note") {
    allowedKeys(content, ["title", "items"], path);
    nonEmptyString(content.title, `${path}.title`, 240);
    const items = array(content.items, `${path}.items`);
    if (items.length === 0) fail3("LESSON_PLAN_CONTENT", `${path}.items`, "note requires at least one item");
    items.forEach((item, index) => nonEmptyString(item, `${path}.items[${index}]`));
  } else if (kind === "table") {
    allowedKeys(content, ["columns", "rows"], path);
    const columns = array(content.columns, `${path}.columns`);
    if (columns.length === 0) fail3("LESSON_PLAN_CONTENT", `${path}.columns`, "table requires columns");
    columns.forEach((item, index) => nonEmptyString(item, `${path}.columns[${index}]`));
    const rows = array(content.rows, `${path}.rows`);
    rows.forEach((row, rowIndex) => {
      const cells = array(row, `${path}.rows[${rowIndex}]`);
      if (cells.length !== columns.length) fail3("LESSON_PLAN_CONTENT", `${path}.rows[${rowIndex}]`, "row width must equal column count");
      cells.forEach((cell, columnIndex) => {
        if (typeof cell === "number") finiteNumber(cell, `${path}.rows[${rowIndex}][${columnIndex}]`);
        else nonEmptyString(cell, `${path}.rows[${rowIndex}][${columnIndex}]`);
      });
    });
  } else if (kind === "image") {
    allowedKeys(content, ["resource", "alt"], path);
    const index = positiveIndex(content.resource, `${path}.resource`);
    if (index > resourceCount) fail3("LESSON_PLAN_IMAGE_RESOURCE", `${path}.resource`, "image resource is unavailable");
    optionalString(content.alt, `${path}.alt`, 480);
  } else {
    allowedKeys(content, ["capability", "parameters", "numbers"], path);
    const visualCapability = capability(content.capability, `${path}.capability`);
    const hooks = RECIPE_HOOKS[visualCapability];
    const hookContext = recipeValidationContext(path, numberCount);
    if (content.parameters !== void 0) validateParameters(content.parameters, `${path}.parameters`);
    hooks?.validate_parameters?.(content.parameters, hookContext);
    if (content.numbers !== void 0) {
      const numbers = array(content.numbers, `${path}.numbers`);
      if (numbers.length > 16) fail3("LESSON_PLAN_CONTENT", `${path}.numbers`, "too many number references");
      numbers.forEach((item, index) => {
        const number = positiveIndex(item, `${path}.numbers[${index}]`);
        if (number > numberCount) fail3("LESSON_PLAN_NUMBER_REFERENCE", `${path}.numbers[${index}]`, "number reference is unavailable");
      });
      hooks?.validate_numbers?.(numbers, content, hookContext);
    }
  }
  return content;
}
function pad3(index) {
  return String(index).padStart(2, "0");
}
function localKey(section, moment, kind, item) {
  return `${section}:${moment}:${kind}:${item}`;
}
function reusableKey(section, item) {
  return `${section}:${item}`;
}
function assertPart(target, part, path) {
  if (!part) return;
  if (part.kind === "capability") {
    if (!target.capability) fail3("LESSON_PLAN_PART", path, "capability part requires a visual capability target");
    const roles = LESSON_PLAN_CAPABILITIES[target.capability];
    if (!roles.includes(part.role)) fail3("LESSON_PLAN_PART", path, `capability '${target.capability}' has no part '${part.role}'`);
  } else if (part.kind === "index") {
    if (!target.hostParts) fail3("LESSON_PLAN_PART", path, "index parts are only available on host nodes");
    if (part.index > target.hostParts.size) fail3("LESSON_PLAN_PART", path, "host part is unavailable");
  }
}
function validateLessonPlanNumbers(value2, path) {
  const numbers = value2 === void 0 ? [] : array(value2, path);
  if (numbers.length > 16) fail3("LESSON_PLAN_NUMBERS", path, "expected at most 16 numeric states");
  numbers.forEach((entry, index) => {
    const numberPath = `${path}[${index}]`;
    const number = record2(entry, numberPath);
    allowedKeys(number, ["initial", "min", "max", "label", "unit", "student_control"], numberPath);
    const initial = finiteNumber(number.initial, `${numberPath}.initial`);
    const min = finiteNumber(number.min, `${numberPath}.min`);
    const max = finiteNumber(number.max, `${numberPath}.max`);
    if (!(min < max && initial >= min && initial <= max)) {
      fail3("LESSON_PLAN_NUMBER_RANGE", numberPath, "expected min < max and initial inside the range");
    }
    optionalString(number.label, `${numberPath}.label`, 80);
    optionalString(number.unit, `${numberPath}.unit`, 32);
    if (number.student_control === void 0) return;
    const controlPath = `${numberPath}.student_control`;
    const control = record2(number.student_control, controlPath);
    allowedKeys(control, ["kind", "step"], controlPath);
    if (control.kind !== "slider") fail3("LESSON_PLAN_CONTROL", `${controlPath}.kind`, "only slider is supported");
    if (control.step === void 0) return;
    const step = finiteNumber(control.step, `${controlPath}.step`);
    if (step <= 0 || step > max - min) {
      fail3("LESSON_PLAN_CONTROL", `${controlPath}.step`, "step must be positive and inside the range");
    }
    if ((max - min) / step > 1e3) {
      fail3(
        "LESSON_PLAN_CONTROL_RESOLUTION",
        `${controlPath}.step`,
        "a slider cannot expose more than 1000 distinct intervals; use a coarser step or a smaller range"
      );
    }
  });
  return numbers;
}
function resolveLessonPlan(value2, options = {}) {
  const root = record2(value2, "$lessonPlan");
  allowedKeys(root, ["version", "title", "goals", "teaching_strategies", "numbers", "sections", "close"], "$lessonPlan");
  if (root.version !== LESSON_PLAN_VERSION) fail3("LESSON_PLAN_VERSION", "$lessonPlan.version", `expected '${LESSON_PLAN_VERSION}'`);
  nonEmptyString(root.title, "$lessonPlan.title", 160);
  const goals = array(root.goals, "$lessonPlan.goals");
  if (goals.length < 1 || goals.length > 8) fail3("LESSON_PLAN_GOALS", "$lessonPlan.goals", "expected 1 to 8 goals");
  goals.forEach((goal, index) => nonEmptyString(goal, `$lessonPlan.goals[${index}]`, 480));
  if (root.teaching_strategies !== void 0) {
    const strategies = array(root.teaching_strategies, "$lessonPlan.teaching_strategies");
    if (strategies.length > 16) fail3("LESSON_PLAN_STRATEGIES", "$lessonPlan.teaching_strategies", "expected at most 16 strategies");
    strategies.forEach((strategy, index) => nonEmptyString(strategy, `$lessonPlan.teaching_strategies[${index}]`, 240));
  }
  const rawNumbers = validateLessonPlanNumbers(root.numbers, "$lessonPlan.numbers");
  const hostReferences = options.host_references ?? [];
  const imageResources = options.image_resources ?? [];
  imageResources.forEach((resource, index) => {
    nonEmptyString(resource.asset_id, `$options.image_resources[${index}].asset_id`);
  });
  const hosts = /* @__PURE__ */ new Map();
  hostReferences.forEach((host, index) => {
    nonEmptyString(host.target_id, `$options.host_references[${index}].target_id`);
    if (!["node", "connection", "group"].includes(host.type)) {
      fail3("LESSON_PLAN_HOST_REFERENCE", `$options.host_references[${index}].type`, "unsupported host reference type");
    }
    optionalString(host.label, `$options.host_references[${index}].label`, 160);
    if (host.type !== "node" && (host.parts?.length ?? 0) > 0) {
      fail3("LESSON_PLAN_HOST_REFERENCE", `$options.host_references[${index}].parts`, "only host nodes can expose parts");
    }
    hosts.set(index + 1, {
      id: host.target_id,
      authoringAlias: `host-${pad3(index + 1)}`,
      kind: "host",
      hostParts: new Set(host.parts ?? [])
    });
  });
  const rawSections = array(root.sections, "$lessonPlan.sections");
  if (rawSections.length < 1 || rawSections.length > 24) fail3("LESSON_PLAN_SECTIONS", "$lessonPlan.sections", "expected 1 to 24 sections");
  const locals = /* @__PURE__ */ new Map();
  const reusables = /* @__PURE__ */ new Map();
  const references = [];
  const visuallyBoundNumbers = /* @__PURE__ */ new Set();
  const requiredVisualNumberUses = [];
  const resolvedSections = [];
  const resolveReference = (raw, path, sectionIndex, momentIndex) => {
    const ref = validateReference(raw, path);
    let target;
    if (ref.source === "host") {
      target = hosts.get(ref.reference);
      if (!target) fail3("LESSON_PLAN_HOST_REFERENCE", path, "host reference is unavailable");
    } else if (ref.source === "reusable") {
      if (ref.section > sectionIndex) fail3("LESSON_PLAN_REFERENCE_ORDER", path, "reusable references cannot point to a future section");
      target = reusables.get(reusableKey(ref.section, ref.item));
      if (!target) fail3("LESSON_PLAN_REFERENCE", path, "reusable item has not been filled");
    } else {
      if (ref.moment > momentIndex) fail3("LESSON_PLAN_REFERENCE_ORDER", path, "local references cannot point to a future moment");
      const kind = ref.source === "local_board_item" ? "board_item" : ref.source === "local_connection" ? "connection" : "group";
      target = locals.get(localKey(sectionIndex, ref.moment, kind, ref.item));
      if (!target) fail3("LESSON_PLAN_REFERENCE", path, "local item does not exist");
    }
    assertPart(target, ref.part, `${path}.part`);
    references.push({
      path,
      target_id: target.id,
      authoring_alias: target.authoringAlias,
      target_kind: target.kind,
      ...target.boardKind ? { board_kind: target.boardKind } : {},
      ...target.capability ? { capability: target.capability } : {},
      ...ref.part ? { part: ref.part } : {}
    });
    return target;
  };
  rawSections.forEach((rawSection, sectionOffset) => {
    const sectionIndex = sectionOffset + 1;
    const path = `$lessonPlan.sections[${sectionOffset}]`;
    const section = record2(rawSection, path);
    allowedKeys(section, ["purpose", "reusable_items", "moments", "student_activities"], path);
    nonEmptyString(section.purpose, `${path}.purpose`, 480);
    const reusableDeclarations = section.reusable_items === void 0 ? [] : array(section.reusable_items, `${path}.reusable_items`);
    if (reusableDeclarations.length > 32) fail3("LESSON_PLAN_REUSABLE", `${path}.reusable_items`, "expected at most 32 reusable items");
    const declarations = reusableDeclarations.map((entry, declarationOffset) => {
      const declarationPath = `${path}.reusable_items[${declarationOffset}]`;
      const declaration = record2(entry, declarationPath);
      allowedKeys(declaration, ["kind", "board_kind", "capability"], declarationPath);
      if (!["board_item", "connection", "group"].includes(String(declaration.kind))) fail3("LESSON_PLAN_REUSABLE", `${declarationPath}.kind`, "unsupported reusable item kind");
      if (declaration.kind === "board_item") {
        if (typeof declaration.board_kind !== "string" || !boardKinds.has(declaration.board_kind)) fail3("LESSON_PLAN_REUSABLE", `${declarationPath}.board_kind`, "board_item requires a supported board_kind");
        if (declaration.board_kind === "visual") capability(declaration.capability, `${declarationPath}.capability`);
        else if (declaration.capability !== void 0) fail3("LESSON_PLAN_REUSABLE", `${declarationPath}.capability`, "only visual board items declare a capability");
      } else if (declaration.board_kind !== void 0 || declaration.capability !== void 0) {
        fail3("LESSON_PLAN_REUSABLE", declarationPath, "connection and group declarations do not use board_kind or capability");
      }
      return declaration;
    });
    const assigned = /* @__PURE__ */ new Map();
    const assignReusable = (slotValue, target, assignmentPath) => {
      if (slotValue === void 0) return;
      const slot = positiveIndex(slotValue, assignmentPath);
      const declaration = declarations[slot - 1];
      if (!declaration) fail3("LESSON_PLAN_REUSABLE", assignmentPath, "reusable slot is not declared");
      if (assigned.has(slot)) fail3("LESSON_PLAN_REUSABLE", assignmentPath, "reusable slot is filled more than once");
      if (declaration.kind !== target.kind) fail3("LESSON_PLAN_REUSABLE", assignmentPath, "reusable slot kind does not match the created item");
      if (target.kind === "board_item") {
        if (declaration.board_kind !== target.boardKind) fail3("LESSON_PLAN_REUSABLE", assignmentPath, "reusable board kind does not match");
        if (declaration.capability !== target.capability) fail3("LESSON_PLAN_REUSABLE", assignmentPath, "reusable capability does not match");
      }
      assigned.set(slot, target);
    };
    const rawMoments = array(section.moments, `${path}.moments`);
    if (rawMoments.length < 1 || rawMoments.length > 12) fail3("LESSON_PLAN_MOMENTS", `${path}.moments`, "expected 1 to 12 moments");
    const resolvedMoments = [];
    rawMoments.forEach((rawMoment, momentOffset) => {
      const momentIndex = momentOffset + 1;
      const momentPath = `${path}.moments[${momentOffset}]`;
      const moment = record2(rawMoment, momentPath);
      allowedKeys(moment, ["narration", "delivery", "actions", "restart_numbers"], momentPath);
      if (moment.restart_numbers !== void 0) {
        const restarts = array(moment.restart_numbers, `${momentPath}.restart_numbers`);
        if (!restarts.length || new Set(restarts).size !== restarts.length) fail3("LESSON_PLAN_PHASE_START", momentPath, "restart_numbers must be nonempty and unique");
        for (const number of restarts) {
          const index = positiveIndex(number, `${momentPath}.restart_numbers`);
          if (index > rawNumbers.length) fail3("LESSON_PLAN_PHASE_START", momentPath, "unknown restart number");
        }
      }
      optionalString(moment.narration, `${momentPath}.narration`);
      if (moment.delivery !== void 0 && (typeof moment.delivery !== "string" || !deliveries.has(moment.delivery))) fail3("LESSON_PLAN_DELIVERY", `${momentPath}.delivery`, "unsupported delivery");
      const actions = array(moment.actions, `${momentPath}.actions`);
      if (actions.length > 48) fail3("LESSON_PLAN_ACTIONS", `${momentPath}.actions`, "expected at most 48 ordered actions");
      const boardItemIds = [];
      const connectionIds = [];
      const groupIds = [];
      let boardItemIndex = 0;
      let connectionIndex = 0;
      let groupIndex = 0;
      actions.forEach((entry, actionOffset) => {
        const itemPath = `${momentPath}.actions[${actionOffset}]`;
        const action = record2(entry, itemPath);
        const actionKind = action.action;
        if (actionKind === "create") {
          allowedKeys(action, ["action", "kind", "role", "content", "timing", "placement", "reusable_item", "distinct_visual"], itemPath);
          if (typeof action.kind !== "string" || !boardKinds.has(action.kind)) fail3("LESSON_PLAN_BOARD_KIND", `${itemPath}.kind`, "unsupported board item kind");
          const kind = action.kind;
          nonEmptyString(action.role, `${itemPath}.role`, 80);
          optionalTiming(action.timing, `${itemPath}.timing`);
          const placement = validatePlacement2(action.placement, `${itemPath}.placement`);
          if (placement.reference) resolveReference(placement.reference, `${itemPath}.placement.reference`, sectionIndex, momentIndex);
          const content = validateBoardContent(kind, action.content, `${itemPath}.content`, rawNumbers.length, imageResources.length);
          if (action.distinct_visual !== void 0) {
            if (kind !== "visual" || typeof action.distinct_visual !== "boolean") {
              fail3("LESSON_PLAN_COURSE_VISUAL", `${itemPath}.distinct_visual`, "distinct_visual is only valid on visual creates");
            }
          }
          if (kind === "visual") {
            const visualContent = content;
            const boundNumbers = RECIPE_HOOKS[visualContent.capability]?.bound_numbers?.(visualContent);
            for (const number of boundNumbers ?? visualContent.numbers ?? []) visuallyBoundNumbers.add(number);
          }
          boardItemIndex += 1;
          const id = `section-${pad3(sectionIndex)}-moment-${pad3(momentIndex)}-item-${pad3(boardItemIndex)}`;
          const target = { id, authoringAlias: id, kind: "board_item", boardKind: kind };
          if (kind === "visual") target.capability = content.capability;
          locals.set(localKey(sectionIndex, momentIndex, "board_item", boardItemIndex), target);
          boardItemIds.push(id);
          assignReusable(action.reusable_item, target, `${itemPath}.reusable_item`);
        } else if (actionKind === "revise") {
          allowedKeys(action, ["action", "reference", "kind", "content", "reason", "timing"], itemPath);
          const target = resolveReference(action.reference, `${itemPath}.reference`, sectionIndex, momentIndex);
          if (typeof action.kind !== "string" || !boardKinds.has(action.kind)) fail3("LESSON_PLAN_BOARD_KIND", `${itemPath}.kind`, "unsupported revision board kind");
          const revisionKind = action.kind;
          if (target.kind !== "board_item" || !target.boardKind) fail3("LESSON_PLAN_ACTION_TARGET", `${itemPath}.reference`, "revise requires a board item created by this lesson; host board references are read-only");
          if (target.boardKind !== revisionKind) fail3("LESSON_PLAN_ACTION_TARGET", `${itemPath}.kind`, "revision kind must match the board item");
          validateBoardContent(revisionKind, action.content, `${itemPath}.content`, rawNumbers.length, imageResources.length);
          nonEmptyString(action.reason, `${itemPath}.reason`, 480);
          optionalTiming(action.timing, `${itemPath}.timing`);
        } else if (actionKind === "emphasize") {
          allowedKeys(action, ["action", "reference", "emphasis", "timing"], itemPath);
          resolveReference(action.reference, `${itemPath}.reference`, sectionIndex, momentIndex);
          if (typeof action.emphasis !== "string" || !emphasisValues.has(action.emphasis)) fail3("LESSON_PLAN_EMPHASIS", `${itemPath}.emphasis`, "unsupported emphasis");
          optionalTiming(action.timing, `${itemPath}.timing`);
        } else if (actionKind === "connect") {
          allowedKeys(action, ["action", "from_ref", "to_ref", "relation", "label", "timing", "reusable_item"], itemPath);
          resolveReference(action.from_ref, `${itemPath}.from_ref`, sectionIndex, momentIndex);
          resolveReference(action.to_ref, `${itemPath}.to_ref`, sectionIndex, momentIndex);
          nonEmptyString(action.relation, `${itemPath}.relation`, 80);
          optionalString(action.label, `${itemPath}.label`, 160);
          optionalTiming(action.timing, `${itemPath}.timing`);
          connectionIndex += 1;
          const id = `section-${pad3(sectionIndex)}-moment-${pad3(momentIndex)}-connection-${pad3(connectionIndex)}`;
          const target = { id, authoringAlias: id, kind: "connection" };
          locals.set(localKey(sectionIndex, momentIndex, "connection", connectionIndex), target);
          connectionIds.push(id);
          assignReusable(action.reusable_item, target, `${itemPath}.reusable_item`);
        } else if (actionKind === "group") {
          allowedKeys(action, ["action", "role", "label", "members", "timing", "reusable_item"], itemPath);
          nonEmptyString(action.role, `${itemPath}.role`, 80);
          nonEmptyString(action.label, `${itemPath}.label`, 160);
          const members = array(action.members, `${itemPath}.members`);
          if (members.length === 0) fail3("LESSON_PLAN_GROUP", `${itemPath}.members`, "group requires members");
          members.forEach((member, index) => resolveReference(member, `${itemPath}.members[${index}]`, sectionIndex, momentIndex));
          optionalTiming(action.timing, `${itemPath}.timing`);
          groupIndex += 1;
          const id = `section-${pad3(sectionIndex)}-moment-${pad3(momentIndex)}-group-${pad3(groupIndex)}`;
          const target = { id, authoringAlias: id, kind: "group" };
          locals.set(localKey(sectionIndex, momentIndex, "group", groupIndex), target);
          groupIds.push(id);
          assignReusable(action.reusable_item, target, `${itemPath}.reusable_item`);
        } else if (actionKind === "focus") {
          allowedKeys(action, ["action", "references", "intent", "timing"], itemPath);
          const refs = array(action.references, `${itemPath}.references`);
          if (refs.length === 0) fail3("LESSON_PLAN_FOCUS", `${itemPath}.references`, "focus requires references");
          refs.forEach((ref, index) => resolveReference(ref, `${itemPath}.references[${index}]`, sectionIndex, momentIndex));
          nonEmptyString(action.intent, `${itemPath}.intent`, 160);
          optionalTiming(action.timing, `${itemPath}.timing`);
        } else if (actionKind === "point_at") {
          allowedKeys(action, ["action", "reference", "timing"], itemPath);
          resolveReference(action.reference, `${itemPath}.reference`, sectionIndex, momentIndex);
          optionalTiming(action.timing, `${itemPath}.timing`);
        } else if (actionKind === "teacher_expression") {
          allowedKeys(action, ["action", "expression", "timing"], itemPath);
          if (typeof action.expression !== "string" || !teacherExpressions.has(action.expression)) fail3("LESSON_PLAN_EXPRESSION", `${itemPath}.expression`, "unsupported teacher expression");
          optionalTiming(action.timing, `${itemPath}.timing`);
        } else if (actionKind === "animate") {
          allowedKeys(action, ["action", "number", "end_value", "easing", "duration_intent", "timing"], itemPath);
          const number = positiveIndex(action.number, `${itemPath}.number`);
          requiredVisualNumberUses.push({ number, path: `${itemPath}.number` });
          if (number > rawNumbers.length) fail3("LESSON_PLAN_NUMBER_REFERENCE", `${itemPath}.number`, "number reference is unavailable");
          const end = finiteNumber(action.end_value, `${itemPath}.end_value`);
          const definition = record2(rawNumbers[number - 1], `$lessonPlan.numbers[${number - 1}]`);
          if (end < Number(definition.min) || end > Number(definition.max)) fail3("LESSON_PLAN_ANIMATION", `${itemPath}.end_value`, "animation end is outside the number range");
          if (action.easing !== void 0 && !["linear", "ease_in_out"].includes(String(action.easing))) fail3("LESSON_PLAN_ANIMATION", `${itemPath}.easing`, "unsupported easing");
          if (action.duration_intent !== void 0 && !["brief", "normal", "extended"].includes(String(action.duration_intent))) fail3("LESSON_PLAN_ANIMATION", `${itemPath}.duration_intent`, "unsupported duration intent");
          optionalTiming(action.timing, `${itemPath}.timing`);
        } else {
          fail3("LESSON_PLAN_ACTION", `${itemPath}.action`, "unsupported action");
        }
      });
      resolvedMoments.push({
        index: momentIndex,
        moment_id: `section-${pad3(sectionIndex)}-moment-${pad3(momentIndex)}`,
        board_item_ids: boardItemIds,
        connection_ids: connectionIds,
        group_ids: groupIds
      });
    });
    const resolvedReusable = declarations.map((declaration, declarationOffset) => {
      const slot = declarationOffset + 1;
      const target = assigned.get(slot);
      if (!target) fail3("LESSON_PLAN_REUSABLE_UNFILLED", `${path}.reusable_items[${declarationOffset}]`, "declared reusable item was not created");
      reusables.set(reusableKey(sectionIndex, slot), target);
      return { index: slot, target_id: target.id, target_kind: declaration.kind };
    });
    const activities = section.student_activities === void 0 ? [] : array(section.student_activities, `${path}.student_activities`);
    activities.forEach((entry, index) => {
      const activityPath = `${path}.student_activities[${index}]`;
      const activity = record2(entry, activityPath);
      if (activity.kind === "reflection") {
        allowedKeys(activity, ["kind", "prompt", "answer", "reference"], activityPath);
        nonEmptyString(activity.prompt, `${activityPath}.prompt`, 480);
        nonEmptyString(activity.answer, `${activityPath}.answer`, 960);
        const target = resolveReference(activity.reference, `${activityPath}.reference`, sectionIndex, rawMoments.length);
        if (target.kind !== "board_item") fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.reference`, "a thinking question must sit by a board card");
        return;
      }
      if (activity.kind === "number_target") {
        allowedKeys(activity, [
          "kind",
          "prompt",
          "number_controls",
          "expression",
          "value",
          "tolerance",
          "hints",
          "hint_after_attempts",
          "success_message"
        ], activityPath);
        const numberControls = array(activity.number_controls, `${activityPath}.number_controls`);
        if (numberControls.length === 0) fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.number_controls`, "number task requires at least one controllable number");
        const seenNumbers = /* @__PURE__ */ new Set();
        numberControls.forEach((entry2, controlIndex) => {
          const controlPath = `${activityPath}.number_controls[${controlIndex}]`;
          const control = record2(entry2, controlPath);
          allowedKeys(control, ["number", "controls"], controlPath);
          const number = positiveIndex(control.number, `${controlPath}.number`);
          requiredVisualNumberUses.push({ number, path: `${controlPath}.number` });
          if (number > rawNumbers.length) fail3("LESSON_PLAN_NUMBER_REFERENCE", `${controlPath}.number`, "number reference is unavailable");
          if (seenNumbers.has(number)) fail3("LESSON_PLAN_ACTIVITY", `${controlPath}.number`, "each number may appear only once in a task");
          seenNumbers.add(number);
          const controls = array(control.controls, `${controlPath}.controls`);
          if (controls.length === 0 || controls.some((item) => !["slider", "geometry_point"].includes(String(item)))) fail3("LESSON_PLAN_ACTIVITY", `${controlPath}.controls`, "unsupported number controls");
        });
        if (activity.expression !== void 0) validateMathExpression(activity.expression, `${activityPath}.expression`, rawNumbers.length);
        else if (numberControls.length !== 1) fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.expression`, "tasks with multiple numbers require an explicit expression");
        finiteNumber(activity.value, `${activityPath}.value`);
        if (finiteNumber(activity.tolerance, `${activityPath}.tolerance`) <= 0) fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.tolerance`, "tolerance must be positive");
      } else if (activity.kind === "scene3d_view") {
        allowedKeys(activity, [
          "kind",
          "reference",
          "prompt",
          "controls",
          "match",
          "yaw",
          "pitch",
          "zoom",
          "angular_tolerance",
          "zoom_tolerance",
          "hints",
          "hint_after_attempts",
          "success_message"
        ], activityPath);
        const target = resolveReference(activity.reference, `${activityPath}.reference`, sectionIndex, rawMoments.length);
        if (target.kind !== "board_item" || target.boardKind !== "visual" || !target.capability || !LESSON_PLAN_CAPABILITY_REGISTRY[target.capability].output_kinds.includes("scene3d")) {
          fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.reference`, "scene3d_view requires a 3D visual target");
        }
        const controls = array(activity.controls, `${activityPath}.controls`);
        if (controls.length === 0 || controls.some((item) => !["orbit", "zoom", "preset", "reset"].includes(String(item)))) fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.controls`, "unsupported scene controls");
        if (!["view_direction", "camera_pose"].includes(String(activity.match))) fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.match`, "unsupported 3D match mode");
        finiteNumber(activity.yaw, `${activityPath}.yaw`);
        const pitch = finiteNumber(activity.pitch, `${activityPath}.pitch`);
        if (pitch < -Math.PI / 2 || pitch > Math.PI / 2) fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.pitch`, "pitch is outside the supported range");
        const zoom = finiteNumber(activity.zoom, `${activityPath}.zoom`);
        if (zoom < 0.2 || zoom > 5) fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.zoom`, "zoom is outside the supported range");
        if (finiteNumber(activity.angular_tolerance, `${activityPath}.angular_tolerance`) <= 0) fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.angular_tolerance`, "angular tolerance must be positive");
        if (finiteNumber(activity.zoom_tolerance, `${activityPath}.zoom_tolerance`) <= 0) fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.zoom_tolerance`, "zoom tolerance must be positive");
      } else if (activity.kind === "numeric_answer") {
        allowedKeys(activity, [
          "kind",
          "prompt",
          "answer",
          "check",
          "unit",
          "simplest_fraction",
          "reference",
          "hints",
          "hint_after_attempts",
          "success_message"
        ], activityPath);
        const target = resolveReference(activity.reference, `${activityPath}.reference`, sectionIndex, rawMoments.length);
        if (target.kind !== "board_item") fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.reference`, "a typed question must sit by a board card");
        validateNumericAnswerActivity(activity, activityPath);
      } else {
        fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.kind`, "unsupported student activity");
      }
      nonEmptyString(activity.prompt, `${activityPath}.prompt`, 480);
      const hints = array(activity.hints, `${activityPath}.hints`);
      if (hints.length === 0) fail3("LESSON_PLAN_ACTIVITY", `${activityPath}.hints`, "activity requires hints");
      hints.forEach((hint, hintIndex) => nonEmptyString(hint, `${activityPath}.hints[${hintIndex}]`, 480));
      if (activity.hint_after_attempts !== void 0) positiveIndex(activity.hint_after_attempts, `${activityPath}.hint_after_attempts`);
      optionalString(activity.success_message, `${activityPath}.success_message`, 480);
    });
    resolvedSections.push({
      index: sectionIndex,
      section_id: `section-${pad3(sectionIndex)}`,
      moments: resolvedMoments,
      reusable_items: resolvedReusable
    });
  });
  const close = record2(root.close, "$lessonPlan.close");
  allowedKeys(close, ["summary", "focus"], "$lessonPlan.close");
  nonEmptyString(close.summary, "$lessonPlan.close.summary", 1200);
  const closeFocus = array(close.focus, "$lessonPlan.close.focus");
  if (closeFocus.length === 0) fail3("LESSON_PLAN_CLOSE", "$lessonPlan.close.focus", "close requires focus references");
  closeFocus.forEach((ref, index) => resolveReference(ref, `$lessonPlan.close.focus[${index}]`, rawSections.length + 1, 0));
  for (const use of requiredVisualNumberUses) {
    if (!visuallyBoundNumbers.has(use.number)) {
      fail3(
        "LESSON_PLAN_UNBOUND_NUMBER",
        use.path,
        `number ${use.number} is animated or assigned to a student task but does not drive any visual`
      );
    }
  }
  return {
    plan: structuredClone(value2),
    numbers: rawNumbers.map((_entry, index) => ({ index: index + 1, variable_id: `number_${pad3(index + 1)}` })),
    sections: resolvedSections,
    references
  };
}
function numericAnswerTolerance(answer, checked) {
  const expected = parseNumericAnswer(answer);
  if (!expected || !Number.isFinite(checked)) return void 0;
  const difference = Math.abs(checked - expected.value);
  if (difference === 0) return 0;
  if (expected.form !== "decimal") {
    return difference <= 1e-9 * Math.max(1, Math.abs(expected.value)) ? 0 : void 0;
  }
  const written = answer.trim().replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 65248)).replace(/[．。]/g, ".");
  const places = /\.(\d+)$/.exec(written)?.[1]?.length;
  if (!places) return void 0;
  const halfUnit = 0.5 * 10 ** -places;
  const gradingSlack = halfUnit * 1e-6;
  const roundoff = Math.min(gradingSlack, Number.EPSILON * Math.max(Math.abs(expected.value), Math.abs(checked)));
  if (difference <= roundoff) return 0;
  if (difference > halfUnit + roundoff) return void 0;
  return Math.max(difference, Number((halfUnit + gradingSlack).toPrecision(10)));
}
var ROUNDING_DIGITS = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  \u4E00: 1,
  \u4E8C: 2,
  \u4E24: 2,
  \u4E09: 3,
  \u56DB: 4,
  \u4E94: 5,
  \u516D: 6,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6
};
var ROUNDING_PLACE_NAMES = {
  \u4E2A\u4F4D: 0,
  \u6574\u6570: 0,
  \u5341\u5206\u4F4D: 1,
  \u767E\u5206\u4F4D: 2,
  \u5343\u5206\u4F4D: 3,
  "whole number": 0,
  integer: 0,
  one: 0,
  tenth: 1,
  hundredth: 2,
  thousandth: 3
};
function roundingPlaces(prompt, answer) {
  const text3 = prompt.replace(/\s+/gu, " ");
  if (/(?:不(?:用|要|必|需要?)|无需|别)\s*(?:四舍五入|取近似|保留)|\b(?:do not|don't|without|no need to) round/iu.test(text3)) return void 0;
  const chinesePlaces = /保留\s*([0-6一二两三四五六])\s*位小数/u.exec(text3);
  if (chinesePlaces) return ROUNDING_DIGITS[chinesePlaces[1]];
  const chineseNamed = /精确到\s*(个位|整数|十分位|百分位|千分位)/u.exec(text3);
  if (chineseNamed) return ROUNDING_PLACE_NAMES[chineseNamed[1]];
  const chineseUnit = /精确到\s*0?\.(0*)1(?![0-9])/u.exec(text3);
  if (chineseUnit) return chineseUnit[1].length + 1;
  if (/保留整数|取整数|(?:四舍五入|精确)(?:到|为|成)\s*(?:整数|个位)/u.test(text3)) return 0;
  const englishPlaces = /\b([0-6]|one|two|three|four|five|six)\s+decimal\s+places?\b/iu.exec(text3);
  if (englishPlaces) return ROUNDING_DIGITS[englishPlaces[1].toLowerCase()];
  const englishNamed = /\bnearest\s+(whole number|integer|one|tenth|hundredth|thousandth)s?\b/iu.exec(text3);
  if (englishNamed) return ROUNDING_PLACE_NAMES[englishNamed[1].toLowerCase()];
  const englishUnit = /\bnearest\s+0?\.(0*)1(?![0-9])/iu.exec(text3);
  if (englishUnit) return englishUnit[1].length + 1;
  if (/四舍五入|\bround(?:ed|ing)?\b/iu.test(text3)) {
    const written = answer.trim().replace(/[０-９]/gu, (digit) => String.fromCharCode(digit.charCodeAt(0) - 65248)).replace(/[．。]/gu, ".");
    return /\.(\d+)$/u.exec(written)?.[1]?.length ?? 0;
  }
  return void 0;
}
function roundingTolerance(prompt, answer) {
  const places = roundingPlaces(prompt, answer);
  if (places === void 0) return void 0;
  const halfUnit = 0.5 * 10 ** -places;
  return Number((halfUnit + halfUnit * 1e-6).toPrecision(10));
}
function validateTypedQuestion(activity, path) {
  allowedKeys(activity, [
    "kind",
    "prompt",
    "answer",
    "check",
    "unit",
    "simplest_fraction",
    "reference",
    "hints",
    "hint_after_attempts",
    "success_message"
  ], path);
  validateNumericAnswerActivity(activity, path);
  nonEmptyString(activity.prompt, `${path}.prompt`, 480);
  const hints = array(activity.hints, `${path}.hints`);
  if (hints.length === 0) fail3("LESSON_PLAN_ACTIVITY", `${path}.hints`, "activity requires hints");
  hints.forEach((hint, hintIndex) => nonEmptyString(hint, `${path}.hints[${hintIndex}]`, 480));
  if (activity.hint_after_attempts !== void 0) positiveIndex(activity.hint_after_attempts, `${path}.hint_after_attempts`);
  optionalString(activity.success_message, `${path}.success_message`, 480);
}
function validateNumericAnswerActivity(activity, path) {
  nonEmptyString(activity.answer, `${path}.answer`, 64);
  const expected = parseNumericAnswer(activity.answer);
  if (!expected) fail3("LESSON_PLAN_ACTIVITY", `${path}.answer`, "answer must be a whole number, decimal, fraction or mixed number");
  nonEmptyString(activity.check, `${path}.check`, 256);
  let checked;
  try {
    checked = compileMathExpression(activity.check, [])({});
  } catch (error) {
    fail3("LESSON_PLAN_ACTIVITY", `${path}.check`, `check must be arithmetic on numbers only: ${error.message}`);
  }
  if (numericAnswerTolerance(activity.answer, checked) === void 0) {
    fail3("LESSON_PLAN_ACTIVITY", `${path}.answer`, `answer ${String(activity.answer)} does not equal its check ${String(activity.check)}`);
  }
  optionalString(activity.unit, `${path}.unit`, 16);
  if (activity.simplest_fraction !== void 0 && typeof activity.simplest_fraction !== "boolean") {
    fail3("LESSON_PLAN_ACTIVITY", `${path}.simplest_fraction`, "expected a boolean");
  }
  if (activity.simplest_fraction && !isSimplestFraction(expected)) {
    fail3("LESSON_PLAN_ACTIVITY", `${path}.answer`, "a simplest-fraction answer must itself be in lowest terms");
  }
}
function validateLessonPlan(value2, options = {}) {
  return resolveLessonPlan(value2, options).plan;
}
function validateLessonPlanOutline(value2, expectedRequestParts = 0) {
  const outline = record2(value2, "$lessonPlanOutline");
  allowedKeys(outline, ["version", "title", "goals", "teaching_strategies", "numbers", "request_coverage", "course_visuals", "sections", "close"], "$lessonPlanOutline");
  if (expectedRequestParts > 0 && outline.course_visuals === void 0) {
    fail3(
      "LESSON_PLAN_COURSE_VISUAL",
      "$lessonPlanOutline.course_visuals",
      "a model-authored outline must explicitly declare its course visuals, or an empty list for a text-only course"
    );
  }
  if (outline.version !== LESSON_PLAN_VERSION) {
    fail3("LESSON_PLAN_VERSION", "$lessonPlanOutline.version", `expected '${LESSON_PLAN_VERSION}'`);
  }
  nonEmptyString(outline.title, "$lessonPlanOutline.title", 160);
  const goals = array(outline.goals, "$lessonPlanOutline.goals");
  if (goals.length < 1 || goals.length > 8) fail3("LESSON_PLAN_GOALS", "$lessonPlanOutline.goals", "expected 1 to 8 goals");
  goals.forEach((goal, index) => nonEmptyString(goal, `$lessonPlanOutline.goals[${index}]`, 480));
  if (outline.teaching_strategies !== void 0) {
    const strategies = array(outline.teaching_strategies, "$lessonPlanOutline.teaching_strategies");
    if (strategies.length > 16) fail3("LESSON_PLAN_STRATEGIES", "$lessonPlanOutline.teaching_strategies", "expected at most 16 strategies");
    strategies.forEach((strategy, index) => nonEmptyString(strategy, `$lessonPlanOutline.teaching_strategies[${index}]`, 240));
  }
  const numbers = validateLessonPlanNumbers(outline.numbers, "$lessonPlanOutline.numbers");
  const sections = array(outline.sections, "$lessonPlanOutline.sections");
  if (sections.length < 1 || sections.length > 24) fail3("LESSON_PLAN_SECTIONS", "$lessonPlanOutline.sections", "expected 1 to 24 sections");
  const declarationsBySection = [];
  sections.forEach((entry, index) => {
    const path = `$lessonPlanOutline.sections[${index}]`;
    const section = record2(entry, path);
    allowedKeys(section, ["purpose", "allowed_capabilities", "reusable_items"], path);
    nonEmptyString(section.purpose, `${path}.purpose`, 480);
    const allowedCapabilities = array(section.allowed_capabilities, `${path}.allowed_capabilities`);
    const seenCapabilities = /* @__PURE__ */ new Set();
    allowedCapabilities.forEach((item, capabilityIndex) => {
      const value3 = capability(item, `${path}.allowed_capabilities[${capabilityIndex}]`);
      if (seenCapabilities.has(value3)) fail3("LESSON_PLAN_CAPABILITY", `${path}.allowed_capabilities[${capabilityIndex}]`, "capability is duplicated");
      seenCapabilities.add(value3);
    });
    const declarations = section.reusable_items === void 0 ? [] : array(section.reusable_items, `${path}.reusable_items`);
    if (declarations.length > 32) fail3("LESSON_PLAN_REUSABLE", `${path}.reusable_items`, "expected at most 32 reusable items");
    declarationsBySection.push(declarations.map((declarationValue, declarationIndex) => {
      const declarationPath = `${path}.reusable_items[${declarationIndex}]`;
      const declaration = record2(declarationValue, declarationPath);
      allowedKeys(declaration, ["kind", "board_kind", "capability"], declarationPath);
      if (!["board_item", "connection", "group"].includes(String(declaration.kind))) fail3("LESSON_PLAN_REUSABLE", `${declarationPath}.kind`, "unsupported reusable item kind");
      if (declaration.kind === "board_item") {
        if (typeof declaration.board_kind !== "string" || !boardKinds.has(declaration.board_kind)) fail3("LESSON_PLAN_REUSABLE", `${declarationPath}.board_kind`, "board_item requires a supported board_kind");
        if (declaration.board_kind === "visual") {
          const declaredCapability = capability(declaration.capability, `${declarationPath}.capability`);
          if (!seenCapabilities.has(declaredCapability)) fail3("LESSON_PLAN_CAPABILITY", `${declarationPath}.capability`, "reusable capability is not allowed for this section");
        } else if (declaration.capability !== void 0) {
          fail3("LESSON_PLAN_REUSABLE", `${declarationPath}.capability`, "only visual board items declare a capability");
        }
      } else if (declaration.board_kind !== void 0 || declaration.capability !== void 0) {
        fail3("LESSON_PLAN_REUSABLE", declarationPath, "connection and group declarations do not use board_kind or capability");
      }
      return declaration;
    }));
  });
  const courseVisuals = outline.course_visuals === void 0 ? [] : array(outline.course_visuals, "$lessonPlanOutline.course_visuals");
  if (courseVisuals.length > 32) {
    fail3("LESSON_PLAN_COURSE_VISUAL", "$lessonPlanOutline.course_visuals", "expected at most 32 course visuals");
  }
  const firstVisualByCapability = /* @__PURE__ */ new Map();
  courseVisuals.forEach((entry, index) => {
    const path = `$lessonPlanOutline.course_visuals[${index}]`;
    const visual = record2(entry, path);
    allowedKeys(visual, ["capability", "create_section", "use_sections", "relation", "related_visual", "reusable_item"], path);
    const visualCapability = capability(visual.capability, `${path}.capability`);
    const createSection = positiveIndex(visual.create_section, `${path}.create_section`);
    if (createSection > sections.length) fail3("LESSON_PLAN_COURSE_VISUAL", `${path}.create_section`, "creation section is unavailable");
    const reusableItem = positiveIndex(visual.reusable_item, `${path}.reusable_item`);
    const declaration = declarationsBySection[createSection - 1]?.[reusableItem - 1];
    if (declaration?.kind !== "board_item" || declaration.board_kind !== "visual" || declaration.capability !== visualCapability) {
      fail3("LESSON_PLAN_COURSE_VISUAL", `${path}.reusable_item`, "course visual must map to a matching visual reusable item");
    }
    const uses = array(visual.use_sections, `${path}.use_sections`);
    const seenUses = /* @__PURE__ */ new Set();
    uses.forEach((sectionValue, useIndex) => {
      const section = positiveIndex(sectionValue, `${path}.use_sections[${useIndex}]`);
      if (section < createSection || section > sections.length) {
        fail3("LESSON_PLAN_COURSE_VISUAL", `${path}.use_sections[${useIndex}]`, "a visual can only be used from its creation section onward");
      }
      if (seenUses.has(section)) fail3("LESSON_PLAN_COURSE_VISUAL", `${path}.use_sections[${useIndex}]`, "use section is duplicated");
      seenUses.add(section);
    });
    if (!seenUses.has(createSection)) fail3("LESSON_PLAN_COURSE_VISUAL", `${path}.use_sections`, "use sections must include the creation section");
    if (!["primary", "supporting", "comparison"].includes(String(visual.relation))) {
      fail3("LESSON_PLAN_COURSE_VISUAL", `${path}.relation`, "unsupported visual relation");
    }
    const firstPosition = firstVisualByCapability.get(visualCapability);
    if (firstPosition !== void 0 && visual.relation !== "comparison") {
      fail3(
        "LESSON_PLAN_COURSE_VISUAL",
        path,
        `capability '${visualCapability}' already has course visual ${firstPosition}; reuse it or declare an explicit comparison`
      );
    }
    if (firstPosition === void 0) firstVisualByCapability.set(visualCapability, index + 1);
    if (visual.related_visual !== void 0) {
      const related = positiveIndex(visual.related_visual, `${path}.related_visual`);
      if (related >= index + 1) {
        fail3("LESSON_PLAN_COURSE_VISUAL", `${path}.related_visual`, "a related visual must be an earlier course visual");
      }
    } else if (visual.relation !== "primary") {
      fail3("LESSON_PLAN_COURSE_VISUAL", `${path}.related_visual`, "supporting and comparison visuals require a related visual position");
    }
  });
  if (expectedRequestParts > 0 || outline.request_coverage !== void 0) {
    const coverage = array(outline.request_coverage, "$lessonPlanOutline.request_coverage");
    if (expectedRequestParts > 0 && coverage.length !== expectedRequestParts) {
      fail3("LESSON_PLAN_REQUEST_COVERAGE", "$lessonPlanOutline.request_coverage", `expected exactly ${expectedRequestParts} request coverage entries`);
    }
    const seen = /* @__PURE__ */ new Set();
    coverage.forEach((entry, index) => {
      const path = `$lessonPlanOutline.request_coverage[${index}]`;
      const item = record2(entry, path);
      allowedKeys(item, ["request_part", "treatment", "sections", "reason"], path);
      const requestPart = positiveIndex(item.request_part, `${path}.request_part`);
      if (expectedRequestParts > 0 && requestPart > expectedRequestParts) fail3("LESSON_PLAN_REQUEST_COVERAGE", `${path}.request_part`, "request part is unavailable");
      if (seen.has(requestPart)) fail3("LESSON_PLAN_REQUEST_COVERAGE", `${path}.request_part`, "request part is duplicated");
      seen.add(requestPart);
      if (item.treatment !== "teach" && item.treatment !== "unsupported") fail3("LESSON_PLAN_REQUEST_COVERAGE", `${path}.treatment`, "unsupported treatment");
      const coveredSections = array(item.sections, `${path}.sections`);
      const seenSections = /* @__PURE__ */ new Set();
      coveredSections.forEach((sectionValue, sectionIndex) => {
        const section = positiveIndex(sectionValue, `${path}.sections[${sectionIndex}]`);
        if (section > sections.length) fail3("LESSON_PLAN_REQUEST_COVERAGE", `${path}.sections[${sectionIndex}]`, "section is unavailable");
        if (seenSections.has(section)) fail3("LESSON_PLAN_REQUEST_COVERAGE", `${path}.sections[${sectionIndex}]`, "section is duplicated");
        seenSections.add(section);
      });
      if (item.treatment === "teach") {
        if (coveredSections.length === 0) fail3("LESSON_PLAN_REQUEST_COVERAGE", `${path}.sections`, "a taught request part must map to at least one section");
        if (item.reason !== void 0) nonEmptyString(item.reason, `${path}.reason`, 480);
      } else {
        if (coveredSections.length !== 0) fail3("LESSON_PLAN_REQUEST_COVERAGE", `${path}.sections`, "an unsupported request part cannot map to a lesson section");
        nonEmptyString(item.reason, `${path}.reason`, 480);
      }
    });
    if (expectedRequestParts > 0) {
      for (let requestPart = 1; requestPart <= expectedRequestParts; requestPart += 1) {
        if (!seen.has(requestPart)) fail3("LESSON_PLAN_REQUEST_COVERAGE", "$lessonPlanOutline.request_coverage", `request part ${requestPart} is missing`);
      }
    }
  }
  const close = record2(outline.close, "$lessonPlanOutline.close");
  allowedKeys(close, ["summary", "focus"], "$lessonPlanOutline.close");
  nonEmptyString(close.summary, "$lessonPlanOutline.close.summary", 1200);
  const closeFocus = array(close.focus, "$lessonPlanOutline.close.focus");
  if (closeFocus.length === 0) fail3("LESSON_PLAN_CLOSE", "$lessonPlanOutline.close.focus", "close requires focus references");
  closeFocus.forEach((value3, index) => {
    const path = `$lessonPlanOutline.close.focus[${index}]`;
    const reference = validateReference(value3, path);
    if (reference.source !== "reusable" && reference.source !== "host") {
      fail3("LESSON_PLAN_OUTLINE_REFERENCE", `${path}.source`, "the outline can only focus a declared reusable item or a host reference");
    }
    if (reference.source === "reusable") {
      if (reference.section > sections.length) fail3("LESSON_PLAN_REFERENCE", `${path}.section`, "reusable section is unavailable");
      const declaration = declarationsBySection[reference.section - 1]?.[reference.item - 1];
      if (!declaration) fail3("LESSON_PLAN_REFERENCE", `${path}.item`, "reusable item is not declared");
      if (reference.part?.kind === "capability") {
        if (!declaration.capability) fail3("LESSON_PLAN_PART", `${path}.part`, "capability part requires a visual reusable item");
        const roles = LESSON_PLAN_CAPABILITIES[declaration.capability];
        if (!roles.includes(reference.part.role)) fail3("LESSON_PLAN_PART", `${path}.part.role`, "capability part is unavailable");
      } else if (reference.part) {
        fail3("LESSON_PLAN_PART", `${path}.part`, "index parts are only available on host references");
      }
    }
  });
  return structuredClone(value2);
}
function assembleLessonPlan(outlineValue, draftValues, options = {}) {
  const outline = record2(validateLessonPlanOutline(outlineValue), "$lessonPlanOutline");
  allowedKeys(outline, ["version", "title", "goals", "teaching_strategies", "numbers", "request_coverage", "course_visuals", "sections", "close"], "$lessonPlanOutline");
  if (outline.version !== LESSON_PLAN_VERSION) {
    fail3("LESSON_PLAN_VERSION", "$lessonPlanOutline.version", `expected '${LESSON_PLAN_VERSION}'`);
  }
  nonEmptyString(outline.title, "$lessonPlanOutline.title", 160);
  const goals = array(outline.goals, "$lessonPlanOutline.goals");
  const sections = array(outline.sections, "$lessonPlanOutline.sections");
  if (sections.length < 1 || sections.length > 24) {
    fail3("LESSON_PLAN_SECTIONS", "$lessonPlanOutline.sections", "expected 1 to 24 sections");
  }
  sections.forEach((entry, index) => {
    const path = `$lessonPlanOutline.sections[${index}]`;
    const section = record2(entry, path);
    allowedKeys(section, ["purpose", "allowed_capabilities", "reusable_items"], path);
    nonEmptyString(section.purpose, `${path}.purpose`, 480);
    const allowedCapabilities = array(section.allowed_capabilities, `${path}.allowed_capabilities`);
    const seenCapabilities = /* @__PURE__ */ new Set();
    allowedCapabilities.forEach((item, capabilityIndex) => {
      const value2 = capability(item, `${path}.allowed_capabilities[${capabilityIndex}]`);
      if (seenCapabilities.has(value2)) fail3("LESSON_PLAN_CAPABILITY", `${path}.allowed_capabilities[${capabilityIndex}]`, "capability is duplicated");
      seenCapabilities.add(value2);
    });
    if (section.reusable_items !== void 0) {
      array(section.reusable_items, `${path}.reusable_items`).forEach((entry2, reusableIndex) => {
        const declaration = record2(entry2, `${path}.reusable_items[${reusableIndex}]`);
        if (declaration.capability !== void 0) {
          const value2 = capability(declaration.capability, `${path}.reusable_items[${reusableIndex}].capability`);
          if (!seenCapabilities.has(value2)) fail3("LESSON_PLAN_CAPABILITY", `${path}.reusable_items[${reusableIndex}].capability`, "reusable capability is not allowed for this section");
        }
      });
    }
  });
  const close = record2(outline.close, "$lessonPlanOutline.close");
  allowedKeys(close, ["summary", "focus"], "$lessonPlanOutline.close");
  nonEmptyString(close.summary, "$lessonPlanOutline.close.summary", 1200);
  const outlineFocus = array(close.focus, "$lessonPlanOutline.close.focus");
  if (outlineFocus.length === 0) fail3("LESSON_PLAN_CLOSE", "$lessonPlanOutline.close.focus", "close requires focus references");
  outlineFocus.forEach((value2, index) => {
    const reference = validateReference(value2, `$lessonPlanOutline.close.focus[${index}]`);
    if (reference.source !== "reusable" && reference.source !== "host") {
      fail3(
        "LESSON_PLAN_OUTLINE_REFERENCE",
        `$lessonPlanOutline.close.focus[${index}].source`,
        "the outline can only focus a declared reusable item or a host reference"
      );
    }
  });
  const drafts = array(draftValues, "$lessonPlanSectionDrafts");
  if (drafts.length !== sections.length) {
    fail3("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanSectionDrafts", "expected exactly one draft for every outline section");
  }
  const bySection = /* @__PURE__ */ new Map();
  drafts.forEach((entry, index) => {
    const path = `$lessonPlanSectionDrafts[${index}]`;
    const draft = record2(entry, path);
    allowedKeys(draft, ["version", "section", "moments", "student_activities"], path);
    if (draft.version !== LESSON_PLAN_VERSION) fail3("LESSON_PLAN_VERSION", `${path}.version`, `expected '${LESSON_PLAN_VERSION}'`);
    const section = positiveIndex(draft.section, `${path}.section`);
    if (section > sections.length) fail3("LESSON_PLAN_SECTION_DRAFTS", `${path}.section`, "section is outside the outline");
    if (bySection.has(section)) fail3("LESSON_PLAN_SECTION_DRAFTS", `${path}.section`, "section draft is duplicated");
    array(draft.moments, `${path}.moments`);
    if (draft.student_activities !== void 0) array(draft.student_activities, `${path}.student_activities`);
    const outlineSection = sections[section - 1];
    const allowedCapabilities = new Set(array(outlineSection.allowed_capabilities, `$lessonPlanOutline.sections[${section - 1}].allowed_capabilities`));
    array(draft.moments, `${path}.moments`).forEach((momentValue, momentIndex) => {
      const moment = record2(momentValue, `${path}.moments[${momentIndex}]`);
      array(moment.actions, `${path}.moments[${momentIndex}].actions`).forEach((actionValue, actionIndex) => {
        const action = record2(actionValue, `${path}.moments[${momentIndex}].actions[${actionIndex}]`);
        if (action.action !== "create" || action.kind !== "visual") return;
        const content = record2(action.content, `${path}.moments[${momentIndex}].actions[${actionIndex}].content`);
        if (!allowedCapabilities.has(content.capability)) {
          fail3("LESSON_PLAN_CAPABILITY", `${path}.moments[${momentIndex}].actions[${actionIndex}].content.capability`, "visual capability is not allowed by the course outline");
        }
      });
    });
    bySection.set(section, draft);
  });
  const assembled = {
    version: outline.version,
    title: outline.title,
    goals: structuredClone(goals),
    ...outline.teaching_strategies === void 0 ? {} : { teaching_strategies: structuredClone(outline.teaching_strategies) },
    ...outline.numbers === void 0 ? {} : { numbers: structuredClone(outline.numbers) },
    sections: sections.map((entry, index) => {
      const section = entry;
      const draft = bySection.get(index + 1);
      if (!draft) fail3("LESSON_PLAN_SECTION_DRAFTS", `$lessonPlanSectionDrafts`, `section ${index + 1} is missing`);
      return {
        purpose: section.purpose,
        ...section.reusable_items === void 0 ? {} : { reusable_items: structuredClone(section.reusable_items) },
        moments: structuredClone(draft.moments),
        ...draft.student_activities === void 0 ? {} : { student_activities: structuredClone(draft.student_activities) }
      };
    }),
    close: structuredClone(close)
  };
  return resolveLessonPlan(assembled, options).plan;
}

// src/compiled-visual-reuse.ts
function cardIdentity(kind, content) {
  const fragments = /* @__PURE__ */ new Map();
  const collect = (value2) => {
    if (Array.isArray(value2)) {
      value2.forEach(collect);
      return;
    }
    if (!value2 || typeof value2 !== "object") return;
    const record3 = value2;
    if (typeof record3.as === "string" && !fragments.has(record3.as)) fragments.set(record3.as, `part-${fragments.size}`);
    Object.values(record3).forEach(collect);
  };
  collect(content);
  const localReference = (value2) => {
    const [head, ...tail] = value2.split(".");
    return [fragments.get(head) ?? head, ...tail].join(".");
  };
  const normalize2 = (value2, key = "", path = "") => {
    if (typeof value2 === "string") {
      if (key === "expression") return value2.replace(/\s+/gu, "");
      if (["as", "target", "from", "to", "center"].includes(key)) return localReference(value2);
      if (kind === "plot" && path.startsWith("axes.") && key === "label" && ["x", "y", "\u03B8"].includes(value2)) return "coordinate";
      return value2;
    }
    if (Array.isArray(value2)) return value2.map((child) => normalize2(child, key, path));
    if (!value2 || typeof value2 !== "object") return value2;
    return Object.fromEntries(Object.entries(value2).filter(([name]) => {
      if (!path && name === "title") return false;
      if (kind === "plot") {
        if (path.startsWith("axes.") && ["min", "max", "ticks"].includes(name)) return false;
        if (path === "axes" && ["equal_scale", "layout", "follow_samples"].includes(name)) return false;
        if (path === "curves" && name === "holes") return false;
        if ((path === "curves" || path === "points") && ["label", "color"].includes(name)) return false;
      }
      return true;
    }).sort(([a], [b]) => a.localeCompare(b)).map(([name, child]) => [name, normalize2(child, name, path ? `${path}.${name}` : name)]));
  };
  return { identity: JSON.stringify([kind, normalize2(content)]), fragments };
}
var CompiledVisualRegistry = class {
  cards = /* @__PURE__ */ new Map();
  reuse(visual) {
    if (this.cards.size === 0) {
      for (const action of visual.actions) {
        if (action.do !== "write" || !["plot", "geometry", "scene3d", "diagram"].includes(action.kind)) continue;
        const cards = this.cards.get(action.kind) ?? [];
        cards.push({ node: action.as, content: action.content });
        this.cards.set(action.kind, cards);
      }
      return visual;
    }
    const aliases = /* @__PURE__ */ new Map();
    const reused = /* @__PURE__ */ new Set();
    const pending = [];
    for (const action of visual.actions) {
      if (action.do !== "write" || !["plot", "geometry", "scene3d", "diagram"].includes(action.kind)) continue;
      const priorCards = this.cards.get(action.kind) ?? [];
      const content = action.content;
      const signature = priorCards.length ? cardIdentity(action.kind, content) : void 0;
      const existing = signature ? priorCards.find((card) => {
        card.signature ??= cardIdentity(action.kind, card.content);
        return card.signature.identity === signature.identity;
      }) : void 0;
      if (existing && signature) {
        reused.add(action.as);
        aliases.set(action.as, existing.node);
        const oldFragments = new Map([...existing.signature.fragments].map(([name, canonical]) => [canonical, name]));
        for (const [name, canonical] of signature.fragments) aliases.set(`${action.as}#${name}`, `${existing.node}#${oldFragments.get(canonical)}`);
      } else pending.push([action.kind, { node: action.as, content, signature }]);
    }
    for (const [kind, card] of pending) {
      const cards = this.cards.get(kind) ?? [];
      cards.push(card);
      this.cards.set(kind, cards);
    }
    if (!reused.size) return visual;
    const reference = (value2) => aliases.get(value2) ?? value2;
    const remap = (value2, key = "") => {
      if (typeof value2 === "string") return ["target", "targets", "from", "to", "anchor", "members"].includes(key) ? reference(value2) : value2;
      if (Array.isArray(value2)) return value2.map((child) => remap(child, key));
      if (!value2 || typeof value2 !== "object") return value2;
      return Object.fromEntries(Object.entries(value2).map(([name, child]) => [name, remap(child, name)]));
    };
    return {
      actions: visual.actions.map((action) => action.do === "write" && reused.has(action.as) ? { do: "focus", targets: [reference(action.as)], intent: "\u7EE7\u7EED\u89C2\u5BDF\u5DF2\u6709\u7684\u540C\u4E00\u753B\u9762" } : remap(action)),
      whole: reference(visual.whole),
      ...visual.primaryScene ? { primaryScene: reference(visual.primaryScene) } : {},
      parts: new Map([...visual.parts].map(([name, target]) => [name, reference(target)]))
    };
  }
};

// src/plot-view-planner.ts
var WEIGHT = { extremum: 3, root: 2, pole: 2, intersection: 2, hole: 1, intercept: 1, edge: 1 };
var SCAN_HALF_WIDTH = 60;
var SCAN_STEP = 0.05;
var FEATURE_RADIUS = 25;
var CLUSTER_GAP = 10;
var MIN_SPAN = 8;
var MAX_FEATURES = 9;
var FEATURE_Y_MARGIN = 0.5;
var EDGE_INSET = 0.08;
var EXTREME_ALLOWANCE = 1.5;
var EQUAL_ASPECT = { min: 0.5, max: 2 };
function finite(value2) {
  return Number.isFinite(value2) && Math.abs(value2) < 1e12;
}
function span(range) {
  return range.max - range.min;
}
function hull(values) {
  const list2 = values.filter(Number.isFinite);
  return list2.length ? { min: Math.min(...list2), max: Math.max(...list2) } : void 0;
}
function union(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) };
}
function niceStep(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  return ([1, 2, 2.5, 5, 10].find((value2) => normalized <= value2 + 1e-9) ?? 10) * power;
}
function snap(range, unit = 1) {
  const step = unit === 1 ? niceStep(span(range) / 20) : unit * Math.max(1, Math.round(span(range) / unit / 8));
  const round = (value2) => Number(value2.toPrecision(12));
  return { min: round(Math.floor(range.min / step + 1e-9) * step), max: round(Math.ceil(range.max / step - 1e-9) * step) };
}
function pad4(range, fraction, keep) {
  const size = span(range) > 1e-9 ? span(range) : Math.max(1, Math.abs(range.min) * 0.2);
  const amount = size * fraction / (1 - 2 * fraction);
  return { min: keep?.min ? range.min : range.min - amount, max: keep?.max ? range.max : range.max + amount };
}
function affineArgument(argument, variables) {
  const names = Object.keys(variables);
  const source = argument.replace(/\b[A-Za-z_]\w*\b/gu, (name) => {
    const index = names.indexOf(name);
    return index < 0 ? name : `n${index + 1}`;
  });
  const stack = [];
  try {
    for (const token of parseModelFormula(source, names.length, "$viewport")) {
      if (token.kind === "input") stack.push({ slope: 1, offset: 0 });
      else if (token.kind === "literal") stack.push({ slope: 0, offset: token.value });
      else if (token.kind === "number") stack.push({ slope: 0, offset: variables[names[token.number - 1]] });
      else if (token.kind === "constant") stack.push({ slope: 0, offset: token.name === "pi" ? Math.PI : Math.E });
      else if (token.kind === "negate") {
        const operand = stack.pop();
        stack.push({ slope: -operand.slope, offset: -operand.offset });
      } else if (token.kind === "operator") {
        const right = stack.pop(), left = stack.pop();
        if (token.operator === "add" || token.operator === "subtract") {
          const sign = token.operator === "add" ? 1 : -1;
          stack.push({ slope: left.slope + sign * right.slope, offset: left.offset + sign * right.offset });
        } else if (token.operator === "multiply" && !(left.slope && right.slope)) {
          stack.push({ slope: left.slope * right.offset + right.slope * left.offset, offset: left.offset * right.offset });
        } else if (token.operator === "divide" && right.slope === 0 && right.offset !== 0) {
          stack.push({ slope: left.slope / right.offset, offset: left.offset / right.offset });
        } else return;
      } else return;
    }
  } catch {
    return;
  }
  const result = stack[0];
  if (stack.length === 1 && result && Number.isFinite(result.offset) && Number.isFinite(result.slope) && Math.abs(result.slope) >= 1e-9) return result;
}
function periodOf(expression, state) {
  const calls = [...expression.matchAll(/\b(sin|cos|tan)\s*\(/gu)];
  if (!calls.length) return;
  const periods = [];
  let rest = "";
  let cursor = 0;
  for (const match of calls) {
    if (match.index < cursor) return;
    const start = match.index + match[0].length;
    let end = start, depth = 1;
    for (; end < expression.length; end += 1) {
      if (expression[end] === "(") depth += 1;
      if (expression[end] === ")" && --depth === 0) break;
    }
    const affine = affineArgument(expression.slice(start, end), state);
    if (!affine) return;
    periods.push((match[1] === "tan" ? Math.PI : 2 * Math.PI) / Math.abs(affine.slope));
    rest += `${expression.slice(cursor, match.index)}1`;
    cursor = end + 1;
  }
  rest += expression.slice(cursor);
  if (/\bx\b/u.test(rest)) return;
  return Math.max(...periods);
}
function quadraticOf(curve) {
  const y0 = curve(0), y1 = curve(1), ym = curve(-1);
  const a = (y1 + ym - 2 * y0) / 2, b = (y1 - ym) / 2;
  if (![a, b, y0].every(Number.isFinite) || Math.abs(a) < 1e-12) return;
  for (const x of [-2, 0.37, 2, 3, -5.5, 7]) {
    const expected = a * x * x + b * x + y0, actual = curve(x);
    if (!Number.isFinite(actual) || Math.abs(expected - actual) > 1e-8 * Math.max(1, Math.abs(expected))) return;
  }
  const vertex = -b / (2 * a);
  return { vertex, value: curve(vertex), a };
}
function linearSlopeOf(curve) {
  const y0 = curve(0), y1 = curve(1);
  const slope = y1 - y0;
  if (![y0, y1].every(Number.isFinite)) return;
  for (const x of [-3, 2.5, 7]) {
    if (Math.abs(curve(x) - (y0 + slope * x)) > 1e-9 * Math.max(1, Math.abs(y0 + slope * x))) return;
  }
  return slope;
}
function isCircularArc(curve, scan) {
  const xs = Array.from({ length: 41 }, (_, index) => scan.min + span(scan) * index / 40).filter((x) => finite(curve(x)));
  if (xs.length < 6) return false;
  const points = xs.map((x) => ({ x, y: curve(x) }));
  const [p, q, r] = [points[0], points[Math.floor(points.length / 2)], points.at(-1)];
  const d = 2 * (p.x * (q.y - r.y) + q.x * (r.y - p.y) + r.x * (p.y - q.y));
  if (Math.abs(d) < 1e-9) return false;
  const s = (pt) => pt.x * pt.x + pt.y * pt.y;
  const cx = (s(p) * (q.y - r.y) + s(q) * (r.y - p.y) + s(r) * (p.y - q.y)) / d;
  const cy = (s(p) * (r.x - q.x) + s(q) * (p.x - r.x) + s(r) * (q.x - p.x)) / d;
  const radius = Math.hypot(p.x - cx, p.y - cy);
  return radius <= 10 * span(scan) && points.every((pt) => Math.abs(Math.hypot(pt.x - cx, pt.y - cy) - radius) < 1e-9 * Math.max(1, radius));
}
function bisect(f, inside, outside) {
  let a = inside, b = outside;
  for (let index = 0; index < 50; index += 1) {
    const mid = (a + b) / 2;
    if (f(mid)) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}
function analyse(curve, scan) {
  const count = Math.round(span(scan) / SCAN_STEP);
  const xs = Array.from({ length: count + 1 }, (_, index) => scan.min + span(scan) * index / count);
  const ys = xs.map(curve);
  const features = [];
  const magnitudes = ys.filter(finite).map(Math.abs).sort((a, b) => a - b);
  const typical = Math.max(1, magnitudes[Math.floor(magnitudes.length / 2)] ?? 1);
  const known = (x) => features.some((feature) => Math.abs(feature.x - x) < SCAN_STEP);
  const poleAt = (x0) => {
    let previous = 0;
    let growing = 0;
    for (const step of [0.01, 1e-3, 1e-4, 1e-5]) {
      const value2 = Math.max(Math.abs(curve(x0 - step)) || 0, Math.abs(curve(x0 + step)) || 0);
      if (!Number.isFinite(value2)) return true;
      if (value2 > previous * 1.5) growing += 1;
      previous = value2;
    }
    return growing >= 3 && previous > 1e3 * typical;
  };
  const holeAt = (x0) => {
    if (finite(curve(x0))) return;
    const left = curve(x0 - 1e-7), right = curve(x0 + 1e-7);
    if (finite(left) && finite(right) && Math.abs(left - right) < 1e-4 * Math.max(1, Math.abs(left))) return { x: x0, y: (left + right) / 2 };
  };
  for (let x = Math.ceil(scan.min * 2) / 2; x <= scan.max; x += 0.5) {
    const at = Number(x.toFixed(6));
    const hole = holeAt(at);
    if (hole) features.push({ kind: "hole", ...hole });
    else if (!finite(curve(at)) && finite(curve(at - 0.01)) && finite(curve(at + 0.01)) && poleAt(at)) features.push({ kind: "pole", x: at });
  }
  for (let index = 1; index < xs.length; index += 1) {
    const [x0, x1, y0, y1] = [xs[index - 1], xs[index], ys[index - 1], ys[index]];
    if (finite(y0) !== finite(y1)) {
      const before = ys.slice(Math.max(0, index - 4), index), after = ys.slice(index, index + 4);
      if (before.every((v) => finite(v) === finite(y0)) && after.every((v) => finite(v) === finite(y1))) {
        const inside = finite(y0) ? x0 : x1, outside = finite(y0) ? x1 : x0;
        const edge = bisect((x) => finite(curve(x)), inside, outside);
        if (!known(edge)) {
          const direction = inside > outside ? 1 : -1;
          const near2 = curve(edge + direction * 1e-9), farther = curve(edge + direction * 1e-6);
          const bounded = finite(near2) && finite(farther) && Math.abs(near2 - farther) <= 0.05 * Math.max(1, Math.abs(farther));
          features.push({ kind: "edge", x: edge, ...bounded ? { y: near2 } : {} });
        }
      }
      continue;
    }
    if (!finite(y0) || !finite(y1)) continue;
    if (y0 === 0) {
      if (!known(x0)) features.push({ kind: "root", x: x0, y: 0 });
    } else if (Math.sign(y0) * Math.sign(y1) < 0) {
      let a = x0, b = x1, fa = y0;
      for (let step = 0; step < 60; step += 1) {
        const mid = (a + b) / 2, fm = curve(mid);
        if (!Number.isFinite(fm)) break;
        if (Math.sign(fm) === Math.sign(fa)) {
          a = mid;
          fa = fm;
        } else b = mid;
      }
      const root = (a + b) / 2;
      if (!known(root)) {
        if (Math.abs(curve(root)) < 1e-6 * typical) features.push({ kind: "root", x: root, y: 0 });
        else if (poleAt(root)) features.push({ kind: "pole", x: root });
      }
    }
    if (index >= 2) {
      const yPrev = ys[index - 2];
      if (finite(yPrev) && (y0 - yPrev) * (y1 - y0) < 0) {
        const maximum = y0 > yPrev;
        let a = xs[index - 2], b = x1;
        const ratio = (Math.sqrt(5) - 1) / 2;
        for (let step = 0; step < 60; step += 1) {
          const c = b - ratio * (b - a), d = a + ratio * (b - a);
          if (maximum ? curve(c) > curve(d) : curve(c) < curve(d)) b = d;
          else a = c;
        }
        const x = (a + b) / 2, y = curve(x);
        if (!known(x)) {
          if (finite(y) && !poleAt(x)) features.push({ kind: "extremum", x, y });
          else features.push({ kind: "pole", x });
        }
      }
    }
  }
  const intercept = curve(0);
  if (finite(intercept) && scan.min <= 0 && scan.max >= 0 && !features.some((f) => f.kind === "hole" && f.x === 0)) {
    features.push({ kind: "intercept", x: 0, y: intercept });
  }
  return features;
}
function intersections(curves, scan) {
  const found = [];
  for (let i = 0; i < curves.length; i += 1) {
    for (let j = i + 1; j < curves.length; j += 1) {
      const difference = (x) => curves[i](x) - curves[j](x);
      const count = Math.round(span(scan) / SCAN_STEP);
      let previous = difference(scan.min);
      for (let index = 1; index <= count; index += 1) {
        const x = scan.min + span(scan) * index / count;
        const current = difference(x);
        if (finite(previous) && finite(current) && Math.sign(previous) * Math.sign(current) < 0) {
          let a = x - span(scan) / count, b = x, fa = previous;
          for (let step = 0; step < 60; step += 1) {
            const mid = (a + b) / 2, fm = difference(mid);
            if (Math.sign(fm) === Math.sign(fa)) {
              a = mid;
              fa = fm;
            } else b = mid;
          }
          const at = (a + b) / 2, y = curves[i](at);
          if (finite(y) && Math.abs(difference(at)) < 1e-6 * Math.max(1, Math.abs(y))) found.push({ kind: "intersection", x: at, y });
        }
        previous = current;
      }
    }
  }
  return found;
}
function selectCluster(features, anchors) {
  if (!features.length) return { kept: [], dropped: [] };
  const sorted = [...features].sort((a, b) => a.x - b.x);
  const clusters = [[sorted[0]]];
  for (const feature of sorted.slice(1)) {
    const current = clusters.at(-1);
    if (feature.x - current.at(-1).x > CLUSTER_GAP) clusters.push([feature]);
    else current.push(feature);
  }
  const score = (cluster) => {
    const anchored = anchors.some((x) => x >= cluster[0].x - CLUSTER_GAP && x <= cluster.at(-1).x + CLUSTER_GAP);
    return (anchored ? 1e3 : 0) + cluster.reduce((sum, feature) => sum + WEIGHT[feature.kind], 0) - Math.min(...cluster.map((feature) => Math.abs(feature.x))) * 1e-3;
  };
  const best = clusters.reduce((a, b) => score(b) > score(a) ? b : a);
  return { kept: best, dropped: clusters.filter((cluster) => cluster !== best).flat() };
}
function planPlotView(input) {
  const names = input.parameters.map((parameter) => parameter.name);
  const compiled = input.expressions.map((expression) => compileMathExpression(expression, ["x", ...names]));
  const initial = Object.fromEntries(input.parameters.map((parameter) => [parameter.name, parameter.initial]));
  const adjustments = [];
  const teaching = input.teachingPoints ?? [];
  const quantityX = input.quantityX === true;
  const plain = input.plainAxes !== false;
  const curveAt = (index, state) => (x2) => {
    try {
      return compiled[index]({ ...state, x: x2 });
    } catch {
      return Number.NaN;
    }
  };
  const naturalStart = quantityX && compiled.every((_, index) => finite(curveAt(index, initial)(1e-9))) && teaching.every((point) => point.x >= 0) && !(input.requested?.x?.min !== void 0 && input.requested.x.min < 0);
  const scan = naturalStart ? { min: 0, max: 2 * SCAN_HALF_WIDTH } : { min: -SCAN_HALF_WIDTH, max: SCAN_HALF_WIDTH };
  const focus = teaching.length ? teaching.reduce((sum, point) => sum + point.x, 0) / teaching.length : naturalStart ? 0 : 0;
  const describe = (state) => {
    const items = compiled.map((_, index) => {
      const curve = curveAt(index, state);
      const period = periodOf(input.expressions[index], state);
      let features = analyse(curve, scan);
      const radius = period !== void 0 ? Math.min(FEATURE_RADIUS, period) : FEATURE_RADIUS;
      features = features.filter((feature) => Math.abs(feature.x - focus) <= radius + 1e-9 || teaching.some((point) => Math.abs(point.x - feature.x) <= CLUSTER_GAP));
      if (features.length > MAX_FEATURES) {
        features = [...features].sort((a, b) => Math.abs(a.x - focus) - Math.abs(b.x - focus)).slice(0, MAX_FEATURES);
      }
      return { index, state, curve, features, quadratic: quadraticOf(curve), period };
    });
    if (items.length > 1) {
      const statePeriods = items.map((item) => item.period);
      const radius = statePeriods.every((period) => period !== void 0) ? Math.min(FEATURE_RADIUS, Math.max(...statePeriods)) : FEATURE_RADIUS;
      const crossings = intersections(items.map((item) => item.curve), scan).filter((feature) => Math.abs(feature.x - focus) <= radius + 1e-9);
      items[0].features.push(...crossings);
    }
    return items;
  };
  const shownStates = [initial, ...input.demonstrations ?? []];
  const base = shownStates.flatMap(describe);
  const { kept, dropped } = selectCluster(base.flatMap((item) => item.features), teaching.map((point) => point.x));
  if (dropped.length) {
    adjustments.push({ reason: "distant_features_left_out", detail: [...new Set(dropped.map((feature) => `${feature.kind}@${Number(feature.x.toFixed(3))}`))].slice(0, 6).join(",") });
  }
  const keptRange = hull(kept.map((feature) => feature.x));
  const inCluster = (feature) => !keptRange || feature.x >= keptRange.min - CLUSTER_GAP && feature.x <= keptRange.max + CLUSTER_GAP;
  const keptSet = new Set(kept);
  const periods = base.map((item) => item.period).filter((value2) => value2 !== void 0);
  const allPeriodic = periods.length === base.length && periods.length > 0;
  const allQuadratic = base.every((item) => item.quadratic);
  const quadraticHalfWidth = (a) => Math.min(6, Math.max(1, Math.sqrt(9 / Math.abs(a))));
  const regionOf = (item, features) => {
    const structural = features.filter((feature) => feature.kind !== "intercept");
    let region = hull((structural.length ? structural : features).map((feature) => feature.x));
    if (item.quadratic) {
      const halfWidth = quadraticHalfWidth(item.quadratic.a);
      region = union(region, { min: item.quadratic.vertex - halfWidth, max: item.quadratic.vertex + halfWidth });
    }
    return region;
  };
  const growthEnd = (items) => {
    const candidates = [1, 2, 2.5, 3, 4, 5, 6, 8].flatMap((m) => [1, 10, 100, 1e3].map((p) => m * p)).sort((a, b) => a - b);
    for (const end of candidates) {
      if (items.every((item) => {
        const start = item.curve(0), value2 = item.curve(end);
        if (!finite(start) || !finite(value2)) return false;
        return Math.abs(start) > 1e-9 ? Math.abs(value2 - start) >= 2 * Math.abs(start) : end >= MIN_SPAN;
      })) return end;
    }
    return MIN_SPAN;
  };
  const undefinedBeyond = (items, edge, direction) => items.every((item) => [0.01, 0.1, 1].every((step) => !finite(item.curve(edge + direction * step))));
  const xWindow = (items, features) => {
    const selected = items.map((item) => item.features.filter(features));
    let range = hull([
      ...items.flatMap((item, index) => {
        const region = regionOf(item, selected[index]);
        return region ? [region.min, region.max] : [];
      }),
      ...teaching.map((point) => point.x)
    ]);
    const featureCount = new Set(selected.flat().map((feature) => feature.x.toFixed(3))).size;
    if (allPeriodic) {
      const period = Math.min(1e6, Math.max(...periods));
      if (naturalStart) return { min: 0, max: Math.max(range?.max ?? 0, period) };
      return union(range, { min: focus - period, max: focus + period });
    }
    if (naturalStart && featureCount <= 1) return union(range, { min: 0, max: growthEnd(items) });
    if (allQuadratic) return range;
    if (range && featureCount >= 2) range = { min: range.min - span(range) * 0.25, max: range.max + span(range) * 0.25 };
    const edges = selected.flat().filter((feature) => feature.kind === "edge");
    const leftEdge = edges.filter((edge) => undefinedBeyond(items, edge.x, -1)).map((edge) => edge.x);
    const rightEdge = edges.filter((edge) => undefinedBeyond(items, edge.x, 1)).map((edge) => edge.x);
    const lower = leftEdge.length ? Math.max(...leftEdge) : -Infinity;
    const upper = rightEdge.length ? Math.min(...rightEdge) : Infinity;
    const turning = new Set(selected.flat().filter((feature) => feature.kind === "extremum").map((feature) => feature.x.toFixed(3))).size >= 2;
    const short = !range || !turning && span(range) < MIN_SPAN;
    const wanted = short ? MIN_SPAN : span(range);
    if (short) {
      const middle = range ? (range.min + range.max) / 2 : focus;
      const center = Math.abs(middle) < MIN_SPAN / 4 ? 0 : middle;
      range = union(range, { min: center - MIN_SPAN / 2, max: center + MIN_SPAN / 2 });
    }
    if (range.min < lower) range = { min: lower, max: Math.min(upper, Math.max(range.max, lower + wanted)) };
    if (range.max > upper) range = { min: Math.max(lower, Math.min(range.min, upper - wanted)), max: upper };
    return range;
  };
  const yExtent = (items, window) => {
    const values = [];
    const guard = span(window) * 0.04;
    const avoid = items.flatMap((item) => item.features.filter((feature) => feature.kind === "pole" || feature.kind === "edge" && feature.y === void 0).map((feature) => feature.x));
    const sampled = (item, range) => {
      for (let i = 0; i <= 400; i += 1) {
        const t = range.min + span(range) * i / 400;
        if (avoid.some((x2) => Math.abs(t - x2) < guard)) continue;
        const value2 = item.curve(t);
        if (finite(value2)) values.push(value2);
      }
    };
    for (const item of items) {
      const features = item.features.filter((feature) => keptSet.has(feature) || inCluster(feature)).filter((feature) => feature.x >= window.min && feature.x <= window.max);
      if (item.quadratic) {
        const halfWidth = quadraticHalfWidth(item.quadratic.a);
        const own = { min: Math.max(window.min, item.quadratic.vertex - halfWidth), max: Math.min(window.max, item.quadratic.vertex + halfWidth) };
        sampled(item, span(own) > 0 ? own : window);
      } else if (item.period === void 0 && features.some((feature) => feature.kind === "extremum") && !(undefinedBeyond([item], window.min, -1) && undefinedBeyond([item], window.max, 1))) {
        const levels = hull(features.filter((feature) => feature.y !== void 0 && feature.kind !== "intercept").map((feature) => feature.y));
        if (levels && span(levels) > 1e-9) {
          values.push(levels.min - FEATURE_Y_MARGIN * span(levels), levels.max + FEATURE_Y_MARGIN * span(levels));
        } else sampled(item, window);
      } else sampled(item, window);
      for (const feature of features) if (feature.y !== void 0) values.push(feature.y);
    }
    values.push(...teaching.filter((point) => point.x >= window.min && point.x <= window.max).map((point) => point.y));
    return hull(values);
  };
  let x = xWindow(base, (feature) => keptSet.has(feature));
  let yContent = yExtent(base, x);
  const baseX = x, baseY = yContent;
  for (const parameter of input.parameters) {
    let candidateX = x;
    let candidateY = yContent;
    for (const value2 of [parameter.min, parameter.max]) {
      if (value2 === parameter.initial) continue;
      const items = describe({ ...initial, [parameter.name]: value2 });
      candidateX = union(candidateX, xWindow(items, inCluster));
      candidateY = union(candidateY, yExtent(items, candidateX));
    }
    if (!candidateX || !candidateY || !baseY) continue;
    if (span(candidateX) <= EXTREME_ALLOWANCE * span(baseX) && span(candidateY) <= EXTREME_ALLOWANCE * Math.max(span(baseY), 1e-9)) {
      x = candidateX;
      yContent = candidateY;
    }
  }
  for (const point of input.optionalPoints ?? []) {
    const candidateX = union(x, { min: point.x, max: point.x });
    const candidateY = union(yContent, { min: point.y, max: point.y });
    if (candidateY && baseY && span(candidateX) <= EXTREME_ALLOWANCE * span(baseX) && span(candidateY) <= EXTREME_ALLOWANCE * Math.max(span(baseY), 1e-9)) {
      x = candidateX;
      yContent = candidateY;
    }
  }
  const requestedX = input.requested?.x;
  let acceptedX = false;
  if (requestedX && (requestedX.min !== void 0 || requestedX.max !== void 0)) {
    const proposal = { min: requestedX.min ?? x.min, max: requestedX.max ?? x.max };
    const curveFinite = proposal.max > proposal.min && base.some((item) => Array.from({ length: 41 }, (_, i) => item.curve(proposal.min + span(proposal) * i / 40)).filter(finite).length >= 10);
    const keepsTeaching = teaching.every((point) => point.x >= proposal.min && point.x <= proposal.max);
    const tooWide = span(proposal) > 4 * Math.max(span(x), MIN_SPAN);
    if (curveFinite && keepsTeaching && !tooWide) {
      x = proposal;
      acceptedX = true;
      yContent = yExtent(base, x) ?? yContent;
    } else {
      adjustments.push({ reason: "model_x_range_replaced", detail: `requested=[${requestedX.min ?? ""},${requestedX.max ?? ""}] used=[${Number(x.min.toPrecision(4))},${Number(x.max.toPrecision(4))}]` });
    }
  }
  let y = yContent ?? { min: -1, max: 1 };
  const requestedY = input.requested?.y;
  let acceptedY = false;
  if (requestedY && (requestedY.min !== void 0 || requestedY.max !== void 0)) {
    const proposal = { min: requestedY.min ?? y.min, max: requestedY.max ?? y.max };
    const mustY = hull([
      ...kept.filter((feature) => feature.y !== void 0 && feature.x >= x.min && feature.x <= x.max && feature.kind !== "intercept").map((feature) => feature.y),
      ...teaching.map((point) => point.y)
    ]);
    const samples = base.flatMap((item) => Array.from({ length: 81 }, (_, i) => item.curve(x.min + span(x) * i / 80))).filter(finite);
    const inside = samples.filter((value2) => value2 >= proposal.min && value2 <= proposal.max).length;
    const keeps = !mustY || mustY.min >= proposal.min && mustY.max <= proposal.max;
    if (proposal.max > proposal.min && keeps && inside >= samples.length * 0.3) {
      y = proposal;
      acceptedY = true;
    } else {
      adjustments.push({ reason: "model_y_range_replaced", detail: `requested=[${requestedY.min ?? ""},${requestedY.max ?? ""}] used=[${Number(y.min.toPrecision(4))},${Number(y.max.toPrecision(4))}]` });
    }
  }
  const identity = input.expressions.length > 1 && input.expressions.some((expression) => expression.replace(/[()\s]/gu, "") === "x");
  if (identity && !acceptedY) y = { ...x };
  const nearZero = (range) => {
    if (range.min > 0 && range.min <= span(range) * 0.5) return { ...range, min: 0 };
    if (range.max < 0 && -range.max <= span(range) * 0.5) return { ...range, max: 0 };
    return range;
  };
  if (!acceptedX) x = nearZero(x);
  if (!acceptedY && !identity) y = nearZero(y);
  const periodicWindow = allPeriodic && !acceptedX;
  const piTicks = !quantityX && plain && allPeriodic && span(x) >= Math.PI && periods.every((period) => period / Math.PI >= 0.5 && period / Math.PI <= 8 && Math.abs(period / Math.PI * 4 - Math.round(period / Math.PI * 4)) < 1e-9);
  const keepXMin = naturalStart && x.min === 0 || periodicWindow;
  const keepXMax = periodicWindow;
  let finalX = x;
  if (!acceptedX) {
    finalX = snap(pad4(x, EDGE_INSET, { min: keepXMin, max: keepXMax }), piTicks ? Math.PI / 2 : 1);
    if (keepXMin) finalX.min = x.min;
    if (keepXMax) finalX.max = x.max;
  }
  const keepYMin = quantityX && y.min === 0;
  let finalY = y;
  if (!acceptedY) {
    finalY = identity ? { ...finalX } : snap(pad4(y, EDGE_INSET, { min: keepYMin }));
    if (keepYMin) finalY.min = 0;
  }
  const initialItems = base.filter((item) => item.state === initial);
  const circular = initialItems.some((item) => isCircularArc(item.curve, finalX));
  const slopes = initialItems.map((item) => linearSlopeOf(item.curve));
  const perpendicular = slopes.some((m, i) => m !== void 0 && slopes.some((n, j) => j > i && n !== void 0 && Math.abs(m * n + 1) < 1e-9));
  const aspect = span(finalY) / span(finalX);
  const equalScale = plain && (identity || circular || perpendicular || allQuadratic && aspect >= EQUAL_ASPECT.min && aspect <= EQUAL_ASPECT.max);
  const holes = compiled.map((_, index) => initialItems.filter((item) => item.index === index).flatMap((item) => item.features.filter((feature) => feature.kind === "hole" && feature.x > finalX.min && feature.x < finalX.max && feature.y !== void 0 && feature.y > finalY.min && feature.y < finalY.max)).map((feature) => ({ x: feature.x, y: feature.y })));
  return { x: finalX, y: finalY, equalScale, piTicks, holes, adjustments };
}

// src/plugins/math-compilers.ts
function compileFunctionPlot(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "expression", "expressions", "expression_tokens", "sample_x_numbers", "curve_label", "curve_labels", "x_label", "y_label", "x_min", "x_max", "y_min", "y_max"], path);
  const dynamicTokens = input.expression_tokens;
  if (dynamicTokens !== void 0 && !dynamicTokens.some((token) => token.kind === "input")) {
    fail2(
      "LESSON_PLAN_PLOT_INPUT",
      `${path}.expression_tokens`,
      "a parameterized function curve must explicitly depend on the plot input; a lesson number cannot replace the horizontal-axis input"
    );
  }
  if (dynamicTokens !== void 0 && (input.expression !== void 0 || input.expressions !== void 0)) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", path, "use expression_tokens or static expression strings, not both");
  }
  if (input.expression !== void 0 && input.expressions !== void 0) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", path, "use either expression or expressions, not both");
  }
  if (dynamicTokens === void 0 && input.expression === void 0 && input.expressions === void 0) {
    fail2(
      "LESSON_PLAN_EXPRESSION",
      `${path}.parameters`,
      "a function plot requires an explicit mathematical expression"
    );
  }
  const dynamicNumbers = plotCurveNumbers(input);
  if (dynamicNumbers.length > LESSON_PLAN_CAPABILITY_NUMBER_LIMITS.function_plot) {
    fail2("LESSON_PLAN_COMPILER_CONTROL_LIMIT", `${path}.expression_tokens`, "too many curve parameters");
  }
  const rawExpressions = dynamicTokens !== void 0 ? [mathExpressionToOll(dynamicTokens)] : input.expressions === void 0 ? [optionalText(input.expression, "", `${path}.expression`)] : optionalStringArray(input.expressions, [], `${path}.expressions`);
  const expressionVariables = ["x", ...dynamicNumbers.map(variableAlias)];
  const expressions = rawExpressions.map((expression2, index) => safeFunctionExpression(expression2, "", expressionVariables, `${path}.expressions[${index}]`));
  const expression = expressions[0];
  if (!expression) fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.expressions`, "at least one function expression is required");
  const curveLabels = input.curve_labels === void 0 ? [] : optionalStringArray(input.curve_labels, [], `${path}.curve_labels`).map((label) => namedNumbers(label, plan));
  if (curveLabels.length > 0 && curveLabels.length !== expressions.length) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.curve_labels`, "curve label count must equal expression count");
  }
  const sampleNumbers = plotSampleNumbers(input);
  const number = sampleNumbers[0];
  const hint = (value2, key) => value2 === void 0 ? void 0 : optionalNumber(value2, 0, `${path}.${key}`);
  const requested = {
    x: { min: hint(input.x_min, "x_min"), max: hint(input.x_max, "x_max") },
    y: { min: hint(input.y_min, "y_min"), max: hint(input.y_max, "y_max") }
  };
  const creationIndex = plan.sections.findIndex((section) => section.moments.some((moment) => moment.actions.some((action) => action.action === "create" && action.content === content)));
  const creationMoments = plan.sections[creationIndex]?.moments ?? [];
  const curveParameters = dynamicNumbers.map((index) => {
    const item = numberDefinition(plan, index, `${path}.numbers`);
    return { name: variableAlias(index), initial: item.initial, min: item.min, max: item.max };
  });
  const initialState = Object.fromEntries(curveParameters.map((parameter) => [parameter.name, parameter.initial]));
  const demonstrations = [];
  {
    const state = { ...initialState };
    for (const moment of creationMoments) {
      for (const restarted of moment.restart_numbers ?? []) {
        const name = variableAlias(restarted);
        if (name in initialState) state[name] = initialState[name];
      }
      for (const action of moment.actions) {
        if (action.action !== "animate" || !dynamicNumbers.includes(action.number)) continue;
        state[variableAlias(action.number)] = action.end_value;
        demonstrations.push({ ...state });
      }
    }
  }
  const practiceTargets = (plan.sections[creationIndex]?.student_activities ?? []).flatMap((activity) => activity.kind === "number_target" && activity.expression === void 0 && activity.number_controls.length === 1 ? [{ number: activity.number_controls[0].number, value: activity.value }] : []);
  for (const target of practiceTargets) {
    if (dynamicNumbers.includes(target.number)) demonstrations.push({ ...initialState, [variableAlias(target.number)]: target.value });
  }
  const title = namedNumbers(optionalText(input.title, compileText(plan, "\u51FD\u6570\u56FE\u50CF"), `${path}.title`), plan);
  const xLabel = namedNumbers(optionalText(input.x_label, "x", `${path}.x_label`), plan);
  const yLabel = namedNumbers(optionalText(input.y_label, "y", `${path}.y_label`), plan);
  const displaySymbols = dynamicTokens !== void 0 ? displayNumberSymbols(plan, dynamicNumbers) : void 0;
  const defaultCurveLabel = (item) => {
    if (dynamicTokens !== void 0) {
      return `y = ${formatMathExpressionDisplay(dynamicTokens, (index) => displaySymbols.get(index) ?? `n${index}`)}`;
    }
    if (/\b(?:log10|lg|log2)\s*\(/u.test(item)) {
      return `y = ${item.replace(/\blog10\s*\(/gu, "log\u2081\u2080(").replace(/\blog2\s*\(/gu, "log\u2082(").replace(/\*/gu, "\xB7")}`;
    }
    try {
      return `y = ${formatMathExpressionDisplay(parseModelFormula(item, 0, `${path}.expression`), (index) => `n${index}`)}`;
    } catch {
      return `y = ${item}`;
    }
  };
  const curves = expressions.map((item, index) => ({
    expression: item,
    label: curveLabels[index] ?? (index === 0 && input.curve_label !== void 0 ? namedNumbers(optionalText(input.curve_label, "", `${path}.curve_label`), plan) : defaultCurveLabel(rawExpressions[index] ?? item))
  }));
  const sampleAt = (x, where) => ({ x, y: evaluate(expression, ["x"], { x }, where) });
  const samples = sampleNumbers.map((sampleNumber, index) => {
    const d = numberDefinition(plan, sampleNumber, `${path}.numbers`);
    for (const x of [d.min, d.max]) evaluate(expression, ["x"], { x }, `${path}.expression`);
    return {
      ...sampleAt(d.initial, `${path}.expression`),
      label: sampleNumbers.length === 2 ? index === 0 ? "A" : "B" : "P(x, y)",
      x_expression: variableAlias(sampleNumber)
    };
  });
  const teachingPoints = samples.map(({ x, y }) => ({ x, y }));
  const optionalPoints = [];
  for (const sampleNumber of sampleNumbers) {
    const d = numberDefinition(plan, sampleNumber, `${path}.numbers`);
    for (const x of [d.min, d.max]) {
      const y = evaluate(expression, ["x"], { x }, `${path}.expression`);
      if (Number.isFinite(y)) optionalPoints.push({ x, y });
    }
  }
  for (const target of practiceTargets) {
    if (!sampleNumbers.includes(target.number)) continue;
    const y = compileMathExpression(expression, ["x"])({ x: target.value });
    if (Number.isFinite(y)) teachingPoints.push({ x: target.value, y });
  }
  for (const [momentIndex, moment] of creationMoments.entries()) {
    for (const [actionIndex, action] of moment.actions.entries()) {
      if (action.action !== "animate" || !sampleNumbers.includes(action.number)) continue;
      teachingPoints.push(sampleAt(
        action.end_value,
        `$lessonPlan.sections[${creationIndex}].moments[${momentIndex}].actions[${actionIndex}].end_value`
      ));
    }
  }
  let references;
  if (expressions.length === 1 && !sampleNumbers.length && /斜率|割线|slope|secant/i.test([plan.title, ...plan.goals].join(" "))) {
    const evaluateCurve = compileMathExpression(expression, expressionVariables);
    const referencePoints = (values) => [0, 1].flatMap((x, index) => {
      try {
        const y = evaluateCurve({ ...values, x });
        return Number.isFinite(y) ? [{ x, y, label: index ? "B" : "A" }] : [];
      } catch {
        return [];
      }
    });
    const initialReferences = referencePoints(initialState);
    if (initialReferences.length === 2) {
      references = initialReferences;
      teachingPoints.push(...references, ...demonstrations.flatMap(referencePoints));
    }
  }
  let view;
  try {
    view = planPlotView({
      expressions,
      parameters: curveParameters,
      demonstrations,
      teachingPoints,
      optionalPoints,
      requested,
      quantityX: xLabel !== "x",
      plainAxes: xLabel === "x" && yLabel === "y"
    });
  } catch (error) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.expression`, error instanceof Error ? error.message : "invalid viewport");
  }
  const axes = {
    ...view.equalScale ? { equal_scale: true, layout: "adaptive" } : {},
    ...samples.length ? { follow_samples: true } : {},
    x: { min: view.x.min, max: view.x.max, label: xLabel, ...view.piTicks ? { ticks: "pi" } : {} },
    y: { min: view.y.min, max: view.y.max, label: yLabel }
  };
  const plottedCurves = curves.map((curve, index) => view.holes[index]?.length ? { ...curve, holes: view.holes[index] } : curve);
  const built = buildFunctionPlot({
    as: base,
    role,
    place: placement,
    title,
    axes,
    curves: plottedCurves,
    ...samples.length ? { samples } : references ? { references } : {}
  });
  return {
    actions: built.actions,
    ...view.adjustments.length ? { adjustments: view.adjustments } : {},
    whole: base,
    parts: new Map([
      ["whole", base],
      ["primary_curve", `${base}#primary-curve`],
      ...number ? [["moving_point", `${base}#moving-point`], ["primary_control", `${base}#moving-point`]] : [],
      ...dynamicNumbers.length ? [["primary_control", `${base}#primary-curve`]] : []
    ])
  };
}
var translator = (plan) => (source, values) => compileText(plan, source, values);
function builtVisual(built) {
  return { actions: built.actions, whole: built.whole, parts: new Map(Object.entries(built.parts)) };
}
function compileUnitCircleProjection(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "projection"], path);
  const projection = input.projection === void 0 ? "sin" : input.projection;
  if (projection !== "sin" && projection !== "cos") fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.projection`, "expected 'sin' or 'cos'");
  const number = content.numbers?.[0];
  const angleDefinition = number ? numberDefinition(plan, number, `${path}.numbers[0]`) : void 0;
  const angleScale = angleScaleForUnit(angleDefinition?.unit);
  const variable = number ? variableAlias(number) : void 0;
  return builtVisual(buildUnitCircle({
    as: base,
    role,
    place: placement,
    ...variable && angleDefinition ? {
      angle: {
        variable,
        expression: scaledAngleExpression(variable, angleScale),
        initial: angleDefinition.initial * angleScale,
        min: angleDefinition.min * angleScale,
        max: angleDefinition.max * angleScale
      }
    } : { fixed_angle: (angleDefinition?.initial ?? Math.PI / 3) * angleScale },
    text: { title: optionalText(input.title, compileText(plan, "\u5355\u4F4D\u5706\u4E0E\u6295\u5F71"), `${path}.title`) },
    graph: {
      projection,
      title: compileText(plan, "{{v0}}\u51FD\u6570\u56FE\u50CF", { v0: compileText(plan, projection === "sin" ? "\u6B63\u5F26" : "\u4F59\u5F26") }),
      link_label: compileText(plan, "\u65CB\u8F6C\u89D2\u4E0E\u5468\u671F\u6CE2\u52A8"),
      group_label: compileText(plan, "\u5355\u4F4D\u5706\u4E0E\u51FD\u6570\u56FE\u50CF")
    }
  }));
}
function compileCirclePolygonBounds(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "radius"], path);
  const radius = optionalNumber(input.radius, 2, `${path}.radius`);
  if (radius <= 0) fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.radius`, "radius must be positive");
  const number = content.numbers?.[0];
  const definition = number ? numberDefinition(plan, number, `${path}.numbers[0]`) : void 0;
  const initialSides = definition?.initial ?? 6;
  return builtVisual(buildCirclePolygons({
    as: base,
    role,
    place: placement,
    radius,
    sides: number ? { expression: `round(${variableAlias(number)})`, initial: initialSides, ...definition ? { min: definition.min } : {} } : initialSides,
    circumscribed: true,
    text: {
      title: optionalText(input.title, compileText(plan, "\u5706\u4E0E\u6B63\u591A\u8FB9\u5F62\u7684\u5468\u957F\u5939\u903C"), `${path}.title`),
      inscribed_label: compileText(plan, "\u5185\u63A5\u6B63\u591A\u8FB9\u5F62"),
      circumscribed_label: compileText(plan, "\u5916\u5207\u6B63\u591A\u8FB9\u5F62"),
      caption: compileText(plan, "\u7EFF\u8272\u5185\u63A5\u5468\u957F < \u5706\u5468\u957F < \u6A59\u8272\u5916\u5207\u5468\u957F\u3002\u9664\u4EE5\u76F4\u5F84 2r\uFF1An sin(\u03C0/n) < \u03C0 < n tan(\u03C0/n)\u3002\u663E\u793A\u503C\u4E3A\u8FD1\u4F3C\u503C\uFF1B\u8FB9\u6570\u589E\u52A0\u65F6\u4E0A\u4E0B\u754C\u5171\u540C\u903C\u8FD1 \u03C0\u3002")
    }
  }));
}
function compileCircleAndArc(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "radius", "angle"], path);
  const angleNumber = content.numbers?.[0];
  const radiusNumber = content.numbers?.[1];
  const angleDefinition = angleNumber ? numberDefinition(plan, angleNumber, `${path}.numbers[0]`) : void 0;
  const radiusDefinition = radiusNumber ? numberDefinition(plan, radiusNumber, `${path}.numbers[1]`) : void 0;
  const radius = radiusDefinition?.initial ?? optionalNumber(input.radius, 1, `${path}.radius`);
  if (radius <= 0) fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.radius`, "radius must be positive");
  if (radiusDefinition && radiusDefinition.min <= 0) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.numbers[1]`, "a bound radius must stay positive");
  }
  const angleScale = angleScaleForUnit(angleDefinition?.unit);
  const angle = (angleDefinition?.initial ?? optionalNumber(input.angle, Math.PI / 3, `${path}.angle`)) * angleScale;
  const angleVariable = angleNumber ? variableAlias(angleNumber) : void 0;
  return builtVisual(buildCircleAndArc({
    as: base,
    role,
    place: placement,
    t: translator(plan),
    title: optionalText(input.title, compileText(plan, "\u5706\u3001\u5706\u5FC3\u89D2\u4E0E\u5706\u5F27"), `${path}.title`),
    radius,
    angle,
    ...angleVariable ? { angle_number: { variable: angleVariable, expression: scaledAngleExpression(angleVariable, angleScale) } } : {},
    ...radiusNumber && radiusDefinition ? { radius_number: { variable: variableAlias(radiusNumber), min: radiusDefinition.min, max: radiusDefinition.max } } : {}
  }));
}
function compileCubeWithSection(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title"], path);
  const number = content.numbers?.[0];
  const height = number ? numberDefinition(plan, number, `${path}.numbers[0]`).initial : 0;
  return { ...builtVisual(buildCubeWithSection({
    as: base,
    role,
    place: placement,
    t: translator(plan),
    title: optionalText(input.title, compileText(plan, "\u6B63\u65B9\u4F53\u3001\u9876\u70B9\u3001\u68F1\u3001\u9762\u4E0E\u622A\u9762"), `${path}.title`),
    section: { value: height, ...number ? { variable: variableAlias(number) } : {} }
  })), primaryScene: base };
}
function compileFunctionSurface(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "expression", "x_min", "x_max", "y_min", "y_max", "samples", "section_axis", "section_value"], path);
  const expression = safeFunctionExpression(input.expression, "x^2+y^2", ["x", "y"], `${path}.expression`);
  const xMin = optionalNumber(input.x_min, -2, `${path}.x_min`);
  const xMax = optionalNumber(input.x_max, 2, `${path}.x_max`);
  const yMin = optionalNumber(input.y_min, -2, `${path}.y_min`);
  const yMax = optionalNumber(input.y_max, 2, `${path}.y_max`);
  assertRange(xMin, xMax, `${path}.x_range`);
  assertRange(yMin, yMax, `${path}.y_range`);
  const samples = optionalInteger(input.samples, 12, 4, 24, `${path}.samples`);
  const axis = input.section_axis ?? "z";
  if (axis !== "x" && axis !== "y" && axis !== "z") fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.section_axis`, "expected x, y, or z");
  const number = content.numbers?.[0];
  const sectionValue = number ? numberDefinition(plan, number, `${path}.numbers[0]`).initial : optionalNumber(input.section_value, 1, `${path}.section_value`);
  return { ...builtVisual(buildFunctionSurface({
    as: base,
    role,
    place: placement,
    t: translator(plan),
    title: optionalText(input.title, compileText(plan, "\u51FD\u6570\u66F2\u9762\u4E0E\u622A\u9762"), `${path}.title`),
    expression,
    x_range: { min: xMin, max: xMax },
    y_range: { min: yMin, max: yMax },
    samples,
    axis,
    section: { value: sectionValue, ...number ? { variable: variableAlias(number) } : {} }
  })), primaryScene: base };
}
function compileImplicitSurface(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "expression", "level", "section_axis"], path);
  if (input.expression === void 0) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.expression`, "an implicit surface requires an expression");
  }
  if (input.level === void 0) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.level`, "an implicit surface requires a level");
  }
  const expression = safeFunctionExpression(input.expression, "", ["x", "y", "z"], `${path}.expression`);
  const level = optionalNumber(input.level, 0, `${path}.level`);
  const axis = input.section_axis ?? "z";
  if (axis !== "x" && axis !== "y" && axis !== "z") {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.section_axis`, "expected x, y, or z");
  }
  const number = content.numbers?.[0];
  const sectionValue = number ? numberDefinition(plan, number, `${path}.numbers[0]`).initial : 0;
  let built;
  try {
    built = buildImplicitSurface({
      as: base,
      role,
      place: placement,
      t: translator(plan),
      // The builder resolves the surface before reading the title. Validate
      // here so a bad surface still takes precedence in a repair request.
      get title() {
        return optionalText(input.title, compileText(plan, "\u9690\u5F0F\u66F2\u9762\u4E0E\u622A\u9762"), `${path}.title`);
      },
      expression,
      level,
      axis,
      section: { value: sectionValue, ...number ? { variable: variableAlias(number) } : {} }
    });
  } catch (error) {
    if (error instanceof LessonPlanError) throw error;
    fail2(
      "LESSON_PLAN_CAPABILITY_PARAMETER",
      `${path}.expression`,
      error instanceof Error ? error.message : "implicit surface cannot be rendered"
    );
  }
  return { ...builtVisual(built), primaryScene: base };
}
function compileCoordinateCircle(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "center_x", "center_y", "radius", "radius_expression"], path);
  const centerX = optionalNumber(input.center_x, 0, `${path}.center_x`);
  const centerY = optionalNumber(input.center_y, 0, `${path}.center_y`);
  const number = content.numbers?.[0];
  const radiusDefinition = number ? numberDefinition(plan, number, `${path}.numbers[0]`) : void 0;
  const formula = input.radius_expression === void 0 ? void 0 : safeFunctionExpression(input.radius_expression, "n1", ["n1"], `${path}.radius_expression`);
  if (formula && !radiusDefinition) fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.radius_expression`, "radius_expression requires a shared number");
  const radiusAt = (value2) => formula ? evaluate(formula, ["n1"], { n1: value2 }, `${path}.radius_expression`) : value2;
  const radius = radiusDefinition ? radiusAt(radiusDefinition.initial) : optionalNumber(input.radius, 1, `${path}.radius`);
  if (radius < 0 || !formula && radius === 0) fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.radius`, "radius must be positive");
  if (!formula && radiusDefinition && radiusDefinition.min <= 0) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.numbers[0]`, "a bound radius must stay positive");
  }
  const variable = number ? variableAlias(number) : void 0;
  const sampledRadii = radiusDefinition && formula ? Array.from({ length: 201 }, (_, i) => radiusAt(radiusDefinition.min + (radiusDefinition.max - radiusDefinition.min) * i / 200)) : [];
  if (sampledRadii.some((value2) => !Number.isFinite(value2) || value2 < 0)) fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.radius_expression`, "radius expression has an invalid sampled value");
  const maximumRadius = formula ? Math.max(radius, ...sampledRadii, 1) : radiusDefinition ? Math.max(Math.abs(radiusDefinition.min), Math.abs(radiusDefinition.max)) : radius;
  return builtVisual(buildCoordinateCircle({
    as: base,
    role,
    place: placement,
    t: translator(plan),
    title: optionalText(input.title, compileText(plan, "\u5750\u6807\u7CFB\u4E2D\u7684\u5706"), `${path}.title`),
    center: { x: centerX, y: centerY },
    radius,
    maximum_radius: maximumRadius,
    ...variable ? { radius_binding: { expression: formula ? replaceIdentifier(formula, "n1", variable) : variable, formula: Boolean(formula) } } : {}
  }));
}
function compileRectangleUnitSquareArray(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title"], path);
  const columnNumber = content.numbers?.[0];
  const rowNumber = content.numbers?.[1];
  if (!columnNumber || !rowNumber) {
    fail2(
      "LESSON_PLAN_CAPABILITY_PARAMETER",
      `${path}.numbers`,
      "a unit-square rectangle requires column and row numbers"
    );
  }
  const columnDefinition = numberDefinition(plan, columnNumber, `${path}.numbers[0]`);
  const rowDefinition = numberDefinition(plan, rowNumber, `${path}.numbers[1]`);
  return builtVisual(buildUnitSquareArray({
    as: base,
    role,
    place: placement,
    t: translator(plan),
    title: optionalText(input.title, compileText(plan, "\u5355\u4F4D\u6B63\u65B9\u5F62\u94FA\u6210\u957F\u65B9\u5F62"), `${path}.title`),
    columns: { variable: variableAlias(columnNumber), initial: columnDefinition.initial, max: columnDefinition.max },
    rows: { variable: variableAlias(rowNumber), initial: rowDefinition.initial, max: rowDefinition.max }
  }));
}
function compileGeometricRearrangement(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "construction", "leg_a", "leg_b"], path);
  const construction = input.construction ?? "right_triangle_square";
  const legA = optionalNumber(input.leg_a, 3, `${path}.leg_a`);
  const legB = optionalNumber(input.leg_b, 2, `${path}.leg_b`);
  if (legA <= 0 || legB <= 0) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", path, "triangle legs must be positive");
  }
  const number = content.numbers?.[0];
  const progressDefinition = number ? numberDefinition(plan, number, `${path}.numbers[0]`) : void 0;
  const progressVariable = number ? variableAlias(number) : void 0;
  if (!rearrangementRecipe(construction, legA, legB)) fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.construction`, "unsupported geometric construction");
  return builtVisual(buildGeometricRearrangement({
    as: base,
    role,
    place: placement,
    construction,
    legs: { a: legA, b: legB },
    ...progressDefinition && progressVariable ? { progress: {
      expression: `((${progressVariable})-(${progressDefinition.min}))/((${progressDefinition.max})-(${progressDefinition.min}))`,
      initial: (progressDefinition.initial - progressDefinition.min) / (progressDefinition.max - progressDefinition.min)
    } } : {}
  }));
}
function compileCircleArea(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "radius"], path);
  const r = optionalNumber(input.radius, 2, `${path}.radius`);
  if (r <= 0 || r > 1e6) fail2("LESSON_PLAN_CAPABILITY_PARAMETER", path, "radius must be positive and bounded");
  const number = content.numbers?.[0];
  const d = number ? numberDefinition(plan, number, path) : void 0;
  const variable = number ? variableAlias(number) : void 0;
  return builtVisual(buildCircleAreaRearrangement({
    as: base,
    role,
    place: placement,
    t: translator(plan),
    radius: r,
    ...variable && d ? { progress: { expression: `(${variable}-${d.min})/(${d.max - d.min})`, initial: (d.initial - d.min) / (d.max - d.min) } } : {}
  }));
}
var NUMBER_LINE_SPLITS = Array.from({ length: 12 }, (_unused, index) => index + 1);
var onGrid = (value2, parts) => Math.abs(value2 * parts - Math.round(value2 * parts)) < 1e-9;
function compileNumberLine(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title"], path);
  const [startNumber, changeNumber] = content.numbers ?? [];
  const start = startNumber ? numberDefinition(plan, startNumber, `${path}.numbers[0]`) : void 0;
  const change = changeNumber ? numberDefinition(plan, changeNumber, `${path}.numbers[1]`) : void 0;
  const values = [
    ...start ? [start.min, start.max, start.initial] : [0],
    ...start && change ? [start.min + change.min, start.max + change.max, start.initial + change.initial] : []
  ];
  const grid = [
    ...values,
    ...change ? [change.min, change.max, change.initial] : [],
    ...[start?.student_control?.step, change?.student_control?.step].filter((step2) => typeof step2 === "number" && step2 > 0)
  ];
  const min = Math.floor(Math.min(...values, 0)) - (Math.min(...values) <= 0 ? 1 : 0);
  const max = Math.ceil(Math.max(...values, 0)) + 1;
  const span2 = max - min;
  const step = span2 <= 60 ? 1 : span2 <= 150 ? 5 : 10;
  const subdivisions = step > 1 ? 1 : NUMBER_LINE_SPLITS.find((parts) => grid.every((value2) => onGrid(value2, parts)) && span2 * parts <= NUMBER_LINE_LIMITS.ticks) ?? 1;
  const unit = step / subdivisions;
  const whole = (value2) => onGrid(value2 / unit, 1);
  const reach = change ? Math.max(Math.abs(change.min), Math.abs(change.max)) : 0;
  const sliderStep = change?.student_control?.step;
  const hopsFit = change !== void 0 && [change.min, change.max, change.initial].every(whole) && (sliderStep === void 0 || whole(sliderStep)) && Math.ceil(reach / unit - 1e-9) <= NUMBER_LINE_LIMITS.hops;
  const hops = hopsFit;
  const startVariable = startNumber ? variableAlias(startNumber) : void 0;
  const changeVariable = changeNumber ? variableAlias(changeNumber) : void 0;
  const built = buildNumberLine({
    as: base,
    role,
    place: placement,
    title: optionalText(input.title, compileText(plan, "\u6570\u8F74"), `${path}.title`),
    range: { min, max },
    ticks: { step, subdivisions, labels: subdivisions > 1 ? "all" : "major" },
    ...start && startVariable ? { points: [
      { as: "start", value: { expression: startVariable, initial: start.initial }, label: compileText(plan, "\u8D77\u70B9") },
      ...change && changeVariable ? [{ as: "end", value: { expression: `(${startVariable})+(${changeVariable})`, initial: start.initial + change.initial }, label: compileText(plan, "\u7EC8\u70B9") }] : []
    ] } : {},
    ...change && changeVariable && start ? { jumps: [{ as: "move", from: "start", by: { expression: changeVariable, initial: change.initial }, hops }] } : {}
  });
  return { ...builtVisual(built), parts: new Map(Object.entries({ ...built.parts, ...built.parts.move ? { primary_control: built.parts.move } : {} })) };
}
var MATH_COMPILERS = {
  number_line: compileNumberLine,
  function_plot: compileFunctionPlot,
  unit_circle_projection: compileUnitCircleProjection,
  circle_polygon_bounds: compileCirclePolygonBounds,
  circle_and_arc: compileCircleAndArc,
  cube_with_section: compileCubeWithSection,
  function_surface_with_section: compileFunctionSurface,
  implicit_surface_with_section: compileImplicitSurface,
  coordinate_circle: compileCoordinateCircle,
  rectangle_unit_square_array: compileRectangleUnitSquareArray,
  geometric_rearrangement: compileGeometricRearrangement,
  circle_area_rearrangement: compileCircleArea
};

// src/plugins/physics-compilers.ts
function compileSpringAndMass(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title"], path);
  const number = content.numbers?.[0];
  const phaseDefinition = number ? numberDefinition(plan, number, `${path}.numbers[0]`) : void 0;
  const phaseScale = angleScaleForUnit(phaseDefinition?.unit);
  const phase = (phaseDefinition?.initial ?? 0) * phaseScale;
  const variable = number ? variableAlias(number) : void 0;
  const built = buildSpringAndMass({
    as: base,
    role,
    place: placement,
    ...variable && phaseDefinition ? {
      phase: {
        expression: scaledAngleExpression(variable, phaseScale),
        initial: phase,
        min: phaseDefinition.min * phaseScale,
        max: phaseDefinition.max * phaseScale
      }
    } : { fixed_phase: phase },
    text: {
      title: optionalText(input.title, compileText(plan, "\u5F39\u7C27\u632F\u5B50\u7684\u5F80\u590D\u8FD0\u52A8"), `${path}.title`),
      displacement: compileText(plan, "\u4F4D\u79FB"),
      anchor: compileText(plan, "\u56FA\u5B9A\u7AEF"),
      equilibrium: compileText(plan, "\u5E73\u8861\u4F4D\u7F6E"),
      mass: compileText(plan, "\u7269\u4F53"),
      restoring_force: compileText(plan, "\u56DE\u590D\u529B"),
      plot_title: compileText(plan, "\u4F4D\u79FB\u968F\u76F8\u4F4D\u53D8\u5316"),
      phase: compileText(plan, "\u76F8\u4F4D"),
      current_state: compileText(plan, "\u5F53\u524D\u72B6\u6001"),
      link_label: compileText(plan, "\u540C\u4E00\u65F6\u523B\u7684\u4F4D\u79FB"),
      group_label: compileText(plan, "\u5F39\u7C27\u8FD0\u52A8\u4E0E\u51FD\u6570\u56FE\u50CF")
    }
  });
  return { actions: built.actions, whole: built.whole, parts: new Map(Object.entries(built.parts)) };
}
var STILL_MOTION_TIME = 10;
var DEFAULT_SPEED = 2;
function motionUnits(speedUnit, timeUnit) {
  if (!speedUnit?.trim()) return { distance: "m", time: timeUnit?.trim() || "s" };
  const [distance = "", time = ""] = speedUnit.includes("/") ? speedUnit.split("/").map((part) => part.trim()) : [];
  return { distance, time: timeUnit?.trim() || time };
}
function compileConstantSpeedMotion(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "speed"], path);
  const [timeNumber, speedNumber] = content.numbers ?? [];
  const timeDefinition = timeNumber ? numberDefinition(plan, timeNumber, `${path}.numbers[0]`) : void 0;
  const speedDefinition = speedNumber ? numberDefinition(plan, speedNumber, `${path}.numbers[1]`) : void 0;
  const speed = speedDefinition?.initial ?? optionalNumber(input.speed, DEFAULT_SPEED, `${path}.speed`);
  if (!(speed > 0)) fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.speed`, "speed must be positive");
  if (timeDefinition && !(timeDefinition.max > 0)) {
    fail2("LESSON_PLAN_CAPABILITY_PARAMETER", `${path}.numbers[0]`, "time must be able to grow past 0");
  }
  const units = motionUnits(speedDefinition?.unit, timeDefinition?.unit);
  const unitSuffix = (unit) => unit ? compileText(plan, "\uFF08{{v0}}\uFF09", { v0: unit }) : "";
  const built = buildConstantSpeedMotion({
    as: base,
    role,
    place: placement,
    time: timeNumber && timeDefinition ? { expression: variableAlias(timeNumber), initial: timeDefinition.initial, max: timeDefinition.max } : { initial: STILL_MOTION_TIME, max: STILL_MOTION_TIME },
    speed: speedNumber && speedDefinition ? { expression: variableAlias(speedNumber), initial: speed, max: speedDefinition.max } : { initial: speed, max: speed },
    text: {
      title: optionalText(input.title, compileText(plan, "\u5300\u901F\u76F4\u7EBF\u8FD0\u52A8"), `${path}.title`),
      start: compileText(plan, "\u8D77\u70B9"),
      object: compileText(plan, "\u8FD0\u52A8\u7269\u4F53"),
      distance_readout: compileText(plan, "\u7269\u4F53 s = "),
      distance_unit: units.distance,
      distance_axis: `${compileText(plan, "\u8DEF\u7A0B s")}${unitSuffix(units.distance)}`,
      time_axis: `${compileText(plan, "\u65F6\u95F4 t")}${unitSuffix(units.time)}`,
      plot_title: compileText(plan, "\u8DEF\u7A0B\u968F\u65F6\u95F4\u53D8\u5316"),
      curve_label: "s = v t",
      current_state: compileText(plan, "\u5F53\u524D\u72B6\u6001"),
      link_label: compileText(plan, "\u540C\u4E00\u65F6\u523B"),
      group_label: compileText(plan, "\u5300\u901F\u8FD0\u52A8\u4E0E\u8DEF\u7A0B\u2014\u65F6\u95F4\u56FE\u50CF")
    }
  });
  return { actions: built.actions, whole: built.whole, parts: new Map(Object.entries(built.parts)) };
}
var PHYSICS_COMPILERS = {
  spring_and_mass: compileSpringAndMass,
  constant_speed_motion: compileConstantSpeedMotion
};

// src/plugins/shared-compilers.ts
function compileProcessDiagram(base, content, role, placement, plan, path) {
  const input = parameters(content);
  allowParameterKeys(input, ["title", "steps"], path);
  const steps = optionalStringArray(input.steps, [compileText(plan, "\u5F00\u59CB"), compileText(plan, "\u89C2\u5BDF\u53D8\u5316"), compileText(plan, "\u5F97\u5230\u7ED3\u8BBA")], `${path}.steps`);
  const built = buildProcessDiagram({
    as: base,
    role,
    place: placement,
    title: optionalText(input.title, compileText(plan, "\u8FC7\u7A0B\u56FE"), `${path}.title`),
    steps: steps.map((label) => ({ label })),
    link_label: compileText(plan, "\u4E0B\u4E00\u6B65")
  });
  return { actions: built.actions, whole: built.whole, parts: new Map(Object.entries(built.parts)) };
}
var SHARED_COMPILERS = {
  process_diagram: compileProcessDiagram
};

// src/plugins/compilers.ts
var PLUGIN_COMPILERS = {
  math: MATH_COMPILERS,
  physics: PHYSICS_COMPILERS,
  chemistry: {},
  biology: {},
  earth_space: {},
  shared: SHARED_COMPILERS
};
var VISUAL_COMPILERS = {
  ...MATH_COMPILERS,
  ...PHYSICS_COMPILERS,
  ...SHARED_COMPILERS
};

// src/lesson-plan-compiler.ts
function normalizedVisualIdentity(content, includeNumbers = true) {
  const sourceParameters = content.parameters ?? {};
  const parameters3 = Object.fromEntries(
    LESSON_PLAN_CAPABILITY_REGISTRY[content.capability].semantic_parameters.filter((name) => sourceParameters[name] !== void 0).map((name) => [name, sourceParameters[name]])
  );
  const normalize2 = (value2) => {
    if (Array.isArray(value2)) return value2.map(normalize2);
    if (!value2 || typeof value2 !== "object") return value2;
    return Object.fromEntries(
      Object.entries(value2).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, normalize2(child)])
    );
  };
  return JSON.stringify(normalize2({
    capability: content.capability,
    parameters: parameters3,
    ...includeNumbers ? { numbers: content.numbers ?? [] } : {}
  }));
}
function mergeEquivalentVisualInputs(plan) {
  const groups = /* @__PURE__ */ new Map();
  for (const section of plan.sections) {
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "create" || action.kind !== "visual") continue;
        const content = action.content;
        const identity = normalizedVisualIdentity(content, false);
        const group = groups.get(identity) ?? [];
        group.push(content);
        groups.set(identity, group);
      }
    }
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const inputs = [...new Set(group.flatMap((content) => content.numbers ?? []))];
    const limit = LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[group[0].capability];
    if (inputs.length > limit) continue;
    for (const content of group) content.numbers = [...inputs];
  }
}
function lessonPlanPlugins(plan) {
  const installed = new Map(INSTALLED_PLUGINS.map((plugin) => [plugin.manifest.id, plugin.manifest]));
  const used = /* @__PURE__ */ new Set();
  const add = (id) => {
    if (used.has(id)) return;
    used.add(id);
    for (const dependency of Object.keys(installed.get(id)?.depends ?? {})) add(dependency);
  };
  for (const section of plan.sections) for (const moment of section.moments) for (const action of moment.actions) {
    if (action.action !== "create" || action.kind !== "visual") continue;
    add(RECIPE_PLUGIN[action.content.capability]);
  }
  return Object.fromEntries([...used].sort().map((id) => [id, installed.get(id).version]));
}
function intersectProgramRange(definition, allowedMin, allowedMax) {
  let min = Math.max(definition.min, allowedMin);
  let max = Math.min(definition.max, allowedMax);
  if (!(min < max)) {
    min = allowedMin;
    max = allowedMax;
  }
  definition.min = min;
  definition.max = max;
  definition.initial = Math.min(max, Math.max(min, definition.initial));
  if (definition.student_control) definition.student_control.step = (max - min) / 200;
}
function positiveProgramRange(definition) {
  if (definition.max <= 0) {
    definition.min = 0.1;
    definition.max = 5;
    definition.initial = 1;
  } else {
    const positiveMinimum = Math.max(1e-6, definition.max / 1e3);
    definition.min = Math.max(definition.min, positiveMinimum);
    if (!(definition.min < definition.max)) definition.min = Math.max(1e-6, definition.max / 200);
    definition.initial = Math.min(definition.max, Math.max(definition.min, definition.initial));
  }
  if (definition.student_control) {
    definition.student_control.step = (definition.max - definition.min) / 200;
  }
}
function positiveIntegerProgramRange(definition, maximum) {
  const min = Math.max(1, Math.ceil(definition.min));
  const max = Math.min(maximum, Math.floor(definition.max));
  if (min <= max) {
    definition.min = min;
    definition.max = max;
    definition.initial = Math.min(max, Math.max(min, Math.round(definition.initial)));
  } else {
    definition.min = 1;
    definition.max = maximum;
    definition.initial = Math.min(maximum, Math.max(1, Math.round(definition.initial)));
  }
  if (definition.student_control) definition.student_control.step = 1;
}
function normalizeProgramOwnedNumberRanges(plan) {
  const constrained = /* @__PURE__ */ new Set();
  const integerSides = /* @__PURE__ */ new Set();
  const publishedPlotNumbers = /* @__PURE__ */ new Set();
  for (const [sectionIndex, section] of plan.sections.entries()) {
    const newPlotNumbers = /* @__PURE__ */ new Set();
    for (const [momentIndex, moment] of section.moments.entries()) {
      for (const [actionIndex, action] of moment.actions.entries()) {
        if (action.action !== "create" && action.action !== "revise" || action.kind !== "visual") continue;
        const content = action.content;
        const bound = RECIPE_HOOKS[content.capability]?.bound_numbers?.(content);
        if (bound?.length) content.numbers = bound;
        else if (bound) delete content.numbers;
        if (content.capability === "function_plot") {
          for (const number of bound ?? []) newPlotNumbers.add(number);
        }
        const policies = LESSON_PLAN_CAPABILITY_REGISTRY[content.capability].number_input_policies;
        for (const [inputIndex, numberIndex] of (content.numbers ?? []).entries()) {
          const definition = plan.numbers?.[numberIndex - 1];
          const policy = policies[inputIndex];
          if (!definition || !policy) continue;
          if (RECIPE_HOOKS[content.capability]?.free_number?.(content, inputIndex)) continue;
          const path = `$lessonPlan.sections[${sectionIndex}].moments[${momentIndex}].actions[${actionIndex}].content.parameters`;
          const prior = publishedPlotNumbers.has(numberIndex) ? { min: definition.min, max: definition.max, initial: definition.initial, step: definition.student_control?.step } : void 0;
          if (policy.kind === "side_count") {
            integerSides.add(numberIndex);
            intersectProgramRange(definition, 3, 384);
            definition.min = Math.ceil(definition.min);
            definition.max = Math.floor(definition.max);
            if (definition.min >= definition.max) {
              definition.min = 3;
              definition.max = 384;
            }
            definition.initial = Math.min(definition.max, Math.max(definition.min, Math.round(definition.initial)));
            if (definition.student_control) definition.student_control.step = 1;
            constrained.add(numberIndex);
          } else if (policy.kind === "bounded") {
            intersectProgramRange(definition, policy.min, policy.max);
            constrained.add(numberIndex);
          } else if (policy.kind === "positive") {
            positiveProgramRange(definition);
            constrained.add(numberIndex);
          } else if (policy.kind === "positive_integer") {
            positiveIntegerProgramRange(definition, policy.max);
            constrained.add(numberIndex);
          } else if (policy.kind === "surface_section") {
            const allowed = RECIPE_HOOKS[content.capability]?.section_range?.(content, path);
            if (allowed && allowed.min < allowed.max) {
              intersectProgramRange(definition, allowed.min, allowed.max);
              constrained.add(numberIndex);
            }
          }
          if (prior && (definition.min !== prior.min || definition.max !== prior.max || definition.initial !== prior.initial || definition.student_control?.step !== prior.step)) {
            fail2(
              "LESSON_PLAN_INTERACTION_MISMATCH",
              path,
              `Use a number that fits this visual without changing number ${numberIndex} in the published graph`
            );
          }
        }
      }
    }
    for (const number of newPlotNumbers) publishedPlotNumbers.add(number);
  }
  if (constrained.size === 0) return;
  for (const section of plan.sections) {
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "animate" || !constrained.has(action.number)) continue;
        const definition = plan.numbers[action.number - 1];
        action.end_value = Math.min(definition.max, Math.max(definition.min, integerSides.has(action.number) ? Math.round(action.end_value) : action.end_value));
      }
    }
    for (const activity of section.student_activities ?? []) {
      if (activity.kind !== "number_target") continue;
      const number = activity.number_controls[0]?.number;
      if (!number || !constrained.has(number)) continue;
      const definition = plan.numbers[number - 1];
      const original = activity.value;
      activity.value = Math.min(definition.max, Math.max(definition.min, integerSides.has(number) ? Math.round(activity.value) : activity.value));
      activity.tolerance = Math.max(
        (definition.student_control?.step ?? (definition.max - definition.min) / 200) / 2,
        (definition.max - definition.min) / 1e3,
        1e-6
      );
      if (activity.value !== original) {
        const value2 = Number(activity.value.toPrecision(12));
        const label = definition.label?.trim() || compileText(plan, "\u6570\u503C");
        const unit = definition.unit?.trim();
        activity.prompt = compileText(plan, "\u8BF7\u628A{{v0}}\u8C03\u5230 {{v1}}{{v2}}\u3002", { v0: label, v1: value2, v2: unit ? ` ${unit}` : "" });
        activity.success_message = compileText(plan, "\u5B8C\u6210\uFF0C{{v0}}\u5DF2\u7ECF\u8C03\u5230 {{v1}}{{v2}}\u3002", { v0: label, v1: value2, v2: unit ? ` ${unit}` : "" });
      }
    }
  }
}
function compileVisual(base, content, role, placement, plan, path) {
  if ((content.numbers?.length ?? 0) > LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[content.capability]) {
    fail2(
      "LESSON_PLAN_COMPILER_CONTROL_LIMIT",
      `${path}.numbers`,
      `'${content.capability}' supports at most ${LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[content.capability]} numeric inputs`
    );
  }
  const compiler = VISUAL_COMPILERS[content.capability];
  if (!compiler) fail2("LESSON_PLAN_COMPILER_CAPABILITY", path, `no compiler is registered for '${String(content.capability)}'`);
  return compiler(base, content, role, placement, plan, path);
}
function compilePlainContent(kind, content, options, path) {
  if (kind === "text" || kind === "shape") return { text: content.text };
  if (kind === "math") return { latex: content.latex };
  if (kind === "note") {
    const note = content;
    return { title: note.title, items: [...note.items] };
  }
  if (kind === "table") {
    const table = content;
    return { columns: [...table.columns], rows: table.rows.map((row) => [...row]) };
  }
  if (kind === "image") {
    const image = content;
    const resource = options.image_resources?.[image.resource - 1];
    if (!resource) fail2("LESSON_PLAN_IMAGE_RESOURCE", `${path}.resource`, "image resource is unavailable");
    return { asset_id: resource.asset_id, ...image.alt ? { alt: image.alt } : {} };
  }
  fail2("LESSON_PLAN_COMPILER", path, `unsupported plain board kind '${kind}'`);
}
function compileLessonPlan(value2, options = {}) {
  const resolved = resolveLessonPlan(value2, options);
  const plan = resolved.plan;
  setLessonTextLanguage(plan, options.language);
  for (const hooks of PLUGIN_HOOKS) hooks.normalize_plan?.(plan);
  for (const hooks of PLUGIN_HOOKS) hooks.check_plan?.(plan);
  normalizeProgramOwnedNumberRanges(plan);
  mergeEquivalentVisualInputs(plan);
  for (const [sectionIndex, section] of plan.sections.entries()) for (const moment of section.moments) for (const action of moment.actions) {
    if (action.action !== "create" || action.kind !== "visual") continue;
    const visual = action.content;
    RECIPE_HOOKS[visual.capability]?.before_compile?.(visual, plan, sectionIndex);
  }
  const resolvedReferences = new Map(resolved.references.map((item) => [item.path, item]));
  const wholeTargets = /* @__PURE__ */ new Map();
  const partTargets = /* @__PURE__ */ new Map();
  const primaryScenes = /* @__PURE__ */ new Map();
  const reusableVisuals = /* @__PURE__ */ new Map();
  const viewAdjustments = [];
  let renderedVisuals;
  const reuseCompiledVisual = (visual) => {
    if (reusableVisuals.size === 0) return visual;
    if (!renderedVisuals) {
      renderedVisuals = new CompiledVisualRegistry();
      for (const earlier of reusableVisuals.values()) renderedVisuals.reuse(earlier);
    }
    return renderedVisuals.reuse(visual);
  };
  const resolvedReference = (path) => {
    const item = resolvedReferences.get(path);
    if (!item) fail2("LESSON_PLAN_COMPILER_REFERENCE", path, "validated reference was not recorded");
    return item;
  };
  const reference = (path) => {
    const item = resolvedReference(path);
    if (!item.part) return wholeTargets.get(item.authoring_alias) ?? item.authoring_alias;
    if (item.part.kind === "capability") {
      const result = partTargets.get(item.authoring_alias)?.get(item.part.role);
      if (!result) fail2("LESSON_PLAN_COMPILER_REFERENCE", path, `capability part '${item.part.role}' was not produced`);
      return result;
    }
    if (item.part.kind === "index") return `${item.authoring_alias}#part-${pad2(item.part.index)}`;
    fail2("LESSON_PLAN_COMPILER_REFERENCE", path, "unsupported reference part");
  };
  const steps = [];
  plan.sections.forEach((section, sectionOffset) => {
    const sectionIndex = sectionOffset + 1;
    const sectionPath = `$lessonPlan.sections[${sectionOffset}]`;
    const beats = [];
    section.moments.forEach((moment, momentOffset) => {
      const momentIndex = momentOffset + 1;
      const momentPath = `${sectionPath}.moments[${momentOffset}]`;
      const actions = [];
      let boardItemIndex = 0;
      let connectionIndex = 0;
      let groupIndex = 0;
      moment.actions.forEach((item, actionOffset) => {
        const actionPath = `${momentPath}.actions[${actionOffset}]`;
        if (item.action === "create") {
          boardItemIndex += 1;
          const alias = `section-${pad2(sectionIndex)}-moment-${pad2(momentIndex)}-item-${pad2(boardItemIndex)}`;
          const placement = place(item.placement, `${actionPath}.placement`, reference);
          if (item.kind === "visual") {
            const visualContent = item.content;
            const identity = normalizedVisualIdentity(visualContent);
            const existing = reusableVisuals.get(identity);
            if (item.distinct_visual && existing) {
              fail2(
                "LESSON_PLAN_COURSE_VISUAL",
                `${actionPath}.content.parameters`,
                "an explicit comparison must differ in teaching content, not only in title, viewport, camera, color, sampling, or layout"
              );
            }
            const visual = existing ?? (() => {
              const compiledVisual = compileVisual(alias, visualContent, item.role, placement, plan, `${actionPath}.content.parameters`);
              for (const adjustment of compiledVisual.adjustments ?? []) viewAdjustments.push({ section: sectionIndex, ...adjustment });
              return reuseCompiledVisual(compiledVisual);
            })();
            if (existing) {
              actions.push({
                do: "focus",
                targets: [existing.whole],
                intent: compileText(plan, "\u7EE7\u7EED\u89C2\u5BDF\u5DF2\u6709\u7684\u540C\u4E00\u753B\u9762"),
                ...actionWhen(item.timing)
              });
            } else {
              reusableVisuals.set(identity, visual);
              actions.push(...visual.actions.map((action) => ({ ...action, ...actionWhen(item.timing) })));
            }
            wholeTargets.set(alias, visual.whole);
            partTargets.set(alias, visual.parts);
            if (visual.primaryScene) primaryScenes.set(alias, visual.primaryScene);
          } else {
            actions.push({
              do: "write",
              as: alias,
              kind: item.kind,
              role: item.role,
              content: compilePlainContent(item.kind, item.content, options, `${actionPath}.content`),
              place: placement,
              ...actionWhen(item.timing)
            });
            wholeTargets.set(alias, alias);
          }
        } else if (item.action === "revise") {
          const target = reference(`${actionPath}.reference`);
          if (item.kind === "visual" || item.content.capability) {
            fail2("LESSON_PLAN_COMPILER_UNSUPPORTED_REVISION", `${actionPath}.content`, "visual capability revision is not in the first compiler batch");
          }
          const content = item.content;
          actions.push({
            do: "revise",
            target,
            content: compilePlainContent(item.kind, content, options, `${actionPath}.content`),
            reason: item.reason,
            ...actionWhen(item.timing)
          });
        } else if (item.action === "emphasize") {
          actions.push({ do: "emphasize", target: reference(`${actionPath}.reference`), emphasis: item.emphasis, ...actionWhen(item.timing) });
        } else if (item.action === "connect") {
          connectionIndex += 1;
          const alias = `section-${pad2(sectionIndex)}-moment-${pad2(momentIndex)}-connection-${pad2(connectionIndex)}`;
          actions.push({
            do: "connect",
            as: alias,
            from: reference(`${actionPath}.from_ref`),
            to: reference(`${actionPath}.to_ref`),
            relation: item.relation,
            ...item.label ? { label: item.label } : {},
            ...actionWhen(item.timing)
          });
          wholeTargets.set(alias, alias);
        } else if (item.action === "group") {
          groupIndex += 1;
          const alias = `section-${pad2(sectionIndex)}-moment-${pad2(momentIndex)}-group-${pad2(groupIndex)}`;
          actions.push({
            do: "group",
            as: alias,
            role: item.role,
            label: item.label,
            members: item.members.map((_member, index) => reference(`${actionPath}.members[${index}]`)),
            ...actionWhen(item.timing)
          });
          wholeTargets.set(alias, alias);
        } else if (item.action === "focus") {
          actions.push({
            do: "focus",
            targets: item.references.map((_item, index) => reference(`${actionPath}.references[${index}]`)),
            intent: item.intent,
            ...actionWhen(item.timing)
          });
        } else if (item.action === "point_at") {
          actions.push({ do: "point", target: reference(`${actionPath}.reference`), ...actionWhen(item.timing) });
        } else if (item.action === "teacher_expression") {
          actions.push({ do: "expression", expression: item.expression, ...actionWhen(item.timing) });
        } else {
          actions.push({
            do: "animate",
            variable: variableAlias(item.number),
            value: item.end_value,
            ...item.easing ? { easing: item.easing } : {},
            ...item.duration_intent ? { duration_intent: item.duration_intent } : {},
            ...actionWhen(item.timing)
          });
        }
      });
      if (actions.length === 0) {
        fail2("LESSON_PLAN_COMPILER_EMPTY_BEAT", `${momentPath}.actions`, "OLL requires at least one action per moment");
      }
      includeWrittenCardsInFocus(actions);
      beats.push({
        key: `moment-${pad2(momentIndex)}`,
        ...moment.restart_numbers?.length ? { start: { kind: "replay", variables: moment.restart_numbers.map(variableAlias) } } : {},
        // The model sometimes writes a formula placeholder (n1) in spoken or
        // written text; learners hear and read the number's own symbol.
        ...moment.narration ? { say: namedNumbers(moment.narration, plan) } : {},
        ...moment.delivery ? { delivery: moment.delivery } : {},
        actions
      });
    });
    steps.push({ key: `section-${pad2(sectionIndex)}`, purpose: section.purpose, beats });
  });
  const tasks = [];
  const reflections = [];
  const seenTaskSemantics = /* @__PURE__ */ new Set();
  const addTask = (task) => {
    const semanticKey = JSON.stringify({
      allowed_operations: task.allowed_operations,
      completion: task.completion
    });
    if (seenTaskSemantics.has(semanticKey)) return;
    seenTaskSemantics.add(semanticKey);
    if (options.construction_rules === "explicit-v1" && task.completion.kind === "expression_target") {
      task.start = { kind: "practice", variables: task.allowed_operations.flatMap((operation) => operation.kind === "variable_change" ? [operation.variable] : []) };
    }
    tasks.push(task);
  };
  plan.sections.forEach((section, sectionOffset) => {
    const sectionPath = `$lessonPlan.sections[${sectionOffset}]`;
    section.student_activities?.forEach((activity, activityOffset) => {
      const activityPath = `${sectionPath}.student_activities[${activityOffset}]`;
      if (activity.kind === "reflection") {
        const anchor = resolvedReference(`${activityPath}.reference`);
        reflections.push({
          as: `section-${pad2(sectionOffset + 1)}-reflection-${pad2(activityOffset + 1)}`,
          prompt: namedNumbers(activity.prompt, plan),
          answer: namedNumbers(activity.answer, plan),
          anchor: wholeTargets.get(anchor.authoring_alias) ?? anchor.authoring_alias,
          availability: { kind: "after_lesson" }
        });
        return;
      }
      const common = {
        as: `section-${pad2(sectionOffset + 1)}-task-${pad2(activityOffset + 1)}`,
        prompt: namedNumbers(activity.prompt, plan),
        availability: { kind: "after_lesson" },
        hints: activity.hints.map((hint) => namedNumbers(hint, plan)),
        ...activity.hint_after_attempts ? { hint_after_attempts: activity.hint_after_attempts } : {},
        ...activity.success_message ? { success_message: namedNumbers(activity.success_message, plan) } : {}
      };
      if (activity.kind === "number_target") {
        const firstNumber = activity.number_controls[0]?.number;
        if (!firstNumber) fail2("LESSON_PLAN_ACTIVITY", `${activityPath}.number_controls`, "number task requires controls");
        addTask({
          ...common,
          allowed_operations: activity.number_controls.map((control) => ({
            kind: "variable_change",
            variable: variableAlias(control.number),
            controls: [...control.controls]
          })),
          completion: {
            kind: "expression_target",
            expression: activity.expression ? mathExpressionToOll(activity.expression) : variableAlias(firstNumber),
            value: activity.value,
            tolerance: activity.tolerance
          }
        });
      } else if (activity.kind === "numeric_answer") {
        const anchor = resolvedReference(`${activityPath}.reference`);
        const tolerance = Math.max(
          numericAnswerTolerance(activity.answer, compileMathExpression(activity.check, [])({})) ?? 0,
          roundingTolerance(activity.prompt, activity.answer) ?? 0
        );
        addTask({
          ...common,
          anchor: wholeTargets.get(anchor.authoring_alias) ?? anchor.authoring_alias,
          allowed_operations: [{ kind: "answer_entry" }],
          completion: {
            kind: "numeric_answer",
            answer: activity.answer,
            ...tolerance ? { tolerance } : {},
            ...activity.unit ? { unit: activity.unit } : {},
            ...activity.simplest_fraction ? { form: "simplest_fraction" } : {}
          }
        });
      } else {
        const resolvedTarget = resolvedReference(`${activityPath}.reference`);
        const node = primaryScenes.get(resolvedTarget.authoring_alias) ?? wholeTargets.get(resolvedTarget.authoring_alias) ?? resolvedTarget.authoring_alias;
        addTask({
          ...common,
          allowed_operations: [{ kind: "scene3d_view", node, controls: [...activity.controls] }],
          completion: {
            kind: "scene3d_view_target",
            node,
            match: activity.match,
            yaw: activity.yaw,
            pitch: activity.pitch,
            zoom: activity.zoom,
            angular_tolerance: activity.angular_tolerance,
            zoom_tolerance: activity.zoom_tolerance
          }
        });
      }
    });
  });
  const hostReferences = options.host_references ?? [];
  if (hostReferences.length > 0 && !options.board_context) {
    fail2("LESSON_PLAN_BOARD_CONTEXT", "$options.board_context", "host references require board context");
  }
  const closeFocus = plan.close.focus.map((_item, index) => reference(`$lessonPlan.close.focus[${index}]`));
  const lesson = {
    dsl: "octos.lesson",
    version: "0.1",
    profile: "authoring",
    ...options.board_context ? {
      board_context: {
        board_id: options.board_context.board_id,
        revision: options.board_context.revision,
        references: hostReferences.map((host, index) => ({
          as: `host-${pad2(index + 1)}`,
          type: host.type,
          target_id: host.target_id,
          ...host.label ? { label: host.label } : {},
          fragments: (host.parts ?? []).map((targetId, partOffset) => ({
            as: `part-${pad2(partOffset + 1)}`,
            target_id: targetId
          }))
        }))
      }
    } : {},
    lesson: {
      mode: "explain",
      language: options.language ?? "zh-CN",
      title: plan.title,
      goals: [...plan.goals],
      ...(plan.teaching_strategies?.length ?? 0) > 0 || (options.adaptation_context_refs?.length ?? 0) > 0 ? {
        adaptation: {
          ...plan.teaching_strategies?.length ? { strategies: [...plan.teaching_strategies] } : {},
          ...options.adaptation_context_refs?.length ? { context_refs: [...options.adaptation_context_refs] } : {}
        }
      } : {},
      ...plan.numbers?.length ? {
        variables: plan.numbers.map((number, index) => ({
          as: variableAlias(index + 1),
          initial: number.initial,
          min: number.min,
          max: number.max,
          ...number.label ? { label: number.label } : {},
          ...number.unit ? { unit: number.unit } : {},
          ...number.student_control ? {
            control: {
              kind: "slider",
              ...number.student_control.step ? { step: number.student_control.step } : {}
            }
          } : {}
        }))
      } : {},
      ...tasks.length ? { tasks } : {},
      ...reflections.length ? { reflections } : {}
    },
    steps,
    close: { summary: plan.close.summary, focus: closeFocus }
  };
  return { lesson: applyLessonOpeningPolicy(lesson, options.opening_policy ?? (options.construction_rules === "explicit-v1" ? { kind: "title" } : { kind: "preserve" })), resolved, plugins: lessonPlanPlugins(plan), view_adjustments: viewAdjustments };
}
function expressionReferencesVariable(expression, variable) {
  if (typeof expression !== "string") return false;
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`, "u").test(expression);
}
function validateCompiledVisualEffects(lesson) {
  const required = /* @__PURE__ */ new Map();
  (lesson.lesson.variables ?? []).forEach((variable, index) => {
    if (variable.control) required.set(variable.as, `$lesson.lesson.variables[${index}]`);
  });
  lesson.steps.forEach((step, stepIndex) => step.beats.forEach((beat, beatIndex) => {
    beat.actions.forEach((action, actionIndex) => {
      if (action.do === "animate") {
        required.set(action.variable, `$lesson.steps[${stepIndex}].beats[${beatIndex}].actions[${actionIndex}].variable`);
      }
    });
  }));
  (lesson.lesson.tasks ?? []).forEach((task, taskIndex) => {
    task.allowed_operations.forEach((operation, operationIndex) => {
      if (operation.kind === "variable_change") {
        required.set(operation.variable, `$lesson.lesson.tasks[${taskIndex}].allowed_operations[${operationIndex}].variable`);
      }
    });
  });
  if (required.size === 0) return;
  const visualExpressions = [];
  lesson.steps.forEach((step) => step.beats.forEach((beat) => beat.actions.forEach((action) => {
    if (action.do !== "write" || !["geometry", "plot", "scene3d", "number_line"].includes(action.kind)) return;
    const content = action.content;
    const bindings = Array.isArray(content.bindings) ? content.bindings : [];
    bindings.forEach((binding) => {
      if (binding && typeof binding === "object" && !Array.isArray(binding)) {
        visualExpressions.push(binding.expression);
      }
    });
    if (action.kind === "plot") {
      const curves = Array.isArray(content.curves) ? content.curves : [];
      curves.forEach((curve) => {
        if (curve && typeof curve === "object" && !Array.isArray(curve)) {
          visualExpressions.push(curve.expression);
        }
      });
    }
  })));
  for (const [variable, path] of required) {
    const matchingExpressions = visualExpressions.filter((expression) => expressionReferencesVariable(expression, variable));
    if (matchingExpressions.length === 0) {
      fail2(
        "LESSON_PLAN_COMPILED_NO_EFFECT",
        path,
        `numeric control '${variable}' does not affect any compiled visual`
      );
    }
    const definitions = lesson.lesson.variables ?? [];
    const definition = definitions.find((candidate) => candidate.as === variable);
    if (!definition) continue;
    const aliases = [.../* @__PURE__ */ new Set([...definitions.map((candidate) => candidate.as), "x", "y", "z"])];
    const baseValues = Object.fromEntries(definitions.map((candidate) => [candidate.as, candidate.initial]));
    const samples = [definition.min, (definition.min + definition.max) / 2, definition.max];
    const coordinates = [
      { x: -1, y: -1, z: -1 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
      { x: 2, y: -0.5, z: 0.5 }
    ];
    const changes = matchingExpressions.some((expression) => {
      if (typeof expression !== "string") return false;
      let evaluateExpression;
      try {
        evaluateExpression = compileMathExpression(expression, aliases);
      } catch {
        return false;
      }
      return coordinates.some((coordinate) => {
        const results = samples.map((sample) => {
          try {
            return evaluateExpression({ ...baseValues, ...coordinate, [variable]: sample });
          } catch {
            return Number.NaN;
          }
        }).filter(Number.isFinite);
        if (results.length < 2) return false;
        const spread = Math.max(...results) - Math.min(...results);
        const scale = Math.max(1, ...results.map((result) => Math.abs(result)));
        return spread > scale * 1e-9;
      });
    });
    if (!changes) {
      fail2(
        "LESSON_PLAN_COMPILED_NO_EFFECT",
        path,
        `numeric control '${variable}' is mentioned but does not change any compiled visual across its range`
      );
    }
  }
}
function compileAndValidateLessonPlan(value2, options = {}) {
  const compiled = compileLessonPlan(value2, options);
  validateCompiledVisualEffects(compiled.lesson);
  const schemaResult = validateAuthoringSchema(compiled.lesson);
  if (!schemaResult.valid) {
    const first = schemaResult.errors[0];
    fail2("LESSON_PLAN_OLL_SCHEMA", first?.instancePath ?? "$lesson", first?.message ?? "compiled OLL failed schema validation");
  }
  const resourceContext = {
    assets: (options.image_resources ?? []).map((resource) => ({ asset_id: resource.asset_id }))
  };
  try {
    validateAuthoringLesson(compiled.lesson, resourceContext);
    const events = normalizeAuthoringLesson(compiled.lesson, {
      lessonId: options.validation_host?.lesson_id ?? "lesson-plan-validation",
      boardId: options.validation_host?.board_id ?? options.board_context?.board_id ?? "lesson-plan-board",
      baseRevision: options.validation_host?.base_revision ?? options.board_context?.revision ?? 0,
      resourceContext
    });
    if (!compiled.lesson.board_context?.references.length) reduceCanonicalEvents(events);
  } catch (error) {
    fail2("LESSON_PLAN_OLL_SEMANTIC", "$lesson", error instanceof Error ? error.message : "compiled OLL failed semantic validation");
  }
  return compiled;
}

// src/lesson-plan-schema.ts
var capabilityNames = LESSON_PLAN_CAPABILITY_NAMES;
var timingNames = ["before_speech", "during_speech", "after_speech"];
var deliveryNames = ["neutral", "patient", "encouraging", "careful", "emphatic"];
var LESSON_PLAN_VISUAL_PARAMETER_NAMES = Object.fromEntries(
  capabilityNames.map((name) => [name, LESSON_PLAN_CAPABILITY_REGISTRY[name].parameter_names])
);
var LESSON_PLAN_MODEL_VISUAL_PARAMETER_NAMES = Object.fromEntries(
  capabilityNames.map((name) => [name, LESSON_PLAN_CAPABILITY_REGISTRY[name].model_parameter_names])
);
function object(properties, required = []) {
  return {
    type: "object",
    additionalProperties: false,
    ...required.length ? { required } : {},
    properties
  };
}
function vertexCompatible(value2) {
  const result = structuredClone(value2);
  let usesDecimal = false;
  const visit = (candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
    const record3 = candidate;
    delete record3.minItems;
    delete record3.maxItems;
    if (record3.type === "number") {
      usesDecimal = true;
      for (const key of Object.keys(record3)) delete record3[key];
      record3.$ref = "#/$defs/modelDecimal";
      return;
    }
    for (const child of Object.values(record3)) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(result);
  if (usesDecimal) {
    const definitions = result.$defs && typeof result.$defs === "object" && !Array.isArray(result.$defs) ? result.$defs : {};
    result.$defs = {
      ...definitions,
      modelDecimal: object({
        mantissa: { type: "integer", minimum: -1e12, maximum: 1e12 },
        scale: { enum: [0, 1, 2, 3, 4, 5, 6] }
      }, ["mantissa", "scale"])
    };
  }
  return result;
}
function coerceModelNumbers(value2, schema, path) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return value2;
  const shape = schema;
  if (shape.type === "number") {
    if (typeof value2 === "number" && Number.isFinite(value2)) return value2;
    if (typeof value2 === "string" && value2.length > 0 && value2.length <= 64 && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(value2)) {
      const legacyNumber = Number(value2);
      if (Number.isFinite(legacyNumber)) return legacyNumber;
    }
    if (!value2 || typeof value2 !== "object" || Array.isArray(value2)) {
      throw new LessonPlanError("LESSON_PLAN_MODEL_NUMBER", path, "expected { mantissa, scale } for a decimal number");
    }
    const decimal = value2;
    if (Object.keys(decimal).some((key) => key !== "mantissa" && key !== "scale") || !Number.isInteger(decimal.mantissa) || Math.abs(Number(decimal.mantissa)) > 1e12 || !Number.isInteger(decimal.scale) || Number(decimal.scale) < 0 || Number(decimal.scale) > 6) {
      throw new LessonPlanError("LESSON_PLAN_MODEL_NUMBER", path, "expected bounded integer mantissa and scale from 0 to 6");
    }
    const number = Number(decimal.mantissa) / 10 ** Number(decimal.scale);
    if (!Number.isFinite(number)) {
      throw new LessonPlanError("LESSON_PLAN_MODEL_NUMBER", path, "expected a finite decimal number");
    }
    return number;
  }
  if (shape.type === "array") {
    if (!Array.isArray(value2)) return value2;
    return value2.map((item, index) => coerceModelNumbers(item, shape.items, `${path}[${index}]`));
  }
  if (shape.type === "object") {
    if (!value2 || typeof value2 !== "object" || Array.isArray(value2)) return value2;
    const properties = shape.properties && typeof shape.properties === "object" && !Array.isArray(shape.properties) ? shape.properties : {};
    return Object.fromEntries(Object.entries(value2).map(([key, child]) => [
      key,
      coerceModelNumbers(child, properties[key], `${path}.${key}`)
    ]));
  }
  return value2;
}
function string(_maximumLength = 1200) {
  return { type: "string" };
}
function integer(minimum = 1, maximum) {
  return { type: "integer", minimum, ...maximum === void 0 ? {} : { maximum } };
}
function numberSchema() {
  return object({
    initial: { type: "number" },
    min: { type: "number" },
    max: { type: "number" },
    label: { type: "string" },
    unit: { type: "string" }
  }, ["initial", "min", "max"]);
}
function modelReusableBoardSchema() {
  return object({
    kind: { enum: ["board_item"] },
    board_kind: { enum: ["math", "note"] }
  }, ["kind", "board_kind"]);
}
function visualParametersSchema(allowedCapabilities) {
  const modelParameters = new Set(allowedCapabilities.flatMap(
    (capability2) => [...LESSON_PLAN_CAPABILITY_REGISTRY[capability2].model_parameter_names]
  ));
  const declared = {};
  if (modelParameters.has("title")) declared.title = string(240);
  for (const capability2 of allowedCapabilities) Object.assign(declared, RECIPE_SCHEMA_PROPERTIES[capability2]);
  const order = SCHEMA_PROPERTY_ORDER;
  const properties = Object.fromEntries([
    ...order.filter((name) => name in declared),
    ...Object.keys(declared).filter((name) => !order.includes(name))
  ].map((name) => [name, declared[name]]));
  const required = allowedCapabilities.length === 1 ? [...LESSON_PLAN_CAPABILITY_REGISTRY[allowedCapabilities[0]].required_model_schema_parameters] : [];
  return object(properties, required);
}
function modelAction(properties, required) {
  return object(properties, required);
}
function actionCollectionSchemas(allowedCapabilities, reusableCount, numberCount, allowedNumberIndexes = Array.from({ length: numberCount }, (_unused, index) => index + 1), courseVisualPositions = [], includeVisualCreates = true, includeVisualCapability = true) {
  const timing = { enum: timingNames };
  const collection = (items) => ({ type: "array", items });
  const createCommon = {
    timing,
    ...reusableCount > 0 ? { reusable_item: integer(1, reusableCount) } : {}
  };
  const requireVisualParameters = allowedCapabilities.length === 1 && LESSON_PLAN_CAPABILITY_REGISTRY[allowedCapabilities[0]].required_model_schema_parameters.length > 0;
  return {
    ...allowedCapabilities.length && includeVisualCreates ? {
      visual_creates: collection(modelAction({
        ...createCommon,
        ...courseVisualPositions.length > 0 ? { course_visual: { enum: courseVisualPositions } } : {},
        content: object({
          ...includeVisualCapability ? { capability: { enum: allowedCapabilities } } : {},
          parameters: visualParametersSchema(allowedCapabilities),
          ...numberCount > 0 ? {
            numbers: {
              type: "array",
              maxItems: Math.max(...allowedCapabilities.map(
                (capability2) => LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[capability2]
              )),
              items: { enum: allowedNumberIndexes }
            }
          } : {}
        }, [
          ...includeVisualCapability ? ["capability"] : [],
          ...requireVisualParameters ? ["parameters"] : []
        ])
      }, [...courseVisualPositions.length > 0 ? ["course_visual"] : [], "content"]))
    } : {},
    math_creates: collection(modelAction({
      ...createCommon,
      content: object({ latex: string() }, ["latex"])
    }, ["content"])),
    note_creates: collection(modelAction({
      ...createCommon,
      content: object({
        title: string(240),
        items: { type: "array", minItems: 1, maxItems: 24, items: string(480) }
      }, ["title", "items"])
    }, ["content"])),
    focuses: collection(modelAction({
      timing,
      intent: string(160)
    }, ["intent"])),
    points: collection(modelAction({ timing }, [])),
    ...allowedNumberIndexes.length > 0 ? {
      animations: collection(modelAction({
        timing,
        number: { enum: allowedNumberIndexes },
        end_value: { type: "number" },
        duration_intent: { enum: ["brief", "normal", "extended"] }
      }, ["number", "end_value"]))
    } : {}
  };
}
function courseVisualCreatesSchema(outline, sectionIndex, allowedNumberIndexes) {
  const numberCount = outline.numbers?.length ?? 0;
  const entries = (outline.course_visuals ?? []).map((visual, index) => ({ visual, position: index + 1 })).filter(({ visual }) => visual.create_section === sectionIndex);
  if (entries.length === 0) return void 0;
  const properties = Object.fromEntries(entries.map(({ visual, position }) => {
    const capability2 = visual.capability;
    const numberLimit = LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[capability2];
    return [`visual_${position}`, object({
      moment: integer(1, 12),
      timing: { enum: timingNames },
      content: object({
        parameters: visualParametersSchema([capability2]),
        ...numberCount > 0 && numberLimit > 0 && capability2 !== "function_plot" ? {
          numbers: {
            type: "array",
            maxItems: numberLimit,
            items: { enum: allowedNumberIndexes }
          }
        } : {}
      }, ["parameters"])
    }, ["moment", "content"])];
  }));
  return object(properties, Object.keys(properties));
}
function reusableBoardCreatesSchema(outline, sectionIndex) {
  const entries = (outline.sections[sectionIndex - 1]?.reusable_items ?? []).map((item, index) => ({ item, position: index + 1 })).filter(({ item }) => item.kind === "board_item" && item.board_kind !== "visual");
  if (entries.length === 0) return void 0;
  const properties = Object.fromEntries(entries.map(({ item, position }) => {
    let content;
    if (item.board_kind === "math") {
      content = object({ latex: string() }, ["latex"]);
    } else if (item.board_kind === "note") {
      content = object({
        title: string(240),
        items: { type: "array", minItems: 1, maxItems: 24, items: string(480) }
      }, ["title", "items"]);
    } else {
      throw new LessonPlanError(
        "LESSON_PLAN_REUSABLE",
        `$lessonPlanOutline.sections[${sectionIndex - 1}].reusable_items[${position - 1}]`,
        `the staged model path cannot create a reusable ${String(item.board_kind)} board item`
      );
    }
    return [`item_${position}`, object({
      moment: integer(1, 12),
      timing: { enum: timingNames },
      content
    }, ["moment", "content"])];
  }));
  return object(properties, Object.keys(properties));
}
function decimalIntegerFields(prefix) {
  return {
    [`${prefix}_mantissa`]: integer(-1e12, 1e12),
    [`${prefix}_scale`]: { enum: [0, 1, 2, 3, 4, 5, 6] }
  };
}
function activityCommonSchema() {
  return {
    prompt: string(480),
    hints: { type: "array", minItems: 1, maxItems: 8, items: string(480) },
    success_message: string(480)
  };
}
function numberActivitySchema(allowedNumberIndexes) {
  return object({
    ...activityCommonSchema(),
    number: { enum: allowedNumberIndexes },
    ...decimalIntegerFields("value")
  }, [
    "prompt",
    "number",
    "value_mantissa",
    "value_scale",
    "hints"
  ]);
}
function scene3dActivitySchema(sectionCount) {
  void sectionCount;
  return object({
    ...activityCommonSchema(),
    controls: { type: "array", minItems: 1, items: { enum: ["orbit", "zoom", "preset", "reset"] } },
    view_preset: { enum: ["top", "front", "right", "left", "isometric"] }
  }, [
    "prompt",
    "controls",
    "view_preset",
    "hints"
  ]);
}
function outlineShape(value2) {
  if (!value2 || typeof value2 !== "object" || Array.isArray(value2)) {
    throw new LessonPlanError("LESSON_PLAN_OUTLINE", "$lessonPlanOutline", "expected an object");
  }
  const outline = value2;
  if (!Array.isArray(outline.sections) || outline.sections.length === 0) {
    throw new LessonPlanError("LESSON_PLAN_OUTLINE", "$lessonPlanOutline.sections", "outline requires sections");
  }
  return outline;
}
function bootstrapPermissiveOutline() {
  return {
    sections: [{
      purpose: "combined first response",
      allowed_capabilities: capabilityNames,
      reusable_items: []
    }],
    numbers: Array.from({ length: 16 }, () => ({ initial: 0, min: 0, max: 1 }))
  };
}
function buildLessonPlanOutlineJsonSchema(requestPartCount = 0) {
  if (!Number.isInteger(requestPartCount) || requestPartCount < 0 || requestPartCount > 64) {
    throw new LessonPlanError("LESSON_PLAN_REQUEST_COVERAGE", "$requestPartCount", "expected an integer from 0 to 64");
  }
  return vertexCompatible(lessonPlanOutlineShapeJsonSchema(requestPartCount));
}
function buildLessonPlanAdmissionOutlineJsonSchema(requestPartCount = 0) {
  if (!Number.isInteger(requestPartCount) || requestPartCount < 0 || requestPartCount > 64) {
    throw new LessonPlanError("LESSON_PLAN_REQUEST_COVERAGE", "$requestPartCount", "expected an integer from 0 to 64");
  }
  const course = lessonPlanOutlineShapeJsonSchema(requestPartCount);
  course.nullable = true;
  return vertexCompatible({
    ...object({
      disposition: { enum: ["generate_lesson", "clarify", "ignore"] },
      learner_response: string(480),
      course
    }, ["disposition", "learner_response", "course"])
  });
}
function buildLessonPlanBootstrapJsonSchema(requestPartCount = 0) {
  if (!Number.isInteger(requestPartCount) || requestPartCount < 0 || requestPartCount > 64) {
    throw new LessonPlanError("LESSON_PLAN_REQUEST_COVERAGE", "$requestPartCount", "expected an integer from 0 to 64");
  }
  return vertexCompatible(object({
    outline: lessonPlanOutlineShapeJsonSchema(requestPartCount),
    first_section: lessonPlanSectionDraftShapeJsonSchema(bootstrapPermissiveOutline(), 1, true)
  }, ["outline", "first_section"]));
}
function buildLessonPlanAdmissionBootstrapJsonSchema(requestPartCount = 0) {
  if (!Number.isInteger(requestPartCount) || requestPartCount < 0 || requestPartCount > 64) {
    throw new LessonPlanError("LESSON_PLAN_REQUEST_COVERAGE", "$requestPartCount", "expected an integer from 0 to 64");
  }
  const course = object({
    outline: lessonPlanOutlineShapeJsonSchema(requestPartCount),
    first_section: lessonPlanSectionDraftShapeJsonSchema(bootstrapPermissiveOutline(), 1, true)
  }, ["outline", "first_section"]);
  course.nullable = true;
  return vertexCompatible(object({
    disposition: { enum: ["generate_lesson", "clarify", "ignore"] },
    learner_response: string(480),
    course
  }, ["disposition", "learner_response", "course"]));
}
function buildCameraLessonPlanAdmissionBootstrapJsonSchema(requestPartCount = 0) {
  if (!Number.isInteger(requestPartCount) || requestPartCount < 0 || requestPartCount > 64) {
    throw new LessonPlanError("LESSON_PLAN_REQUEST_COVERAGE", "$requestPartCount", "expected an integer from 0 to 64");
  }
  const course = object({
    outline: lessonPlanOutlineShapeJsonSchema(requestPartCount),
    first_section: lessonPlanSectionDraftShapeJsonSchema(bootstrapPermissiveOutline(), 1, true)
  }, ["outline", "first_section"]);
  course.nullable = true;
  return vertexCompatible(object({
    disposition: { enum: ["generate_lesson", "clarify", "ignore"] },
    learner_response: string(480),
    image_observation: object({
      readability: { enum: ["readable", "partially_readable", "unreadable"] },
      observed_content: string(4e3),
      uncertainties: { type: "array", maxItems: 12, items: string(480) }
    }, ["readability", "observed_content", "uncertainties"]),
    course
  }, ["disposition", "learner_response", "image_observation", "course"]));
}
function buildCameraLessonPlanAdmissionOutlineJsonSchema(requestPartCount = 0) {
  if (!Number.isInteger(requestPartCount) || requestPartCount < 0 || requestPartCount > 64) {
    throw new LessonPlanError("LESSON_PLAN_REQUEST_COVERAGE", "$requestPartCount", "expected an integer from 0 to 64");
  }
  const course = lessonPlanOutlineShapeJsonSchema(requestPartCount);
  course.nullable = true;
  return vertexCompatible({
    ...object({
      disposition: { enum: ["generate_lesson", "clarify", "ignore"] },
      learner_response: string(480),
      image_observation: object({
        readability: { enum: ["readable", "partially_readable", "unreadable"] },
        observed_content: string(4e3),
        uncertainties: { type: "array", maxItems: 12, items: string(480) }
      }, ["readability", "observed_content", "uncertainties"]),
      course
    }, ["disposition", "learner_response", "image_observation", "course"])
  });
}
function lessonPlanOutlineShapeJsonSchema(requestPartCount) {
  return object({
    title: string(160),
    goals: { type: "array", minItems: 1, maxItems: 8, items: string(480) },
    teaching_strategies: { type: "array", maxItems: 16, items: string(240) },
    numbers: { type: "array", maxItems: 16, items: numberSchema() },
    ...requestPartCount > 0 ? {
      request_coverage: {
        type: "array",
        minItems: requestPartCount,
        maxItems: requestPartCount,
        items: object({
          treatment: { enum: ["teach", "unsupported"] },
          sections: { type: "array", maxItems: 24, items: integer(1, 24) },
          reason: string(480)
        }, ["treatment", "sections"])
      }
    } : {},
    course_visuals: {
      type: "array",
      maxItems: 32,
      items: object({
        required_features: {
          type: "array",
          minItems: 1,
          maxItems: LESSON_PLAN_VISUAL_FEATURES.length,
          items: { enum: LESSON_PLAN_VISUAL_FEATURES }
        },
        use_sections: { type: "array", maxItems: 24, items: integer(1, 24) },
        relation: { enum: ["primary", "supporting", "comparison"] },
        related_visual: integer(1, 32)
      }, ["required_features", "use_sections", "relation"])
    },
    sections: {
      type: "array",
      minItems: 1,
      maxItems: 24,
      items: object({
        purpose: string(480),
        reusable_items: { type: "array", maxItems: 32, items: modelReusableBoardSchema() }
      }, ["purpose"])
    },
    close: object({
      summary: string()
    }, ["summary"])
  }, ["title", "goals", ...requestPartCount > 0 ? ["request_coverage"] : [], "course_visuals", "sections", "close"]);
}
function coerceLessonPlanOutlineModelNumbers(value2, requestPartCount = 0) {
  if (!Number.isInteger(requestPartCount) || requestPartCount < 0 || requestPartCount > 64) {
    throw new LessonPlanError("LESSON_PLAN_REQUEST_COVERAGE", "$requestPartCount", "expected an integer from 0 to 64");
  }
  return coerceModelNumbers(value2, lessonPlanOutlineShapeJsonSchema(requestPartCount), "$lessonPlanOutline");
}
function answerActivitiesSchema() {
  return {
    type: "array",
    maxItems: 2,
    items: object({
      prompt: string(480),
      answer: string(64),
      check: string(256),
      unit: string(16),
      simplest_fraction: { type: "boolean" },
      hints: { type: "array", minItems: 1, maxItems: 3, items: string(480) }
    }, ["prompt", "answer", "check", "hints"])
  };
}
function buildLessonPlanPracticeJsonSchema() {
  return object({ answer_activities: answerActivitiesSchema() }, ["answer_activities"]);
}
function buildLessonPlanSectionDraftJsonSchema(outlineValue, sectionIndex, allowedNumberIndexes) {
  return vertexCompatible(lessonPlanSectionDraftShapeJsonSchema(
    outlineValue,
    sectionIndex,
    false,
    allowedNumberIndexes
  ));
}
function lessonPlanSectionDraftShapeJsonSchema(outlineValue, sectionIndex, bootstrapPermissive = false, suppliedNumberIndexes) {
  const outline = outlineShape(outlineValue);
  if (!Number.isInteger(sectionIndex) || sectionIndex < 1 || sectionIndex > outline.sections.length) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$section", "section is outside the outline");
  }
  const section = outline.sections[sectionIndex - 1];
  const allowedCapabilities = section.allowed_capabilities;
  if (!Array.isArray(allowedCapabilities) || allowedCapabilities.some((item) => !capabilityNames.includes(item))) {
    throw new LessonPlanError("LESSON_PLAN_CAPABILITY", `$lessonPlanOutline.sections[${sectionIndex - 1}].allowed_capabilities`, "outline has invalid capabilities");
  }
  const reusableCount = section.reusable_items?.length ?? 0;
  const numberCount = outline.numbers?.length ?? 0;
  const allowedNumberIndexes = suppliedNumberIndexes === void 0 ? Array.from({ length: numberCount }, (_unused, index) => index + 1) : [...new Set(suppliedNumberIndexes)].sort((left, right) => left - right);
  if (allowedNumberIndexes.some((index) => !Number.isInteger(index) || index < 1 || index > numberCount)) {
    throw new LessonPlanError(
      "LESSON_PLAN_NUMBER_REFERENCE",
      "$allowedNumberIndexes",
      "allowed number indexes must reference outline numbers"
    );
  }
  const courseVisualCreates = bootstrapPermissive ? void 0 : courseVisualCreatesSchema(outline, sectionIndex, allowedNumberIndexes);
  const reusableBoardCreates = bootstrapPermissive ? void 0 : reusableBoardCreatesSchema(outline, sectionIndex);
  const actionCollections = actionCollectionSchemas(
    allowedCapabilities,
    bootstrapPermissive ? 24 : 0,
    numberCount,
    allowedNumberIndexes,
    bootstrapPermissive ? Array.from({ length: 16 }, (_unused, index) => index + 1) : (outline.course_visuals ?? []).map((visual, index) => ({ visual, position: index + 1 })).filter(({ visual }) => visual.create_section === sectionIndex).map(({ position }) => position),
    bootstrapPermissive,
    !bootstrapPermissive
  );
  const supportsNumberActivity = allowedNumberIndexes.length > 0;
  const sectionVisualCapabilities = (outline.course_visuals ?? []).filter((visual) => visual.use_sections.includes(sectionIndex)).map((visual) => visual.capability);
  const supportsScene3dActivity = [...allowedCapabilities, ...sectionVisualCapabilities].some((capability2) => LESSON_PLAN_CAPABILITY_REGISTRY[capability2].output_kinds.includes("scene3d"));
  const activityProperties = {
    // Thinking questions close later sections; the bootstrap request that
    // produces the first playable section stays as small as before.
    ...bootstrapPermissive ? {} : {
      reflection_activities: {
        type: "array",
        maxItems: 2,
        items: object({ prompt: string(), answer: string() }, ["prompt", "answer"])
      },
      answer_activities: answerActivitiesSchema()
    },
    ...supportsNumberActivity ? {
      number_activities: {
        type: "array",
        maxItems: 16,
        items: numberActivitySchema(allowedNumberIndexes)
      }
    } : {},
    ...supportsScene3dActivity ? {
      scene3d_activities: {
        type: "array",
        maxItems: 16,
        items: scene3dActivitySchema(outline.sections.length)
      }
    } : {}
  };
  const schema = object({
    moments: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: object({
        narration: string(),
        delivery: { enum: deliveryNames },
        ...allowedNumberIndexes.length ? { restart_numbers: { type: "array", minItems: 1, maxItems: 16, items: { enum: allowedNumberIndexes } } } : {},
        ...actionCollections
      }, ["narration", "delivery"])
    },
    ...courseVisualCreates ? { course_visual_creates: courseVisualCreates } : {},
    ...reusableBoardCreates ? { reusable_board_creates: reusableBoardCreates } : {},
    ...activityProperties
  }, [
    "moments",
    ...courseVisualCreates ? ["course_visual_creates"] : [],
    ...reusableBoardCreates ? ["reusable_board_creates"] : []
  ]);
  return schema;
}
function coerceLessonPlanSectionModelNumbers(value2, outlineValue, sectionIndex, allowedNumberIndexes) {
  return coerceModelNumbers(
    value2,
    lessonPlanSectionDraftShapeJsonSchema(outlineValue, sectionIndex, false, allowedNumberIndexes),
    "$lessonPlanModelSection"
  );
}
function coerceLessonPlanBootstrapSectionModelNumbers(value2) {
  return coerceModelNumbers(
    value2,
    lessonPlanSectionDraftShapeJsonSchema(bootstrapPermissiveOutline(), 1, true),
    "$lessonPlanModelSection"
  );
}

// src/json-stream.ts
function completedObjectText(source, propertyName) {
  let index = 0;
  while (index < source.length) {
    if (source[index] !== '"') {
      index += 1;
      continue;
    }
    const stringStart = index;
    index += 1;
    let value2 = "";
    let escaped = false;
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (escaped) {
        escaped = false;
        value2 += character;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        break;
      } else {
        value2 += character;
      }
    }
    if (index >= source.length || value2 !== propertyName) {
      index = Math.max(index + 1, stringStart + 1);
      continue;
    }
    index += 1;
    while (/\s/u.test(source[index] || "")) index += 1;
    if (source[index] !== ":") continue;
    index += 1;
    while (/\s/u.test(source[index] || "")) index += 1;
    if (source[index] !== "{") continue;
    const objectStart = index;
    let depth = 0;
    let inString = false;
    let objectEscaped = false;
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (inString) {
        if (objectEscaped) objectEscaped = false;
        else if (character === "\\") objectEscaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(objectStart, index + 1);
      }
    }
    return void 0;
  }
  return void 0;
}
function completedJsonObjectProperty(source, propertyName) {
  const text3 = completedObjectText(source, propertyName);
  if (text3 === void 0) return void 0;
  try {
    return JSON.parse(text3);
  } catch {
    return void 0;
  }
}

// src/plugins/math-facts.ts
var MATH_SECTION_FACTS = {
  function_plot: ({ established }) => established && fixedLineSamples(established) ? { lead: { sample_slope: "constant" } } : {},
  geometric_rearrangement: ({ mode, established, numbers, state }) => {
    let facts = {};
    if (established) {
      const construction = established.parameters?.construction ?? "right_triangle_square";
      const definition = REARRANGEMENT_FACTS[construction];
      const number = established.numbers?.[0];
      const range = number ? numbers?.[number - 1] : void 0;
      facts = definition ? {
        construction,
        pieces: definition.pieces,
        shows: definition.shows,
        container: definition.container,
        at_start: definition.initial,
        at_end: definition.final,
        fixed_legs: { a: established.parameters?.leg_a ?? 3, b: established.parameters?.leg_b ?? 2 },
        ...range && number ? { progress: {
          number,
          current_value: state.get(number),
          normalized: ((state.get(number) ?? range.initial) - range.min) / (range.max - range.min)
        } } : {}
      } : {};
    }
    return { facts: { ...facts, ...mode === "create" ? { construction_choices: REARRANGEMENT_MODEL_GUIDANCE } : {} } };
  },
  circle_polygon_bounds: ({ established }) => ({
    facts: {
      circle_fixed: true,
      radius: established?.parameters?.radius ?? 2,
      side_count: { min: 3, max: 384, integer: true },
      pi_lower: "n*sin(pi/n)",
      pi_upper: "n*tan(pi/n)",
      n96: { lower: 3.1410319508905093, upper: 3.142714599645368 },
      caution: "Use the actual regular polygons, not circle_and_arc; displayed bounds are approximations, not exact historical rational bounds."
    }
  })
};

// src/plugins/section-facts.ts
var SECTION_FACTS = Object.assign(/* @__PURE__ */ Object.create(null), MATH_SECTION_FACTS);

// src/lesson-plan-generation.ts
var ANSWER_ACTIVITY_RULE = "answer \u53EA\u5199\u4E00\u4E2A\u6570\uFF08\u6574\u6570\u3001\u5C0F\u6570\u3001\u5206\u6570 3/4\u3001\u5E26\u5206\u6570 2 3/4\uFF09\uFF0C\u4E0D\u5E26\u5355\u4F4D\u6216 %\uFF0C\u767E\u5206\u6570\u9898\u5199\u767E\u5206\u53F7\u524D\u7684\u6570\u5E76\u628A % \u5199\u5165 unit\uFF1Bcheck \u5199\u53EA\u542B\u6570\u5B57\u7684\u7B97\u5F0F\uFF08\u5982 2*3/4\uFF09\uFF0C\u7A0B\u5E8F\u6838\u5BF9\u5B83\u4E0E answer \u76F8\u7B49\uFF1B\u7ED3\u679C\u8981\u56DB\u820D\u4E94\u5165\u65F6 answer \u5199\u6210\u5C0F\u6570\uFF08\u5982 11.21\u30012.0\uFF09\uFF0C\u9898\u76EE\u5199\u660E\u4FDD\u7559\u51E0\u4F4D\u5C0F\u6570\uFF0C\u7A0B\u5E8F\u6309\u4F4D\u6570\u6838\u5BF9\uFF1B\u9898\u76EE\u8981\u6C42\u6700\u7B80\u5206\u6570\u65F6 simplest_fraction \u5FC5\u987B\u4E3A true\uFF0C\u5426\u5219\u6CA1\u7EA6\u5206\u7684\u7B54\u6848\u4E5F\u7B97\u5BF9\uFF1Bunit \u53EA\u5199\u5355\u4F4D\uFF0C\u6CA1\u6709\u5C31\u7701\u7565\uFF1Bhints \u5199 1\u20132 \u6761\u4E0D\u7ED9\u51FA\u7B54\u6848\u7684\u63D0\u793A\u3002";
var OUTLINE_SYSTEM_PROMPT = [
  `\u8BBE\u8BA1\u5B8C\u6574\u8BFE\u7A0B\u76EE\u5F55\uFF0C\u4E0D\u751F\u6210 OLL\u3001\u6267\u884C ID\u3001\u7EC4\u4EF6\u540D\u6216\u81EA\u7531\u5BF9\u8C61\u540D\u3002`,
  `- \u9700\u8981\u540C\u6B65\u5BF9\u7167\u7684\u56FE\u590D\u7528\u540C\u4E00\u5171\u4EAB\u6570\u503C\uFF0C\u5E76\u901A\u8FC7 supporting/comparison \u58F0\u660E\u5173\u8054\uFF1B\u4E0D\u8981\u7528\u4E24\u4E2A\u72EC\u7ACB main \u56FE\u8868\u793A\u540C\u4E00\u8054\u52A8\u5173\u7CFB\u3002`,
  `- visual_recipes \u4E3A [features,numbers,purpose]\u3002course_visuals \u9009\u5176\u4E2D features\uFF0C\u53EA\u5217\u5FC5\u8981\u753B\u9762\uFF1B\u540E\u7EED\u590D\u7528\uFF0C\u786E\u9700\u5E76\u6392\u624D\u5EFA comparison\uFF0Csupporting/comparison \u6307\u5411\u8F83\u65E9\u753B\u9762\u3002`,
  `- \u9009\u62E9\u56FE\u5F62\u7279\u5F81\u65F6\uFF0C\u4EE5\u672C\u8282\u9700\u8981\u5C55\u793A\u7684\u6570\u5B66\u5173\u7CFB\u4E3A\u4F9D\u636E\uFF1B\u4E0D\u80FD\u4EC5\u56E0\u8BB2\u89E3\u4E2D\u51FA\u73B0\u67D0\u4E2A\u6570\u5B66\u5BF9\u8C61\uFF0C\u5C31\u9009\u7528\u5305\u542B\u8BE5\u5BF9\u8C61\u7684\u56FE\u5F62\u7279\u5F81\u3002`,
  promptSlot("outline.visual_choice"),
  `- numbers \u53EA\u5199\u6709\u6559\u5B66\u4F5C\u7528\u7684\u5171\u4EAB\u6570\u503C\u3001\u8303\u56F4\u548C\u521D\u503C\uFF0C\u987A\u5E8F\u4F9D visual_recipes \u7684 numbers\uFF1B\u63A7\u4EF6\u4E0E\u6B65\u957F\u7531\u7A0B\u5E8F\u751F\u6210\u3002`,
  `- request_coverage \u4F9D request_parts \u987A\u5E8F\u8986\u76D6\uFF1A\u53EF\u5B9E\u73B0\u5199 teach+\u7AE0\u8282\u3002\u53EA\u662F\u8981\u6C42\u7684\u4E92\u52A8\u6216\u753B\u9762\u5F62\u5F0F\u505A\u4E0D\u5230\uFF08\u5982\u53EF\u81EA\u7531\u62D6\u52A8\u9876\u70B9\u7684\u4EFB\u610F\u4E09\u89D2\u5F62\uFF09\uFF0C\u4F46\u6570\u5B66\u5185\u5BB9\u80FD\u7528\u5DF2\u6709\u753B\u9762\u8BB2\u5BF9\u65F6\uFF0C\u5199 teach \u5E76\u6362\u6210\u53EF\u5B9E\u73B0\u7684\u753B\u9762\uFF0C\u5728\u7B2C\u4E00\u8282\u65C1\u767D\u91CC\u7528\u4E00\u53E5\u8BDD\u8BF4\u660E\u6362\u6210\u4E86\u4EC0\u4E48\uFF1B\u53EA\u6709\u6570\u5B66\u5185\u5BB9\u672C\u8EAB\u65E0\u6CD5\u6B63\u786E\u5448\u73B0\u65F6\u624D\u5199 unsupported\u3001\u7A7A\u7AE0\u8282\u53CA\u539F\u56E0\uFF0C\u7981\u6B62\u9519\u8BEF\u66FF\u4EE3\u3002`,
  `- \u6309\u72EC\u7ACB\u6559\u5B66\u76EE\u6807\u548C\u5B66\u4E60\u8FDB\u7A0B\u5206\u8282\uFF0C\u4E0D\u6309\u4E3B\u9898\u6570\u6216\u753B\u9762\u6570\u5206\u8282\u3002\u6BCF\u8282\u53EA\u627F\u62C5\u4E00\u4E2A\u5B8C\u6210\u540E\u53EF\u9A8C\u8BC1\u7684\u76EE\u6807\uFF1B\u8FDE\u7EED\u63A8\u5BFC\u53CA\u987B\u540C\u6B65\u89C2\u5BDF\u7684\u753B\u9762\u7559\u5728\u540C\u4E00\u8282\u7684\u591A\u4E2A moment\u3002\u7B80\u5355\u95EE\u9898\u80FD\u56F4\u7ED5\u4E00\u4E2A\u76EE\u6807\u8BB2\u6E05\u65F6\u7528 1 \u8282\uFF1B\u82E5\u987B\u5206\u522B\u5EFA\u7ACB\u76F4\u89C9\u3001\u7EA0\u9519\u6216\u89E3\u91CA\u539F\u7406\u3001\u63A8\u5BFC\u6216\u6F14\u793A\u3001\u5E94\u7528\u3001\u68C0\u67E5\u638C\u63E1\u4E2D\u7684\u591A\u4E2A\u76EE\u6807\uFF0C\u62C6\u6210 2\u20134 \u8282\u3002\u4E0D\u8981\u4E3A\u51D1\u8282\u6570\u91CD\u590D\u5F00\u573A\u3001\u5B9A\u4E49\u6216\u603B\u7ED3\uFF0C\u4E5F\u4E0D\u8981\u628A\u672C\u5E94\u72EC\u7ACB\u7684\u63A8\u5BFC\u3001\u5E94\u7528\u548C\u68C0\u67E5\u5168\u585E\u8FDB\u4E00\u8282\u3002\u4E3A\u4EC0\u4E48\u987B\u63A8\u5BFC\uFF0C\u600E\u4E48\u7B97\u987B\u6B65\u9AA4\u4E0E\u68C0\u9A8C\uFF0C\u662F\u4EC0\u4E48\u987B\u76F4\u89C9\u4E0E\u8FB9\u754C\u3002\u4E0D\u731C\u5E74\u7EA7\uFF1Bclose \u53EA\u603B\u7ED3\u3002`,
  `\u53EA\u8FD4\u56DE\u7B26\u5408\u54CD\u5E94 Schema \u7684 JSON\u3002`
].filter(Boolean).join("\n");
var SECTION_SYSTEM_PROMPT = [
  `\u53EA\u7F16\u5199\u8BFE\u7A0B\u76EE\u5F55\u6307\u5B9A\u7684\u4E00\u8282\uFF0C\u4E0D\u751F\u6210 OLL\u3001\u6267\u884C ID\u3001\u53D8\u91CF\u540D\u3001\u5BF9\u8C61\u540D\u6216\u5BF9\u8C61\u5F15\u7528\u3002`,
  `- \u5FC5\u987B\u843D\u5B9E\u76EE\u5F55\u5206\u914D\u7684 request_parts\u3002\u65C1\u767D\u4E0E\u5BF9\u5E94\u677F\u4E66\u548C\u52A8\u4F5C\u653E\u5728\u540C\u4E00 moment\uFF1B\u53EF\u89C1\u6587\u5B57\u76F4\u63A5\u5BF9\u5B66\u4E60\u8005\u8BF4\u8BDD\uFF0C\u4E0D\u80FD\u5199\u201C\u8BA9\u5B66\u751F\u2026\u2026\u201D\u3002`,
  `- \u76EE\u5F55\u4E2D\u672C\u8282 create \u7684\u753B\u9762\u6309\u987A\u5E8F\u5199\u5165 course_visual_creates \u5E76\u6307\u5B9A moment\uFF1Breuse \u7684\u753B\u9762\u4E0D\u5F97\u91CD\u5EFA\u3002\u76EE\u5F55\u58F0\u660E\u7684\u516C\u5F0F\u548C\u7B14\u8BB0\u5206\u522B\u6309\u987A\u5E8F\u5199\u5165 reusable_math_creates\u3001reusable_note_creates\uFF1B\u7A7A\u6E05\u5355\u7701\u7565\u3002`,
  `- focuses \u53EA\u5199\u805A\u7126\u610F\u56FE\uFF0Cpoints \u53EA\u8868\u793A\u9700\u8981\u6307\u793A\uFF1B\u7A0B\u5E8F\u9009\u62E9\u771F\u5B9E\u5BF9\u8C61\uFF0C\u8865\u9F50\u5361\u7247\u7528\u9014\u3001\u4F4D\u7F6E\u3001\u9ED8\u8BA4\u65F6\u673A\u548C\u52A8\u4F5C\u987A\u5E8F\u3002`,
  `- \u5C0F\u6570\u7528 mantissa/scale\uFF0C\u5982 -1.5\u2192-15/1\u3002`,
  `- number_activities \u53EA\u9009\u6570\u503C\u4F4D\u7F6E\u548C\u76EE\u6807\u503C\uFF1Bscene3d_activities \u53EA\u9009\u9884\u8BBE\u89C6\u89D2\u3002\u63A7\u4EF6\u3001\u5BB9\u5DEE\u3001\u63D0\u793A\u51FA\u73B0\u6B21\u6570\u3001\u76F8\u673A\u548C\u8FD0\u884C\u65F6\u5F15\u7528\u7531\u7A0B\u5E8F\u751F\u6210\u3002`,
  promptSlot("section.formulas"),
  `- animations \u53EA\u5199\u6570\u503C\u3001\u76EE\u6807\u548C\u8282\u594F\uFF1B\u7A0B\u5E8F\u751F\u6210\u7F13\u52A8\u3002\u8FDE\u7EED\u6F14\u793A\u627F\u63A5\u5F53\u524D\u72B6\u6001\uFF1B\u72EC\u7ACB\u91CD\u6F14\u624D\u5728 moment \u5199 restart_numbers\uFF08\u6570\u503C\u4F4D\u7F6E\u5217\u8868\uFF0C\u8D77\u70B9\u7531\u7A0B\u5E8F\u53D6\u521D\u503C\uFF09\uFF0C\u4E0D\u8981\u6BCF\u6BB5\u90FD\u91CD\u7F6E\uFF1B\u76EE\u6807\u5DF2\u662F\u5F53\u524D\u503C\u5219\u65E0\u9700\u52A8\u753B\u3002`,
  `- \u8BFE\u4E2D\u6559\u5E08\u6F14\u793A\u5E76\u914D\u52A8\u753B\uFF0C\u4E0D\u5199\u201C\u8BF7\u4F60\u8C03\u5230 4\u201D\u201C\u8BF7\u4F60\u62D6\u52A8\u201D\uFF1B\u5B66\u751F\u64CD\u4F5C\u7559\u7ED9\u8BFE\u540E number_activities\uFF0C\u9080\u8BF7\u53EA\u653E\u6700\u540E\u4E00\u4E2A moment\u3002\u9080\u8BF7\u91CC\u8BF4\u7684\u76EE\u6807\u503C\u5FC5\u987B\u5C31\u662F number_activities \u7684\u76EE\u6807\u503C\uFF0C\u4E14\u4E0D\u540C\u4E8E\u8BFE\u7A0B\u7ED3\u675F\u65F6\u6ED1\u6746\u6240\u5728\u7684\u503C\uFF08\u4E0D\u5199\u201C\u8C03\u56DE 0\u201D\u8FD9\u7C7B\u5DF2\u7ECF\u8FBE\u5230\u7684\u76EE\u6807\uFF09\u3002\u53EA\u6709\u8BFE\u4E2D\u6ED1\u6746\u786E\u5B9E\u5230\u8FC7\u7684\u503C\u624D\u80FD\u8BF4\u201C\u8C03\u56DE\u201D\u3002\u6709\u591A\u4E2A number_activities \u65F6\u5B66\u751F\u6309\u987A\u5E8F\u5B8C\u6210\uFF0C\u524D\u4E00\u9879\u7ED3\u675F\u65F6\u7684\u6570\u503C\u4F1A\u4FDD\u7559\uFF1B\u540E\u4E00\u9879\u7684\u8BF4\u660E\u3001\u63D0\u793A\u548C\u5B8C\u6210\u8BED\u6309\u90A3\u65F6\u5404\u6570\u503C\u7684\u5B9E\u9645\u72B6\u6001\u8BA1\u7B97\uFF0C\u4E0D\u6309\u521D\u503C\u7B97\u3002`,
  `- \u601D\u8003\u9898\u8BFE\u4E2D\u53EA\u95EE\u4E0D\u7B54\uFF1B\u9898\u4E0E\u53C2\u8003\u7B54\u6848\u5199\u5165 reflection_activities\uFF0C\u8BFE\u540E\u4EE5\u6536\u8D77\u7684\u7B54\u6848\u5361\u7247\u51FA\u73B0\u3002`,
  `- \u672C\u8282\u8BB2\u4E86\u80FD\u7B97\u51FA\u786E\u5B9A\u6570\u503C\u7684\u5185\u5BB9\uFF08\u8BA1\u7B97\u3001\u6362\u7B97\u3001\u8BFB\u6570\u3001\u4EE3\u5165\u6C42\u503C\uFF09\u65F6\uFF0C\u5199 1 \u9053 answer_activities \u8BA9\u5B66\u751F\u8BFE\u540E\u586B\u6570\uFF1A\u7528\u8BFE\u4E2D\u6CA1\u7B97\u8FC7\u7684\u65B0\u6570\uFF0C\u8BFE\u4E2D\u4E0D\u8BF4\u7B54\u6848\u3002${ANSWER_ACTIVITY_RULE}`,
  promptSlot("section.bounds"),
  promptSlot("section.linked_numbers", "\u8054\u52A8\u56FE\u5F15\u7528\u540C\u4E00 numbers\uFF1B"),
  promptSlot("section.constructions"),
  `\u53EA\u8FD4\u56DE\u7B26\u5408\u54CD\u5E94 Schema \u7684 JSON\u3002`
].filter(Boolean).join("\n");
var BOOTSTRAP_FIRST_SECTION_PROMPT = [
  `\u5728\u540C\u4E00\u6B21\u56DE\u7B54\u4E2D\uFF0C\u5FC5\u987B\u5148\u5B8C\u6210 outline\uFF0C\u518D\u4F9D\u636E\u8FD9\u4E2A outline \u7F16\u5199 first_section\u3002first_section \u53EA\u80FD\u843D\u5B9E outline.sections[0]\uFF1A`,
  `- outline \u662F\u552F\u4E00\u8BFE\u7A0B\u5B89\u6392\uFF1B\u4E0D\u5F97\u5728 first_section \u589E\u52A0 outline \u6CA1\u6709\u58F0\u660E\u7684\u4E3B\u8981\u753B\u9762\uFF0C\u4E5F\u4E0D\u5F97\u9057\u6F0F\u7B2C\u4E00\u8282\u58F0\u660E\u7684\u4E3B\u8981\u753B\u9762\u548C\u53EF\u590D\u7528\u677F\u4E66\u3002`,
  `- first_section \u53EA\u5199 moments \u4EE5\u53CA\u53EF\u9009\u7684 number_activities\u3001scene3d_activities\u3002\u65C1\u767D\u4E0E\u5BF9\u5E94\u677F\u4E66\u548C\u52A8\u4F5C\u653E\u5728\u540C\u4E00 moment\uFF1B\u53EF\u89C1\u6587\u5B57\u76F4\u63A5\u5BF9\u5B66\u4E60\u8005\u8BF4\u8BDD\uFF0C\u4E0D\u80FD\u5199\u201C\u8BA9\u5B66\u751F\u2026\u2026\u201D\u3002`,
  `- \u7B2C\u4E00\u8282\u65B0\u753B\u9762\u5199\u5165 moment.visual_creates\uFF1Bcourse_visual\u3001content.numbers \u5206\u522B\u5F15\u7528 outline.course_visuals\u3001outline.numbers \u7684\u4ECE1\u5F00\u59CB\u4F4D\u7F6E\u3002content.parameters \u4EC5\u5199\u6570\u5B66\u5185\u5BB9\uFF0C\u80FD\u529B\u7531\u7A0B\u5E8F\u786E\u5B9A\uFF1B\u590D\u7528\u753B\u9762\u4E0D\u91CD\u5EFA\u3002`,
  `- \u7B2C\u4E00\u8282\u516C\u5F0F/\u7B14\u8BB0\u5199\u5165 moment.math_creates/note_creates\uFF1B\u53EF\u590D\u7528\u9879\u7528 reusable_item \u5F15\u7528\u76EE\u5F55\u4E2D\u4ECE1\u5F00\u59CB\u7684\u4F4D\u7F6E\uFF0C\u4E34\u65F6\u9879\u4E0D\u586B\u3002\u7A0B\u5E8F\u751F\u6210\u7A33\u5B9A\u5F15\u7528\u3002`,
  `- first_section \u4F7F\u7528 outline \u4E2D\u6570\u503C\u548C\u753B\u9762\u7684\u5148\u540E\u987A\u5E8F\uFF0C\u4E0D\u751F\u6210 OLL\u3001\u6267\u884C ID\u3001\u53D8\u91CF\u540D\u3001\u5BF9\u8C61\u540D\u3001\u5BF9\u8C61\u5F15\u7528\u3001course_visual_creates \u6216 reusable_board_creates\u3002`,
  `- focuses \u53EA\u5199\u805A\u7126\u610F\u56FE\uFF0Cpoints \u53EA\u8868\u793A\u9700\u8981\u6307\u793A\uFF1B\u7A0B\u5E8F\u9009\u62E9\u771F\u5B9E\u5BF9\u8C61\uFF0C\u8865\u9F50\u5361\u7247\u7528\u9014\u3001\u4F4D\u7F6E\u3001\u9ED8\u8BA4\u65F6\u673A\u548C\u52A8\u4F5C\u987A\u5E8F\u3002`,
  `- \u5C0F\u6570\u7528 mantissa/scale\uFF0C\u5982 -1.5\u2192-15/1\u3002`,
  `- number_activities \u53EA\u9009\u6570\u503C\u4F4D\u7F6E\u548C\u76EE\u6807\u503C\uFF1Bscene3d_activities \u53EA\u9009\u9884\u8BBE\u89C6\u89D2\u3002\u63A7\u4EF6\u3001\u5BB9\u5DEE\u3001\u63D0\u793A\u51FA\u73B0\u6B21\u6570\u3001\u76F8\u673A\u548C\u8FD0\u884C\u65F6\u5F15\u7528\u7531\u7A0B\u5E8F\u751F\u6210\u3002`,
  promptSlot("section.formulas"),
  `- animations \u53EA\u5199\u6570\u503C\u3001\u76EE\u6807\u548C\u8282\u594F\uFF1B\u7A0B\u5E8F\u751F\u6210\u7F13\u52A8\u3002\u8FDE\u7EED\u6F14\u793A\u627F\u63A5\u5F53\u524D\u72B6\u6001\uFF1B\u72EC\u7ACB\u91CD\u6F14\u624D\u5728 moment \u5199 restart_numbers\uFF08\u6570\u503C\u4F4D\u7F6E\u5217\u8868\uFF0C\u8D77\u70B9\u7531\u7A0B\u5E8F\u53D6\u521D\u503C\uFF09\uFF0C\u4E0D\u8981\u6BCF\u6BB5\u90FD\u91CD\u7F6E\uFF1B\u76EE\u6807\u5DF2\u662F\u5F53\u524D\u503C\u5219\u65E0\u9700\u52A8\u753B\u3002`,
  `- \u8BFE\u4E2D\u6559\u5E08\u6F14\u793A\u5E76\u914D\u52A8\u753B\uFF0C\u4E0D\u5199\u201C\u8BF7\u4F60\u8C03\u5230 4\u201D\u201C\u8BF7\u4F60\u62D6\u52A8\u201D\uFF1B\u5B66\u751F\u64CD\u4F5C\u7559\u7ED9\u8BFE\u540E number_activities\uFF0C\u9080\u8BF7\u53EA\u653E\u6700\u540E\u4E00\u4E2A moment\u3002\u9080\u8BF7\u91CC\u8BF4\u7684\u76EE\u6807\u503C\u5FC5\u987B\u5C31\u662F number_activities \u7684\u76EE\u6807\u503C\uFF0C\u4E14\u4E0D\u540C\u4E8E\u8BFE\u7A0B\u7ED3\u675F\u65F6\u6ED1\u6746\u6240\u5728\u7684\u503C\uFF08\u4E0D\u5199\u201C\u8C03\u56DE 0\u201D\u8FD9\u7C7B\u5DF2\u7ECF\u8FBE\u5230\u7684\u76EE\u6807\uFF09\u3002\u53EA\u6709\u8BFE\u4E2D\u6ED1\u6746\u786E\u5B9E\u5230\u8FC7\u7684\u503C\u624D\u80FD\u8BF4\u201C\u8C03\u56DE\u201D\u3002\u6709\u591A\u4E2A number_activities \u65F6\u5B66\u751F\u6309\u987A\u5E8F\u5B8C\u6210\uFF0C\u524D\u4E00\u9879\u7ED3\u675F\u65F6\u7684\u6570\u503C\u4F1A\u4FDD\u7559\uFF1B\u540E\u4E00\u9879\u7684\u8BF4\u660E\u3001\u63D0\u793A\u548C\u5B8C\u6210\u8BED\u6309\u90A3\u65F6\u5404\u6570\u503C\u7684\u5B9E\u9645\u72B6\u6001\u8BA1\u7B97\uFF0C\u4E0D\u6309\u521D\u503C\u7B97\u3002`,
  promptSlot("section.bounds"),
  promptSlot("section.linked_numbers", "\u8054\u52A8\u56FE\u5F15\u7528\u540C\u4E00 numbers\uFF1B"),
  promptSlot("section.constructions")
].filter(Boolean).join("\n");
var TEACHER_PROFILE_RULE = `course_context.teacher_profile \u662F\u672C\u6B21\u6388\u8BFE\u9884\u8BBE\u8001\u5E08\u7684\u57FA\u7840\u8BBE\u5B9A\u3002\u7528\u5B83\u51B3\u5B9A\u8BB2\u89E3\u7684\u7EC4\u7EC7\u3001\u63AA\u8F9E\u3001\u63D0\u95EE\u65F6\u673A\u548C\u9F13\u52B1\u65B9\u5F0F\uFF0C\u8BA9\u98CE\u683C\u4F53\u73B0\u5728\u76EE\u5F55\u548C\u65C1\u767D\u91CC\uFF0C\u800C\u4E0D\u53EA\u662F\u52A0\u5F62\u5BB9\u8BCD\uFF1B\u4E0D\u5F97\u6539\u53D8\u6570\u5B66\u5185\u5BB9\u3001\u7701\u7565\u5FC5\u8981\u6761\u4EF6\u6216\u628A\u6BD4\u55BB\u5F53\u4F5C\u8BC1\u660E\u3002\u5B66\u751F\u672C\u6B21\u7684\u660E\u786E\u8981\u6C42\u4F18\u5148\u4E8E\u8001\u5E08\u98CE\u683C\u3002\u6BCF\u4E00\u8282\u90FD\u8981\u8BA9\u8BBE\u5B9A\u4E2D\u7684\u5177\u4F53\u505A\u6CD5\u80FD\u88AB\u542C\u51FA\u6765\uFF0C\u800C\u4E0D\u53EA\u662F\u8BED\u6C14\uFF1A\u6309\u8BBE\u5B9A\u7684\u65B9\u5F0F\u8BA4\u53EF\u5B66\u751F\uFF08\u70B9\u51FA\u5177\u4F53\u54EA\u4E00\u6B65\u6216\u54EA\u4E2A\u60F3\u6CD5\uFF09\uFF1B\u9009\u4F8B\u5B50\u65F6\u4F18\u5148\u7528\u8BBE\u5B9A\u4E2D\u611F\u5174\u8DA3\u7684\u8BDD\u9898\uFF1B\u8BBE\u5B9A\u5199\u4E86\u4E3B\u8981\u8BB2\u89E3\u624B\u6CD5\uFF08\u5982\u4E00\u4E2A\u8D2F\u7A7F\u7684\u6BD4\u55BB\u3001\u9010\u6B65\u6BD4\u8F83\u53D8\u5316\u91CF\uFF09\u5C31\u5728\u6BCF\u8282\u6CBF\u7528\uFF1B\u8BBE\u5B9A\u8981\u6C42\u4E00\u6B21\u53EA\u7528\u4E00\u4E2A\u4E3B\u8981\u6BD4\u55BB\u65F6\uFF0C\u5168\u8BFE\u53EA\u7528\u8FD9\u4E00\u4E2A\uFF0C\u4E0D\u518D\u5F15\u5165\u7B2C\u4E8C\u4E2A\u6BD4\u55BB\u6216\u89D2\u8272\u79F0\u547C\uFF1B\u5C0F\u4E60\u60EF\u5168\u8BFE\u6700\u591A\u51FA\u73B0\u4E00\u6B21\u3002\u98CE\u683C\u793A\u4F8B\u53EA\u7528\u6765\u4F53\u4F1A\uFF0C\u4E0D\u7167\u6284\u3002`;
var LEARNER_BACKGROUND_RULE = `course_context.learner_background \u662F\u5B66\u4E60\u5E94\u7528\u63D0\u4F9B\u7684\u5B66\u751F\u80CC\u666F\u4E0E\u4EE5\u5F80\u5B66\u4E60\u8BB0\u5F55\uFF0C\u6CE8\u660E\u4E86\u6765\u6E90\u3002\u53EA\u5F15\u7528\u5176\u4E2D\u660E\u786E\u5199\u51FA\u7684\u4E8B\u5B9E\uFF0C\u53EF\u7528\u6765\u8854\u63A5\u65E7\u77E5\u8BC6\u6216\u91C7\u7528\u5B66\u751F\u8BF4\u8FC7\u7684\u504F\u597D\uFF1B\u4E0D\u5F97\u7F16\u9020\u672A\u63D0\u4F9B\u7684\u7ECF\u5386\uFF0C\u4E0D\u5F97\u63A8\u65AD\u638C\u63E1\u7A0B\u5EA6\u3001\u60C5\u7EEA\u6216\u504F\u597D\uFF1B\u4E0E\u672C\u6B21\u8BF7\u6C42\u65E0\u5173\u65F6\u4E0D\u63D0\u3002\u5B83\u4E0D\u662F\u672C\u6B21\u8BF7\u6C42\uFF0C\u4E0D\u80FD\u636E\u6B64\u6539\u53D8\u8BFE\u7A0B\u4E3B\u9898\u3002\u5982\u679C\u5176\u4E2D\u6709\u4E0E\u672C\u6B21\u95EE\u9898\u76F4\u63A5\u76F8\u5173\u7684\u4E8B\u5B9E\uFF08\u5B66\u751F\u8BF4\u8FC7\u7684\u8BB2\u89E3\u504F\u597D\u3001\u505A\u8FC7\u7684\u76F8\u5173\u9898\u76EE\u6216\u51FA\u8FC7\u7684\u9519\u3001\u548C\u67D0\u4F4D\u8001\u5E08\u4E00\u8D77\u7528\u8FC7\u7684\u8BB2\u6CD5\uFF09\uFF0C\u5728\u7B2C\u4E00\u8282\u5F00\u5934\u7528\u5BF9\u5B66\u751F\u8BF4\u8BDD\u7684\u65B9\u5F0F\u660E\u786E\u63D0\u8D77\u6700\u76F8\u5173\u7684\u4E00\u5230\u4E24\u6761\uFF08\u4E0D\u8D85\u8FC7\u4E24\u6761\uFF09\uFF0C\u5E76\u5728\u672C\u8282\u8BB2\u89E3\u4E2D\u771F\u6B63\u7528\u4E0A\uFF1B\u7528\u4E0D\u4E0A\u7684\u4E0D\u63D0\u3002\u7528\u81EA\u5DF1\u7684\u8BDD\u8BF4\uFF0C\u4E0D\u5957\u7528\u56FA\u5B9A\u53E5\u5F0F\uFF0C\u4F8B\u5982\u7167\u5B66\u751F\u8BF4\u8FC7\u7684\u8BB2\u89E3\u504F\u597D\u6765\u5B89\u6392\u987A\u5E8F\u5E76\u70B9\u660E\u8FD9\u662F\u5B66\u751F\u7684\u8981\u6C42\uFF0C\u6216\u70B9\u51FA\u5B66\u751F\u5728\u76F8\u5173\u9898\u76EE\u4E0A\u51FA\u8FC7\u7684\u9519\u5E76\u5728\u672C\u8282\u4E13\u95E8\u68C0\u67E5\u90A3\u4E00\u6B65\u3002\u63D0\u5230\u8FC7\u53BB\u7684\u9519\u8BEF\u65F6\u8BED\u6C14\u4E2D\u6027\uFF0C\u4E0D\u8D23\u5907\uFF0C\u4E5F\u4E0D\u636E\u6B64\u5224\u65AD\u73B0\u5728\u4ECD\u4E0D\u4F1A\uFF1B\u5176\u4ED6\u8001\u5E08\u53C2\u4E0E\u7684\u7ECF\u5386\u8981\u8BF4\u660E\u662F\u90A3\u4F4D\u8001\u5E08\uFF0C\u4F8B\u5982\u201C\u4F60\u548C\u8C46\u8C46\u8001\u5E08\u7528\u5C71\u8DEF\u6BD4\u55BB\u5B66\u8FC7\u659C\u7387\u201D\uFF0C\u4E0D\u8981\u8BF4\u6210\u81EA\u5DF1\u7684\u3002\u53EA\u8BF4\u4E8B\u5B9E\u5199\u5230\u7684\u7A0B\u5EA6\uFF1A\u53EA\u6709\u65E5\u671F\u3001\u6B21\u6570\u7B49\u7EDF\u8BA1\u65F6\u4E0D\u8BF4\u6210\u5B66\u4F1A\u6216\u7406\u89E3\u3002\u7B2C\u4E8C\u8282\u53CA\u4EE5\u540E\u4E0D\u518D\u590D\u8FF0\u8FD9\u4E9B\u80CC\u666F\uFF0C\u53EA\u6309\u5B83\u8C03\u6574\u8BB2\u6CD5\u3002\u5B66\u751F\u7684\u5174\u8DA3\u4E0E\u8001\u5E08\u8BBE\u5B9A\u4E2D\u611F\u5174\u8DA3\u7684\u8BDD\u9898\u91CD\u5408\u65F6\uFF08\u4F8B\u5982\u90FD\u4E0E\u8FD0\u52A8\u6709\u5173\uFF09\uFF0C\u81F3\u5C11\u7528\u5B83\u4E3E\u4E00\u4E2A\u4E0E\u6570\u5B66\u5185\u5BB9\u76F8\u7B26\u7684\u4F8B\u5B50\uFF1B\u4E0D\u91CD\u5408\u65F6\u4E0D\u5FC5\u786C\u63D0\u3002`;
var CURRENT_LESSON_RULE = `course_context.current_lesson \u662F\u540C\u4E00\u5757\u767D\u677F\u4E0A\u521A\u8BB2\u8FC7\u7684\u5185\u5BB9\uFF08\u5B66\u751F\u770B\u5F97\u5230\uFF09\uFF0C\u7531\u5B66\u4E60\u5E94\u7528\u6574\u7406\uFF0C\u53EF\u4EE5\u76F4\u63A5\u5F15\u7528\u3002\u5B66\u751F\u7684\u8BF7\u6C42\u6307\u5411\u5176\u4E2D\u786E\u5B9E\u5199\u5230\u7684\u5185\u5BB9\u65F6\uFF08\u5982\u201C\u53CD\u601D\u9898\u201D\u201C\u601D\u8003\u9898\u201D\u201C\u521A\u624D\u90A3\u9053\u9898\u201D\u201C\u6700\u540E\u4E00\u6B65\u201D\uFF09\uFF0C\u636E\u6B64\u786E\u5B9A\u6240\u6307\uFF1A\u8FD9\u6837\u7684\u8BF7\u6C42\u4E3B\u9898\u662F\u6E05\u695A\u7684\uFF0C\u5E94\u751F\u6210\u8BFE\u7A0B\uFF08generate_lesson\uFF09\uFF0C\u4E0D\u8981\u5224\u4E3A\u9700\u8981\u8FFD\u95EE\uFF0C\u4E5F\u4E0D\u8981\u6C42\u5B66\u751F\u518D\u63CF\u8FF0\u4E00\u904D\uFF1B\u76F4\u63A5\u9488\u5BF9\u90A3\u9053\u9898\u6216\u90A3\u4E00\u6B65\u4E0A\u8BFE\uFF0C\u4E0D\u91CD\u8BB2\u6574\u8282\u8BFE\uFF1B\u8BFE\u540E\u601D\u8003\u9898\u53EF\u4EE5\u53C2\u8003\u5176\u53C2\u8003\u7B54\u6848\uFF0C\u5148\u5E26\u5B66\u751F\u60F3\u6E05\u695A\u601D\u8DEF\uFF0C\u518D\u7ED9\u51FA\u7ED3\u8BBA\u3002current_lesson \u91CC\u627E\u4E0D\u5230\u6240\u6307\u65F6\uFF0C\u7167\u5E38\u5224\u65AD\u662F\u5426\u9700\u8981\u8FFD\u95EE\u3002\u672C\u6B21\u8BF7\u6C42\u9644\u5E26\u4E86\u56FE\u7247\u6216\u9009\u533A\u65F6\uFF0C\u201C\u8FD9\u9053\u9898\u201D\u201C\u8FD9\u91CC\u201D\u6307\u56FE\u7247\u6216\u9009\u533A\u91CC\u7684\u5185\u5BB9\uFF0C\u4E0D\u6307 current_lesson\uFF1B\u53EA\u6709\u660E\u786E\u8BF4\u201C\u521A\u624D\u201D\u201C\u4E0A\u8282\u8BFE\u201D\u201C\u53CD\u601D\u9898\u201D\u7B49\u65F6\u624D\u6307\u5B83\u3002\u8BF7\u6C42\u4E0E\u5B83\u65E0\u5173\u65F6\uFF0C\u6309\u8BF7\u6C42\u672C\u8EAB\u4E0A\u8BFE\uFF0C\u4E0D\u63D0\u5B83\uFF1B\u5B83\u4E0D\u80FD\u6539\u53D8\u5B66\u751F\u660E\u786E\u63D0\u51FA\u7684\u4E3B\u9898\u3002`;
var TEACHER_EXPERIENCES_RULE = `course_context.teacher_experiences \u662F\u8FD9\u4F4D\u8001\u5E08\u4EBA\u7269\u8BBE\u5B9A\u91CC\u7684\u4E00\u4E9B\u65E5\u5E38\u751F\u6D3B\u7ECF\u5386\uFF0C\u7531\u5B66\u4E60\u5E94\u7528\u63D0\u4F9B\uFF0C\u8BB2\u7684\u65F6\u5019\u5C31\u5F53\u4F5C\u8001\u5E08\u81EA\u5DF1\u7684\u7ECF\u5386\u6765\u8BF4\uFF1B\u8001\u5E08\u73B0\u5728\u4ECD\u5728\u5B66\u9662\u4EFB\u6559\uFF0C\u5728\u5B66\u9662\u91CC\u7684\u4E8B\u5C31\u6309\u73B0\u5728\u7684\u751F\u6D3B\u8BF4\uFF08\u5982\u201C\u6211\u5728\u89C2\u661F\u5854\u503C\u591C\u65F6\u201D\uFF09\uFF0C\u4E0D\u8981\u8BF4\u6210\u201C\u4EE5\u524D\u5728\u5B66\u9662\u65F6\u201D\u3002\u50CF\u4E00\u4F4D\u771F\u5B9E\u7684\u8001\u5E08\u90A3\u6837\uFF0C\u53EA\u5728\u67D0\u6BB5\u7ECF\u5386\u80FD\u8BA9\u672C\u8BFE\u7684\u6982\u5FF5\u53D8\u5F97\u5177\u4F53\u3001\u6216\u8BF4\u660E\u5B83\u5728\u751F\u6D3B\u91CC\u600E\u4E48\u7528\u65F6\uFF0C\u624D\u81EA\u7136\u5730\u63D0\u8D77\u4E00\u6B21\uFF08\u4F8B\u5982\u201C\u6211\u6709\u4E00\u6B21\u2026\u2026\u201D\uFF09\uFF0C\u7528\u4E00\u4E24\u53E5\u8BDD\u8BF4\u5B8C\uFF0C\u63A5\u7740\u5C31\u628A\u5B83\u5F53\u4F5C\u540E\u9762\u4F8B\u5B50\u6216\u95EE\u9898\u7684\u60C5\u5883\uFF1B\u7528\u4E0D\u4E0A\u5C31\u4E0D\u63D0\uFF0C\u5927\u591A\u6570\u8BFE\u90FD\u4E0D\u4F1A\u63D0\u3002\u5168\u8BFE\u6700\u591A\u63D0\u4E00\u6BB5\uFF1A\u8981\u63D0\u5C31\u5728\u89C4\u5212\u8BFE\u7A0B\u65F6\u51B3\u5B9A\uFF0C\u5728\u7B2C\u4E00\u8282\u63D0\u8D77\uFF0C\u5E76\u5728 outline \u91CC\u5199\u660E\u540E\u9762\u5404\u8282\u6CBF\u7528\u8FD9\u4E2A\u60C5\u5883\uFF0C\u540E\u9762\u5404\u8282\u4E0D\u518D\u53E6\u63D0\u7ECF\u5386\u3002\u53EA\u80FD\u7528\u5176\u4E2D\u5199\u5230\u7684\u7ECF\u5386\uFF1A\u7ECF\u5386\u91CC\u672C\u6765\u7684\u6570\u5B57\u53EF\u4EE5\u7167\u8BF4\uFF0C\u53E6\u5916\u8865\u5145\u7684\u7EC6\u8282\u548C\u6570\u5B57\u8981\u4E0E\u672C\u8BFE outline \u91CC\u7684\u6570\u503C\u4E00\u81F4\uFF1B\u4E0D\u80FD\u7F16\u51FA\u65B0\u7684\u5730\u70B9\u3001\u4EBA\u7269\u3001\u804C\u4E1A\u6216\u7ECF\u5386\uFF1B\u4E0D\u8981\u8BF4\u6210\u662F\u548C\u5B66\u751F\u4E00\u8D77\u7ECF\u5386\u7684\uFF1B\u4E0D\u8BA9\u7ECF\u5386\u4EE3\u66FF\u8BB2\u89E3\uFF0C\u4E5F\u4E0D\u6539\u53D8\u6570\u5B66\u5185\u5BB9\u3002\u8001\u5E08\u8BBE\u5B9A\u91CC\u6709\u8D2F\u7A7F\u5168\u8BFE\u7684\u4E3B\u8981\u6BD4\u55BB\u6216\u624B\u6CD5\u65F6\uFF0C\u7ECF\u5386\u53EA\u80FD\u7528\u6765\u5F15\u51FA\u5B83\uFF0C\u6216\u5728\u4E0D\u51B2\u7A81\u65F6\u4F5C\u4E3A\u4F8B\u5B50\u7684\u60C5\u5883\uFF0C\u4E0D\u80FD\u518D\u52A0\u7B2C\u4E8C\u4E2A\u6BD4\u55BB\uFF1B\u4E24\u8005\u51B2\u7A81\u65F6\u4E0D\u63D0\u7ECF\u5386\u3002`;
var PRACTICE_SYSTEM_PROMPT = `\u5B66\u751F\u521A\u5B66\u5B8C lesson.taught \u91CC\u7684\u8FD9\u4E00\u8282\u8BFE\u3002\u53EA\u4E3A\u5B83\u5199\u8BFE\u540E\u586B\u6570\u9898 answer_activities\uFF0C\u4E0D\u5199\u8BB2\u89E3\u3002
- \u8FD9\u8282\u8BB2\u4E86\u80FD\u7B97\u51FA\u786E\u5B9A\u6570\u503C\u7684\u5185\u5BB9\uFF08\u8BA1\u7B97\u3001\u6362\u7B97\u3001\u8BFB\u6570\u3001\u4EE3\u5165\u6C42\u503C\uFF09\u65F6\u5199 1\u20132 \u9053\uFF0C\u5426\u5219\u8FD4\u56DE\u7A7A\u6570\u7EC4\u3002\u9898\u76EE\u53EA\u8003\u8FD9\u8282\u8BB2\u8FC7\u7684\u65B9\u6CD5\uFF0C\u7528\u8BFE\u4E2D\u6CA1\u7B97\u8FC7\u7684\u65B0\u6570\uFF0C\u96BE\u5EA6\u548C\u8BFE\u4E2D\u4F8B\u5B50\u76F8\u5F53\u3002
- ${ANSWER_ACTIVITY_RULE}
\u53EA\u8FD4\u56DE\u7B26\u5408\u54CD\u5E94 Schema \u7684 JSON\u3002`;
var LATER_SECTION_EXPERIENCE_RULE = `\u8FD9\u8282\u8BFE\u53EF\u80FD\u6CBF\u7528\u4E86\u8001\u5E08\u5728\u7B2C\u4E00\u8282\u63D0\u8D77\u7684\u4E00\u6BB5\u81EA\u5DF1\u7684\u7ECF\u5386\u4F5C\u4E3A\u60C5\u5883\u3002\u5982\u679C outline \u5199\u660E\u6CBF\u7528\uFF0C\u5C31\u6309 outline \u7EE7\u7EED\u8FD9\u4E2A\u60C5\u5883\uFF0C\u4E0D\u518D\u63D0\u65B0\u7684\u7ECF\u5386\uFF0C\u4E0D\u8865\u5145\u65B0\u7684\u5730\u70B9\u3001\u4EBA\u7269\u6216\u7ECF\u5386\uFF0C\u4E5F\u4E0D\u8BF4\u6210\u662F\u548C\u5B66\u751F\u4E00\u8D77\u7ECF\u5386\u7684\uFF1Boutline \u6CA1\u5199\u5C31\u4E0D\u63D0\u3002`;
function withContextRules(systemPrompt, context) {
  const rules = [
    typeof context.language === "string" && /^en(?:-|$)/i.test(context.language) ? "Output language: English (course_context.language). Write every student-facing title, goal, narration, board label, hint, question, answer explanation, feedback, summary, and learner_response in English. Preserve formulas, identifiers, and quoted source material. Express spoken mathematics in natural English. Teacher profiles, learner background, previous lessons, and Chinese examples do not override this output language." : void 0,
    typeof context.teacher_profile === "string" ? TEACHER_PROFILE_RULE : void 0,
    typeof context.learner_background === "string" ? LEARNER_BACKGROUND_RULE : void 0,
    typeof context.current_lesson === "string" ? CURRENT_LESSON_RULE : void 0,
    typeof context.teacher_experiences === "string" ? TEACHER_EXPERIENCES_RULE : void 0
  ].filter((rule) => rule !== void 0);
  return rules.length ? `${systemPrompt}

${rules.join("\n")}` : systemPrompt;
}
var BOOTSTRAP_SYSTEM_PROMPT = `${OUTLINE_SYSTEM_PROMPT}

${BOOTSTRAP_FIRST_SECTION_PROMPT}

\u53EA\u8FD4\u56DE\u7B26\u5408\u54CD\u5E94 Schema \u7684 JSON\u3002`;
var ADMISSION_BOOTSTRAP_SYSTEM_PROMPT = `\u7528\u6237\u6B63\u5C1D\u8BD5\u4ECE\u6587\u5B57\u8F93\u5165\u6216\u8BED\u97F3\u8F93\u5165\u5F00\u59CB\u4E00\u6574\u8282\u767D\u677F\u8BFE\u7A0B\u3002\u5148\u5224\u65AD\u5F53\u524D\u5185\u5BB9\u662F\u5426\u8DB3\u4EE5\u786E\u5B9A\u8BFE\u7A0B\u4E3B\u9898\uFF0C\u4E0D\u8981\u4ECE\u53EF\u7528\u753B\u9762\u6216\u6570\u5B66\u80FD\u529B\u731C\u6D4B\u7528\u6237\u6CA1\u6709\u8868\u8FBE\u7684\u4E3B\u9898\u3002
- generate_lesson\uFF1A\u7528\u6237\u63D0\u51FA\u4E86\u5B66\u4E60\u95EE\u9898\u3001\u89E3\u91CA\u8BF7\u6C42\uFF0C\u6216\u6E05\u695A\u8BF4\u51FA\u4E86\u60F3\u5B66\u4E60\u7684\u4E3B\u9898\u3002\u7B80\u77ED\u4F46\u660E\u786E\u7684\u4E3B\u9898\uFF08\u4F8B\u5982\u201C\u52FE\u80A1\u5B9A\u7406\u201D\uFF09\u4E5F\u5C5E\u4E8E\u8FD9\u4E00\u7C7B\u3002\u6B64\u65F6 course \u5FC5\u987B\u540C\u65F6\u5305\u542B\u5B8C\u6574 outline \u548C first_section\uFF0Clearner_response \u7559\u7A7A\u3002
- clarify\uFF1A\u8FD9\u662F\u771F\u5B9E\u8BDD\u8BED\uFF0C\u4F46\u5185\u5BB9\u6B8B\u7F3A\u3001\u542B\u4E49\u4E0D\u6E05\u6216\u6CA1\u6709\u8BF4\u660E\u8981\u5B66\u4EC0\u4E48\uFF0C\u65E0\u6CD5\u53EF\u9760\u786E\u5B9A\u8BFE\u7A0B\u4E3B\u9898\u3002\u6B64\u65F6 course \u5FC5\u987B\u4E3A null\uFF0C\u7528 learner_response \u7B80\u77ED\u8FFD\u95EE\u7528\u6237\u60F3\u5B66\u4E60\u4EC0\u4E48\u3002\u4F8B\u5982 \u201CThe book.\u201D \u5E94\u8FFD\u95EE\u7528\u6237\u60F3\u4E86\u89E3\u8FD9\u672C\u4E66\u7684\u4EC0\u4E48\u5185\u5BB9\uFF0C\u800C\u4E0D\u662F\u731C\u6210\u6570\u5B66\u8BFE\u7A0B\u3002
- ignore\uFF1A\u53EA\u662F\u8BED\u6C14\u8BCD\u3001\u53E3\u5934\u586B\u5145\u6216\u6CA1\u6709\u53EF\u56DE\u5E94\u5185\u5BB9\u3002\u6B64\u65F6 course \u5FC5\u987B\u4E3A null\uFF0Clearner_response \u7559\u7A7A\u3002
\u53EA\u505A\u4E0A\u8FF0\u8BED\u4E49\u5224\u65AD\uFF0C\u4E0D\u4F7F\u7528\u5B57\u6570\u3001\u8BED\u8A00\u6216\u56FA\u5B9A\u5173\u952E\u8BCD\u4F5C\u4E3A\u89C4\u5219\u3002

${BOOTSTRAP_SYSTEM_PROMPT}`;
var ADMISSION_OUTLINE_SYSTEM_PROMPT = `\u7528\u6237\u6B63\u5C1D\u8BD5\u4ECE\u6587\u5B57\u8F93\u5165\u6216\u8BED\u97F3\u8F93\u5165\u5F00\u59CB\u4E00\u6574\u8282\u767D\u677F\u8BFE\u7A0B\u3002\u5148\u5224\u65AD\u5F53\u524D\u5185\u5BB9\u662F\u5426\u8DB3\u4EE5\u786E\u5B9A\u8BFE\u7A0B\u4E3B\u9898\uFF0C\u4E0D\u8981\u4ECE\u53EF\u7528\u753B\u9762\u6216\u6570\u5B66\u80FD\u529B\u731C\u6D4B\u7528\u6237\u6CA1\u6709\u8868\u8FBE\u7684\u4E3B\u9898\u3002
- generate_lesson\uFF1A\u7528\u6237\u63D0\u51FA\u4E86\u5B66\u4E60\u95EE\u9898\u3001\u89E3\u91CA\u8BF7\u6C42\uFF0C\u6216\u6E05\u695A\u8BF4\u51FA\u4E86\u60F3\u5B66\u4E60\u7684\u4E3B\u9898\u3002\u7B80\u77ED\u4F46\u660E\u786E\u7684\u4E3B\u9898\uFF08\u4F8B\u5982\u201C\u52FE\u80A1\u5B9A\u7406\u201D\uFF09\u4E5F\u5C5E\u4E8E\u8FD9\u4E00\u7C7B\u3002\u6B64\u65F6 course \u5FC5\u987B\u5305\u542B\u5B8C\u6574\u8BFE\u7A0B\u76EE\u5F55\uFF0Clearner_response \u7559\u7A7A\u3002\u4E0D\u8981\u751F\u6210\u4EFB\u4F55\u4E00\u8282\u7684\u65C1\u767D\u6216\u677F\u4E66\u5185\u5BB9\u3002
- clarify\uFF1A\u8FD9\u662F\u771F\u5B9E\u8BDD\u8BED\uFF0C\u4F46\u5185\u5BB9\u6B8B\u7F3A\u3001\u542B\u4E49\u4E0D\u6E05\u6216\u6CA1\u6709\u8BF4\u660E\u8981\u5B66\u4EC0\u4E48\uFF0C\u65E0\u6CD5\u53EF\u9760\u786E\u5B9A\u8BFE\u7A0B\u4E3B\u9898\u3002\u6B64\u65F6 course \u5FC5\u987B\u4E3A null\uFF0C\u7528 learner_response \u7B80\u77ED\u8FFD\u95EE\u7528\u6237\u60F3\u5B66\u4E60\u4EC0\u4E48\u3002\u4F8B\u5982 \u201CThe book.\u201D \u5E94\u8FFD\u95EE\u7528\u6237\u60F3\u4E86\u89E3\u8FD9\u672C\u4E66\u7684\u4EC0\u4E48\u5185\u5BB9\uFF0C\u800C\u4E0D\u662F\u731C\u6210\u6570\u5B66\u8BFE\u7A0B\u3002
- ignore\uFF1A\u53EA\u662F\u8BED\u6C14\u8BCD\u3001\u53E3\u5934\u586B\u5145\u6216\u6CA1\u6709\u53EF\u56DE\u5E94\u5185\u5BB9\u3002\u6B64\u65F6 course \u5FC5\u987B\u4E3A null\uFF0Clearner_response \u7559\u7A7A\u3002
\u53EA\u505A\u4E0A\u8FF0\u8BED\u4E49\u5224\u65AD\uFF0C\u4E0D\u4F7F\u7528\u5B57\u6570\u3001\u8BED\u8A00\u6216\u56FA\u5B9A\u5173\u952E\u8BCD\u4F5C\u4E3A\u89C4\u5219\u3002

${OUTLINE_SYSTEM_PROMPT}`;
var CAMERA_ADMISSION_OUTLINE_SYSTEM_PROMPT = `\u7528\u6237\u63D0\u4EA4\u4E86\u4E00\u6BB5\u6587\u5B57\u6216\u8BED\u97F3\uFF0C\u540C\u65F6\u9644\u5E26\u4E86\u4E00\u5F20\u6B64\u523B\u7684\u6444\u50CF\u5934\u753B\u9762\u3002\u53EA\u5728\u8FD9\u4E00\u6B21\u8BF7\u6C42\u4E2D\u8BFB\u53D6\u56FE\u7247\u3002
- image_observation \u5FC5\u987B\u5FE0\u5B9E\u8BB0\u5F55\u56FE\u7247\u662F\u5426\u770B\u6E05\u3001\u5B9E\u9645\u770B\u5230\u4E86\u4EC0\u4E48\u3001\u54EA\u4E9B\u5730\u65B9\u4E0D\u786E\u5B9A\u3002\u4E0D\u8981\u8865\u5199\u56FE\u7247\u4E2D\u4E0D\u5B58\u5728\u7684\u9898\u76EE\u3001\u516C\u5F0F\u6216\u6587\u5B57\u3002
- \u5982\u679C request_parts \u5DF2\u6E05\u695A\u8BF4\u660E\u5B66\u4E60\u4E3B\u9898\uFF0C\u4EE5\u6587\u5B57\u4E3A\u4E3B\uFF1B\u65E0\u5173\u80CC\u666F\u4E0D\u80FD\u6539\u53D8\u4E3B\u9898\u3002
- \u5982\u679C request_parts \u4F7F\u7528\u201C\u8FD9\u4E2A\u3001\u8FD9\u91CC\u3001\u8FD9\u9053\u9898\u3001\u6211\u624B\u4E0A\u7684\u5185\u5BB9\u201D\u7B49\u6307\u4EE3\uFF0C\u4F7F\u7528 image_observation \u786E\u5B9A\u4E3B\u9898\u3002
- \u56FE\u7247\u65E0\u6CD5\u770B\u6E05\u4E14\u6587\u5B57\u53C8\u4E0D\u80FD\u72EC\u7ACB\u786E\u5B9A\u4E3B\u9898\u65F6\uFF0C\u8FD4\u56DE clarify \u548C\u7B80\u77ED\u8FFD\u95EE\uFF0Ccourse \u5FC5\u987B\u4E3A null\u3002
- \u56FE\u7247\u90E8\u5206\u53EF\u8BFB\u65F6\uFF0C\u628A\u4E0D\u786E\u5B9A\u5185\u5BB9\u4FDD\u7559\u5728 uncertainties \u4E2D\uFF0C\u4E0D\u8981\u628A\u731C\u6D4B\u5F53\u6210\u786E\u5B9A\u4E8B\u5B9E\u3002

${ADMISSION_OUTLINE_SYSTEM_PROMPT}`;
var CAMERA_ADMISSION_BOOTSTRAP_SYSTEM_PROMPT = `\u7528\u6237\u63D0\u4EA4\u4E86\u4E00\u6BB5\u6587\u5B57\u6216\u8BED\u97F3\uFF0C\u540C\u65F6\u9644\u5E26\u4E86\u4E00\u5F20\u6B64\u523B\u7684\u6444\u50CF\u5934\u753B\u9762\u3002\u53EA\u5728\u8FD9\u4E00\u6B21\u8BF7\u6C42\u4E2D\u8BFB\u53D6\u56FE\u7247\u3002
- image_observation \u5FC5\u987B\u5FE0\u5B9E\u8BB0\u5F55\u56FE\u7247\u662F\u5426\u770B\u6E05\u3001\u5B9E\u9645\u770B\u5230\u4E86\u4EC0\u4E48\u3001\u54EA\u4E9B\u5730\u65B9\u4E0D\u786E\u5B9A\u3002\u4E0D\u8981\u8865\u5199\u56FE\u7247\u4E2D\u4E0D\u5B58\u5728\u7684\u9898\u76EE\u3001\u516C\u5F0F\u6216\u6587\u5B57\u3002
- \u5982\u679C request_parts \u5DF2\u6E05\u695A\u8BF4\u660E\u5B66\u4E60\u4E3B\u9898\uFF0C\u4EE5\u6587\u5B57\u4E3A\u4E3B\uFF1B\u65E0\u5173\u80CC\u666F\u4E0D\u80FD\u6539\u53D8\u4E3B\u9898\u3002
- \u5982\u679C request_parts \u4F7F\u7528\u201C\u8FD9\u4E2A\u3001\u8FD9\u91CC\u3001\u8FD9\u9053\u9898\u3001\u6211\u624B\u4E0A\u7684\u5185\u5BB9\u201D\u7B49\u6307\u4EE3\uFF0C\u4F7F\u7528 image_observation \u786E\u5B9A\u4E3B\u9898\u3002
- \u56FE\u7247\u65E0\u6CD5\u770B\u6E05\u4E14\u6587\u5B57\u53C8\u4E0D\u80FD\u72EC\u7ACB\u786E\u5B9A\u4E3B\u9898\u65F6\uFF0C\u8FD4\u56DE clarify \u548C\u7B80\u77ED\u8FFD\u95EE\uFF0Ccourse \u5FC5\u987B\u4E3A null\u3002
- \u56FE\u7247\u90E8\u5206\u53EF\u8BFB\u65F6\uFF0C\u628A\u4E0D\u786E\u5B9A\u5185\u5BB9\u4FDD\u7559\u5728 uncertainties \u4E2D\uFF0C\u4E0D\u8981\u628A\u731C\u6D4B\u5F53\u6210\u786E\u5B9A\u4E8B\u5B9E\u3002

${ADMISSION_BOOTSTRAP_SYSTEM_PROMPT}`;
var SELECTION_ADMISSION_OUTLINE_SYSTEM_PROMPT = `\u7528\u6237\u63D0\u4EA4\u4E86\u4E00\u6BB5\u6587\u5B57\u6216\u8BED\u97F3\uFF0C\u540C\u65F6\u9644\u5E26\u4E86\u4E00\u5F20\u521A\u521A\u4ECE\u767D\u677F\u6846\u9009\u51FA\u7684\u624B\u5199\u5185\u5BB9\u56FE\u7247\uFF08\u5305\u542B\u624B\u5199\u7B14\u8FF9\uFF0C\u4E5F\u53EF\u80FD\u5305\u542B\u88AB\u624B\u5199\u5708\u9009/\u6846\u9009\u7684\u767D\u677F\u5361\u7247\u3001\u516C\u5F0F\u6216\u56FE\u8868\uFF09\u3002\u53EA\u8BFB\u53D6\u8FD9\u4E2A\u9009\u533A\uFF0C\u4E0D\u8981\u628A\u9009\u533A\u4E4B\u5916\u7684\u767D\u677F\u5185\u5BB9\u5F53\u4F5C\u8F93\u5165\u3002
- image_observation \u5FC5\u987B\u5FE0\u5B9E\u8BB0\u5F55\u9009\u533A\u662F\u5426\u770B\u6E05\u3001\u5B9E\u9645\u770B\u5230\u4E86\u4EC0\u4E48\uFF08\u5305\u62EC\u767D\u677F\u5361\u7247\u4E2D\u7684\u6587\u5B57\u3001LaTeX\u516C\u5F0F\u3001\u56FE\u8868\u6216\u624B\u5199\u7B14\u8FF9\uFF09\u3002\u4E0D\u8981\u8865\u5199\u56FE\u7247\u4E2D\u4E0D\u5B58\u5728\u7684\u9898\u76EE\u3001\u516C\u5F0F\u6216\u6587\u5B57\u3002
- \u9009\u533A\u662F\u7528\u6237\u660E\u786E\u6307\u5B9A\u7684\u5B66\u4E60\u5BF9\u8C61\u3002\u82E5\u7528\u6237\u7528\u624B\u5199\u7EBF\u6761/\u7B14\u8FF9\u5708\u51FA\u6216\u6307\u5411\u4E86\u67D0\u5F20\u5361\u7247/\u516C\u5F0F\uFF0C\u5E94\u91CD\u70B9\u7406\u89E3\u88AB\u5708\u51FA/\u6307\u5411\u7684\u767D\u677F\u5361\u7247\u4E0E\u6838\u5FC3\u77E5\u8BC6\u70B9\u3002request_parts \u4F7F\u7528\u201C\u8FD9\u4E2A\u3001\u8FD9\u91CC\u3001\u8FD9\u4E2A\u516C\u5F0F\u201D\u7B49\u6307\u4EE3\u65F6\uFF0C\u5FC5\u987B\u7ED3\u5408 image_observation \u4E0E request_parts \u786E\u5B9A\u8BFE\u7A0B\u4E3B\u9898\u3002
- \u5982\u679C request_parts \u5DF2\u7ECF\u7ED9\u51FA\u5177\u4F53\u6559\u5B66\u8981\u6C42\u6216\u9009\u4E2D\u7684\u767D\u677F\u5185\u5BB9\uFF0C\u5C06\u5B83\u4E0E\u9009\u533A\u5185\u5BB9\u5408\u5E76\u7406\u89E3\uFF1B\u4E0D\u8981\u7528\u65E0\u5173\u77E5\u8BC6\u66FF\u6362\u9009\u533A\u91CC\u7684\u8868\u8FBE\u5F0F\u3002
- \u9009\u533A\u65E0\u6CD5\u770B\u6E05\u4E14\u6587\u5B57\u53C8\u4E0D\u80FD\u72EC\u7ACB\u786E\u5B9A\u4E3B\u9898\u65F6\uFF0C\u8FD4\u56DE clarify\uFF0C\u8981\u6C42\u7528\u6237\u91CD\u65B0\u6846\u9009\u6216\u5199\u5927\u4E00\u4E9B\uFF0Ccourse \u5FC5\u987B\u4E3A null\u3002
- \u9009\u533A\u90E8\u5206\u53EF\u8BFB\u65F6\uFF0C\u628A\u4E0D\u786E\u5B9A\u5185\u5BB9\u4FDD\u7559\u5728 uncertainties \u4E2D\uFF0C\u4E0D\u8981\u628A\u731C\u6D4B\u5F53\u6210\u786E\u5B9A\u4E8B\u5B9E\u3002

${ADMISSION_OUTLINE_SYSTEM_PROMPT}`;
var SELECTION_ADMISSION_BOOTSTRAP_SYSTEM_PROMPT = `\u7528\u6237\u63D0\u4EA4\u4E86\u4E00\u6BB5\u6587\u5B57\u6216\u8BED\u97F3\uFF0C\u540C\u65F6\u9644\u5E26\u4E86\u4E00\u5F20\u521A\u521A\u4ECE\u767D\u677F\u6846\u9009\u51FA\u7684\u624B\u5199\u5185\u5BB9\u56FE\u7247\uFF08\u5305\u542B\u624B\u5199\u7B14\u8FF9\uFF0C\u4E5F\u53EF\u80FD\u5305\u542B\u88AB\u624B\u5199\u5708\u9009/\u6846\u9009\u7684\u767D\u677F\u5361\u7247\u3001\u516C\u5F0F\u6216\u56FE\u8868\uFF09\u3002\u53EA\u8BFB\u53D6\u8FD9\u4E2A\u9009\u533A\uFF0C\u4E0D\u8981\u628A\u9009\u533A\u4E4B\u5916\u7684\u767D\u677F\u5185\u5BB9\u5F53\u4F5C\u8F93\u5165\u3002
- image_observation \u5FC5\u987B\u5FE0\u5B9E\u8BB0\u5F55\u9009\u533A\u662F\u5426\u770B\u6E05\u3001\u5B9E\u9645\u770B\u5230\u4E86\u4EC0\u4E48\uFF08\u5305\u62EC\u767D\u677F\u5361\u7247\u4E2D\u7684\u6587\u5B57\u3001LaTeX\u516C\u5F0F\u3001\u56FE\u8868\u6216\u624B\u5199\u7B14\u8FF9\uFF09\u3002\u4E0D\u8981\u8865\u5199\u56FE\u7247\u4E2D\u4E0D\u5B58\u5728\u7684\u9898\u76EE\u3001\u516C\u5F0F\u6216\u6587\u5B57\u3002
- \u9009\u533A\u662F\u7528\u6237\u660E\u786E\u6307\u5B9A\u7684\u5B66\u4E60\u5BF9\u8C61\u3002\u82E5\u7528\u6237\u7528\u624B\u5199\u7EBF\u6761/\u7B14\u8FF9\u5708\u51FA\u6216\u6307\u5411\u4E86\u67D0\u5F20\u5361\u7247/\u516C\u5F0F\uFF0C\u5E94\u91CD\u70B9\u7406\u89E3\u88AB\u5708\u51FA/\u6307\u5411\u7684\u767D\u677F\u5361\u7247\u4E0E\u6838\u5FC3\u77E5\u8BC6\u70B9\u3002request_parts \u4F7F\u7528\u201C\u8FD9\u4E2A\u3001\u8FD9\u91CC\u3001\u8FD9\u4E2A\u516C\u5F0F\u201D\u7B49\u6307\u4EE3\u65F6\uFF0C\u5FC5\u987B\u7ED3\u5408 image_observation \u4E0E request_parts \u786E\u5B9A\u8BFE\u7A0B\u4E3B\u9898\u3002
- \u5982\u679C request_parts \u5DF2\u7ECF\u7ED9\u51FA\u5177\u4F53\u6559\u5B66\u8981\u6C42\u6216\u9009\u4E2D\u7684\u767D\u677F\u5185\u5BB9\uFF0C\u5C06\u5B83\u4E0E\u9009\u533A\u5185\u5BB9\u5408\u5E76\u7406\u89E3\uFF1B\u4E0D\u8981\u7528\u65E0\u5173\u77E5\u8BC6\u66FF\u6362\u9009\u533A\u91CC\u7684\u8868\u8FBE\u5F0F\u3002
- \u9009\u533A\u65E0\u6CD5\u770B\u6E05\u4E14\u6587\u5B57\u53C8\u4E0D\u80FD\u72EC\u7ACB\u786E\u5B9A\u4E3B\u9898\u65F6\uFF0C\u8FD4\u56DE clarify\uFF0C\u8981\u6C42\u7528\u6237\u91CD\u65B0\u6846\u9009\u6216\u5199\u5927\u4E00\u4E9B\uFF0Ccourse \u5FC5\u987B\u4E3A null\u3002
- \u9009\u533A\u90E8\u5206\u53EF\u8BFB\u65F6\uFF0C\u628A\u4E0D\u786E\u5B9A\u5185\u5BB9\u4FDD\u7559\u5728 uncertainties \u4E2D\uFF0C\u4E0D\u8981\u628A\u731C\u6D4B\u5F53\u6210\u786E\u5B9A\u4E8B\u5B9E\u3002

${ADMISSION_BOOTSTRAP_SYSTEM_PROMPT}`;
function cameraObservation(value2) {
  if (!value2 || typeof value2 !== "object" || Array.isArray(value2)) {
    throw new LessonPlanError("LESSON_PLAN_CAMERA_OBSERVATION", "$lessonPlanAdmission.image_observation", "expected an object");
  }
  const candidate = value2;
  const readability = candidate.readability;
  const observedContent = typeof candidate.observed_content === "string" ? candidate.observed_content.trim() : "";
  const uncertainties = Array.isArray(candidate.uncertainties) ? candidate.uncertainties.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean) : void 0;
  if (readability !== "readable" && readability !== "partially_readable" && readability !== "unreadable") {
    throw new LessonPlanError("LESSON_PLAN_CAMERA_OBSERVATION", "$lessonPlanAdmission.image_observation.readability", "expected readable, partially_readable, or unreadable");
  }
  if (uncertainties === void 0 || uncertainties.length > 12) {
    throw new LessonPlanError("LESSON_PLAN_CAMERA_OBSERVATION", "$lessonPlanAdmission.image_observation.uncertainties", "expected at most 12 strings");
  }
  if (observedContent.length > 4e3 || uncertainties.some((item) => item.length > 480)) {
    throw new LessonPlanError("LESSON_PLAN_CAMERA_OBSERVATION", "$lessonPlanAdmission.image_observation", "camera observation exceeds its bounded text size");
  }
  if (readability !== "unreadable" && !observedContent) {
    throw new LessonPlanError("LESSON_PLAN_CAMERA_OBSERVATION", "$lessonPlanAdmission.image_observation.observed_content", "readable camera input requires observed content");
  }
  return { readability, observed_content: observedContent, uncertainties };
}
function positiveInteger(value2, fallback, label) {
  const result = value2 ?? fallback;
  if (!Number.isInteger(result) || result < 1) throw new Error(`${label} must be a positive integer`);
  return result;
}
function parseModelJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new LessonPlanError(
      "LESSON_PLAN_MODEL_JSON",
      `$${label}`,
      error instanceof Error ? error.message : "model output is not JSON"
    );
  }
}
function errorFeedback(error) {
  if (error instanceof LessonPlanError) {
    return JSON.stringify({ code: error.code, path: error.path, message: error.message });
  }
  return JSON.stringify({ code: "LESSON_PLAN_GENERATION", message: error instanceof Error ? error.message : String(error) });
}
function rejectionDetails(error) {
  if (error instanceof LessonPlanError) {
    return { code: error.code, path: error.path, message: error.message };
  }
  return {
    code: "LESSON_PLAN_GENERATION",
    message: error instanceof Error ? error.message : String(error)
  };
}
function pruneModelNulls(value2) {
  if (Array.isArray(value2)) return value2.map(pruneModelNulls);
  if (!value2 || typeof value2 !== "object") return value2;
  return Object.fromEntries(
    Object.entries(value2).filter(([, child]) => child !== null).map(([key, child]) => [key, pruneModelNulls(child)])
  );
}
var TARGET_SLIDER_INTERVALS = 200;
var PROGRAM_HINT_AFTER_ATTEMPTS = 2;
var PROGRAM_ANIMATION_EASING = "linear";
var PROGRAM_SCENE_ANGULAR_TOLERANCE_DEGREES = 7.5;
var PROGRAM_SCENE_ZOOM_TOLERANCE = 0.1;
function deriveSliderStep(min, max) {
  const span2 = max - min;
  return span2 / TARGET_SLIDER_INTERVALS;
}
function normalizeModelNumberRange(number) {
  if (typeof number.initial !== "number" || !Number.isFinite(number.initial) || typeof number.min !== "number" || !Number.isFinite(number.min) || typeof number.max !== "number" || !Number.isFinite(number.max)) return;
  const initial = number.initial;
  let min = Math.min(number.min, number.max, initial);
  let max = Math.max(number.min, number.max, initial);
  if (min === max) {
    const padding = Math.max(1, Math.abs(initial) * 0.1);
    min = initial - padding;
    max = initial + padding;
  }
  number.min = min;
  number.max = max;
  number.initial = initial;
}
function defaultCoverageSection(requestPart, requestPartCount, sectionCount) {
  return Math.min(
    sectionCount,
    Math.max(1, Math.ceil(requestPart * sectionCount / requestPartCount))
  );
}
function lowerModelOutline(value2, requestPartCount = 0) {
  const root = pruneModelNulls(value2);
  if (!root || typeof root !== "object" || Array.isArray(root)) return root;
  const candidate = root;
  candidate.version = LESSON_PLAN_VERSION;
  if (Array.isArray(candidate.numbers)) {
    candidate.numbers = candidate.numbers.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const number = { ...entry };
      delete number.student_control;
      if (typeof number.unit === "string" && !number.unit.trim()) delete number.unit;
      if (typeof number.label === "string" && !number.label.trim()) delete number.label;
      normalizeModelNumberRange(number);
      if (typeof number.min === "number" && Number.isFinite(number.min) && typeof number.max === "number" && Number.isFinite(number.max) && number.max > number.min) {
        number.student_control = {
          kind: "slider",
          step: deriveSliderStep(number.min, number.max)
        };
      } else if (number.student_control !== void 0) {
        number.student_control = { kind: "slider" };
      }
      return number;
    });
  }
  if (Array.isArray(candidate.request_coverage)) {
    candidate.request_coverage = candidate.request_coverage.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const coverage = { ...entry };
      coverage.request_part = index + 1;
      if (coverage.treatment === "teach") delete coverage.reason;
      return coverage;
    });
  }
  if (requestPartCount > 0 && (candidate.request_coverage === void 0 || Array.isArray(candidate.request_coverage)) && Array.isArray(candidate.sections) && candidate.sections.length > 0) {
    const coverage = candidate.request_coverage ?? [];
    for (let index = coverage.length; index < requestPartCount; index += 1) {
      const requestPart = index + 1;
      coverage.push({
        request_part: requestPart,
        treatment: "teach",
        sections: [defaultCoverageSection(requestPart, requestPartCount, candidate.sections.length)]
      });
    }
    candidate.request_coverage = coverage;
  }
  if (Array.isArray(candidate.course_visuals) && Array.isArray(candidate.sections)) {
    const sections = candidate.sections.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const section = { ...entry };
      section.allowed_capabilities = [];
      section.reusable_items = Array.isArray(section.reusable_items) ? section.reusable_items.filter((item) => !item || typeof item !== "object" || Array.isArray(item) || item.board_kind !== "visual") : [];
      return section;
    });
    candidate.course_visuals = candidate.course_visuals.map((entry, visualIndex) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const visual = { ...entry };
      if (Array.isArray(visual.use_sections)) {
        const sections2 = visual.use_sections.filter((section2) => Number.isInteger(section2) && Number(section2) > 0).map(Number);
        if (sections2.length > 0) visual.create_section = Math.min(...sections2);
      }
      if (!Array.isArray(visual.required_features)) {
        throw new LessonPlanError(
          "LESSON_PLAN_CAPABILITY_REQUIREMENTS",
          `$lessonPlanOutline.course_visuals[${visualIndex}].required_features`,
          "model output must describe controlled visual features; execution capability names are not accepted"
        );
      }
      {
        const featurePath = `$lessonPlanOutline.course_visuals[${visualIndex}].required_features`;
        const requestedFeatures = visual.required_features.map((feature, featureIndex) => {
          if (typeof feature !== "string" || !LESSON_PLAN_VISUAL_FEATURES.includes(feature)) {
            throw new LessonPlanError(
              "LESSON_PLAN_UNSUPPORTED_REQUIREMENT",
              `${featurePath}[${featureIndex}]`,
              `unsupported visual feature: ${String(feature)}`
            );
          }
          return feature;
        });
        visual.capability = matchLessonPlanCapability(requestedFeatures);
        delete visual.required_features;
      }
      const createSection = Number(visual.create_section);
      const section = sections[createSection - 1];
      if (section && typeof section === "object" && !Array.isArray(section)) {
        const sectionRecord = section;
        const capabilities = Array.isArray(sectionRecord.allowed_capabilities) ? sectionRecord.allowed_capabilities : [];
        if (!capabilities.includes(visual.capability)) capabilities.push(visual.capability);
        sectionRecord.allowed_capabilities = capabilities;
        const reusableItems = Array.isArray(sectionRecord.reusable_items) ? sectionRecord.reusable_items : [];
        reusableItems.push({ kind: "board_item", board_kind: "visual", capability: visual.capability });
        sectionRecord.reusable_items = reusableItems;
        visual.reusable_item = reusableItems.length;
      }
      const useSections = Array.isArray(visual.use_sections) ? visual.use_sections : [];
      visual.use_sections = [.../* @__PURE__ */ new Set([createSection, ...useSections])].sort((left, right) => Number(left) - Number(right));
      return visual;
    });
    candidate.sections = sections;
  }
  if (!candidate.close || typeof candidate.close !== "object" || Array.isArray(candidate.close)) return candidate;
  const close = { ...candidate.close };
  delete close.focus;
  const focus = [];
  if (Array.isArray(candidate.course_visuals)) {
    for (let position = candidate.course_visuals.length; position >= 1 && focus.length < 2; position -= 1) {
      const visual = candidate.course_visuals[position - 1];
      if (!visual || typeof visual !== "object" || Array.isArray(visual)) continue;
      const item = visual;
      if (!Number.isInteger(item.create_section) || !Number.isInteger(item.reusable_item)) continue;
      focus.push({ source: "reusable", section: Number(item.create_section), item: Number(item.reusable_item) });
    }
  }
  if (focus.length === 0 && Array.isArray(candidate.sections)) {
    for (let section = candidate.sections.length; section >= 1 && focus.length < 2; section -= 1) {
      const sectionValue = candidate.sections[section - 1];
      if (!sectionValue || typeof sectionValue !== "object" || Array.isArray(sectionValue)) continue;
      const reusableItems = sectionValue.reusable_items;
      if (!Array.isArray(reusableItems)) continue;
      for (let item = reusableItems.length; item >= 1 && focus.length < 2; item -= 1) {
        focus.push({ source: "reusable", section, item });
      }
    }
  }
  close.focus = focus.reverse();
  candidate.close = close;
  return candidate;
}
var modelActionCollections = {
  visual_creates: { action: "create", kind: "visual" },
  math_creates: { action: "create", kind: "math" },
  note_creates: { action: "create", kind: "note" },
  focuses: { action: "focus" },
  points: { action: "point_at" },
  animations: { action: "animate" }
};
function withProgramCreateDefaults(value2, kind, relation) {
  const lowered = { ...value2 };
  if (lowered.role === void 0) {
    lowered.role = kind === "visual" ? relation === "comparison" ? "comparison_visual" : relation === "supporting" ? "supporting_visual" : "main_visual" : kind === "math" ? "derivation" : "explanation";
  }
  if (lowered.placement === void 0) {
    lowered.placement = {
      relation: kind === "visual" ? relation === "supporting" || relation === "comparison" ? "right_of" : "new_region" : "below"
    };
  }
  return lowered;
}
function lowerModelReference(value2, currentMoment) {
  if (!value2 || typeof value2 !== "object" || Array.isArray(value2)) return value2;
  const reference = value2;
  const part = reference.part === void 0 ? {} : { part: reference.part };
  if (reference.source === "local_board_item" || reference.source === "local_connection" || reference.source === "local_group") {
    return {
      source: reference.source,
      moment: reference.moment === 0 && currentMoment !== void 0 ? currentMoment : reference.moment,
      item: reference.item,
      ...part
    };
  }
  if (reference.source === "reusable") {
    return {
      source: "reusable",
      section: reference.section,
      item: reference.item,
      ...part
    };
  }
  if (reference.source === "host") {
    return {
      source: "host",
      reference: reference.host_reference ?? reference.reference,
      ...part
    };
  }
  return value2;
}
var boardContentKeys = {
  text: ["text"],
  math: ["latex"],
  shape: ["title", "items"],
  note: ["title", "items"],
  table: ["columns", "rows"],
  image: ["resource", "alt"]
};
function lowerModelBoardContent(kind, value2, numberCount) {
  if (typeof kind !== "string" || !value2 || typeof value2 !== "object" || Array.isArray(value2)) return value2;
  const content = value2;
  if (kind !== "visual") {
    const allowed = boardContentKeys[kind];
    if (!allowed) return value2;
    const lowered = Object.fromEntries(
      allowed.filter((key) => content[key] !== void 0).map((key) => [key, content[key]])
    );
    if ((kind === "note" || kind === "shape") && (typeof lowered.title !== "string" || !lowered.title.trim()) && Array.isArray(lowered.items) && typeof lowered.items[0] === "string" && lowered.items[0].trim()) {
      lowered.title = lowered.items[0].trim().slice(0, 240);
    }
    return lowered;
  }
  const capability2 = content.capability;
  const parameters3 = content.parameters && typeof content.parameters === "object" && !Array.isArray(content.parameters) ? { ...content.parameters } : {};
  const hooks = typeof capability2 === "string" ? RECIPE_HOOKS[capability2] : void 0;
  const forceNoNumbers = hooks?.lower_model_parameters?.(parameters3, { numberCount })?.no_numbers === true;
  if (typeof content.title === "string" && parameters3.title === void 0) parameters3.title = content.title;
  if (typeof capability2 === "string" && capability2 in LESSON_PLAN_VISUAL_PARAMETER_NAMES) {
    const allowedParameters = new Set(
      LESSON_PLAN_MODEL_VISUAL_PARAMETER_NAMES[capability2]
    );
    for (const key of Object.keys(parameters3)) {
      if (!allowedParameters.has(key)) delete parameters3[key];
    }
  }
  const numberLimit = typeof capability2 === "string" && capability2 in LESSON_PLAN_CAPABILITY_NUMBER_LIMITS ? LESSON_PLAN_CAPABILITY_NUMBER_LIMITS[capability2] : 0;
  let validNumbers = Array.isArray(content.numbers) ? [...new Set(content.numbers.filter((number) => Number.isInteger(number) && Number(number) >= 1 && Number(number) <= numberCount))].slice(0, numberLimit) : [];
  if (forceNoNumbers) validNumbers = [];
  const parameterNumbers = hooks?.numbers_from_parameters?.(parameters3, { numberCount, limit: numberLimit }) ?? [];
  if (parameterNumbers.length > 0) validNumbers = parameterNumbers;
  if (!forceNoNumbers && capability2 !== "function_plot" && validNumbers.length === 0 && numberCount === 1 && typeof capability2 === "string" && capability2 in LESSON_PLAN_CAPABILITIES && LESSON_PLAN_CAPABILITIES[capability2].includes("primary_control")) {
    validNumbers = [1];
  }
  return {
    ...capability2 === void 0 ? {} : { capability: capability2 },
    ...Object.keys(parameters3).length === 0 ? {} : { parameters: parameters3 },
    ...validNumbers.length === 0 ? {} : { numbers: validNumbers }
  };
}
function visualNumberPurpose(capability2, index) {
  const input = LESSON_PLAN_CAPABILITY_REGISTRY[capability2].number_inputs[index];
  if (!input || input.startsWith("curve_parameter_")) return "generic";
  if (input === "side_count") return "side_count";
  if (input === "angle" || input === "phase") return "angle";
  if (input === "radius") return "radius";
  if (input === "section_height" || input === "section_position") return "section";
  if (input === "progress") return "progress";
  return "generic";
}
function compatibleVisualNumberPurpose(left, right) {
  return left === "generic" || right === "generic" || left === right;
}
function recipeRemovalReason(content) {
  return RECIPE_HOOKS[content.capability]?.removal_reason?.(content);
}
function isExecutableProcessDiagram(content) {
  return recipeRemovalReason(content) === void 0;
}
function rebuildCreatePlacements(outline, drafts) {
  const latestReusableBefore = (sectionNumber) => {
    for (let section = sectionNumber - 1; section >= 1; section -= 1) {
      const items = outline.sections[section - 1]?.reusable_items ?? [];
      for (let item = items.length; item >= 1; item -= 1) {
        if (items[item - 1]?.kind === "board_item") {
          return { source: "reusable", section, item };
        }
      }
    }
    return void 0;
  };
  drafts.forEach((section, sectionOffset) => {
    let latestBoardReference = latestReusableBefore(sectionOffset + 1);
    section.moments.forEach((moment, momentOffset) => {
      let boardItem = 0;
      for (const action of moment.actions) {
        if (action.action !== "create") continue;
        const requestedRelation = action.placement?.relation ?? "new_region";
        action.placement = requestedRelation !== "new_region" && latestBoardReference ? {
          relation: requestedRelation,
          reference: structuredClone(latestBoardReference)
        } : { relation: "new_region" };
        boardItem += 1;
        latestBoardReference = {
          source: "local_board_item",
          moment: momentOffset + 1,
          item: boardItem
        };
      }
    });
  });
}
function sanitizeNonessentialVisuals(outlineValue, draftValues) {
  const outline = structuredClone(outlineValue);
  const drafts = structuredClone(draftValues);
  const adjustments = [];
  const courseVisualPositionBySlot = /* @__PURE__ */ new Map();
  (outline.course_visuals ?? []).forEach((visual, index) => {
    courseVisualPositionBySlot.set(`${visual.create_section}:${visual.reusable_item}`, index + 1);
  });
  const droppedCourseVisuals = /* @__PURE__ */ new Set();
  const establishedPurposes = /* @__PURE__ */ new Map();
  const visualEntries = [];
  for (const [sectionOffset, section] of drafts.entries()) {
    const sectionNumber = sectionOffset + 1;
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "create" || action.kind !== "visual") continue;
        const content = action.content;
        const slot = Number(action.reusable_item);
        const courseVisualPosition = Number.isInteger(slot) ? courseVisualPositionBySlot.get(`${sectionNumber}:${slot}`) : void 0;
        const processDiagramReason = recipeRemovalReason(content);
        if (processDiagramReason) {
          adjustments.push({
            kind: "visual_removed",
            section: sectionNumber,
            capability: content.capability,
            reason: processDiagramReason
          });
          if (courseVisualPosition !== void 0) droppedCourseVisuals.add(courseVisualPosition);
          continue;
        }
        visualEntries.push({
          content,
          courseVisualPosition,
          relation: courseVisualPosition === void 0 ? void 0 : outline.course_visuals?.[courseVisualPosition - 1]?.relation
        });
      }
    }
  }
  visualEntries.sort((left, right) => {
    const priority = (relation) => relation === "supporting" ? 1 : 0;
    return priority(left.relation) - priority(right.relation) || (left.courseVisualPosition ?? Number.MAX_SAFE_INTEGER) - (right.courseVisualPosition ?? Number.MAX_SAFE_INTEGER);
  });
  for (const entry of visualEntries) {
    const incompatible = (entry.content.numbers ?? []).some((number, index) => {
      const next = RECIPE_HOOKS[entry.content.capability]?.free_number?.(entry.content, index) ? "generic" : visualNumberPurpose(entry.content.capability, index);
      const current = establishedPurposes.get(number);
      if (!current || compatibleVisualNumberPurpose(current, next)) {
        if (!current || current === "generic") establishedPurposes.set(number, next);
        return false;
      }
      return true;
    });
    if (!incompatible) continue;
    if (entry.relation === "supporting" && entry.courseVisualPosition !== void 0) {
      droppedCourseVisuals.add(entry.courseVisualPosition);
    } else {
      delete entry.content.numbers;
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    (outline.course_visuals ?? []).forEach((visual, index) => {
      const position = index + 1;
      if (droppedCourseVisuals.has(position)) return;
      if (visual.related_visual !== void 0 && droppedCourseVisuals.has(visual.related_visual)) {
        droppedCourseVisuals.add(position);
        changed = true;
      }
    });
  }
  const droppedActions = /* @__PURE__ */ new Set();
  const replacementForDroppedAction = /* @__PURE__ */ new Map();
  const droppedReusable = /* @__PURE__ */ new Set();
  for (const [sectionOffset, section] of drafts.entries()) {
    const sectionNumber = sectionOffset + 1;
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "create" || action.kind !== "visual") continue;
        const content = action.content;
        const slot = Number(action.reusable_item);
        const position = Number.isInteger(slot) ? courseVisualPositionBySlot.get(`${sectionNumber}:${slot}`) : void 0;
        if (!isExecutableProcessDiagram(content) || position !== void 0 && droppedCourseVisuals.has(position)) {
          droppedActions.add(action);
          if (Number.isInteger(slot)) droppedReusable.add(`${sectionNumber}:${slot}`);
        }
      }
    }
  }
  for (const [sectionOffset, section] of drafts.entries()) {
    section.moments.forEach((moment, momentOffset) => {
      const bySignature = /* @__PURE__ */ new Map();
      for (const action of moment.actions) {
        if (action.action !== "create" || action.kind !== "math" && action.kind !== "note") continue;
        const signature = JSON.stringify({ kind: action.kind, content: action.content });
        const prior = bySignature.get(signature);
        if (!prior) {
          bySignature.set(signature, action);
          continue;
        }
        const priorReusable = Number.isInteger(prior.reusable_item);
        const currentReusable = Number.isInteger(action.reusable_item);
        const removed = currentReusable && !priorReusable ? prior : action;
        const retained = removed === prior ? action : prior;
        if (removed === prior) bySignature.set(signature, action);
        droppedActions.add(removed);
        replacementForDroppedAction.set(removed, retained);
        adjustments.push({
          kind: "duplicate_board_item_removed",
          section: sectionOffset + 1,
          moment: momentOffset + 1,
          board_kind: action.kind,
          reason: "same_moment_exact_duplicate"
        });
      }
    });
  }
  const localBoardItemMap = /* @__PURE__ */ new Map();
  for (const [sectionOffset, section] of drafts.entries()) {
    const sectionNumber = sectionOffset + 1;
    section.moments.forEach((moment, momentOffset) => {
      const creates = moment.actions.filter((action) => action.action === "create");
      const retainedIndex = /* @__PURE__ */ new Map();
      let nextIndex = 0;
      for (const action of creates) {
        if (droppedActions.has(action)) continue;
        nextIndex += 1;
        retainedIndex.set(action, nextIndex);
      }
      creates.forEach((action, oldOffset) => {
        const replacement = replacementForDroppedAction.get(action);
        localBoardItemMap.set(
          `${sectionNumber}:${momentOffset + 1}:${oldOffset + 1}`,
          droppedActions.has(action) ? replacement ? retainedIndex.get(replacement) : void 0 : retainedIndex.get(action)
        );
      });
    });
  }
  const retainedReusable = /* @__PURE__ */ new Set();
  for (const [sectionOffset, section] of drafts.entries()) {
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (droppedActions.has(action) || action.action !== "create") continue;
        if (Number.isInteger(action.reusable_item)) retainedReusable.add(`${sectionOffset + 1}:${action.reusable_item}`);
      }
    }
  }
  const reassignedReusable = /* @__PURE__ */ new Set();
  for (const key of droppedReusable) {
    const [sectionNumberText, slotText] = key.split(":");
    const sectionNumber = Number(sectionNumberText);
    const slot = Number(slotText);
    if ([...retainedReusable].some((candidate) => candidate.startsWith(`${sectionNumber}:`))) continue;
    const section = drafts[sectionNumber - 1];
    const replacement = [...section?.moments ?? []].flatMap((moment) => moment.actions).findLast((action) => action.action === "create" && !droppedActions.has(action) && action.reusable_item === void 0 && action.kind !== "visual");
    if (!replacement || replacement.action !== "create") continue;
    replacement.reusable_item = slot;
    const declaration = outline.sections[sectionNumber - 1]?.reusable_items?.[slot - 1];
    if (declaration) {
      outline.sections[sectionNumber - 1].reusable_items[slot - 1] = {
        kind: "board_item",
        board_kind: replacement.kind
      };
      retainedReusable.add(key);
      reassignedReusable.add(key);
    }
  }
  const removedReusable = new Set(
    [...droppedReusable].filter((key) => !reassignedReusable.has(key))
  );
  const reusableItemMap = /* @__PURE__ */ new Map();
  outline.sections.forEach((section, sectionOffset) => {
    const sectionNumber = sectionOffset + 1;
    const retainedItems = (section.reusable_items ?? []).flatMap((item, itemOffset) => {
      const oldItem = itemOffset + 1;
      if (removedReusable.has(`${sectionNumber}:${oldItem}`)) return [];
      return [{ item, oldItem }];
    });
    retainedItems.forEach(({ oldItem }, index) => {
      reusableItemMap.set(`${sectionNumber}:${oldItem}`, index + 1);
    });
    section.reusable_items = retainedItems.map(({ item }) => item);
  });
  drafts.forEach((section, sectionOffset) => {
    const sectionNumber = sectionOffset + 1;
    for (const moment of section.moments) {
      for (const action of moment.actions) {
        if (action.action !== "create" || !Number.isInteger(action.reusable_item)) continue;
        const nextItem = reusableItemMap.get(`${sectionNumber}:${action.reusable_item}`);
        if (nextItem !== void 0) action.reusable_item = nextItem;
      }
    }
  });
  const normalizeReference = (reference, sectionNumber) => {
    if (!reference) return void 0;
    const next = structuredClone(reference);
    if (next.source === "local_board_item") {
      const item = localBoardItemMap.get(`${sectionNumber}:${next.moment}:${next.item}`);
      if (item === void 0) return void 0;
      next.item = item;
    } else if (next.source === "reusable") {
      const key = `${next.section}:${next.item}`;
      if (removedReusable.has(key)) return void 0;
      const nextItem = reusableItemMap.get(key);
      if (nextItem === void 0) return void 0;
      next.item = nextItem;
      if (reassignedReusable.has(key)) delete next.part;
    }
    return next;
  };
  for (const [sectionOffset, section] of drafts.entries()) {
    const sectionNumber = sectionOffset + 1;
    for (const moment of section.moments) {
      const actions = [];
      for (const action of moment.actions) {
        if (droppedActions.has(action)) continue;
        const next = structuredClone(action);
        if (next.action === "create") {
          const reference = normalizeReference(next.placement?.reference, sectionNumber);
          if (next.placement && next.placement.reference && !reference) {
            next.placement = { relation: "new_region" };
          } else if (next.placement && reference) {
            next.placement.reference = reference;
          }
        } else if (next.action === "revise" || next.action === "emphasize" || next.action === "point_at") {
          const reference = normalizeReference(next.reference, sectionNumber);
          if (!reference) continue;
          next.reference = reference;
        } else if (next.action === "connect") {
          const from = normalizeReference(next.from_ref, sectionNumber);
          const to = normalizeReference(next.to_ref, sectionNumber);
          if (!from || !to) continue;
          next.from_ref = from;
          next.to_ref = to;
        } else if (next.action === "group") {
          next.members = next.members.flatMap((reference) => {
            const normalized = normalizeReference(reference, sectionNumber);
            return normalized ? [normalized] : [];
          });
          if (next.members.length === 0) continue;
        } else if (next.action === "focus") {
          next.references = next.references.flatMap((reference) => {
            const normalized = normalizeReference(reference, sectionNumber);
            return normalized ? [normalized] : [];
          });
          if (next.references.length === 0) continue;
        }
        actions.push(next);
      }
      moment.actions = actions.length > 0 ? actions : [{
        action: "teacher_expression",
        expression: "neutral",
        timing: "after_speech"
      }];
    }
    if (section.student_activities) {
      section.student_activities = section.student_activities.flatMap((activity) => {
        if (activity.kind === "number_target") return [activity];
        const reference = normalizeReference(activity.reference, sectionNumber);
        return reference ? [{ ...activity, reference }] : [];
      });
      if (section.student_activities.length === 0) delete section.student_activities;
    }
  }
  rebuildCreatePlacements(outline, drafts);
  if (outline.course_visuals) {
    const retainedPositions = outline.course_visuals.map((visual, index) => ({ visual, oldPosition: index + 1 })).filter(({ oldPosition }) => !droppedCourseVisuals.has(oldPosition));
    const positionMap = new Map(retainedPositions.map(({ oldPosition }, index) => [oldPosition, index + 1]));
    outline.course_visuals = retainedPositions.map(({ visual }) => ({
      ...visual,
      reusable_item: reusableItemMap.get(`${visual.create_section}:${visual.reusable_item}`) ?? visual.reusable_item,
      ...visual.related_visual === void 0 ? {} : { related_visual: positionMap.get(visual.related_visual) }
    }));
  }
  outline.close.focus = outline.close.focus.flatMap((reference) => {
    const normalized = normalizeReference(reference, outline.sections.length + 1);
    return normalized ? [normalized] : [];
  });
  if (outline.close.focus.length === 0) {
    const fallback = [...retainedReusable].flatMap((key) => {
      const [section, item] = key.split(":").map(Number);
      const nextItem = reusableItemMap.get(key);
      return nextItem === void 0 ? [] : [`${section}:${nextItem}`];
    }).at(-1);
    if (fallback) {
      const [section, item] = fallback.split(":").map(Number);
      outline.close.focus = [{ source: "reusable", section, item }];
    }
  }
  return { outline, drafts, adjustments };
}
function normalizeExecutableNumberInteractions(outlineValue, draftValues) {
  const sanitized = sanitizeNonessentialVisuals(outlineValue, draftValues);
  const outline = sanitized.outline;
  const drafts = sanitized.drafts;
  const visuallyBound = /* @__PURE__ */ new Set();
  const publishedPlotNumbers = /* @__PURE__ */ new Set();
  for (const [sectionIndex, section] of drafts.entries()) {
    const newPlotNumbers = /* @__PURE__ */ new Set();
    for (const [momentIndex, moment] of section.moments.entries()) {
      for (const [actionIndex, action] of moment.actions.entries()) {
        if ((action.action === "create" || action.action === "revise") && action.kind === "visual") {
          const visual = action.content;
          const bound = RECIPE_HOOKS[visual.capability]?.bound_numbers?.(visual);
          for (const number of bound ?? visual.numbers ?? []) visuallyBound.add(number);
          if (visual.capability === "function_plot") {
            for (const number of bound ?? []) newPlotNumbers.add(number);
          }
        }
        if (action.action !== "animate") continue;
        const definition = outline.numbers?.[action.number - 1];
        if (!definition || !Number.isFinite(action.end_value)) continue;
        const nextMin = Math.min(definition.min, action.end_value);
        const nextMax = Math.max(definition.max, action.end_value);
        if (nextMin === definition.min && nextMax === definition.max) continue;
        if (publishedPlotNumbers.has(action.number)) {
          throw new LessonPlanError(
            "LESSON_PLAN_INTERACTION_MISMATCH",
            `$lessonPlanSectionDrafts[${sectionIndex}].moments[${momentIndex}].actions[${actionIndex}].end_value`,
            `Keep the animation within the published graph's number ${action.number} range [${definition.min}, ${definition.max}]`
          );
        }
        definition.min = nextMin;
        definition.max = nextMax;
        definition.initial = Math.min(nextMax, Math.max(nextMin, definition.initial));
        if (definition.student_control) {
          definition.student_control.step = deriveSliderStep(nextMin, nextMax);
        }
      }
    }
    for (const number of newPlotNumbers) publishedPlotNumbers.add(number);
  }
  outline.numbers?.forEach((number, index) => {
    if (!visuallyBound.has(index + 1)) delete number.student_control;
  });
  for (const section of drafts) {
    for (const [momentOffset, moment] of section.moments.entries()) {
      moment.actions = moment.actions.filter((action) => {
        if (action.action !== "animate" || visuallyBound.has(action.number)) return true;
        sanitized.adjustments.push({
          kind: "number_interaction_removed",
          section: section.section,
          moment: momentOffset + 1,
          number: action.number,
          reason: "number_not_bound_to_any_executable_visual"
        });
        return false;
      });
      if (moment.actions.length === 0) {
        moment.actions.push({
          action: "teacher_expression",
          expression: "neutral",
          timing: "after_speech"
        });
      }
    }
    if (!section.student_activities) continue;
    section.student_activities = section.student_activities.flatMap((activity) => {
      if (activity.kind !== "number_target") return [activity];
      const numberControls = activity.number_controls.filter(({ number }) => visuallyBound.has(number));
      const expressionNumbers = new Set((activity.expression ?? []).flatMap((token) => token.kind === "number" ? [token.number] : []));
      if (numberControls.length === 0 || [...expressionNumbers].some((number) => !visuallyBound.has(number))) {
        sanitized.adjustments.push({
          kind: "number_interaction_removed",
          section: section.section,
          number: activity.number_controls[0]?.number,
          reason: "activity_depends_on_number_without_an_executable_visual"
        });
        return [];
      }
      if (numberControls.length !== activity.number_controls.length) {
        for (const control of activity.number_controls) {
          if (visuallyBound.has(control.number)) continue;
          sanitized.adjustments.push({
            kind: "number_interaction_removed",
            section: section.section,
            number: control.number,
            reason: "activity_control_not_bound_to_any_executable_visual"
          });
        }
      }
      return [{ ...activity, number_controls: numberControls }];
    });
    if (section.student_activities.length === 0) delete section.student_activities;
  }
  return { outline, drafts, adjustments: sanitized.adjustments };
}
function lowerModelActionReferences(actionName, action, currentMoment, numberCount) {
  const lowered = { ...action };
  if (actionName === "create" || actionName === "revise") {
    lowered.content = lowerModelBoardContent(lowered.kind, lowered.content, numberCount);
  }
  if (actionName === "create" && lowered.placement && typeof lowered.placement === "object" && !Array.isArray(lowered.placement)) {
    const placement = { ...lowered.placement };
    if (placement.reference !== void 0) placement.reference = lowerModelReference(placement.reference, currentMoment);
    lowered.placement = placement;
  }
  if (actionName === "point_at") {
    delete lowered.reference;
  } else if (actionName === "revise" || actionName === "emphasize") {
    lowered.reference = lowerModelReference(lowered.reference, currentMoment);
  }
  if (actionName === "connect") {
    lowered.from_ref = lowerModelReference(lowered.from_ref, currentMoment);
    lowered.to_ref = lowerModelReference(lowered.to_ref, currentMoment);
  }
  if (actionName === "group" && Array.isArray(lowered.members)) {
    lowered.members = lowered.members.map((reference) => lowerModelReference(reference, currentMoment));
  }
  if (actionName === "focus") delete lowered.references;
  if (actionName === "animate") {
    delete lowered.easing;
    lowered.easing = PROGRAM_ANIMATION_EASING;
  }
  if (lowered.placement && typeof lowered.placement === "object" && !Array.isArray(lowered.placement)) {
    const placement = { ...lowered.placement };
    delete placement.align;
    delete placement.gap;
    lowered.placement = placement;
  }
  return lowered;
}
function lowerIntegerDecimal(record3, prefix, path) {
  const mantissa = record3[`${prefix}_mantissa`];
  const scale = record3[`${prefix}_scale`];
  if (!Number.isInteger(mantissa) || Math.abs(Number(mantissa)) > 1e12 || !Number.isInteger(scale) || Number(scale) < 0 || Number(scale) > 6) {
    throw new LessonPlanError("LESSON_PLAN_MODEL_NUMBER", path, "expected bounded integer mantissa and scale from 0 to 6");
  }
  delete record3[`${prefix}_mantissa`];
  delete record3[`${prefix}_scale`];
  return Number(mantissa) / 10 ** Number(scale);
}
function lowerModelActivityNumbers(activity, kind, path, outline, expectedSection, language) {
  const lowered = { ...activity };
  delete lowered.hint_after_attempts;
  lowered.hint_after_attempts = PROGRAM_HINT_AFTER_ATTEMPTS;
  if (kind === "number_target") {
    const requestedValue = lowerIntegerDecimal(lowered, "value", `${path}.value`);
    delete lowered.expression;
    delete lowered.tolerance;
    delete lowered.tolerance_mantissa;
    delete lowered.tolerance_scale;
    const numberIndex = Number(lowered.number);
    delete lowered.number;
    const definition = outline.numbers?.[numberIndex - 1];
    if (!definition) {
      throw new LessonPlanError("LESSON_PLAN_ACTIVITY", `${path}.number_controls`, "expected one existing numeric control");
    }
    const canUseGeometryPoint = (outline.numbers?.length ?? 0) === 1 && outline.sections.slice(0, expectedSection).some((section) => (section.reusable_items ?? []).some((item) => item.capability !== void 0 && LESSON_PLAN_CAPABILITY_REGISTRY[item.capability].student_controls.includes("geometry_point")) || section.allowed_capabilities.some((capability2) => LESSON_PLAN_CAPABILITY_REGISTRY[capability2].student_controls.includes("geometry_point")));
    lowered.number_controls = [{
      number: numberIndex,
      controls: ["slider", ...canUseGeometryPoint ? ["geometry_point"] : []]
    }];
    const minimum = Number(definition.min);
    const maximum = Number(definition.max);
    const range = maximum - minimum;
    const step = definition.student_control?.step;
    const snapToReachableValue = (value2) => {
      let reachable = Math.min(maximum, Math.max(minimum, value2));
      if (typeof step === "number" && Number.isFinite(step) && step > 0) {
        const stepCount = Math.round((reachable - minimum) / step);
        reachable = Math.min(maximum, Math.max(minimum, minimum + stepCount * step));
      }
      return reachable;
    };
    let reachableValue = snapToReachableValue(requestedValue);
    const tolerance = Math.max(
      typeof step === "number" && Number.isFinite(step) && step > 0 ? step / 2 : 0,
      range / 1e3,
      1e-6
    );
    const initial = Number(definition.initial);
    if (Math.abs(reachableValue - initial) <= tolerance) {
      const alternatives = [minimum, maximum].map(snapToReachableValue).filter((value2, index, values) => values.indexOf(value2) === index).sort((left, right) => Math.abs(right - initial) - Math.abs(left - initial));
      const alternative = alternatives.find((value2) => Math.abs(value2 - initial) > tolerance);
      if (alternative === void 0) {
        throw new LessonPlanError(
          "LESSON_PLAN_ACTIVITY",
          path,
          "numeric task has no reachable target distinct from the initial value"
        );
      }
      reachableValue = alternative;
      const formattedValue = Number(reachableValue.toPrecision(12));
      const label = definition.label?.trim() || lessonText(language, "\u6570\u503C");
      const unit = definition.unit?.trim();
      lowered.prompt = lessonText(language, "\u8BF7\u628A{{v0}}\u8C03\u5230 {{v1}}{{v2}}\u3002", { v0: label, v1: formattedValue, v2: unit ? ` ${unit}` : "" });
      lowered.hints = [lessonText(language, "\u62D6\u52A8\u5DE6\u4E0B\u89D2\u7684\u6ED1\u6746\uFF0C\u89C2\u5BDF\u6570\u503C\u548C\u753B\u9762\u540C\u6B65\u53D8\u5316\u3002")];
      lowered.success_message = lessonText(language, "\u5B8C\u6210\uFF0C{{v0}}\u5DF2\u7ECF\u8C03\u5230 {{v1}}{{v2}}\u3002", { v0: label, v1: formattedValue, v2: unit ? ` ${unit}` : "" });
    }
    const precision = 10 ** 12;
    lowered.value = Math.round(reachableValue * precision) / precision;
    lowered.tolerance = tolerance;
  } else {
    const presets = {
      top: { yaw: 0, pitch: Math.PI / 2, zoom: 1 },
      front: { yaw: 0, pitch: 0, zoom: 1 },
      right: { yaw: Math.PI / 2, pitch: 0, zoom: 1 },
      left: { yaw: -Math.PI / 2, pitch: 0, zoom: 1 },
      isometric: { yaw: Math.PI / 4, pitch: Math.PI / 6, zoom: 1 }
    };
    let preset = typeof lowered.view_preset === "string" ? presets[lowered.view_preset] : void 0;
    if (!preset) {
      throw new LessonPlanError("LESSON_PLAN_ACTIVITY", path, "expected a supported 3D view preset");
    }
    delete lowered.view_preset;
    delete lowered.angular_tolerance_degrees;
    delete lowered.zoom_tolerance_percent;
    let angularTolerance = PROGRAM_SCENE_ANGULAR_TOLERANCE_DEGREES;
    const sceneCapability = outline.sections.slice(0, expectedSection).flatMap((section) => [
      ...section.allowed_capabilities,
      ...(section.reusable_items ?? []).flatMap((item) => item.capability ? [item.capability] : [])
    ]).reverse().find((capability2) => capability2 in LESSON_PLAN_SCENE_INITIAL_CAMERAS);
    const initial = sceneCapability ? LESSON_PLAN_SCENE_INITIAL_CAMERAS[sceneCapability] : void 0;
    if (initial && preset) {
      const separationDegrees = Math.max(
        Math.abs(preset.yaw - initial.yaw),
        Math.abs(preset.pitch - initial.pitch)
      ) * 180 / Math.PI;
      if (separationDegrees < 0.01) {
        preset = presets.top;
        angularTolerance = Math.min(angularTolerance, 10);
      } else {
        angularTolerance = Math.min(angularTolerance, Math.max(0.25, separationDegrees / 2));
      }
    }
    Object.assign(lowered, {
      match: "view_direction",
      ...preset,
      angular_tolerance: angularTolerance * Math.PI / 180,
      zoom_tolerance: PROGRAM_SCENE_ZOOM_TOLERANCE
    });
  }
  return lowered;
}
function reconcileBootstrapFirstSectionPositions(value2, outline) {
  const root = structuredClone(value2);
  if (!root || typeof root !== "object" || Array.isArray(root)) return root;
  const candidate = root;
  if (!Array.isArray(candidate.moments)) return root;
  if (candidate.course_visual_creates !== void 0 || candidate.reusable_board_creates !== void 0) {
    for (const momentValue of candidate.moments) {
      if (!momentValue || typeof momentValue !== "object" || Array.isArray(momentValue)) continue;
      delete momentValue.visual_creates;
    }
    return root;
  }
  const collect = (collection) => candidate.moments.flatMap((momentValue, momentIndex) => {
    if (!momentValue || typeof momentValue !== "object" || Array.isArray(momentValue)) return [];
    const entries = momentValue[collection];
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry, entryIndex) => entry && typeof entry === "object" && !Array.isArray(entry) ? [{
      entry,
      moment: momentIndex + 1,
      order: Number(entry.order),
      index: entryIndex
    }] : []);
  }).sort((left, right) => left.moment - right.moment || (Number.isFinite(left.order) ? left.order : Number.MAX_SAFE_INTEGER) - (Number.isFinite(right.order) ? right.order : Number.MAX_SAFE_INTEGER) || left.index - right.index);
  const visualCreates = collect("visual_creates");
  const unmatchedVisuals = new Set(visualCreates);
  const matchedVisuals = /* @__PURE__ */ new Map();
  const expectedVisuals = (outline.course_visuals ?? []).map((visual, index) => ({ visual, position: index + 1 })).filter(({ visual }) => visual.create_section === 1);
  for (const { visual, position } of expectedVisuals) {
    const matchesCapability = (candidateEntry) => {
      if (!unmatchedVisuals.has(candidateEntry)) return false;
      const content = candidateEntry.entry.content;
      return content && typeof content === "object" && !Array.isArray(content) && content.capability === visual.capability;
    };
    const match = visualCreates.find((candidateEntry) => candidateEntry.entry.course_visual === position && unmatchedVisuals.has(candidateEntry)) ?? visualCreates.find(matchesCapability);
    if (!match) continue;
    matchedVisuals.set(match, position);
    unmatchedVisuals.delete(match);
  }
  const fixedCourseCreates = Object.fromEntries([...matchedVisuals].map(([match, position]) => {
    const entry = structuredClone(match.entry);
    delete entry.order;
    delete entry.course_visual;
    delete entry.reusable_item;
    const content = entry.content && typeof entry.content === "object" && !Array.isArray(entry.content) ? { ...entry.content } : {};
    delete content.capability;
    entry.content = content;
    return [`visual_${position}`, { moment: match.moment, ...entry }];
  }));
  for (const momentValue of candidate.moments) {
    if (!momentValue || typeof momentValue !== "object" || Array.isArray(momentValue)) continue;
    delete momentValue.visual_creates;
  }
  if (expectedVisuals.length > 0) candidate.course_visual_creates = fixedCourseCreates;
  else delete candidate.course_visual_creates;
  const createsByKind = {
    math: collect("math_creates"),
    note: collect("note_creates")
  };
  const usedBoardCreates = /* @__PURE__ */ new Set();
  const reusableItems = outline.sections[0]?.reusable_items ?? [];
  const fixedReusableCreates = {};
  reusableItems.forEach((item, index) => {
    if (item.kind !== "board_item" || item.board_kind !== "math" && item.board_kind !== "note") return;
    const reusablePosition = index + 1;
    const match = createsByKind[item.board_kind].find((candidateEntry) => !usedBoardCreates.has(candidateEntry) && candidateEntry.entry.reusable_item === reusablePosition) ?? createsByKind[item.board_kind].find((candidateEntry) => !usedBoardCreates.has(candidateEntry));
    if (!match) return;
    usedBoardCreates.add(match);
    const entry = structuredClone(match.entry);
    delete entry.order;
    delete entry.reusable_item;
    fixedReusableCreates[`item_${index + 1}`] = { moment: match.moment, ...entry };
  });
  for (const [collection, entries] of Object.entries(createsByKind)) {
    const selected = new Set(entries.filter((entry) => usedBoardCreates.has(entry)).map(({ entry }) => entry));
    const property = collection === "math" ? "math_creates" : "note_creates";
    for (const momentValue of candidate.moments) {
      if (!momentValue || typeof momentValue !== "object" || Array.isArray(momentValue)) continue;
      const moment = momentValue;
      if (!Array.isArray(moment[property])) continue;
      moment[property] = moment[property].filter((entry) => !selected.has(entry));
    }
  }
  const expectsReusableBoardCreates = reusableItems.some((item) => item.kind === "board_item" && (item.board_kind === "math" || item.board_kind === "note"));
  if (expectsReusableBoardCreates) candidate.reusable_board_creates = fixedReusableCreates;
  else delete candidate.reusable_board_creates;
  return root;
}
function lowerAnswerActivity(value2, card) {
  const { prompt, answer, check, unit, simplest_fraction, hints } = value2;
  const hasUnit = unit !== void 0 && !(typeof unit === "string" && !unit.trim());
  return {
    kind: "numeric_answer",
    prompt,
    answer,
    check,
    ...hasUnit ? { unit } : {},
    ...simplest_fraction !== void 0 ? { simplest_fraction } : {},
    hints,
    reference: structuredClone(card)
  };
}
function practiceCard(draft) {
  let questionCard;
  let lastCard;
  draft.moments.forEach((moment, momentOffset) => {
    let item = 0;
    for (const action of moment.actions) {
      if (action.action !== "create") continue;
      item += 1;
      lastCard = { source: "local_board_item", moment: momentOffset + 1, item };
      if (action.kind === "note" || action.kind === "math") questionCard = lastCard;
    }
  });
  return questionCard ?? lastCard;
}
function taughtContent(draft) {
  return draft.moments.map((moment) => ({
    narration: moment.narration,
    written: moment.actions.flatMap((action) => action.action === "create" && (action.kind === "math" || action.kind === "note") ? [action.content] : [])
  }));
}
function lowerModelSectionDraft(value2, outline, expectedSection, requireFixedReusableCreates = false, language) {
  const root = pruneModelNulls(value2);
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanModelSection", "expected an object");
  }
  const candidate = root;
  const allowedRoot = /* @__PURE__ */ new Set([
    "version",
    "section",
    "moments",
    "course_visual_creates",
    "reusable_board_creates",
    "number_activities",
    "scene3d_activities",
    "reflection_activities",
    "answer_activities"
  ]);
  for (const key of Object.keys(candidate)) {
    if (!allowedRoot.has(key)) throw new LessonPlanError("LESSON_PLAN_UNKNOWN_FIELD", `$lessonPlanModelSection.${key}`, "unknown field");
  }
  if (candidate.section !== void 0 && candidate.section !== expectedSection) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanModelSection.section", `expected section ${expectedSection}`);
  }
  if (!Array.isArray(candidate.moments) || candidate.moments.length === 0) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanModelSection.moments", "expected at least one moment");
  }
  if (candidate.number_activities !== void 0 && !Array.isArray(candidate.number_activities)) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanModelSection.number_activities", "expected an array");
  }
  if (candidate.scene3d_activities !== void 0 && !Array.isArray(candidate.scene3d_activities)) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanModelSection.scene3d_activities", "expected an array");
  }
  if (candidate.reflection_activities !== void 0 && !Array.isArray(candidate.reflection_activities)) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanModelSection.reflection_activities", "expected an array");
  }
  if (candidate.answer_activities !== void 0 && !Array.isArray(candidate.answer_activities)) {
    throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", "$lessonPlanModelSection.answer_activities", "expected an array");
  }
  const courseVisuals = outline.course_visuals ?? [];
  const courseVisualsToCreate = courseVisuals.map((visual, index) => ({ visual, position: index + 1 })).filter(({ visual }) => visual.create_section === expectedSection);
  const reusableBoardItemsToCreate = (outline.sections[expectedSection - 1]?.reusable_items ?? []).map((item, index) => ({ item, position: index + 1 })).filter(({ item }) => item.kind === "board_item" && item.board_kind !== "visual");
  if (requireFixedReusableCreates && courseVisualsToCreate.length > 0 && candidate.course_visual_creates === void 0) {
    throw new LessonPlanError(
      "LESSON_PLAN_COURSE_VISUAL",
      "$lessonPlanModelSection.course_visual_creates",
      "the section must describe every outline-declared visual in the required course visual object"
    );
  }
  const fixedCourseCreates = /* @__PURE__ */ new Map();
  if (candidate.course_visual_creates !== void 0) {
    if (!candidate.course_visual_creates || typeof candidate.course_visual_creates !== "object" || Array.isArray(candidate.course_visual_creates)) {
      throw new LessonPlanError(
        "LESSON_PLAN_COURSE_VISUAL",
        "$lessonPlanModelSection.course_visual_creates",
        "expected an object containing every required course visual"
      );
    }
    const supplied = candidate.course_visual_creates;
    const expectedKeys = new Set(courseVisualsToCreate.map(({ position }) => `visual_${position}`));
    for (const key of Object.keys(supplied)) {
      if (!expectedKeys.has(key)) {
        throw new LessonPlanError(
          "LESSON_PLAN_COURSE_VISUAL",
          `$lessonPlanModelSection.course_visual_creates.${key}`,
          "course visual is not declared for this section"
        );
      }
    }
    for (const { visual, position } of courseVisualsToCreate) {
      const key = `visual_${position}`;
      const source = supplied[key];
      const entryPath = `$lessonPlanModelSection.course_visual_creates.${key}`;
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new LessonPlanError("LESSON_PLAN_COURSE_VISUAL", entryPath, "required course visual is missing");
      }
      let entry = { ...source };
      const moment = Number(entry.moment);
      if (!Number.isInteger(moment) || moment < 1 || moment > candidate.moments.length) {
        throw new LessonPlanError("LESSON_PLAN_COURSE_VISUAL", `${entryPath}.moment`, "visual moment is unavailable");
      }
      delete entry.moment;
      const rawContent = entry.content;
      if (!rawContent || typeof rawContent !== "object" || Array.isArray(rawContent)) {
        throw new LessonPlanError("LESSON_PLAN_COURSE_VISUAL", `${entryPath}.content`, "visual content is required");
      }
      entry.course_visual = position;
      entry.content = { capability: visual.capability, ...rawContent };
      entry = withProgramCreateDefaults(entry, "visual", visual.relation);
      const entries = fixedCourseCreates.get(moment) ?? [];
      entries.push(entry);
      fixedCourseCreates.set(moment, entries);
    }
  }
  if (requireFixedReusableCreates && reusableBoardItemsToCreate.length > 0 && candidate.reusable_board_creates === void 0) {
    throw new LessonPlanError(
      "LESSON_PLAN_REUSABLE",
      "$lessonPlanModelSection.reusable_board_creates",
      "the section must describe every outline-declared reusable board item in the required root object"
    );
  }
  const fixedReusableCreates = /* @__PURE__ */ new Map();
  if (candidate.reusable_board_creates !== void 0) {
    if (!candidate.reusable_board_creates || typeof candidate.reusable_board_creates !== "object" || Array.isArray(candidate.reusable_board_creates)) {
      throw new LessonPlanError(
        "LESSON_PLAN_REUSABLE",
        "$lessonPlanModelSection.reusable_board_creates",
        "expected an object containing every required reusable board item"
      );
    }
    const supplied = candidate.reusable_board_creates;
    const expectedKeys = new Set(reusableBoardItemsToCreate.map(({ position }) => `item_${position}`));
    for (const key of Object.keys(supplied)) {
      if (!expectedKeys.has(key)) {
        throw new LessonPlanError(
          "LESSON_PLAN_REUSABLE",
          `$lessonPlanModelSection.reusable_board_creates.${key}`,
          "reusable board item is not declared for this section"
        );
      }
    }
    for (const { item, position } of reusableBoardItemsToCreate) {
      const key = `item_${position}`;
      const source = supplied[key];
      const entryPath = `$lessonPlanModelSection.reusable_board_creates.${key}`;
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new LessonPlanError("LESSON_PLAN_REUSABLE", entryPath, "required reusable board item is missing");
      }
      let entry = { ...source };
      const moment = Number(entry.moment);
      if (!Number.isInteger(moment) || moment < 1 || moment > candidate.moments.length) {
        throw new LessonPlanError("LESSON_PLAN_REUSABLE", `${entryPath}.moment`, "reusable board item moment is unavailable");
      }
      delete entry.moment;
      entry.reusable_item = position;
      const collection = item.board_kind === "math" ? "math_creates" : item.board_kind === "note" ? "note_creates" : void 0;
      if (!collection) {
        throw new LessonPlanError(
          "LESSON_PLAN_REUSABLE",
          entryPath,
          `the staged model path cannot create a reusable ${String(item.board_kind)} board item`
        );
      }
      entry = withProgramCreateDefaults(entry, item.board_kind === "math" ? "math" : "note");
      const entries = fixedReusableCreates.get(moment) ?? { math_creates: [], note_creates: [] };
      entries[collection].push(entry);
      fixedReusableCreates.set(moment, entries);
    }
  }
  const createdCourseVisuals = /* @__PURE__ */ new Set();
  const momentKeys = /* @__PURE__ */ new Set(["narration", "delivery", "restart_numbers", ...Object.keys(modelActionCollections)]);
  const moments = candidate.moments.map((momentValue, momentIndex) => {
    const path = `$lessonPlanModelSection.moments[${momentIndex}]`;
    if (!momentValue || typeof momentValue !== "object" || Array.isArray(momentValue)) {
      throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", path, "expected an object");
    }
    const originalMoment = momentValue;
    if (candidate.course_visual_creates !== void 0 && Array.isArray(originalMoment.visual_creates) && originalMoment.visual_creates.length > 0) {
      throw new LessonPlanError(
        "LESSON_PLAN_COURSE_VISUAL",
        `${path}.visual_creates`,
        "course visuals are created by the required root object, not by moment arrays"
      );
    }
    if (requireFixedReusableCreates && Array.isArray(originalMoment.visual_creates) && originalMoment.visual_creates.length > 0) {
      throw new LessonPlanError(
        "LESSON_PLAN_COURSE_VISUAL",
        `${path}.visual_creates`,
        "formal section generation cannot create course visuals through optional moment arrays"
      );
    }
    const transientCreates = (collection) => (originalMoment[collection] ?? []).map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const transient = { ...entry };
      if (candidate.reusable_board_creates !== void 0) delete transient.reusable_item;
      return transient;
    });
    const moment = {
      ...originalMoment,
      ...candidate.course_visual_creates === void 0 ? {} : {
        visual_creates: fixedCourseCreates.get(momentIndex + 1) ?? []
      },
      ...candidate.reusable_board_creates === void 0 ? {} : {
        math_creates: [
          ...transientCreates("math_creates"),
          ...fixedReusableCreates.get(momentIndex + 1)?.math_creates ?? []
        ],
        note_creates: [
          ...transientCreates("note_creates"),
          ...fixedReusableCreates.get(momentIndex + 1)?.note_creates ?? []
        ]
      }
    };
    for (const key of Object.keys(moment)) {
      if (!momentKeys.has(key)) throw new LessonPlanError("LESSON_PLAN_UNKNOWN_FIELD", `${path}.${key}`, "unknown field");
    }
    const ordered = [];
    for (const [collectionName, descriptor] of Object.entries(modelActionCollections)) {
      const collection = moment[collectionName] ?? [];
      if (!Array.isArray(collection)) {
        throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", `${path}.${collectionName}`, "expected an array");
      }
      collection.forEach((entry, entryIndex) => {
        const entryPath = `${path}.${collectionName}[${entryIndex}]`;
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", entryPath, "expected an object");
        }
        let action = {
          ..."kind" in descriptor ? { kind: descriptor.kind } : {},
          ...entry
        };
        if (descriptor.action === "create" && "kind" in descriptor) {
          action = withProgramCreateDefaults(action, descriptor.kind);
        }
        const order = ordered.length + 1;
        if (collectionName === "visual_creates" && courseVisualsToCreate.length > 0) {
          const visualPosition = Number(action.course_visual);
          const declaration = courseVisuals[visualPosition - 1];
          if (!Number.isInteger(visualPosition) || !declaration || declaration.create_section !== expectedSection) {
            throw new LessonPlanError("LESSON_PLAN_COURSE_VISUAL", `${entryPath}.course_visual`, "visual position is not created by this section");
          }
          if (createdCourseVisuals.has(visualPosition)) {
            throw new LessonPlanError("LESSON_PLAN_COURSE_VISUAL", `${entryPath}.course_visual`, "course visual is created more than once");
          }
          const content = action.content;
          if (!content || content.capability !== declaration.capability) {
            throw new LessonPlanError("LESSON_PLAN_COURSE_VISUAL", `${entryPath}.content.capability`, "visual capability does not match its course position");
          }
          createdCourseVisuals.add(visualPosition);
          action.reusable_item = declaration.reusable_item;
          if (declaration.relation === "comparison") action.distinct_visual = true;
          delete action.course_visual;
        }
        ordered.push({
          order,
          action: {
            action: descriptor.action,
            ...lowerModelActionReferences(
              descriptor.action,
              action,
              momentIndex + 1,
              outline.numbers?.length ?? 0
            )
          }
        });
      });
    }
    ordered.sort((left, right) => left.order - right.order);
    if (ordered.length > 48) {
      throw new LessonPlanError("LESSON_PLAN_ACTIONS", `${path}.actions`, "expected at most 48 ordered actions");
    }
    return {
      narration: moment.narration,
      ...moment.restart_numbers !== void 0 ? { restart_numbers: moment.restart_numbers } : {},
      delivery: moment.delivery,
      actions: ordered.map((item) => item.action)
    };
  });
  for (const { position } of courseVisualsToCreate) {
    if (!createdCourseVisuals.has(position)) {
      throw new LessonPlanError(
        "LESSON_PLAN_COURSE_VISUAL",
        "$lessonPlanModelSection.moments",
        `course visual ${position} was not created`
      );
    }
  }
  const activities = [];
  const collectActivities = (values, kind, path) => {
    values.forEach((activity, index) => {
      const itemPath = `${path}[${index}]`;
      if (!activity || typeof activity !== "object" || Array.isArray(activity)) {
        throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", itemPath, "expected an object");
      }
      let lowered = { ...activity };
      const order = activities.length + 1;
      if (kind === "number_target" && lowered.reference !== void 0) {
        lowered.reference = lowerModelReference(lowered.reference, candidate.moments.length);
      }
      lowered = lowerModelActivityNumbers(lowered, kind, itemPath, outline, expectedSection, language);
      activities.push({ order, activity: { kind, ...lowered } });
    });
  };
  collectActivities(candidate.number_activities ?? [], "number_target", "$lessonPlanModelSection.number_activities");
  collectActivities(candidate.scene3d_activities ?? [], "scene3d_view", "$lessonPlanModelSection.scene3d_activities");
  let questionCard;
  let lastCard;
  moments.forEach((moment, momentOffset) => {
    let item = 0;
    for (const action of moment.actions ?? []) {
      if (action.action !== "create") continue;
      item += 1;
      lastCard = { source: "local_board_item", moment: momentOffset + 1, item };
      if (action.kind === "note" || action.kind === "math") questionCard = lastCard;
    }
  });
  (candidate.reflection_activities ?? []).forEach((value3, index) => {
    const itemPath = `$lessonPlanModelSection.reflection_activities[${index}]`;
    if (!value3 || typeof value3 !== "object" || Array.isArray(value3)) {
      throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", itemPath, "expected an object");
    }
    const { prompt, answer } = value3;
    if (!questionCard) return;
    activities.push({ order: activities.length + 1, activity: { kind: "reflection", prompt, answer, reference: structuredClone(questionCard) } });
  });
  (candidate.answer_activities ?? []).forEach((value3, index) => {
    const itemPath = `$lessonPlanModelSection.answer_activities[${index}]`;
    if (!value3 || typeof value3 !== "object" || Array.isArray(value3)) {
      throw new LessonPlanError("LESSON_PLAN_SECTION_DRAFTS", itemPath, "expected an object");
    }
    const card = questionCard ?? lastCard;
    if (!card) return;
    activities.push({ order: activities.length + 1, activity: lowerAnswerActivity(value3, card) });
  });
  activities.sort((left, right) => left.order - right.order);
  let latestBoardReference;
  let latestVisualReference;
  let latestVisualCapability;
  for (let section = expectedSection - 1; section >= 1 && !latestBoardReference; section -= 1) {
    const reusableItems = outline.sections[section - 1]?.reusable_items ?? [];
    for (let item = reusableItems.length; item >= 1; item -= 1) {
      if (reusableItems[item - 1]?.kind === "board_item") {
        latestBoardReference = { source: "reusable", section, item };
        if (reusableItems[item - 1]?.board_kind === "visual") {
          latestVisualReference = structuredClone(latestBoardReference);
          latestVisualCapability = reusableItems[item - 1]?.capability;
        }
        break;
      }
    }
  }
  const localCounts = [];
  const localCapabilities = /* @__PURE__ */ new Map();
  const currentReusableTargets = /* @__PURE__ */ new Map();
  const activeVisualReferences = () => courseVisuals.flatMap((visual) => {
    if (!visual.use_sections.includes(expectedSection)) return [];
    if (visual.create_section < expectedSection) {
      return [{
        source: "reusable",
        section: visual.create_section,
        item: visual.reusable_item
      }];
    }
    const current = currentReusableTargets.get(visual.reusable_item)?.reference;
    return current ? [structuredClone(current)] : [];
  });
  moments.forEach((moment, momentIndex) => {
    const currentCounts = { local_board_item: 0, local_connection: 0, local_group: 0 };
    const existingLocal = (value3) => {
      if (!value3 || typeof value3 !== "object" || Array.isArray(value3)) return false;
      const reference = value3;
      if (!["local_board_item", "local_connection", "local_group"].includes(String(reference.source))) return true;
      const referencedMoment = Number(reference.moment);
      const item = Number(reference.item);
      const counts = referencedMoment === momentIndex + 1 ? currentCounts : localCounts[referencedMoment - 1];
      return Number.isInteger(referencedMoment) && referencedMoment > 0 && Number.isInteger(item) && item > 0 && counts !== void 0 && item <= counts[reference.source];
    };
    const presentationReference = (value3, preferVisual = false) => {
      const original = value3 && typeof value3 === "object" && !Array.isArray(value3) ? value3 : void 0;
      let reference = original ? { ...original } : void 0;
      let capability2;
      if (reference?.source === "reusable" && reference.section === expectedSection) {
        const mapped = currentReusableTargets.get(Number(reference.item));
        reference = mapped ? structuredClone(mapped.reference) : void 0;
        capability2 = mapped?.capability;
      } else if (reference?.source === "reusable") {
        const section = Number(reference.section);
        const item = Number(reference.item);
        const declaration = outline.sections[section - 1]?.reusable_items?.[item - 1];
        if (!declaration || section >= expectedSection) reference = void 0;
        else capability2 = declaration.capability;
      } else if (reference && ["local_board_item", "local_connection", "local_group"].includes(String(reference.source))) {
        if (!existingLocal(reference)) reference = void 0;
        else if (reference.source === "local_board_item") {
          capability2 = localCapabilities.get(`${reference.moment}:${reference.item}`);
        }
      }
      const part = original?.part;
      const needsVisual = preferVisual || part && typeof part === "object" && !Array.isArray(part) && part.kind === "capability";
      if (!reference) {
        const fallback = needsVisual ? latestVisualReference : latestBoardReference;
        if (!fallback) return void 0;
        reference = structuredClone(fallback);
        capability2 = needsVisual ? latestVisualCapability : void 0;
      }
      if (needsVisual) {
        const role = part && typeof part === "object" && !Array.isArray(part) ? part.role : void 0;
        if (capability2 && typeof role === "string" && LESSON_PLAN_CAPABILITIES[capability2].includes(role)) {
          reference.part = part;
        } else {
          delete reference.part;
        }
      } else if (part !== void 0) {
        reference.part = part;
      }
      return reference;
    };
    const normalizedActions = [];
    const timingOrder = { before_speech: 0, during_speech: 1, after_speech: 2 };
    const timingName = ["before_speech", "during_speech", "after_speech"];
    const currentReferenceTimings = /* @__PURE__ */ new Map();
    const actionTimingRank = (value3) => typeof value3 === "string" && value3 in timingOrder ? timingOrder[value3] : 0;
    const referenceTimingRank = (value3) => {
      if (!value3 || typeof value3 !== "object" || Array.isArray(value3)) return 0;
      const reference = value3;
      if (reference.moment !== momentIndex + 1 || !["local_board_item", "local_connection", "local_group"].includes(String(reference.source))) {
        return 0;
      }
      return currentReferenceTimings.get(`${reference.source}:${reference.item}`) ?? 0;
    };
    const ensureActionAfterReferences = (action, references) => {
      const requiredRank = Math.max(0, ...references.map(referenceTimingRank));
      if (actionTimingRank(action.timing) < requiredRank) {
        action.timing = timingName[requiredRank];
      }
    };
    moment.actions.forEach((action) => {
      if (action.action === "create") {
        const placement = action.placement && typeof action.placement === "object" && !Array.isArray(action.placement) ? { ...action.placement } : { relation: "new_region" };
        delete placement.reference;
        if (placement.relation !== "new_region" && latestBoardReference) {
          placement.reference = structuredClone(latestBoardReference);
          if (latestBoardReference.source === "local_board_item" && latestBoardReference.moment === momentIndex + 1) {
            const previousAction = normalizedActions.findLast((candidate2) => candidate2.action === "create");
            const previousRank = previousAction?.timing && previousAction.timing in timingOrder ? timingOrder[previousAction.timing] : 0;
            const currentRank = action.timing && action.timing in timingOrder ? timingOrder[action.timing] : 0;
            if (currentRank < previousRank) action.timing = timingName[previousRank];
          }
        } else if (placement.relation !== "new_region") {
          placement.relation = "new_region";
        }
        action.placement = placement;
        currentCounts.local_board_item += 1;
        latestBoardReference = {
          source: "local_board_item",
          moment: momentIndex + 1,
          item: currentCounts.local_board_item
        };
        currentReferenceTimings.set(
          `local_board_item:${currentCounts.local_board_item}`,
          actionTimingRank(action.timing)
        );
        const capability2 = action.kind === "visual" && action.content && typeof action.content === "object" && !Array.isArray(action.content) && typeof action.content.capability === "string" && action.content.capability in LESSON_PLAN_CAPABILITIES ? action.content.capability : void 0;
        localCapabilities.set(`${momentIndex + 1}:${currentCounts.local_board_item}`, capability2);
        if (Number.isInteger(action.reusable_item) && Number(action.reusable_item) > 0) {
          currentReusableTargets.set(Number(action.reusable_item), {
            reference: structuredClone(latestBoardReference),
            ...capability2 ? { capability: capability2 } : {}
          });
        }
        if (capability2) {
          latestVisualReference = structuredClone(latestBoardReference);
          latestVisualCapability = capability2;
        }
      } else if (action.action === "emphasize" || action.action === "point_at") {
        const reference = presentationReference(action.reference, action.action === "point_at");
        if (reference === void 0) return;
        action.reference = reference;
        ensureActionAfterReferences(action, [reference]);
      } else if (action.action === "focus") {
        const supplied = Array.isArray(action.references) ? action.references.map((reference) => presentationReference(reference)).filter((reference) => reference !== void 0) : [];
        const references = supplied.length > 0 ? supplied : activeVisualReferences().length > 0 ? activeVisualReferences() : [latestVisualReference ?? latestBoardReference].filter((reference) => reference !== void 0);
        const unique = [...new Map(references.map((reference) => [JSON.stringify(reference), reference])).values()];
        if (unique.length === 0) return;
        action.references = unique;
        ensureActionAfterReferences(action, unique);
      }
      normalizedActions.push(action);
      if (action.action === "connect") {
        currentCounts.local_connection += 1;
        currentReferenceTimings.set(
          `local_connection:${currentCounts.local_connection}`,
          actionTimingRank(action.timing)
        );
      }
      if (action.action === "group") {
        currentCounts.local_group += 1;
        currentReferenceTimings.set(
          `local_group:${currentCounts.local_group}`,
          actionTimingRank(action.timing)
        );
      }
    });
    moment.actions = normalizedActions;
    if (moment.actions.length === 0 && latestBoardReference) {
      moment.actions.push({
        action: "focus",
        references: [structuredClone(latestBoardReference)],
        intent: lessonText(language, "\u7EE7\u7EED\u89C2\u5BDF\u5F53\u524D\u753B\u9762"),
        timing: "after_speech"
      });
    }
    localCounts.push(currentCounts);
  });
  const sceneCapabilities = new Set(LESSON_PLAN_CAPABILITY_NAMES.filter((capability2) => LESSON_PLAN_CAPABILITY_REGISTRY[capability2].output_kinds.includes("scene3d")));
  let sceneReference;
  for (const [item, target] of [...currentReusableTargets.entries()].reverse()) {
    if (target.capability && sceneCapabilities.has(target.capability)) {
      void item;
      sceneReference = structuredClone(target.reference);
      break;
    }
  }
  if (!sceneReference) {
    for (const [key, capability2] of [...localCapabilities.entries()].reverse()) {
      if (!capability2 || !sceneCapabilities.has(capability2)) continue;
      const [moment, item] = key.split(":").map(Number);
      sceneReference = { source: "local_board_item", moment, item };
      break;
    }
  }
  if (!sceneReference) {
    for (let section = expectedSection - 1; section >= 1 && !sceneReference; section -= 1) {
      const reusableItems = outline.sections[section - 1]?.reusable_items ?? [];
      for (let item = reusableItems.length; item >= 1; item -= 1) {
        const declaration = reusableItems[item - 1];
        if (declaration.capability && sceneCapabilities.has(declaration.capability)) {
          sceneReference = { source: "reusable", section, item };
          break;
        }
      }
    }
  }
  for (const item of activities) {
    if (item.activity.kind !== "scene3d_view") continue;
    if (!sceneReference) {
      throw new LessonPlanError(
        "LESSON_PLAN_ACTIVITY",
        "$lessonPlanModelSection.scene3d_activities",
        "a 3D view activity requires an existing 3D visual"
      );
    }
    item.activity.reference = structuredClone(sceneReference);
  }
  return {
    version: outline.version,
    section: expectedSection,
    moments,
    student_activities: activities.map((item) => item.activity)
  };
}
function inputContext(input) {
  if (!input.turn_id.trim()) throw new Error("turn_id is required");
  if (!input.learner_request.trim()) throw new Error("learner_request is required");
  return {
    learner_request: input.learner_request,
    input_modality: input.input_modality ?? null,
    language: input.language ?? "zh-CN",
    learner_context: input.learner_context ?? null,
    tutor_context: input.tutor_context ?? null,
    teacher_profile: input.teacher_profile?.trim() ? input.teacher_profile : null,
    learner_background: input.learner_background?.trim() ? input.learner_background : null,
    current_lesson: input.current_lesson?.trim() ? input.current_lesson : null,
    teacher_experiences: input.teacher_experiences?.trim() ? input.teacher_experiences : null
  };
}
function compactModelContext(context) {
  return Object.fromEntries(
    Object.entries(context).filter(([key, value2]) => key !== "input_modality" && value2 !== null && value2 !== void 0)
  );
}
var requestSentenceBoundary = /(?:\r?\n+|[。！？!?；;]+)/u;
var requestSequenceBoundary = /[，,]\s*(?=(?:再(?:请|用|展示|说明|解释|让|给|比较|演示|带|分析|推导|证明)|然后|接着|最后|随后|同时|并且|并请|并让|还要|另外|此外))/u;
function cleanRequestPart(value2) {
  return value2.replace(/\s+/gu, " ").trim();
}
function deriveLessonRequestParts(learnerRequest) {
  const source = cleanRequestPart(learnerRequest);
  if (!source) throw new Error("learner_request is required");
  const parts = source.split(requestSentenceBoundary).flatMap((sentence) => sentence.split(requestSequenceBoundary)).map(cleanRequestPart).filter(Boolean);
  if (parts.length <= 64) return parts;
  return [...parts.slice(0, 63), parts.slice(63).join("\uFF1B")];
}
function requestParts(input) {
  const parts = input.request_parts ?? deriveLessonRequestParts(input.learner_request);
  if (parts.length === 0 || parts.length > 64) throw new Error("request_parts must contain 1 to 64 items");
  return parts.map((part, index) => {
    if (typeof part !== "string" || !part.trim()) throw new Error(`request_parts[${index}] must be non-empty`);
    return part;
  });
}
function executableNumberIndexesForSection(outline, drafts, sectionNumber) {
  const all = (outline.numbers ?? []).map((_number, index) => index + 1);
  const courseVisuals = outline.course_visuals ?? [];
  if (courseVisuals.some((visual) => visual.create_section === sectionNumber)) return all;
  const indexes = /* @__PURE__ */ new Set();
  for (const visual of courseVisuals) {
    if (visual.create_section >= sectionNumber) continue;
    const source = drafts[visual.create_section - 1];
    for (const moment of source?.moments ?? []) {
      for (const action of moment.actions) {
        if (action.action !== "create" || action.kind !== "visual") continue;
        if (action.content.capability !== visual.capability || action.reusable_item !== visual.reusable_item) continue;
        for (const number of action.content.numbers ?? []) indexes.add(number);
      }
    }
  }
  return [...indexes].sort((left, right) => left - right);
}
function sectionPromptContext(outline, sectionNumber, allowedNumberIndexes, currentNumbers) {
  const section = outline.sections[sectionNumber - 1];
  const allowedNumbers = new Set(allowedNumberIndexes);
  return {
    title: outline.title,
    goals: outline.goals,
    ...outline.numbers?.length ? {
      numbers: outline.numbers.map((number, index) => ({
        number: index + 1,
        label: number.label,
        initial: number.initial,
        current_value: currentNumbers.get(index + 1) ?? number.initial,
        min: number.min,
        max: number.max,
        ...number.unit === void 0 ? {} : { unit: number.unit }
      })).filter(({ number }) => allowedNumbers.has(number))
    } : {},
    section: {
      section: sectionNumber,
      purpose: section?.purpose,
      reusable_items: (section?.reusable_items ?? []).map((item, index) => ({
        item: index + 1,
        ...item
      }))
    },
    previous_sections: outline.sections.slice(0, sectionNumber - 1).map((previous, index) => ({
      section: index + 1,
      purpose: previous.purpose,
      reusable_items: (previous.reusable_items ?? []).map((item, itemIndex) => ({
        item: itemIndex + 1,
        ...item
      }))
    }))
  };
}
function unsupportedSectionResponse(error, previousError, language) {
  if (!(error instanceof LessonPlanError)) return void 0;
  if (error.code === "LESSON_PLAN_UNSUPPORTED_REQUIREMENT") {
    return lessonText(language, "\u76EE\u524D\u8FD8\u4E0D\u80FD\u5B8C\u6574\u751F\u6210\u8FD9\u8282\u8BFE\uFF0C\u56E0\u4E3A\u5176\u4E2D\u5305\u542B\u5C1A\u672A\u652F\u6301\u7684\u753B\u9762\u6216\u4E92\u52A8\u3002");
  }
  if (error.code === "LESSON_PLAN_EXPRESSION" && /multi-curve comparison currently supports static formulas only/u.test(error.message) && previousError instanceof LessonPlanError && previousError.code === error.code && previousError.message === error.message) {
    return lessonText(language, "\u76EE\u524D\u8FD8\u4E0D\u80FD\u5728\u540C\u4E00\u5F20\u51FD\u6570\u56FE\u4E2D\u540C\u65F6\u5C55\u793A\u9759\u6001\u66F2\u7EBF\u548C\u7531\u63A7\u4EF6\u6539\u53D8\u7684\u53E6\u4E00\u6761\u66F2\u7EBF\u3002");
  }
  return void 0;
}
function sectionIndexFromError(error, sectionCount) {
  if (!(error instanceof LessonPlanError)) return void 0;
  const draftMatch = error.path.match(/\$lessonPlanSectionDrafts\[(\d+)\]/u);
  const planMatch = error.path.match(/\$lessonPlan\.sections\[(\d+)\]/u);
  const offset = Number(draftMatch?.[1] ?? planMatch?.[1]);
  return Number.isInteger(offset) && offset >= 0 && offset < sectionCount ? offset + 1 : void 0;
}
function compilePrefix(outline, drafts, options) {
  const sectionCount = drafts.length;
  let focus;
  for (let section = sectionCount; section >= 1 && !focus; section -= 1) {
    const createdItems = drafts[section - 1]?.moments.flatMap((moment) => moment.actions).flatMap((action) => action.action === "create" && Number.isInteger(action.reusable_item) ? [Number(action.reusable_item)] : []) ?? [];
    const item = createdItems.length > 0 ? Math.max(...createdItems) : void 0;
    if (item !== void 0) focus = { source: "reusable", section, item };
  }
  if (!focus) {
    throw new LessonPlanError(
      "LESSON_PLAN_PROGRESSIVE_FOCUS",
      "$lessonPlanOutline.sections[0].reusable_items",
      "the first playable prefix requires at least one declared reusable item"
    );
  }
  const prefixOutlineBase = structuredClone(outline);
  delete prefixOutlineBase.request_coverage;
  delete prefixOutlineBase.course_visuals;
  const prefixOutline = {
    ...prefixOutlineBase,
    sections: structuredClone(outline.sections.slice(0, sectionCount)),
    close: { summary: lessonText(options?.language, "\u8BFE\u7A0B\u5185\u5BB9\u4ECD\u5728\u7EE7\u7EED\u751F\u6210\u3002"), focus: [focus] }
  };
  const normalized = normalizeExecutableNumberInteractions(prefixOutline, drafts);
  const prefixPlan = assembleLessonPlan(normalized.outline, normalized.drafts, options);
  return compileAndValidateLessonPlan(prefixPlan, { ...options, construction_rules: "explicit-v1" });
}
function canFallBackFromBootstrap(error) {
  if (error instanceof LessonPlanError) return true;
  const code = error && typeof error === "object" && "code" in error ? String(error.code ?? "") : "";
  return /(?:RESPONSE_TRUNCATED|RESPONSE_EMPTY)$/u.test(code);
}
function partialModelResponse(error) {
  if (!error || typeof error !== "object" || !("partialResponse" in error)) return void 0;
  const value2 = error.partialResponse;
  return typeof value2 === "string" && value2.trim() ? value2 : void 0;
}
function locallyUnsupportedLessonRequest(request, language) {
  const asksForFourDimensions = /(?:四|4)\s*维|(?:four|4)[ -]?dimensional|\b4d\b/i.test(request);
  const asksForHypercube = /超立方体|正八胞体|tesseract|hypercube/i.test(request);
  const asksForRotation = /旋转|转动|rotation|rotate/i.test(request);
  if (asksForFourDimensions && asksForHypercube && asksForRotation) {
    return lessonText(language, "\u5F53\u524D\u767D\u677F\u53EA\u80FD\u6267\u884C\u4E8C\u7EF4\u56FE\u5F62\u548C\u4E09\u7EF4\u573A\u666F\uFF0C\u4E0D\u80FD\u7CBE\u786E\u6A21\u62DF\u56DB\u7EF4\u8D85\u7ACB\u65B9\u4F53\u7684\u56DB\u7EF4\u65CB\u8F6C\u3002\u4F60\u53EF\u4EE5\u6539\u95EE\u5B83\u7684\u4E09\u7EF4\u6295\u5F71\u539F\u7406\u6216\u57FA\u672C\u7ED3\u6784\u3002");
  }
  return void 0;
}
async function generateLessonPlanWithModel(model, input, options = {}) {
  options = { ...options, compile: { ...options.compile, language: input.language ?? options.compile?.language } };
  const unsupportedResponse = locallyUnsupportedLessonRequest(input.learner_request, input.language);
  if (unsupportedResponse) {
    return {
      disposition: "unsupported",
      learner_response: unsupportedResponse,
      model_calls: 0
    };
  }
  const maxAttempts = positiveInteger(options.max_attempts_per_part, 3, "max_attempts_per_part");
  let context = inputContext(input);
  const fixedRequestParts = requestParts(input);
  const admissionInput = input.input_modality === "voice" || input.input_modality === "text";
  let modelCalls = 0;
  let outline;
  const draftAdjustments = /* @__PURE__ */ new WeakMap();
  const specializeDraft = (draft, outline2, accepted) => {
    const adjustments = [];
    for (const hooks of PLUGIN_HOOKS) hooks.specialize_draft?.(draft, {
      outline: outline2,
      accepted,
      request: input.learner_request,
      adjust: (adjustment) => adjustments.push(adjustment)
    });
    if (adjustments.length) draftAdjustments.set(draft, adjustments);
    return draft;
  };
  const reportDraftAdjustments = async (draft) => {
    for (const adjustment of draftAdjustments.get(draft) ?? []) await options.on_program_adjustment?.(adjustment);
    draftAdjustments.delete(draft);
  };
  let bootstrappedFirstSection;
  let outlineError;
  let stableCameraObservation;
  const sectionErrors = /* @__PURE__ */ new Map();
  const sectionAttempts = /* @__PURE__ */ new Map();
  const admissionCourse = (parsed, observeCamera) => {
    if (!admissionInput) return { course: parsed };
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new LessonPlanError(
        "LESSON_PLAN_MODEL_JSON",
        "$lessonPlanEnvelope",
        "lesson response envelope must be an object"
      );
    }
    const envelope = parsed;
    if (observeCamera) {
      stableCameraObservation = cameraObservation(envelope.image_observation);
      context = { ...context, camera_observation: stableCameraObservation };
    }
    const disposition = envelope.disposition;
    if (disposition !== "generate_lesson" && disposition !== "clarify" && disposition !== "ignore") {
      throw new LessonPlanError(
        "LESSON_PLAN_MODEL_JSON",
        "$lessonPlanAdmission.disposition",
        "lesson admission must choose generate_lesson, clarify, or ignore"
      );
    }
    if (disposition !== "generate_lesson") {
      if (!Object.hasOwn(envelope, "course") || envelope.course !== null) {
        throw new LessonPlanError(
          "LESSON_PLAN_MODEL_JSON",
          "$lessonPlanAdmission.course",
          "clarify and ignore require course to be null"
        );
      }
      const learnerResponse = typeof envelope.learner_response === "string" ? envelope.learner_response.trim() : "";
      if (disposition === "clarify" && !learnerResponse) {
        throw new LessonPlanError(
          "LESSON_PLAN_MODEL_JSON",
          "$lessonPlanAdmission.learner_response",
          "clarify requires a learner-facing question"
        );
      }
      return {
        result: {
          disposition,
          learner_response: learnerResponse,
          model_calls: modelCalls
        }
      };
    }
    if (!envelope.course || typeof envelope.course !== "object" || Array.isArray(envelope.course)) {
      throw new LessonPlanError(
        "LESSON_PLAN_MODEL_JSON",
        "$lessonPlanAdmission.course",
        "generate_lesson requires a course object"
      );
    }
    return { course: envelope.course };
  };
  try {
    const observeCamera = (input.camera_input === true || input.selection_input === true) && stableCameraObservation === void 0;
    modelCalls += 1;
    const raw = await model({
      label: "lesson-plan-bootstrap",
      part: "bootstrap",
      attempt: 1,
      turn_id: input.turn_id,
      system_prompt: withContextRules(observeCamera ? input.selection_input === true ? SELECTION_ADMISSION_BOOTSTRAP_SYSTEM_PROMPT : CAMERA_ADMISSION_BOOTSTRAP_SYSTEM_PROMPT : admissionInput ? ADMISSION_BOOTSTRAP_SYSTEM_PROMPT : BOOTSTRAP_SYSTEM_PROMPT, context),
      prompt: JSON.stringify({
        course_context: compactModelContext(context),
        request_parts: fixedRequestParts,
        visual_recipe_columns: ["features", "numbers", "purpose"],
        visual_recipes: LESSON_PLAN_CAPABILITY_NAMES.map((capability2) => [
          [...LESSON_PLAN_CAPABILITY_REGISTRY[capability2].required_features],
          [...LESSON_PLAN_CAPABILITY_REGISTRY[capability2].number_inputs],
          LESSON_PLAN_CAPABILITY_REGISTRY[capability2].model_guidance
        ]),
        first_section_to_write: 1,
        first_section_rule: "first_section must implement outline.sections[0]; outline is authoritative and the program assigns all execution references"
      }),
      response_schema: observeCamera ? buildCameraLessonPlanAdmissionBootstrapJsonSchema(fixedRequestParts.length) : admissionInput ? buildLessonPlanAdmissionBootstrapJsonSchema(fixedRequestParts.length) : buildLessonPlanBootstrapJsonSchema(fixedRequestParts.length),
      ...observeCamera ? { include_camera_media: true } : {}
    });
    const parsed = parseModelJson(raw, admissionInput ? "lessonPlanEnvelope" : "lessonPlanBootstrap");
    const admitted = admissionCourse(parsed, observeCamera);
    if (admitted.result) return admitted.result;
    const course = pruneModelNulls(admitted.course);
    if (!course || typeof course !== "object" || Array.isArray(course)) {
      throw new LessonPlanError("LESSON_PLAN_MODEL_JSON", "$lessonPlanBootstrap.course", "expected outline and first_section");
    }
    const bootstrap = course;
    outline = validateLessonPlanOutline(
      lowerModelOutline(
        coerceLessonPlanOutlineModelNumbers(bootstrap.outline, fixedRequestParts.length),
        fixedRequestParts.length
      ),
      fixedRequestParts.length
    );
    for (const hooks of PLUGIN_HOOKS) hooks.prepare_outline?.(outline, { request: input.learner_request, language: input.language });
    try {
      const firstSection = lowerModelSectionDraft(
        reconcileBootstrapFirstSectionPositions(
          coerceLessonPlanBootstrapSectionModelNumbers(bootstrap.first_section),
          outline
        ),
        outline,
        1,
        true,
        input.language
      );
      bootstrappedFirstSection = specializeDraft(firstSection, outline, []);
    } catch (error) {
      sectionErrors.set(1, error);
      await options.on_rejected_part?.({
        label: "lesson-plan-section",
        section: 1,
        attempt: 1,
        error: rejectionDetails(error)
      });
    }
  } catch (error) {
    const partialResponse = partialModelResponse(error);
    if (partialResponse) {
      if ((input.camera_input === true || input.selection_input === true) && stableCameraObservation === void 0) {
        const partialObservation = completedJsonObjectProperty(partialResponse, "image_observation");
        if (partialObservation !== void 0) {
          try {
            stableCameraObservation = cameraObservation(partialObservation);
            context = { ...context, camera_observation: stableCameraObservation };
          } catch (observationError) {
            outlineError = observationError;
          }
        }
      }
      const partialOutline = completedJsonObjectProperty(partialResponse, "outline");
      if (partialOutline !== void 0) {
        try {
          outline = validateLessonPlanOutline(
            lowerModelOutline(
              coerceLessonPlanOutlineModelNumbers(partialOutline, fixedRequestParts.length),
              fixedRequestParts.length
            ),
            fixedRequestParts.length
          );
          sectionErrors.set(1, error);
        } catch (outlineValidationError) {
          outline = void 0;
          outlineError = outlineValidationError;
        }
      }
    }
    if (!outline && !canFallBackFromBootstrap(error) && !partialResponse) throw error;
    if ((input.camera_input === true || input.selection_input === true) && stableCameraObservation === void 0) {
      return {
        disposition: "clarify",
        learner_response: input.selection_input === true ? lessonText(input.language, "\u6211\u6CA1\u80FD\u7A33\u5B9A\u8BFB\u6E05\u8FD9\u6B21\u624B\u5199\u9009\u533A\uFF0C\u8BF7\u91CD\u65B0\u6846\u9009\uFF0C\u6216\u8005\u628A\u516C\u5F0F\u5199\u5927\u4E00\u4E9B\u518D\u8BD5\u4E00\u6B21\u3002") : lessonText(input.language, "\u6211\u6CA1\u80FD\u7A33\u5B9A\u8BFB\u53D6\u8FD9\u6B21\u6444\u50CF\u5934\u753B\u9762\uFF0C\u8BF7\u628A\u9898\u76EE\u6216\u7269\u4F53\u653E\u5230\u753B\u9762\u4E2D\u592E\u540E\u518D\u8BD5\u4E00\u6B21\u3002"),
        model_calls: modelCalls
      };
    }
    outlineError ??= error;
    await options.on_rejected_part?.({
      label: "lesson-plan-bootstrap",
      attempt: 1,
      error: rejectionDetails(error)
    });
  }
  for (let attempt = 1; !outline && attempt <= maxAttempts; attempt += 1) {
    const observeCamera = (input.camera_input === true || input.selection_input === true) && stableCameraObservation === void 0;
    try {
      modelCalls += 1;
      const raw = await model({
        label: "lesson-plan-outline",
        part: "outline",
        attempt,
        turn_id: input.turn_id,
        system_prompt: withContextRules(observeCamera ? input.selection_input === true ? SELECTION_ADMISSION_OUTLINE_SYSTEM_PROMPT : CAMERA_ADMISSION_OUTLINE_SYSTEM_PROMPT : admissionInput ? ADMISSION_OUTLINE_SYSTEM_PROMPT : OUTLINE_SYSTEM_PROMPT, context),
        prompt: JSON.stringify({
          course_context: compactModelContext(stableCameraObservation ? { ...context, camera_observation: stableCameraObservation } : context),
          request_parts: fixedRequestParts,
          visual_recipe_columns: ["features", "numbers", "purpose"],
          visual_recipes: LESSON_PLAN_CAPABILITY_NAMES.map((capability2) => [
            [...LESSON_PLAN_CAPABILITY_REGISTRY[capability2].required_features],
            [...LESSON_PLAN_CAPABILITY_REGISTRY[capability2].number_inputs],
            LESSON_PLAN_CAPABILITY_REGISTRY[capability2].model_guidance
          ]),
          ...outlineError ? { previous_validation_error: errorFeedback(outlineError) } : {}
        }),
        response_schema: observeCamera ? buildCameraLessonPlanAdmissionOutlineJsonSchema(fixedRequestParts.length) : admissionInput ? buildLessonPlanAdmissionOutlineJsonSchema(fixedRequestParts.length) : buildLessonPlanOutlineJsonSchema(fixedRequestParts.length),
        ...observeCamera ? { include_camera_media: true } : {}
      });
      const parsed = parseModelJson(raw, admissionInput ? "lessonPlanEnvelope" : "lessonPlanOutline");
      const admitted = admissionCourse(parsed, observeCamera);
      if (admitted.result) return admitted.result;
      outline = validateLessonPlanOutline(
        lowerModelOutline(
          coerceLessonPlanOutlineModelNumbers(admitted.course, fixedRequestParts.length),
          fixedRequestParts.length
        ),
        fixedRequestParts.length
      );
    } catch (error) {
      if (!(error instanceof LessonPlanError)) throw error;
      outlineError = error;
      await options.on_rejected_part?.({
        label: "lesson-plan-outline",
        attempt,
        error: rejectionDetails(error)
      });
      if (observeCamera && stableCameraObservation === void 0) {
        return {
          disposition: "clarify",
          learner_response: input.selection_input === true ? lessonText(input.language, "\u6211\u6CA1\u80FD\u7A33\u5B9A\u8BFB\u6E05\u8FD9\u6B21\u624B\u5199\u9009\u533A\uFF0C\u8BF7\u91CD\u65B0\u6846\u9009\uFF0C\u6216\u8005\u628A\u516C\u5F0F\u5199\u5927\u4E00\u4E9B\u518D\u8BD5\u4E00\u6B21\u3002") : lessonText(input.language, "\u6211\u6CA1\u80FD\u7A33\u5B9A\u8BFB\u53D6\u8FD9\u6B21\u6444\u50CF\u5934\u753B\u9762\uFF0C\u8BF7\u628A\u9898\u76EE\u6216\u7269\u4F53\u653E\u5230\u753B\u9762\u4E2D\u592E\u540E\u518D\u8BD5\u4E00\u6B21\u3002"),
          model_calls: modelCalls
        };
      }
    }
  }
  if (!outline) throw outlineError;
  for (const hooks of PLUGIN_HOOKS) hooks.prepare_outline?.(outline, { request: input.learner_request, language: input.language });
  await options.on_outline_ready?.({
    sections: outline.sections.length,
    course_visuals: outline.course_visuals?.length ?? 0,
    request_parts: fixedRequestParts.length,
    camera_observation: stableCameraObservation !== void 0
  });
  const unsupported = outline.request_coverage?.find((item) => item.treatment === "unsupported");
  if (unsupported) {
    const reason = unsupported.reason?.trim();
    const learnerResponse = reason && reason.length <= 480 && !/\$lesson|LESSON_PLAN_|already exhausted|do not call|internal attempts/iu.test(reason) ? lessonText(input.language, "\u76EE\u524D\u8FD8\u4E0D\u80FD\u5B8C\u6574\u751F\u6210\u8FD9\u8282\u8BFE\uFF1A{{v0}}", { v0: reason }) : lessonText(input.language, "\u76EE\u524D\u8FD8\u4E0D\u80FD\u5B8C\u6574\u751F\u6210\u8FD9\u8282\u8BFE\uFF0C\u56E0\u4E3A\u5176\u4E2D\u5305\u542B\u5C1A\u672A\u652F\u6301\u7684\u753B\u9762\u6216\u4E92\u52A8\u3002");
    return {
      disposition: "unsupported",
      learner_response: learnerResponse,
      model_calls: modelCalls
    };
  }
  const currentNumbersBefore = (section) => {
    const state = new Map((outline.numbers ?? []).map((number, index) => [index + 1, number.initial]));
    for (const draft of drafts.slice(0, section - 1)) for (const moment of draft.moments) {
      for (const number of moment.restart_numbers ?? []) state.set(number, outline.numbers[number - 1].initial);
      for (const action of moment.actions) if (action.action === "animate") state.set(action.number, action.end_value);
    }
    return state;
  };
  const visualsForSection = (section, state) => (outline.course_visuals ?? []).flatMap((visual, index) => {
    if (!visual.use_sections.includes(section)) return [];
    const source = visual.create_section < section ? drafts[visual.create_section - 1]?.moments.flatMap((m) => m.actions).find((a) => a.action === "create" && a.kind === "visual" && a.reusable_item === visual.reusable_item && a.content.capability === visual.capability) : void 0;
    const established = source?.action === "create" && source.kind === "visual" ? source.content : void 0;
    const mode = visual.create_section === section ? "create" : "reuse";
    const { lead = {}, facts = {} } = SECTION_FACTS[visual.capability]?.({
      section,
      mode,
      established,
      numbers: outline.numbers,
      state
    }) ?? {};
    return [{
      ...lead,
      course_visual: index + 1,
      capability: visual.capability,
      mode,
      relation: visual.relation,
      ...facts,
      ...visual.related_visual === void 0 ? {} : { related_visual: visual.related_visual }
    }];
  });
  const assignedRequestParts = (section) => (outline.request_coverage ?? []).filter((item) => item.treatment === "teach" && item.sections.includes(section)).map((item) => ({
    request_part: item.request_part,
    text: fixedRequestParts[item.request_part - 1]
  }));
  const laterSectionContext = { ...context, current_lesson: null, teacher_experiences: null };
  const generateSection = async (section) => {
    const attempt = (sectionAttempts.get(section) ?? 0) + 1;
    sectionAttempts.set(section, attempt);
    if (attempt > maxAttempts) throw sectionErrors.get(section);
    let raw;
    const allowedNumberIndexes = executableNumberIndexesForSection(outline, drafts, section);
    const currentNumbers = currentNumbersBefore(section);
    try {
      raw = await model({
        label: "lesson-plan-section",
        part: "section",
        section,
        attempt,
        turn_id: input.turn_id,
        system_prompt: section === 1 || typeof context.teacher_experiences !== "string" ? withContextRules(SECTION_SYSTEM_PROMPT, section === 1 ? context : laterSectionContext) : `${withContextRules(SECTION_SYSTEM_PROMPT, laterSectionContext)}

${LATER_SECTION_EXPERIENCE_RULE}`,
        prompt: JSON.stringify({
          course_context: compactModelContext(section === 1 ? context : laterSectionContext),
          course_and_section: sectionPromptContext(outline, section, allowedNumberIndexes, currentNumbers),
          visuals_for_section: visualsForSection(section, currentNumbers),
          assigned_request_parts: assignedRequestParts(section),
          ...sectionErrors.has(section) ? { previous_validation_error: errorFeedback(sectionErrors.get(section)) } : {}
        }),
        response_schema: buildLessonPlanSectionDraftJsonSchema(outline, section, allowedNumberIndexes)
      });
      modelCalls += 1;
    } catch (error) {
      sectionAttempts.set(section, attempt - 1);
      throw error;
    }
    let candidate;
    try {
      candidate = lowerModelSectionDraft(
        coerceLessonPlanSectionModelNumbers(
          pruneModelNulls(parseModelJson(raw, `lessonPlanSection${section}`)),
          outline,
          section,
          allowedNumberIndexes
        ),
        outline,
        section,
        true,
        input.language
      );
      specializeDraft(candidate, outline, drafts.slice(0, section - 1));
    } catch (error) {
      const previousError = sectionErrors.get(section);
      sectionErrors.set(section, error);
      await options.on_rejected_part?.({
        label: "lesson-plan-section",
        section,
        attempt,
        error: rejectionDetails(error)
      });
      if (unsupportedSectionResponse(error, previousError, input.language)) throw error;
      return generateSection(section);
    }
    return candidate;
  };
  const dropUncheckedAnswerActivities = async (draft, section) => {
    if (!draft.student_activities?.length) return;
    const kept = [];
    for (const [index, activity] of draft.student_activities.entries()) {
      if (activity.kind === "numeric_answer") {
        try {
          validateTypedQuestion(activity, `$lessonPlanSection${section}.student_activities[${index}]`);
        } catch (error) {
          if (!(error instanceof LessonPlanError)) throw error;
          await options.on_program_adjustment?.({ kind: "answer_activity_removed", section, reason: error.message });
          continue;
        }
      }
      kept.push(activity);
    }
    if (kept.length === draft.student_activities.length) return;
    if (kept.length) draft.student_activities = kept;
    else delete draft.student_activities;
  };
  const drafts = [];
  const acceptSection = async (section, initialCandidate) => {
    let candidate = initialCandidate;
    while (true) {
      candidate ??= await generateSection(section);
      await dropUncheckedAnswerActivities(candidate, section);
      drafts[section - 1] = candidate;
      let prefix;
      try {
        prefix = compilePrefix(outline, drafts.slice(0, section), options.compile);
      } catch (error) {
        const previousError = sectionErrors.get(section);
        if (unsupportedSectionResponse(error, previousError, input.language)) throw error;
        if ((sectionAttempts.get(section) ?? 0) >= maxAttempts) throw error;
        sectionErrors.set(section, error);
        await options.on_rejected_part?.({
          label: "lesson-plan-section",
          section,
          attempt: sectionAttempts.get(section) ?? 1,
          error: rejectionDetails(error)
        });
        candidate = void 0;
        continue;
      }
      await reportDraftAdjustments(candidate);
      await options.on_playable_prefix?.({ completed_sections: section, compiled: prefix });
      return;
    }
  };
  try {
    await acceptSection(1, bootstrappedFirstSection);
  } catch (error) {
    const learnerResponse = unsupportedSectionResponse(error, sectionErrors.get(1), input.language);
    if (!learnerResponse) throw error;
    return {
      disposition: "unsupported",
      learner_response: learnerResponse,
      model_calls: modelCalls
    };
  }
  const addSingleSectionPractice = async () => {
    const draft = drafts[0];
    const card = draft && practiceCard(draft);
    if (!draft || !card) return;
    const reject = (error) => options.on_rejected_part?.({
      label: "lesson-plan-section",
      section: 1,
      attempt: 1,
      error: rejectionDetails(error)
    });
    let items;
    try {
      const raw = await model({
        label: "lesson-plan-section",
        part: "practice",
        section: 1,
        attempt: 1,
        turn_id: input.turn_id,
        system_prompt: withContextRules(PRACTICE_SYSTEM_PROMPT, laterSectionContext),
        prompt: JSON.stringify({
          course_context: compactModelContext(laterSectionContext),
          lesson: { title: outline.title, goals: outline.goals, taught: taughtContent(draft) }
        }),
        response_schema: buildLessonPlanPracticeJsonSchema()
      });
      modelCalls += 1;
      const parsed = pruneModelNulls(parseModelJson(raw, "lessonPlanPractice"));
      items = Array.isArray(parsed?.answer_activities) ? parsed.answer_activities.slice(0, 2) : [];
    } catch (error) {
      await reject(error);
      return;
    }
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const activity = lowerAnswerActivity(item, card);
      const candidate = { ...draft, student_activities: [...drafts[0].student_activities ?? [], activity] };
      try {
        compilePrefix(outline, [candidate], options.compile);
        drafts[0] = candidate;
      } catch (error) {
        await reject(error);
      }
    }
  };
  if (outline.sections.length === 1) await addSingleSectionPractice();
  for (let section = 2; section <= outline.sections.length; section += 1) {
    try {
      await acceptSection(section);
    } catch (error) {
      const learnerResponse = unsupportedSectionResponse(error, sectionErrors.get(section), input.language);
      if (!learnerResponse) throw error;
      return {
        disposition: "unsupported",
        learner_response: learnerResponse,
        model_calls: modelCalls
      };
    }
  }
  let compiled;
  let compiledOutline;
  let compiledDrafts;
  let programAdjustments = [];
  let finalError;
  for (let attempt = 1; attempt <= outline.sections.length * maxAttempts; attempt += 1) {
    try {
      const normalized = normalizeExecutableNumberInteractions(outline, drafts);
      const plan = assembleLessonPlan(normalized.outline, normalized.drafts, options.compile);
      compiled = compileAndValidateLessonPlan(plan, { ...options.compile, construction_rules: "explicit-v1" });
      compiledOutline = normalized.outline;
      compiledDrafts = normalized.drafts;
      programAdjustments = normalized.adjustments;
      break;
    } catch (error) {
      finalError = error;
      const section = sectionIndexFromError(error, outline.sections.length);
      if (!section || (sectionAttempts.get(section) ?? 0) >= maxAttempts) throw error;
      sectionErrors.set(section, error);
      await options.on_rejected_part?.({
        label: "lesson-plan-section",
        section,
        attempt: sectionAttempts.get(section) ?? 1,
        error: rejectionDetails(error)
      });
      drafts[section - 1] = await generateSection(section);
    }
  }
  if (!compiled) throw finalError;
  for (const draft of drafts) await reportDraftAdjustments(draft);
  for (const adjustment of programAdjustments) {
    await options.on_program_adjustment?.(adjustment);
  }
  for (const adjustment of compiled.view_adjustments) {
    await options.on_program_adjustment?.({ kind: "plot_view_adjusted", ...adjustment });
  }
  return {
    ...compiled,
    outline: compiledOutline ?? outline,
    drafts: (compiledDrafts ?? drafts).map((draft) => structuredClone(draft)),
    model_calls: modelCalls,
    ...stableCameraObservation ? { camera_observation: stableCameraObservation } : {}
  };
}
export {
  INSTALLED_PLUGINS,
  LESSON_PLAN_CAPABILITIES,
  LESSON_PLAN_CAPABILITY_NAMES,
  LESSON_PLAN_CAPABILITY_NUMBER_INPUTS,
  LESSON_PLAN_CAPABILITY_NUMBER_LIMITS,
  LESSON_PLAN_CAPABILITY_REGISTRY,
  LESSON_PLAN_MODEL_VISUAL_PARAMETER_NAMES,
  LESSON_PLAN_SCENE_INITIAL_CAMERAS,
  LESSON_PLAN_VERSION,
  LESSON_PLAN_VISUAL_FEATURES,
  LESSON_PLAN_VISUAL_PARAMETER_NAMES,
  LessonPlanError,
  OFFERED_RECIPES,
  PLUGIN_COMPILERS,
  PROCESS_DIAGRAM_CONTRACT,
  RECIPE_CATALOG_ORDER,
  RECIPE_HOOKS,
  RECIPE_PLUGIN,
  RECIPE_SCHEMA_PROPERTIES,
  SCHEMA_PROPERTY_ORDER,
  SECTION_FACTS,
  TRIAL_RECIPES,
  assembleLessonPlan,
  buildCameraLessonPlanAdmissionBootstrapJsonSchema,
  buildCameraLessonPlanAdmissionOutlineJsonSchema,
  buildLessonPlanAdmissionBootstrapJsonSchema,
  buildLessonPlanAdmissionOutlineJsonSchema,
  buildLessonPlanBootstrapJsonSchema,
  buildLessonPlanOutlineJsonSchema,
  buildLessonPlanPracticeJsonSchema,
  buildLessonPlanSectionDraftJsonSchema,
  coerceLessonPlanBootstrapSectionModelNumbers,
  coerceLessonPlanOutlineModelNumbers,
  coerceLessonPlanSectionModelNumbers,
  compileAndValidateLessonPlan,
  compileLessonPlan,
  deriveLessonRequestParts,
  enabledTrialRecipes,
  generateLessonPlanWithModel,
  includeWrittenCardsInFocus,
  lessonPlanPlugins,
  matchLessonPlanCapability,
  mathExpressionToOll,
  numericAnswerTolerance,
  promptSlot,
  resolveLessonPlan,
  roundingPlaces,
  roundingTolerance,
  validateLessonPlan,
  validateLessonPlanOutline,
  validateNumericAnswerActivity,
  validateTypedQuestion
};
