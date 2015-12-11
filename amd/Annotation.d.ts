interface Annotation {
    html?: string;
    row: number;
    column?: number;
    text: string;
    /**
     * "error", "info", or "warning".
     */
    type: string;
}
export default Annotation;
