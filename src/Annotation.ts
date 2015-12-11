interface Annotation {
    html?: string;
    row: number;
    column?: number;
    // TODO: This may also be optional.
    text: string;
    /**
     * "error", "info", or "warning".
     */
    type: string;
}

export default Annotation;