export const SITE = {
  name: "endoretic",
  url: "https://endoretic.cc",
  description:
    "A personal archive of research, tools, notes, and unfinished systems.",
  defaultLang: "en",
  baiduVerification: "codeva-WmiTaeupx3",
  /*
   * `key` names the catalog entry for the label, so the rendered English and
   * the translated string can never drift apart. The index numerals are not
   * translated: they are register marks, the same in every language layer.
   */
  navigation: [
    { href: "/", label: "Home", key: "nav.home", index: "00" },
    { href: "/works/", label: "Works", key: "nav.works", index: "01" },
    { href: "/notes/", label: "Notes", key: "nav.notes", index: "02" },
    { href: "/about/", label: "About", key: "nav.about", index: "03" },
    { href: "/credits/", label: "Credits", key: "nav.credits", index: "04" },
  ],
} as const;

export type SiteLanguage = "en" | "zh-CN";
