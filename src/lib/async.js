"use strict";
function only_once(fn) {
    var called = false;
    return function () {
        if (called)
            throw new Error("Callback was already called.");
        called = true;
        fn.apply(this, arguments);
    };
}
var _toString = Object.prototype.toString;
var _isArray = Array.isArray || function (obj) {
    return _toString.call(obj) === '[object Array]';
};
var _each = function (arr, iterator) {
    if (arr.forEach) {
        return arr.forEach(iterator);
    }
    for (var i = 0; i < arr.length; i += 1) {
        iterator(arr[i], i, arr);
    }
};
var _map = function (arr, iterator) {
    if (arr.map) {
        return arr.map(iterator);
    }
    var results = [];
    _each(arr, function (x, i, a) {
        results.push(iterator(x, i, a));
    });
    return results;
};
var _reduce = function (arr, iterator, memo) {
    if (arr.reduce) {
        return arr.reduce(iterator, memo);
    }
    _each(arr, function (x, i, a) {
        memo = iterator(memo, x, i, a);
    });
    return memo;
};
var _keys = function (obj) {
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
export function nextTick(callback) {
    throw new Error("nextTick not implemented");
}
export function setImmediate(callback) {
    throw new Error("setImmediate not implemented");
}
export function each(arr, iterator, callback) {
    callback = callback || function () { };
    if (!arr.length) {
        return callback();
    }
    var completed = 0;
    _each(arr, function (x) {
        iterator(x, only_once(done));
    });
    function done(err) {
        if (err) {
            callback(err);
            callback = function () { };
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
    callback = callback || function () { };
    if (!arr.length) {
        return callback();
    }
    var completed = 0;
    var iterate = function () {
        iterator(arr[completed], function (err) {
            if (err) {
                callback(err);
                callback = function () { };
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
var _eachLimit = function (limit) {
    return function (arr, iterator, callback) {
        callback = callback || function () { };
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
                iterator(arr[started - 1], function (err) {
                    if (err) {
                        callback(err);
                        callback = function () { };
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
var doParallel = function (fn) {
    return function () {
        var args = Array.prototype.slice.call(arguments);
        return fn.apply(null, [each].concat(args));
    };
};
var doParallelLimit = function (limit, fn) {
    return function () {
        var args = Array.prototype.slice.call(arguments);
        return fn.apply(null, [_eachLimit(limit)].concat(args));
    };
};
var doSeries = function (fn) {
    return function () {
        var args = Array.prototype.slice.call(arguments);
        return fn.apply(null, [eachSeries].concat(args));
    };
};
var _asyncMap = function (eachfn, arr, iterator, callback) {
    arr = _map(arr, function (x, i) {
        return { index: i, value: x };
    });
    if (!callback) {
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (err) {
                callback(err);
            });
        });
    }
    else {
        var results = [];
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (err, v) {
                results[x.index] = v;
                callback(err);
            });
        }, function (err) {
            callback(err, results);
        });
    }
};
export var map = doParallel(_asyncMap);
export var mapSeries = doSeries(_asyncMap);
export function mapLimit(arr, limit, iterator, callback) {
    return _mapLimit(limit)(arr, iterator, callback);
}
var _mapLimit = function (limit) {
    return doParallelLimit(limit, _asyncMap);
};
export function reduce(arr, memo, iterator, callback) {
    eachSeries(arr, function (x, callback) {
        iterator(memo, x, function (err, v) {
            memo = v;
            callback(err);
        });
    }, function (err) {
        callback(err, memo);
    });
}
export var inject = reduce;
export var foldl = reduce;
export function reduceRight(arr, memo, iterator, callback) {
    var reversed = _map(arr, function (x) {
        return x;
    }).reverse();
    reduce(reversed, memo, iterator, callback);
}
export var foldr = reduceRight;
var _filter = function (eachfn, arr, iterator, callback) {
    var results = [];
    arr = _map(arr, function (x, i) {
        return { index: i, value: x };
    });
    eachfn(arr, function (x, callback) {
        iterator(x.value, function (v) {
            if (v) {
                results.push(x);
            }
            callback();
        });
    }, function (err) {
        callback(_map(results.sort(function (a, b) {
            return a.index - b.index;
        }), function (x) {
            return x.value;
        }));
    });
};
export var filter = doParallel(_filter);
export var filterSeries = doSeries(_filter);
export var select = filter;
export var selectSeries = filterSeries;
var _reject = function (eachfn, arr, iterator, callback) {
    var results = [];
    arr = _map(arr, function (x, i) {
        return { index: i, value: x };
    });
    eachfn(arr, function (x, callback) {
        iterator(x.value, function (v) {
            if (!v) {
                results.push(x);
            }
            callback();
        });
    }, function (err) {
        callback(_map(results.sort(function (a, b) {
            return a.index - b.index;
        }), function (x) {
            return x.value;
        }));
    });
};
export var reject = doParallel(_reject);
export var rejectSeries = doSeries(_reject);
var _detect = function (eachfn, arr, iterator, main_callback) {
    eachfn(arr, function (x, callback) {
        iterator(x, function (result) {
            if (result) {
                main_callback(x);
                main_callback = function () { };
            }
            else {
                callback();
            }
        });
    }, function (err) {
        main_callback();
    });
};
export var detect = doParallel(_detect);
export var detectSeries = doSeries(_detect);
export function some(arr, iterator, main_callback) {
    each(arr, function (x, callback) {
        iterator(x, function (v) {
            if (v) {
                main_callback(true);
                main_callback = function () { };
            }
            callback();
        });
    }, function (err) {
        main_callback(false);
    });
}
export var any = some;
export function every(arr, iterator, main_callback) {
    each(arr, function (x, callback) {
        iterator(x, function (v) {
            if (!v) {
                main_callback(false);
                main_callback = function () { };
            }
            callback();
        });
    }, function (err) {
        main_callback(true);
    });
}
export var all = every;
export function sortBy(arr, iterator, callback) {
    map(arr, function (x, callback) {
        iterator(x, function (err, criteria) {
            if (err) {
                callback(err);
            }
            else {
                callback(null, { value: x, criteria: criteria });
            }
        });
    }, function (err, results) {
        if (err) {
            return callback(err);
        }
        else {
            var fn = function (left, right) {
                var a = left.criteria, b = right.criteria;
                return a < b ? -1 : a > b ? 1 : 0;
            };
            callback(null, _map(results.sort(fn), function (x) {
                return x.value;
            }));
        }
    });
}
export function auto(tasks, callback) {
    callback = callback || function () { };
    var keys = _keys(tasks);
    var remainingTasks = keys.length;
    if (!remainingTasks) {
        return callback();
    }
    var results = {};
    var listeners = [];
    var addListener = function (fn) {
        listeners.unshift(fn);
    };
    var removeListener = function (fn) {
        for (var i = 0; i < listeners.length; i += 1) {
            if (listeners[i] === fn) {
                listeners.splice(i, 1);
                return;
            }
        }
    };
    var taskComplete = function () {
        remainingTasks--;
        _each(listeners.slice(0), function (fn) {
            fn();
        });
    };
    addListener(function () {
        if (!remainingTasks) {
            var theCallback = callback;
            callback = function () { };
            theCallback(null, results);
        }
    });
    _each(keys, function (k) {
        var task = _isArray(tasks[k]) ? tasks[k] : [tasks[k]];
        var taskCallback = function (err) {
            var args = Array.prototype.slice.call(arguments, 1);
            if (args.length <= 1) {
                args = args[0];
            }
            if (err) {
                var safeResults = {};
                _each(_keys(results), function (rkey) {
                    safeResults[rkey] = results[rkey];
                });
                safeResults[k] = args;
                callback(err, safeResults);
                callback = function () { };
            }
            else {
                results[k] = args;
                setImmediate(taskComplete);
            }
        };
        var requires = task.slice(0, Math.abs(task.length - 1)) || [];
        var ready = function () {
            return _reduce(requires, function (a, x) {
                return (a && results.hasOwnProperty(x));
            }, true) && !results.hasOwnProperty(k);
        };
        if (ready()) {
            task[task.length - 1](taskCallback, results);
        }
        else {
            var listener = function () {
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
    if (typeof times === 'function') {
        callback = task;
        task = times;
        times = DEFAULT_TIMES;
    }
    times = parseInt(times, 10) || DEFAULT_TIMES;
    var wrappedTask = function (wrappedCallback, wrappedResults) {
        var retryAttempt = function (task, finalAttempt) {
            return function (seriesCallback) {
                task(function (err, result) {
                    seriesCallback(!err || finalAttempt, { err: err, result: result });
                }, wrappedResults);
            };
        };
        while (times) {
            attempts.push(retryAttempt(task, !(times -= 1)));
        }
        series(attempts, function (done, data) {
            data = data[data.length - 1];
            (wrappedCallback || callback)(data.err, data.result);
        });
    };
    return callback ? wrappedTask() : wrappedTask;
}
export function waterfall(tasks, callback) {
    callback = callback || function () { };
    if (!_isArray(tasks)) {
        var err = new Error('First argument to waterfall must be an array of functions');
        return callback(err);
    }
    if (!tasks.length) {
        return callback();
    }
    var wrapIterator = function (iterator) {
        return function (err) {
            if (err) {
                callback.apply(null, arguments);
                callback = function () { };
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
                setImmediate(function () {
                    iterator.apply(null, args);
                });
            }
        };
    };
    wrapIterator(iterator(tasks))();
}
var _parallel = function (eachfn, tasks, callback) {
    callback = callback || function () { };
    if (_isArray(tasks)) {
        eachfn.map(tasks, function (fn, callback) {
            if (fn) {
                fn(function (err) {
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
        eachfn.each(_keys(tasks), function (k, callback) {
            tasks[k](function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length <= 1) {
                    args = args[0];
                }
                results[k] = args;
                callback(err);
            });
        }, function (err) {
            callback(err, results);
        });
    }
};
export function parallel(tasks, callback) {
    _parallel({ map: map, each: each }, tasks, callback);
}
export function parallelLimit(tasks, limit, callback) {
    _parallel({ map: _mapLimit(limit), each: _eachLimit(limit) }, tasks, callback);
}
export function series(tasks, callback) {
    callback = callback || function () { };
    if (_isArray(tasks)) {
        mapSeries(tasks, function (fn, callback) {
            if (fn) {
                fn(function (err) {
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
        eachSeries(_keys(tasks), function (k, callback) {
            tasks[k](function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length <= 1) {
                    args = args[0];
                }
                results[k] = args;
                callback(err);
            });
        }, function (err) {
            callback(err, results);
        });
    }
}
export function iterator(tasks) {
    var makeCallback = function (index) {
        var fn = function () {
            if (tasks.length) {
                tasks[index].apply(null, arguments);
            }
            return fn.next();
        };
        fn.next = function () {
            return (index < tasks.length - 1) ? makeCallback(index + 1) : null;
        };
        return fn;
    };
    return makeCallback(0);
}
export function apply(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return function () {
        return fn.apply(null, args.concat(Array.prototype.slice.call(arguments)));
    };
}
var _concat = function (eachfn, arr, fn, callback) {
    var r = [];
    eachfn(arr, function (x, cb) {
        fn(x, function (err, y) {
            r = r.concat(y || []);
            cb(err);
        });
    }, function (err) {
        callback(err, r);
    });
};
export var concat = doParallel(_concat);
export var concatSeries = doSeries(_concat);
export function whilst(test, iterator, callback) {
    if (test()) {
        iterator(function (err) {
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
    iterator(function (err) {
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
        iterator(function (err) {
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
    iterator(function (err) {
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
            return setImmediate(function () {
                if (q.drain) {
                    q.drain();
                }
            });
        }
        _each(data, function (task) {
            var item = {
                data: task,
                callback: typeof callback === 'function' ? callback : null
            };
            if (pos) {
                q.tasks.unshift(item);
            }
            else {
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
        push: function (data, callback) {
            _insert(q, data, false, callback);
        },
        kill: function () {
            q.drain = null;
            q.tasks = [];
        },
        unshift: function (data, callback) {
            _insert(q, data, true, callback);
        },
        process: function () {
            if (!q.paused && workers < q.concurrency && q.tasks.length) {
                var task = q.tasks.shift();
                if (q.empty && q.tasks.length === 0) {
                    q.empty();
                }
                workers += 1;
                var next = function () {
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
        length: function () {
            return q.tasks.length;
        },
        running: function () {
            return workers;
        },
        idle: function () {
            return q.tasks.length + workers === 0;
        },
        pause: function () {
            if (q.paused === true) {
                return;
            }
            q.paused = true;
            q.process();
        },
        resume: function () {
            if (q.paused === false) {
                return;
            }
            q.paused = false;
            q.process();
        }
    };
    return q;
}
export function priorityQueue(worker, concurrency) {
    function _compareTasks(a, b) {
        return a.priority - b.priority;
    }
    ;
    function _binarySearch(sequence, item, compare) {
        var beg = -1, end = sequence.length - 1;
        while (beg < end) {
            var mid = beg + ((end - beg + 1) >>> 1);
            if (compare(item, sequence[mid]) >= 0) {
                beg = mid;
            }
            else {
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
            return setImmediate(function () {
                if (q.drain) {
                    q.drain();
                }
            });
        }
        _each(data, function (task) {
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
    var q = queue(worker, concurrency);
    q.push = function (data, priority, callback) {
        _insert(q, data, priority, callback);
    };
    delete q.unshift;
    return q;
}
export function cargo(worker, payload) {
    var working = false, tasks = [];
    var cargo = {
        tasks: tasks,
        payload: payload,
        saturated: null,
        empty: null,
        drain: null,
        drained: true,
        push: function (data, callback) {
            if (!_isArray(data)) {
                data = [data];
            }
            _each(data, function (task) {
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
            if (working)
                return;
            if (tasks.length === 0) {
                if (cargo.drain && !cargo.drained)
                    cargo.drain();
                cargo.drained = true;
                return;
            }
            var ts = typeof payload === 'number'
                ? tasks.splice(0, payload)
                : tasks.splice(0, tasks.length);
            var ds = _map(ts, function (task) {
                return task.data;
            });
            if (cargo.empty)
                cargo.empty();
            working = true;
            worker(ds, function () {
                working = false;
                var args = arguments;
                _each(ts, function (data) {
                    if (data.callback) {
                        data.callback.apply(null, args);
                    }
                });
                process();
            });
        },
        length: function () {
            return tasks.length;
        },
        running: function () {
            return working;
        }
    };
    return cargo;
}
var _console_fn = function (name) {
    return function (fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        fn.apply(null, args.concat([function (err) {
                var args = Array.prototype.slice.call(arguments, 1);
                if (typeof console !== 'undefined') {
                    if (err) {
                        if (console.error) {
                            console.error(err);
                        }
                    }
                    else if (console[name]) {
                        _each(args, function (x) {
                            console[name](x);
                        });
                    }
                }
            }]));
    };
};
export var log = _console_fn('log');
export var dir = _console_fn('dir');
export function memoize(fn, hasher) {
    var memo = {};
    var queues = {};
    hasher = hasher || function (x) {
        return x;
    };
    var memoized = function () {
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        var key = hasher.apply(null, args);
        if (key in memo) {
            nextTick(function () {
                callback.apply(null, memo[key]);
            });
        }
        else if (key in queues) {
            queues[key].push(callback);
        }
        else {
            queues[key] = [callback];
            fn.apply(null, args.concat([function () {
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
    return function () {
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
export function seq() {
    var fns = arguments;
    return function () {
        var that = this;
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        reduce(fns, args, function (newargs, fn, cb) {
            fn.apply(that, newargs.concat([function () {
                    var err = arguments[0];
                    var nextargs = Array.prototype.slice.call(arguments, 1);
                    cb(err, nextargs);
                }]));
        }, function (err, results) {
            callback.apply(that, [err].concat(results));
        });
    };
}
export function compose() {
    return seq.apply(null, Array.prototype.reverse.call(arguments));
}
var _applyEach = function (eachfn, fns) {
    var go = function () {
        var that = this;
        var args = Array.prototype.slice.call(arguments);
        var callback = args.pop();
        return eachfn(fns, function (fn, cb) {
            fn.apply(that, args.concat([cb]));
        }, callback);
    };
    if (arguments.length > 2) {
        var args = Array.prototype.slice.call(arguments, 2);
        return go.apply(this, args);
    }
    else {
        return go;
    }
};
export var applyEach = doParallel(_applyEach);
export var applyEachSeries = doSeries(_applyEach);
export function forever(fn, callback) {
    function next(err) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXN5bmMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhc3luYy50cyJdLCJuYW1lcyI6WyJvbmx5X29uY2UiLCJuZXh0VGljayIsInNldEltbWVkaWF0ZSIsImVhY2giLCJlYWNoLmRvbmUiLCJlYWNoU2VyaWVzIiwiZWFjaExpbWl0IiwicmVwbGVuaXNoIiwibWFwTGltaXQiLCJyZWR1Y2UiLCJyZWR1Y2VSaWdodCIsInNvbWUiLCJldmVyeSIsInNvcnRCeSIsImF1dG8iLCJyZXRyeSIsIndhdGVyZmFsbCIsInBhcmFsbGVsIiwicGFyYWxsZWxMaW1pdCIsInNlcmllcyIsIml0ZXJhdG9yIiwiYXBwbHkiLCJ3aGlsc3QiLCJkb1doaWxzdCIsInVudGlsIiwiZG9VbnRpbCIsInF1ZXVlIiwicXVldWUuX2luc2VydCIsInByaW9yaXR5UXVldWUiLCJwcmlvcml0eVF1ZXVlLl9jb21wYXJlVGFza3MiLCJwcmlvcml0eVF1ZXVlLl9iaW5hcnlTZWFyY2giLCJwcmlvcml0eVF1ZXVlLl9pbnNlcnQiLCJjYXJnbyIsImNhcmdvLnByb2Nlc3MiLCJtZW1vaXplIiwidW5tZW1vaXplIiwidGltZXMiLCJ0aW1lc1NlcmllcyIsInNlcSIsImNvbXBvc2UiLCJmb3JldmVyIiwiZm9yZXZlci5uZXh0Il0sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFRYixtQkFBbUIsRUFBaUI7SUFDaENBLElBQUlBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBO0lBQ2ZBLE1BQU1BLENBQUNBO1FBQ1AsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDO1lBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBQzVELE1BQU0sR0FBRyxJQUFJLENBQUM7UUFFZCxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztJQUM5QixDQUFDLENBQUFBO0FBQ0xBLENBQUNBO0FBSUQsSUFBSSxTQUFTLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUM7QUFFMUMsSUFBSSxRQUFRLEdBQUcsS0FBSyxDQUFDLE9BQU8sSUFBSSxVQUFTLEdBQUc7SUFDeEMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssZ0JBQWdCLENBQUM7QUFDcEQsQ0FBQyxDQUFDO0FBRUYsSUFBSSxLQUFLLEdBQUcsVUFBUyxHQUFHLEVBQUUsUUFBUTtJQUM5QixFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNkLE1BQU0sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFDRCxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDckMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDN0IsQ0FBQztBQUNMLENBQUMsQ0FBQztBQUVGLElBQUksSUFBSSxHQUFHLFVBQVMsR0FBRyxFQUFFLFFBQVE7SUFDN0IsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDVixNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM3QixDQUFDO0lBQ0QsSUFBSSxPQUFPLEdBQUcsRUFBRSxDQUFDO0lBQ2pCLEtBQUssQ0FBQyxHQUFHLEVBQUUsVUFBUyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDdkIsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BDLENBQUMsQ0FBQyxDQUFDO0lBQ0gsTUFBTSxDQUFDLE9BQU8sQ0FBQztBQUNuQixDQUFDLENBQUM7QUFFRixJQUFJLE9BQU8sR0FBRyxVQUFTLEdBQUcsRUFBRSxRQUFRLEVBQUUsSUFBSTtJQUN0QyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNiLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBQ0QsS0FBSyxDQUFDLEdBQUcsRUFBRSxVQUFTLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUN2QixJQUFJLEdBQUcsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ25DLENBQUMsQ0FBQyxDQUFDO0lBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQztBQUNoQixDQUFDLENBQUM7QUFFRixJQUFJLEtBQUssR0FBRyxVQUFTLEdBQUc7SUFDcEIsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBQ0QsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBQ2QsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2hCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakIsQ0FBQztJQUNMLENBQUM7SUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDO0FBQ2hCLENBQUMsQ0FBQztBQUtGLHlCQUF5QixRQUFhO0lBQ2xDQyxNQUFNQSxJQUFJQSxLQUFLQSxDQUFDQSwwQkFBMEJBLENBQUNBLENBQUNBO0FBQ2hEQSxDQUFDQTtBQUVELDZCQUE2QixRQUFhO0lBQ3RDQyxNQUFNQSxJQUFJQSxLQUFLQSxDQUFDQSw4QkFBOEJBLENBQUNBLENBQUNBO0FBQ3BEQSxDQUFDQTtBQStCRCxxQkFBcUIsR0FBRyxFQUFFLFFBQVEsRUFBRSxRQUFRO0lBQ3hDQyxRQUFRQSxHQUFHQSxRQUFRQSxJQUFJQSxjQUFhLENBQUMsQ0FBQ0E7SUFDdENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1FBQ2RBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO0lBQ3RCQSxDQUFDQTtJQUNEQSxJQUFJQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNsQkEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsVUFBU0EsQ0FBQ0E7UUFDakIsUUFBUSxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUNqQyxDQUFDLENBQUNBLENBQUNBO0lBQ0hBLGNBQWNBLEdBQUdBO1FBQ2JDLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ05BLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2RBLFFBQVFBLEdBQUdBLGNBQWEsQ0FBQyxDQUFDQTtRQUM5QkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsU0FBU0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDZkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsSUFBSUEsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzFCQSxRQUFRQSxFQUFFQSxDQUFDQTtZQUNmQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtBQUNMRCxDQUFDQTtBQUNELFdBQVcsT0FBTyxHQUFHLElBQUksQ0FBQztBQUUxQiwyQkFBMkIsR0FBRyxFQUFFLFFBQVEsRUFBRSxRQUFRO0lBQzlDRSxRQUFRQSxHQUFHQSxRQUFRQSxJQUFJQSxjQUFhLENBQUMsQ0FBQ0E7SUFDdENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1FBQ2RBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO0lBQ3RCQSxDQUFDQTtJQUNEQSxJQUFJQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNsQkEsSUFBSUEsT0FBT0EsR0FBR0E7UUFDVixRQUFRLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLFVBQVMsR0FBRztZQUNqQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNOLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDZCxRQUFRLEdBQUcsY0FBYSxDQUFDLENBQUM7WUFDOUIsQ0FBQztZQUNELElBQUksQ0FBQyxDQUFDO2dCQUNGLFNBQVMsSUFBSSxDQUFDLENBQUM7Z0JBQ2YsRUFBRSxDQUFDLENBQUMsU0FBUyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUMxQixRQUFRLEVBQUUsQ0FBQztnQkFDZixDQUFDO2dCQUNELElBQUksQ0FBQyxDQUFDO29CQUNGLE9BQU8sRUFBRSxDQUFDO2dCQUNkLENBQUM7WUFDTCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDLENBQUNBO0lBQ0ZBLE9BQU9BLEVBQUVBLENBQUNBO0FBQ2RBLENBQUNBO0FBQ0QsV0FBVyxhQUFhLEdBQUcsVUFBVSxDQUFDO0FBRXRDLDBCQUEwQixHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxRQUFRO0lBQ3BEQyxJQUFJQSxFQUFFQSxHQUFHQSxVQUFVQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtJQUMzQkEsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7QUFDOUNBLENBQUNBO0FBQ0QsV0FBVyxZQUFZLEdBQUcsU0FBUyxDQUFDO0FBRXBDLElBQUksVUFBVSxHQUFHLFVBQVMsS0FBSztJQUUzQixNQUFNLENBQUMsVUFBUyxHQUFHLEVBQUUsUUFBUSxFQUFFLFFBQVE7UUFDbkMsUUFBUSxHQUFHLFFBQVEsSUFBSSxjQUFhLENBQUMsQ0FBQztRQUN0QyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDNUIsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3RCLENBQUM7UUFDRCxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFDbEIsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2hCLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQztRQUVoQixDQUFDO1lBQ0dDLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLElBQUlBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQkEsTUFBTUEsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7WUFDdEJBLENBQUNBO1lBRURBLE9BQU9BLE9BQU9BLEdBQUdBLEtBQUtBLElBQUlBLE9BQU9BLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO2dCQUM3Q0EsT0FBT0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ2JBLE9BQU9BLElBQUlBLENBQUNBLENBQUNBO2dCQUNiQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxVQUFTQSxHQUFHQTtvQkFDbkMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQzt3QkFDTixRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7d0JBQ2QsUUFBUSxHQUFHLGNBQWEsQ0FBQyxDQUFDO29CQUM5QixDQUFDO29CQUNELElBQUksQ0FBQyxDQUFDO3dCQUNGLFNBQVMsSUFBSSxDQUFDLENBQUM7d0JBQ2YsT0FBTyxJQUFJLENBQUMsQ0FBQzt3QkFDYixFQUFFLENBQUMsQ0FBQyxTQUFTLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7NEJBQzFCLFFBQVEsRUFBRSxDQUFDO3dCQUNmLENBQUM7d0JBQ0QsSUFBSSxDQUFDLENBQUM7NEJBQ0YsU0FBUyxFQUFFLENBQUM7d0JBQ2hCLENBQUM7b0JBQ0wsQ0FBQztnQkFDTCxDQUFDLENBQUNBLENBQUNBO1lBQ1BBLENBQUNBO1FBQ0xBLENBQUNBLENBQUMsRUFBRSxDQUFDO0lBQ1QsQ0FBQyxDQUFDO0FBQ04sQ0FBQyxDQUFDO0FBR0YsSUFBSSxVQUFVLEdBQUcsVUFBUyxFQUFFO0lBQ3hCLE1BQU0sQ0FBQztRQUNILElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUMvQyxDQUFDLENBQUM7QUFDTixDQUFDLENBQUM7QUFDRixJQUFJLGVBQWUsR0FBRyxVQUFTLEtBQUssRUFBRSxFQUFFO0lBQ3BDLE1BQU0sQ0FBQztRQUNILElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUM1RCxDQUFDLENBQUM7QUFDTixDQUFDLENBQUM7QUFDRixJQUFJLFFBQVEsR0FBRyxVQUFTLEVBQUU7SUFDdEIsTUFBTSxDQUFDO1FBQ0gsSUFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3JELENBQUMsQ0FBQztBQUNOLENBQUMsQ0FBQztBQUdGLElBQUksU0FBUyxHQUFHLFVBQVMsTUFBTSxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsUUFBUTtJQUNwRCxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxVQUFTLENBQUMsRUFBRSxDQUFDO1FBQ3pCLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDO0lBQ2xDLENBQUMsQ0FBQyxDQUFDO0lBQ0gsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ1osTUFBTSxDQUFDLEdBQUcsRUFBRSxVQUFTLENBQUMsRUFBRSxRQUFRO1lBQzVCLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLFVBQVMsR0FBRztnQkFDMUIsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2xCLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDSixJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDakIsTUFBTSxDQUFDLEdBQUcsRUFBRSxVQUFTLENBQUMsRUFBRSxRQUFRO1lBQzVCLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLFVBQVMsR0FBRyxFQUFFLENBQUM7Z0JBQzdCLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNyQixRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbEIsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLEVBQUUsVUFBUyxHQUFHO1lBQ1AsUUFBUSxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMzQixDQUFDLENBQUMsQ0FBQztJQUNYLENBQUM7QUFDTCxDQUFDLENBQUM7QUFDRixXQUFXLEdBQUcsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDdkMsV0FBVyxTQUFTLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQzNDLHlCQUF5QixHQUFHLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxRQUFTO0lBQ3BEQyxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxRQUFRQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtBQUNyREEsQ0FBQ0E7QUFFRCxJQUFJLFNBQVMsR0FBRyxVQUFTLEtBQUs7SUFDMUIsTUFBTSxDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFDN0MsQ0FBQyxDQUFDO0FBSUYsdUJBQXVCLEdBQUcsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVE7SUFDaERDLFVBQVVBLENBQUNBLEdBQUdBLEVBQUVBLFVBQVNBLENBQUNBLEVBQUVBLFFBQVFBO1FBQ2hDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLFVBQVMsR0FBRyxFQUFFLENBQUM7WUFDN0IsSUFBSSxHQUFHLENBQUMsQ0FBQztZQUNULFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUMsRUFBRUEsVUFBU0EsR0FBR0E7UUFDUCxRQUFRLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3hCLENBQUMsQ0FBQ0EsQ0FBQ0E7QUFDWEEsQ0FBQ0E7QUFFRCxXQUFXLE1BQU0sR0FBRyxNQUFNLENBQUM7QUFFM0IsV0FBVyxLQUFLLEdBQUcsTUFBTSxDQUFDO0FBRTFCLDRCQUE0QixHQUFHLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRO0lBQ3JEQyxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxVQUFTQSxDQUFDQTtRQUMvQixNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQ2IsQ0FBQyxDQUFDQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQTtJQUNiQSxNQUFNQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxFQUFFQSxRQUFRQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtBQUMvQ0EsQ0FBQ0E7QUFFRCxXQUFXLEtBQUssR0FBRyxXQUFXLENBQUM7QUFFL0IsSUFBSSxPQUFPLEdBQUcsVUFBUyxNQUFNLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxRQUFRO0lBQ2xELElBQUksT0FBTyxHQUFHLEVBQUUsQ0FBQztJQUNqQixHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxVQUFTLENBQUMsRUFBRSxDQUFDO1FBQ3pCLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDO0lBQ2xDLENBQUMsQ0FBQyxDQUFDO0lBQ0gsTUFBTSxDQUFDLEdBQUcsRUFBRSxVQUFTLENBQUMsRUFBRSxRQUFRO1FBQzVCLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLFVBQVMsQ0FBQztZQUN4QixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNKLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEIsQ0FBQztZQUNELFFBQVEsRUFBRSxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDLEVBQUUsVUFBUyxHQUFHO1FBQ1AsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVMsQ0FBQyxFQUFFLENBQUM7WUFDcEMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUM3QixDQUFDLENBQUMsRUFBRSxVQUFTLENBQUM7WUFDTixNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUNuQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ1osQ0FBQyxDQUFDLENBQUM7QUFDWCxDQUFDLENBQUE7QUFDRCxXQUFXLE1BQU0sR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDeEMsV0FBVyxZQUFZLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBRTVDLFdBQVcsTUFBTSxHQUFHLE1BQU0sQ0FBQztBQUMzQixXQUFXLFlBQVksR0FBRyxZQUFZLENBQUM7QUFFdkMsSUFBSSxPQUFPLEdBQUcsVUFBUyxNQUFNLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxRQUFRO0lBQ2xELElBQUksT0FBTyxHQUFHLEVBQUUsQ0FBQztJQUNqQixHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxVQUFTLENBQUMsRUFBRSxDQUFDO1FBQ3pCLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDO0lBQ2xDLENBQUMsQ0FBQyxDQUFDO0lBQ0gsTUFBTSxDQUFDLEdBQUcsRUFBRSxVQUFTLENBQUMsRUFBRSxRQUFRO1FBQzVCLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLFVBQVMsQ0FBQztZQUN4QixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ0wsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwQixDQUFDO1lBQ0QsUUFBUSxFQUFFLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUMsRUFBRSxVQUFTLEdBQUc7UUFDUCxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBUyxDQUFDLEVBQUUsQ0FBQztZQUNwQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDO1FBQzdCLENBQUMsQ0FBQyxFQUFFLFVBQVMsQ0FBQztZQUNOLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO1FBQ25CLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDWixDQUFDLENBQUMsQ0FBQztBQUNYLENBQUMsQ0FBQTtBQUNELFdBQVcsTUFBTSxHQUFHLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUN4QyxXQUFXLFlBQVksR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7QUFFNUMsSUFBSSxPQUFPLEdBQUcsVUFBUyxNQUFNLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxhQUFhO0lBQ3ZELE1BQU0sQ0FBQyxHQUFHLEVBQUUsVUFBUyxDQUFDLEVBQUUsUUFBUTtRQUM1QixRQUFRLENBQUMsQ0FBQyxFQUFFLFVBQVMsTUFBTTtZQUN2QixFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNULGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDakIsYUFBYSxHQUFHLGNBQWEsQ0FBQyxDQUFDO1lBQ25DLENBQUM7WUFDRCxJQUFJLENBQUMsQ0FBQztnQkFDRixRQUFRLEVBQUUsQ0FBQztZQUNmLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUMsRUFBRSxVQUFTLEdBQUc7UUFDUCxhQUFhLEVBQUUsQ0FBQztJQUNwQixDQUFDLENBQUMsQ0FBQztBQUNYLENBQUMsQ0FBQTtBQUNELFdBQVcsTUFBTSxHQUFHLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUN4QyxXQUFXLFlBQVksR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7QUFFNUMscUJBQXFCLEdBQUcsRUFBRSxRQUFRLEVBQUUsYUFBYTtJQUM3Q0MsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsVUFBU0EsQ0FBQ0EsRUFBRUEsUUFBUUE7UUFDMUIsUUFBUSxDQUFDLENBQUMsRUFBRSxVQUFTLENBQUM7WUFDbEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDSixhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3BCLGFBQWEsR0FBRyxjQUFhLENBQUMsQ0FBQztZQUNuQyxDQUFDO1lBQ0QsUUFBUSxFQUFFLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUMsRUFBRUEsVUFBU0EsR0FBR0E7UUFDUCxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDekIsQ0FBQyxDQUFDQSxDQUFDQTtBQUNYQSxDQUFDQTtBQUVELFdBQVcsR0FBRyxHQUFHLElBQUksQ0FBQztBQUV0QixzQkFBc0IsR0FBRyxFQUFFLFFBQVEsRUFBRSxhQUFhO0lBQzlDQyxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxVQUFTQSxDQUFDQSxFQUFFQSxRQUFRQTtRQUMxQixRQUFRLENBQUMsQ0FBQyxFQUFFLFVBQVMsQ0FBQztZQUNsQixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ0wsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNyQixhQUFhLEdBQUcsY0FBYSxDQUFDLENBQUM7WUFDbkMsQ0FBQztZQUNELFFBQVEsRUFBRSxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDLEVBQUVBLFVBQVNBLEdBQUdBO1FBQ1AsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3hCLENBQUMsQ0FBQ0EsQ0FBQ0E7QUFDWEEsQ0FBQ0E7QUFFRCxXQUFXLEdBQUcsR0FBRyxLQUFLLENBQUM7QUFFdkIsdUJBQXVCLEdBQUcsRUFBRSxRQUFRLEVBQUUsUUFBUTtJQUMxQ0MsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsVUFBU0EsQ0FBQ0EsRUFBRUEsUUFBUUE7UUFDekIsUUFBUSxDQUFDLENBQUMsRUFBRSxVQUFTLEdBQUcsRUFBRSxRQUFRO1lBQzlCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ04sUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2xCLENBQUM7WUFDRCxJQUFJLENBQUMsQ0FBQztnQkFDRixRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUNyRCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDLEVBQUVBLFVBQVNBLEdBQUdBLEVBQUVBLE9BQU9BO1FBQ2hCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDTixNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3pCLENBQUM7UUFDRCxJQUFJLENBQUMsQ0FBQztZQUNGLElBQUksRUFBRSxHQUFHLFVBQVMsSUFBSSxFQUFFLEtBQUs7Z0JBQ3pCLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7Z0JBQzFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN0QyxDQUFDLENBQUM7WUFDRixRQUFRLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLFVBQVMsQ0FBQztnQkFDNUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7WUFDbkIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNSLENBQUM7SUFDTCxDQUFDLENBQUNBLENBQUNBO0FBQ1hBLENBQUNBO0FBRUQscUJBQXFCLEtBQUssRUFBRSxRQUFRO0lBQ2hDQyxRQUFRQSxHQUFHQSxRQUFRQSxJQUFJQSxjQUFhLENBQUMsQ0FBQ0E7SUFDdENBLElBQUlBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO0lBQ3hCQSxJQUFJQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFBQTtJQUM1QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdEJBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO0lBQ3RCQSxDQUFDQTtJQUVEQSxJQUFJQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUVqQkEsSUFBSUEsU0FBU0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDbkJBLElBQUlBLFdBQVdBLEdBQUdBLFVBQVNBLEVBQUVBO1FBQ3pCLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDMUIsQ0FBQyxDQUFDQTtJQUNGQSxJQUFJQSxjQUFjQSxHQUFHQSxVQUFTQSxFQUFFQTtRQUM1QixHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDM0MsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RCLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixNQUFNLENBQUM7WUFDWCxDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUMsQ0FBQ0E7SUFDRkEsSUFBSUEsWUFBWUEsR0FBR0E7UUFDZixjQUFjLEVBQUUsQ0FBQTtRQUNaLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLFVBQVMsRUFBRTtZQUNyQyxFQUFFLEVBQUUsQ0FBQztRQUNULENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDQTtJQUVGQSxXQUFXQSxDQUFDQTtRQUNSLEVBQUUsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztZQUNsQixJQUFJLFdBQVcsR0FBRyxRQUFRLENBQUM7WUFFM0IsUUFBUSxHQUFHLGNBQWEsQ0FBQyxDQUFDO1lBRTFCLFdBQVcsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDL0IsQ0FBQztJQUNMLENBQUMsQ0FBQ0EsQ0FBQ0E7SUFFSEEsS0FBS0EsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBU0EsQ0FBQ0E7UUFDbEIsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RELElBQUksWUFBWSxHQUFHLFVBQVMsR0FBRztZQUMzQixJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3BELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbkIsSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNuQixDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDTixJQUFJLFdBQVcsR0FBRyxFQUFFLENBQUM7Z0JBQ3JCLEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsVUFBUyxJQUFJO29CQUMvQixXQUFXLENBQUMsSUFBSSxDQUFDLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN0QyxDQUFDLENBQUMsQ0FBQztnQkFDSCxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDO2dCQUN0QixRQUFRLENBQUMsR0FBRyxFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUUzQixRQUFRLEdBQUcsY0FBYSxDQUFDLENBQUM7WUFDOUIsQ0FBQztZQUNELElBQUksQ0FBQyxDQUFDO2dCQUNGLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUM7Z0JBQ2xCLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMvQixDQUFDO1FBQ0wsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzlELElBQUksS0FBSyxHQUFHO1lBQ1IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsVUFBUyxDQUFDLEVBQUUsQ0FBQztnQkFDbEMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1QyxDQUFDLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNDLENBQUMsQ0FBQztRQUNGLEVBQUUsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNWLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLFlBQVksRUFBRSxPQUFPLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBQ0QsSUFBSSxDQUFDLENBQUM7WUFDRixJQUFJLFFBQVEsR0FBRztnQkFDWCxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ1YsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxZQUFZLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ2pELENBQUM7WUFDTCxDQUFDLENBQUM7WUFDRixXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDMUIsQ0FBQztJQUNMLENBQUMsQ0FBQ0EsQ0FBQ0E7QUFDUEEsQ0FBQ0E7QUFFRCxzQkFBc0IsS0FBSyxFQUFFLElBQUksRUFBRSxRQUFRO0lBQ3ZDQyxJQUFJQSxhQUFhQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUN0QkEsSUFBSUEsUUFBUUEsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFFbEJBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEtBQUtBLEtBQUtBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1FBQzlCQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNoQkEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDYkEsS0FBS0EsR0FBR0EsYUFBYUEsQ0FBQ0E7SUFDMUJBLENBQUNBO0lBRURBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLEVBQUVBLEVBQUVBLENBQUNBLElBQUlBLGFBQWFBLENBQUNBO0lBQzdDQSxJQUFJQSxXQUFXQSxHQUFHQSxVQUFTQSxlQUFnQkEsRUFBRUEsY0FBZUE7UUFDeEQsSUFBSSxZQUFZLEdBQUcsVUFBUyxJQUFJLEVBQUUsWUFBWTtZQUMxQyxNQUFNLENBQUMsVUFBUyxjQUFjO2dCQUMxQixJQUFJLENBQUMsVUFBUyxHQUFHLEVBQUUsTUFBTTtvQkFDckIsY0FBYyxDQUFDLENBQUMsR0FBRyxJQUFJLFlBQVksRUFBRSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7Z0JBQ3ZFLENBQUMsRUFBRSxjQUFjLENBQUMsQ0FBQztZQUN2QixDQUFDLENBQUM7UUFDTixDQUFDLENBQUM7UUFDRixPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ1gsUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JELENBQUM7UUFDRCxNQUFNLENBQUMsUUFBUSxFQUFFLFVBQVMsSUFBSSxFQUFFLElBQUk7WUFDaEMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzdCLENBQUMsZUFBZSxJQUFJLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3pELENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFBQTtJQUVHQSxNQUFNQSxDQUFDQSxRQUFRQSxHQUFHQSxXQUFXQSxFQUFFQSxHQUFHQSxXQUFXQSxDQUFBQTtBQUNyREEsQ0FBQ0E7QUFFRCwwQkFBMEIsS0FBSyxFQUFFLFFBQVE7SUFDckNDLFFBQVFBLEdBQUdBLFFBQVFBLElBQUlBLGNBQWEsQ0FBQyxDQUFDQTtJQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbkJBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLDJEQUEyREEsQ0FBQ0EsQ0FBQ0E7UUFDakZBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO0lBQ3pCQSxDQUFDQTtJQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNoQkEsTUFBTUEsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7SUFDdEJBLENBQUNBO0lBQ0RBLElBQUlBLFlBQVlBLEdBQUdBLFVBQVNBLFFBQWFBO1FBQ3JDLE1BQU0sQ0FBQyxVQUFTLEdBQUc7WUFDZixFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNOLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUNoQyxRQUFRLEdBQUcsY0FBYSxDQUFDLENBQUM7WUFDOUIsQ0FBQztZQUNELElBQUksQ0FBQyxDQUFDO2dCQUNGLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BELElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDM0IsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDUCxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUNsQyxDQUFDO2dCQUNELElBQUksQ0FBQyxDQUFDO29CQUNGLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3hCLENBQUM7Z0JBQ0QsWUFBWSxDQUFDO29CQUNULFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUMvQixDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7UUFDTCxDQUFDLENBQUM7SUFDTixDQUFDLENBQUNBO0lBQ0ZBLFlBQVlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBO0FBQ3BDQSxDQUFDQTtBQUVELElBQUksU0FBUyxHQUFHLFVBQVMsTUFBTSxFQUFFLEtBQUssRUFBRSxRQUFRO0lBQzVDLFFBQVEsR0FBRyxRQUFRLElBQUksY0FBYSxDQUFDLENBQUM7SUFDdEMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsQixNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxVQUFTLEVBQUUsRUFBRSxRQUFRO1lBQ25DLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ0wsRUFBRSxDQUFDLFVBQVMsR0FBRztvQkFDWCxJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUNwRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ25CLElBQUksR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ25CLENBQUM7b0JBQ0QsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUNuQyxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7UUFDTCxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDakIsQ0FBQztJQUNELElBQUksQ0FBQyxDQUFDO1FBQ0YsSUFBSSxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBQ2pCLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLFVBQVMsQ0FBQyxFQUFFLFFBQVE7WUFDMUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVMsR0FBRztnQkFDakIsSUFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDcEQsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNuQixJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNuQixDQUFDO2dCQUNELE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUM7Z0JBQ2xCLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNsQixDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsRUFBRSxVQUFTLEdBQUc7WUFDUCxRQUFRLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzNCLENBQUMsQ0FBQyxDQUFDO0lBQ1gsQ0FBQztBQUNMLENBQUMsQ0FBQTtBQUVELHlCQUF5QixLQUFZLEVBQUUsUUFBK0I7SUFDbEVDLFNBQVNBLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLEVBQUVBLEtBQUtBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO0FBQ3pEQSxDQUFDQTtBQUVELDhCQUE4QixLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVE7SUFDaERDLFNBQVNBLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLEtBQUtBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO0FBQ25GQSxDQUFDQTtBQUVELHVCQUF1QixLQUFLLEVBQUUsUUFBUTtJQUNsQ0MsUUFBUUEsR0FBR0EsUUFBUUEsSUFBSUEsY0FBYSxDQUFDLENBQUNBO0lBQ3RDQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNsQkEsU0FBU0EsQ0FBQ0EsS0FBS0EsRUFBRUEsVUFBU0EsRUFBRUEsRUFBRUEsUUFBUUE7WUFDbEMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDTCxFQUFFLENBQUMsVUFBUyxHQUFHO29CQUNYLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ3BELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDbkIsSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbkIsQ0FBQztvQkFDRCxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ25DLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztRQUNMLENBQUMsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBQ0ZBLElBQUlBLE9BQU9BLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2pCQSxVQUFVQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxVQUFTQSxDQUFDQSxFQUFFQSxRQUFRQTtZQUN6QyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBUyxHQUFHO2dCQUNqQixJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNwRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ25CLElBQUksR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ25CLENBQUM7Z0JBQ0QsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQztnQkFDbEIsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2xCLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxFQUFFQSxVQUFTQSxHQUFHQTtZQUNQLFFBQVEsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDM0IsQ0FBQyxDQUFDQSxDQUFDQTtJQUNYQSxDQUFDQTtBQUNMQSxDQUFDQTtBQUVELHlCQUF5QixLQUFLO0lBQzFCQyxJQUFJQSxZQUFZQSxHQUFHQSxVQUFTQSxLQUFLQTtRQUM3QixJQUFJLEVBQUUsR0FBUTtZQUNWLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNmLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3hDLENBQUM7WUFDRCxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3JCLENBQUMsQ0FBQztRQUNGLEVBQUUsQ0FBQyxJQUFJLEdBQUc7WUFDTixNQUFNLENBQUMsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxZQUFZLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQztRQUN2RSxDQUFDLENBQUM7UUFDRixNQUFNLENBQUMsRUFBRSxDQUFDO0lBQ2QsQ0FBQyxDQUFDQTtJQUNGQSxNQUFNQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtBQUMzQkEsQ0FBQ0E7QUFFRCxzQkFBc0IsRUFBRTtJQUNwQkMsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDcERBLE1BQU1BLENBQUNBO1FBQ0gsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQ1gsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQ3ZELENBQUM7SUFDVixDQUFDLENBQUNBO0FBQ05BLENBQUNBO0FBRUQsSUFBSSxPQUFPLEdBQUcsVUFBUyxNQUFNLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxRQUFRO0lBQzVDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNYLE1BQU0sQ0FBQyxHQUFHLEVBQUUsVUFBUyxDQUFDLEVBQUUsRUFBRTtRQUN0QixFQUFFLENBQUMsQ0FBQyxFQUFFLFVBQVMsR0FBRyxFQUFFLENBQUM7WUFDakIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ3RCLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNaLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxFQUFFLFVBQVMsR0FBRztRQUNQLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDckIsQ0FBQyxDQUFDLENBQUM7QUFDWCxDQUFDLENBQUM7QUFDRixXQUFXLE1BQU0sR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDeEMsV0FBVyxZQUFZLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBRTVDLHVCQUF1QixJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVE7SUFDM0NDLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ1RBLFFBQVFBLENBQUNBLFVBQVNBLEdBQUdBO1lBQ2pCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ04sTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN6QixDQUFDO1lBQ0QsTUFBTSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDckMsQ0FBQyxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNGQSxRQUFRQSxFQUFFQSxDQUFDQTtJQUNmQSxDQUFDQTtBQUNMQSxDQUFDQTtBQUVELHlCQUF5QixRQUFRLEVBQUUsSUFBSSxFQUFFLFFBQVE7SUFDN0NDLFFBQVFBLENBQUNBLFVBQVNBLEdBQUdBO1FBQ2pCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDTixNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3pCLENBQUM7UUFDRCxJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6QixRQUFRLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN2QyxDQUFDO1FBQ0QsSUFBSSxDQUFDLENBQUM7WUFDRixRQUFRLEVBQUUsQ0FBQztRQUNmLENBQUM7SUFDTCxDQUFDLENBQUNBLENBQUNBO0FBQ1BBLENBQUNBO0FBRUQsc0JBQXNCLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUTtJQUMxQ0MsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDVkEsUUFBUUEsQ0FBQ0EsVUFBU0EsR0FBR0E7WUFDakIsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDTixNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3pCLENBQUM7WUFDRCxLQUFLLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNwQyxDQUFDLENBQUNBLENBQUNBO0lBQ1BBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBQ0ZBLFFBQVFBLEVBQUVBLENBQUNBO0lBQ2ZBLENBQUNBO0FBQ0xBLENBQUNBO0FBRUQsd0JBQXdCLFFBQVEsRUFBRSxJQUFJLEVBQUUsUUFBUTtJQUM1Q0MsUUFBUUEsQ0FBQ0EsVUFBU0EsR0FBR0E7UUFDakIsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNOLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDekIsQ0FBQztRQUNELElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDcEQsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUIsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDdEMsQ0FBQztRQUNELElBQUksQ0FBQyxDQUFDO1lBQ0YsUUFBUSxFQUFFLENBQUM7UUFDZixDQUFDO0lBQ0wsQ0FBQyxDQUFDQSxDQUFDQTtBQUNQQSxDQUFDQTtBQUVELHNCQUFzQixNQUFNLEVBQUUsV0FBVztJQUNyQ0MsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsS0FBS0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNUJBLFdBQVdBLEdBQUdBLENBQUNBLENBQUNBO0lBQ3BCQSxDQUFDQTtJQUNEQSxpQkFBaUJBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLFFBQVFBO1FBQ25DQyxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNyQkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLElBQUlBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ2xCQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUVuQkEsTUFBTUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7Z0JBQ2hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUNWLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDZCxDQUFDO1lBQ0wsQ0FBQyxDQUFDQSxDQUFDQTtRQUNQQSxDQUFDQTtRQUNEQSxLQUFLQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFTQSxJQUFJQTtZQUNyQixJQUFJLElBQUksR0FBRztnQkFDUCxJQUFJLEVBQUUsSUFBSTtnQkFDVixRQUFRLEVBQUUsT0FBTyxRQUFRLEtBQUssVUFBVSxHQUFHLFFBQVEsR0FBRyxJQUFJO2FBQzdELENBQUM7WUFFRixFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNOLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzFCLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QixDQUFDO1lBRUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztnQkFDbEQsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2xCLENBQUM7WUFDRCxZQUFZLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzVCLENBQUMsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFFREQsSUFBSUEsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDaEJBLElBQUlBLENBQUNBLEdBQUdBO1FBQ0pBLEtBQUtBLEVBQUVBLEVBQUVBO1FBQ1RBLFdBQVdBLEVBQUVBLFdBQVdBO1FBQ3hCQSxTQUFTQSxFQUFFQSxJQUFJQTtRQUNmQSxLQUFLQSxFQUFFQSxJQUFJQTtRQUNYQSxLQUFLQSxFQUFFQSxJQUFJQTtRQUNYQSxPQUFPQSxFQUFFQSxLQUFLQTtRQUNkQSxNQUFNQSxFQUFFQSxLQUFLQTtRQUNiQSxJQUFJQSxFQUFFQSxVQUFTQSxJQUFJQSxFQUFFQSxRQUFRQTtZQUN6QixPQUFPLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDdEMsQ0FBQztRQUNEQSxJQUFJQSxFQUFFQTtZQUNGLENBQUMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1lBQ2YsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUM7UUFDakIsQ0FBQztRQUNEQSxPQUFPQSxFQUFFQSxVQUFTQSxJQUFJQSxFQUFFQSxRQUFRQTtZQUM1QixPQUFPLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDckMsQ0FBQztRQUNEQSxPQUFPQSxFQUFFQTtZQUNMLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDLFdBQVcsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3pELElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQzNCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbEMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNkLENBQUM7Z0JBQ0QsT0FBTyxJQUFJLENBQUMsQ0FBQztnQkFDYixJQUFJLElBQUksR0FBRztvQkFDUCxPQUFPLElBQUksQ0FBQyxDQUFDO29CQUNiLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO3dCQUNoQixJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7b0JBQ3pDLENBQUM7b0JBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDNUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUNkLENBQUM7b0JBQ0QsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNoQixDQUFDLENBQUM7Z0JBQ0YsSUFBSSxFQUFFLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN6QixNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztZQUMxQixDQUFDO1FBQ0wsQ0FBQztRQUNEQSxNQUFNQSxFQUFFQTtZQUNKLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUMxQixDQUFDO1FBQ0RBLE9BQU9BLEVBQUVBO1lBQ0wsTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUNuQixDQUFDO1FBQ0RBLElBQUlBLEVBQUVBO1lBQ0YsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLE9BQU8sS0FBSyxDQUFDLENBQUM7UUFDMUMsQ0FBQztRQUNEQSxLQUFLQSxFQUFFQTtZQUNILEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFBQyxNQUFNLENBQUM7WUFBQyxDQUFDO1lBQ2xDLENBQUMsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1lBQ2hCLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNoQixDQUFDO1FBQ0RBLE1BQU1BLEVBQUVBO1lBQ0osRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUFDLE1BQU0sQ0FBQztZQUFDLENBQUM7WUFDbkMsQ0FBQyxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUM7WUFDakIsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hCLENBQUM7S0FDSkEsQ0FBQ0E7SUFDRkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7QUFDYkEsQ0FBQ0E7QUFFRCw4QkFBOEIsTUFBTSxFQUFFLFdBQVc7SUFFN0NFLHVCQUF1QkEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDdkJDLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBO0lBQ25DQSxDQUFDQTtJQUFBRCxDQUFDQTtJQUVGQSx1QkFBdUJBLFFBQVFBLEVBQUVBLElBQUlBLEVBQUVBLE9BQU9BO1FBQzFDRSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUNSQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM5QkEsT0FBT0EsR0FBR0EsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFDZkEsSUFBSUEsR0FBR0EsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeENBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLEVBQUVBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQ0EsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0E7WUFDZEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLEdBQUdBLEdBQUdBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2xCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUNmQSxDQUFDQTtJQUVERixpQkFBaUJBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLFFBQVFBLEVBQUVBLFFBQVFBO1FBQ3hDRyxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxDQUFDQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNyQkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLElBQUlBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ2xCQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUVuQkEsTUFBTUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7Z0JBQ2hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUNWLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDZCxDQUFDO1lBQ0wsQ0FBQyxDQUFDQSxDQUFDQTtRQUNQQSxDQUFDQTtRQUNEQSxLQUFLQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFTQSxJQUFJQTtZQUNyQixJQUFJLElBQUksR0FBRztnQkFDUCxJQUFJLEVBQUUsSUFBSTtnQkFDVixRQUFRLEVBQUUsUUFBUTtnQkFDbEIsUUFBUSxFQUFFLE9BQU8sUUFBUSxLQUFLLFVBQVUsR0FBRyxRQUFRLEdBQUcsSUFBSTthQUM3RCxDQUFDO1lBRUYsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLGFBQWEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFFekUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztnQkFDbEQsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2xCLENBQUM7WUFDRCxZQUFZLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzVCLENBQUMsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFHREgsSUFBSUEsQ0FBQ0EsR0FBUUEsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7SUFHeENBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLFVBQVNBLElBQUlBLEVBQUVBLFFBQVFBLEVBQUVBLFFBQVFBO1FBQ3RDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUN6QyxDQUFDLENBQUNBO0lBR0ZBLE9BQU9BLENBQUNBLENBQUNBLE9BQU9BLENBQUNBO0lBRWpCQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtBQUNiQSxDQUFDQTtBQUVELHNCQUFzQixNQUFNLEVBQUUsT0FBTztJQUNqQ0ksSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsRUFDZkEsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFFZkEsSUFBSUEsS0FBS0EsR0FBR0E7UUFDUkEsS0FBS0EsRUFBRUEsS0FBS0E7UUFDWkEsT0FBT0EsRUFBRUEsT0FBT0E7UUFDaEJBLFNBQVNBLEVBQUVBLElBQUlBO1FBQ2ZBLEtBQUtBLEVBQUVBLElBQUlBO1FBQ1hBLEtBQUtBLEVBQUVBLElBQUlBO1FBQ1hBLE9BQU9BLEVBQUVBLElBQUlBO1FBQ2JBLElBQUlBLEVBQUVBLFVBQVNBLElBQUlBLEVBQUVBLFFBQVFBO1lBQ3pCLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbEIsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEIsQ0FBQztZQUNELEtBQUssQ0FBQyxJQUFJLEVBQUUsVUFBUyxJQUFJO2dCQUNyQixLQUFLLENBQUMsSUFBSSxDQUFDO29CQUNQLElBQUksRUFBRSxJQUFJO29CQUNWLFFBQVEsRUFBRSxPQUFPLFFBQVEsS0FBSyxVQUFVLEdBQUcsUUFBUSxHQUFHLElBQUk7aUJBQzdELENBQUMsQ0FBQztnQkFDSCxLQUFLLENBQUMsT0FBTyxHQUFHLEtBQUssQ0FBQztnQkFDdEIsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFNBQVMsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUM7b0JBQzlDLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDdEIsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1lBQ0gsWUFBWSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBQ0RBLE9BQU9BLEVBQUVBO1lBQ0xDLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBO2dCQUFDQSxNQUFNQSxDQUFDQTtZQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQTtvQkFBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7Z0JBQ2pEQSxLQUFLQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDckJBLE1BQU1BLENBQUNBO1lBQ1hBLENBQUNBO1lBRURBLElBQUlBLEVBQUVBLEdBQUdBLE9BQU9BLE9BQU9BLEtBQUtBLFFBQVFBO2tCQUM5QkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsT0FBT0EsQ0FBQ0E7a0JBQ3hCQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUVwQ0EsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsRUFBRUEsRUFBRUEsVUFBU0EsSUFBSUE7Z0JBQzNCLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1lBQ3JCLENBQUMsQ0FBQ0EsQ0FBQ0E7WUFFSEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBQy9CQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNmQSxNQUFNQSxDQUFDQSxFQUFFQSxFQUFFQTtnQkFDUCxPQUFPLEdBQUcsS0FBSyxDQUFDO2dCQUVoQixJQUFJLElBQUksR0FBRyxTQUFTLENBQUM7Z0JBQ3JCLEtBQUssQ0FBQyxFQUFFLEVBQUUsVUFBUyxJQUFJO29CQUNuQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQzt3QkFDaEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUNwQyxDQUFDO2dCQUNMLENBQUMsQ0FBQyxDQUFDO2dCQUVILE9BQU8sRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDQSxDQUFDQTtRQUNQQSxDQUFDQTtRQUNERCxNQUFNQSxFQUFFQTtZQUNKLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDO1FBQ3hCLENBQUM7UUFDREEsT0FBT0EsRUFBRUE7WUFDTCxNQUFNLENBQUMsT0FBTyxDQUFDO1FBQ25CLENBQUM7S0FDSkEsQ0FBQ0E7SUFDRkEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7QUFDakJBLENBQUNBO0FBRUQsSUFBSSxXQUFXLEdBQUcsVUFBUyxJQUFJO0lBQzNCLE1BQU0sQ0FBQyxVQUFTLEVBQUU7UUFDZCxJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BELEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxVQUFTLEdBQUc7Z0JBQ3BDLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BELEVBQUUsQ0FBQyxDQUFDLE9BQU8sT0FBTyxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUM7b0JBQ2pDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7d0JBQ04sRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7NEJBQ2hCLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7d0JBQ3ZCLENBQUM7b0JBQ0wsQ0FBQztvQkFDRCxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDckIsS0FBSyxDQUFDLElBQUksRUFBRSxVQUFTLENBQUM7NEJBQ2xCLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDckIsQ0FBQyxDQUFDLENBQUM7b0JBQ1AsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ1QsQ0FBQyxDQUFDO0FBQ04sQ0FBQyxDQUFDO0FBQ0YsV0FBVyxHQUFHLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3BDLFdBQVcsR0FBRyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUtwQyx3QkFBd0IsRUFBRSxFQUFFLE1BQU07SUFDOUJFLElBQUlBLElBQUlBLEdBQUdBLEVBQUVBLENBQUNBO0lBQ2RBLElBQUlBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBO0lBQ2hCQSxNQUFNQSxHQUFHQSxNQUFNQSxJQUFJQSxVQUFTQSxDQUFDQTtRQUN6QixNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQ2IsQ0FBQyxDQUFDQTtJQUNGQSxJQUFJQSxRQUFRQSxHQUFRQTtRQUNoQixJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDakQsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzFCLElBQUksR0FBRyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ25DLEVBQUUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ2QsUUFBUSxDQUFDO2dCQUNMLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3BDLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUNELElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNyQixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQy9CLENBQUM7UUFDRCxJQUFJLENBQUMsQ0FBQztZQUNGLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3pCLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDeEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLFNBQVMsQ0FBQztvQkFDdEIsSUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNwQixPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDbkIsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO3dCQUN2QyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztvQkFDaEMsQ0FBQztnQkFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDVCxDQUFDO0lBQ0wsQ0FBQyxDQUFDQTtJQUNGQSxRQUFRQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUNyQkEsUUFBUUEsQ0FBQ0EsVUFBVUEsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDekJBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO0FBQ3BCQSxDQUFDQTtBQUVELDBCQUEwQixFQUFFO0lBQ3hCQyxNQUFNQSxDQUFDQTtRQUNILE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztJQUN4RCxDQUFDLENBQUNBO0FBQ05BLENBQUNBO0FBRUQsc0JBQXNCLEtBQUssRUFBRSxRQUFRLEVBQUUsUUFBUTtJQUMzQ0MsSUFBSUEsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDakJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEtBQUtBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1FBQzdCQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsRUFBRUEsUUFBUUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7QUFDNUNBLENBQUNBO0FBRUQsNEJBQTRCLEtBQUssRUFBRSxRQUFRLEVBQUUsUUFBUTtJQUNqREMsSUFBSUEsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDakJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEtBQUtBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1FBQzdCQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsRUFBRUEsUUFBUUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7QUFDbERBLENBQUNBO0FBRUQ7SUFDSUMsSUFBSUEsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0E7SUFDcEJBLE1BQU1BLENBQUNBO1FBQ0gsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2hCLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNqRCxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDMUIsTUFBTSxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsVUFBUyxPQUFPLEVBQUUsRUFBRSxFQUFFLEVBQUU7WUFDdEMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUMzQixJQUFJLEdBQUcsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3ZCLElBQUksUUFBUSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ3hELEVBQUUsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQ3RCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtRQUNKLENBQUMsRUFDRCxVQUFTLEdBQUcsRUFBRSxPQUFPO1lBQ2pCLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDaEQsQ0FBQyxDQUFDLENBQUM7SUFDWCxDQUFDLENBQUNBO0FBQ05BLENBQUNBO0FBRUQ7SUFDSUMsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7QUFDcEVBLENBQUNBO0FBRUQsSUFBSSxVQUFVLEdBQUcsVUFBUyxNQUFNLEVBQUUsR0FBRztJQUNqQyxJQUFJLEVBQUUsR0FBRztRQUNMLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQztRQUNoQixJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDakQsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzFCLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLFVBQVMsRUFBRSxFQUFFLEVBQUU7WUFDOUIsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0QyxDQUFDLEVBQ0csUUFBUSxDQUFDLENBQUM7SUFDbEIsQ0FBQyxDQUFDO0lBQ0YsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZCLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDcEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFDRCxJQUFJLENBQUMsQ0FBQztRQUNGLE1BQU0sQ0FBQyxFQUFFLENBQUM7SUFDZCxDQUFDO0FBQ0wsQ0FBQyxDQUFBO0FBQ0QsV0FBVyxTQUFTLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQzlDLFdBQVcsZUFBZSxHQUFHLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUVsRCx3QkFBd0IsRUFBRSxFQUFFLFFBQVE7SUFDaENDLGNBQWNBLEdBQUlBO1FBQ2RDLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ05BLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUNYQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN6QkEsQ0FBQ0E7WUFDREEsTUFBTUEsR0FBR0EsQ0FBQ0E7UUFDZEEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDYkEsQ0FBQ0E7SUFDREQsSUFBSUEsRUFBRUEsQ0FBQ0E7QUFDWEEsQ0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyJcInVzZSBzdHJpY3RcIjtcbi8qIVxuICogYXN5bmNcbiAqIGh0dHBzOi8vZ2l0aHViLmNvbS9jYW9sYW4vYXN5bmNcbiAqXG4gKiBDb3B5cmlnaHQgMjAxMC0yMDE0IENhb2xhbiBNY01haG9uXG4gKiBSZWxlYXNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2VcbiAqL1xuZnVuY3Rpb24gb25seV9vbmNlKGZuOiAoZXJyKSA9PiB2b2lkKSB7XG4gICAgdmFyIGNhbGxlZCA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmIChjYWxsZWQpIHRocm93IG5ldyBFcnJvcihcIkNhbGxiYWNrIHdhcyBhbHJlYWR5IGNhbGxlZC5cIik7XG4gICAgICAgIGNhbGxlZCA9IHRydWU7XG4gICAgICAgIC8vIEZJWE1FOiBOb3Qgc3VyZSB3aGF0IHNob3VsZCByZXBsYWNlIHJvb3QuXG4gICAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxufVxuXG4vLy8vIGNyb3NzLWJyb3dzZXIgY29tcGF0aWJsaXR5IGZ1bmN0aW9ucyAvLy8vXG5cbnZhciBfdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nO1xuXG52YXIgX2lzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBfdG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcblxudmFyIF9lYWNoID0gZnVuY3Rpb24oYXJyLCBpdGVyYXRvcikge1xuICAgIGlmIChhcnIuZm9yRWFjaCkge1xuICAgICAgICByZXR1cm4gYXJyLmZvckVhY2goaXRlcmF0b3IpO1xuICAgIH1cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBpdGVyYXRvcihhcnJbaV0sIGksIGFycik7XG4gICAgfVxufTtcblxudmFyIF9tYXAgPSBmdW5jdGlvbihhcnIsIGl0ZXJhdG9yKSB7XG4gICAgaWYgKGFyci5tYXApIHtcbiAgICAgICAgcmV0dXJuIGFyci5tYXAoaXRlcmF0b3IpO1xuICAgIH1cbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIF9lYWNoKGFyciwgZnVuY3Rpb24oeCwgaSwgYSkge1xuICAgICAgICByZXN1bHRzLnB1c2goaXRlcmF0b3IoeCwgaSwgYSkpO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xufTtcblxudmFyIF9yZWR1Y2UgPSBmdW5jdGlvbihhcnIsIGl0ZXJhdG9yLCBtZW1vKSB7XG4gICAgaWYgKGFyci5yZWR1Y2UpIHtcbiAgICAgICAgcmV0dXJuIGFyci5yZWR1Y2UoaXRlcmF0b3IsIG1lbW8pO1xuICAgIH1cbiAgICBfZWFjaChhcnIsIGZ1bmN0aW9uKHgsIGksIGEpIHtcbiAgICAgICAgbWVtbyA9IGl0ZXJhdG9yKG1lbW8sIHgsIGksIGEpO1xuICAgIH0pO1xuICAgIHJldHVybiBtZW1vO1xufTtcblxudmFyIF9rZXlzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKE9iamVjdC5rZXlzKSB7XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyhvYmopO1xuICAgIH1cbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGsgaW4gb2JqKSB7XG4gICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoaykpIHtcbiAgICAgICAgICAgIGtleXMucHVzaChrKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ga2V5cztcbn07XG5cbi8vLy8gZXhwb3J0ZWQgYXN5bmMgbW9kdWxlIGZ1bmN0aW9ucyAvLy8vXG5cbi8vLy8gbmV4dFRpY2sgaW1wbGVtZW50YXRpb24gd2l0aCBicm93c2VyLWNvbXBhdGlibGUgZmFsbGJhY2sgLy8vL1xuZXhwb3J0IGZ1bmN0aW9uIG5leHRUaWNrKGNhbGxiYWNrOiBhbnkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJuZXh0VGljayBub3QgaW1wbGVtZW50ZWRcIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRJbW1lZGlhdGUoY2FsbGJhY2s6IGFueSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcInNldEltbWVkaWF0ZSBub3QgaW1wbGVtZW50ZWRcIik7XG59XG4vKlxuaWYgKHR5cGVvZiBwcm9jZXNzID09PSAndW5kZWZpbmVkJyB8fCAhKHByb2Nlc3MubmV4dFRpY2spKSB7XG4gICAgaWYgKHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgYXN5bmMubmV4dFRpY2sgPSBmdW5jdGlvbihmbikge1xuICAgICAgICAgICAgLy8gbm90IGEgZGlyZWN0IGFsaWFzIGZvciBJRTEwIGNvbXBhdGliaWxpdHlcbiAgICAgICAgICAgIHNldEltbWVkaWF0ZShmbik7XG4gICAgICAgIH07XG4gICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZSA9IGFzeW5jLm5leHRUaWNrO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgYXN5bmMubmV4dFRpY2sgPSBmdW5jdGlvbihmbikge1xuICAgICAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgICAgIH07XG4gICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZSA9IGFzeW5jLm5leHRUaWNrO1xuICAgIH1cbn1cbmVsc2Uge1xuICAgIG5leHRUaWNrID0gcHJvY2Vzcy5uZXh0VGljaztcbiAgICBpZiAodHlwZW9mIHNldEltbWVkaWF0ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgc2V0SW1tZWRpYXRlID0gZnVuY3Rpb24oZm4pIHtcbiAgICAgICAgICAgIC8vIG5vdCBhIGRpcmVjdCBhbGlhcyBmb3IgSUUxMCBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgICBzZXRJbW1lZGlhdGUoZm4pO1xuICAgICAgICB9O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgc2V0SW1tZWRpYXRlID0gbmV4dFRpY2s7XG4gICAgfVxufVxuKi9cblxuZXhwb3J0IGZ1bmN0aW9uIGVhY2goYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkgeyB9O1xuICAgIGlmICghYXJyLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICB9XG4gICAgdmFyIGNvbXBsZXRlZCA9IDA7XG4gICAgX2VhY2goYXJyLCBmdW5jdGlvbih4KSB7XG4gICAgICAgIGl0ZXJhdG9yKHgsIG9ubHlfb25jZShkb25lKSk7XG4gICAgfSk7XG4gICAgZnVuY3Rpb24gZG9uZShlcnIpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24oKSB7IH07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjb21wbGV0ZWQgKz0gMTtcbiAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5leHBvcnQgdmFyIGZvckVhY2ggPSBlYWNoO1xuXG5leHBvcnQgZnVuY3Rpb24gZWFjaFNlcmllcyhhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7IH07XG4gICAgaWYgKCFhcnIubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjaygpO1xuICAgIH1cbiAgICB2YXIgY29tcGxldGVkID0gMDtcbiAgICB2YXIgaXRlcmF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpdGVyYXRvcihhcnJbY29tcGxldGVkXSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKCkgeyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29tcGxldGVkICs9IDE7XG4gICAgICAgICAgICAgICAgaWYgKGNvbXBsZXRlZCA+PSBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpdGVyYXRlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9O1xuICAgIGl0ZXJhdGUoKTtcbn1cbmV4cG9ydCB2YXIgZm9yRWFjaFNlcmllcyA9IGVhY2hTZXJpZXM7XG5cbmV4cG9ydCBmdW5jdGlvbiBlYWNoTGltaXQoYXJyLCBsaW1pdCwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgdmFyIGZuID0gX2VhY2hMaW1pdChsaW1pdCk7XG4gICAgZm4uYXBwbHkobnVsbCwgW2FyciwgaXRlcmF0b3IsIGNhbGxiYWNrXSk7XG59XG5leHBvcnQgdmFyIGZvckVhY2hMaW1pdCA9IGVhY2hMaW1pdDtcblxudmFyIF9lYWNoTGltaXQgPSBmdW5jdGlvbihsaW1pdCkge1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7IH07XG4gICAgICAgIGlmICghYXJyLmxlbmd0aCB8fCBsaW1pdCA8PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgY29tcGxldGVkID0gMDtcbiAgICAgICAgdmFyIHN0YXJ0ZWQgPSAwO1xuICAgICAgICB2YXIgcnVubmluZyA9IDA7XG5cbiAgICAgICAgKGZ1bmN0aW9uIHJlcGxlbmlzaCgpIHtcbiAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aGlsZSAocnVubmluZyA8IGxpbWl0ICYmIHN0YXJ0ZWQgPCBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgc3RhcnRlZCArPSAxO1xuICAgICAgICAgICAgICAgIHJ1bm5pbmcgKz0gMTtcbiAgICAgICAgICAgICAgICBpdGVyYXRvcihhcnJbc3RhcnRlZCAtIDFdLCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24oKSB7IH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wbGV0ZWQgKz0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJ1bm5pbmcgLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBsZW5pc2goKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KSgpO1xuICAgIH07XG59O1xuXG5cbnZhciBkb1BhcmFsbGVsID0gZnVuY3Rpb24oZm4pOiBhbnkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICByZXR1cm4gZm4uYXBwbHkobnVsbCwgW2VhY2hdLmNvbmNhdChhcmdzKSk7XG4gICAgfTtcbn07XG52YXIgZG9QYXJhbGxlbExpbWl0ID0gZnVuY3Rpb24obGltaXQsIGZuKTogKGR1bW15MD8sIGR1bW15MT8sIGR1bW15Mj8pID0+IGFueSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgIHJldHVybiBmbi5hcHBseShudWxsLCBbX2VhY2hMaW1pdChsaW1pdCldLmNvbmNhdChhcmdzKSk7XG4gICAgfTtcbn07XG52YXIgZG9TZXJpZXMgPSBmdW5jdGlvbihmbik6IChhcmcwPywgYXJnMT8sIGFyZzI/KSA9PiBhbnkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICByZXR1cm4gZm4uYXBwbHkobnVsbCwgW2VhY2hTZXJpZXNdLmNvbmNhdChhcmdzKSk7XG4gICAgfTtcbn07XG5cblxudmFyIF9hc3luY01hcCA9IGZ1bmN0aW9uKGVhY2hmbiwgYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICBhcnIgPSBfbWFwKGFyciwgZnVuY3Rpb24oeCwgaSkge1xuICAgICAgICByZXR1cm4geyBpbmRleDogaSwgdmFsdWU6IHggfTtcbiAgICB9KTtcbiAgICBpZiAoIWNhbGxiYWNrKSB7XG4gICAgICAgIGVhY2hmbihhcnIsIGZ1bmN0aW9uKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpdGVyYXRvcih4LnZhbHVlLCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciByZXN1bHRzID0gW107XG4gICAgICAgIGVhY2hmbihhcnIsIGZ1bmN0aW9uKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpdGVyYXRvcih4LnZhbHVlLCBmdW5jdGlvbihlcnIsIHYpIHtcbiAgICAgICAgICAgICAgICByZXN1bHRzW3guaW5kZXhdID0gdjtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgcmVzdWx0cyk7XG4gICAgICAgICAgICB9KTtcbiAgICB9XG59O1xuZXhwb3J0IHZhciBtYXAgPSBkb1BhcmFsbGVsKF9hc3luY01hcCk7XG5leHBvcnQgdmFyIG1hcFNlcmllcyA9IGRvU2VyaWVzKF9hc3luY01hcCk7XG5leHBvcnQgZnVuY3Rpb24gbWFwTGltaXQoYXJyLCBsaW1pdCwgaXRlcmF0b3IsIGNhbGxiYWNrPykge1xuICAgIHJldHVybiBfbWFwTGltaXQobGltaXQpKGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbn1cblxudmFyIF9tYXBMaW1pdCA9IGZ1bmN0aW9uKGxpbWl0KSB7XG4gICAgcmV0dXJuIGRvUGFyYWxsZWxMaW1pdChsaW1pdCwgX2FzeW5jTWFwKTtcbn07XG5cbi8vIHJlZHVjZSBvbmx5IGhhcyBhIHNlcmllcyB2ZXJzaW9uLCBhcyBkb2luZyByZWR1Y2UgaW4gcGFyYWxsZWwgd29uJ3Rcbi8vIHdvcmsgaW4gbWFueSBzaXR1YXRpb25zLlxuZXhwb3J0IGZ1bmN0aW9uIHJlZHVjZShhcnIsIG1lbW8sIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIGVhY2hTZXJpZXMoYXJyLCBmdW5jdGlvbih4LCBjYWxsYmFjaykge1xuICAgICAgICBpdGVyYXRvcihtZW1vLCB4LCBmdW5jdGlvbihlcnIsIHYpIHtcbiAgICAgICAgICAgIG1lbW8gPSB2O1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgfSk7XG4gICAgfSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnIsIG1lbW8pO1xuICAgICAgICB9KTtcbn1cbi8vIGluamVjdCBhbGlhc1xuZXhwb3J0IHZhciBpbmplY3QgPSByZWR1Y2U7XG4vLyBmb2xkbCBhbGlhc1xuZXhwb3J0IHZhciBmb2xkbCA9IHJlZHVjZTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZHVjZVJpZ2h0KGFyciwgbWVtbywgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgdmFyIHJldmVyc2VkID0gX21hcChhcnIsIGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfSkucmV2ZXJzZSgpO1xuICAgIHJlZHVjZShyZXZlcnNlZCwgbWVtbywgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbn1cbi8vIGZvbGRyIGFsaWFzXG5leHBvcnQgdmFyIGZvbGRyID0gcmVkdWNlUmlnaHQ7XG5cbnZhciBfZmlsdGVyID0gZnVuY3Rpb24oZWFjaGZuLCBhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgYXJyID0gX21hcChhcnIsIGZ1bmN0aW9uKHgsIGkpIHtcbiAgICAgICAgcmV0dXJuIHsgaW5kZXg6IGksIHZhbHVlOiB4IH07XG4gICAgfSk7XG4gICAgZWFjaGZuKGFyciwgZnVuY3Rpb24oeCwgY2FsbGJhY2spIHtcbiAgICAgICAgaXRlcmF0b3IoeC52YWx1ZSwgZnVuY3Rpb24odikge1xuICAgICAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2goeCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9KTtcbiAgICB9LCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKF9tYXAocmVzdWx0cy5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYS5pbmRleCAtIGIuaW5kZXg7XG4gICAgICAgICAgICB9KSwgZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geC52YWx1ZTtcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xufVxuZXhwb3J0IHZhciBmaWx0ZXIgPSBkb1BhcmFsbGVsKF9maWx0ZXIpO1xuZXhwb3J0IHZhciBmaWx0ZXJTZXJpZXMgPSBkb1NlcmllcyhfZmlsdGVyKTtcbi8vIHNlbGVjdCBhbGlhc1xuZXhwb3J0IHZhciBzZWxlY3QgPSBmaWx0ZXI7XG5leHBvcnQgdmFyIHNlbGVjdFNlcmllcyA9IGZpbHRlclNlcmllcztcblxudmFyIF9yZWplY3QgPSBmdW5jdGlvbihlYWNoZm4sIGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICBhcnIgPSBfbWFwKGFyciwgZnVuY3Rpb24oeCwgaSkge1xuICAgICAgICByZXR1cm4geyBpbmRleDogaSwgdmFsdWU6IHggfTtcbiAgICB9KTtcbiAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbih4LCBjYWxsYmFjaykge1xuICAgICAgICBpdGVyYXRvcih4LnZhbHVlLCBmdW5jdGlvbih2KSB7XG4gICAgICAgICAgICBpZiAoIXYpIHtcbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2goeCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9KTtcbiAgICB9LCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKF9tYXAocmVzdWx0cy5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYS5pbmRleCAtIGIuaW5kZXg7XG4gICAgICAgICAgICB9KSwgZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geC52YWx1ZTtcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xufVxuZXhwb3J0IHZhciByZWplY3QgPSBkb1BhcmFsbGVsKF9yZWplY3QpO1xuZXhwb3J0IHZhciByZWplY3RTZXJpZXMgPSBkb1NlcmllcyhfcmVqZWN0KTtcblxudmFyIF9kZXRlY3QgPSBmdW5jdGlvbihlYWNoZm4sIGFyciwgaXRlcmF0b3IsIG1haW5fY2FsbGJhY2spIHtcbiAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbih4LCBjYWxsYmFjaykge1xuICAgICAgICBpdGVyYXRvcih4LCBmdW5jdGlvbihyZXN1bHQpIHtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrKHgpO1xuICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2sgPSBmdW5jdGlvbigpIHsgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgbWFpbl9jYWxsYmFjaygpO1xuICAgICAgICB9KTtcbn1cbmV4cG9ydCB2YXIgZGV0ZWN0ID0gZG9QYXJhbGxlbChfZGV0ZWN0KTtcbmV4cG9ydCB2YXIgZGV0ZWN0U2VyaWVzID0gZG9TZXJpZXMoX2RldGVjdCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBzb21lKGFyciwgaXRlcmF0b3IsIG1haW5fY2FsbGJhY2spIHtcbiAgICBlYWNoKGFyciwgZnVuY3Rpb24oeCwgY2FsbGJhY2spIHtcbiAgICAgICAgaXRlcmF0b3IoeCwgZnVuY3Rpb24odikge1xuICAgICAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrKHRydWUpO1xuICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2sgPSBmdW5jdGlvbigpIHsgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH0pO1xuICAgIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgbWFpbl9jYWxsYmFjayhmYWxzZSk7XG4gICAgICAgIH0pO1xufVxuLy8gYW55IGFsaWFzXG5leHBvcnQgdmFyIGFueSA9IHNvbWU7XG5cbmV4cG9ydCBmdW5jdGlvbiBldmVyeShhcnIsIGl0ZXJhdG9yLCBtYWluX2NhbGxiYWNrKSB7XG4gICAgZWFjaChhcnIsIGZ1bmN0aW9uKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgIGl0ZXJhdG9yKHgsIGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICAgIGlmICghdikge1xuICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2soZmFsc2UpO1xuICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2sgPSBmdW5jdGlvbigpIHsgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH0pO1xuICAgIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgbWFpbl9jYWxsYmFjayh0cnVlKTtcbiAgICAgICAgfSk7XG59XG4vLyBhbGwgYWxpYXNcbmV4cG9ydCB2YXIgYWxsID0gZXZlcnk7XG5cbmV4cG9ydCBmdW5jdGlvbiBzb3J0QnkoYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICBtYXAoYXJyLCBmdW5jdGlvbih4LCBjYWxsYmFjaykge1xuICAgICAgICBpdGVyYXRvcih4LCBmdW5jdGlvbihlcnIsIGNyaXRlcmlhKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHsgdmFsdWU6IHgsIGNyaXRlcmlhOiBjcml0ZXJpYSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSwgZnVuY3Rpb24oZXJyLCByZXN1bHRzKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgZm4gPSBmdW5jdGlvbihsZWZ0LCByaWdodCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYSA9IGxlZnQuY3JpdGVyaWEsIGIgPSByaWdodC5jcml0ZXJpYTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGEgPCBiID8gLTEgOiBhID4gYiA/IDEgOiAwO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgX21hcChyZXN1bHRzLnNvcnQoZm4pLCBmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB4LnZhbHVlO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhdXRvKHRhc2tzLCBjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7IH07XG4gICAgdmFyIGtleXMgPSBfa2V5cyh0YXNrcyk7XG4gICAgdmFyIHJlbWFpbmluZ1Rhc2tzID0ga2V5cy5sZW5ndGhcbiAgICAgICAgaWYgKCFyZW1haW5pbmdUYXNrcykge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICB9XG5cbiAgICB2YXIgcmVzdWx0cyA9IHt9O1xuXG4gICAgdmFyIGxpc3RlbmVycyA9IFtdO1xuICAgIHZhciBhZGRMaXN0ZW5lciA9IGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgIGxpc3RlbmVycy51bnNoaWZ0KGZuKTtcbiAgICB9O1xuICAgIHZhciByZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdGVuZXJzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICBpZiAobGlzdGVuZXJzW2ldID09PSBmbikge1xuICAgICAgICAgICAgICAgIGxpc3RlbmVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICB2YXIgdGFza0NvbXBsZXRlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlbWFpbmluZ1Rhc2tzLS1cbiAgICAgICAgICAgIF9lYWNoKGxpc3RlbmVycy5zbGljZSgwKSwgZnVuY3Rpb24oZm4pIHtcbiAgICAgICAgICAgIGZuKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBhZGRMaXN0ZW5lcihmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKCFyZW1haW5pbmdUYXNrcykge1xuICAgICAgICAgICAgdmFyIHRoZUNhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgICAgICAgICAvLyBwcmV2ZW50IGZpbmFsIGNhbGxiYWNrIGZyb20gY2FsbGluZyBpdHNlbGYgaWYgaXQgZXJyb3JzXG4gICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKCkgeyB9O1xuXG4gICAgICAgICAgICB0aGVDYWxsYmFjayhudWxsLCByZXN1bHRzKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgX2VhY2goa2V5cywgZnVuY3Rpb24oaykge1xuICAgICAgICB2YXIgdGFzayA9IF9pc0FycmF5KHRhc2tzW2tdKSA/IHRhc2tzW2tdIDogW3Rhc2tzW2tdXTtcbiAgICAgICAgdmFyIHRhc2tDYWxsYmFjayA9IGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDw9IDEpIHtcbiAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICB2YXIgc2FmZVJlc3VsdHMgPSB7fTtcbiAgICAgICAgICAgICAgICBfZWFjaChfa2V5cyhyZXN1bHRzKSwgZnVuY3Rpb24ocmtleSkge1xuICAgICAgICAgICAgICAgICAgICBzYWZlUmVzdWx0c1tya2V5XSA9IHJlc3VsdHNbcmtleV07XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc2FmZVJlc3VsdHNba10gPSBhcmdzO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgc2FmZVJlc3VsdHMpO1xuICAgICAgICAgICAgICAgIC8vIHN0b3Agc3Vic2VxdWVudCBlcnJvcnMgaGl0dGluZyBjYWxsYmFjayBtdWx0aXBsZSB0aW1lc1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24oKSB7IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXN1bHRzW2tdID0gYXJncztcbiAgICAgICAgICAgICAgICBzZXRJbW1lZGlhdGUodGFza0NvbXBsZXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdmFyIHJlcXVpcmVzID0gdGFzay5zbGljZSgwLCBNYXRoLmFicyh0YXNrLmxlbmd0aCAtIDEpKSB8fCBbXTtcbiAgICAgICAgdmFyIHJlYWR5ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gX3JlZHVjZShyZXF1aXJlcywgZnVuY3Rpb24oYSwgeCkge1xuICAgICAgICAgICAgICAgIHJldHVybiAoYSAmJiByZXN1bHRzLmhhc093blByb3BlcnR5KHgpKTtcbiAgICAgICAgICAgIH0sIHRydWUpICYmICFyZXN1bHRzLmhhc093blByb3BlcnR5KGspO1xuICAgICAgICB9O1xuICAgICAgICBpZiAocmVhZHkoKSkge1xuICAgICAgICAgICAgdGFza1t0YXNrLmxlbmd0aCAtIDFdKHRhc2tDYWxsYmFjaywgcmVzdWx0cyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgbGlzdGVuZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVhZHkoKSkge1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVMaXN0ZW5lcihsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgIHRhc2tbdGFzay5sZW5ndGggLSAxXSh0YXNrQ2FsbGJhY2ssIHJlc3VsdHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBhZGRMaXN0ZW5lcihsaXN0ZW5lcik7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJldHJ5KHRpbWVzLCB0YXNrLCBjYWxsYmFjaykge1xuICAgIHZhciBERUZBVUxUX1RJTUVTID0gNTtcbiAgICB2YXIgYXR0ZW1wdHMgPSBbXTtcbiAgICAvLyBVc2UgZGVmYXVsdHMgaWYgdGltZXMgbm90IHBhc3NlZFxuICAgIGlmICh0eXBlb2YgdGltZXMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY2FsbGJhY2sgPSB0YXNrO1xuICAgICAgICB0YXNrID0gdGltZXM7XG4gICAgICAgIHRpbWVzID0gREVGQVVMVF9USU1FUztcbiAgICB9XG4gICAgLy8gTWFrZSBzdXJlIHRpbWVzIGlzIGEgbnVtYmVyXG4gICAgdGltZXMgPSBwYXJzZUludCh0aW1lcywgMTApIHx8IERFRkFVTFRfVElNRVM7XG4gICAgdmFyIHdyYXBwZWRUYXNrID0gZnVuY3Rpb24od3JhcHBlZENhbGxiYWNrPywgd3JhcHBlZFJlc3VsdHM/KTogYW55IHtcbiAgICAgICAgdmFyIHJldHJ5QXR0ZW1wdCA9IGZ1bmN0aW9uKHRhc2ssIGZpbmFsQXR0ZW1wdCkge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKHNlcmllc0NhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgdGFzayhmdW5jdGlvbihlcnIsIHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBzZXJpZXNDYWxsYmFjayghZXJyIHx8IGZpbmFsQXR0ZW1wdCwgeyBlcnI6IGVyciwgcmVzdWx0OiByZXN1bHQgfSk7XG4gICAgICAgICAgICAgICAgfSwgd3JhcHBlZFJlc3VsdHMpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfTtcbiAgICAgICAgd2hpbGUgKHRpbWVzKSB7XG4gICAgICAgICAgICBhdHRlbXB0cy5wdXNoKHJldHJ5QXR0ZW1wdCh0YXNrLCAhKHRpbWVzIC09IDEpKSk7XG4gICAgICAgIH1cbiAgICAgICAgc2VyaWVzKGF0dGVtcHRzLCBmdW5jdGlvbihkb25lLCBkYXRhKSB7XG4gICAgICAgICAgICBkYXRhID0gZGF0YVtkYXRhLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgKHdyYXBwZWRDYWxsYmFjayB8fCBjYWxsYmFjaykoZGF0YS5lcnIsIGRhdGEucmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgICAgICAvLyBJZiBhIGNhbGxiYWNrIGlzIHBhc3NlZCwgcnVuIHRoaXMgYXMgYSBjb250cm9sbCBmbG93XG4gICAgICAgIHJldHVybiBjYWxsYmFjayA/IHdyYXBwZWRUYXNrKCkgOiB3cmFwcGVkVGFza1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJmYWxsKHRhc2tzLCBjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7IH07XG4gICAgaWYgKCFfaXNBcnJheSh0YXNrcykpIHtcbiAgICAgICAgdmFyIGVyciA9IG5ldyBFcnJvcignRmlyc3QgYXJndW1lbnQgdG8gd2F0ZXJmYWxsIG11c3QgYmUgYW4gYXJyYXkgb2YgZnVuY3Rpb25zJyk7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgIH1cbiAgICBpZiAoIXRhc2tzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICB9XG4gICAgdmFyIHdyYXBJdGVyYXRvciA9IGZ1bmN0aW9uKGl0ZXJhdG9yOiBhbnkpOiBhbnkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2suYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKCkgeyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgIHZhciBuZXh0ID0gaXRlcmF0b3IubmV4dCgpO1xuICAgICAgICAgICAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgIGFyZ3MucHVzaCh3cmFwSXRlcmF0b3IobmV4dCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYXJncy5wdXNoKGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2V0SW1tZWRpYXRlKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5hcHBseShudWxsLCBhcmdzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9O1xuICAgIHdyYXBJdGVyYXRvcihpdGVyYXRvcih0YXNrcykpKCk7XG59XG5cbnZhciBfcGFyYWxsZWwgPSBmdW5jdGlvbihlYWNoZm4sIHRhc2tzLCBjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7IH07XG4gICAgaWYgKF9pc0FycmF5KHRhc2tzKSkge1xuICAgICAgICBlYWNoZm4ubWFwKHRhc2tzLCBmdW5jdGlvbihmbiwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGlmIChmbikge1xuICAgICAgICAgICAgICAgIGZuKGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKG51bGwsIGVyciwgYXJncyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIGNhbGxiYWNrKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZhciByZXN1bHRzID0ge307XG4gICAgICAgIGVhY2hmbi5lYWNoKF9rZXlzKHRhc2tzKSwgZnVuY3Rpb24oaywgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHRhc2tzW2tdKGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzdWx0c1trXSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIHJlc3VsdHMpO1xuICAgICAgICAgICAgfSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyYWxsZWwodGFza3M6IGFueVtdLCBjYWxsYmFjaz86IChlcnIsIHJlc3VsdHMpPT52b2lkKSB7XG4gICAgX3BhcmFsbGVsKHsgbWFwOiBtYXAsIGVhY2g6IGVhY2ggfSwgdGFza3MsIGNhbGxiYWNrKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcmFsbGVsTGltaXQodGFza3MsIGxpbWl0LCBjYWxsYmFjaykge1xuICAgIF9wYXJhbGxlbCh7IG1hcDogX21hcExpbWl0KGxpbWl0KSwgZWFjaDogX2VhY2hMaW1pdChsaW1pdCkgfSwgdGFza3MsIGNhbGxiYWNrKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlcmllcyh0YXNrcywgY2FsbGJhY2spIHtcbiAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkgeyB9O1xuICAgIGlmIChfaXNBcnJheSh0YXNrcykpIHtcbiAgICAgICAgbWFwU2VyaWVzKHRhc2tzLCBmdW5jdGlvbihmbiwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGlmIChmbikge1xuICAgICAgICAgICAgICAgIGZuKGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKG51bGwsIGVyciwgYXJncyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIGNhbGxiYWNrKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZhciByZXN1bHRzID0ge307XG4gICAgICAgIGVhY2hTZXJpZXMoX2tleXModGFza3MpLCBmdW5jdGlvbihrLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgdGFza3Nba10oZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGFyZ3MgPSBhcmdzWzBdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXN1bHRzW2tdID0gYXJncztcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgcmVzdWx0cyk7XG4gICAgICAgICAgICB9KTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpdGVyYXRvcih0YXNrcykge1xuICAgIHZhciBtYWtlQ2FsbGJhY2sgPSBmdW5jdGlvbihpbmRleCkge1xuICAgICAgICB2YXIgZm46IGFueSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHRhc2tzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRhc2tzW2luZGV4XS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZuLm5leHQoKTtcbiAgICAgICAgfTtcbiAgICAgICAgZm4ubmV4dCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIChpbmRleCA8IHRhc2tzLmxlbmd0aCAtIDEpID8gbWFrZUNhbGxiYWNrKGluZGV4ICsgMSkgOiBudWxsO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gZm47XG4gICAgfTtcbiAgICByZXR1cm4gbWFrZUNhbGxiYWNrKDApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHkoZm4pIHtcbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gZm4uYXBwbHkoXG4gICAgICAgICAgICBudWxsLCBhcmdzLmNvbmNhdChBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpKVxuICAgICAgICAgICAgKTtcbiAgICB9O1xufVxuXG52YXIgX2NvbmNhdCA9IGZ1bmN0aW9uKGVhY2hmbiwgYXJyLCBmbiwgY2FsbGJhY2spIHtcbiAgICB2YXIgciA9IFtdO1xuICAgIGVhY2hmbihhcnIsIGZ1bmN0aW9uKHgsIGNiKSB7XG4gICAgICAgIGZuKHgsIGZ1bmN0aW9uKGVyciwgeSkge1xuICAgICAgICAgICAgciA9IHIuY29uY2F0KHkgfHwgW10pO1xuICAgICAgICAgICAgY2IoZXJyKTtcbiAgICAgICAgfSk7XG4gICAgfSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnIsIHIpO1xuICAgICAgICB9KTtcbn07XG5leHBvcnQgdmFyIGNvbmNhdCA9IGRvUGFyYWxsZWwoX2NvbmNhdCk7XG5leHBvcnQgdmFyIGNvbmNhdFNlcmllcyA9IGRvU2VyaWVzKF9jb25jYXQpO1xuXG5leHBvcnQgZnVuY3Rpb24gd2hpbHN0KHRlc3QsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIGlmICh0ZXN0KCkpIHtcbiAgICAgICAgaXRlcmF0b3IoZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3aGlsc3QodGVzdCwgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBjYWxsYmFjaygpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRvV2hpbHN0KGl0ZXJhdG9yLCB0ZXN0LCBjYWxsYmFjaykge1xuICAgIGl0ZXJhdG9yKGZ1bmN0aW9uKGVycikge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgIGlmICh0ZXN0LmFwcGx5KG51bGwsIGFyZ3MpKSB7XG4gICAgICAgICAgICBkb1doaWxzdChpdGVyYXRvciwgdGVzdCwgY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdW50aWwodGVzdCwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgaWYgKCF0ZXN0KCkpIHtcbiAgICAgICAgaXRlcmF0b3IoZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB1bnRpbCh0ZXN0LCBpdGVyYXRvciwgY2FsbGJhY2spO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGNhbGxiYWNrKCk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZG9VbnRpbChpdGVyYXRvciwgdGVzdCwgY2FsbGJhY2spIHtcbiAgICBpdGVyYXRvcihmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICBpZiAoIXRlc3QuYXBwbHkobnVsbCwgYXJncykpIHtcbiAgICAgICAgICAgIGRvVW50aWwoaXRlcmF0b3IsIHRlc3QsIGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlKHdvcmtlciwgY29uY3VycmVuY3kpIHtcbiAgICBpZiAoY29uY3VycmVuY3kgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25jdXJyZW5jeSA9IDE7XG4gICAgfVxuICAgIGZ1bmN0aW9uIF9pbnNlcnQocSwgZGF0YSwgcG9zLCBjYWxsYmFjaykge1xuICAgICAgICBpZiAoIXEuc3RhcnRlZCkge1xuICAgICAgICAgICAgcS5zdGFydGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIV9pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgICAgICBkYXRhID0gW2RhdGFdO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkYXRhLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICAvLyBjYWxsIGRyYWluIGltbWVkaWF0ZWx5IGlmIHRoZXJlIGFyZSBubyB0YXNrc1xuICAgICAgICAgICAgcmV0dXJuIHNldEltbWVkaWF0ZShmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBpZiAocS5kcmFpbikge1xuICAgICAgICAgICAgICAgICAgICBxLmRyYWluKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgX2VhY2goZGF0YSwgZnVuY3Rpb24odGFzaykge1xuICAgICAgICAgICAgdmFyIGl0ZW0gPSB7XG4gICAgICAgICAgICAgICAgZGF0YTogdGFzayxcbiAgICAgICAgICAgICAgICBjYWxsYmFjazogdHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nID8gY2FsbGJhY2sgOiBudWxsXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAocG9zKSB7XG4gICAgICAgICAgICAgICAgcS50YXNrcy51bnNoaWZ0KGl0ZW0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBxLnRhc2tzLnB1c2goaXRlbSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChxLnNhdHVyYXRlZCAmJiBxLnRhc2tzLmxlbmd0aCA9PT0gcS5jb25jdXJyZW5jeSkge1xuICAgICAgICAgICAgICAgIHEuc2F0dXJhdGVkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZXRJbW1lZGlhdGUocS5wcm9jZXNzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgdmFyIHdvcmtlcnMgPSAwO1xuICAgIHZhciBxID0ge1xuICAgICAgICB0YXNrczogW10sXG4gICAgICAgIGNvbmN1cnJlbmN5OiBjb25jdXJyZW5jeSxcbiAgICAgICAgc2F0dXJhdGVkOiBudWxsLFxuICAgICAgICBlbXB0eTogbnVsbCxcbiAgICAgICAgZHJhaW46IG51bGwsXG4gICAgICAgIHN0YXJ0ZWQ6IGZhbHNlLFxuICAgICAgICBwYXVzZWQ6IGZhbHNlLFxuICAgICAgICBwdXNoOiBmdW5jdGlvbihkYXRhLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgX2luc2VydChxLCBkYXRhLCBmYWxzZSwgY2FsbGJhY2spO1xuICAgICAgICB9LFxuICAgICAgICBraWxsOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHEuZHJhaW4gPSBudWxsO1xuICAgICAgICAgICAgcS50YXNrcyA9IFtdO1xuICAgICAgICB9LFxuICAgICAgICB1bnNoaWZ0OiBmdW5jdGlvbihkYXRhLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgX2luc2VydChxLCBkYXRhLCB0cnVlLCBjYWxsYmFjayk7XG4gICAgICAgIH0sXG4gICAgICAgIHByb2Nlc3M6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKCFxLnBhdXNlZCAmJiB3b3JrZXJzIDwgcS5jb25jdXJyZW5jeSAmJiBxLnRhc2tzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHZhciB0YXNrID0gcS50YXNrcy5zaGlmdCgpO1xuICAgICAgICAgICAgICAgIGlmIChxLmVtcHR5ICYmIHEudGFza3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHEuZW1wdHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgd29ya2VycyArPSAxO1xuICAgICAgICAgICAgICAgIHZhciBuZXh0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHdvcmtlcnMgLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRhc2suY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhc2suY2FsbGJhY2suYXBwbHkodGFzaywgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAocS5kcmFpbiAmJiBxLnRhc2tzLmxlbmd0aCArIHdvcmtlcnMgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHEuZHJhaW4oKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBxLnByb2Nlc3MoKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHZhciBjYiA9IG9ubHlfb25jZShuZXh0KTtcbiAgICAgICAgICAgICAgICB3b3JrZXIodGFzay5kYXRhLCBjYik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGxlbmd0aDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gcS50YXNrcy5sZW5ndGg7XG4gICAgICAgIH0sXG4gICAgICAgIHJ1bm5pbmc6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHdvcmtlcnM7XG4gICAgICAgIH0sXG4gICAgICAgIGlkbGU6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHEudGFza3MubGVuZ3RoICsgd29ya2VycyA9PT0gMDtcbiAgICAgICAgfSxcbiAgICAgICAgcGF1c2U6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHEucGF1c2VkID09PSB0cnVlKSB7IHJldHVybjsgfVxuICAgICAgICAgICAgcS5wYXVzZWQgPSB0cnVlO1xuICAgICAgICAgICAgcS5wcm9jZXNzKCk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlc3VtZTogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAocS5wYXVzZWQgPT09IGZhbHNlKSB7IHJldHVybjsgfVxuICAgICAgICAgICAgcS5wYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHEucHJvY2VzcygpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gcTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByaW9yaXR5UXVldWUod29ya2VyLCBjb25jdXJyZW5jeSkge1xuXG4gICAgZnVuY3Rpb24gX2NvbXBhcmVUYXNrcyhhLCBiKSB7XG4gICAgICAgIHJldHVybiBhLnByaW9yaXR5IC0gYi5wcmlvcml0eTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gX2JpbmFyeVNlYXJjaChzZXF1ZW5jZSwgaXRlbSwgY29tcGFyZSkge1xuICAgICAgICB2YXIgYmVnID0gLTEsXG4gICAgICAgICAgICBlbmQgPSBzZXF1ZW5jZS5sZW5ndGggLSAxO1xuICAgICAgICB3aGlsZSAoYmVnIDwgZW5kKSB7XG4gICAgICAgICAgICB2YXIgbWlkID0gYmVnICsgKChlbmQgLSBiZWcgKyAxKSA+Pj4gMSk7XG4gICAgICAgICAgICBpZiAoY29tcGFyZShpdGVtLCBzZXF1ZW5jZVttaWRdKSA+PSAwKSB7XG4gICAgICAgICAgICAgICAgYmVnID0gbWlkO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBtaWQgLSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBiZWc7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2luc2VydChxLCBkYXRhLCBwcmlvcml0eSwgY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKCFxLnN0YXJ0ZWQpIHtcbiAgICAgICAgICAgIHEuc3RhcnRlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFfaXNBcnJheShkYXRhKSkge1xuICAgICAgICAgICAgZGF0YSA9IFtkYXRhXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgLy8gY2FsbCBkcmFpbiBpbW1lZGlhdGVseSBpZiB0aGVyZSBhcmUgbm8gdGFza3NcbiAgICAgICAgICAgIHJldHVybiBzZXRJbW1lZGlhdGUoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgaWYgKHEuZHJhaW4pIHtcbiAgICAgICAgICAgICAgICAgICAgcS5kcmFpbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIF9lYWNoKGRhdGEsIGZ1bmN0aW9uKHRhc2spIHtcbiAgICAgICAgICAgIHZhciBpdGVtID0ge1xuICAgICAgICAgICAgICAgIGRhdGE6IHRhc2ssXG4gICAgICAgICAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5LFxuICAgICAgICAgICAgICAgIGNhbGxiYWNrOiB0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicgPyBjYWxsYmFjayA6IG51bGxcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHEudGFza3Muc3BsaWNlKF9iaW5hcnlTZWFyY2gocS50YXNrcywgaXRlbSwgX2NvbXBhcmVUYXNrcykgKyAxLCAwLCBpdGVtKTtcblxuICAgICAgICAgICAgaWYgKHEuc2F0dXJhdGVkICYmIHEudGFza3MubGVuZ3RoID09PSBxLmNvbmN1cnJlbmN5KSB7XG4gICAgICAgICAgICAgICAgcS5zYXR1cmF0ZWQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNldEltbWVkaWF0ZShxLnByb2Nlc3MpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTdGFydCB3aXRoIGEgbm9ybWFsIHF1ZXVlXG4gICAgdmFyIHE6IGFueSA9IHF1ZXVlKHdvcmtlciwgY29uY3VycmVuY3kpO1xuXG4gICAgLy8gT3ZlcnJpZGUgcHVzaCB0byBhY2NlcHQgc2Vjb25kIHBhcmFtZXRlciByZXByZXNlbnRpbmcgcHJpb3JpdHlcbiAgICBxLnB1c2ggPSBmdW5jdGlvbihkYXRhLCBwcmlvcml0eSwgY2FsbGJhY2spIHtcbiAgICAgICAgX2luc2VydChxLCBkYXRhLCBwcmlvcml0eSwgY2FsbGJhY2spO1xuICAgIH07XG5cbiAgICAvLyBSZW1vdmUgdW5zaGlmdCBmdW5jdGlvblxuICAgIGRlbGV0ZSBxLnVuc2hpZnQ7XG5cbiAgICByZXR1cm4gcTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNhcmdvKHdvcmtlciwgcGF5bG9hZCkge1xuICAgIHZhciB3b3JraW5nID0gZmFsc2UsXG4gICAgICAgIHRhc2tzID0gW107XG5cbiAgICB2YXIgY2FyZ28gPSB7XG4gICAgICAgIHRhc2tzOiB0YXNrcyxcbiAgICAgICAgcGF5bG9hZDogcGF5bG9hZCxcbiAgICAgICAgc2F0dXJhdGVkOiBudWxsLFxuICAgICAgICBlbXB0eTogbnVsbCxcbiAgICAgICAgZHJhaW46IG51bGwsXG4gICAgICAgIGRyYWluZWQ6IHRydWUsXG4gICAgICAgIHB1c2g6IGZ1bmN0aW9uKGRhdGEsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpZiAoIV9pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgZGF0YSA9IFtkYXRhXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF9lYWNoKGRhdGEsIGZ1bmN0aW9uKHRhc2spIHtcbiAgICAgICAgICAgICAgICB0YXNrcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogdGFzayxcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2s6IHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJyA/IGNhbGxiYWNrIDogbnVsbFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNhcmdvLmRyYWluZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAoY2FyZ28uc2F0dXJhdGVkICYmIHRhc2tzLmxlbmd0aCA9PT0gcGF5bG9hZCkge1xuICAgICAgICAgICAgICAgICAgICBjYXJnby5zYXR1cmF0ZWQoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldEltbWVkaWF0ZShjYXJnby5wcm9jZXNzKTtcbiAgICAgICAgfSxcbiAgICAgICAgcHJvY2VzczogZnVuY3Rpb24gcHJvY2VzcygpIHtcbiAgICAgICAgICAgIGlmICh3b3JraW5nKSByZXR1cm47XG4gICAgICAgICAgICBpZiAodGFza3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNhcmdvLmRyYWluICYmICFjYXJnby5kcmFpbmVkKSBjYXJnby5kcmFpbigpO1xuICAgICAgICAgICAgICAgIGNhcmdvLmRyYWluZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHRzID0gdHlwZW9mIHBheWxvYWQgPT09ICdudW1iZXInXG4gICAgICAgICAgICAgICAgPyB0YXNrcy5zcGxpY2UoMCwgcGF5bG9hZClcbiAgICAgICAgICAgICAgICA6IHRhc2tzLnNwbGljZSgwLCB0YXNrcy5sZW5ndGgpO1xuXG4gICAgICAgICAgICB2YXIgZHMgPSBfbWFwKHRzLCBmdW5jdGlvbih0YXNrKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRhc2suZGF0YTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoY2FyZ28uZW1wdHkpIGNhcmdvLmVtcHR5KCk7XG4gICAgICAgICAgICB3b3JraW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIHdvcmtlcihkcywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgd29ya2luZyA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICAgICAgICAgICAgX2VhY2godHMsIGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGEuY2FsbGJhY2suYXBwbHkobnVsbCwgYXJncyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIHByb2Nlc3MoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICBsZW5ndGg6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRhc2tzLmxlbmd0aDtcbiAgICAgICAgfSxcbiAgICAgICAgcnVubmluZzogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gd29ya2luZztcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIGNhcmdvO1xufVxuXG52YXIgX2NvbnNvbGVfZm4gPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgZm4uYXBwbHkobnVsbCwgYXJncy5jb25jYXQoW2Z1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbnNvbGUuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChjb25zb2xlW25hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgIF9lYWNoKGFyZ3MsIGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGVbbmFtZV0oeCk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfV0pKTtcbiAgICB9O1xufTtcbmV4cG9ydCB2YXIgbG9nID0gX2NvbnNvbGVfZm4oJ2xvZycpO1xuZXhwb3J0IHZhciBkaXIgPSBfY29uc29sZV9mbignZGlyJyk7XG4vKmFzeW5jLmluZm8gPSBfY29uc29sZV9mbignaW5mbycpO1xuYXN5bmMud2FybiA9IF9jb25zb2xlX2ZuKCd3YXJuJyk7XG5hc3luYy5lcnJvciA9IF9jb25zb2xlX2ZuKCdlcnJvcicpOyovXG5cbmV4cG9ydCBmdW5jdGlvbiBtZW1vaXplKGZuLCBoYXNoZXIpIHtcbiAgICB2YXIgbWVtbyA9IHt9O1xuICAgIHZhciBxdWV1ZXMgPSB7fTtcbiAgICBoYXNoZXIgPSBoYXNoZXIgfHwgZnVuY3Rpb24oeCkge1xuICAgICAgICByZXR1cm4geDtcbiAgICB9O1xuICAgIHZhciBtZW1vaXplZDogYW55ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gYXJncy5wb3AoKTtcbiAgICAgICAgdmFyIGtleSA9IGhhc2hlci5hcHBseShudWxsLCBhcmdzKTtcbiAgICAgICAgaWYgKGtleSBpbiBtZW1vKSB7XG4gICAgICAgICAgICBuZXh0VGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5hcHBseShudWxsLCBtZW1vW2tleV0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoa2V5IGluIHF1ZXVlcykge1xuICAgICAgICAgICAgcXVldWVzW2tleV0ucHVzaChjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBxdWV1ZXNba2V5XSA9IFtjYWxsYmFja107XG4gICAgICAgICAgICBmbi5hcHBseShudWxsLCBhcmdzLmNvbmNhdChbZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgbWVtb1trZXldID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgICAgIHZhciBxID0gcXVldWVzW2tleV07XG4gICAgICAgICAgICAgICAgZGVsZXRlIHF1ZXVlc1trZXldO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gcS5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgcVtpXS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1dKSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIG1lbW9pemVkLm1lbW8gPSBtZW1vO1xuICAgIG1lbW9pemVkLnVubWVtb2l6ZWQgPSBmbjtcbiAgICByZXR1cm4gbWVtb2l6ZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1bm1lbW9pemUoZm4pIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiAoZm4udW5tZW1vaXplZCB8fCBmbikuYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdGltZXMoY291bnQsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIHZhciBjb3VudGVyID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgIGNvdW50ZXIucHVzaChpKTtcbiAgICB9XG4gICAgcmV0dXJuIG1hcChjb3VudGVyLCBpdGVyYXRvciwgY2FsbGJhY2spO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdGltZXNTZXJpZXMoY291bnQsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIHZhciBjb3VudGVyID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgIGNvdW50ZXIucHVzaChpKTtcbiAgICB9XG4gICAgcmV0dXJuIG1hcFNlcmllcyhjb3VudGVyLCBpdGVyYXRvciwgY2FsbGJhY2spO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VxKC8qIGZ1bmN0aW9ucy4uLiAqLykge1xuICAgIHZhciBmbnMgPSBhcmd1bWVudHM7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gYXJncy5wb3AoKTtcbiAgICAgICAgcmVkdWNlKGZucywgYXJncywgZnVuY3Rpb24obmV3YXJncywgZm4sIGNiKSB7XG4gICAgICAgICAgICBmbi5hcHBseSh0aGF0LCBuZXdhcmdzLmNvbmNhdChbZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIGVyciA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgICAgICAgICB2YXIgbmV4dGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgIGNiKGVyciwgbmV4dGFyZ3MpO1xuICAgICAgICAgICAgfV0pKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uKGVyciwgcmVzdWx0cykge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmFwcGx5KHRoYXQsIFtlcnJdLmNvbmNhdChyZXN1bHRzKSk7XG4gICAgICAgICAgICB9KTtcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29tcG9zZSgvKiBmdW5jdGlvbnMuLi4gKi8pIHtcbiAgICByZXR1cm4gc2VxLmFwcGx5KG51bGwsIEFycmF5LnByb3RvdHlwZS5yZXZlcnNlLmNhbGwoYXJndW1lbnRzKSk7XG59XG5cbnZhciBfYXBwbHlFYWNoID0gZnVuY3Rpb24oZWFjaGZuLCBmbnMgLyphcmdzLi4uKi8pIHtcbiAgICB2YXIgZ28gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3MucG9wKCk7XG4gICAgICAgIHJldHVybiBlYWNoZm4oZm5zLCBmdW5jdGlvbihmbiwgY2IpIHtcbiAgICAgICAgICAgIGZuLmFwcGx5KHRoYXQsIGFyZ3MuY29uY2F0KFtjYl0pKTtcbiAgICAgICAgfSxcbiAgICAgICAgICAgIGNhbGxiYWNrKTtcbiAgICB9O1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMikge1xuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgICAgIHJldHVybiBnby5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBnbztcbiAgICB9XG59XG5leHBvcnQgdmFyIGFwcGx5RWFjaCA9IGRvUGFyYWxsZWwoX2FwcGx5RWFjaCk7XG5leHBvcnQgdmFyIGFwcGx5RWFjaFNlcmllcyA9IGRvU2VyaWVzKF9hcHBseUVhY2gpO1xuXG5leHBvcnQgZnVuY3Rpb24gZm9yZXZlcihmbiwgY2FsbGJhY2spIHtcbiAgICBmdW5jdGlvbiBuZXh0KGVycj8pIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgZm4obmV4dCk7XG4gICAgfVxuICAgIG5leHQoKTtcbn1cbiJdfQ==