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
function nextTick(callback) {
    throw new Error("nextTick not implemented");
}
exports.nextTick = nextTick;
function setImmediate(callback) {
    throw new Error("setImmediate not implemented");
}
exports.setImmediate = setImmediate;
function each(arr, iterator, callback) {
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
exports.each = each;
exports.forEach = each;
function eachSeries(arr, iterator, callback) {
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
exports.eachSeries = eachSeries;
exports.forEachSeries = eachSeries;
function eachLimit(arr, limit, iterator, callback) {
    var fn = _eachLimit(limit);
    fn.apply(null, [arr, iterator, callback]);
}
exports.eachLimit = eachLimit;
exports.forEachLimit = eachLimit;
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
exports.map = doParallel(_asyncMap);
exports.mapSeries = doSeries(_asyncMap);
function mapLimit(arr, limit, iterator, callback) {
    return _mapLimit(limit)(arr, iterator, callback);
}
exports.mapLimit = mapLimit;
var _mapLimit = function (limit) {
    return doParallelLimit(limit, _asyncMap);
};
function reduce(arr, memo, iterator, callback) {
    eachSeries(arr, function (x, callback) {
        iterator(memo, x, function (err, v) {
            memo = v;
            callback(err);
        });
    }, function (err) {
        callback(err, memo);
    });
}
exports.reduce = reduce;
exports.inject = reduce;
exports.foldl = reduce;
function reduceRight(arr, memo, iterator, callback) {
    var reversed = _map(arr, function (x) {
        return x;
    }).reverse();
    reduce(reversed, memo, iterator, callback);
}
exports.reduceRight = reduceRight;
exports.foldr = reduceRight;
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
exports.filter = doParallel(_filter);
exports.filterSeries = doSeries(_filter);
exports.select = exports.filter;
exports.selectSeries = exports.filterSeries;
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
exports.reject = doParallel(_reject);
exports.rejectSeries = doSeries(_reject);
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
exports.detect = doParallel(_detect);
exports.detectSeries = doSeries(_detect);
function some(arr, iterator, main_callback) {
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
exports.some = some;
exports.any = some;
function every(arr, iterator, main_callback) {
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
exports.every = every;
exports.all = every;
function sortBy(arr, iterator, callback) {
    exports.map(arr, function (x, callback) {
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
exports.sortBy = sortBy;
function auto(tasks, callback) {
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
exports.auto = auto;
function retry(times, task, callback) {
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
exports.retry = retry;
function waterfall(tasks, callback) {
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
exports.waterfall = waterfall;
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
function parallel(tasks, callback) {
    _parallel({ map: exports.map, each: each }, tasks, callback);
}
exports.parallel = parallel;
function parallelLimit(tasks, limit, callback) {
    _parallel({ map: _mapLimit(limit), each: _eachLimit(limit) }, tasks, callback);
}
exports.parallelLimit = parallelLimit;
function series(tasks, callback) {
    callback = callback || function () { };
    if (_isArray(tasks)) {
        exports.mapSeries(tasks, function (fn, callback) {
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
exports.series = series;
function iterator(tasks) {
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
exports.iterator = iterator;
function apply(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return function () {
        return fn.apply(null, args.concat(Array.prototype.slice.call(arguments)));
    };
}
exports.apply = apply;
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
exports.concat = doParallel(_concat);
exports.concatSeries = doSeries(_concat);
function whilst(test, iterator, callback) {
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
exports.whilst = whilst;
function doWhilst(iterator, test, callback) {
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
exports.doWhilst = doWhilst;
function until(test, iterator, callback) {
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
exports.until = until;
function doUntil(iterator, test, callback) {
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
exports.doUntil = doUntil;
function queue(worker, concurrency) {
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
exports.queue = queue;
function priorityQueue(worker, concurrency) {
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
exports.priorityQueue = priorityQueue;
function cargo(worker, payload) {
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
exports.cargo = cargo;
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
exports.log = _console_fn('log');
exports.dir = _console_fn('dir');
function memoize(fn, hasher) {
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
exports.memoize = memoize;
function unmemoize(fn) {
    return function () {
        return (fn.unmemoized || fn).apply(null, arguments);
    };
}
exports.unmemoize = unmemoize;
function times(count, iterator, callback) {
    var counter = [];
    for (var i = 0; i < count; i++) {
        counter.push(i);
    }
    return exports.map(counter, iterator, callback);
}
exports.times = times;
function timesSeries(count, iterator, callback) {
    var counter = [];
    for (var i = 0; i < count; i++) {
        counter.push(i);
    }
    return exports.mapSeries(counter, iterator, callback);
}
exports.timesSeries = timesSeries;
function seq() {
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
exports.seq = seq;
function compose() {
    return seq.apply(null, Array.prototype.reverse.call(arguments));
}
exports.compose = compose;
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
exports.applyEach = doParallel(_applyEach);
exports.applyEachSeries = doSeries(_applyEach);
function forever(fn, callback) {
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
exports.forever = forever;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXN5bmMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2FzeW5jLnRzIl0sIm5hbWVzIjpbIm9ubHlfb25jZSIsIm5leHRUaWNrIiwic2V0SW1tZWRpYXRlIiwiZWFjaCIsImVhY2guZG9uZSIsImVhY2hTZXJpZXMiLCJlYWNoTGltaXQiLCJyZXBsZW5pc2giLCJtYXBMaW1pdCIsInJlZHVjZSIsInJlZHVjZVJpZ2h0Iiwic29tZSIsImV2ZXJ5Iiwic29ydEJ5IiwiYXV0byIsInJldHJ5Iiwid2F0ZXJmYWxsIiwicGFyYWxsZWwiLCJwYXJhbGxlbExpbWl0Iiwic2VyaWVzIiwiaXRlcmF0b3IiLCJhcHBseSIsIndoaWxzdCIsImRvV2hpbHN0IiwidW50aWwiLCJkb1VudGlsIiwicXVldWUiLCJxdWV1ZS5faW5zZXJ0IiwicHJpb3JpdHlRdWV1ZSIsInByaW9yaXR5UXVldWUuX2NvbXBhcmVUYXNrcyIsInByaW9yaXR5UXVldWUuX2JpbmFyeVNlYXJjaCIsInByaW9yaXR5UXVldWUuX2luc2VydCIsImNhcmdvIiwiY2FyZ28ucHJvY2VzcyIsIm1lbW9pemUiLCJ1bm1lbW9pemUiLCJ0aW1lcyIsInRpbWVzU2VyaWVzIiwic2VxIiwiY29tcG9zZSIsImZvcmV2ZXIiLCJmb3JldmVyLm5leHQiXSwibWFwcGluZ3MiOiJBQU9BLG1CQUFtQixFQUFpQjtJQUNoQ0EsSUFBSUEsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0E7SUFDZkEsTUFBTUEsQ0FBQ0E7UUFDUCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFBQyxNQUFNLElBQUksS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUM7UUFDNUQsTUFBTSxHQUFHLElBQUksQ0FBQztRQUVkLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQzlCLENBQUMsQ0FBQUE7QUFDTEEsQ0FBQ0E7QUFJRCxJQUFJLFNBQVMsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFD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QztRQUNwRCxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUNELElBQUksQ0FBQyxDQUFDO1FBQ0YsTUFBTSxDQUFDLEVBQUUsQ0FBQztJQUNkLENBQUM7QUFDTCxDQUFDLENBQUE7QUFDVSxpQkFBUyxHQUFHLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUNuQyx1QkFBZSxHQUFHLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUVsRCxpQkFBd0IsRUFBRSxFQUFFLFFBQVE7SUFDaENDLGNBQWNBLEdBQUlBO1FBQ2RDLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ05BLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUNYQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN6QkEsQ0FBQ0E7WUFDREEsTUFBTUEsR0FBR0EsQ0FBQ0E7UUFDZEEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDYkEsQ0FBQ0E7SUFDREQsSUFBSUEsRUFBRUEsQ0FBQ0E7QUFDWEEsQ0FBQ0E7QUFYZSxlQUFPLFVBV3RCLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKiFcbiAqIGFzeW5jXG4gKiBodHRwczovL2dpdGh1Yi5jb20vY2FvbGFuL2FzeW5jXG4gKlxuICogQ29weXJpZ2h0IDIwMTAtMjAxNCBDYW9sYW4gTWNNYWhvblxuICogUmVsZWFzZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlXG4gKi9cbmZ1bmN0aW9uIG9ubHlfb25jZShmbjogKGVycikgPT4gdm9pZCkge1xuICAgIHZhciBjYWxsZWQgPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoY2FsbGVkKSB0aHJvdyBuZXcgRXJyb3IoXCJDYWxsYmFjayB3YXMgYWxyZWFkeSBjYWxsZWQuXCIpO1xuICAgICAgICBjYWxsZWQgPSB0cnVlO1xuICAgICAgICAvLyBGSVhNRTogTm90IHN1cmUgd2hhdCBzaG91bGQgcmVwbGFjZSByb290LlxuICAgICAgICBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH1cbn1cblxuLy8vLyBjcm9zcy1icm93c2VyIGNvbXBhdGlibGl0eSBmdW5jdGlvbnMgLy8vL1xuXG52YXIgX3RvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZztcblxudmFyIF9pc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gX3RvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG5cbnZhciBfZWFjaCA9IGZ1bmN0aW9uKGFyciwgaXRlcmF0b3IpIHtcbiAgICBpZiAoYXJyLmZvckVhY2gpIHtcbiAgICAgICAgcmV0dXJuIGFyci5mb3JFYWNoKGl0ZXJhdG9yKTtcbiAgICB9XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgaXRlcmF0b3IoYXJyW2ldLCBpLCBhcnIpO1xuICAgIH1cbn07XG5cbnZhciBfbWFwID0gZnVuY3Rpb24oYXJyLCBpdGVyYXRvcikge1xuICAgIGlmIChhcnIubWFwKSB7XG4gICAgICAgIHJldHVybiBhcnIubWFwKGl0ZXJhdG9yKTtcbiAgICB9XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICBfZWFjaChhcnIsIGZ1bmN0aW9uKHgsIGksIGEpIHtcbiAgICAgICAgcmVzdWx0cy5wdXNoKGl0ZXJhdG9yKHgsIGksIGEpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbn07XG5cbnZhciBfcmVkdWNlID0gZnVuY3Rpb24oYXJyLCBpdGVyYXRvciwgbWVtbykge1xuICAgIGlmIChhcnIucmVkdWNlKSB7XG4gICAgICAgIHJldHVybiBhcnIucmVkdWNlKGl0ZXJhdG9yLCBtZW1vKTtcbiAgICB9XG4gICAgX2VhY2goYXJyLCBmdW5jdGlvbih4LCBpLCBhKSB7XG4gICAgICAgIG1lbW8gPSBpdGVyYXRvcihtZW1vLCB4LCBpLCBhKTtcbiAgICB9KTtcbiAgICByZXR1cm4gbWVtbztcbn07XG5cbnZhciBfa2V5cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChPYmplY3Qua2V5cykge1xuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXMob2JqKTtcbiAgICB9XG4gICAgdmFyIGtleXMgPSBbXTtcbiAgICBmb3IgKHZhciBrIGluIG9iaikge1xuICAgICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGspKSB7XG4gICAgICAgICAgICBrZXlzLnB1c2goayk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGtleXM7XG59O1xuXG4vLy8vIGV4cG9ydGVkIGFzeW5jIG1vZHVsZSBmdW5jdGlvbnMgLy8vL1xuXG4vLy8vIG5leHRUaWNrIGltcGxlbWVudGF0aW9uIHdpdGggYnJvd3Nlci1jb21wYXRpYmxlIGZhbGxiYWNrIC8vLy9cbmV4cG9ydCBmdW5jdGlvbiBuZXh0VGljayhjYWxsYmFjazogYW55KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwibmV4dFRpY2sgbm90IGltcGxlbWVudGVkXCIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0SW1tZWRpYXRlKGNhbGxiYWNrOiBhbnkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJzZXRJbW1lZGlhdGUgbm90IGltcGxlbWVudGVkXCIpO1xufVxuLypcbmlmICh0eXBlb2YgcHJvY2VzcyA9PT0gJ3VuZGVmaW5lZCcgfHwgIShwcm9jZXNzLm5leHRUaWNrKSkge1xuICAgIGlmICh0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGFzeW5jLm5leHRUaWNrID0gZnVuY3Rpb24oZm4pIHtcbiAgICAgICAgICAgIC8vIG5vdCBhIGRpcmVjdCBhbGlhcyBmb3IgSUUxMCBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgICBzZXRJbW1lZGlhdGUoZm4pO1xuICAgICAgICB9O1xuICAgICAgICBhc3luYy5zZXRJbW1lZGlhdGUgPSBhc3luYy5uZXh0VGljaztcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGFzeW5jLm5leHRUaWNrID0gZnVuY3Rpb24oZm4pIHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoZm4sIDApO1xuICAgICAgICB9O1xuICAgICAgICBhc3luYy5zZXRJbW1lZGlhdGUgPSBhc3luYy5uZXh0VGljaztcbiAgICB9XG59XG5lbHNlIHtcbiAgICBuZXh0VGljayA9IHByb2Nlc3MubmV4dFRpY2s7XG4gICAgaWYgKHR5cGVvZiBzZXRJbW1lZGlhdGUgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHNldEltbWVkaWF0ZSA9IGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgICAgICAvLyBub3QgYSBkaXJlY3QgYWxpYXMgZm9yIElFMTAgY29tcGF0aWJpbGl0eVxuICAgICAgICAgICAgc2V0SW1tZWRpYXRlKGZuKTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHNldEltbWVkaWF0ZSA9IG5leHRUaWNrO1xuICAgIH1cbn1cbiovXG5cbmV4cG9ydCBmdW5jdGlvbiBlYWNoKGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbigpIHsgfTtcbiAgICBpZiAoIWFyci5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgfVxuICAgIHZhciBjb21wbGV0ZWQgPSAwO1xuICAgIF9lYWNoKGFyciwgZnVuY3Rpb24oeCkge1xuICAgICAgICBpdGVyYXRvcih4LCBvbmx5X29uY2UoZG9uZSkpO1xuICAgIH0pO1xuICAgIGZ1bmN0aW9uIGRvbmUoZXJyKSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKCkgeyB9O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY29tcGxldGVkICs9IDE7XG4gICAgICAgICAgICBpZiAoY29tcGxldGVkID49IGFyci5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuZXhwb3J0IHZhciBmb3JFYWNoID0gZWFjaDtcblxuZXhwb3J0IGZ1bmN0aW9uIGVhY2hTZXJpZXMoYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkgeyB9O1xuICAgIGlmICghYXJyLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICB9XG4gICAgdmFyIGNvbXBsZXRlZCA9IDA7XG4gICAgdmFyIGl0ZXJhdGUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgaXRlcmF0b3IoYXJyW2NvbXBsZXRlZF0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbigpIHsgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbXBsZXRlZCArPSAxO1xuICAgICAgICAgICAgICAgIGlmIChjb21wbGV0ZWQgPj0gYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0ZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICBpdGVyYXRlKCk7XG59XG5leHBvcnQgdmFyIGZvckVhY2hTZXJpZXMgPSBlYWNoU2VyaWVzO1xuXG5leHBvcnQgZnVuY3Rpb24gZWFjaExpbWl0KGFyciwgbGltaXQsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIHZhciBmbiA9IF9lYWNoTGltaXQobGltaXQpO1xuICAgIGZuLmFwcGx5KG51bGwsIFthcnIsIGl0ZXJhdG9yLCBjYWxsYmFja10pO1xufVxuZXhwb3J0IHZhciBmb3JFYWNoTGltaXQgPSBlYWNoTGltaXQ7XG5cbnZhciBfZWFjaExpbWl0ID0gZnVuY3Rpb24obGltaXQpIHtcblxuICAgIHJldHVybiBmdW5jdGlvbihhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkgeyB9O1xuICAgICAgICBpZiAoIWFyci5sZW5ndGggfHwgbGltaXQgPD0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNvbXBsZXRlZCA9IDA7XG4gICAgICAgIHZhciBzdGFydGVkID0gMDtcbiAgICAgICAgdmFyIHJ1bm5pbmcgPSAwO1xuXG4gICAgICAgIChmdW5jdGlvbiByZXBsZW5pc2goKSB7XG4gICAgICAgICAgICBpZiAoY29tcGxldGVkID49IGFyci5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgd2hpbGUgKHJ1bm5pbmcgPCBsaW1pdCAmJiBzdGFydGVkIDwgYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHN0YXJ0ZWQgKz0gMTtcbiAgICAgICAgICAgICAgICBydW5uaW5nICs9IDE7XG4gICAgICAgICAgICAgICAgaXRlcmF0b3IoYXJyW3N0YXJ0ZWQgLSAxXSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKCkgeyB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29tcGxldGVkICs9IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICBydW5uaW5nIC09IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY29tcGxldGVkID49IGFyci5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwbGVuaXNoKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkoKTtcbiAgICB9O1xufTtcblxuXG52YXIgZG9QYXJhbGxlbCA9IGZ1bmN0aW9uKGZuKTogYW55IHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgcmV0dXJuIGZuLmFwcGx5KG51bGwsIFtlYWNoXS5jb25jYXQoYXJncykpO1xuICAgIH07XG59O1xudmFyIGRvUGFyYWxsZWxMaW1pdCA9IGZ1bmN0aW9uKGxpbWl0LCBmbik6IChkdW1teTA/LCBkdW1teTE/LCBkdW1teTI/KSA9PiBhbnkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICByZXR1cm4gZm4uYXBwbHkobnVsbCwgW19lYWNoTGltaXQobGltaXQpXS5jb25jYXQoYXJncykpO1xuICAgIH07XG59O1xudmFyIGRvU2VyaWVzID0gZnVuY3Rpb24oZm4pOiAoYXJnMD8sIGFyZzE/LCBhcmcyPykgPT4gYW55IHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICAgICAgcmV0dXJuIGZuLmFwcGx5KG51bGwsIFtlYWNoU2VyaWVzXS5jb25jYXQoYXJncykpO1xuICAgIH07XG59O1xuXG5cbnZhciBfYXN5bmNNYXAgPSBmdW5jdGlvbihlYWNoZm4sIGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgYXJyID0gX21hcChhcnIsIGZ1bmN0aW9uKHgsIGkpIHtcbiAgICAgICAgcmV0dXJuIHsgaW5kZXg6IGksIHZhbHVlOiB4IH07XG4gICAgfSk7XG4gICAgaWYgKCFjYWxsYmFjaykge1xuICAgICAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbih4LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaXRlcmF0b3IoeC52YWx1ZSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgICAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbih4LCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaXRlcmF0b3IoeC52YWx1ZSwgZnVuY3Rpb24oZXJyLCB2KSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0c1t4LmluZGV4XSA9IHY7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIHJlc3VsdHMpO1xuICAgICAgICAgICAgfSk7XG4gICAgfVxufTtcbmV4cG9ydCB2YXIgbWFwID0gZG9QYXJhbGxlbChfYXN5bmNNYXApO1xuZXhwb3J0IHZhciBtYXBTZXJpZXMgPSBkb1NlcmllcyhfYXN5bmNNYXApO1xuZXhwb3J0IGZ1bmN0aW9uIG1hcExpbWl0KGFyciwgbGltaXQsIGl0ZXJhdG9yLCBjYWxsYmFjaz8pIHtcbiAgICByZXR1cm4gX21hcExpbWl0KGxpbWl0KShhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjayk7XG59XG5cbnZhciBfbWFwTGltaXQgPSBmdW5jdGlvbihsaW1pdCkge1xuICAgIHJldHVybiBkb1BhcmFsbGVsTGltaXQobGltaXQsIF9hc3luY01hcCk7XG59O1xuXG4vLyByZWR1Y2Ugb25seSBoYXMgYSBzZXJpZXMgdmVyc2lvbiwgYXMgZG9pbmcgcmVkdWNlIGluIHBhcmFsbGVsIHdvbid0XG4vLyB3b3JrIGluIG1hbnkgc2l0dWF0aW9ucy5cbmV4cG9ydCBmdW5jdGlvbiByZWR1Y2UoYXJyLCBtZW1vLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICBlYWNoU2VyaWVzKGFyciwgZnVuY3Rpb24oeCwgY2FsbGJhY2spIHtcbiAgICAgICAgaXRlcmF0b3IobWVtbywgeCwgZnVuY3Rpb24oZXJyLCB2KSB7XG4gICAgICAgICAgICBtZW1vID0gdjtcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgIH0pO1xuICAgIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyLCBtZW1vKTtcbiAgICAgICAgfSk7XG59XG4vLyBpbmplY3QgYWxpYXNcbmV4cG9ydCB2YXIgaW5qZWN0ID0gcmVkdWNlO1xuLy8gZm9sZGwgYWxpYXNcbmV4cG9ydCB2YXIgZm9sZGwgPSByZWR1Y2U7XG5cbmV4cG9ydCBmdW5jdGlvbiByZWR1Y2VSaWdodChhcnIsIG1lbW8sIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIHZhciByZXZlcnNlZCA9IF9tYXAoYXJyLCBmdW5jdGlvbih4KSB7XG4gICAgICAgIHJldHVybiB4O1xuICAgIH0pLnJldmVyc2UoKTtcbiAgICByZWR1Y2UocmV2ZXJzZWQsIG1lbW8sIGl0ZXJhdG9yLCBjYWxsYmFjayk7XG59XG4vLyBmb2xkciBhbGlhc1xuZXhwb3J0IHZhciBmb2xkciA9IHJlZHVjZVJpZ2h0O1xuXG52YXIgX2ZpbHRlciA9IGZ1bmN0aW9uKGVhY2hmbiwgYXJyLCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIGFyciA9IF9tYXAoYXJyLCBmdW5jdGlvbih4LCBpKSB7XG4gICAgICAgIHJldHVybiB7IGluZGV4OiBpLCB2YWx1ZTogeCB9O1xuICAgIH0pO1xuICAgIGVhY2hmbihhcnIsIGZ1bmN0aW9uKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgIGl0ZXJhdG9yKHgudmFsdWUsIGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICAgIGlmICh2KSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgfSk7XG4gICAgfSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhfbWFwKHJlc3VsdHMuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGEuaW5kZXggLSBiLmluZGV4O1xuICAgICAgICAgICAgfSksIGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHgudmFsdWU7XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KTtcbn1cbmV4cG9ydCB2YXIgZmlsdGVyID0gZG9QYXJhbGxlbChfZmlsdGVyKTtcbmV4cG9ydCB2YXIgZmlsdGVyU2VyaWVzID0gZG9TZXJpZXMoX2ZpbHRlcik7XG4vLyBzZWxlY3QgYWxpYXNcbmV4cG9ydCB2YXIgc2VsZWN0ID0gZmlsdGVyO1xuZXhwb3J0IHZhciBzZWxlY3RTZXJpZXMgPSBmaWx0ZXJTZXJpZXM7XG5cbnZhciBfcmVqZWN0ID0gZnVuY3Rpb24oZWFjaGZuLCBhcnIsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgYXJyID0gX21hcChhcnIsIGZ1bmN0aW9uKHgsIGkpIHtcbiAgICAgICAgcmV0dXJuIHsgaW5kZXg6IGksIHZhbHVlOiB4IH07XG4gICAgfSk7XG4gICAgZWFjaGZuKGFyciwgZnVuY3Rpb24oeCwgY2FsbGJhY2spIHtcbiAgICAgICAgaXRlcmF0b3IoeC52YWx1ZSwgZnVuY3Rpb24odikge1xuICAgICAgICAgICAgaWYgKCF2KSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgfSk7XG4gICAgfSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhfbWFwKHJlc3VsdHMuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGEuaW5kZXggLSBiLmluZGV4O1xuICAgICAgICAgICAgfSksIGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHgudmFsdWU7XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KTtcbn1cbmV4cG9ydCB2YXIgcmVqZWN0ID0gZG9QYXJhbGxlbChfcmVqZWN0KTtcbmV4cG9ydCB2YXIgcmVqZWN0U2VyaWVzID0gZG9TZXJpZXMoX3JlamVjdCk7XG5cbnZhciBfZGV0ZWN0ID0gZnVuY3Rpb24oZWFjaGZuLCBhcnIsIGl0ZXJhdG9yLCBtYWluX2NhbGxiYWNrKSB7XG4gICAgZWFjaGZuKGFyciwgZnVuY3Rpb24oeCwgY2FsbGJhY2spIHtcbiAgICAgICAgaXRlcmF0b3IoeCwgZnVuY3Rpb24ocmVzdWx0KSB7XG4gICAgICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgbWFpbl9jYWxsYmFjayh4KTtcbiAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrID0gZnVuY3Rpb24oKSB7IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9LCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgIG1haW5fY2FsbGJhY2soKTtcbiAgICAgICAgfSk7XG59XG5leHBvcnQgdmFyIGRldGVjdCA9IGRvUGFyYWxsZWwoX2RldGVjdCk7XG5leHBvcnQgdmFyIGRldGVjdFNlcmllcyA9IGRvU2VyaWVzKF9kZXRlY3QpO1xuXG5leHBvcnQgZnVuY3Rpb24gc29tZShhcnIsIGl0ZXJhdG9yLCBtYWluX2NhbGxiYWNrKSB7XG4gICAgZWFjaChhcnIsIGZ1bmN0aW9uKHgsIGNhbGxiYWNrKSB7XG4gICAgICAgIGl0ZXJhdG9yKHgsIGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICAgIGlmICh2KSB7XG4gICAgICAgICAgICAgICAgbWFpbl9jYWxsYmFjayh0cnVlKTtcbiAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrID0gZnVuY3Rpb24oKSB7IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9KTtcbiAgICB9LCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgIG1haW5fY2FsbGJhY2soZmFsc2UpO1xuICAgICAgICB9KTtcbn1cbi8vIGFueSBhbGlhc1xuZXhwb3J0IHZhciBhbnkgPSBzb21lO1xuXG5leHBvcnQgZnVuY3Rpb24gZXZlcnkoYXJyLCBpdGVyYXRvciwgbWFpbl9jYWxsYmFjaykge1xuICAgIGVhY2goYXJyLCBmdW5jdGlvbih4LCBjYWxsYmFjaykge1xuICAgICAgICBpdGVyYXRvcih4LCBmdW5jdGlvbih2KSB7XG4gICAgICAgICAgICBpZiAoIXYpIHtcbiAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrKGZhbHNlKTtcbiAgICAgICAgICAgICAgICBtYWluX2NhbGxiYWNrID0gZnVuY3Rpb24oKSB7IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9KTtcbiAgICB9LCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgIG1haW5fY2FsbGJhY2sodHJ1ZSk7XG4gICAgICAgIH0pO1xufVxuLy8gYWxsIGFsaWFzXG5leHBvcnQgdmFyIGFsbCA9IGV2ZXJ5O1xuXG5leHBvcnQgZnVuY3Rpb24gc29ydEJ5KGFyciwgaXRlcmF0b3IsIGNhbGxiYWNrKSB7XG4gICAgbWFwKGFyciwgZnVuY3Rpb24oeCwgY2FsbGJhY2spIHtcbiAgICAgICAgaXRlcmF0b3IoeCwgZnVuY3Rpb24oZXJyLCBjcml0ZXJpYSkge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsLCB7IHZhbHVlOiB4LCBjcml0ZXJpYTogY3JpdGVyaWEgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0sIGZ1bmN0aW9uKGVyciwgcmVzdWx0cykge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGZuID0gZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGEgPSBsZWZ0LmNyaXRlcmlhLCBiID0gcmlnaHQuY3JpdGVyaWE7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhIDwgYiA/IC0xIDogYSA+IGIgPyAxIDogMDtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIF9tYXAocmVzdWx0cy5zb3J0KGZuKSwgZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geC52YWx1ZTtcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXV0byh0YXNrcywgY2FsbGJhY2spIHtcbiAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkgeyB9O1xuICAgIHZhciBrZXlzID0gX2tleXModGFza3MpO1xuICAgIHZhciByZW1haW5pbmdUYXNrcyA9IGtleXMubGVuZ3RoXG4gICAgICAgIGlmICghcmVtYWluaW5nVGFza3MpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgfVxuXG4gICAgdmFyIHJlc3VsdHMgPSB7fTtcblxuICAgIHZhciBsaXN0ZW5lcnMgPSBbXTtcbiAgICB2YXIgYWRkTGlzdGVuZXIgPSBmdW5jdGlvbihmbikge1xuICAgICAgICBsaXN0ZW5lcnMudW5zaGlmdChmbik7XG4gICAgfTtcbiAgICB2YXIgcmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbihmbikge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpc3RlbmVycy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgaWYgKGxpc3RlbmVyc1tpXSA9PT0gZm4pIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG4gICAgdmFyIHRhc2tDb21wbGV0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZW1haW5pbmdUYXNrcy0tXG4gICAgICAgICAgICBfZWFjaChsaXN0ZW5lcnMuc2xpY2UoMCksIGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgICAgICBmbigpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgYWRkTGlzdGVuZXIoZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICghcmVtYWluaW5nVGFza3MpIHtcbiAgICAgICAgICAgIHZhciB0aGVDYWxsYmFjayA9IGNhbGxiYWNrO1xuICAgICAgICAgICAgLy8gcHJldmVudCBmaW5hbCBjYWxsYmFjayBmcm9tIGNhbGxpbmcgaXRzZWxmIGlmIGl0IGVycm9yc1xuICAgICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbigpIHsgfTtcblxuICAgICAgICAgICAgdGhlQ2FsbGJhY2sobnVsbCwgcmVzdWx0cyk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIF9lYWNoKGtleXMsIGZ1bmN0aW9uKGspIHtcbiAgICAgICAgdmFyIHRhc2sgPSBfaXNBcnJheSh0YXNrc1trXSkgPyB0YXNrc1trXSA6IFt0YXNrc1trXV07XG4gICAgICAgIHZhciB0YXNrQ2FsbGJhY2sgPSBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAxKSB7XG4gICAgICAgICAgICAgICAgYXJncyA9IGFyZ3NbMF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgdmFyIHNhZmVSZXN1bHRzID0ge307XG4gICAgICAgICAgICAgICAgX2VhY2goX2tleXMocmVzdWx0cyksIGZ1bmN0aW9uKHJrZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgc2FmZVJlc3VsdHNbcmtleV0gPSByZXN1bHRzW3JrZXldO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHNhZmVSZXN1bHRzW2tdID0gYXJncztcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIHNhZmVSZXN1bHRzKTtcbiAgICAgICAgICAgICAgICAvLyBzdG9wIHN1YnNlcXVlbnQgZXJyb3JzIGhpdHRpbmcgY2FsbGJhY2sgbXVsdGlwbGUgdGltZXNcbiAgICAgICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKCkgeyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0c1trXSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgc2V0SW1tZWRpYXRlKHRhc2tDb21wbGV0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHZhciByZXF1aXJlcyA9IHRhc2suc2xpY2UoMCwgTWF0aC5hYnModGFzay5sZW5ndGggLSAxKSkgfHwgW107XG4gICAgICAgIHZhciByZWFkeSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIF9yZWR1Y2UocmVxdWlyZXMsIGZ1bmN0aW9uKGEsIHgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gKGEgJiYgcmVzdWx0cy5oYXNPd25Qcm9wZXJ0eSh4KSk7XG4gICAgICAgICAgICB9LCB0cnVlKSAmJiAhcmVzdWx0cy5oYXNPd25Qcm9wZXJ0eShrKTtcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKHJlYWR5KCkpIHtcbiAgICAgICAgICAgIHRhc2tbdGFzay5sZW5ndGggLSAxXSh0YXNrQ2FsbGJhY2ssIHJlc3VsdHMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGxpc3RlbmVyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlYWR5KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlTGlzdGVuZXIobGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgICAgICB0YXNrW3Rhc2subGVuZ3RoIC0gMV0odGFza0NhbGxiYWNrLCByZXN1bHRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgYWRkTGlzdGVuZXIobGlzdGVuZXIpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXRyeSh0aW1lcywgdGFzaywgY2FsbGJhY2spIHtcbiAgICB2YXIgREVGQVVMVF9USU1FUyA9IDU7XG4gICAgdmFyIGF0dGVtcHRzID0gW107XG4gICAgLy8gVXNlIGRlZmF1bHRzIGlmIHRpbWVzIG5vdCBwYXNzZWRcbiAgICBpZiAodHlwZW9mIHRpbWVzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGNhbGxiYWNrID0gdGFzaztcbiAgICAgICAgdGFzayA9IHRpbWVzO1xuICAgICAgICB0aW1lcyA9IERFRkFVTFRfVElNRVM7XG4gICAgfVxuICAgIC8vIE1ha2Ugc3VyZSB0aW1lcyBpcyBhIG51bWJlclxuICAgIHRpbWVzID0gcGFyc2VJbnQodGltZXMsIDEwKSB8fCBERUZBVUxUX1RJTUVTO1xuICAgIHZhciB3cmFwcGVkVGFzayA9IGZ1bmN0aW9uKHdyYXBwZWRDYWxsYmFjaz8sIHdyYXBwZWRSZXN1bHRzPyk6IGFueSB7XG4gICAgICAgIHZhciByZXRyeUF0dGVtcHQgPSBmdW5jdGlvbih0YXNrLCBmaW5hbEF0dGVtcHQpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihzZXJpZXNDYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIHRhc2soZnVuY3Rpb24oZXJyLCByZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VyaWVzQ2FsbGJhY2soIWVyciB8fCBmaW5hbEF0dGVtcHQsIHsgZXJyOiBlcnIsIHJlc3VsdDogcmVzdWx0IH0pO1xuICAgICAgICAgICAgICAgIH0sIHdyYXBwZWRSZXN1bHRzKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH07XG4gICAgICAgIHdoaWxlICh0aW1lcykge1xuICAgICAgICAgICAgYXR0ZW1wdHMucHVzaChyZXRyeUF0dGVtcHQodGFzaywgISh0aW1lcyAtPSAxKSkpO1xuICAgICAgICB9XG4gICAgICAgIHNlcmllcyhhdHRlbXB0cywgZnVuY3Rpb24oZG9uZSwgZGF0YSkge1xuICAgICAgICAgICAgZGF0YSA9IGRhdGFbZGF0YS5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICh3cmFwcGVkQ2FsbGJhY2sgfHwgY2FsbGJhY2spKGRhdGEuZXJyLCBkYXRhLnJlc3VsdCk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAgICAgLy8gSWYgYSBjYWxsYmFjayBpcyBwYXNzZWQsIHJ1biB0aGlzIGFzIGEgY29udHJvbGwgZmxvd1xuICAgICAgICByZXR1cm4gY2FsbGJhY2sgPyB3cmFwcGVkVGFzaygpIDogd3JhcHBlZFRhc2tcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhdGVyZmFsbCh0YXNrcywgY2FsbGJhY2spIHtcbiAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkgeyB9O1xuICAgIGlmICghX2lzQXJyYXkodGFza3MpKSB7XG4gICAgICAgIHZhciBlcnIgPSBuZXcgRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IHRvIHdhdGVyZmFsbCBtdXN0IGJlIGFuIGFycmF5IG9mIGZ1bmN0aW9ucycpO1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICB9XG4gICAgaWYgKCF0YXNrcy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgfVxuICAgIHZhciB3cmFwSXRlcmF0b3IgPSBmdW5jdGlvbihpdGVyYXRvcjogYW55KTogYW55IHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbigpIHsgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICB2YXIgbmV4dCA9IGl0ZXJhdG9yLm5leHQoKTtcbiAgICAgICAgICAgICAgICBpZiAobmV4dCkge1xuICAgICAgICAgICAgICAgICAgICBhcmdzLnB1c2god3JhcEl0ZXJhdG9yKG5leHQpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGFyZ3MucHVzaChjYWxsYmFjayk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNldEltbWVkaWF0ZShmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuYXBwbHkobnVsbCwgYXJncyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfTtcbiAgICB3cmFwSXRlcmF0b3IoaXRlcmF0b3IodGFza3MpKSgpO1xufVxuXG52YXIgX3BhcmFsbGVsID0gZnVuY3Rpb24oZWFjaGZuLCB0YXNrcywgY2FsbGJhY2spIHtcbiAgICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IGZ1bmN0aW9uKCkgeyB9O1xuICAgIGlmIChfaXNBcnJheSh0YXNrcykpIHtcbiAgICAgICAgZWFjaGZuLm1hcCh0YXNrcywgZnVuY3Rpb24oZm4sIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpZiAoZm4pIHtcbiAgICAgICAgICAgICAgICBmbihmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXJncyA9IGFyZ3NbMF07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbChudWxsLCBlcnIsIGFyZ3MpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBjYWxsYmFjayk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB2YXIgcmVzdWx0cyA9IHt9O1xuICAgICAgICBlYWNoZm4uZWFjaChfa2V5cyh0YXNrcyksIGZ1bmN0aW9uKGssIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICB0YXNrc1trXShmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDw9IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgYXJncyA9IGFyZ3NbMF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlc3VsdHNba10gPSBhcmdzO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyLCByZXN1bHRzKTtcbiAgICAgICAgICAgIH0pO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcmFsbGVsKHRhc2tzOiBhbnlbXSwgY2FsbGJhY2s/OiAoZXJyLCByZXN1bHRzKT0+dm9pZCkge1xuICAgIF9wYXJhbGxlbCh7IG1hcDogbWFwLCBlYWNoOiBlYWNoIH0sIHRhc2tzLCBjYWxsYmFjayk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJhbGxlbExpbWl0KHRhc2tzLCBsaW1pdCwgY2FsbGJhY2spIHtcbiAgICBfcGFyYWxsZWwoeyBtYXA6IF9tYXBMaW1pdChsaW1pdCksIGVhY2g6IF9lYWNoTGltaXQobGltaXQpIH0sIHRhc2tzLCBjYWxsYmFjayk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXJpZXModGFza3MsIGNhbGxiYWNrKSB7XG4gICAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBmdW5jdGlvbigpIHsgfTtcbiAgICBpZiAoX2lzQXJyYXkodGFza3MpKSB7XG4gICAgICAgIG1hcFNlcmllcyh0YXNrcywgZnVuY3Rpb24oZm4sIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpZiAoZm4pIHtcbiAgICAgICAgICAgICAgICBmbihmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXJncyA9IGFyZ3NbMF07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbChudWxsLCBlcnIsIGFyZ3MpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBjYWxsYmFjayk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB2YXIgcmVzdWx0cyA9IHt9O1xuICAgICAgICBlYWNoU2VyaWVzKF9rZXlzKHRhc2tzKSwgZnVuY3Rpb24oaywgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHRhc2tzW2tdKGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPD0gMSkge1xuICAgICAgICAgICAgICAgICAgICBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzdWx0c1trXSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnIsIHJlc3VsdHMpO1xuICAgICAgICAgICAgfSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXRlcmF0b3IodGFza3MpIHtcbiAgICB2YXIgbWFrZUNhbGxiYWNrID0gZnVuY3Rpb24oaW5kZXgpIHtcbiAgICAgICAgdmFyIGZuOiBhbnkgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICh0YXNrcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0YXNrc1tpbmRleF0uYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmbi5uZXh0KCk7XG4gICAgICAgIH07XG4gICAgICAgIGZuLm5leHQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiAoaW5kZXggPCB0YXNrcy5sZW5ndGggLSAxKSA/IG1ha2VDYWxsYmFjayhpbmRleCArIDEpIDogbnVsbDtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIGZuO1xuICAgIH07XG4gICAgcmV0dXJuIG1ha2VDYWxsYmFjaygwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5KGZuKSB7XG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIGZuLmFwcGx5KFxuICAgICAgICAgICAgbnVsbCwgYXJncy5jb25jYXQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSlcbiAgICAgICAgICAgICk7XG4gICAgfTtcbn1cblxudmFyIF9jb25jYXQgPSBmdW5jdGlvbihlYWNoZm4sIGFyciwgZm4sIGNhbGxiYWNrKSB7XG4gICAgdmFyIHIgPSBbXTtcbiAgICBlYWNoZm4oYXJyLCBmdW5jdGlvbih4LCBjYikge1xuICAgICAgICBmbih4LCBmdW5jdGlvbihlcnIsIHkpIHtcbiAgICAgICAgICAgIHIgPSByLmNvbmNhdCh5IHx8IFtdKTtcbiAgICAgICAgICAgIGNiKGVycik7XG4gICAgICAgIH0pO1xuICAgIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyLCByKTtcbiAgICAgICAgfSk7XG59O1xuZXhwb3J0IHZhciBjb25jYXQgPSBkb1BhcmFsbGVsKF9jb25jYXQpO1xuZXhwb3J0IHZhciBjb25jYXRTZXJpZXMgPSBkb1NlcmllcyhfY29uY2F0KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHdoaWxzdCh0ZXN0LCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICBpZiAodGVzdCgpKSB7XG4gICAgICAgIGl0ZXJhdG9yKGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgd2hpbHN0KHRlc3QsIGl0ZXJhdG9yLCBjYWxsYmFjayk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgY2FsbGJhY2soKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkb1doaWxzdChpdGVyYXRvciwgdGVzdCwgY2FsbGJhY2spIHtcbiAgICBpdGVyYXRvcihmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICBpZiAodGVzdC5hcHBseShudWxsLCBhcmdzKSkge1xuICAgICAgICAgICAgZG9XaGlsc3QoaXRlcmF0b3IsIHRlc3QsIGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVudGlsKHRlc3QsIGl0ZXJhdG9yLCBjYWxsYmFjaykge1xuICAgIGlmICghdGVzdCgpKSB7XG4gICAgICAgIGl0ZXJhdG9yKGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdW50aWwodGVzdCwgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBjYWxsYmFjaygpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRvVW50aWwoaXRlcmF0b3IsIHRlc3QsIGNhbGxiYWNrKSB7XG4gICAgaXRlcmF0b3IoZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgaWYgKCF0ZXN0LmFwcGx5KG51bGwsIGFyZ3MpKSB7XG4gICAgICAgICAgICBkb1VudGlsKGl0ZXJhdG9yLCB0ZXN0LCBjYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBxdWV1ZSh3b3JrZXIsIGNvbmN1cnJlbmN5KSB7XG4gICAgaWYgKGNvbmN1cnJlbmN5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uY3VycmVuY3kgPSAxO1xuICAgIH1cbiAgICBmdW5jdGlvbiBfaW5zZXJ0KHEsIGRhdGEsIHBvcywgY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKCFxLnN0YXJ0ZWQpIHtcbiAgICAgICAgICAgIHEuc3RhcnRlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFfaXNBcnJheShkYXRhKSkge1xuICAgICAgICAgICAgZGF0YSA9IFtkYXRhXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZGF0YS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgLy8gY2FsbCBkcmFpbiBpbW1lZGlhdGVseSBpZiB0aGVyZSBhcmUgbm8gdGFza3NcbiAgICAgICAgICAgIHJldHVybiBzZXRJbW1lZGlhdGUoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgaWYgKHEuZHJhaW4pIHtcbiAgICAgICAgICAgICAgICAgICAgcS5kcmFpbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIF9lYWNoKGRhdGEsIGZ1bmN0aW9uKHRhc2spIHtcbiAgICAgICAgICAgIHZhciBpdGVtID0ge1xuICAgICAgICAgICAgICAgIGRhdGE6IHRhc2ssXG4gICAgICAgICAgICAgICAgY2FsbGJhY2s6IHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJyA/IGNhbGxiYWNrIDogbnVsbFxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWYgKHBvcykge1xuICAgICAgICAgICAgICAgIHEudGFza3MudW5zaGlmdChpdGVtKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcS50YXNrcy5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocS5zYXR1cmF0ZWQgJiYgcS50YXNrcy5sZW5ndGggPT09IHEuY29uY3VycmVuY3kpIHtcbiAgICAgICAgICAgICAgICBxLnNhdHVyYXRlZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2V0SW1tZWRpYXRlKHEucHJvY2Vzcyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHZhciB3b3JrZXJzID0gMDtcbiAgICB2YXIgcSA9IHtcbiAgICAgICAgdGFza3M6IFtdLFxuICAgICAgICBjb25jdXJyZW5jeTogY29uY3VycmVuY3ksXG4gICAgICAgIHNhdHVyYXRlZDogbnVsbCxcbiAgICAgICAgZW1wdHk6IG51bGwsXG4gICAgICAgIGRyYWluOiBudWxsLFxuICAgICAgICBzdGFydGVkOiBmYWxzZSxcbiAgICAgICAgcGF1c2VkOiBmYWxzZSxcbiAgICAgICAgcHVzaDogZnVuY3Rpb24oZGF0YSwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIF9pbnNlcnQocSwgZGF0YSwgZmFsc2UsIGNhbGxiYWNrKTtcbiAgICAgICAgfSxcbiAgICAgICAga2lsbDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBxLmRyYWluID0gbnVsbDtcbiAgICAgICAgICAgIHEudGFza3MgPSBbXTtcbiAgICAgICAgfSxcbiAgICAgICAgdW5zaGlmdDogZnVuY3Rpb24oZGF0YSwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgIF9pbnNlcnQocSwgZGF0YSwgdHJ1ZSwgY2FsbGJhY2spO1xuICAgICAgICB9LFxuICAgICAgICBwcm9jZXNzOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICghcS5wYXVzZWQgJiYgd29ya2VycyA8IHEuY29uY3VycmVuY3kgJiYgcS50YXNrcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB2YXIgdGFzayA9IHEudGFza3Muc2hpZnQoKTtcbiAgICAgICAgICAgICAgICBpZiAocS5lbXB0eSAmJiBxLnRhc2tzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBxLmVtcHR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHdvcmtlcnMgKz0gMTtcbiAgICAgICAgICAgICAgICB2YXIgbmV4dCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICB3b3JrZXJzIC09IDE7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0YXNrLmNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXNrLmNhbGxiYWNrLmFwcGx5KHRhc2ssIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKHEuZHJhaW4gJiYgcS50YXNrcy5sZW5ndGggKyB3b3JrZXJzID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBxLmRyYWluKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcS5wcm9jZXNzKCk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB2YXIgY2IgPSBvbmx5X29uY2UobmV4dCk7XG4gICAgICAgICAgICAgICAgd29ya2VyKHRhc2suZGF0YSwgY2IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBsZW5ndGg6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHEudGFza3MubGVuZ3RoO1xuICAgICAgICB9LFxuICAgICAgICBydW5uaW5nOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB3b3JrZXJzO1xuICAgICAgICB9LFxuICAgICAgICBpZGxlOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiBxLnRhc2tzLmxlbmd0aCArIHdvcmtlcnMgPT09IDA7XG4gICAgICAgIH0sXG4gICAgICAgIHBhdXNlOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChxLnBhdXNlZCA9PT0gdHJ1ZSkgeyByZXR1cm47IH1cbiAgICAgICAgICAgIHEucGF1c2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIHEucHJvY2VzcygpO1xuICAgICAgICB9LFxuICAgICAgICByZXN1bWU6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHEucGF1c2VkID09PSBmYWxzZSkgeyByZXR1cm47IH1cbiAgICAgICAgICAgIHEucGF1c2VkID0gZmFsc2U7XG4gICAgICAgICAgICBxLnByb2Nlc3MoKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgcmV0dXJuIHE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcmlvcml0eVF1ZXVlKHdvcmtlciwgY29uY3VycmVuY3kpIHtcblxuICAgIGZ1bmN0aW9uIF9jb21wYXJlVGFza3MoYSwgYikge1xuICAgICAgICByZXR1cm4gYS5wcmlvcml0eSAtIGIucHJpb3JpdHk7XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIF9iaW5hcnlTZWFyY2goc2VxdWVuY2UsIGl0ZW0sIGNvbXBhcmUpIHtcbiAgICAgICAgdmFyIGJlZyA9IC0xLFxuICAgICAgICAgICAgZW5kID0gc2VxdWVuY2UubGVuZ3RoIC0gMTtcbiAgICAgICAgd2hpbGUgKGJlZyA8IGVuZCkge1xuICAgICAgICAgICAgdmFyIG1pZCA9IGJlZyArICgoZW5kIC0gYmVnICsgMSkgPj4+IDEpO1xuICAgICAgICAgICAgaWYgKGNvbXBhcmUoaXRlbSwgc2VxdWVuY2VbbWlkXSkgPj0gMCkge1xuICAgICAgICAgICAgICAgIGJlZyA9IG1pZDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gbWlkIC0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYmVnO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9pbnNlcnQocSwgZGF0YSwgcHJpb3JpdHksIGNhbGxiYWNrKSB7XG4gICAgICAgIGlmICghcS5zdGFydGVkKSB7XG4gICAgICAgICAgICBxLnN0YXJ0ZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmICghX2lzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgICAgIGRhdGEgPSBbZGF0YV07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRhdGEubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIC8vIGNhbGwgZHJhaW4gaW1tZWRpYXRlbHkgaWYgdGhlcmUgYXJlIG5vIHRhc2tzXG4gICAgICAgICAgICByZXR1cm4gc2V0SW1tZWRpYXRlKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGlmIChxLmRyYWluKSB7XG4gICAgICAgICAgICAgICAgICAgIHEuZHJhaW4oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBfZWFjaChkYXRhLCBmdW5jdGlvbih0YXNrKSB7XG4gICAgICAgICAgICB2YXIgaXRlbSA9IHtcbiAgICAgICAgICAgICAgICBkYXRhOiB0YXNrLFxuICAgICAgICAgICAgICAgIHByaW9yaXR5OiBwcmlvcml0eSxcbiAgICAgICAgICAgICAgICBjYWxsYmFjazogdHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nID8gY2FsbGJhY2sgOiBudWxsXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBxLnRhc2tzLnNwbGljZShfYmluYXJ5U2VhcmNoKHEudGFza3MsIGl0ZW0sIF9jb21wYXJlVGFza3MpICsgMSwgMCwgaXRlbSk7XG5cbiAgICAgICAgICAgIGlmIChxLnNhdHVyYXRlZCAmJiBxLnRhc2tzLmxlbmd0aCA9PT0gcS5jb25jdXJyZW5jeSkge1xuICAgICAgICAgICAgICAgIHEuc2F0dXJhdGVkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZXRJbW1lZGlhdGUocS5wcm9jZXNzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gU3RhcnQgd2l0aCBhIG5vcm1hbCBxdWV1ZVxuICAgIHZhciBxOiBhbnkgPSBxdWV1ZSh3b3JrZXIsIGNvbmN1cnJlbmN5KTtcblxuICAgIC8vIE92ZXJyaWRlIHB1c2ggdG8gYWNjZXB0IHNlY29uZCBwYXJhbWV0ZXIgcmVwcmVzZW50aW5nIHByaW9yaXR5XG4gICAgcS5wdXNoID0gZnVuY3Rpb24oZGF0YSwgcHJpb3JpdHksIGNhbGxiYWNrKSB7XG4gICAgICAgIF9pbnNlcnQocSwgZGF0YSwgcHJpb3JpdHksIGNhbGxiYWNrKTtcbiAgICB9O1xuXG4gICAgLy8gUmVtb3ZlIHVuc2hpZnQgZnVuY3Rpb25cbiAgICBkZWxldGUgcS51bnNoaWZ0O1xuXG4gICAgcmV0dXJuIHE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjYXJnbyh3b3JrZXIsIHBheWxvYWQpIHtcbiAgICB2YXIgd29ya2luZyA9IGZhbHNlLFxuICAgICAgICB0YXNrcyA9IFtdO1xuXG4gICAgdmFyIGNhcmdvID0ge1xuICAgICAgICB0YXNrczogdGFza3MsXG4gICAgICAgIHBheWxvYWQ6IHBheWxvYWQsXG4gICAgICAgIHNhdHVyYXRlZDogbnVsbCxcbiAgICAgICAgZW1wdHk6IG51bGwsXG4gICAgICAgIGRyYWluOiBudWxsLFxuICAgICAgICBkcmFpbmVkOiB0cnVlLFxuICAgICAgICBwdXNoOiBmdW5jdGlvbihkYXRhLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgaWYgKCFfaXNBcnJheShkYXRhKSkge1xuICAgICAgICAgICAgICAgIGRhdGEgPSBbZGF0YV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBfZWFjaChkYXRhLCBmdW5jdGlvbih0YXNrKSB7XG4gICAgICAgICAgICAgICAgdGFza3MucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHRhc2ssXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrOiB0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicgPyBjYWxsYmFjayA6IG51bGxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBjYXJnby5kcmFpbmVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKGNhcmdvLnNhdHVyYXRlZCAmJiB0YXNrcy5sZW5ndGggPT09IHBheWxvYWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FyZ28uc2F0dXJhdGVkKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzZXRJbW1lZGlhdGUoY2FyZ28ucHJvY2Vzcyk7XG4gICAgICAgIH0sXG4gICAgICAgIHByb2Nlc3M6IGZ1bmN0aW9uIHByb2Nlc3MoKSB7XG4gICAgICAgICAgICBpZiAod29ya2luZykgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKHRhc2tzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGlmIChjYXJnby5kcmFpbiAmJiAhY2FyZ28uZHJhaW5lZCkgY2FyZ28uZHJhaW4oKTtcbiAgICAgICAgICAgICAgICBjYXJnby5kcmFpbmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB0cyA9IHR5cGVvZiBwYXlsb2FkID09PSAnbnVtYmVyJ1xuICAgICAgICAgICAgICAgID8gdGFza3Muc3BsaWNlKDAsIHBheWxvYWQpXG4gICAgICAgICAgICAgICAgOiB0YXNrcy5zcGxpY2UoMCwgdGFza3MubGVuZ3RoKTtcblxuICAgICAgICAgICAgdmFyIGRzID0gX21hcCh0cywgZnVuY3Rpb24odGFzaykge1xuICAgICAgICAgICAgICAgIHJldHVybiB0YXNrLmRhdGE7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKGNhcmdvLmVtcHR5KSBjYXJnby5lbXB0eSgpO1xuICAgICAgICAgICAgd29ya2luZyA9IHRydWU7XG4gICAgICAgICAgICB3b3JrZXIoZHMsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHdvcmtpbmcgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgICAgIF9lYWNoKHRzLCBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkYXRhLmNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhLmNhbGxiYWNrLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBwcm9jZXNzKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgbGVuZ3RoOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB0YXNrcy5sZW5ndGg7XG4gICAgICAgIH0sXG4gICAgICAgIHJ1bm5pbmc6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHdvcmtpbmc7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBjYXJnbztcbn1cblxudmFyIF9jb25zb2xlX2ZuID0gZnVuY3Rpb24obmFtZSkge1xuICAgIHJldHVybiBmdW5jdGlvbihmbikge1xuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgIGZuLmFwcGx5KG51bGwsIGFyZ3MuY29uY2F0KFtmdW5jdGlvbihlcnIpIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb25zb2xlLmVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoY29uc29sZVtuYW1lXSkge1xuICAgICAgICAgICAgICAgICAgICBfZWFjaChhcmdzLCBmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlW25hbWVdKHgpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1dKSk7XG4gICAgfTtcbn07XG5leHBvcnQgdmFyIGxvZyA9IF9jb25zb2xlX2ZuKCdsb2cnKTtcbmV4cG9ydCB2YXIgZGlyID0gX2NvbnNvbGVfZm4oJ2RpcicpO1xuLyphc3luYy5pbmZvID0gX2NvbnNvbGVfZm4oJ2luZm8nKTtcbmFzeW5jLndhcm4gPSBfY29uc29sZV9mbignd2FybicpO1xuYXN5bmMuZXJyb3IgPSBfY29uc29sZV9mbignZXJyb3InKTsqL1xuXG5leHBvcnQgZnVuY3Rpb24gbWVtb2l6ZShmbiwgaGFzaGVyKSB7XG4gICAgdmFyIG1lbW8gPSB7fTtcbiAgICB2YXIgcXVldWVzID0ge307XG4gICAgaGFzaGVyID0gaGFzaGVyIHx8IGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfTtcbiAgICB2YXIgbWVtb2l6ZWQ6IGFueSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3MucG9wKCk7XG4gICAgICAgIHZhciBrZXkgPSBoYXNoZXIuYXBwbHkobnVsbCwgYXJncyk7XG4gICAgICAgIGlmIChrZXkgaW4gbWVtbykge1xuICAgICAgICAgICAgbmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2suYXBwbHkobnVsbCwgbWVtb1trZXldKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGtleSBpbiBxdWV1ZXMpIHtcbiAgICAgICAgICAgIHF1ZXVlc1trZXldLnB1c2goY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcXVldWVzW2tleV0gPSBbY2FsbGJhY2tdO1xuICAgICAgICAgICAgZm4uYXBwbHkobnVsbCwgYXJncy5jb25jYXQoW2Z1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIG1lbW9ba2V5XSA9IGFyZ3VtZW50cztcbiAgICAgICAgICAgICAgICB2YXIgcSA9IHF1ZXVlc1trZXldO1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBxdWV1ZXNba2V5XTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbCA9IHEubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHFbaV0uYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XSkpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBtZW1vaXplZC5tZW1vID0gbWVtbztcbiAgICBtZW1vaXplZC51bm1lbW9pemVkID0gZm47XG4gICAgcmV0dXJuIG1lbW9pemVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdW5tZW1vaXplKGZuKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gKGZuLnVubWVtb2l6ZWQgfHwgZm4pLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRpbWVzKGNvdW50LCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICB2YXIgY291bnRlciA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgICAgICBjb3VudGVyLnB1c2goaSk7XG4gICAgfVxuICAgIHJldHVybiBtYXAoY291bnRlciwgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRpbWVzU2VyaWVzKGNvdW50LCBpdGVyYXRvciwgY2FsbGJhY2spIHtcbiAgICB2YXIgY291bnRlciA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuICAgICAgICBjb3VudGVyLnB1c2goaSk7XG4gICAgfVxuICAgIHJldHVybiBtYXBTZXJpZXMoY291bnRlciwgaXRlcmF0b3IsIGNhbGxiYWNrKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlcSgvKiBmdW5jdGlvbnMuLi4gKi8pIHtcbiAgICB2YXIgZm5zID0gYXJndW1lbnRzO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHRoYXQgPSB0aGlzO1xuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3MucG9wKCk7XG4gICAgICAgIHJlZHVjZShmbnMsIGFyZ3MsIGZ1bmN0aW9uKG5ld2FyZ3MsIGZuLCBjYikge1xuICAgICAgICAgICAgZm4uYXBwbHkodGhhdCwgbmV3YXJncy5jb25jYXQoW2Z1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHZhciBlcnIgPSBhcmd1bWVudHNbMF07XG4gICAgICAgICAgICAgICAgdmFyIG5leHRhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgICAgICAgICBjYihlcnIsIG5leHRhcmdzKTtcbiAgICAgICAgICAgIH1dKSlcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBmdW5jdGlvbihlcnIsIHJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjay5hcHBseSh0aGF0LCBbZXJyXS5jb25jYXQocmVzdWx0cykpO1xuICAgICAgICAgICAgfSk7XG4gICAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXBvc2UoLyogZnVuY3Rpb25zLi4uICovKSB7XG4gICAgcmV0dXJuIHNlcS5hcHBseShudWxsLCBBcnJheS5wcm90b3R5cGUucmV2ZXJzZS5jYWxsKGFyZ3VtZW50cykpO1xufVxuXG52YXIgX2FwcGx5RWFjaCA9IGZ1bmN0aW9uKGVhY2hmbiwgZm5zIC8qYXJncy4uLiovKSB7XG4gICAgdmFyIGdvID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciB0aGF0ID0gdGhpcztcbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICB2YXIgY2FsbGJhY2sgPSBhcmdzLnBvcCgpO1xuICAgICAgICByZXR1cm4gZWFjaGZuKGZucywgZnVuY3Rpb24oZm4sIGNiKSB7XG4gICAgICAgICAgICBmbi5hcHBseSh0aGF0LCBhcmdzLmNvbmNhdChbY2JdKSk7XG4gICAgICAgIH0sXG4gICAgICAgICAgICBjYWxsYmFjayk7XG4gICAgfTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgICAgICByZXR1cm4gZ28uYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gZ287XG4gICAgfVxufVxuZXhwb3J0IHZhciBhcHBseUVhY2ggPSBkb1BhcmFsbGVsKF9hcHBseUVhY2gpO1xuZXhwb3J0IHZhciBhcHBseUVhY2hTZXJpZXMgPSBkb1NlcmllcyhfYXBwbHlFYWNoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGZvcmV2ZXIoZm4sIGNhbGxiYWNrKSB7XG4gICAgZnVuY3Rpb24gbmV4dChlcnI/KSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICAgIGZuKG5leHQpO1xuICAgIH1cbiAgICBuZXh0KCk7XG59XG4iXX0=