import type { T3CodeCatalogEntryResponse } from "@t3code-gateway/contracts/schemas";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const databaseName = "t3code:connection-runtime";
const databaseVersion = 4;
const storeName = "catalog";
const requiredStoreNames = ["catalog", "shell", "thread", "server-config", "vcs-refs"] as const;
// Caches T3 Code keeps per environment: keyed by its id, or by `<id>:<key>`.
const environmentKeyedStoreNames = ["shell", "server-config"] as const;
const environmentPrefixedStoreNames = ["thread", "vcs-refs"] as const;
const documentKey = "document";
const gatewayPrefix = "gateway:";
const learnedPrefix = "learned:";

// T3 Code owns this document and keeps adding keys (githubRoutingPermissions, ...);
// the rest record carries keys we don't know through our writes.
const CatalogDocumentSchema = Schema.StructWithRest(
  Schema.Struct({
    schemaVersion: Schema.Literal(1),
    targets: Schema.Array(Schema.Unknown),
    profiles: Schema.Array(Schema.Unknown),
    credentials: Schema.Array(Schema.Unknown),
    remoteDpopTokens: Schema.Array(Schema.Unknown),
    disabledEnvironmentIds: Schema.optionalKey(Schema.Array(Schema.String)),
    githubRoutingPermissions: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

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
const decodeEnvironmentRecord = Schema.decodeUnknownOption(
  Schema.Struct({ environmentId: Schema.String }),
);

const belongsTo = (environmentId: string) => (item: unknown) =>
  Option.match(decodeEnvironmentRecord(item), {
    onNone: () => false,
    onSome: (record) => record.environmentId === environmentId,
  });

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

/**
 * The connection id whose credential a route uses: a route T3 Code learned
 * from another (a LAN or tailnet address) borrows that route's credential.
 */
const credentialConnectionId = (routeConnectionId: string) => {
  const at = routeConnectionId.indexOf("@");
  return routeConnectionId.startsWith(learnedPrefix) && at !== -1
    ? routeConnectionId.slice(at + 1)
    : routeConnectionId;
};

/** Writing over a document we can't read would erase every environment the user saved. */
const parseCatalog = (value: unknown): CatalogDocument => {
  if (value === undefined) {
    return emptyCatalog();
  }
  if (typeof value !== "string") {
    throw new Error("T3 Code's saved environments are in an unknown format.");
  }

  try {
    return decodeCatalogDocument(value);
  } catch {
    throw new Error("T3 Code's saved environments could not be read; open T3 Code to repair them.");
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

export async function listInstalledT3CodeEnvironmentIds(): Promise<ReadonlySet<string>> {
  const database = await openDatabase();
  try {
    const raw = await readCatalog(database);
    const environmentIds = new Set<string>();
    let catalog: CatalogDocument;
    try {
      catalog = parseCatalog(raw);
    } catch {
      // Listing shows nothing installed; adding or removing reports why.
      return environmentIds;
    }
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
      ...catalog,
      targets: upsertByConnectionId(catalog.targets, [entry.target]),
      profiles: upsertByConnectionId(catalog.profiles, [entry.profile]),
      credentials: upsertByConnectionId(catalog.credentials, [entry.credential]),
    });
  } finally {
    database.close();
  }
}

/** Drops the gateway's routes to an environment, and the environment itself once no route is left. */
const removeGatewayRoutes = (catalog: CatalogDocument, environmentId: string) => {
  const gatewayConnectionId = connectionId(environmentId);
  const removedConnectionIds = new Set<string>();
  for (const target of catalog.targets) {
    const parsed = parseCatalogConnectionEntry(target);
    if (parsed !== null && credentialConnectionId(parsed.connectionId) === gatewayConnectionId) {
      removedConnectionIds.add(parsed.connectionId);
    }
  }
  removedConnectionIds.add(gatewayConnectionId);

  const kept = (item: unknown) => {
    const parsed = parseCatalogConnectionEntry(item);
    return parsed === null || !removedConnectionIds.has(parsed.connectionId);
  };
  const targets = catalog.targets.filter(kept);
  const next: CatalogDocument = {
    ...catalog,
    targets,
    profiles: catalog.profiles.filter(kept),
    credentials: catalog.credentials.filter(kept),
  };
  const environmentRemains = targets.some(belongsTo(environmentId));
  if (environmentRemains) {
    return { catalog: next, environmentRemoved: false };
  }

  // Matches T3 Code: forgetting an environment also forgets its other records.
  const { disabledEnvironmentIds, githubRoutingPermissions, ...rest } = next;
  return {
    catalog: {
      ...rest,
      remoteDpopTokens: next.remoteDpopTokens.filter((token) => !belongsTo(environmentId)(token)),
      ...(disabledEnvironmentIds === undefined
        ? {}
        : { disabledEnvironmentIds: disabledEnvironmentIds.filter((id) => id !== environmentId) }),
      ...(githubRoutingPermissions === undefined
        ? {}
        : {
            githubRoutingPermissions: githubRoutingPermissions.filter(
              (permission) => !belongsTo(environmentId)(permission),
            ),
          }),
    },
    environmentRemoved: true,
  };
};

export async function removeT3CodeCatalogEnvironment(environmentId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const { catalog, environmentRemoved } = removeGatewayRoutes(
      parseCatalog(await readCatalog(database)),
      environmentId,
    );
    const storeNames = environmentRemoved ? [...requiredStoreNames] : [storeName];
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeNames, "readwrite");
      transaction.objectStore(storeName).put(JSON.stringify(catalog), documentKey);
      if (environmentRemoved) {
        for (const name of environmentKeyedStoreNames) {
          transaction.objectStore(name).delete(environmentId);
        }
        for (const name of environmentPrefixedStoreNames) {
          transaction
            .objectStore(name)
            .delete(IDBKeyRange.bound(`${environmentId}:`, `${environmentId}:\uffff`));
        }
      }
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("error", () => reject(transaction.error));
      transaction.addEventListener("abort", () => reject(transaction.error));
    });
  } finally {
    database.close();
  }
}
