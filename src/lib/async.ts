"use strict";
/*!
 * async
 * https://github.com/caolan/async
 *
 * Copyright 2010-2014 Caolan McMahon
 * Released under the MIT license
 */
function only_once(fn: (err) => void) {
    var called = false;
        return function() {
        if (called) throw new Error("Callback was already called.");
        called = true;
        // FIXME: Not sure what should replace root.
        fn.apply(this, arguments);
    }
}

//// cross-browser compatiblity functions ////

var _toString = Object.prototype.toString;

var _isArray = Array.isArray || function(obj) {
    return _toString.call(obj) === '[object Array]';
};

var _each = function(arr, iterator) {
    if (arr.forEach) {
        return arr.forEach(iterator);
    }
    for (var i = 0; i < arr.length; i += 1) {
        iterator(arr[i], i, arr);
    }
};

var _map = function(arr, iterator) {
    if (arr.map) {
        return arr.map(iterator);
    }
    var results = [];
    _each(arr, function(x, i, a) {
        results.push(iterator(x, i, a));
    });
    return results;
};

var _reduce = function(arr, iterator, memo) {
    if (arr.reduce) {
        return arr.reduce(iterator, memo);
    }
    _each(arr, function(x, i, a) {
        memo = iterator(memo, x, i, a);
    });
    return memo;
};

var _keys = function(obj) {
    if (Object.keys) {
        return Object.keys(obj);
    }
    var keys = [];
    for (var k in obj) {
        if (obj.hasOwnProperty(k)) {
            keys.push(k);
        }
    }
    return keys;
};

//// exported async module functions ////

//// nextTick implementation with browser-compatible fallback ////
export function nextTick(callback: any) {
    throw new Error("nextTick not implemented");
}

export function setImmediate(callback: any) {
    throw new Error("setImmediate not implemented");
}
/*
if (typeof process === 'undefined' || !(process.nextTick)) {
    if (typeof setImmediate === 'function') {
        async.nextTick = function(fn) {
            // not a direct alias for IE10 compatibility
            setImmediate(fn);
        };
        async.setImmediate = async.nextTick;
    }
    else {
        async.nextTick = function(fn) {
            setTimeout(fn, 0);
        };
        async.setImmediate = async.nextTick;
    }
}
else {
    nextTick = process.nextTick;
    if (typeof setImmediate !== 'undefined') {
        setImmediate = function(fn) {
            // not a direct alias for IE10 compatibility
            setImmediate(fn);
        };
    }
    else {
        setImmediate = nextTick;
    }
}
*/

export function each(arr, iterator, callback) {
    callback = callback || function() { };
    if (!arr.length) {
        return callback();
    }
    var completed = 0;
    _each(arr, function(x) {
        iterator(x, only_once(done));
    });
    function done(err) {
        if (err) {
            callback(err);
            callback = function() { };
        }
        else {
            completed += 1;
            if (completed >= arr.length) {
                callback();
            }
        }
    }
}
export var forEach = each;

export function eachSeries(arr, iterator, callback) {
    callback = callback || function() { };
    if (!arr.length) {
        return callback();
    }
    var completed = 0;
    var iterate = function() {
        iterator(arr[completed], function(err) {
            if (err) {
                callback(err);
                callback = function() { };
            }
            else {
                completed += 1;
                if (completed >= arr.length) {
                    callback();
                }
                else {
                    iterate();
                }
            }
        });
    };
    iterate();
}
export var forEachSeries = eachSeries;

export function eachLimit(arr, limit, iterator, callback) {
    var fn = _eachLimit(limit);
    fn.apply(null, [arr, iterator, callback]);
}
export var forEachLimit = eachLimit;

var _eachLimit = function(limit) {

    return function(arr, iterator, callback) {
        callback = callback || function() { };
        if (!arr.length || limit <= 0) {
            return callback();
        }
        var completed = 0;
        var started = 0;
        var running = 0;

        (function replenish() {
            if (completed >= arr.length) {
                return callback();
            }

            while (running < limit && started < arr.length) {
                started += 1;
                running += 1;
                iterator(arr[started - 1], function(err) {
                    if (err) {
                        callback(err);
                        callback = function() { };
                    }
                    else {
                        completed += 1;
                        running -= 1;
                        if (completed >= arr.length) {
                            callback();
                        }
                        else {
                            replenish();
                        }
                    }
                });
            }
        })();
    };
};


var doParallel = function(fn): any {
    return function() {
        var args = Array.prototype.slice.call(arguments);
        return fn.apply(null, [each].concat(args));
    };
};
var doParallelLimit = function(limit, fn): (dummy0?, dummy1?, dummy2?) => any {
    return function() {
        var args = Array.prototype.slice.call(arguments);
        return fn.apply(null, [_eachLimit(limit)].concat(args));
    };
};
var doSeries = function(fn): (arg0?, arg1?, arg2?) => any {
    return function() {
        var args = Array.prototype.slice.call(arguments);
        return fn.apply(null, [eachSeries].concat(args));
    };
};


var _asyncMap = function(eachfn, arr, iterator, callback) {
    arr = _map(arr, function(x, i) {
        return { index: i, value: x };
    });
    if (!callback) {
        eachfn(arr, function(x, callback) {
            iterator(x.value, function(err) {
                callback(err);
            });
        });
    } else {
        var results = [];
        eachfn(arr, function(x, callback) {
            iterator(x.value, function(err, v) {
                results[x.index] = v;
                callback(err);
            });
        }, function(err) {
                callback(err, results);
            });
    }
};
export var map = doParallel(_asyncMap);
export var mapSeries = doSeries(_asyncMap);
export function mapLimit(arr, limit, iterator, callback?) {
    return _mapLimit(limit)(arr, iterator, callback);
}

var _mapLimit = function(limit) {
    return doParallelLimit(limit, _asyncMap);
};

// reduce only has a series version, as doing reduce in parallel won't
// work in many situations.
export function reduce(arr, memo, iterator, callback) {
    eachSeries(arr, function(x, callback) {
        iterator(memo, x, function(err, v) {
            memo = v;
            callback(err);
        });
    }, function(err) {
            callback(err, memo);
        });
}
// inject alias
export var inject = reduce;
// foldl alias
export var foldl = reduce;

export function reduceRight(arr, memo, iterator, callback) {
    var reversed = _map(arr, function(x) {
        return x;
    }).reverse();
    reduce(reversed, memo, iterator, callback);
}
// foldr alias
export var foldr = reduceRight;

var _filter = function(eachfn, arr, iterator, callback) {
    var results = [];
    arr = _map(arr, function(x, i) {
        return { index: i, value: x };
    });
    eachfn(arr, function(x, callback) {
        iterator(x.value, function(v) {
            if (v) {
                results.push(x);
            }
            callback();
        });
    }, function(err) {
            callback(_map(results.sort(function(a, b) {
                return a.index - b.index;
            }), function(x) {
                    return x.value;
                }));
        });
}
export var filter = doParallel(_filter);
export var filterSeries = doSeries(_filter);
// select alias
export var select = filter;
export var selectSeries = filterSeries;

var _reject = function(eachfn, arr, iterator, callback) {
    var results = [];
    arr = _map(arr, function(x, i) {
        return { index: i, value: x };
    });
    eachfn(arr, function(x, callback) {
        iterator(x.value, function(v) {
            if (!v) {
                results.push(x);
            }
            callback();
        });
    }, function(err) {
            callback(_map(results.sort(function(a, b) {
                return a.index - b.index;
            }), function(x) {
                    return x.value;
                }));
        });
}
export var reject = doParallel(_reject);
export var rejectSeries = doSeries(_reject);

var _detect = function(eachfn, arr, iterator, main_callback) {
    eachfn(arr, function(x, callback) {
        iterator(x, function(result) {
            if (result) {
                main_callback(x);
                main_callback = function() { };
            }
            else {
                callback();
            }
        });
    }, function(err) {
            main_callback();
        });
}
export var detect = doParallel(_detect);
export var detectSeries = doSeries(_detect);

export function some(arr, iterator, main_callback) {
    each(arr, function(x, callback) {
        iterator(x, function(v) {
            if (v) {
                main_callback(true);
                main_callback = function() { };
            }
            callback();
        });
    }, function(err) {
            main_callback(false);
        });
}
// any alias
export var any = some;

export function every(arr, iterator, main_callback) {
    each(arr, function(x, callback) {
        iterator(x, function(v) {
            if (!v) {
                main_callback(false);
                main_callback = function() { };
            }
            callback();
        });
    }, function(err) {
            main_callback(true);
        });
}
// all alias
export var all = every;

export function sortBy(arr, iterator, callback) {
    map(arr, function(x, callback) {
        iterator(x, function(err, criteria) {
            if (err) {
                callback(err);
            }
            else {
                callback(null, { value: x, criteria: criteria });
            }
        });
    }, function(err, results) {
            if (err) {
                return callback(err);
            }
            else {
                var fn = function(left, right) {
                    var a = left.criteria, b = right.criteria;
                    return a < b ? -1 : a > b ? 1 : 0;
                };
                callback(null, _map(results.sort(fn), function(x) {
                    return x.value;
                }));
            }
        });
}

export function auto(tasks, callback) {
    callback = callback || function() { };
    var keys = _keys(tasks);
    var remainingTasks = keys.length
        if (!remainingTasks) {
        return callback();
    }

    var results = {};

    var listeners = [];
    var addListener = function(fn) {
        listeners.unshift(fn);
    };
    var removeListener = function(fn) {
        for (var i = 0; i < listeners.length; i += 1) {
            if (listeners[i] === fn) {
                listeners.splice(i, 1);
                return;
            }
        }
    };
    var taskComplete = function() {
        remainingTasks--
            _each(listeners.slice(0), function(fn) {
            fn();
        });
    };

    addListener(function() {
        if (!remainingTasks) {
            var theCallback = callback;
            // prevent final callback from calling itself if it errors
            callback = function() { };

            theCallback(null, results);
        }
    });

    _each(keys, function(k) {
        var task = _isArray(tasks[k]) ? tasks[k] : [tasks[k]];
        var taskCallback = function(err) {
            var args = Array.prototype.slice.call(arguments, 1);
            if (args.length <= 1) {
                args = args[0];
            }
            if (err) {
                var safeResults = {};
                _each(_keys(results), function(rkey) {
                    safeResults[rkey] = results[rkey];
                });
                safeResults[k] = args;
                callback(err, safeResults);
                // stop subsequent errors hitting callback multiple times
                callback = function() { };
            }
            else {
                results[k] = args;
                setImmediate(taskComplete);
            }
        };
        var requires = task.slice(0, Math.abs(task.length - 1)) || [];
        var ready = function() {
            return _reduce(requires, function(a, x) {
                return (a && results.hasOwnProperty(x));
            }, true) && !results.hasOwnProperty(k);
        };
        if (ready()) {
            task[task.length - 1](taskCallback, results);
        }
        else {
            var listener = function() {
                if (ready()) {
                    removeListener(listener);
                    task[task.length - 1](taskCallback, results);
                }
            };
            addListener(listener);
        }
    });
}

export function retry(times, task, callback) {
    var DEFAULT_TIMES = 5;
    var attempts = [];
    // Use defaults if times not passed
    if (typeof times === 'function') {
        callback = task;
        task = times;
        times = DEFAULT_TIMES;
    }
    // Make sure times is a number
    times = parseInt(times, 10) || DEFAULT_TIMES;
    var wrappedTask = function(wrappedCallback?, wrappedResults?): any {
        var retryAttempt = function(task, finalAttempt) {
            return function(seriesCallback) {
                task(function(err, result) {
                    seriesCallback(!err || finalAttempt, { err: err, result: result });
                }, wrappedResults);
            };
        };
        while (times) {
            attempts.push(retryAttempt(task, !(times -= 1)));
        }
        series(attempts, function(done, data) {
            data = data[data.length - 1];
            (wrappedCallback || callback)(data.err, data.result);
        });
    }
        // If a callback is passed, run this as a controll flow
        return callback ? wrappedTask() : wrappedTask
}

export function waterfall(tasks, callback) {
    callback = callback || function() { };
    if (!_isArray(tasks)) {
        var err = new Error('First argument to waterfall must be an array of functions');
        return callback(err);
    }
    if (!tasks.length) {
        return callback();
    }
    var wrapIterator = function(iterator: any): any {
        return function(err) {
            if (err) {
                callback.apply(null, arguments);
                callback = function() { };
            }
            else {
                var args = Array.prototype.slice.call(arguments, 1);
                var next = iterator.next();
                if (next) {
                    args.push(wrapIterator(next));
                }
                else {
                    args.push(callback);
                }
                setImmediate(function() {
                    iterator.apply(null, args);
                });
            }
        };
    };
    wrapIterator(iterator(tasks))();
}

var _parallel = function(eachfn, tasks, callback) {
    callback = callback || function() { };
    if (_isArray(tasks)) {
        eachfn.map(tasks, function(fn, callback) {
            if (fn) {
                fn(function(err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    callback.call(null, err, args);
                });
            }
        }, callback);
    }
    else {
        var results = {};
        eachfn.each(_keys(tasks), function(k, callback) {
            tasks[k](function(err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length <= 1) {
                    args = args[0];
                }
                results[k] = args;
                callback(err);
            });
        }, function(err) {
                callback(err, results);
            });
    }
}

export function parallel(tasks: any[], callback?: (err, results)=>void) {
    _parallel({ map: map, each: each }, tasks, callback);
}

export function parallelLimit(tasks, limit, callback) {
    _parallel({ map: _mapLimit(limit), each: _eachLimit(limit) }, tasks, callback);
}

export function series(tasks, callback) {
    callback = callback || function() { };
    if (_isArray(tasks)) {
        mapSeries(tasks, function(fn, callback) {
            if (fn) {
                fn(function(err) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    if (args.length <= 1) {
                        args = args[0];
                    }
                    callback.call(null, err, args);
                });
            }
        }, callback);
    }
    else {
        var results = {};
        eachSeries(_keys(tasks), function(k, callback) {
            tasks[k](function(err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length <= 1) {
                    args = args[0];
                }
                results[k] = args;
                callback(err);
            });
        }, function(err) {
                callback(err, results);
            });
    }
}

export function iterator(tasks) {
    var makeCallback = function(index) {
        var fn: any = function() {
            if (tasks.length) {
                tasks[index].apply(null, arguments);
            }
            return fn.next();
        };
        fn.next = function() {
            return (index < tasks.length - 1) ? makeCallback(index + 1) : null;
        };
        return fn;
    };
    return makeCallback(0);
}

export function apply(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return function() {
        return fn.apply(
            null, args.concat(Array.prototype.slice.call(arguments))
            );
    };
}

var _concat = function(eachfn, arr, fn, callback) {
    var r = [];
    eachfn(arr, function(x, cb) {
        fn(x, function(err, y) {
            r = r.concat(y || []);
            cb(err);
        });
    }, function(err) {
            callback(err, r);
        });
};
export var concat = doParallel(_concat);
export var concatSeries = doSeries(_concat);

export function whilst(test, iterator, callback) {
    if (test()) {
        iterator(function(err) {
            if (err) {
                return callback(err);
            }
            whilst(test, iterator, callback);
        });
    }
    else {
        callback();
    }
}

export function doWhilst(iterator, test, callback) {
    iterator(function(err) {
        if (err) {
            return callback(err);
        }
        var args = Array.prototype.slice.call(arguments, 1);
        if (test.apply(null, args)) {
            doWhilst(iterator, test, callback);
        }
        else {
            callback();
        }
    });
}

export function until(test, iterator, callback) {
    if (!test()) {
        iterator(function(err) {
            if (err) {
                return callback(err);
            }
            until(test, iterator, callback);
        });
    }
    else {
        callback();
    }
}

export function doUntil(iterator, test, callback) {
    iterator(function(err) {
        if (err) {
            return callback(err);
        }
        var args = Array.prototype.slice.call(arguments, 1);
        if (!test.apply(null, args)) {
            doUntil(iterator, test, callback);
        }
        else {
            callback();
        }
    });
}

export function queue(worker, concurrency) {
    if (concurrency === undefined) {
        concurrency = 1;
    }
    function _insert(q, data, pos, callback) {
        if (!q.started) {
            q.started = true;
        }
        if (!_isArray(data)) {
            data = [data];
        }
        if (data.length == 0) {
            // call drain immediately if there are no tasks
            return setImmediate(function() {
                if (q.drain) {
                    q.drain();
                }
            });
        }
        _each(data, function(task) {
            var item = {
                data: task,
                callback: typeof callback === 'function' ? callback : null
            };

            if (pos) {
                q.tasks.unshift(item);
            } else {
                q.tasks.push(item);
            }

            if (q.saturated && q.tasks.length === q.concurrency) {
                q.saturated();
            }
            setImmediate(q.process);
        });
    }

    var workers = 0;
    var q = {
        tasks: [],
        concurrency: concurrency,
        saturated: null,
        empty: null,
        drain: null,
        started: false,
        paused: false,
        push: function(data, callback) {
            _insert(q, data, false, callback);
        },
        kill: function() {
            q.drain = null;
            q.tasks = [];
        },
        unshift: function(data, callback) {
            _insert(q, data, true, callback);
        },
        process: function() {
            if (!q.paused && workers < q.concurrency && q.tasks.length) {
                var task = q.tasks.shift();
                if (q.empty && q.tasks.length === 0) {
                    q.empty();
                }
                workers += 1;
                var next = function() {
                    workers -= 1;
                    if (task.callback) {
                        task.callback.apply(task, arguments);
                    }
                    if (q.drain && q.tasks.length + workers === 0) {
                        q.drain();
                    }
                    q.process();
                };
                var cb = only_once(next);
                worker(task.data, cb);
            }
        },
        length: function() {
            return q.tasks.length;
        },
        running: function() {
            return workers;
        },
        idle: function() {
            return q.tasks.length + workers === 0;
        },
        pause: function() {
            if (q.paused === true) { return; }
            q.paused = true;
            q.process();
        },
        resume: function() {
            if (q.paused === false) { return; }
            q.paused = false;
            q.process();
        }
    };
    return q;
}

export function priorityQueue(worker, concurrency) {

    function _compareTasks(a, b) {
        return a.priority - b.priority;
    };

    function _binarySearch(sequence, item, compare) {
        var beg = -1,
            end = sequence.length - 1;
        while (beg < end) {
            var mid = beg + ((end - beg + 1) >>> 1);
            if (compare(item, sequence[mid]) >= 0) {
                beg = mid;
            } else {
                end = mid - 1;
            }
        }
        return beg;
    }

    function _insert(q, data, priority, callback) {
        if (!q.started) {
            q.started = true;
        }
        if (!_isArray(data)) {
            data = [data];
        }
        if (data.length == 0) {
            // call drain immediately if there are no tasks
            return setImmediate(function() {
                if (q.drain) {
                    q.drain();
                }
            });
        }
        _each(data, function(task) {
            var item = {
                data: task,
                priority: priority,
                callback: typeof callback === 'function' ? callback : null
            };

            q.tasks.splice(_binarySearch(q.tasks, item, _compareTasks) + 1, 0, item);

            if (q.saturated && q.tasks.length === q.concurrency) {
                q.saturated();
            }
            setImmediate(q.process);
        });
    }

    // Start with a normal queue
    var q: any = queue(worker, concurrency);

    // Override push to accept second parameter representing priority
    q.push = function(data, priority, callback) {
        _insert(q, data, priority, callback);
    };

    // Remove unshift function
    delete q.unshift;

    return q;
}

export function cargo(worker, payload) {
    var working = false,
        tasks = [];

    var cargo = {
        tasks: tasks,
        payload: payload,
        saturated: null,
        empty: null,
        drain: null,
        drained: true,
        push: function(data, callback) {
            if (!_isArray(data)) {
                data = [data];
            }
            _each(data, function(task) {
                tasks.push({
                    data: task,
                    callback: typeof callback === 'function' ? callback : null
                });
                cargo.drained = false;
                if (cargo.saturated && tasks.length === payload) {
                    cargo.saturated();
                }
            });
            setImmediate(cargo.process);
        },
        process: function process() {
            if (working) return;
            if (tasks.length === 0) {
                if (cargo.drain && !cargo.drained) cargo.drain();
                cargo.drained = true;
                return;
            }

            var ts = typeof payload === 'number'
                ? tasks.splice(0, payload)
                : tasks.splice(0, tasks.length);

            var ds = _map(ts, function(task) {
                return task.data;
            });

            if (cargo.empty) cargo.empty();
            working = true;
            worker(ds, function() {
                working = false;

                var args = arguments;
                _each(ts, function(data) {
                    if (data.callback) {
                        data.callback.apply(null, args);
                    }
                });

                process();
            });
        },
        length: function() {
            return tasks.length;
        },
        running: function() {
            return working;
        }
    };
    return cargo;
}

var _console_fn = function(name) {
    return function(fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        fn.apply(null, args.concat([function(err) {
            var args = Array.prototype.slice.call(arguments, 1);
            if (typeof console !== 'undefined') {
                if (err) {
                    if (console.error) {
                        console.error(err);
                    }
                }
                else if (console[name]) {
                    _each(args, function(x) {
                        console[name](x);
                    });
                }
            }
        }]));
    };
};
export var log = _console_fn('log');
export var dir = _console_fn('dir');
/*async.info = _console_fn('info');
async.warn = _console_fn('warn');
async.error = _console_fn('error');*/

export function memoize(fn, hasher) {
    var memo = {};
    var queues = {};
    hasher = hasher || function(x) {
        return x;
    };
    var memoized: any = function() {
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        var key = hasher.apply(null, args);
        if (key in memo) {
            nextTick(function() {
                callback.apply(null, memo[key]);
            });
        }
        else if (key in queues) {
            queues[key].push(callback);
        }
        else {
            queues[key] = [callback];
            fn.apply(null, args.concat([function() {
                memo[key] = arguments;
                var q = queues[key];
                delete queues[key];
                for (var i = 0, l = q.length; i < l; i++) {
                    q[i].apply(null, arguments);
                }
            }]));
        }
    };
    memoized.memo = memo;
    memoized.unmemoized = fn;
    return memoized;
}

export function unmemoize(fn) {
    return function() {
        return (fn.unmemoized || fn).apply(null, arguments);
    };
}

export function times(count, iterator, callback) {
    var counter = [];
    for (var i = 0; i < count; i++) {
        counter.push(i);
    }
    return map(counter, iterator, callback);
}

export function timesSeries(count, iterator, callback) {
    var counter = [];
    for (var i = 0; i < count; i++) {
        counter.push(i);
    }
    return mapSeries(counter, iterator, callback);
}

export function seq(/* functions... */) {
    var fns = arguments;
    return function() {
        var that = this;
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        reduce(fns, args, function(newargs, fn, cb) {
            fn.apply(that, newargs.concat([function() {
                var err = arguments[0];
                var nextargs = Array.prototype.slice.call(arguments, 1);
                cb(err, nextargs);
            }]))
            },
            function(err, results) {
                callback.apply(that, [err].concat(results));
            });
    };
}

export function compose(/* functions... */) {
    return seq.apply(null, Array.prototype.reverse.call(arguments));
}

var _applyEach = function(eachfn, fns /*args...*/) {
    var go = function() {
        var that = this;
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        return eachfn(fns, function(fn, cb) {
            fn.apply(that, args.concat([cb]));
        },
            callback);
    };
    if (arguments.length > 2) {
        var args = Array.prototype.slice.call(arguments, 2);
        return go.apply(this, args);
    }
    else {
        return go;
    }
}
export var applyEach = doParallel(_applyEach);
export var applyEachSeries = doSeries(_applyEach);

export function forever(fn, callback) {
    function next(err?) {
        if (err) {
            if (callback) {
                return callback(err);
            }
            throw err;
        }
        fn(next);
    }
    next();
}
