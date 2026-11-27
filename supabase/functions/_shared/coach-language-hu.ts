import type { CoachLanguagePack } from "./coach-language-pack.ts";

/** Hungarian. Terms are folded: see coach-language-pack.ts. */
export const hungarian: CoachLanguagePack = {
  health: [
    "kolika\\w*", "santit\\w*", "santikal\\w*", "santasag\\w*", "duzzad\\w*", "duzzanat\\w*", "gyullad\\w*",
    "serul\\w*", "gyogyszer\\w*", "adagol\\w*", "lazas\\w*", "homerseklet\\w*", "verzik", "verzes\\w*",
    "verez\\w*", "nem tud felall\\w*", "nem all fel", "nem eszik", "fajdalom", "fajdalm\\w*", "fajlal\\w*",
  ],
  healthWhenDetected: [
    "seb", "sebe", "laz",
  ],
  unsafeOutput: [
    "diagnozis\\w*", "diagnoszt\\w*", "gyogyszert felir\\w*", "garantalt kezeles",
  ],
  unsafeOutputWhenDetected: [
   
  ],
  markers: [
    "az", "es", "nem", "lovam", "lo", "lovat", "hogy", "van", "mit", "kell", "nagyon", "edzes", "ma", "mikor",
    "miert", "tudok", "szeretnek", "egy", "meg", "mar", "lovas",
  ],
  letters: /[őű]/,
  healthReply:
    "Szüneteltesd az edzést, és fordulj az állatorvoshoz, főleg ha a változás hirtelen, erős vagy rosszabbodik. Jegyezd fel, mikor kezdődött, milyen az étvágya és a viselkedése, a hőmérsékletét csak akkor, ha biztonságosan szoktad mérni, és minden látható duzzanatot. Nem tudok diagnózist adni, és nem mondhatom meg, hogy a lovad dolgozhat-e újra.",
  providerReviewReply:
    "Nem tudok diagnózist adni, gyógyszert javasolni, és nem mondhatom meg, hogy egy ló dolgozhat-e. Egészségügyi vagy sántasági gondnál szüneteltesd az edzést, és fordulj az állatorvoshoz. Az edzéshez segíthetek tárgyilagos megfigyeléseket és kérdéseket összeállítani az edződnek.",
};
