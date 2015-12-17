export default class ThemeLink {
    constructor(isDark, id, rel, type, href, padding) {
        if (typeof padding !== 'number') {
            throw new TypeError("padding must be a number");
        }
        this.isDark = isDark;
        this.id = id;
        this.rel = rel;
        this.type = type;
        this.href = href;
        this.padding = padding;
    }
}
