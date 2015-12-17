System.config({
  baseURL: "/",
  defaultJSExtensions: true,
  transpiler: "babel",
  babelOptions: {
    "optional": [
      "runtime",
      "optimisation.modules.system"
    ]
  },
  typescriptOptions: {
    "noImplicitAny": true,
    "typeCheck": true,
    "tsconfig": true
  },
  paths: {
    "github:*": "jspm_packages/github/*",
    "npm:*": "jspm_packages/npm/*"
  },
  bundles: {
    "lib/ace.js": [
      "es6/ace.js",
      "es6/lib/event.js",
      "es6/Editor.js",
      "es6/Document.js",
      "es6/EditSession.js",
      "es6/UndoManager.js",
      "es6/VirtualRenderer.js",
      "es6/theme/twilight.js",
      "es6/lib/dom.js",
      "es6/lib/useragent.js",
      "es6/editor_protocol.js",
      "npm:babel-runtime@5.8.34/helpers/class-call-check",
      "es6/lib/keys.js",
      "es6/commands/default_commands.js",
      "es6/touch/touch.js",
      "es6/lib/oop.js",
      "es6/lib/lang.js",
      "es6/keyboard/KeyBinding.js",
      "es6/keyboard/TextInput.js",
      "es6/Search.js",
      "es6/Range.js",
      "es6/lib/event_emitter.js",
      "es6/commands/CommandManager.js",
      "es6/config.js",
      "es6/TokenIterator.js",
      "es6/Tooltip.js",
      "es6/Anchor.js",
      "es6/FoldLine.js",
      "es6/Fold.js",
      "es6/Selection.js",
      "es6/BackgroundTokenizer.js",
      "es6/SearchHighlight.js",
      "es6/lib/asserts.js",
      "es6/BracketMatch.js",
      "es6/mode/TextMode.js",
      "es6/layer/Gutter.js",
      "es6/layer/Marker.js",
      "es6/layer/Text.js",
      "es6/layer/Cursor.js",
      "es6/VScrollBar.js",
      "es6/HScrollBar.js",
      "es6/RenderLoop.js",
      "es6/layer/FontMetrics.js",
      "es6/ThemeLink.js",
      "npm:babel-runtime@5.8.34/core-js/object/create",
      "npm:babel-runtime@5.8.34/helpers/get",
      "npm:babel-runtime@5.8.34/helpers/inherits",
      "npm:babel-runtime@5.8.34/helpers/create-class",
      "npm:babel-runtime@5.8.34/core-js/promise",
      "npm:babel-runtime@5.8.34/core-js/object/keys",
      "es6/unicode.js",
      "es6/lib/net.js",
      "es6/hammer/hammer.js",
      "es6/hammer/recognizers/pan.js",
      "es6/hammer/recognizers/tap.js",
      "es6/lib/mix.js",
      "es6/keyboard/HashHandler.js",
      "es6/range_list.js",
      "es6/Tokenizer.js",
      "es6/mode/TextHighlightRules.js",
      "es6/mode/Behaviour.js",
      "es6/ScrollBar.js",
      "npm:core-js@1.2.6/library/fn/object/create",
      "npm:babel-runtime@5.8.34/core-js/object/get-own-property-descriptor",
      "npm:babel-runtime@5.8.34/core-js/object/set-prototype-of",
      "npm:babel-runtime@5.8.34/core-js/object/define-property",
      "npm:core-js@1.2.6/library/fn/promise",
      "npm:core-js@1.2.6/library/fn/object/keys",
      "es6/comparePoints.js",
      "npm:core-js@1.2.6/library/modules/$",
      "es6/hammer/recognizers/attribute.js",
      "npm:babel-runtime@5.8.34/core-js/object/get-own-property-names",
      "npm:core-js@1.2.6/library/fn/object/get-own-property-descriptor",
      "npm:core-js@1.2.6/library/fn/object/set-prototype-of",
      "npm:core-js@1.2.6/library/modules/es6.object.to-string",
      "npm:core-js@1.2.6/library/modules/$.core",
      "es6/hammer/utils.js",
      "npm:core-js@1.2.6/library/fn/object/define-property",
      "npm:core-js@1.2.6/library/modules/es6.string.iterator",
      "npm:core-js@1.2.6/library/modules/web.dom.iterable",
      "npm:core-js@1.2.6/library/modules/es6.promise",
      "npm:core-js@1.2.6/library/modules/es6.object.keys",
      "npm:core-js@1.2.6/library/fn/object/get-own-property-names",
      "npm:core-js@1.2.6/library/modules/es6.object.get-own-property-descriptor",
      "npm:core-js@1.2.6/library/modules/es6.object.set-prototype-of",
      "npm:core-js@1.2.6/library/modules/$.iterators",
      "npm:core-js@1.2.6/library/modules/$.library",
      "npm:core-js@1.2.6/library/modules/$.global",
      "npm:core-js@1.2.6/library/modules/$.is-object",
      "npm:core-js@1.2.6/library/modules/$.a-function",
      "npm:core-js@1.2.6/library/modules/$.strict-new",
      "npm:core-js@1.2.6/library/modules/$.same-value",
      "github:jspm/nodelibs-process@0.1.2",
      "npm:core-js@1.2.6/library/modules/$.string-at",
      "npm:core-js@1.2.6/library/modules/$.iter-define",
      "npm:core-js@1.2.6/library/modules/es6.array.iterator",
      "npm:core-js@1.2.6/library/modules/$.ctx",
      "npm:core-js@1.2.6/library/modules/$.classof",
      "npm:core-js@1.2.6/library/modules/$.export",
      "npm:core-js@1.2.6/library/modules/$.an-object",
      "npm:core-js@1.2.6/library/modules/$.for-of",
      "npm:core-js@1.2.6/library/modules/$.set-proto",
      "npm:core-js@1.2.6/library/modules/$.wks",
      "npm:core-js@1.2.6/library/modules/$.species-constructor",
      "npm:core-js@1.2.6/library/modules/$.microtask",
      "npm:core-js@1.2.6/library/modules/$.descriptors",
      "npm:core-js@1.2.6/library/modules/$.redefine-all",
      "npm:core-js@1.2.6/library/modules/$.set-to-string-tag",
      "npm:core-js@1.2.6/library/modules/$.set-species",
      "npm:core-js@1.2.6/library/modules/$.iter-detect",
      "npm:core-js@1.2.6/library/modules/$.to-object",
      "npm:core-js@1.2.6/library/modules/$.object-sap",
      "npm:core-js@1.2.6/library/modules/es6.object.get-own-property-names",
      "npm:core-js@1.2.6/library/modules/$.to-iobject",
      "npm:core-js@1.2.6/library/modules/$.to-integer",
      "npm:core-js@1.2.6/library/modules/$.defined",
      "npm:core-js@1.2.6/library/modules/$.has",
      "npm:core-js@1.2.6/library/modules/$.add-to-unscopables",
      "npm:core-js@1.2.6/library/modules/$.iter-step",
      "npm:core-js@1.2.6/library/modules/$.cof",
      "npm:core-js@1.2.6/library/modules/$.uid",
      "github:jspm/nodelibs-process@0.1.2/index",
      "npm:core-js@1.2.6/library/modules/$.redefine",
      "npm:core-js@1.2.6/library/modules/$.hide",
      "npm:core-js@1.2.6/library/modules/$.iter-create",
      "npm:core-js@1.2.6/library/modules/$.iter-call",
      "npm:core-js@1.2.6/library/modules/$.is-array-iter",
      "npm:core-js@1.2.6/library/modules/$.to-length",
      "npm:core-js@1.2.6/library/modules/core.get-iterator-method",
      "npm:core-js@1.2.6/library/modules/$.shared",
      "npm:core-js@1.2.6/library/modules/$.fails",
      "npm:core-js@1.2.6/library/modules/$.task",
      "npm:core-js@1.2.6/library/modules/$.get-names",
      "npm:core-js@1.2.6/library/modules/$.property-desc",
      "npm:core-js@1.2.6/library/modules/$.iobject",
      "npm:process@0.11.2",
      "npm:core-js@1.2.6/library/modules/$.invoke",
      "npm:core-js@1.2.6/library/modules/$.html",
      "npm:core-js@1.2.6/library/modules/$.dom-create",
      "npm:process@0.11.2/browser"
    ]
  },

  map: {
    "babel": "npm:babel-core@5.8.34",
    "babel-runtime": "npm:babel-runtime@5.8.34",
    "core-js": "npm:core-js@1.2.6",
    "geometryzen/ace2016": "github:geometryzen/ace2016@0.1.15",
    "jshint": "npm:jshint@2.9.1-rc1",
    "ts": "github:frankwallis/plugin-typescript@2.4.3",
    "typescript": "npm:typescript@1.7.3",
    "github:frankwallis/plugin-typescript@2.4.3": {
      "typescript": "npm:typescript@1.7.3"
    },
    "github:jspm/nodelibs-assert@0.1.0": {
      "assert": "npm:assert@1.3.0"
    },
    "github:jspm/nodelibs-buffer@0.1.0": {
      "buffer": "npm:buffer@3.5.5"
    },
    "github:jspm/nodelibs-events@0.1.1": {
      "events": "npm:events@1.0.2"
    },
    "github:jspm/nodelibs-http@1.7.1": {
      "Base64": "npm:Base64@0.2.1",
      "events": "github:jspm/nodelibs-events@0.1.1",
      "inherits": "npm:inherits@2.0.1",
      "stream": "github:jspm/nodelibs-stream@0.1.0",
      "url": "github:jspm/nodelibs-url@0.1.0",
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "github:jspm/nodelibs-os@0.1.0": {
      "os-browserify": "npm:os-browserify@0.1.2"
    },
    "github:jspm/nodelibs-path@0.1.0": {
      "path-browserify": "npm:path-browserify@0.0.0"
    },
    "github:jspm/nodelibs-process@0.1.2": {
      "process": "npm:process@0.11.2"
    },
    "github:jspm/nodelibs-stream@0.1.0": {
      "stream-browserify": "npm:stream-browserify@1.0.0"
    },
    "github:jspm/nodelibs-url@0.1.0": {
      "url": "npm:url@0.10.3"
    },
    "github:jspm/nodelibs-util@0.1.0": {
      "util": "npm:util@0.10.3"
    },
    "npm:assert@1.3.0": {
      "util": "npm:util@0.10.3"
    },
    "npm:babel-runtime@5.8.34": {
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:brace-expansion@1.1.2": {
      "balanced-match": "npm:balanced-match@0.3.0",
      "concat-map": "npm:concat-map@0.0.1"
    },
    "npm:buffer@3.5.5": {
      "base64-js": "npm:base64-js@0.0.8",
      "child_process": "github:jspm/nodelibs-child_process@0.1.0",
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "ieee754": "npm:ieee754@1.1.6",
      "isarray": "npm:isarray@1.0.0",
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:cli@0.6.6": {
      "exit": "npm:exit@0.1.2",
      "glob": "npm:glob@3.2.11",
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:console-browserify@1.1.0": {
      "assert": "github:jspm/nodelibs-assert@0.1.0",
      "date-now": "npm:date-now@0.1.4",
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:core-js@1.2.6": {
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "path": "github:jspm/nodelibs-path@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.2",
      "systemjs-json": "github:systemjs/plugin-json@0.1.0"
    },
    "npm:core-util-is@1.0.2": {
      "buffer": "github:jspm/nodelibs-buffer@0.1.0"
    },
    "npm:dom-serializer@0.1.0": {
      "domelementtype": "npm:domelementtype@1.1.3",
      "entities": "npm:entities@1.1.1"
    },
    "npm:domhandler@2.3.0": {
      "domelementtype": "npm:domelementtype@1.1.3"
    },
    "npm:domutils@1.5.1": {
      "dom-serializer": "npm:dom-serializer@0.1.0",
      "domelementtype": "npm:domelementtype@1.1.3"
    },
    "npm:entities@1.0.0": {
      "systemjs-json": "github:systemjs/plugin-json@0.1.0"
    },
    "npm:entities@1.1.1": {
      "systemjs-json": "github:systemjs/plugin-json@0.1.0"
    },
    "npm:exit@0.1.2": {
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:glob@3.2.11": {
      "assert": "github:jspm/nodelibs-assert@0.1.0",
      "events": "github:jspm/nodelibs-events@0.1.1",
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "inherits": "npm:inherits@2.0.1",
      "minimatch": "npm:minimatch@0.3.0",
      "path": "github:jspm/nodelibs-path@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.2",
      "systemjs-json": "github:systemjs/plugin-json@0.1.0"
    },
    "npm:htmlparser2@3.8.3": {
      "domelementtype": "npm:domelementtype@1.1.3",
      "domhandler": "npm:domhandler@2.3.0",
      "domutils": "npm:domutils@1.5.1",
      "entities": "npm:entities@1.0.0",
      "events": "github:jspm/nodelibs-events@0.1.1",
      "process": "github:jspm/nodelibs-process@0.1.2",
      "stream": "github:jspm/nodelibs-stream@0.1.0",
      "systemjs-json": "github:systemjs/plugin-json@0.1.0",
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:inherits@2.0.1": {
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:jshint@2.9.1-rc1": {
      "assert": "github:jspm/nodelibs-assert@0.1.0",
      "buffer": "github:jspm/nodelibs-buffer@0.1.0",
      "cli": "npm:cli@0.6.6",
      "console-browserify": "npm:console-browserify@1.1.0",
      "events": "github:jspm/nodelibs-events@0.1.1",
      "exit": "npm:exit@0.1.2",
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "htmlparser2": "npm:htmlparser2@3.8.3",
      "lodash": "npm:lodash@3.7.0",
      "minimatch": "npm:minimatch@2.0.10",
      "path": "github:jspm/nodelibs-path@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.2",
      "shelljs": "npm:shelljs@0.3.0",
      "strip-json-comments": "npm:strip-json-comments@1.0.4",
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:lodash@3.7.0": {
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:minimatch@0.3.0": {
      "lru-cache": "npm:lru-cache@2.7.3",
      "path": "github:jspm/nodelibs-path@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.2",
      "sigmund": "npm:sigmund@1.0.1"
    },
    "npm:minimatch@2.0.10": {
      "brace-expansion": "npm:brace-expansion@1.1.2",
      "path": "github:jspm/nodelibs-path@0.1.0"
    },
    "npm:os-browserify@0.1.2": {
      "os": "github:jspm/nodelibs-os@0.1.0"
    },
    "npm:path-browserify@0.0.0": {
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:process@0.11.2": {
      "assert": "github:jspm/nodelibs-assert@0.1.0"
    },
    "npm:punycode@1.3.2": {
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:readable-stream@1.1.13": {
      "buffer": "github:jspm/nodelibs-buffer@0.1.0",
      "core-util-is": "npm:core-util-is@1.0.2",
      "events": "github:jspm/nodelibs-events@0.1.1",
      "inherits": "npm:inherits@2.0.1",
      "isarray": "npm:isarray@0.0.1",
      "process": "github:jspm/nodelibs-process@0.1.2",
      "stream-browserify": "npm:stream-browserify@1.0.0",
      "string_decoder": "npm:string_decoder@0.10.31"
    },
    "npm:shelljs@0.3.0": {
      "buffer": "github:jspm/nodelibs-buffer@0.1.0",
      "child_process": "github:jspm/nodelibs-child_process@0.1.0",
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "os": "github:jspm/nodelibs-os@0.1.0",
      "path": "github:jspm/nodelibs-path@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:sigmund@1.0.1": {
      "http": "github:jspm/nodelibs-http@1.7.1",
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:stream-browserify@1.0.0": {
      "events": "github:jspm/nodelibs-events@0.1.1",
      "inherits": "npm:inherits@2.0.1",
      "readable-stream": "npm:readable-stream@1.1.13"
    },
    "npm:string_decoder@0.10.31": {
      "buffer": "github:jspm/nodelibs-buffer@0.1.0"
    },
    "npm:strip-json-comments@1.0.4": {
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "process": "github:jspm/nodelibs-process@0.1.2",
      "systemjs-json": "github:systemjs/plugin-json@0.1.0"
    },
    "npm:url@0.10.3": {
      "assert": "github:jspm/nodelibs-assert@0.1.0",
      "punycode": "npm:punycode@1.3.2",
      "querystring": "npm:querystring@0.2.0",
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:util@0.10.3": {
      "inherits": "npm:inherits@2.0.1",
      "process": "github:jspm/nodelibs-process@0.1.2"
    }
  }
});
