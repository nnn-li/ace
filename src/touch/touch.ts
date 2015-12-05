import userAgent = require("../lib/useragent");
import Editor = require('../Editor');
import eventService = require('../lib/event');
import hammer = require('../hammer/hammer');
import pan = require('../hammer/recognizers/pan');
import pinch = require('../hammer/recognizers/pinch');
import press = require('../hammer/recognizers/press');
import rotate = require('../hammer/recognizers/rotate');
import swipe = require('../hammer/recognizers/swipe');
import tap = require('../hammer/recognizers/tap');

// It seems that TypeScript 1.0.0 doesn't know about TouchEvent.
// This should motivate the upgrade of TypeScript and hacking for ACE.
export interface ITouch {
    clientX: number;
    clientY: number;
    pageX: number;
    pageY: number;
    screenX: number;
    screenY: number;
}

export interface ITouchEvent extends Event {
    type: string;
    touches: ITouch[];
}

export function touchManager(editor: Editor) {

    var target: HTMLDivElement = editor.renderer.getMouseEventTarget();
    var manager = new hammer.Manager(target);

    manager.add(new pan.PanRecognizer('pan', true).setDirection(hammer.DIRECTION_VERTICAL).setThreshold(20));
    manager.add(new tap.TapRecognizer('tap', true));

    manager.on('pan', function(movement: hammer.VectorE2) {
        editor.renderer.scrollBy(-movement.x, -movement.y);
    });

    manager.on('tap', function(event: hammer.ClientLocation) {
        var pos = editor.renderer.screenToTextCoordinates(event.clientX, event.clientY);

        pos.row = Math.max(0, Math.min(pos.row, editor.session.getLength() - 1));

        editor.moveCursorToPosition(pos);
        editor.renderer.scrollCursorIntoView();
        editor.focus();
    });

    return manager;
}
