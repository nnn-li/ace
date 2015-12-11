interface JSHintError {
    line: number;
    raw: string;
    evidence: string;
    character: number;
    reason: string;
}
export default JSHintError;
