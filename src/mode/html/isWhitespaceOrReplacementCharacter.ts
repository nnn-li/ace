import isWhitespace from './isWhitespace';

export default function isWhitespaceOrReplacementCharacter(ch: string): boolean {
  return isWhitespace(ch) || ch === '\uFFFD';
}
