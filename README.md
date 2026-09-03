# C7 Case Files

A research-file app: build files on people, households or historical
figures, attach evidence to them, and read numerology / astrology patterns
off their dates. It runs as a web app you can install, and one private cloud
account keeps your computer and your phone on the same set of case files.

## How to open it

Go to **https://b00k33.github.io/c7-case-files-app/** in Chrome (or Edge).
Sign in with your email and password, and your cases arrive within a few
seconds. Use "Install app" from the sync drawer (the dot, top right) to give
it its own icon on the phone or the desktop; it then works offline and
updates itself with a tap on the "Update ready" chip.

On a computer, the first visit asks you to pick a data folder (or "Skip the
folder" to keep data in the browser instead). On a phone there is no folder
step at all.

## Where your data lives

- **The cloud** is the master copy: one row per record in your own account,
  synced record by record, with deletes travelling as tombstones so no
  device can silently lose anything.
- **Each device** keeps a full local copy (a SQLite database, in the data
  folder on a computer or in browser storage on a phone), so the app works
  offline and pushes when it is back online.
- **Pictures and files** are stored locally and copied to private cloud
  storage; another device downloads a copy the first time it needs one.
- **Download backup (.db)** in the sync drawer saves the whole database as
  one SQLite file, from any device.

If a device ever shows fewer cases than you know you have, open the sync
drawer and tap **Re-pull everything**.

## The rules this app won't break

- If a birth date is missing its day or month, nothing gets calculated from
  it — you'll see an empty chart explaining what's missing, never a guess.
- Anything pasted, imported or looked up arrives **drafted, at zero
  confidence**, and sits in the Review queue until you decide on it. The
  one deliberate exception is **Insert family**, which you asked to go
  straight in; every fact it writes still carries its citation and an
  accepted claim as the audit trail.
- Every observed count of a pattern — a repeating number, a clash, a trine —
  is shown next to what you'd expect from chance alone.
- Deletes are soft. Nothing disappears outright.

See `SPEC.md` for the full database schema, sync rules and calculation
rules, and `STYLE.md` for the visual design system — both live in this
folder and are the source of truth for how this app is meant to work and
look. `CLAUDE.md` holds the working rules for changing it.

## Running the calculation-module tests

The pure modules (`js/numerology.js`, `js/chinese.js`, `js/western.js`,
`js/relations.js`, `js/stats.js`, `js/profile-parse.js`, `js/tree.js`) have
a dependency-free browser harness at `tests/browser-tests.html`; serve the
folder with any static server and open it. With Node.js installed,
`npm test` runs the same suite.
