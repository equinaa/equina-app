export type AsyncStringStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type LegacyManifest = {
  version: 1;
  chunks: number;
};

type GenerationManifest = {
  version: 2;
  chunks: number;
  generation: string;
};

type Manifest = LegacyManifest | GenerationManifest;

let generationSequence = 0;

const stableKey = (source: string) => {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `equina_session_${(hash >>> 0).toString(16)}`;
};

export function createChunkedSessionStorage({
  secureStore,
  legacyStore,
  chunkSize = 1800
}: {
  secureStore: AsyncStringStore;
  legacyStore: AsyncStringStore;
  chunkSize?: number;
}): AsyncStringStore {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error("Session chunk size must be a positive integer.");
  }

  const manifestKey = (key: string) => `${stableKey(key)}_manifest`;
  const chunkKey = (key: string, manifest: Manifest, index: number) =>
    manifest.version === 1
      ? `${stableKey(key)}_${index}`
      : `${stableKey(key)}_${manifest.generation}_${index}`;
  const operationQueues = new Map<string, Promise<unknown>>();

  const serialize = <T>(key: string, operation: () => Promise<T>): Promise<T> => {
    const previous = operationQueues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    operationQueues.set(key, current);
    return current.finally(() => {
      if (operationQueues.get(key) === current) operationQueues.delete(key);
    });
  };

  const readManifest = async (key: string): Promise<Manifest | null> => {
    const raw = await secureStore.getItem(manifestKey(key));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<Manifest>;
      if (!Number.isInteger(parsed.chunks) || (parsed.chunks ?? 0) < 1) {
        return null;
      }
      if (parsed.version === 1) {
        return { version: 1, chunks: parsed.chunks! };
      }
      const generation = (parsed as Partial<GenerationManifest>).generation;
      if (
        parsed.version !== 2 ||
        typeof generation !== "string" ||
        !/^[a-z0-9_]{1,80}$/.test(generation)
      ) {
        return null;
      }
      return { version: 2, chunks: parsed.chunks!, generation };
    } catch {
      return null;
    }
  };

  const removeChunks = async (key: string, manifest: Manifest) => {
    await Promise.all(
      Array.from({ length: manifest.chunks }, (_, index) =>
        secureStore.removeItem(chunkKey(key, manifest, index))
      )
    );
  };

  const removeSecureValue = async (key: string, knownManifest?: Manifest | null) => {
    const manifest = knownManifest ?? await readManifest(key);
    if (manifest) await removeChunks(key, manifest);
    await secureStore.removeItem(manifestKey(key));
  };

  const storage: AsyncStringStore = {
    async getItem(key) {
      const manifest = await readManifest(key);
      if (manifest) {
        const chunks = await Promise.all(
          Array.from({ length: manifest.chunks }, (_, index) =>
            secureStore.getItem(chunkKey(key, manifest, index))
          )
        );
        if (chunks.every((chunk): chunk is string => typeof chunk === "string")) {
          const value = chunks.join("");
          if (manifest.version === 1) {
            try {
              await storage.setItem(key, value);
            } catch {
              // The intact legacy generation remains readable on the next launch.
            }
          }
          return value;
        }
        await removeSecureValue(key, manifest);
      }

      const legacy = await legacyStore.getItem(key);
      if (legacy === null) return null;
      await storage.setItem(key, legacy);
      await legacyStore.removeItem(key);
      return legacy;
    },

    async setItem(key, value) {
      await serialize(key, async () => {
        const previous = await readManifest(key);
        const chunks = Array.from(
          { length: Math.max(1, Math.ceil(value.length / chunkSize)) },
          (_, index) => value.slice(index * chunkSize, (index + 1) * chunkSize)
        );
        const next: GenerationManifest = {
          version: 2,
          chunks: chunks.length,
          generation: `${Date.now().toString(36)}_${(generationSequence += 1).toString(36)}`
        };

        const writes = await Promise.allSettled(
          chunks.map((chunk, index) =>
            secureStore.setItem(chunkKey(key, next, index), chunk)
          )
        );
        const failedWrite = writes.find(
          (result): result is PromiseRejectedResult => result.status === "rejected"
        );
        if (failedWrite) {
          await Promise.allSettled(
            chunks.map((_, index) => secureStore.removeItem(chunkKey(key, next, index)))
          );
          throw failedWrite.reason;
        }

        try {
          await secureStore.setItem(manifestKey(key), JSON.stringify(next));
        } catch (error) {
          await Promise.allSettled(
            chunks.map((_, index) => secureStore.removeItem(chunkKey(key, next, index)))
          );
          throw error;
        }

        if (previous) await Promise.allSettled([removeChunks(key, previous)]);
      });
    },

    async removeItem(key) {
      await serialize(key, async () => {
        await Promise.all([
          removeSecureValue(key),
          legacyStore.removeItem(key)
        ]);
      });
    }
  };

  return storage;
}
