import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DOSHA_STUDY_PRESETS } from "@/lib/prakriti/config";
import { suggestionForCanonical } from "../suggest";
import {
  CSS_TOKEN_NAMES,
  REQUIRED_CONTRAST_PAIRS,
  THEME_DEFINITIONS,
  contrastRatio,
  pairMinimum,
} from "../themes";
import { LOCKED_PDF_PARCHMENT, LOGO_CHIP_HEX } from "../types";

describe("R0 study rhythm tokens", () => {
  it("keeps Classic Soft Beige as the existing hex set", () => {
    const classic = THEME_DEFINITIONS.find((theme) => theme.id === "classic");
    expect(classic?.tokens.bg).toBe("#FAF8F5");
    expect(classic?.tokens.heading).toBe("#20242B");
    expect(classic?.tokens.accent).toBe("#766454");
    expect(classic?.tokens.card).toBe(LOGO_CHIP_HEX);
  });

  it("meets WCAG 2.2 AA for required text pairs on every theme", () => {
    for (const theme of THEME_DEFINITIONS) {
      for (const pair of REQUIRED_CONTRAST_PAIRS) {
        const ratio = contrastRatio(theme.tokens[pair.foreground], theme.tokens[pair.background]);
        const minimum = pairMinimum(theme.id, pair);
        expect(ratio, `${theme.id} ${pair.id}`).toBeGreaterThanOrEqual(minimum - 0.01);
      }
    }
  });

  it("locks PDF parchment hexes on DOSHA_STUDY_PRESETS and PdfViewer DEFAULT_THEME", () => {
    expect(DOSHA_STUDY_PRESETS.Vata.theme.backgroundHex).toBe(
      LOCKED_PDF_PARCHMENT.vata.backgroundHex
    );
    expect(DOSHA_STUDY_PRESETS.Pitta.theme.backgroundHex).toBe(
      LOCKED_PDF_PARCHMENT.pitta.backgroundHex
    );
    expect(DOSHA_STUDY_PRESETS.Kapha.theme.backgroundHex).toBe(
      LOCKED_PDF_PARCHMENT.kapha.backgroundHex
    );
    expect(DOSHA_STUDY_PRESETS.Vata.theme.textPrimaryHex).toBe(
      LOCKED_PDF_PARCHMENT.vata.textPrimaryHex
    );

    const viewer = readFileSync(
      join(process.cwd(), "src/components/reader/PdfViewer.tsx"),
      "utf8"
    );
    expect(viewer).toMatch(/const DEFAULT_THEME[\s\S]*backgroundHex: "#FBF5E8"/);
    expect(viewer).toContain("#FBF5E8");
    expect(viewer).not.toContain("pdfPaperOptIn");
  });

  it("keeps globals.css token blocks aligned with the named recipes", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const theme of THEME_DEFINITIONS) {
      const selector =
        theme.id === "classic"
          ? /:root,?\s*html\[data-theme="classic"\]|:root/
          : new RegExp(`html\\[data-theme="${theme.id}"\\]`);
      expect(css, theme.id).toMatch(selector);
      for (const token of CSS_TOKEN_NAMES) {
        expect(css.toLowerCase()).toContain(theme.tokens[token.key].toLowerCase());
      }
    }
    expect(css).toContain("prefers-reduced-motion");
  });

  it("suggests a theme from Prakriti without locking it", () => {
    expect(suggestionForCanonical("Vata").themeId).toBe("warm-grounded");
    expect(suggestionForCanonical("Pitta").themeId).toBe("cool-clear");
    expect(suggestionForCanonical("Kapha").themeId).toBe("fresh-energizing");
    expect(suggestionForCanonical("Vata-Pitta").themeId).toBe("grounded-clarity");
    expect(suggestionForCanonical("Pitta-Kapha").themeId).toBe("clear-energy");
    expect(suggestionForCanonical("Vata-Kapha").themeId).toBe("warm-lift");
    expect(suggestionForCanonical(null).themeId).toBe("classic");
  });
});
