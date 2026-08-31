# C7 Case Files

A local research-file app: build files on people, households or historical
figures, attach evidence to them, and read numerology / astrology patterns
off their dates. Everything lives in this one folder. No account, no cloud,
no internet connection needed.

## How to open it

**You need Python 3 installed once** (it's what serves the app to your
browser — a plain double-click on `index.html` can't work, see *Why it has
to be served* below).

- **macOS:** double-click `start.command`. Python 3 already ships with
  macOS. If macOS blocks it the first time (unidentified developer), right-
  click it → Open, once.
- **Windows:** double-click `start.bat`. If you don't have Python yet,
  install it from [python.org](https://python.org) (tick "Add python.exe to
  PATH" during install), then double-click again.

Either way, your browser opens to `http://localhost:8777` and the app
starts. Use a recent **Chrome or Edge** — this app needs a browser feature
(the File System Access API) that Safari and Firefox don't support yet.

The **first time**, the app will ask you to pick this folder (the one
`start.command` / `start.bat` is in) so it can read and write your database.
Your browser remembers that choice next time.

## Where your data lives

- `data/c7.db` — the entire database: every case, person, relationship,
  event, evidence record and claim. One file.
- `data/assets/` — the actual screenshots, photos, documents and clips you
  attach. The database stores their path, size and checksum; the bytes live
  here.
- `data/backups/` — an automatic timestamped copy of `c7.db`, made right
  before every save. The last 30 are kept.

To back up everything, copy the whole `data/` folder. To move the app to a
new computer, copy the whole `c7-case-files` folder.

## Why it has to be served, not just double-clicked

A folder of files opened straight from disk (`file://…/index.html`) can't
load the parts this app is built from — ES modules, the WebAssembly SQLite
engine, or the File System Access API it uses to save your database back to
this folder. All three need a real `http://` origin, even a local one. The
launcher scripts start that local server for you; nothing leaves your
computer.

## What's seeded

The first time you open the app, it creates one example case — the
**Harrow Household** — with fictional people, evidence in several states of
verification, one open question, a drafted claim waiting in Review, and a
finding with its observed-vs-expected count already worked out. It's there
so you can see every part of the app working before you start your own
case. Delete it from the Dashboard whenever you're ready.

## The rules this app won't break

- If a birth date is missing its day or month, nothing gets calculated from
  it — you'll see an empty chart explaining what's missing, never a guess.
- Anything pasted or imported (via the Import page) arrives **drafted, at
  zero confidence**, and sits in the Review queue until you decide on it.
  Drafted facts never move a confidence bar on their own.
- Every observed count of a pattern — a repeating number, a clash, a trine —
  is shown next to what you'd expect from chance alone.
- Deletes are soft. Nothing disappears outright; it's recoverable for 30
  days via `deleted_at`.

See `SPEC.md` for the full database schema and calculation rules, and
`STYLE.md` for the visual design system — both live in this folder and are
the source of truth for how this app is meant to work and look.

## Running the calculation-module tests

The pure calculation modules (`js/numerology.js`, `js/chinese.js`,
`js/western.js`, `js/relations.js`, `js/stats.js`) have a test suite in
`tests/`. If you have Node.js installed:

```bash
npm test
```

(No packages are installed for this — `npm test` just runs Node's built-in
test runner. The app itself never needs npm.)
