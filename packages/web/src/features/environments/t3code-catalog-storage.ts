import type { T3CodeCatalogEntryResponse } from "@t3code-gateway/contracts/schemas";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const databaseName = "t3code:connection-runtime";
const databaseVersion = 4;
const storeName = "catalog";
const requiredStoreNames = ["catalog", "shell", "thread", "server-config", "vcs-refs"] as const;
const documentKey = "document";
const gatewayPrefix = "gateway:";

const CatalogDocumentSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  targets: Schema.Array(Schema.Unknown),
  profiles: Schema.Array(Schema.Unknown),
  credentials: Schema.Array(Schema.Unknown),
  remoteDpopTokens: Schema.Array(Schema.Unknown),
});

type CatalogDocument = typeof CatalogDocumentSchema.Type;

const CatalogConnectionEntry = Schema.Struct({
  connectionId: Schema.String,
  environmentId: Schema.optional(Schema.String),
});

type CatalogConnectionEntry = typeof CatalogConnectionEntry.Type;

const decodeCatalogDocument = Schema.decodeUnknownSync(
  Schema.fromJsonString(CatalogDocumentSchema),
);
const decodeCatalogConnectionEntry = Schema.decodeUnknownOption(CatalogConnectionEntry);

const emptyCatalog = (): CatalogDocument => ({
  schemaVersion: 1,
  targets: [],
  profiles: [],
  credentials: [],
  remoteDpopTokens: [],
});

const connectionId = (environmentId: string) => `${gatewayPrefix}${environmentId}`;

const parseCatalogConnectionEntry = (value: unknown): CatalogConnectionEntry | null =>
  Option.getOrNull(decodeCatalogConnectionEntry(value));

const gatewayEnvironmentIdFromEntry = (entry: unknown) => {
  const parsed = parseCatalogConnectionEntry(entry);
  if (parsed === null || !parsed.connectionId.startsWith(gatewayPrefix)) {
    return null;
  }

  return parsed.environmentId ?? parsed.connectionId.slice(gatewayPrefix.length);
};

const parseCatalog = (value: unknown): CatalogDocument => {
  if (typeof value !== "string") {
    return emptyCatalog();
  }

  try {
    return decodeCatalogDocument(value);
  } catch {
    return emptyCatalog();
  }
};

const createMissingStores = (database: IDBDatabase) => {
  for (const name of requiredStoreNames) {
    if (!database.objectStoreNames.contains(name)) {
      database.createObjectStore(name);
    }
  }
};

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.addEventListener("upgradeneeded", () => {
      createMissingStores(request.result);
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
    request.addEventListener("blocked", () => reject(new Error("IndexedDB open was blocked.")));
  });

const readCatalog = (database: IDBDatabase) =>
  new Promise<unknown>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request: IDBRequest<unknown> = transaction.objectStore(storeName).get(documentKey);
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });

const writeCatalog = (database: IDBDatabase, catalog: CatalogDocument) =>
  new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(JSON.stringify(catalog), documentKey);
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => reject(transaction.error));
    transaction.addEventListener("abort", () => reject(transaction.error));
  });

const upsertByConnectionId = (
  current: ReadonlyArray<unknown>,
  next: ReadonlyArray<unknown>,
): ReadonlyArray<unknown> => {
  const values = new Map<string, unknown>();
  for (const item of current) {
    const parsed = parseCatalogConnectionEntry(item);
    if (parsed !== null) {
      values.set(parsed.connectionId, item);
    }
  }
  for (const item of next) {
    const parsed = parseCatalogConnectionEntry(item);
    if (parsed !== null) {
      values.set(parsed.connectionId, item);
    }
  }
  return [...values.values()];
};

const removeByConnectionId = (items: ReadonlyArray<unknown>, removedConnectionId: string) =>
  items.filter((item) => parseCatalogConnectionEntry(item)?.connectionId !== removedConnectionId);

export async function listInstalledT3CodeEnvironmentIds(): Promise<ReadonlySet<string>> {
  const database = await openDatabase();
  try {
    const catalog = parseCatalog(await readCatalog(database));
    const environmentIds = new Set<string>();
    for (const target of catalog.targets) {
      const environmentId = gatewayEnvironmentIdFromEntry(target);
      if (environmentId !== null) {
        environmentIds.add(environmentId);
      }
    }
    return environmentIds;
  } finally {
    database.close();
  }
}

export async function installT3CodeCatalogEntry(entry: T3CodeCatalogEntryResponse): Promise<void> {
  const database = await openDatabase();
  try {
    const catalog = parseCatalog(await readCatalog(database));
    await writeCatalog(database, {
      schemaVersion: 1,
      targets: upsertByConnectionId(catalog.targets, [entry.target]),
      profiles: upsertByConnectionId(catalog.profiles, [entry.profile]),
      credentials: upsertByConnectionId(catalog.credentials, [entry.credential]),
      remoteDpopTokens: catalog.remoteDpopTokens,
    });
  } finally {
    database.close();
  }
}

export async function removeT3CodeCatalogEnvironment(environmentId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const catalog = parseCatalog(await readCatalog(database));
    const removedConnectionId = connectionId(environmentId);
    await writeCatalog(database, {
      schemaVersion: 1,
      targets: removeByConnectionId(catalog.targets, removedConnectionId),
      profiles: removeByConnectionId(catalog.profiles, removedConnectionId),
      credentials: removeByConnectionId(catalog.credentials, removedConnectionId),
      remoteDpopTokens: catalog.remoteDpopTokens,
    });
  } finally {
    database.close();
  }
}
