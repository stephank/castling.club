import { NamedNode, BlankNode, Literal, Quad } from "rdf-js";

import { XML, RDF } from "./consts.js";

export type Node = NamedNode | BlankNode;

export type Subject = Node;
export type Predicate = Node;
export type Object = Node | Literal;

export interface Parser<T> {
  (terms: Object[]): T;
}

export interface BoundGetter {
  <T>(predicateName: string, parser: Parser<T>): T;
}

type StoreO = Object[];
type StorePO = { [predicateName: string]: StoreO };
type StoreSPO = { [subjectName: string]: StorePO };

// A simple RDF triple store.
//
// This store is built for simple queries against subject only ('What color is
// X?'), and not against object ('What things are blue?') or predicate ('What
// things have color?').
//
// The API deals in objects implementing `rdf-js` interfaces.
export class TripleStore {
  protected spo: StoreSPO;

  constructor() {
    // An RDF dataset as: `{ subjectName: { predicateName: [objectTerm] } }`
    //
    // Notably, the subject and predicate are just string keys, but the object
    // is an RDF Term object produced by the jsonld library, which follows the
    // model specified at: http://rdf.js.org/data-model-spec/
    this.spo = Object.create(null);
  }

  // Get the internal `{ predicateName: [objectTerm] }` structure for a subject.
  _getSubject(subjectName: string): StorePO | undefined {
    return this.spo[subjectName];
  }

  // Get the list of objects for a subject and predicate.
  _getObjects(subjectName: string, predicateName: string): StoreO | undefined {
    const po = this._getSubject(subjectName);
    return po ? po[predicateName] : undefined;
  }

  // Check whether a quad already exists in the store.
  has(quad: Quad): boolean {
    const o = this._getObjects(quad.subject.value, quad.predicate.value);
    if (!o) {
      return false;
    }

    for (const objectTerm of o) {
      if (objectTerm.equals(quad.object)) {
        return true;
      }
    }

    return false;
  }

  // Add a RDF Quad to the store.
  add(quad: Quad): void {
    if (this.has(quad)) {
      return;
    }

    const { spo } = this;
    const subjectName = quad.subject.value;
    const predicateName = quad.predicate.value;

    const po = spo[subjectName] || (spo[subjectName] = Object.create(null));
    const o = po[predicateName] || (po[predicateName] = []);
    o.push(<Object>quad.object);
  }

  // Find statements by subject and predicate, then parse the object(s).
  //
  // The parser function is usually one of the other exports of this module.
  //
  // Example: `store.get(actorId, RDF('type'), node) === AS('Person')`
  get<T>(subjectName: string, predicateName: string, parser: Parser<T>): T {
    const o = this._getObjects(subjectName, predicateName) || [];
    return parser(o);
  }

  // Convenience function for operating on a single subject.
  //
  // The return value of the block is passed through as the return value of this
  // method. The block takes as its only parameter the `get` method of this
  // store bound to the given subject.
  //
  // Example: `store.with(actorId, get => ({ type: get(RDF('type'), node) }))`
  with<T>(subjectName: string, block: (get: BoundGetter) => T): T {
    return block((predicateName, parser) =>
      this.get(subjectName, predicateName, parser)
    );
  }
}

// Parse terms to a list of nodes.
export const nodes: Parser<string[]> = (terms) =>
  terms
    .filter(
      (term) => term.termType === "NamedNode" || term.termType === "BlankNode"
    )
    .map((term) => term.value);

// Parse terms to a single node.
export const node: Parser<string | undefined> = (terms) => nodes(terms)[0];

// Parse terms to a string.
//
// The `languages` option is an array of languages to look for. It should
// usually end with the empty string, which acts as a wildcard.
export const text =
  (...languages: string[]): Parser<string | undefined> =>
  (terms) => {
    const literals = <Literal[]>(
      terms.filter((term) => term.termType === "Literal")
    );

    const strings = literals.filter(
      (term) => term.datatype.value === XML("string")
    );
    const langStrings = literals.filter(
      (term) => term.datatype.value === RDF("langString")
    );

    for (const language of languages) {
      const result = language
        ? langStrings.find((term) => term.language === language)
        : strings[0] || langStrings[0];
      if (result) {
        return result.value;
      }
    }

    return undefined;
  };

// Short-hands for common text matchers.
export const anyText = text("");
export const englishText = text("en", "");
