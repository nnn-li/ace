export default function contains(xs, x) {
    for (var i = 0, iLength = xs.length; i < iLength; i++) {
        if (xs[i] === x) {
            return true;
        }
    }
    return false;
}
