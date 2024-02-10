// TypeScript declarations for dependencies.

// Custom declarations for jsonld, because the `@types/jsonld` package is too
// limited. (No factory interface, no promise interface, no `toRDF` types.)
declare module "jsonld" {
  // `toRDF` emits plain objects, that otherwise follow the `@rdfjs/types`
  // interface, but don't have any of the methods.
  type ExcludeMethods<T> = Exclude<T, { [prop: string]: Function }>;

  export type NamedNode = ExcludeMethods<import("@rdfjs/types").NamedNode>;
  export type BlankNode = ExcludeMethods<import("@rdfjs/types").BlankNode>;
  export type Literal = ExcludeMethods<import("@rdfjs/types").Literal>;
  export type DefaultGraph = ExcludeMethods<
    import("@rdfjs/types").DefaultGraph
  >;

  export type Term = NamedNode | BlankNode | Literal | DefaultGraph;

  export interface Quad {
    subject: NamedNode | BlankNode;
    predicate: NamedNode | BlankNode;
    object: NamedNode | BlankNode | Literal;
    graph: DefaultGraph | NamedNode | BlankNode;
  }

  export interface DocumentLoader {
    (url: string): Promise<{ document: any } | null>;
  }

  export interface ToRdfOptions {
    issuer?: jsonld.IdentifierIssuer;
  }

  export interface Processor {
    documentLoader: DocumentLoader;

    toRDF(input: string | object, options: ToRdfOptions): Promise<Quad[]>;
  }

  namespace jsonld {
    class IdentifierIssuer {
      constructor(prefix: string);
    }
  }

  function jsonld(): Processor;

  export default jsonld;
}
