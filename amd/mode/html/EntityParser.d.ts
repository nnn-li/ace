import InputStream from './InputStream';
import Tokenizer from './Tokenizer';
export declare class EntityParserClass {
    constructor();
    consumeEntity(buffer: InputStream, tokenizer: Tokenizer, additionalAllowedCharacter?: string): any;
    replaceEntityNumbers(c: number): number;
}
export declare var EntityParser: EntityParserClass;
