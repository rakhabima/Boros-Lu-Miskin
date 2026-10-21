// Pure onboarding helpers. No DB, no Next imports, so `node --test` loads it directly.

export type SheetsReturn = "/connect" | "/devices";

/** Where the Sheets OAuth callback may send the user. Anything else → /devices. */
export const safeSheetsReturn = (value: unknown): SheetsReturn =>
  value === "/connect" ? "/connect" : "/devices";

/**
 * The return path rides inside the OAuth `state` ("<random>~connect"), which
 * the signed cookie already authenticates. Read it back only after
 * verifyState() passed.
 */
export const stateWithReturn = (state: string, ret: SheetsReturn): string =>
  ret === "/connect" ? `${state}~connect` : state;

export const returnFromState = (state: string | null): SheetsReturn =>
  state?.endsWith("~connect") ? "/connect" : "/devices";

export const isIphone = (userAgent: string | null | undefined): boolean =>
  /iPhone/i.test(userAgent ?? "");

/** Absolute /connect URL for the QR code: APP_BASE_URL, else the request origin. */
export const connectUrl = (appBaseUrl: string, requestOrigin: string): string =>
  `${(appBaseUrl || requestOrigin).replace(/\/+$/, "")}/connect`;

/** The flag must be exactly "true", and there must be a Shortcut to install. */
export const gateEnabledFrom = (flag: string | undefined, shortcutInstallUrl: string): boolean =>
  flag === "true" && !!shortcutInstallUrl;

export const gateApplies = (gateEnabled: boolean, completedAt: unknown): boolean =>
  gateEnabled && !completedAt;
