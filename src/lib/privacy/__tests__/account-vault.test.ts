import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { listSavedPassages, savePassageEntry } from "@/lib/ai/passage-store";
import {
  authorizedVaultUserId,
  deriveAccountVaultKey,
  discardAccountVault,
  flushAccountVault,
  LEGACY_QUARANTINE_KEY,
  lockAccountVault,
  readPrivateString,
  sealedPrivateSnapshot,
  unlockAccountVault,
  vaultKeyMaterials,
  writePrivateString,
} from "@/lib/privacy/account-vault";
import {
  clearAllLocalPdfStorage,
  getLocalPdfBinary,
  legacyBookQuarantineSnapshot,
  listLocalPdfDocuments,
  saveLocalPdfDocument,
  sealedPdfSnapshot,
} from "@/lib/reader/storage";
import { unlockTestVault } from "@/test/unlock-vault";

const TITLE = "Student A private circuit book";
const HIGHLIGHT = "Only student A highlighted this sentence.";

function installMemoryIndexedDb(): void {
  const databases = new Map<string, Map<string, Map<string, { id: string }>>>();
  const indexedDb = {
    open(name: string) {
      const request: {
        result?: IDBDatabase;
        onupgradeneeded: ((event: Event) => void) | null;
        onsuccess: ((event: Event) => void) | null;
      } = { onupgradeneeded: null, onsuccess: null };
      queueMicrotask(() => {
        let stores = databases.get(name);
        const created = !stores;
        if (!stores) {
          stores = new Map();
          databases.set(name, stores);
        }
        const database = {
          objectStoreNames: { contains: (store: string) => stores?.has(store) ?? false },
          createObjectStore(store: string) {
            stores?.set(store, new Map());
          },
          transaction(storeNames: string | string[]) {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const transaction = {
              objectStore(store: string) {
                const records = stores?.get(store);
                if (!records) throw new Error(`Missing store ${store}`);
                return {
                  put(value: { id: string }) {
                    records.set(value.id, value);
                  },
                  delete(id: string) {
                    records.delete(id);
                  },
                  clear() {
                    records.clear();
                  },
                  getAll() {
                    const query: {
                      result?: unknown[];
                      onsuccess: ((event: Event) => void) | null;
                    } = { onsuccess: null };
                    queueMicrotask(() => {
                      query.result = [...records.values()];
                      query.onsuccess?.(new Event("success"));
                    });
                    return query;
                  },
                };
              },
            } as IDBTransaction;
            void names;
            queueMicrotask(() => transaction.oncomplete?.(new Event("complete")));
            return transaction;
          },
          close() {},
        } as unknown as IDBDatabase;
        request.result = database;
        if (created) request.onupgradeneeded?.(new Event("upgradeneeded") as IDBVersionChangeEvent);
        request.onsuccess?.(new Event("success"));
      });
      return request as unknown as IDBOpenDBRequest;
    },
  };
  Object.assign(globalThis, { indexedDB: indexedDb });
}

describe("account vault", () => {
  afterEach(async () => {
    await clearAllLocalPdfStorage();
    window.localStorage.clear();
    discardAccountVault();
  });

  it("returns a saved book and note only to the student who sealed them", async () => {
    await unlockTestVault("student-a");
    const saved = await saveLocalPdfDocument({
      title: TITLE,
      fileName: "circuit.pdf",
      pdfBytes: new Uint8Array([37, 80, 68, 70, 45, 49, 46, 49]),
      pageCount: 1,
    });
    savePassageEntry(
      {
        documentId: saved.document.id,
        documentTitle: TITLE,
        pageNumber: 1,
        sectionHeading: "Current",
        boundingBox: { x: 0, y: 0, width: 1, height: 1 },
        highlightedText: HIGHLIGHT,
        aiSynthesisMarkdown: "private",
        citations: [],
      },
      "student-a"
    );
    await lockAccountVault();

    expect(sealedPdfSnapshot()).not.toContain(TITLE);
    expect(sealedPrivateSnapshot()).not.toContain(HIGHLIGHT);
    expect(window.localStorage.getItem("oryzen_saved_passages_v1")).toBeNull();
    expect(await listLocalPdfDocuments()).toEqual([]);

    await unlockTestVault("student-b");
    expect(await listLocalPdfDocuments()).toEqual([]);
    expect(await getLocalPdfBinary(saved.document.id)).toBeNull();
    expect(listSavedPassages(undefined, "student-b")).toEqual([]);
    expect(sealedPdfSnapshot()).not.toContain(TITLE);
    expect(sealedPrivateSnapshot()).not.toContain(HIGHLIGHT);

    await lockAccountVault();
    await unlockTestVault("student-a");
    expect((await listLocalPdfDocuments()).map((book) => book.title)).toContain(TITLE);
    expect((await getLocalPdfBinary(saved.document.id))?.[0]).toBe(37);
    expect(listSavedPassages(undefined, "student-a")[0]?.highlightedText).toBe(HIGHLIGHT);
  });

  it("restores a named student's legacy note and quarantines an unowned one", async () => {
    window.localStorage.setItem(
      "oryzen_saved_passages_v1::student-a",
      JSON.stringify([{ id: "legacy", highlightedText: HIGHLIGHT }])
    );
    window.localStorage.setItem("oryzen_saved_passages_v1", "plain title leak");
    await unlockTestVault("student-b");
    expect(window.localStorage.getItem("oryzen_saved_passages_v1")).toBeNull();
    expect(window.localStorage.getItem("oryzen_saved_passages_v1::student-a")).toBeNull();
    expect(window.localStorage.getItem(LEGACY_QUARANTINE_KEY) ?? "").not.toContain(HIGHLIGHT);
    expect(window.localStorage.getItem(LEGACY_QUARANTINE_KEY) ?? "").not.toContain("plain title leak");
    expect(listSavedPassages(undefined, "student-b")).toEqual([]);
    await unlockTestVault("student-a");
    expect(listSavedPassages(undefined, "student-a")[0]?.highlightedText).toBe(HIGHLIGHT);
    expect(listSavedPassages(undefined, "student-a").some((item) => item.highlightedText === "plain title leak")).toBe(false);
  });

  it("keeps an unowned pre-fix book sealed and hidden from both students", async () => {
    const title = "Legacy Unowned Book ZZ-QUARANTINE-MARKER";
    installMemoryIndexedDb();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("prakriti_reader_local_db_v1", 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("local_pdf_documents")) {
          database.createObjectStore("local_pdf_documents", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("local_pdf_binaries")) {
          database.createObjectStore("local_pdf_binaries", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["local_pdf_documents", "local_pdf_binaries"], "readwrite");
      tx.objectStore("local_pdf_documents").put({
        id: "legacy-doc",
        title,
        fileName: "legacy.pdf",
        fileHash: "abc",
        fileSize: 4,
        pageCount: 1,
        storageBackend: "indexeddb",
        opfsPath: null,
        chapters: [],
        chunks: [],
        lastReadPage: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      tx.objectStore("local_pdf_binaries").put({
        id: "legacy-doc",
        bytes: new Uint8Array([1, 2, 3, 4]),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    await unlockTestVault("student-b");
    expect(await listLocalPdfDocuments()).toEqual([]);
    expect(legacyBookQuarantineSnapshot()).not.toContain(title);
    expect(legacyBookQuarantineSnapshot()).toContain("quarantine-legacy-doc");
    await unlockTestVault("student-a");
    expect((await listLocalPdfDocuments()).map((book) => book.title)).not.toContain(title);
  });

  it("issues a vault key only for the signed-in session", () => {
    expect(authorizedVaultUserId("student-b", "student-a")).toBe("student-b");
    expect(authorizedVaultUserId(null, "student-a")).toBeNull();
    expect(authorizedVaultUserId("  ", "student-a")).toBeNull();
  });

  it("keeps the service role as the only vault secret until a dedicated secret is set", () => {
    expect(vaultKeyMaterials({ serviceRole: "service-role" })).toEqual({
      current: "service-role",
      previous: [],
    });
    expect(
      vaultKeyMaterials({
        dedicated: "dedicated-secret",
        previous: "older-secret",
        serviceRole: "service-role",
      })
    ).toEqual({
      current: "dedicated-secret",
      previous: ["older-secret", "service-role"],
    });
  });

  it("opens notes sealed by a previous key and seals them again with the current key", async () => {
    const oldKey = await deriveAccountVaultKey("old-service", "student-a");
    const nextKey = await deriveAccountVaultKey("next-secret", "student-a");
    await unlockAccountVault(oldKey, "student-a");
    writePrivateString("oryzen_saved_passages_v1", JSON.stringify([{ highlightedText: HIGHLIGHT }]), "student-a");
    await flushAccountVault();
    await lockAccountVault();

    await unlockAccountVault(nextKey, "student-a", [oldKey]);
    expect(readPrivateString("oryzen_saved_passages_v1", "student-a")).toContain(HIGHLIGHT);
    await flushAccountVault();
    await lockAccountVault();

    await unlockAccountVault(nextKey, "student-a");
    expect(readPrivateString("oryzen_saved_passages_v1", "student-a")).toContain(HIGHLIGHT);
    await lockAccountVault();

    await unlockAccountVault(oldKey, "student-a");
    expect(readPrivateString("oryzen_saved_passages_v1", "student-a")).toBeNull();
  });

  it("re-seals a book when the previous vault key is the one that opens it", async () => {
    const oldKey = await deriveAccountVaultKey("old-service", "student-a");
    const nextKey = await deriveAccountVaultKey("next-secret", "student-a");
    await unlockAccountVault(oldKey, "student-a");
    await saveLocalPdfDocument({
      title: TITLE,
      fileName: "circuit.pdf",
      pdfBytes: new Uint8Array([37, 80, 68, 70]),
      pageCount: 1,
    });
    await lockAccountVault();

    await unlockAccountVault(nextKey, "student-a", [oldKey]);
    expect((await listLocalPdfDocuments()).map((book) => book.title)).toContain(TITLE);
    await lockAccountVault();

    await unlockAccountVault(nextKey, "student-a");
    expect((await listLocalPdfDocuments()).map((book) => book.title)).toContain(TITLE);
    await lockAccountVault();

    await unlockAccountVault(oldKey, "student-a");
    expect(await listLocalPdfDocuments()).toEqual([]);
  });

  it("does not place the service role key in the browser client module", () => {
    const client = readFileSync("src/lib/supabase/client.ts", "utf8");
    const route = readFileSync("src/app/api/auth/reader-vault/route.ts", "utf8");
    expect(client).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(client).not.toContain("serviceRoleKey");
    expect(route).not.toMatch(/console\.(log|debug|info|warn|error)/);
  });
});
