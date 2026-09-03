export const SITE = {
  name: "endoretic",
  url: "https://endoretic.cc",
  description:
    "A personal archive of research, tools, notes, and unfinished systems.",
  defaultLang: "en",
  baiduVerification: "codeva-WmiTaeupx3",
  navigation: [
    { href: "/", label: "Home", index: "00" },
    { href: "/works/", label: "Works", index: "01" },
    { href: "/notes/", label: "Notes", index: "02" },
    { href: "/about/", label: "About", index: "03" },
    { href: "/credits/", label: "Credits", index: "04" },
  ],
} as const;

export type SiteLanguage = "en" | "zh-CN";
