export {
  appendCompanionTurn,
  companionStorageKey,
  createCompanionMember,
  memberFromPrefs,
  readCompanionStore,
  sanitizeCompanionPrefs,
  sanitizeCompanionStore,
  switchCompanion,
  upsertCompanionMember,
  writeCompanionPrefs,
  writeCompanionStore,
} from "./persist";
export { COMPANION_MOCK_NOTICE, companionReply, openingCompanionTurn, repliesDifferByStyle } from "./replies";
export {
  CHARACTER_COPY,
  COMPANION_CHARACTERS,
  COMPANION_STORAGE_KEY,
  COMPANION_STYLES,
  DEFAULT_COMPANION_PREFS,
  STARTER_COMPANIONS,
  STYLE_COPY,
  type CompanionCharacter,
  type CompanionMember,
  type CompanionPrefs,
  type CompanionStore,
  type CompanionStyle,
  type CompanionTurn,
} from "./types";
