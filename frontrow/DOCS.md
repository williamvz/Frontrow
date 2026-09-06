# Frontrow

Reclamevrije live voetbalscores voor het Nederlandse voetbal.

## Configuratie

| Optie | Wat het doet |
|---|---|
| `favourite_team` | De club waar de app op wordt afgestemd. **De kleuren van Frontrow volgen deze club.** Gebruik het id: `ajax`, `psv`, `feyenoord`, `az`, `twente`, `utrecht`, `go_ahead_eagles`, `nec`, `heerenveen`, `groningen`, `sparta`, `pec_zwolle`, `fortuna_sittard`, `telstar`, `excelsior`, `ado_den_haag`, `cambuur`, `willem_ii`, `nederland`, en alle KKD-clubs. Je kunt dit later ook in de app zelf wijzigen. |
| `competitions` | Welke competities worden bijgehouden. Standaard `eredivisie`, `kkd`, `knvb_beker`, `johan_cruijff_schaal`, `oranje`. Extra beschikbaar: `ucl`, `uel`, `uecl`, `eredivisie_vrouwen`. |
| `language` | `nl` of `en`. |
| `goal_notifications` | Pushmelding zodra een club die je volgt scoort. |
| `ha_notify_service` | Optioneel, bijvoorbeeld `notify.mobile_app_pixel`. Hier gaan eindstanden naartoe. |
| `vapid_contact` | Optioneel, bijvoorbeeld `mailto:jij@voorbeeld.nl`. **Nodig voor pushmeldingen op iPhone** — Apple weigert een melding waarvan het contactadres naar localhost wijst. |
| `demo_mode` | Speelt een verzonnen speelronde af in twaalf minuten, op een aparte database. |
| `log_level` | `trace`, `debug`, `info`, `warning` of `error`. |

## Twee ingangen

Frontrow is op twee manieren bereikbaar, en dat is met opzet:

**De zijbalk (ingress).** Klik op Frontrow in het Home Assistant-menu. Home
Assistant weet wie je bent, dus je hoeft niet in te loggen. `panel_admin` staat
uit, dus ook huisgenoten zonder beheerdersrechten kunnen erbij.

**De poort (`http://<ip-van-je-pi>:8199`).** Voor de telefoons in huis. Dit is de
link die je op je beginscherm zet — **niet** de zijbalk-link: die sessie is een
kwartier geldig en verloopt zodra je Home Assistant-tabblad weg is.

> Frontrow vertrouwt de "wie ben jij"-headers van Home Assistant alleen als het
> verzoek écht van de Supervisor komt. Op de open poort zijn die headers immers
> door iedereen op je netwerk te verzinnen.

## Meldingen

Webpush werkt alleen in een beveiligde context. Concreet:

| Ingang | Meldingen |
|---|---|
| Nabu Casa (`https://….ui.nabu.casa`) | ✅ |
| Eigen certificaat (DuckDNS-app, reverse proxy) | ✅ |
| Home Assistant-zijbalk over https | ✅ maar niet installeerbaar als app |
| `http://<ip>:8199` | ❌ — de browser staat het niet toe |

De app verbergt de knop in plaats van te doen alsof het werkt, en legt uit
waarom. Op een iPhone moet Frontrow eerst op het beginscherm staan (iOS 16.4+),
en moet `vapid_contact` een echt mailadres zijn.

## Watchdog

Zet de **Watchdog**-schakelaar op de add-onpagina aan. De controle raakt echt de
database aan, dus een proces dat nog wel luistert maar zijn eigen database niet
meer kan lezen wordt herstart in plaats van "gezond" genoemd.

## Back-ups

De database staat in `/data` en gaat mee in de normale Home Assistant-back-up.
Vóór elke back-up schrijft Frontrow eerst een consistente momentopname
(`VACUUM INTO`), en de live bestanden worden uitgesloten — een back-up van een
open WAL-database kan namelijk stuk zijn.

## Als er geen scores binnenkomen

1. Kijk in het logboek. `ESPN 403` betekent dat de bron het verzoek weigert;
   Frontrow probeert dan automatisch de tweede host en daarna TheSportsDB.
2. **Beheer → Nu bijwerken** in de app forceert een ronde.
3. Zet `log_level: debug` voor per-competitie regels.
4. Werkt de app zelf? `http://<ip>:8199/api/health` hoort
   `{"ok":true,...}` terug te geven, inclusief het aantal competities — dat
   bewijst dat de database gelezen kan worden.

## Privacy

Frontrow praat met precies twee servers, en dat doet de Pi — niet je telefoon:
`site.web.api.espn.com` en `www.thesportsdb.com`. Clublogo's worden één keer
opgehaald en daarna vanaf je eigen Pi geserveerd. Er zit geen analytics in, geen
lettertype van een CDN, geen cookiemelding en geen account.
