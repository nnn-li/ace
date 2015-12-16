"use strict";
import FoldMode from "./FoldMode";
export default class MixedFoldMode extends FoldMode {
    constructor(defaultMode, subModes) {
        super();
        this.defaultMode = defaultMode;
        this.subModes = subModes;
    }
    $getMode(state) {
        if (typeof state !== "string") {
            state = state[0];
        }
        for (var key in this.subModes) {
            if (state.indexOf(key) === 0)
                return this.subModes[key];
        }
        return null;
    }
    $tryMode(state, session, foldStyle, row) {
        var mode = this.$getMode(state);
        return (mode ? mode.getFoldWidget(session, foldStyle, row) : "");
    }
    getFoldWidget(session, foldStyle, row) {
        return (this.$tryMode(session.getState(row - 1), session, foldStyle, row) ||
            this.$tryMode(session.getState(row), session, foldStyle, row) ||
            this.defaultMode.getFoldWidget(session, foldStyle, row));
    }
    getFoldWidgetRange(session, foldStyle, row) {
        var mode = this.$getMode(session.getState(row - 1));
        if (!mode || !mode.getFoldWidget(session, foldStyle, row)) {
            mode = this.$getMode(session.getState(row));
        }
        if (!mode || !mode.getFoldWidget(session, foldStyle, row)) {
            mode = this.defaultMode;
        }
        return mode.getFoldWidgetRange(session, foldStyle, row);
    }
}
