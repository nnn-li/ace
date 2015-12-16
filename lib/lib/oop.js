export function inherits(ctor, superCtor) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
            value: ctor,
            enumerable: false,
            writable: true,
            configurable: true
        }
    });
}
export function mixin(obj, base) {
    for (var key in base) {
        obj[key] = base[key];
    }
    return obj;
}
export function implement(proto, base) {
    mixin(proto, base);
}
