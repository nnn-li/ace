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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXN5bmMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2FzeW5jLnRzIl0sIm5hbWVzIjpbIm9ubHlfb25jZSIsIm5leHRUaWNrIiwic2V0SW1tZWRpYXRlIiwiZWFjaCIsImVhY2guZG9uZSIsImVhY2hTZXJpZXMiLCJlYWNoTGltaXQiLCJyZXBsZW5pc2giLCJtYXBMaW1pdCIsInJlZHVjZSIsInJlZHVjZVJpZ2h0Iiwic29tZSIsImV2ZXJ5Iiwic29ydEJ5IiwiYXV0byIsInJldHJ5Iiwid2F0ZXJmYWxsIiwicGFyYWxsZWwiLCJwYXJhbGxlbExpbWl0Iiwic2VyaWVzIiwiaXRlcmF0b3IiLCJhcHBseSIsIndoaWxzdCIsImRvV2hpbHN0IiwidW50aWwiLCJkb1VudGlsIiwicXVldWUiLCJxdWV1ZS5faW5zZXJ0IiwicHJpb3JpdHlRdWV1ZSIsInByaW9yaXR5UXVldWUuX2NvbXBhcmVUYXNrcyIsInByaW9yaXR5UXVldWUuX2JpbmFyeVNlYXJjaCIsInByaW9yaXR5UXVldWUuX2luc2VydCIsImNhcmdvIiwiY2FyZ28ucHJvY2VzcyIsIm1lbW9pemUiLCJ1bm1lbW9pemUiLCJ0aW1lcyIsInRpbWVzU2VyaWVzIiwic2VxIiwiY29tcG9zZSIsImZvcmV2ZXIiLCJmb3JldmVyLm5leHQiXSwibWFwcGluZ3MiOiJBQU9BLG1CQUFtQixFQUFpQjtJQUNoQ0EsSUFBSUEsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0E7SUFDZkEsTUFBTUEsQ0FBQ0E7UUFDUCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFBQyxNQUFNLElBQUksS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUM7UUFDNUQsTUFBTSxHQUFHLElBQUksQ0FBQztRQUVkLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQzlCLENBQUMsQ0FBQUE7QUFDTEEsQ0FBQ0E7QUFJRCxJQUFJLFNBQVMsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFD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O0lBQ3hELENBQUMsQ0FBQ0E7QUFDTkEsQ0FBQ0E7QUFFRCxzQkFBc0IsS0FBSyxFQUFFLFFBQVEsRUFBRSxRQUFRO0lBQzNDQyxJQUFJQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUNqQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsS0FBS0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7UUFDN0JBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQ3BCQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxFQUFFQSxRQUFRQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtBQUM1Q0EsQ0FBQ0E7QUFFRCw0QkFBNEIsS0FBSyxFQUFFLFFBQVEsRUFBRSxRQUFRO0lBQ2pEQyxJQUFJQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUNqQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsS0FBS0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7UUFDN0JBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQ3BCQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxPQUFPQSxFQUFFQSxRQUFRQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtBQUNsREEsQ0FBQ0E7QUFFRDtJQUNJQyxJQUFJQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQTtJQUNwQkEsTUFBTUEsQ0FBQ0E7UUFDSCxJQUFJLElBQUksR0FBRyxJQUFJLENBQUM7UUFDaEIsSUFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2pELElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FB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Oi8vZ2l0aHViLmNvbS9jYW9sYW4vYXN5bmNcbiAqXG4gKiBDb3B5cmlnaHQgMjAxMC0yMDE0IENhb2xhbiBNY01haG9uXG4gKiBSZWxlYXNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2VcbiAqL1xuZnVuY3Rpb24gb25seV9vbmNlKGZuOiAoZXJyKSA9PiB2b2lkKSB7XG4gICAgdmFyIGNhbGxlZCA9IGZhbHNlO1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmIChjYWxsZWQpIHRocm93IG5ldyBFcnJvcihcIkNhbGxiYWNrIHdhcyBhbHJlYWR5IGNhbGxlZC5cIik7XG4gICAgICAgIGNhbGxlZCA9IHRydWU7XG4gICAgICAgIC8vIEZJWE1FOiBOb3Qgc3VyZSB3aGF0IHNob3VsZCByZXBsYWNlIHJvb3QuXG4gICAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxufVxuXG4vLy8vIGNyb3NzLWJyb3dzZXIgY29tcGF0aWJsaXR5IGZ1bmN0aW9ucyAvLy8vXG5cbnZhciBfdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nO1xuXG52YXIgX2lzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBfdG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcblxudmFyIF9lYWNoID0gZnVuY3Rpb24oYXJyLCBpdGVyYXRvcikge1xuICAgIGlmIChhcnIuZm9yRWFjaCkge1xuICAgICAgICByZXR1cm4gYXJyLmZvckVhY2goaXRlcmF0b3IpO1xuICAgIH1cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBpdGVyYXRvcihhcnJbaV0sIGksIGFycik7XG4gICAgfVxufTtcblxudmFyIF9tYXAgPSBmdW5jdGlvbihhcnIsIGl0ZXJhdG9yKSB7XG4gICAgaWYgKGFyci5tYXApIHtcbiAgICAgICAgcmV0dXJuIGFyci5tYXAoaXRlcmF0b3IpO1xuICAgIH1cbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIF9lYWNoKGFyciwgZnVuY3Rpb24oeCwgaSwgYSkge1xuICAgICAgICByZXN1bHRzLnB1c2goaXRlcmF0b3IoeCwgaSwgYSkpO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xufTtcblxudmFyIF9yZWR1Y2UgPSBmdW5jdGlvbihhcnIsIGl0ZXJhdG9yLCBtZW1vKSB7XG4gICAgaWYgKGFyci5yZWR1Y2UpIHtcbiAgICAgICAgcmV0dXJuIGFyci5yZWR1Y2UoaXRlcmF0b3IsIG1lbW8pO1xuICAgIH1cbiAgICBfZWFjaChhcnIsIGZ1bmN0aW9uKHgsIGksIGEpIHtcbiAgICAgICAgbWVtbyA9IGl0ZXJhdG9yKG1lbW8sIHgsIGksIGEpO1xuICAgIH0pO1xuICAgIHJldHVybiBtZW1vO1xufTtcblxudmFyIF9rZXlzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKE9iamVjdC5rZXlzKSB7XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyhvYmopO1xuICAgIH1cbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGsgaW4gb2JqKSB7XG4gICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoaykpIHtcbiAgICAgICAgICAgIGtleXMucHVzaChrKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ga2V5cztcbn07XG5cbi8vLy8gZXhwb3J0ZWQgYXN5bmMgbW9kdWxlIGZ1bmN0aW9ucyAvLy8vXG5cbi8vLy8gbmV4dFRpY2sgaW1wbGVtZW50YXRpb24gd2l0aCBicm93c2VyLWNvbXBhdGlibGUgZmFsbGJhY2sgLy8vL1xuZXhwb3J0IGZ1bmN0aW9uIG5leHRUaWNrKGNhbGxiYWNrOiBhbnkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJuZXh0VGljayBub3QgaW1wbGVtZW50ZWRcIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRJbW1lZGlhdGUoY2FsbGJhY2s6IGFueSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcInNldEltbWVkaWF0ZSBub3QgaW1wbGVtZW50ZWRcIik7XG59XG4vKlxuaWYgKHR5cGVvZiBwcm9jZXNzID09PSAndW5kZWZpbmVkJyB8fCAhKHByb2Nlc3MubmV4dFRpY2spKSB7XG4gICAgaWYgKHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgYXN5bmMubmV4dFRpY2sgPSBmdW5jdGlvbihmbikge1xuICAgICAgICAgICAgLy8gbm90IGEgZGlyZWN0IGFsaWFzIGZvciBJRTEwIGNvbXBhdGliaWxpdHlcbiAgICAgICAgICAgIHNldEltbWVkaWF0ZShmbik7XG4gICAgICAgIH07XG4gICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZSA9IGFzeW5jLm5leHRUaWNrO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgYXN5bmMubmV4dFRpY2sgPSBmdW5jdGlvbihmbikge1xuICAgICAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgICAgIH07XG4gICAgICAgIGFzeW5jLnNldEltbWVkaWF0ZSA9IGFzeW5jLm5leHRUaWNrO1xuICAgIH1cbn1cbmVsc2Uge1xuICAgIG5leHRUaWNrID0gcHJvY2Vzcy5uZXh0VGljaztcbiAgICBpZiAodHlwZW9mIHNldEltbWVkaWF0ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgc2V0SW1tZWRpYXRlID0gZnVuY3Rpb24oZm4pIHtcbiAgICAgICAgICAgIC8vIG5vdCBhIGRpcmVjdCBhbGlhcyBmb3IgSUUxMCBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgICBzZXRJbW1lZGlhdGUoZm4pO1xuICAgICAgICB9O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgc2V0SW1tZWRpYXRlID0gbmV4dFRpY2s7XG4gICAgfVxufVxuKi9cblxuZXhwb3J0IGZ1bmN0aW9uIGVhY2goYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkgeyB9O1xuICAgIGlmICghYXJyLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICB9XG4gICAgdmFyIGNvbXBsZXRlZCA9IDA7XG4gICAgX2VhY2goYXJyLCBmdW5jdGlvbih4KSB7XG4gICAgICAgIGl0ZXJhdG9yKHgsIG9ubHlfb25jZShkb25lKSk7XG4gICAgfSk7XG4gICAgZnVuY3Rpb24gZG9uZShlcnIpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24oKSB7IH07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjb21wbGV0ZWQgKz0gMTtcbiAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5leHBvcnQgdmFyIGZvckVhY2ggPSBlYWNoO1xuXG5leHBvcnQgZnVuY3Rpb24gZWFjaFNlcmllcyhhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7IH07XG4gICAgaWYgKCFhcnIubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjaygpO1xuICAgIH1cbiAgICB2YXIgY29tcGxldGVkID0gMDtcbiAgICB2YXIgaXRlcmF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpdGVyYXRvcihhcnJbY29tcGxldGVkXSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKCkgeyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29tcGxldGVkICs9IDE7XG4gICAgICAgICAgICAgICAgaWYgKGNvbXBsZXRlZCA+PSBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpdGVyYXRlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9O1xuICAgIGl0ZXJhdGUoKTtcbn1cbmV4cG9ydCB2YXIgZm9yRWFjaFNlcmllcyA9IGVhY2hTZXJpZXM7XG5cbmV4cG9ydCBmdW5jdGlvbiBlYWNoTGltaXQoYXJyLCBsaW1pdCwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgdmFyIGZuID0gX2VhY2hMaW1pdChsaW1pdCk7XG4gICAgZm4uYXBwbHkobnVsbCwgW2FyciwgaXRlcmF0b3IsIGNhbGxiYWNrXSk7XG59XG5leHBvcnQgdmFyIGZvckVhY2hMaW1pdCA9IGVhY2hMaW1pdDtcblxudmFyIF9lYWNoTGltaXQgPSBmdW5jdGlvbihsaW1pdCkge1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7IH07XG4gICAgICAgIGlmICghYXJyLmxlbmd0aCB8fCBsaW1pdCA8PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgY29tcGxldGVkID0gMDtcbiAgICAgICAgdmFyIHN0YXJ0ZWQgPSAwO1xuICAgICAgICB2YXIgcnVubmluZyA9IDA7XG5cbiAgICAgICAgKGZ1bmN0aW9uIHJlcGxlbmlzaCgpIHtcbiAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aGlsZSAocnVubmluZyA8IGxpbWl0ICYmIHN0YXJ0ZWQgPCBhcnIubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgc3RhcnRlZCArPSAxO1xuICAgICAgICAgICAgICAgIHJ1bm5pbmcgKz0gMTtcbiAgICAgICAgICAgICAgICBpdGVyYXRvcihhcnJbc3RhcnRlZCAtIDFdLCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24oKSB7IH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wbGV0ZWQgKz0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJ1bm5pbmcgLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBsZW5pc2goKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KSgpO1xuICAgIH07XG59O1xuXG5cbnZhciBkb1BhcmFsbGVsID0gZnVuY3Rpb24oZm4pOiBhbnkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICByZXR1cm4gZm4uYXBwbHkobnVsbCwgW2VhY2hdLmNvbmNhdChhcmdzKSk7XG4gICAgfTtcbn07XG52YXIgZG9QYXJhbGxlbExpbWl0ID0gZnVuY3Rpb24obGltaXQsIGZuKTogKGR1bW15MD8sIGR1bW15MT8sIGR1bW15Mj8pID0+IGFueSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgIHJldHVybiBmbi5hcHBseShudWxsLCBbX2VhY2hMaW1pdChsaW1pdCldLmNvbmNhdChhcmdzKSk7XG4gICAgfTtcbn07XG52YXIgZG9TZXJpZXMgPSBmdW5jdGlvbihmbik6IChhcmcwPywgYXJnMT8sIGFyZzI/KSA9PiBhbnkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICByZXR1cm4gZm4uYXBwbHkobnVsbCwgW2VhY2hTZXJpZXNdLmNvbmNhdChhcmdzKSk7XG4gICAgfTtcbn07XG5cblxudmFyIF9hc3luY01hcCA9IGZ1bmN0aW9uKGVhY2hmbiwgYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICBhcnIgPSBfbWFwKGFyciwgZnVuY3Rpb24oeCwgaSkge1xuICAgICAgICByZXR1cm4geyBpbmRleDogaSwgdmFsdWU6IHggfTtcbiAgICB9KTtcbiAgICBpZiAoIWNhbGxiYWNrKSB7XG4gICAgICAgIGVhY2hmbihhcnIsIGZ1bmN0aW9uKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpdGVyYXRvcih4LnZhbHVlLCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciByZXN1bHRzID0gW107XG4gICAgICAgIGVhY2hmbihhcnIsIGZ1bmN0aW9uKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpdGVyYXRvcih4LnZhbHVlLCBmdW5jdGlvbihlcnIsIHYpIHtcbiAgICAgICAgICAgICAgICByZXN1bHRzW3guaW5kZXhdID0gdjtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgcmVzdWx0cyk7XG4gICAgICAgICAgICB9KTtcbiAgICB9XG59O1xuZXhwb3J0IHZhciBtYXAgPSBkb1BhcmFsbGVsKF9hc3luY01hcCk7XG5leHBvcnQgdmFyIG1hcFNlcmllcyA9IGRvU2VyaWVzKF9hc3luY01hcCk7XG5leHBvcnQgZnVuY3Rpb24gbWFwTGltaXQoYXJyLCBsaW1pdCwgaXRlcmF0b3IsIGNhbGxiYWNrPykge1xuICAgIHJldHVybiBfbWFwTGltaXQobGltaXQpKGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbn1cblxudmFyIF9tYXBMaW1pdCA9IGZ1bmN0aW9uKGxpbWl0KSB7XG4gICAgcmV0dXJuIGRvUGFyYWxsZWxMaW1pdChsaW1pdCwgX2FzeW5jTWFwKTtcbn07XG5cbi8vIHJlZHVjZSBvbmx5IGhhcyBhIHNlcmllcyB2ZXJzaW9uLCBhcyBkb2luZyByZWR1Y2UgaW4gcGFyYWxsZWwgd29uJ3Rcbi8vIHdvcmsgaW4gbWFueSBzaXR1YXRpb25zLlxuZXhwb3J0IGZ1bmN0aW9uIHJlZHVjZShhcnIsIG1lbW8sIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIGVhY2hTZXJpZXMoYXJyLCBmdW5jdGlvbih4LCBjYWxsYmFjaykge1xuICAgICAgICBpdGVyYXRvcihtZW1vLCB4LCBmdW5jdGlvbihlcnIsIHYpIHtcbiAgICAgICAgICAgIG1lbW8gPSB2O1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgfSk7XG4gICAgfSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnIsIG1lbW8pO1xuICAgICAgICB9KTtcbn1cbi8vIGluamVjdCBhbGlhc1xuZXhwb3J0IHZhciBpbmplY3QgPSByZWR1Y2U7XG4vLyBmb2xkbCBhbGlhc1xuZXhwb3J0IHZhciBmb2xkbCA9IHJlZHVjZTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZHVjZVJpZ2h0KGFyciwgbWVtbywgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgdmFyIHJldmVyc2VkID0gX21hcChhcnIsIGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfSkucmV2ZXJzZSgpO1xuICAgIHJlZHVjZShyZXZlcnNlZCwgbWVtbywgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbn1cbi8vIGZvbGRyIGFsaWFzXG5leHBvcnQgdmFyIGZvbGRyID0gcmVkdWNlUmlnaHQ7XG5cbnZhciBfZmlsdGVyID0gZnVuY3Rpb24oZWFjaGZuLCBhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgYXJyID0gX21hcChhcnIsIGZ1bmN0aW9uKHgsIGkpIHtcbiAgICAgICAgcmV0dXJuIHsgaW5kZXg6IGksIHZhbHVlOiB4IH07XG4gICAgfSk7XG4gICAgZWFjaGZuKGFyciwgZnVuY3Rpb24oeCwgY2FsbGJhY2spIHtcbiAgICAgICAgaXRlcmF0b3IoeC52YWx1ZSwgZnVuY3Rpb24odikge1xuICAgICAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2goeCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9KTtcbiAgICB9LCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKF9tYXAocmVzdWx0cy5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYS5pbmRleCAtIGIuaW5kZXg7XG4gICAgICAgICAgICB9KSwgZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geC52YWx1ZTtcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xufVxuZXhwb3J0IHZhciBmaWx0ZXIgPSBkb1BhcmFsbGVsKF9maWx0ZXIpO1xuZXhwb3J0IHZhciBmaWx0ZXJTZXJpZXMgPSBkb1NlcmllcyhfZmlsdGVyKTtcbi8vIHNlbGVjdCBhbGlhc1xuZXhwb3J0IHZhciBzZWxlY3QgPSBmaWx0ZXI7XG5leHBvcnQgdmFyIHNlbGVjdFNlcmllcyA9IGZpbHRlclNlcmllcztcblxudmFyIF9yZWplY3QgPSBmdW5jdGlvbihlYWNoZm4sIGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICBhcnIgPSBfbWFwKGFyciwgZnVuY3Rpb24oeCwgaSkge1xuICAgICAgICByZXR1cm4geyBpbmRleDogaSwgdmFsdWU6IHggfTtcbiAgICB9KTtcbiAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbih4LCBjYWxsYmFjaykge1xuICAgICAgICBpdGVyYXRvcih4LnZhbHVlLCBmdW5jdGlvbih2KSB7XG4gICAgICAgICAgICBpZiAoIXYpIHtcbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2goeCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9KTtcbiAgICB9LCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKF9tYXAocmVzdWx0cy5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYS5pbmRleCAtIGIuaW5kZXg7XG4gICAgICAgICAgICB9KSwgZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geC52YWx1ZTtcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xufVxuZXhwb3J0IHZhciByZWplY3QgPSBkb1BhcmFsbGVsKF9yZWplY3QpO1xuZXhwb3J0IHZhciByZWplY3RTZXJpZXMgPSBkb1NlcmllcyhfcmVqZWN0KTtcblxudmFyIF9kZXRlY3QgPSBmdW5jdGlvbihlYWNoZm4sIGFyciwgaXRlcmF0b3IsIG1haW5fY2FsbGJhY2spIHtcbiAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbih4LCBjYWxsYmFjaykge1xuICAgICAgICBpdGVyYXRvcih4LCBmdW5jdGlvbihyZXN1bHQpIHtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrKHgpO1xuICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2sgPSBmdW5jdGlvbigpIHsgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgbWFpbl9jYWxsYmFjaygpO1xuICAgICAgICB9KTtcbn1cbmV4cG9ydCB2YXIgZGV0ZWN0ID0gZG9QYXJhbGxlbChfZGV0ZWN0KTtcbmV4cG9ydCB2YXIgZGV0ZWN0U2VyaWVzID0gZG9TZXJpZXMoX2RldGVjdCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBzb21lKGFyciwgaXRlcmF0b3IsIG1haW5fY2FsbGJhY2spIHtcbiAgICBlYWNoKGFyciwgZnVuY3Rpb24oeCwgY2FsbGJhY2spIHtcbiAgICAgICAgaXRlcmF0b3IoeCwgZnVuY3Rpb24odikge1xuICAgICAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrKHRydWUpO1xuICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2sgPSBmdW5jdGlvbigpIHsgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH0pO1xuICAgIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgbWFpbl9jYWxsYmFjayhmYWxzZSk7XG4gICAgICAgIH0pO1xufVxuLy8gYW55IGFsaWFzXG5leHBvcnQgdmFyIGFueSA9IHNvbWU7XG5cbmV4cG9ydCBmdW5jdGlvbiBldmVyeShhcnIsIGl0ZXJhdG9yLCBtYWluX2NhbGxiYWNrKSB7XG4gICAgZWFjaChhcnIsIGZ1bmN0aW9uKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgIGl0ZXJhdG9yKHgsIGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICAgIGlmICghdikge1xuICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2soZmFsc2UpO1xuICAgICAgICAgICAgICAgIG1haW5fY2FsbGJhY2sgPSBmdW5jdGlvbigpIHsgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH0pO1xuICAgIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgbWFpbl9jYWxsYmFjayh0cnVlKTtcbiAgICAgICAgfSk7XG59XG4vLyBhbGwgYWxpYXNcbmV4cG9ydCB2YXIgYWxsID0gZXZlcnk7XG5cbmV4cG9ydCBmdW5jdGlvbiBzb3J0QnkoYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICBtYXAoYXJyLCBmdW5jdGlvbih4LCBjYWxsYmFjaykge1xuICAgICAgICBpdGVyYXRvcih4LCBmdW5jdGlvbihlcnIsIGNyaXRlcmlhKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHsgdmFsdWU6IHgsIGNyaXRlcmlhOiBjcml0ZXJpYSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSwgZnVuY3Rpb24oZXJyLCByZXN1bHRzKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgZm4gPSBmdW5jdGlvbihsZWZ0LCByaWdodCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYSA9IGxlZnQuY3JpdGVyaWEsIGIgPSByaWdodC5jcml0ZXJpYTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGEgPCBiID8gLTEgOiBhID4gYiA/IDEgOiAwO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgX21hcChyZXN1bHRzLnNvcnQoZm4pLCBmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB4LnZhbHVlO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhdXRvKHRhc2tzLCBjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7IH07XG4gICAgdmFyIGtleXMgPSBfa2V5cyh0YXNrcyk7XG4gICAgdmFyIHJlbWFpbmluZ1Rhc2tzID0ga2V5cy5sZW5ndGhcbiAgICAgICAgaWYgKCFyZW1haW5pbmdUYXNrcykge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICB9XG5cbiAgICB2YXIgcmVzdWx0cyA9IHt9O1xuXG4gICAgdmFyIGxpc3RlbmVycyA9IFtdO1xuICAgIHZhciBhZGRMaXN0ZW5lciA9IGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgIGxpc3RlbmVycy51bnNoaWZ0KGZuKTtcbiAgICB9O1xuICAgIHZhciByZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdGVuZXJzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICBpZiAobGlzdGVuZXJzW2ldID09PSBmbikge1xuICAgICAgICAgICAgICAgIGxpc3RlbmVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbiAgICB2YXIgdGFza0NvbXBsZXRlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlbWFpbmluZ1Rhc2tzLS1cbiAgICAgICAgICAgIF9lYWNoKGxpc3RlbmVycy5zbGljZSgwKSwgZnVuY3Rpb24oZm4pIHtcbiAgICAgICAgICAgIGZuKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBhZGRMaXN0ZW5lcihmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKCFyZW1haW5pbmdUYXNrcykge1xuICAgICAgICAgICAgdmFyIHRoZUNhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgICAgICAgICAvLyBwcmV2ZW50IGZpbmFsIGNhbGxiYWNrIGZyb20gY2FsbGluZyBpdHNlbGYgaWYgaXQgZXJyb3JzXG4gICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKCkgeyB9O1xuXG4gICAgICAgICAgICB0aGVDYWxsYmFjayhudWxsLCByZXN1bHRzKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgX2VhY2goa2V5cywgZnVuY3Rpb24oaykge1xuICAgICAgICB2YXIgdGFzayA9IF9pc0FycmF5KHRhc2tzW2tdKSA/IHRhc2tzW2tdIDogW3Rhc2tzW2tdXTtcbiAgICAgICAgdmFyIHRhc2tDYWxsYmFjayA9IGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDw9IDEpIHtcbiAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICB2YXIgc2FmZVJlc3VsdHMgPSB7fTtcbiAgICAgICAgICAgICAgICBfZWFjaChfa2V5cyhyZXN1bHRzKSwgZnVuY3Rpb24ocmtleSkge1xuICAgICAgICAgICAgICAgICAgICBzYWZlUmVzdWx0c1tya2V5XSA9IHJlc3VsdHNbcmtleV07XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc2FmZVJlc3VsdHNba10gPSBhcmdzO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgc2FmZVJlc3VsdHMpO1xuICAgICAgICAgICAgICAgIC8vIHN0b3Agc3Vic2VxdWVudCBlcnJvcnMgaGl0dGluZyBjYWxsYmFjayBtdWx0aXBsZSB0aW1lc1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrID0gZnVuY3Rpb24oKSB7IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXN1bHRzW2tdID0gYXJncztcbiAgICAgICAgICAgICAgICBzZXRJbW1lZGlhdGUodGFza0NvbXBsZXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdmFyIHJlcXVpcmVzID0gdGFzay5zbGljZSgwLCBNYXRoLmFicyh0YXNrLmxlbmd0aCAtIDEpKSB8fCBbXTtcbiAgICAgICAgdmFyIHJlYWR5ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gX3JlZHVjZShyZXF1aXJlcywgZnVuY3Rpb24oYSwgeCkge1xuICAgICAgICAgICAgICAgIHJldHVybiAoYSAmJiByZXN1bHRzLmhhc093blByb3BlcnR5KHgpKTtcbiAgICAgICAgICAgIH0sIHRydWUpICYmICFyZXN1bHRzLmhhc093blByb3BlcnR5KGspO1xuICAgICAgICB9O1xuICAgICAgICBpZiAocmVhZHkoKSkge1xuICAgICAgICAgICAgdGFza1t0YXNrLmxlbmd0aCAtIDFdKHRhc2tDYWxsYmFjaywgcmVzdWx0cyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgbGlzdGVuZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVhZHkoKSkge1xuICAgICAgICAgICAgICAgICAgICByZW1vdmVMaXN0ZW5lcihsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgIHRhc2tbdGFzay5sZW5ndGggLSAxXSh0YXNrQ2FsbGJhY2ssIHJlc3VsdHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBhZGRMaXN0ZW5lcihsaXN0ZW5lcik7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJldHJ5KHRpbWVzLCB0YXNrLCBjYWxsYmFjaykge1xuICAgIHZhciBERUZBVUxUX1RJTUVTID0gNTtcbiAgICB2YXIgYXR0ZW1wdHMgPSBbXTtcbiAgICAvLyBVc2UgZGVmYXVsdHMgaWYgdGltZXMgbm90IHBhc3NlZFxuICAgIGlmICh0eXBlb2YgdGltZXMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY2FsbGJhY2sgPSB0YXNrO1xuICAgICAgICB0YXNrID0gdGltZXM7XG4gICAgICAgIHRpbWVzID0gREVGQVVMVF9USU1FUztcbiAgICB9XG4gICAgLy8gTWFrZSBzdXJlIHRpbWVzIGlzIGEgbnVtYmVyXG4gICAgdGltZXMgPSBwYXJzZUludCh0aW1lcywgMTApIHx8IERFRkFVTFRfVElNRVM7XG4gICAgdmFyIHdyYXBwZWRUYXNrID0gZnVuY3Rpb24od3JhcHBlZENhbGxiYWNrPywgd3JhcHBlZFJlc3VsdHM/KTogYW55IHtcbiAgICAgICAgdmFyIHJldHJ5QXR0ZW1wdCA9IGZ1bmN0aW9uKHRhc2ssIGZpbmFsQXR0ZW1wdCkge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKHNlcmllc0NhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgdGFzayhmdW5jdGlvbihlcnIsIHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBzZXJpZXNDYWxsYmFjayghZXJyIHx8IGZpbmFsQXR0ZW1wdCwgeyBlcnI6IGVyciwgcmVzdWx0OiByZXN1bHQgfSk7XG4gICAgICAgICAgICAgICAgfSwgd3JhcHBlZFJlc3VsdHMpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfTtcbiAgICAgICAgd2hpbGUgKHRpbWVzKSB7XG4gICAgICAgICAgICBhdHRlbXB0cy5wdXNoKHJldHJ5QXR0ZW1wdCh0YXNrLCAhKHRpbWVzIC09IDEpKSk7XG4gICAgICAgIH1cbiAgICAgICAgc2VyaWVzKGF0dGVtcHRzLCBmdW5jdGlvbihkb25lLCBkYXRhKSB7XG4gICAgICAgICAgICBkYXRhID0gZGF0YVtkYXRhLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgKHdyYXBwZWRDYWxsYmFjayB8fCBjYWxsYmFjaykoZGF0YS5lcnIsIGRhdGEucmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgICAgICAvLyBJZiBhIGNhbGxiYWNrIGlzIHBhc3NlZCwgcnVuIHRoaXMgYXMgYSBjb250cm9sbCBmbG93XG4gICAgICAgIHJldHVybiBjYWxsYmFjayA/IHdyYXBwZWRUYXNrKCkgOiB3cmFwcGVkVGFza1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2F0ZXJmYWxsKHRhc2tzLCBjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7IH07XG4gICAgaWYgKCFfaXNBcnJheSh0YXNrcykpIHtcbiAgICAgICAgdmFyIGVyciA9IG5ldyBFcnJvcignRmlyc3QgYXJndW1lbnQgdG8gd2F0ZXJmYWxsIG11c3QgYmUgYW4gYXJyYXkgb2YgZnVuY3Rpb25zJyk7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgIH1cbiAgICBpZiAoIXRhc2tzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICB9XG4gICAgdmFyIHdyYXBJdGVyYXRvciA9IGZ1bmN0aW9uKGl0ZXJhdG9yOiBhbnkpOiBhbnkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2suYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKCkgeyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgIHZhciBuZXh0ID0gaXRlcmF0b3IubmV4dCgpO1xuICAgICAgICAgICAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgIGFyZ3MucHVzaCh3cmFwSXRlcmF0b3IobmV4dCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYXJncy5wdXNoKGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2V0SW1tZWRpYXRlKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5hcHBseShudWxsLCBhcmdzKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9O1xuICAgIHdyYXBJdGVyYXRvcihpdGVyYXRvcih0YXNrcykpKCk7XG59XG5cbnZhciBfcGFyYWxsZWwgPSBmdW5jdGlvbihlYWNoZm4sIHRhc2tzLCBjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7IH07XG4gICAgaWYgKF9pc0FycmF5KHRhc2tzKSkge1xuICAgICAgICBlYWNoZm4ubWFwKHRhc2tzLCBmdW5jdGlvbihmbiwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGlmIChmbikge1xuICAgICAgICAgICAgICAgIGZuKGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKG51bGwsIGVyciwgYXJncyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIGNhbGxiYWNrKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZhciByZXN1bHRzID0ge307XG4gICAgICAgIGVhY2hmbi5lYWNoKF9rZXlzKHRhc2tzKSwgZnVuY3Rpb24oaywgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHRhc2tzW2tdKGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzdWx0c1trXSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIHJlc3VsdHMpO1xuICAgICAgICAgICAgfSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyYWxsZWwodGFza3M6IGFueVtdLCBjYWxsYmFjaz86IChlcnIsIHJlc3VsdHMpPT52b2lkKSB7XG4gICAgX3BhcmFsbGVsKHsgbWFwOiBtYXAsIGVhY2g6IGVhY2ggfSwgdGFza3MsIGNhbGxiYWNrKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcmFsbGVsTGltaXQodGFza3MsIGxpbWl0LCBjYWxsYmFjaykge1xuICAgIF9wYXJhbGxlbCh7IG1hcDogX21hcExpbWl0KGxpbWl0KSwgZWFjaDogX2VhY2hMaW1pdChsaW1pdCkgfSwgdGFza3MsIGNhbGxiYWNrKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlcmllcyh0YXNrcywgY2FsbGJhY2spIHtcbiAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkgeyB9O1xuICAgIGlmIChfaXNBcnJheSh0YXNrcykpIHtcbiAgICAgICAgbWFwU2VyaWVzKHRhc2tzLCBmdW5jdGlvbihmbiwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGlmIChmbikge1xuICAgICAgICAgICAgICAgIGZuKGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjay5jYWxsKG51bGwsIGVyciwgYXJncyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIGNhbGxiYWNrKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZhciByZXN1bHRzID0ge307XG4gICAgICAgIGVhY2hTZXJpZXMoX2tleXModGFza3MpLCBmdW5jdGlvbihrLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgdGFza3Nba10oZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGFyZ3MgPSBhcmdzWzBdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXN1bHRzW2tdID0gYXJncztcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVyciwgcmVzdWx0cyk7XG4gICAgICAgICAgICB9KTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpdGVyYXRvcih0YXNrcykge1xuICAgIHZhciBtYWtlQ2FsbGJhY2sgPSBmdW5jdGlvbihpbmRleCkge1xuICAgICAgICB2YXIgZm46IGFueSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHRhc2tzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRhc2tzW2luZGV4XS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZuLm5leHQoKTtcbiAgICAgICAgfTtcbiAgICAgICAgZm4ubmV4dCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIChpbmRleCA8IHRhc2tzLmxlbmd0aCAtIDEpID8gbWFrZUNhbGxiYWNrKGluZGV4ICsgMSkgOiBudWxsO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gZm47XG4gICAgfTtcbiAgICByZXR1cm4gbWFrZUNhbGxiYWNrKDApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHkoZm4pIHtcbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gZm4uYXBwbHkoXG4gICAgICAgICAgICBudWxsLCBhcmdzLmNvbmNhdChBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpKVxuICAgICAgICAgICAgKTtcbiAgICB9O1xufVxuXG52YXIgX2NvbmNhdCA9IGZ1bmN0aW9uKGVhY2hmbiwgYXJyLCBmbiwgY2FsbGJhY2spIHtcbiAgICB2YXIgciA9IFtdO1xuICAgIGVhY2hmbihhcnIsIGZ1bmN0aW9uKHgsIGNiKSB7XG4gICAgICAgIGZuKHgsIGZ1bmN0aW9uKGVyciwgeSkge1xuICAgICAgICAgICAgciA9IHIuY29uY2F0KHkgfHwgW10pO1xuICAgICAgICAgICAgY2IoZXJyKTtcbiAgICAgICAgfSk7XG4gICAgfSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnIsIHIpO1xuICAgICAgICB9KTtcbn07XG5leHBvcnQgdmFyIGNvbmNhdCA9IGRvUGFyYWxsZWwoX2NvbmNhdCk7XG5leHBvcnQgdmFyIGNvbmNhdFNlcmllcyA9IGRvU2VyaWVzKF9jb25jYXQpO1xuXG5leHBvcnQgZnVuY3Rpb24gd2hpbHN0KHRlc3QsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIGlmICh0ZXN0KCkpIHtcbiAgICAgICAgaXRlcmF0b3IoZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3aGlsc3QodGVzdCwgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBjYWxsYmFjaygpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRvV2hpbHN0KGl0ZXJhdG9yLCB0ZXN0LCBjYWxsYmFjaykge1xuICAgIGl0ZXJhdG9yKGZ1bmN0aW9uKGVycikge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgIGlmICh0ZXN0LmFwcGx5KG51bGwsIGFyZ3MpKSB7XG4gICAgICAgICAgICBkb1doaWxzdChpdGVyYXRvciwgdGVzdCwgY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdW50aWwodGVzdCwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgaWYgKCF0ZXN0KCkpIHtcbiAgICAgICAgaXRlcmF0b3IoZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB1bnRpbCh0ZXN0LCBpdGVyYXRvciwgY2FsbGJhY2spO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGNhbGxiYWNrKCk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZG9VbnRpbChpdGVyYXRvciwgdGVzdCwgY2FsbGJhY2spIHtcbiAgICBpdGVyYXRvcihmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICBpZiAoIXRlc3QuYXBwbHkobnVsbCwgYXJncykpIHtcbiAgICAgICAgICAgIGRvVW50aWwoaXRlcmF0b3IsIHRlc3QsIGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHF1ZXVlKHdvcmtlciwgY29uY3VycmVuY3kpIHtcbiAgICBpZiAoY29uY3VycmVuY3kgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25jdXJyZW5jeSA9IDE7XG4gICAgfVxuICAgIGZ1bmN0aW9uIF9pbnNlcnQocSwgZGF0YSwgcG9zLCBjYWxsYmFjaykge1xuICAgICAgICBpZiAoIXEuc3RhcnRlZCkge1xuICAgICAgICAgICAgcS5zdGFydGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIV9pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgICAgICBkYXRhID0gW2RhdGFdO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkYXRhLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICAvLyBjYWxsIGRyYWluIGltbWVkaWF0ZWx5IGlmIHRoZXJlIGFyZSBubyB0YXNrc1xuICAgICAgICAgICAgcmV0dXJuIHNldEltbWVkaWF0ZShmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBpZiAocS5kcmFpbikge1xuICAgICAgICAgICAgICAgICAgICBxLmRyYWluKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgX2VhY2goZGF0YSwgZnVuY3Rpb24odGFzaykge1xuICAgICAgICAgICAgdmFyIGl0ZW0gPSB7XG4gICAgICAgICAgICAgICAgZGF0YTogdGFzayxcbiAgICAgICAgICAgICAgICBjYWxsYmFjazogdHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nID8gY2FsbGJhY2sgOiBudWxsXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAocG9zKSB7XG4gICAgICAgICAgICAgICAgcS50YXNrcy51bnNoaWZ0KGl0ZW0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBxLnRhc2tzLnB1c2goaXRlbSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChxLnNhdHVyYXRlZCAmJiBxLnRhc2tzLmxlbmd0aCA9PT0gcS5jb25jdXJyZW5jeSkge1xuICAgICAgICAgICAgICAgIHEuc2F0dXJhdGVkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZXRJbW1lZGlhdGUocS5wcm9jZXNzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgdmFyIHdvcmtlcnMgPSAwO1xuICAgIHZhciBxID0ge1xuICAgICAgICB0YXNrczogW10sXG4gICAgICAgIGNvbmN1cnJlbmN5OiBjb25jdXJyZW5jeSxcbiAgICAgICAgc2F0dXJhdGVkOiBudWxsLFxuICAgICAgICBlbXB0eTogbnVsbCxcbiAgICAgICAgZHJhaW46IG51bGwsXG4gICAgICAgIHN0YXJ0ZWQ6IGZhbHNlLFxuICAgICAgICBwYXVzZWQ6IGZhbHNlLFxuICAgICAgICBwdXNoOiBmdW5jdGlvbihkYXRhLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgX2luc2VydChxLCBkYXRhLCBmYWxzZSwgY2FsbGJhY2spO1xuICAgICAgICB9LFxuICAgICAgICBraWxsOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHEuZHJhaW4gPSBudWxsO1xuICAgICAgICAgICAgcS50YXNrcyA9IFtdO1xuICAgICAgICB9LFxuICAgICAgICB1bnNoaWZ0OiBmdW5jdGlvbihkYXRhLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgX2luc2VydChxLCBkYXRhLCB0cnVlLCBjYWxsYmFjayk7XG4gICAgICAgIH0sXG4gICAgICAgIHByb2Nlc3M6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKCFxLnBhdXNlZCAmJiB3b3JrZXJzIDwgcS5jb25jdXJyZW5jeSAmJiBxLnRhc2tzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHZhciB0YXNrID0gcS50YXNrcy5zaGlmdCgpO1xuICAgICAgICAgICAgICAgIGlmIChxLmVtcHR5ICYmIHEudGFza3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHEuZW1wdHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgd29ya2VycyArPSAxO1xuICAgICAgICAgICAgICAgIHZhciBuZXh0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHdvcmtlcnMgLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRhc2suY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhc2suY2FsbGJhY2suYXBwbHkodGFzaywgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAocS5kcmFpbiAmJiBxLnRhc2tzLmxlbmd0aCArIHdvcmtlcnMgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHEuZHJhaW4oKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBxLnByb2Nlc3MoKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHZhciBjYiA9IG9ubHlfb25jZShuZXh0KTtcbiAgICAgICAgICAgICAgICB3b3JrZXIodGFzay5kYXRhLCBjYik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGxlbmd0aDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gcS50YXNrcy5sZW5ndGg7XG4gICAgICAgIH0sXG4gICAgICAgIHJ1bm5pbmc6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHdvcmtlcnM7XG4gICAgICAgIH0sXG4gICAgICAgIGlkbGU6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHEudGFza3MubGVuZ3RoICsgd29ya2VycyA9PT0gMDtcbiAgICAgICAgfSxcbiAgICAgICAgcGF1c2U6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHEucGF1c2VkID09PSB0cnVlKSB7IHJldHVybjsgfVxuICAgICAgICAgICAgcS5wYXVzZWQgPSB0cnVlO1xuICAgICAgICAgICAgcS5wcm9jZXNzKCk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlc3VtZTogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAocS5wYXVzZWQgPT09IGZhbHNlKSB7IHJldHVybjsgfVxuICAgICAgICAgICAgcS5wYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHEucHJvY2VzcygpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gcTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByaW9yaXR5UXVldWUod29ya2VyLCBjb25jdXJyZW5jeSkge1xuXG4gICAgZnVuY3Rpb24gX2NvbXBhcmVUYXNrcyhhLCBiKSB7XG4gICAgICAgIHJldHVybiBhLnByaW9yaXR5IC0gYi5wcmlvcml0eTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gX2JpbmFyeVNlYXJjaChzZXF1ZW5jZSwgaXRlbSwgY29tcGFyZSkge1xuICAgICAgICB2YXIgYmVnID0gLTEsXG4gICAgICAgICAgICBlbmQgPSBzZXF1ZW5jZS5sZW5ndGggLSAxO1xuICAgICAgICB3aGlsZSAoYmVnIDwgZW5kKSB7XG4gICAgICAgICAgICB2YXIgbWlkID0gYmVnICsgKChlbmQgLSBiZWcgKyAxKSA+Pj4gMSk7XG4gICAgICAgICAgICBpZiAoY29tcGFyZShpdGVtLCBzZXF1ZW5jZVttaWRdKSA+PSAwKSB7XG4gICAgICAgICAgICAgICAgYmVnID0gbWlkO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBtaWQgLSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBiZWc7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2luc2VydChxLCBkYXRhLCBwcmlvcml0eSwgY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKCFxLnN0YXJ0ZWQpIHtcbiAgICAgICAgICAgIHEuc3RhcnRlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFfaXNBcnJheShkYXRhKSkge1xuICAgICAgICAgICAgZGF0YSA9IFtkYXRhXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgLy8gY2FsbCBkcmFpbiBpbW1lZGlhdGVseSBpZiB0aGVyZSBhcmUgbm8gdGFza3NcbiAgICAgICAgICAgIHJldHVybiBzZXRJbW1lZGlhdGUoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgaWYgKHEuZHJhaW4pIHtcbiAgICAgICAgICAgICAgICAgICAgcS5kcmFpbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIF9lYWNoKGRhdGEsIGZ1bmN0aW9uKHRhc2spIHtcbiAgICAgICAgICAgIHZhciBpdGVtID0ge1xuICAgICAgICAgICAgICAgIGRhdGE6IHRhc2ssXG4gICAgICAgICAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5LFxuICAgICAgICAgICAgICAgIGNhbGxiYWNrOiB0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicgPyBjYWxsYmFjayA6IG51bGxcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHEudGFza3Muc3BsaWNlKF9iaW5hcnlTZWFyY2gocS50YXNrcywgaXRlbSwgX2NvbXBhcmVUYXNrcykgKyAxLCAwLCBpdGVtKTtcblxuICAgICAgICAgICAgaWYgKHEuc2F0dXJhdGVkICYmIHEudGFza3MubGVuZ3RoID09PSBxLmNvbmN1cnJlbmN5KSB7XG4gICAgICAgICAgICAgICAgcS5zYXR1cmF0ZWQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNldEltbWVkaWF0ZShxLnByb2Nlc3MpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTdGFydCB3aXRoIGEgbm9ybWFsIHF1ZXVlXG4gICAgdmFyIHE6IGFueSA9IHF1ZXVlKHdvcmtlciwgY29uY3VycmVuY3kpO1xuXG4gICAgLy8gT3ZlcnJpZGUgcHVzaCB0byBhY2NlcHQgc2Vjb25kIHBhcmFtZXRlciByZXByZXNlbnRpbmcgcHJpb3JpdHlcbiAgICBxLnB1c2ggPSBmdW5jdGlvbihkYXRhLCBwcmlvcml0eSwgY2FsbGJhY2spIHtcbiAgICAgICAgX2luc2VydChxLCBkYXRhLCBwcmlvcml0eSwgY2FsbGJhY2spO1xuICAgIH07XG5cbiAgICAvLyBSZW1vdmUgdW5zaGlmdCBmdW5jdGlvblxuICAgIGRlbGV0ZSBxLnVuc2hpZnQ7XG5cbiAgICByZXR1cm4gcTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNhcmdvKHdvcmtlciwgcGF5bG9hZCkge1xuICAgIHZhciB3b3JraW5nID0gZmFsc2UsXG4gICAgICAgIHRhc2tzID0gW107XG5cbiAgICB2YXIgY2FyZ28gPSB7XG4gICAgICAgIHRhc2tzOiB0YXNrcyxcbiAgICAgICAgcGF5bG9hZDogcGF5bG9hZCxcbiAgICAgICAgc2F0dXJhdGVkOiBudWxsLFxuICAgICAgICBlbXB0eTogbnVsbCxcbiAgICAgICAgZHJhaW46IG51bGwsXG4gICAgICAgIGRyYWluZWQ6IHRydWUsXG4gICAgICAgIHB1c2g6IGZ1bmN0aW9uKGRhdGEsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpZiAoIV9pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgZGF0YSA9IFtkYXRhXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF9lYWNoKGRhdGEsIGZ1bmN0aW9uKHRhc2spIHtcbiAgICAgICAgICAgICAgICB0YXNrcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogdGFzayxcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2s6IHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJyA/IGNhbGxiYWNrIDogbnVsbFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNhcmdvLmRyYWluZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAoY2FyZ28uc2F0dXJhdGVkICYmIHRhc2tzLmxlbmd0aCA9PT0gcGF5bG9hZCkge1xuICAgICAgICAgICAgICAgICAgICBjYXJnby5zYXR1cmF0ZWQoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHNldEltbWVkaWF0ZShjYXJnby5wcm9jZXNzKTtcbiAgICAgICAgfSxcbiAgICAgICAgcHJvY2VzczogZnVuY3Rpb24gcHJvY2VzcygpIHtcbiAgICAgICAgICAgIGlmICh3b3JraW5nKSByZXR1cm47XG4gICAgICAgICAgICBpZiAodGFza3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNhcmdvLmRyYWluICYmICFjYXJnby5kcmFpbmVkKSBjYXJnby5kcmFpbigpO1xuICAgICAgICAgICAgICAgIGNhcmdvLmRyYWluZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHRzID0gdHlwZW9mIHBheWxvYWQgPT09ICdudW1iZXInXG4gICAgICAgICAgICAgICAgPyB0YXNrcy5zcGxpY2UoMCwgcGF5bG9hZClcbiAgICAgICAgICAgICAgICA6IHRhc2tzLnNwbGljZSgwLCB0YXNrcy5sZW5ndGgpO1xuXG4gICAgICAgICAgICB2YXIgZHMgPSBfbWFwKHRzLCBmdW5jdGlvbih0YXNrKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRhc2suZGF0YTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoY2FyZ28uZW1wdHkpIGNhcmdvLmVtcHR5KCk7XG4gICAgICAgICAgICB3b3JraW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIHdvcmtlcihkcywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgd29ya2luZyA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICAgICAgICAgICAgX2VhY2godHMsIGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGEuY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGEuY2FsbGJhY2suYXBwbHkobnVsbCwgYXJncyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIHByb2Nlc3MoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuICAgICAgICBsZW5ndGg6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRhc2tzLmxlbmd0aDtcbiAgICAgICAgfSxcbiAgICAgICAgcnVubmluZzogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gd29ya2luZztcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIGNhcmdvO1xufVxuXG52YXIgX2NvbnNvbGVfZm4gPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgZm4uYXBwbHkobnVsbCwgYXJncy5jb25jYXQoW2Z1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbnNvbGUuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChjb25zb2xlW25hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgIF9lYWNoKGFyZ3MsIGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGVbbmFtZV0oeCk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfV0pKTtcbiAgICB9O1xufTtcbmV4cG9ydCB2YXIgbG9nID0gX2NvbnNvbGVfZm4oJ2xvZycpO1xuZXhwb3J0IHZhciBkaXIgPSBfY29uc29sZV9mbignZGlyJyk7XG4vKmFzeW5jLmluZm8gPSBfY29uc29sZV9mbignaW5mbycpO1xuYXN5bmMud2FybiA9IF9jb25zb2xlX2ZuKCd3YXJuJyk7XG5hc3luYy5lcnJvciA9IF9jb25zb2xlX2ZuKCdlcnJvcicpOyovXG5cbmV4cG9ydCBmdW5jdGlvbiBtZW1vaXplKGZuLCBoYXNoZXIpIHtcbiAgICB2YXIgbWVtbyA9IHt9O1xuICAgIHZhciBxdWV1ZXMgPSB7fTtcbiAgICBoYXNoZXIgPSBoYXNoZXIgfHwgZnVuY3Rpb24oeCkge1xuICAgICAgICByZXR1cm4geDtcbiAgICB9O1xuICAgIHZhciBtZW1vaXplZDogYW55ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gYXJncy5wb3AoKTtcbiAgICAgICAgdmFyIGtleSA9IGhhc2hlci5hcHBseShudWxsLCBhcmdzKTtcbiAgICAgICAgaWYgKGtleSBpbiBtZW1vKSB7XG4gICAgICAgICAgICBuZXh0VGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5hcHBseShudWxsLCBtZW1vW2tleV0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoa2V5IGluIHF1ZXVlcykge1xuICAgICAgICAgICAgcXVldWVzW2tleV0ucHVzaChjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBxdWV1ZXNba2V5XSA9IFtjYWxsYmFja107XG4gICAgICAgICAgICBmbi5hcHBseShudWxsLCBhcmdzLmNvbmNhdChbZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgbWVtb1trZXldID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgICAgIHZhciBxID0gcXVldWVzW2tleV07XG4gICAgICAgICAgICAgICAgZGVsZXRlIHF1ZXVlc1trZXldO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gcS5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgcVtpXS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1dKSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIG1lbW9pemVkLm1lbW8gPSBtZW1vO1xuICAgIG1lbW9pemVkLnVubWVtb2l6ZWQgPSBmbjtcbiAgICByZXR1cm4gbWVtb2l6ZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1bm1lbW9pemUoZm4pIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiAoZm4udW5tZW1vaXplZCB8fCBmbikuYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdGltZXMoY291bnQsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIHZhciBjb3VudGVyID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgIGNvdW50ZXIucHVzaChpKTtcbiAgICB9XG4gICAgcmV0dXJuIG1hcChjb3VudGVyLCBpdGVyYXRvciwgY2FsbGJhY2spO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdGltZXNTZXJpZXMoY291bnQsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIHZhciBjb3VudGVyID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgIGNvdW50ZXIucHVzaChpKTtcbiAgICB9XG4gICAgcmV0dXJuIG1hcFNlcmllcyhjb3VudGVyLCBpdGVyYXRvciwgY2FsbGJhY2spO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VxKC8qIGZ1bmN0aW9ucy4uLiAqLykge1xuICAgIHZhciBmbnMgPSBhcmd1bWVudHM7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gYXJncy5wb3AoKTtcbiAgICAgICAgcmVkdWNlKGZucywgYXJncywgZnVuY3Rpb24obmV3YXJncywgZm4sIGNiKSB7XG4gICAgICAgICAgICBmbi5hcHBseSh0aGF0LCBuZXdhcmdzLmNvbmNhdChbZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIGVyciA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgICAgICAgICB2YXIgbmV4dGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgIGNiKGVyciwgbmV4dGFyZ3MpO1xuICAgICAgICAgICAgfV0pKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uKGVyciwgcmVzdWx0cykge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmFwcGx5KHRoYXQsIFtlcnJdLmNvbmNhdChyZXN1bHRzKSk7XG4gICAgICAgICAgICB9KTtcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29tcG9zZSgvKiBmdW5jdGlvbnMuLi4gKi8pIHtcbiAgICByZXR1cm4gc2VxLmFwcGx5KG51bGwsIEFycmF5LnByb3RvdHlwZS5yZXZlcnNlLmNhbGwoYXJndW1lbnRzKSk7XG59XG5cbnZhciBfYXBwbHlFYWNoID0gZnVuY3Rpb24oZWFjaGZuLCBmbnMgLyphcmdzLi4uKi8pIHtcbiAgICB2YXIgZ28gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3MucG9wKCk7XG4gICAgICAgIHJldHVybiBlYWNoZm4oZm5zLCBmdW5jdGlvbihmbiwgY2IpIHtcbiAgICAgICAgICAgIGZuLmFwcGx5KHRoYXQsIGFyZ3MuY29uY2F0KFtjYl0pKTtcbiAgICAgICAgfSxcbiAgICAgICAgICAgIGNhbGxiYWNrKTtcbiAgICB9O1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMikge1xuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgICAgIHJldHVybiBnby5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBnbztcbiAgICB9XG59XG5leHBvcnQgdmFyIGFwcGx5RWFjaCA9IGRvUGFyYWxsZWwoX2FwcGx5RWFjaCk7XG5leHBvcnQgdmFyIGFwcGx5RWFjaFNlcmllcyA9IGRvU2VyaWVzKF9hcHBseUVhY2gpO1xuXG5leHBvcnQgZnVuY3Rpb24gZm9yZXZlcihmbiwgY2FsbGJhY2spIHtcbiAgICBmdW5jdGlvbiBuZXh0KGVycj8pIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgZm4obmV4dCk7XG4gICAgfVxuICAgIG5leHQoKTtcbn1cbiJdfQ==