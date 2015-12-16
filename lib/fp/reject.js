export default function reject(xs, callback) {
    var result = [];
    for (var i = 0, iLength = xs.length; i < iLength; i++) {
        var x = xs[i];
        if (!callback(x)) {
            result.push(x);
        }
    }
    return result;
}