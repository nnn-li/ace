export default class NameStack {
    _stack: any[];
    constructor();
    length: number;
    /**
     * Create a new entry in the stack. Useful for tracking names across
     * expressions.
     */
    push(): void;
    /**
     * Discard the most recently-created name on the stack.
     */
    pop: () => void;
    /**
     * Update the most recent name on the top of the stack.
     *
     * @param {object} token The token to consider as the source for the most
     *                       recent name.
     */
    set(token: any): void;
    /**
     * Generate a string representation of the most recent name.
     *
     * @returns {string}
     */
    infer(): string;
}
