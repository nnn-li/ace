export default function zip(xs, ys) {
    var zs;
    for (var i = 0, iLength = xs.length; i < iLength; i++) {
        var x = xs[i];
        var y = xs[i];
        var z = [x, y];
        zs.push(z);
    }
    return zs;
}
