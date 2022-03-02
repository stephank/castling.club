import createDebug from "debug";
import got from "got";
import rdf from "@rdfjs/data-model";

import {
  Term,
  Quad,
  Quad_Subject,
  Quad_Predicate,
  Quad_Object,
  Quad_Graph,
} from "rdf-js";

import jsonldFactory, {
  Term as PlainTerm,
  Quad as PlainQuad,
  IdentifierIssuer,
  ToRdfOptions,
  Processor,
} from "jsonld";

import { CacheService } from "./cache";
import { TripleStore as PlainTripleStore } from "../util/rdf";
import { JSON_ACCEPTS } from "../util/consts";
import { checkPublicUrl } from "../util/misc";

export interface JsonLdService {
  createStore(): TripleStore;
}

const debug = createDebug("chess:jsonld");

// The JSON-LD library produces plain object RDF terms, instead of actual model
// instances. This function does the conversion. Borrowed from
// `@rdfjs/parser-jsonld`, also MIT.
const fromPlainTerm = (plainTerm: PlainTerm): Term => {
  switch (plainTerm.termType) {
    case "NamedNode":
      return rdf.namedNode(plainTerm.value);
    case "BlankNode":
      return rdf.blankNode(plainTerm.value.substr(2));
    case "Literal":
      return rdf.literal(
        plainTerm.value,
        plainTerm.language || rdf.namedNode(plainTerm.datatype.value)
      );
    case "DefaultGraph":
      return rdf.defaultGraph();
  }
};

// Convert a plan object RDF quad to a model instance.
const fromPlainQuad = (plainQuad: PlainQuad): Quad =>
  rdf.quad(
    <Quad_Subject>fromPlainTerm(plainQuad.subject),
    <Quad_Predicate>fromPlainTerm(plainQuad.predicate),
    <Quad_Object>fromPlainTerm(plainQuad.object),
    <Quad_Graph>fromPlainTerm(plainQuad.graph)
  );

// Holds a graph of data extracted from JSON-LD documents.
export class TripleStore extends PlainTripleStore {
  private jsonld: Processor;
  private options: ToRdfOptions;

  constructor(jsonld: Processor) {
    super();

    // A jsonld instance, typically setup with a caching loader.
    this.jsonld = jsonld;
    // Options used for all jsonld calls.
    this.options = {
      // Share the ID issuer, so we don't create conflicts between calls.
      issuer: new IdentifierIssuer("_:b"),
    };
  }

  // Load a document into the graph. Input may be JSON-LD or a URL.
  async load(input: string | object): Promise<void> {
    // Check if it already exists.
    if (typeof input === "string" && this.spo[input]) {
      return;
    }

    // Fetch the document if necessary, and get the RDF quads.
    const quads = await this.jsonld.toRDF(input, this.options);

    // Insert the quads into the dataset.
    for (const quad of quads) {
      this.add(fromPlainQuad(quad));
    }
  }
}

export default async ({
  cache,
  env,
  origin,
}: {
  cache: CacheService;
  env: string;
  origin: string;
}): Promise<JsonLdService> => {
  const jsonld = jsonldFactory();

  // Setup JSON-LD to use 'got' with caching.
  jsonld.documentLoader = async (url: string) => {
    if (env === "production" && !checkPublicUrl(url)) {
      return null;
    }

    debug(`REQ: ${url}`);
    const document: any = await got(url, {
      resolveBodyOnly: true,
      cache: cache.http,
      headers: {
        "user-agent": `${origin}/`,
        accept: JSON_ACCEPTS,
      },
    }).json();
    return { document };
  };

  const createStore = () => new TripleStore(jsonld);

  return { createStore };
};
