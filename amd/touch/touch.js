define(["require", "exports", '../hammer/hammer', '../hammer/recognizers/pan', '../hammer/recognizers/tap'], function (require, exports, hammer_1, pan_1, tap_1) {
    function touchManager(editor) {
        var target = editor.renderer.getMouseEventTarget();
        var manager = new hammer_1.Manager(target);
        manager.add(new pan_1.PanRecognizer('pan', true).setDirection(hammer_1.DIRECTION_VERTICAL).setThreshold(20));
        manager.add(new tap_1.TapRecognizer('tap', true));
        manager.on('pan', function (movement) {
            editor.renderer.scrollBy(-movement.x, -movement.y);
        });
        manager.on('tap', function (event) {
            var pos = editor.renderer.screenToTextCoordinates(event.clientX, event.clientY);
            pos.row = Math.max(0, Math.min(pos.row, editor.session.getLength() - 1));
            editor.moveCursorToPosition(pos);
            editor.renderer.scrollCursorIntoView();
            editor.focus();
        });
        return manager;
    }
    exports.touchManager = touchManager;
});
