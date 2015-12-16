import { DIRECTION_VERTICAL, Manager } from '../hammer/hammer';
import { PanRecognizer } from '../hammer/recognizers/pan';
import { TapRecognizer } from '../hammer/recognizers/tap';
export function touchManager(editor) {
    var target = editor.renderer.getMouseEventTarget();
    var manager = new Manager(target);
    manager.add(new PanRecognizer('pan', true).setDirection(DIRECTION_VERTICAL).setThreshold(20));
    manager.add(new TapRecognizer('tap', true));
    manager.on('pan', function (movement) {
        editor.renderer.scrollBy(-movement.x, -movement.y);
    });
    manager.on('tap', function (event) {
        var pos = editor.renderer.screenToTextCoordinates(event.clientX, event.clientY);
        pos.row = Math.max(0, Math.min(pos.row, editor.getSession().getLength() - 1));
        editor.moveCursorToPosition(pos);
        editor.renderer.scrollCursorIntoView();
        editor.focus();
    });
    return manager;
}
