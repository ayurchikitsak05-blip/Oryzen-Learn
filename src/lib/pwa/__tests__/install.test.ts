import { describe, expect, it } from "vitest";
import { installMode, isIosSafari } from "../install";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const CHROME_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

describe("install as an app", () => {
  it("spots iPhone and iPad Safari, not other iOS browsers or Macs", () => {
    expect(isIosSafari(IPHONE)).toBe(true);
    expect(isIosSafari(IPAD_DESKTOP, 5)).toBe(true);
    expect(isIosSafari(IPAD_DESKTOP, 0)).toBe(false);
    expect(isIosSafari(CHROME_IOS)).toBe(false);
  });

  it("chooses what to show", () => {
    expect(installMode({ standalone: true, hasPrompt: true, userAgent: ANDROID })).toBe("installed");
    expect(installMode({ standalone: false, hasPrompt: true, userAgent: ANDROID })).toBe("prompt");
    expect(installMode({ standalone: false, hasPrompt: false, userAgent: IPHONE })).toBe("ios");
    expect(installMode({ standalone: false, hasPrompt: false, userAgent: ANDROID })).toBe("none");
  });
});
