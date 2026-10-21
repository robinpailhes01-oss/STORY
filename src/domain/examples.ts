import lumaDocumentJson from "../../docs/staura-architecture-claude-code/examples/luma-document.json";
import { parseStoryDocument, type StoryDocument } from "./story-document";

/** Document d’exemple Luma, lu tel quel depuis docs/ (non modifié). */
export function loadLumaExample(): StoryDocument {
  return parseStoryDocument(lumaDocumentJson);
}
