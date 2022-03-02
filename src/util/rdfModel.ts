// Functions that extract objects from the RDF store in our expected format.

import { RDF, LDP, AS, SEC } from "./consts";
import { TripleStore, nodes, node, anyText, englishText } from "./rdf";

export interface Actor {
  id: string;
  type?: string;
  preferredUsername?: string;
  inbox?: string;
  endpoints?: string;
}

export interface Endpoints {
  id: string;
  sharedInbox?: string;
}

export interface Activity {
  id: string;
  type?: string;
  actor?: string;
  object?: string;
}

export interface Object {
  id: string;
  type?: string;
  attributedTo?: string;
  inReplyTo?: string;
  content?: string;
  tags: string[];
}

export interface Tag {
  id: string;
  type?: string;
  href?: string;
}

export interface PublicKey {
  id: string;
  owner?: string;
  publicKeyPem?: string;
}

// Get an Actor from an RDF store.
export const getActor = (store: TripleStore, id: string): Actor =>
  store.with(id, (get) => ({
    id,
    type: get(RDF("type"), node),
    preferredUsername: get(AS("preferredUsername"), englishText),
    inbox: get(LDP("inbox"), node),
    endpoints: get(AS("endpoints"), node),
  }));

// Get Endpoints from an RDF store.
export const getEndpoints = (store: TripleStore, id: string): Endpoints =>
  store.with(id, (get) => ({
    id,
    sharedInbox: get(AS("sharedInbox"), node),
  }));

// Get an Activity from an RDF store.
export const getActivity = (store: TripleStore, id: string): Activity =>
  store.with(id, (get) => ({
    id,
    type: get(RDF("type"), node),
    actor: get(AS("actor"), node),
    object: get(AS("object"), node),
  }));

// Get an Object from an RDF store.
export const getObject = (store: TripleStore, id: string): Object =>
  store.with(id, (get) => ({
    id,
    type: get(RDF("type"), node),
    attributedTo: get(AS("attributedTo"), node),
    inReplyTo: get(AS("inReplyTo"), node),
    content: get(AS("content"), englishText),
    tags: get(AS("tag"), nodes),
  }));

// Get a Tag from an RDF store.
export const getTag = (store: TripleStore, id: string): Tag =>
  store.with(id, (get) => ({
    id,
    type: get(RDF("type"), node),
    href: get(AS("href"), node),
  }));

// Get a Public Key from an RDF store.
export const getPublicKey = (store: TripleStore, id: string): PublicKey =>
  store.with(id, (get) => ({
    id,
    owner: get(SEC("owner"), node),
    publicKeyPem: get(SEC("publicKeyPem"), anyText),
  }));
