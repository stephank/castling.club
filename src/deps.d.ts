// TypeScript declarations for dependencies.

// Custom declarations for jsonld, because the `@types/jsonld` package is too
// limited. (No factory interface, no promise interface, no `toRDF` types.)
declare module "jsonld" {
  // `toRDF` emits plain objects, that otherwise follow the `rdf-js`
  // interface, but don't have any of the methods.
  type ExcludeMethods<T> = Exclude<T, { [prop: string]: Function }>;

  namespace jsonld {
    type NamedNode = ExcludeMethods<import("rdf-js").NamedNode>;
    type BlankNode = ExcludeMethods<import("rdf-js").BlankNode>;
    type Literal = ExcludeMethods<import("rdf-js").Literal>;
    type DefaultGraph = ExcludeMethods<import("rdf-js").DefaultGraph>;

    type Term = NamedNode | BlankNode | Literal | DefaultGraph;

    interface Quad {
      subject: NamedNode | BlankNode;
      predicate: NamedNode | BlankNode;
      object: NamedNode | BlankNode | Literal;
      graph: DefaultGraph | NamedNode | BlankNode;
    }

    class IdentifierIssuer {
      constructor(prefix: string);
    }

    interface DocumentLoader {
      (url: string): Promise<{ document: any } | null>;
    }

    interface ToRdfOptions {
      issuer?: IdentifierIssuer;
    }

    interface Processor {
      documentLoader: DocumentLoader;

      toRDF(input: string | object, options: ToRdfOptions): Promise<Quad[]>;
    }
  }

  function jsonld(): jsonld.Processor;

  export = jsonld;
}
