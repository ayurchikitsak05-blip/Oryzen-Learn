import { describe, expect, it } from "vitest";
import { cardFromFields, cleanField, deckNameFrom, parseAnkiText } from "../anki";

describe("Anki import (no AI)", () => {
  it("reads Anki's plain-text export with headers", () => {
    const deck = parseAnkiText(
      "#separator:tab\n#html:true\n#deck:Physics::Mechanics\nInertia\tResists a change in <b>motion</b>\nMomentum\tMass × velocity\nInertia\tResists a change in <b>motion</b>\n\tno front\n",
      "physics.txt"
    );
    expect(deck.name).toBe("Physics::Mechanics");
    expect(deck.cards).toEqual([
      { title: "Inertia", body: "Resists a change in motion" },
      { title: "Momentum", body: "Mass × velocity" },
    ]);
    expect(deck.skipped).toBe(2);
  });

  it("guesses commas or semicolons and honours quotes", () => {
    expect(parseAnkiText('"Ohm\'s law, V=IR",Voltage equals current times resistance', "x.csv").cards[0].title).toBe("Ohm's law, V=IR");
    expect(parseAnkiText("A;B\nC;D").cards).toHaveLength(2);
  });

  it("keeps cloze markers so the card becomes fill-the-gap", () => {
    expect(cardFromFields(["The SI unit of force is {{c1::newton}}.", ""])).toEqual({
      title: "The SI unit of force is ….",
      body: "The SI unit of force is {{c1::newton}}.",
    });
  });

  it("cleans Anki HTML and media references", () => {
    expect(cleanField('Line one<br>Line two [sound:a.mp3]<img src="x.png">&amp; more')).toBe("Line one\nLine two & more");
  });

  it("names the deck from the collection", () => {
    expect(deckNameFrom(JSON.stringify({ 1: { name: "Default" }, 2: { name: "NEET::Biology" } }), "file")).toBe("Biology");
    expect(deckNameFrom("bad", "file")).toBe("file");
  });
});

describe("Anki .apkg packages", () => {
  const wasm = require.resolve("sql.js/dist/sql-wasm.wasm");

  async function apkg(name: string, build: (db: import("sql.js").Database) => void): Promise<Uint8Array> {
    const initSqlJs = (await import("sql.js")).default;
    const SQL = await initSqlJs({ locateFile: () => wasm });
    const db = new SQL.Database();
    db.run("CREATE TABLE col (decks TEXT); CREATE TABLE notes (flds TEXT);");
    build(db);
    const { zipSync } = await import("fflate");
    return zipSync({ [name]: db.export(), media: new TextEncoder().encode("{}") });
  }

  it("reads notes and the deck name", async () => {
    const { parseApkg } = await import("../anki");
    const bytes = await apkg("collection.anki2", (db) => {
      db.run("INSERT INTO col VALUES (?)", [JSON.stringify({ 1: { name: "Default" }, 2: { name: "Pharmacology" } })]);
      db.run("INSERT INTO notes VALUES (?)", ["Aspirin\u001fCOX inhibitor"]);
      db.run("INSERT INTO notes VALUES (?)", ["{{c1::Atropine}} blocks muscarinic receptors\u001f"]);
    });
    const deck = await parseApkg(bytes, "pharm.apkg", wasm);
    expect(deck.name).toBe("Pharmacology");
    expect(deck.cards).toHaveLength(2);
    expect(deck.cards[1].body).toContain("{{c1::Atropine}}");
  });

  it("explains how to export the newest Anki format", async () => {
    const { parseApkg, NewAnkiFormatError } = await import("../anki");
    const { zipSync } = await import("fflate");
    await expect(parseApkg(zipSync({ "collection.anki21b": new Uint8Array([1, 2]) }), "x.apkg", wasm)).rejects.toBeInstanceOf(NewAnkiFormatError);
  });
});
