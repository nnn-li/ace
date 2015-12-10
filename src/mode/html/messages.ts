var messages ={
  "null-character":
    "Null character in input stream, replaced with U+FFFD.",
  "invalid-codepoint":
    "Invalid codepoint in stream",
  "incorrectly-placed-solidus":
    "Solidus (/) incorrectly placed in tag.",
  "incorrect-cr-newline-entity":
    "Incorrect CR newline entity, replaced with LF.",
  "illegal-windows-1252-entity":
    "Entity used with illegal number (windows-1252 reference).",
  "cant-convert-numeric-entity":
    "Numeric entity couldn't be converted to character (codepoint U+{charAsInt}).",
  "invalid-numeric-entity-replaced":
    "Numeric entity represents an illegal codepoint. Expanded to the C1 controls range.",
  "numeric-entity-without-semicolon":
    "Numeric entity didn't end with ';'.",
  "expected-numeric-entity-but-got-eof":
    "Numeric entity expected. Got end of file instead.",
  "expected-numeric-entity":
    "Numeric entity expected but none found.",
  "named-entity-without-semicolon":
    "Named entity didn't end with ';'.",
  "expected-named-entity":
    "Named entity expected. Got none.",
  "attributes-in-end-tag":
    "End tag contains unexpected attributes.",
  "self-closing-flag-on-end-tag":
    "End tag contains unexpected self-closing flag.",
  "bare-less-than-sign-at-eof":
    "End of file after <.",
  "expected-tag-name-but-got-right-bracket":
    "Expected tag name. Got '>' instead.",
  "expected-tag-name-but-got-question-mark":
    "Expected tag name. Got '?' instead. (HTML doesn't support processing instructions.)",
  "expected-tag-name":
    "Expected tag name. Got something else instead.",
  "expected-closing-tag-but-got-right-bracket":
    "Expected closing tag. Got '>' instead. Ignoring '</>'.",
  "expected-closing-tag-but-got-eof":
    "Expected closing tag. Unexpected end of file.",
  "expected-closing-tag-but-got-char":
    "Expected closing tag. Unexpected character '{data}' found.",
  "eof-in-tag-name":
    "Unexpected end of file in the tag name.",
  "expected-attribute-name-but-got-eof":
    "Unexpected end of file. Expected attribute name instead.",
  "eof-in-attribute-name":
    "Unexpected end of file in attribute name.",
  "invalid-character-in-attribute-name":
    "Invalid character in attribute name.",
  "duplicate-attribute":
    "Dropped duplicate attribute '{name}' on tag.",
  "expected-end-of-tag-but-got-eof":
    "Unexpected end of file. Expected = or end of tag.",
  "expected-attribute-value-but-got-eof":
    "Unexpected end of file. Expected attribute value.",
  "expected-attribute-value-but-got-right-bracket":
    "Expected attribute value. Got '>' instead.",
  "unexpected-character-in-unquoted-attribute-value":
    "Unexpected character in unquoted attribute",
  "invalid-character-after-attribute-name":
    "Unexpected character after attribute name.",
  "unexpected-character-after-attribute-value":
    "Unexpected character after attribute value.",
  "eof-in-attribute-value-double-quote":
    "Unexpected end of file in attribute value (\").",
  "eof-in-attribute-value-single-quote":
    "Unexpected end of file in attribute value (').",
  "eof-in-attribute-value-no-quotes":
    "Unexpected end of file in attribute value.",
  "eof-after-attribute-value":
    "Unexpected end of file after attribute value.",
  "unexpected-eof-after-solidus-in-tag":
    "Unexpected end of file in tag. Expected >.",
  "unexpected-character-after-solidus-in-tag":
    "Unexpected character after / in tag. Expected >.",
  "expected-dashes-or-doctype":
    "Expected '--' or 'DOCTYPE'. Not found.",
  "unexpected-bang-after-double-dash-in-comment":
    "Unexpected ! after -- in comment.",
  "incorrect-comment":
    "Incorrect comment.",
  "eof-in-comment":
    "Unexpected end of file in comment.",
  "eof-in-comment-end-dash":
    "Unexpected end of file in comment (-).",
  "unexpected-dash-after-double-dash-in-comment":
    "Unexpected '-' after '--' found in comment.",
  "eof-in-comment-double-dash":
    "Unexpected end of file in comment (--).",
  "eof-in-comment-end-bang-state":
    "Unexpected end of file in comment.",
  "unexpected-char-in-comment":
    "Unexpected character in comment found.",
  "need-space-after-doctype":
    "No space after literal string 'DOCTYPE'.",
  "expected-doctype-name-but-got-right-bracket":
    "Unexpected > character. Expected DOCTYPE name.",
  "expected-doctype-name-but-got-eof":
    "Unexpected end of file. Expected DOCTYPE name.",
  "eof-in-doctype-name":
    "Unexpected end of file in DOCTYPE name.",
  "eof-in-doctype":
    "Unexpected end of file in DOCTYPE.",
  "expected-space-or-right-bracket-in-doctype":
    "Expected space or '>'. Got '{data}'.",
  "unexpected-end-of-doctype":
    "Unexpected end of DOCTYPE.",
  "unexpected-char-in-doctype":
    "Unexpected character in DOCTYPE.",
  "eof-in-bogus-doctype":
    "Unexpected end of file in bogus doctype.",
  "eof-in-innerhtml":
    "Unexpected EOF in inner html mode.",
  "unexpected-doctype":
    "Unexpected DOCTYPE. Ignored.",
  "non-html-root":
    "html needs to be the first start tag.",
  "expected-doctype-but-got-eof":
    "Unexpected End of file. Expected DOCTYPE.",
  "unknown-doctype":
    "Erroneous DOCTYPE. Expected <!DOCTYPE html>.",
  "quirky-doctype":
    "Quirky doctype. Expected <!DOCTYPE html>.",
  "almost-standards-doctype":
    "Almost standards mode doctype. Expected <!DOCTYPE html>.",
  "obsolete-doctype":
    "Obsolete doctype. Expected <!DOCTYPE html>.",
  "expected-doctype-but-got-chars":
    "Non-space characters found without seeing a doctype first. Expected e.g. <!DOCTYPE html>.",
  "expected-doctype-but-got-start-tag":
    "Start tag seen without seeing a doctype first. Expected e.g. <!DOCTYPE html>.",
  "expected-doctype-but-got-end-tag":
    "End tag seen without seeing a doctype first. Expected e.g. <!DOCTYPE html>.",
  "end-tag-after-implied-root":
    "Unexpected end tag ({name}) after the (implied) root element.",
  "expected-named-closing-tag-but-got-eof":
    "Unexpected end of file. Expected end tag ({name}).",
  "two-heads-are-not-better-than-one":
    "Unexpected start tag head in existing head. Ignored.",
  "unexpected-end-tag":
    "Unexpected end tag ({name}). Ignored.",
  "unexpected-implied-end-tag":
    "End tag {name} implied, but there were open elements.",
  "unexpected-start-tag-out-of-my-head":
    "Unexpected start tag ({name}) that can be in head. Moved.",
  "unexpected-start-tag":
    "Unexpected start tag ({name}).",
  "missing-end-tag":
    "Missing end tag ({name}).",
  "missing-end-tags":
    "Missing end tags ({name}).",
  "unexpected-start-tag-implies-end-tag":
    "Unexpected start tag ({startName}) implies end tag ({endName}).",
  "unexpected-start-tag-treated-as":
    "Unexpected start tag ({originalName}). Treated as {newName}.",
  "deprecated-tag":
    "Unexpected start tag {name}. Don't use it!",
  "unexpected-start-tag-ignored":
    "Unexpected start tag {name}. Ignored.",
  "expected-one-end-tag-but-got-another":
    "Unexpected end tag ({gotName}). Missing end tag ({expectedName}).",
  "end-tag-too-early":
    "End tag ({name}) seen too early. Expected other end tag.",
  "end-tag-too-early-named":
    "Unexpected end tag ({gotName}). Expected end tag ({expectedName}.",
  "end-tag-too-early-ignored":
    "End tag ({name}) seen too early. Ignored.",
  "adoption-agency-1.1":
    "End tag ({name}) violates step 1, paragraph 1 of the adoption agency algorithm.",
  "adoption-agency-1.2":
    "End tag ({name}) violates step 1, paragraph 2 of the adoption agency algorithm.",
  "adoption-agency-1.3":
    "End tag ({name}) violates step 1, paragraph 3 of the adoption agency algorithm.",
  "adoption-agency-4.4":
    "End tag ({name}) violates step 4, paragraph 4 of the adoption agency algorithm.",
  "unexpected-end-tag-treated-as":
    "Unexpected end tag ({originalName}). Treated as {newName}.",
  "no-end-tag":
    "This element ({name}) has no end tag.",
  "unexpected-implied-end-tag-in-table":
    "Unexpected implied end tag ({name}) in the table phase.",
  "unexpected-implied-end-tag-in-table-body":
    "Unexpected implied end tag ({name}) in the table body phase.",
  "unexpected-char-implies-table-voodoo":
    "Unexpected non-space characters in table context caused voodoo mode.",
  "unexpected-hidden-input-in-table":
    "Unexpected input with type hidden in table context.",
  "unexpected-form-in-table":
    "Unexpected form in table context.",
  "unexpected-start-tag-implies-table-voodoo":
    "Unexpected start tag ({name}) in table context caused voodoo mode.",
  "unexpected-end-tag-implies-table-voodoo":
    "Unexpected end tag ({name}) in table context caused voodoo mode.",
  "unexpected-cell-in-table-body":
    "Unexpected table cell start tag ({name}) in the table body phase.",
  "unexpected-cell-end-tag":
    "Got table cell end tag ({name}) while required end tags are missing.",
  "unexpected-end-tag-in-table-body":
    "Unexpected end tag ({name}) in the table body phase. Ignored.",
  "unexpected-implied-end-tag-in-table-row":
    "Unexpected implied end tag ({name}) in the table row phase.",
  "unexpected-end-tag-in-table-row":
    "Unexpected end tag ({name}) in the table row phase. Ignored.",
  "unexpected-select-in-select":
    "Unexpected select start tag in the select phase treated as select end tag.",
  "unexpected-input-in-select":
    "Unexpected input start tag in the select phase.",
  "unexpected-start-tag-in-select":
    "Unexpected start tag token ({name}) in the select phase. Ignored.",
  "unexpected-end-tag-in-select":
    "Unexpected end tag ({name}) in the select phase. Ignored.",
  "unexpected-table-element-start-tag-in-select-in-table":
    "Unexpected table element start tag ({name}) in the select in table phase.",
  "unexpected-table-element-end-tag-in-select-in-table":
    "Unexpected table element end tag ({name}) in the select in table phase.",
  "unexpected-char-after-body":
    "Unexpected non-space characters in the after body phase.",
  "unexpected-start-tag-after-body":
    "Unexpected start tag token ({name}) in the after body phase.",
  "unexpected-end-tag-after-body":
    "Unexpected end tag token ({name}) in the after body phase.",
  "unexpected-char-in-frameset":
    "Unepxected characters in the frameset phase. Characters ignored.",
  "unexpected-start-tag-in-frameset":
    "Unexpected start tag token ({name}) in the frameset phase. Ignored.",
  "unexpected-frameset-in-frameset-innerhtml":
    "Unexpected end tag token (frameset in the frameset phase (innerHTML).",
  "unexpected-end-tag-in-frameset":
    "Unexpected end tag token ({name}) in the frameset phase. Ignored.",
  "unexpected-char-after-frameset":
    "Unexpected non-space characters in the after frameset phase. Ignored.",
  "unexpected-start-tag-after-frameset":
    "Unexpected start tag ({name}) in the after frameset phase. Ignored.",
  "unexpected-end-tag-after-frameset":
    "Unexpected end tag ({name}) in the after frameset phase. Ignored.",
  "expected-eof-but-got-char":
    "Unexpected non-space characters. Expected end of file.",
  "expected-eof-but-got-start-tag":
    "Unexpected start tag ({name}). Expected end of file.",
  "expected-eof-but-got-end-tag":
    "Unexpected end tag ({name}). Expected end of file.",
  "unexpected-end-table-in-caption":
    "Unexpected end table tag in caption. Generates implied end caption.",
  "end-html-in-innerhtml": 
    "Unexpected html end tag in inner html mode.",
  "eof-in-table":
    "Unexpected end of file. Expected table content.",
  "eof-in-script":
    "Unexpected end of file. Expected script content.",
  "non-void-element-with-trailing-solidus":
    "Trailing solidus not allowed on element {name}.",
  "unexpected-html-element-in-foreign-content":
    "HTML start tag \"{name}\" in a foreign namespace context.",
  "unexpected-start-tag-in-table":
    "Unexpected {name}. Expected table content."
};

export default messages;