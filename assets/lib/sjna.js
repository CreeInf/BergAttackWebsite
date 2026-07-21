/**
 * SJNA (Scheme Java Notation Artifact) — Read-only JavaScript Port
 * --------------------------------------------------------------
 * Browser-kompatible Portierung der Java-Bibliothek ch.AlexInf:SJNA (v1.1.2).
 * Unterstützt: Parsen, Pfad-Navigation (SJNAConfig), Schemas, Validierung.
 * NICHT enthalten (bewusst weggelassen, da nur Lesen gefordert): Builder,
 * Setter (setString/setInt/...), Serializer, Datei-Speichern.
 *
 * Verwendung im Browser:
 *
 *   const text = await fileInput.files[0].text();
 *   const doc = SJNA.parse(text);
 *   const config = SJNA.asConfig(doc);
 *   const port = config.getInt("server.port");
 *
 * Als ES-Module exportiert (siehe Ende der Datei) und zusätzlich als
 * globales `window.SJNA`, falls per <script> eingebunden.
 */

/* ------------------------------------------------------------------ *
 * Fehlerklassen
 * ------------------------------------------------------------------ */

class ParseException extends Error {
  constructor(message, line, column) {
    super(`${message} at line ${line}, column ${column}`);
    this.name = "ParseException";
    this.line = line;
    this.column = column;
  }
}

class ValidationError {
  constructor(message) {
    this.message = message;
  }
  toString() {
    return this.message;
  }
}

class ValidationResult {
  constructor(errors = []) {
    this.errors = errors;
  }
  isValid() {
    return this.errors.length === 0;
  }
  getErrors() {
    return this.errors;
  }
}

/* ------------------------------------------------------------------ *
 * Datenmodell
 * ------------------------------------------------------------------ */

const NodeType = Object.freeze({
  DOCUMENT: "DOCUMENT",
  OBJECT: "OBJECT",
  PROPERTY: "PROPERTY",
  VALUE: "VALUE",
  SCHEMA: "SCHEMA",
});

const ValueType = Object.freeze({
  STRING: "STRING",
  NUMBER: "NUMBER",
  BOOLEAN: "BOOLEAN",
  IDENTIFIER: "IDENTIFIER",
  OBJECT: "OBJECT",
  LIST: "LIST",
});

class EnumDefinition {
  constructor(options) {
    this.options = options; // string[]
  }
  getOptions() {
    return this.options;
  }
  isValid(value) {
    return this.options.includes(String(value));
  }
}

class ValueNode {
  constructor(valueType, value) {
    this.valueType = valueType;
    this.value = value; // raw value: string | number | boolean | ObjectNode | ValueNode[]
    this.comment = null;
  }
  getType() {
    return NodeType.VALUE;
  }
  getValueType() {
    return this.valueType;
  }
  getValue() {
    return this.value;
  }
  asString() {
    return String(this.value);
  }
  asNumber() {
    return Number(this.value);
  }
  asBoolean() {
    if (typeof this.value === "boolean") return this.value;
    return String(this.value) === "true";
  }
  asObject() {
    return this.value; // ObjectNode
  }
  asList() {
    return this.value; // ValueNode[]
  }
}

class PropertyNode {
  constructor(key, value, enumDefinition = null) {
    this.key = key;
    this.value = value; // ValueNode
    this.enumDefinition = enumDefinition;
    this.comment = null;
  }
  getType() {
    return NodeType.PROPERTY;
  }
  getKey() {
    return this.key;
  }
  getValue() {
    return this.value;
  }
  getEnumDefinition() {
    return this.enumDefinition;
  }
  hasEnum() {
    return this.enumDefinition !== null;
  }
}

class ObjectNode {
  constructor() {
    this.properties = new Map(); // key -> PropertyNode, insertion ordered
  }
  getType() {
    return NodeType.OBJECT;
  }
  addProperty(propNode) {
    this.properties.set(propNode.getKey(), propNode);
  }
  getProperty(key) {
    return this.properties.get(key) || null;
  }
  getProperties() {
    return this.properties; // Map, ordered
  }
  removeProperty(key) {
    this.properties.delete(key);
  }
}

class SchemaProperty {
  constructor(key, enumDefinition = null, description = null) {
    this.key = key;
    this.enumDefinition = enumDefinition;
    this.description = description;
  }
  getKey() {
    return this.key;
  }
  hasEnum() {
    return this.enumDefinition !== null;
  }
  getEnumDefinition() {
    return this.enumDefinition;
  }
  getDescription() {
    return this.description;
  }
}

class SchemaDefinition {
  constructor(name) {
    this.name = name;
    this.properties = new Map(); // key -> SchemaProperty
  }
  getType() {
    return NodeType.SCHEMA;
  }
  getName() {
    return this.name;
  }
  addProperty(schemaProp) {
    this.properties.set(schemaProp.getKey(), schemaProp);
  }
  getProperty(key) {
    return this.properties.get(key) || null;
  }
  getProperties() {
    return this.properties;
  }
  /** Erzeugt eine ObjectNode-Instanz mit Defaults bzw. übergebenen Werten. */
  createInstance(values = {}) {
    const obj = new ObjectNode();
    for (const [key, schemaProp] of this.properties) {
      let raw;
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        raw = values[key];
      } else if (schemaProp.hasEnum()) {
        raw = schemaProp.getEnumDefinition().getOptions()[0];
      } else {
        raw = "";
      }
      const valueNode = wrapValue(raw);
      const propNode = new PropertyNode(key, valueNode, schemaProp.getEnumDefinition());
      obj.addProperty(propNode);
    }
    return obj;
  }
}

class Document {
  constructor() {
    this.schemas = new Map(); // name -> SchemaDefinition
    this.root = new Map(); // key -> PropertyNode, insertion ordered
  }
  getType() {
    return NodeType.DOCUMENT;
  }
  get(key) {
    return this.root.get(key) || null;
  }
  addProperty(key, node) {
    this.root.set(key, node);
  }
  removeProperty(key) {
    this.root.delete(key);
  }
  getRoot() {
    return this.root; // Map, ordered
  }
  addSchema(name, schema) {
    this.schemas.set(name, schema);
  }
  getSchema(name) {
    return this.schemas.get(name) || null;
  }
  getSchemas() {
    return this.schemas;
  }
}

/** Hilfsfunktion: wandelt einen rohen JS-Wert in eine ValueNode um (für createInstance). */
function wrapValue(raw) {
  if (typeof raw === "string") return new ValueNode(ValueType.STRING, raw);
  if (typeof raw === "number") return new ValueNode(ValueType.NUMBER, raw);
  if (typeof raw === "boolean") return new ValueNode(ValueType.BOOLEAN, raw);
  if (raw instanceof ObjectNode) return new ValueNode(ValueType.OBJECT, raw);
  if (Array.isArray(raw)) return new ValueNode(ValueType.LIST, raw.map(wrapValue));
  return new ValueNode(ValueType.IDENTIFIER, String(raw));
}

/* ------------------------------------------------------------------ *
 * Tokenizer
 * ------------------------------------------------------------------ */

const TokenType = Object.freeze({
  IDENTIFIER: "IDENTIFIER",
  STRING: "STRING",
  NUMBER: "NUMBER",
  COLON: "COLON",
  SEMICOLON: "SEMICOLON",
  COMMA: "COMMA",
  LBRACE: "LBRACE",
  RBRACE: "RBRACE",
  LBRACKET: "LBRACKET",
  RBRACKET: "RBRACKET",
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  SCHEMA_MARKER: "SCHEMA_MARKER", // "/:"
  COMMENT: "COMMENT",
  EOF: "EOF",
});

function tokenize(input) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const len = input.length;

  function advance(n = 1) {
    for (let k = 0; k < n; k++) {
      if (input[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  }

  function peek(offset = 0) {
    return input[i + offset];
  }

  while (i < len) {
    const ch = input[i];

    // Whitespace
    if (/\s/.test(ch)) {
      advance();
      continue;
    }

    // Line comment
    if (ch === "/" && peek(1) === "/") {
      let comment = "";
      while (i < len && input[i] !== "\n") {
        comment += input[i];
        advance();
      }
      tokens.push({ type: TokenType.COMMENT, value: comment.replace(/^\/\/\s?/, ""), line, col });
      continue;
    }

    // Schema marker "/:"
    if (ch === "/" && peek(1) === ":") {
      const startLine = line,
        startCol = col;
      advance(2);
      tokens.push({ type: TokenType.SCHEMA_MARKER, value: "/:", line: startLine, col: startCol });
      continue;
    }

    // String literal
    if (ch === '"') {
      const startLine = line,
        startCol = col;
      advance();
      let str = "";
      while (i < len && input[i] !== '"') {
        if (input[i] === "\\" && i + 1 < len) {
          const next = input[i + 1];
          const map = { '"': '"', "\\": "\\", n: "\n", t: "\t", r: "\r" };
          str += map[next] !== undefined ? map[next] : next;
          advance(2);
        } else {
          str += input[i];
          advance();
        }
      }
      if (i >= len) {
        throw new ParseException("Unterminated string literal", startLine, startCol);
      }
      advance(); // closing quote
      tokens.push({ type: TokenType.STRING, value: str, line: startLine, col: startCol });
      continue;
    }

    // Number
    if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(peek(1) || ""))) {
      const startLine = line,
        startCol = col;
      let numStr = "";
      if (ch === "-") {
        numStr += ch;
        advance();
      }
      while (i < len && /[0-9]/.test(input[i])) {
        numStr += input[i];
        advance();
      }
      if (input[i] === "." && /[0-9]/.test(peek(1) || "")) {
        numStr += input[i];
        advance();
        while (i < len && /[0-9]/.test(input[i])) {
          numStr += input[i];
          advance();
        }
      }
      tokens.push({ type: TokenType.NUMBER, value: numStr, line: startLine, col: startCol });
      continue;
    }

    // Identifier / keyword
    if (/[a-zA-Z_]/.test(ch)) {
      const startLine = line,
        startCol = col;
      let ident = "";
      while (i < len && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        advance();
      }
      tokens.push({ type: TokenType.IDENTIFIER, value: ident, line: startLine, col: startCol });
      continue;
    }

    // Single-char punctuation
    const singleMap = {
      ":": TokenType.COLON,
      ";": TokenType.SEMICOLON,
      ",": TokenType.COMMA,
      "{": TokenType.LBRACE,
      "}": TokenType.RBRACE,
      "[": TokenType.LBRACKET,
      "]": TokenType.RBRACKET,
      "(": TokenType.LPAREN,
      ")": TokenType.RPAREN,
    };
    if (singleMap[ch]) {
      tokens.push({ type: singleMap[ch], value: ch, line, col });
      advance();
      continue;
    }

    throw new ParseException(`Unexpected character '${ch}'`, line, col);
  }

  tokens.push({ type: TokenType.EOF, value: null, line, col });
  return tokens;
}

/* ------------------------------------------------------------------ *
 * Parser (rekursiv absteigend)
 * ------------------------------------------------------------------ */

class SJNAParser {
  constructor(tokens) {
    // Kommentare separat herausfiltern, aber positionsnah an folgendes
    // Nicht-Kommentar-Token anhängen (für inline-Kommentare am Zeilenende).
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.pos + offset];
  }

  current() {
    return this.tokens[this.pos];
  }

  advance() {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }

  /** Überspringt und sammelt Kommentar-Tokens, gibt den letzten Kommentartext zurück (oder null). */
  skipComments() {
    let last = null;
    while (this.current().type === TokenType.COMMENT) {
      last = this.current().value;
      this.advance();
    }
    return last;
  }

  expect(type) {
    this.skipComments();
    const t = this.current();
    if (t.type !== type) {
      throw new ParseException(`Expected '${type}' but found '${t.type}'`, t.line, t.col);
    }
    return this.advance();
  }

  check(type) {
    this.skipComments();
    return this.current().type === type;
  }

  parseDocument() {
    const doc = new Document();
    this.skipComments();
    while (this.current().type !== TokenType.EOF) {
      this.skipComments();
      if (this.current().type === TokenType.EOF) break;

      if (this.current().type === TokenType.SCHEMA_MARKER) {
        const schema = this.parseSchema();
        doc.addSchema(schema.getName(), schema);
      } else {
        const prop = this.parseProperty();
        doc.addProperty(prop.getKey(), prop);
      }
      this.skipComments();
    }
    return doc;
  }

  parseSchema() {
    this.expect(TokenType.SCHEMA_MARKER);
    this.skipComments();
    const kw = this.expect(TokenType.IDENTIFIER); // "schema"
    if (kw.value !== "schema") {
      throw new ParseException(`Expected 'schema' keyword`, kw.line, kw.col);
    }
    this.skipComments();
    const nameTok = this.expect(TokenType.COLON);
    this.skipComments();
    const nameIdent = this.expect(TokenType.IDENTIFIER);
    const schema = new SchemaDefinition(nameIdent.value);
    this.skipComments();
    this.expect(TokenType.LBRACE);
    this.skipComments();

    while (!this.check(TokenType.RBRACE)) {
      const keyTok = this.expect(TokenType.IDENTIFIER);
      let enumDef = null;
      if (this.check(TokenType.LPAREN)) {
        enumDef = this.parseEnumOptions();
      }
      this.expect(TokenType.COLON);
      // Schema-Felder haben keinen Wert nach dem Doppelpunkt, nur ";"
      this.skipComments();
      this.expect(TokenType.SEMICOLON);
      const comment = this.skipComments();
      schema.addProperty(new SchemaProperty(keyTok.value, enumDef, comment));
      this.skipComments();
    }
    this.expect(TokenType.RBRACE);
    return schema;
  }

  parseEnumOptions() {
    this.expect(TokenType.LPAREN);
    const options = [];
    while (!this.check(TokenType.RPAREN)) {
      this.skipComments();
      const t = this.current();
      if (t.type === TokenType.STRING || t.type === TokenType.IDENTIFIER) {
        options.push(t.value);
        this.advance();
      } else {
        throw new ParseException(`Expected enum option`, t.line, t.col);
      }
      this.skipComments();
      if (this.check(TokenType.COMMA)) {
        this.advance();
      }
    }
    this.expect(TokenType.RPAREN);
    return new EnumDefinition(options);
  }

  parseProperty() {
    this.skipComments();
    const keyTok = this.current();
    let key;
    if (keyTok.type === TokenType.IDENTIFIER) {
      key = keyTok.value;
      this.advance();
    } else if (keyTok.type === TokenType.STRING) {
      key = keyTok.value;
      this.advance();
    } else {
      throw new ParseException(`Expected property key`, keyTok.line, keyTok.col);
    }

    let enumDef = null;
    if (this.check(TokenType.LPAREN)) {
      enumDef = this.parseEnumOptions();
    }

    this.expect(TokenType.COLON);
    this.skipComments();
    const value = this.parseValue();
    this.skipComments();
    this.expect(TokenType.SEMICOLON);
    const comment = this.skipComments();

    const prop = new PropertyNode(key, value, enumDef);
    prop.comment = comment;
    return prop;
  }

  parseValue() {
    this.skipComments();
    const t = this.current();

    if (t.type === TokenType.STRING) {
      this.advance();
      return new ValueNode(ValueType.STRING, t.value);
    }
    if (t.type === TokenType.NUMBER) {
      this.advance();
      const num = t.value.includes(".") ? parseFloat(t.value) : parseInt(t.value, 10);
      return new ValueNode(ValueType.NUMBER, num);
    }
    if (t.type === TokenType.IDENTIFIER) {
      if (t.value === "true" || t.value === "false") {
        this.advance();
        return new ValueNode(ValueType.BOOLEAN, t.value === "true");
      }
      this.advance();
      return new ValueNode(ValueType.IDENTIFIER, t.value);
    }
    if (t.type === TokenType.LBRACE) {
      const obj = this.parseObject();
      return new ValueNode(ValueType.OBJECT, obj);
    }
    if (t.type === TokenType.LBRACKET) {
      const list = this.parseList();
      return new ValueNode(ValueType.LIST, list);
    }

    throw new ParseException(`Unexpected token while parsing value`, t.line, t.col);
  }

  parseObject() {
    this.expect(TokenType.LBRACE);
    const obj = new ObjectNode();
    this.skipComments();
    while (!this.check(TokenType.RBRACE)) {
      const prop = this.parseProperty();
      obj.addProperty(prop);
      this.skipComments();
    }
    this.expect(TokenType.RBRACE);
    return obj;
  }

  parseList() {
    this.expect(TokenType.LBRACKET);
    const items = [];
    this.skipComments();
    while (!this.check(TokenType.RBRACKET)) {
      const value = this.parseValue();
      items.push(value);
      this.skipComments();
      if (this.check(TokenType.COMMA)) {
        this.advance();
        this.skipComments();
      }
    }
    this.expect(TokenType.RBRACKET);
    return items;
  }
}

/* ------------------------------------------------------------------ *
 * Validator
 * ------------------------------------------------------------------ */

function validateDocument(doc) {
  const errors = [];

  function checkObject(obj) {
    for (const [, prop] of obj.getProperties()) {
      checkProperty(prop);
    }
  }

  function checkProperty(prop) {
    if (prop.hasEnum()) {
      const val = prop.getValue();
      const raw = val.getValue();
      const strVal = val.getValueType() === ValueType.OBJECT || val.getValueType() === ValueType.LIST
        ? null
        : String(raw);
      if (strVal !== null && !prop.getEnumDefinition().isValid(strVal)) {
        errors.push(
          new ValidationError(
            `Invalid enum value for '${prop.getKey()}': ${strVal}. Allowed: [${prop
              .getEnumDefinition()
              .getOptions()
              .join(", ")}]`
          )
        );
      }
    }
    const val = prop.getValue();
    if (val.getValueType() === ValueType.OBJECT) {
      checkObject(val.asObject());
    } else if (val.getValueType() === ValueType.LIST) {
      for (const item of val.asList()) {
        if (item.getValueType() === ValueType.OBJECT) {
          checkObject(item.asObject());
        }
      }
    }
  }

  for (const [, prop] of doc.getRoot()) {
    checkProperty(prop);
  }

  return new ValidationResult(errors);
}

function validateAgainstSchema(doc, schemaName) {
  const schema = doc.getSchema(schemaName);
  if (!schema) {
    return new ValidationResult([new ValidationError(`Schema not found: ${schemaName}`)]);
  }
  const errors = [];

  for (const [key, schemaProp] of schema.getProperties()) {
    const docProp = doc.get(key);
    if (!docProp) {
      errors.push(new ValidationError(`Missing required field: ${key}`));
      continue;
    }
    if (schemaProp.hasEnum()) {
      const raw = docProp.getValue().getValue();
      const strVal = String(raw);
      if (!schemaProp.getEnumDefinition().isValid(strVal)) {
        errors.push(
          new ValidationError(
            `Schema violation for '${key}': ${strVal}. Expected one of: [${schemaProp
              .getEnumDefinition()
              .getOptions()
              .join(", ")}]`
          )
        );
      }
    }
  }

  return new ValidationResult(errors);
}

/* ------------------------------------------------------------------ *
 * SJNAConfig — Pfad-basierter Lesezugriff
 * ------------------------------------------------------------------ */

class SJNAConfig {
  constructor(doc) {
    this.doc = doc;
  }

  getDocument() {
    return this.doc;
  }

  /** Interne Hilfsfunktion: löst einen Punkt-Pfad ("server.port") zur PropertyNode auf. */
  _resolve(path) {
    const parts = path.split(".");
    let currentProp = this.doc.get(parts[0]);
    if (!currentProp) return null;

    for (let idx = 1; idx < parts.length; idx++) {
      const val = currentProp.getValue();
      if (val.getValueType() !== ValueType.OBJECT) return null;
      const obj = val.asObject();
      currentProp = obj.getProperty(parts[idx]);
      if (!currentProp) return null;
    }
    return currentProp;
  }

  _requireValue(path) {
    const prop = this._resolve(path);
    if (!prop) {
      throw new Error(`Path not found: ${path}`);
    }
    return prop.getValue();
  }

  hasPath(path) {
    return this._resolve(path) !== null;
  }

  getString(path, fallback) {
    try {
      return this._requireValue(path).asString();
    } catch (e) {
      if (fallback !== undefined) return fallback;
      throw e;
    }
  }

  getNumber(path, fallback) {
    try {
      return this._requireValue(path).asNumber();
    } catch (e) {
      if (fallback !== undefined) return fallback;
      throw e;
    }
  }

  getInt(path, fallback) {
    try {
      return Math.trunc(this._requireValue(path).asNumber());
    } catch (e) {
      if (fallback !== undefined) return fallback;
      throw e;
    }
  }

  getLong(path, fallback) {
    return this.getInt(path, fallback);
  }

  getDouble(path, fallback) {
    return this.getNumber(path, fallback);
  }

  getBoolean(path, fallback) {
    try {
      return this._requireValue(path).asBoolean();
    } catch (e) {
      if (fallback !== undefined) return fallback;
      throw e;
    }
  }

  getObject(path) {
    return this._requireValue(path).asObject();
  }

  getList(path) {
    const val = this._requireValue(path);
    return val.asList().map((v) => v.asString());
  }

  getNumberList(path) {
    const val = this._requireValue(path);
    return val.asList().map((v) => v.asNumber());
  }

  getIntList(path) {
    const val = this._requireValue(path);
    return val.asList().map((v) => Math.trunc(v.asNumber()));
  }

  getObjectList(path) {
    const val = this._requireValue(path);
    return val.asList().map((v) => objectNodeToMap(v.asObject()));
  }

  getKeys(path) {
    if (path === undefined) {
      return Array.from(this.doc.getRoot().keys());
    }
    const obj = this.getObject(path);
    return Array.from(obj.getProperties().keys());
  }

  getAsMap(path) {
    const obj = this.getObject(path);
    return objectNodeToMap(obj);
  }

  getAllAsMap() {
    const result = {};
    for (const [key, prop] of this.doc.getRoot()) {
      result[key] = valueNodeToJs(prop.getValue());
    }
    return result;
  }

  getObjects(path) {
    const map = path == null ? this.doc.getRoot() : this.getObject(path).getProperties();
    const result = [];
    for (const [, prop] of map) {
      if (prop.getValue().getValueType() === ValueType.OBJECT) {
        result.push(prop.getValue().asObject());
      }
    }
    return result;
  }

  getObjectsWithKeys(path) {
    const map = path == null ? this.doc.getRoot() : this.getObject(path).getProperties();
    const result = new Map();
    for (const [key, prop] of map) {
      if (prop.getValue().getValueType() === ValueType.OBJECT) {
        result.set(key, prop.getValue().asObject());
      }
    }
    return result;
  }

  getObjectsAsMap(path) {
    return this.getObjects(path).map(objectNodeToMap);
  }
}

/** Wandelt eine ObjectNode rekursiv in ein plain JS-Objekt um. */
function objectNodeToMap(obj) {
  const result = {};
  for (const [key, prop] of obj.getProperties()) {
    result[key] = valueNodeToJs(prop.getValue());
  }
  return result;
}

function valueNodeToJs(valueNode) {
  switch (valueNode.getValueType()) {
    case ValueType.OBJECT:
      return objectNodeToMap(valueNode.asObject());
    case ValueType.LIST:
      return valueNode.asList().map(valueNodeToJs);
    default:
      return valueNode.getValue();
  }
}

/* ------------------------------------------------------------------ *
 * SJNA — Haupt-API
 * ------------------------------------------------------------------ */

const SJNA = {
  /**
   * Parst SJNA-Text (z.B. aus file.text()) zu einem Document.
   * Ersetzt das Java-Pendant SJNA.load(path), da im Browser kein
   * direkter Dateisystemzugriff existiert.
   */
  parse(content) {
    const tokens = tokenize(content);
    const parser = new SJNAParser(tokens);
    return parser.parseDocument();
  },

  /** Bequemer Wrapper: parst direkt ein im Browser ausgewähltes File/Blob-Objekt. */
  async parseFile(fileOrBlob) {
    const text = await fileOrBlob.text();
    return SJNA.parse(text);
  },

  validate(doc) {
    return validateDocument(doc);
  },

  validateAgainstSchema(doc, schemaName) {
    return validateAgainstSchema(doc, schemaName);
  },

  asConfig(doc) {
    return new SJNAConfig(doc);
  },

  createFromSchema(doc, schemaName, values = {}) {
    const schema = doc.getSchema(schemaName);
    if (!schema) {
      throw new Error(`Schema not found: ${schemaName}`);
    }
    return schema.createInstance(values);
  },
};

/* ------------------------------------------------------------------ *
 * Exporte
 * ------------------------------------------------------------------ */

export {
  SJNA,
  SJNAConfig,
  Document,
  ObjectNode,
  PropertyNode,
  ValueNode,
  SchemaDefinition,
  SchemaProperty,
  EnumDefinition,
  ValidationResult,
  ValidationError,
  ParseException,
  NodeType,
  ValueType,
};

// Für direkte <script>-Einbindung ohne Module-System zusätzlich global verfügbar machen.
if (typeof window !== "undefined") {
  window.SJNA = SJNA;
}
