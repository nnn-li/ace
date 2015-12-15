import PixelPosition from "../PixelPosition";
import ThemeLink from "../ThemeLink";

interface ListView {
    isOpen: boolean;
    focus;
    container;
    on(eventName: string, callback, capturing?: boolean);
    getData(row: number);
    setData(data: string[]);
    getRow();
    setRow(row: number);
    getTextLeftOffset(): number;
    show(pos: PixelPosition, lineHeight: number, topdownOnly?: boolean): void;
    hide();
    importThemeLink(themeName: string): Promise<ThemeLink>;
    setFontSize(fontSize): void;
    getLength(): number;
}

export default ListView;