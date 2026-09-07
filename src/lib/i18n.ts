/*
 * Two interface catalogs: English, and an easter egg.
 *
 * `en` is the site's interface language. `x-hymmnos` is a BCP 47 private-use
 * tag for Hymmnos, the constructed language of emotion created by Akira
 * Tsuchiya for the Ar tonelico series. Hymmnos has no registered subtag, and
 * BCP 47 reserves `x-...` for exactly this: a private agreement inside one
 * system.
 *
 * This is the *interface* language and nothing else. Content language is a
 * separate axis with its own tag — `SiteLanguage` in `src/data/site.ts` and the
 * per-entry `lang` in the content schema — which is how a Chinese note can sit
 * inside an English interface. Adding a third catalog here would not be what
 * makes that work, and removing one did not break it.
 *
 * The Hymmnos entries are stored as Latin transcription, never as invented
 * private-use codepoints. Hymmnos is written left to right in twenty-six
 * letters with upper and lower case, so a Hymmnos font is a mapping from Latin
 * letters to Hymmnos glyphs. That splits cleanly into two independent axes:
 *
 *   language layer   which catalog supplies the string
 *   script layer     which font draws it
 *
 * Keeping them apart means the text stays searchable, selectable, copyable,
 * diffable, and readable to a screen reader while still being drawn in tower
 * glyphs. See docs/HYMMNOS_LAYER.md.
 *
 * Delivery is deliberately client-side. Hymmnos is a discovery, not a
 * publication target: the pages ship in English, and nothing about the layer —
 * catalog and font — is fetched until a reader finds the switch; the controller
 * script loads with the page.
 * Accessible names, alt text, `<title>`, and metadata are therefore never
 * translated. That is a rule, not an omission: the layer is a visual register,
 * and navigation must stay operable for assistive technology and for search.
 */

import en from "../locales/en.json";
import hymmnos from "../locales/hymmnos.json";
import hymmnosContent from "../locales/hymmnos-content.json";

/* `en` is an ordinary language tag; `x-hymmnos` is private-use. */
export type LocaleId = "en" | "x-hymmnos";
export type MessageKey = keyof typeof en;

export const DEFAULT_LOCALE: LocaleId = "en";

/*
 * The one locale the hidden switch offers, and the only alternative to English
 * that exists. The switch is a narrative object rather than a settings menu.
 */
export const LAYER_LOCALE: LocaleId = "x-hymmnos";

export const CATALOGS: Readonly<Record<LocaleId, Record<string, string>>> =
  Object.freeze({
    en,
    "x-hymmnos": hymmnos,
  });

/*
 * Content strings, as opposed to interface strings.
 *
 * A project summary's English lives in its frontmatter, which is the single
 * place it should ever be written. So this catalog stores only the Hymmnos and
 * is matched to the entry by id; nothing here duplicates the English, and the
 * two can never drift into disagreeing about it.
 *
 * A missing entry is not an error. Untranslated content simply stays in
 * English inside the layer, which is the honest result for a record nobody has
 * carried across yet, and it keeps adding a project from being gated on
 * finding attested vocabulary for it.
 */
const { "//": CONTENT_NOTICE, ...CONTENT } = hymmnosContent;

export const CONTENT_CATALOG: Readonly<Record<string, string>> =
  Object.freeze(CONTENT);

/* Kept so the provenance note travels with the data rather than being dropped. */
export const CONTENT_CATALOG_NOTICE: readonly string[] = CONTENT_NOTICE;

/* Content keys live in the same fetched payload, so they must not collide. */
export const CONTENT_ATTRIBUTE = "data-i18n-content";

/** The catalog key for one project's summary. */
export function projectSummaryKey(id: string): string {
  return `project.${id}.summary`;
}

/**
 * Marks a content element as translatable, the way `key` does for interface
 * strings. Returns nothing at all when the string has no Hymmnos entry, so an
 * untranslated record is left in English instead of being marked and skipped.
 */
export function contentKey(
  contentId: string,
): Record<string, string> {
  return contentId in CONTENT_CATALOG
    ? { [CONTENT_ATTRIBUTE]: contentId }
    : {};
}

/* URL and markup contract, shared with the client script. */
export const LOCALE_PARAM = "layer";
export const KEY_ATTRIBUTE = "data-i18n";

/**
 * The build-time string for a key. Pages render the default locale; the layer
 * is applied afterwards in the browser.
 */
export function t(key: MessageKey, locale: LocaleId = DEFAULT_LOCALE): string {
  const message = CATALOGS[locale][key];

  if (message === undefined) {
    throw new Error(`Missing ${locale} message for key "${key}".`);
  }

  return message;
}

/**
 * Marks an element as translatable, to be spread onto the tag that owns the
 * text: `<h1 {...key("about.title")}>{t("about.title")}</h1>`.
 *
 * Passing the key twice looks redundant, but it keeps the rendered English and
 * the catalog entry provably the same string — a wrapper component that emitted
 * both would have to introduce a span around every label, and the extra element
 * would land inside links, headings, and definition terms where it changes
 * layout and selection behaviour.
 *
 * The element must contain that message and nothing else: the script replaces
 * its text content wholesale.
 */
export function key(messageKey: MessageKey): { "data-i18n": MessageKey } {
  /* Fails the build rather than shipping an untranslatable marker. */
  t(messageKey);

  return { [KEY_ATTRIBUTE]: messageKey } as { "data-i18n": MessageKey };
}

/**
 * Every message key, in catalog order. Used by the JSON endpoint and by tests.
 */
export function messageKeys(): MessageKey[] {
  return Object.keys(en) as MessageKey[];
}
