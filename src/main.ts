/**
 * The purpose of this file is to trigger a cascade of compiling the TypeScript files to JavaScript.
 * 
 * It is a temporary measure util the top-level file, ace.js, becomes TypeScript.
 */
/// <reference path="../typings/require.d.ts" />
import async = require('./lib/async');
import dom = require('./lib/dom');
import event = require('./lib/event');
import eve = require('./lib/event_emitter');
import lang = require('./lib/lang');
import oop = require('./lib/oop');
import keys = require('./lib/keys');
import config = require('./config');
import unicode = require('./unicode');
import UndoManager = require('./undomanager');
import EditorRange = require('./range');
import Anchor = require('./anchor');
import Document = require('./document');
import net = require('./lib/net');
import mix = require('./lib/mix');
import EditorPosition = require('./mode/typescript/EditorPosition');
import CompletionService = require('./mode/typescript/CompletionService');
import DocumentPositionUtil = require('./mode/typescript/DocumentPositionUtil');
import HashHandler = require('./keyboard/hash_handler');
import autoComplete = require('./mode/typescript/autoComplete');
import useragent = require('./lib/useragent');
import workspace = require('./workspace/workspace');
import worker_client = require('./worker/worker_client');
// FIXME: Disabled for now: import workspace_worker = require('./workspace/workspace_worker');
import mirror = require('./worker/mirror');
import PythonWorker = require('./mode/python_worker');
import TypeScriptWorker = require('./mode/typescript_worker');
import ace = require('./ace');
import triton = require('./triton');
import editor = require('./Editor');
import tooltip = require('./tooltip');
import os = require('./os');
import SearchHighlight = require('./search_highlight');
import BackgroundTokenizer = require('./background_tokenizer');
import Selection = require('./selection');
import text = require('./mode/text');
import languageTools = require('./ext/language_tools');
import textCompleter = require('./autocomplete/text_completer');
// Import themes defined in TypeScript.
import mathdoodle = require('./theme/mathdoodle')
import twilight = require('./theme/twilight');

// We have to make sure there is a reference to get inclusion in the bundled scripts.
var thinkide = {
    async: async,
    dom: dom,
    event: event,
    eve: eve,
    lang: lang,
    oop: oop,
    keys: keys,
    config: config,
    unicode: unicode,
    UndoManager: UndoManager,
    EditorRange: EditorRange,
    Anchor: Anchor,
    Document: Document,
    net: net,
    EditorPosition: EditorPosition,
    CompletionService: CompletionService,
    DocumentPositionUtil: DocumentPositionUtil,
    SearchHighlight: SearchHighlight,
    Selection: Selection,
    BackgroundTokenizer: BackgroundTokenizer,
    autoComplete: autoComplete,
    useragent: useragent,
    mix: mix,
    HashHandler: HashHandler,
    workspace: workspace,
    os: os,
    worker_client: worker_client,
    // workspace_worker: workspace_worker,
    mirror: mirror,
    ace: ace,
    triton: triton,
    tooltip: tooltip,
    text: text,
    languageTools: languageTools,
    textCompleter: textCompleter,
    // Including themes may not be necessary?
    twilight: twilight
};
export = thinkide;