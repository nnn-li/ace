"use strict";
import MixedFoldMode from "./MixedFoldMode";
import XmlFoldMode from "./XmlFoldMode";
import CStyleFoldMode from "./CstyleFoldMode";
export default class HtmlFoldMode extends MixedFoldMode {
    constructor(voidElements, optionalTags) {
        super(new XmlFoldMode(voidElements, optionalTags), { "js-": new CStyleFoldMode(), "css-": new CStyleFoldMode() });
    }
}
