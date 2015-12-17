export default function sliceArgs(args, start = 0, end = args.length) {
    var sliced = [];
    for (var i = start; i < end; i++) {
        sliced.push(args[i]);
    }
    return sliced;
}
