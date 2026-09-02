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
  existingLinks: [
    {
      name: "pjsk-tier-maker",
      repository: "https://github.com/endoretic/pjsk-tier-maker",
      website: "https://endoretic.cc/pjsk-tier-maker/",
    },
    {
      name: "score-calculator",
      repository: "https://github.com/endoretic/score-calculator",
      website: "https://endoretic.cc/score-calculator/",
    },
  ],
} as const;

export type SiteLanguage = "en" | "zh-CN";
