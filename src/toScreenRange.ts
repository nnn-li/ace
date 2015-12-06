import {EditSession} from './edit_session'
import {Range} from './range'
/**
 * Converts those starting and ending points into screen positions, and then returns a new `EditorRange` object.
 * @param {EditSession} session The `EditSession` to retrieve coordinates from
 *
 * @returns {Range}
 */
export default function toScreenRange(range: Range, session: EditSession): Range {
    var screenPosStart = session.documentToScreenPosition(range.start.row, range.start.column);
    var screenPosEnd = session.documentToScreenPosition(range.end.row, range.end.column);
    return new Range(screenPosStart.row, screenPosStart.column, screenPosEnd.row, screenPosEnd.column);
}
