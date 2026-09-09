# VALORG

A personal database for projects, companies, and everything else in flight.
Plain HTML/CSS/JavaScript — no build step, no framework, no dependencies.

## Run it locally

Open `index.html` in a browser. That's it.

Or serve it properly (needed later if you add modules or fetch data):

```
npx serve .
```

## Files

| File | What's in it |
|---|---|
| `index.html` | Page structure — header, empty state, grid, add/edit dialog |
| `styles.css` | All styling. Colors and spacing live in the `:root` variables at the top |
| `app.js` | State, localStorage persistence, and rendering |

## How it works

Three ideas, and they're worth internalizing because every UI framework is
a fancier version of the same loop:

1. **State** — `projects` is an array of objects. Single source of truth.
2. **Storage** — that array is JSON'd into `localStorage` on every change.
3. **Render** — `render()` redraws the grid from the array.

The rule that keeps it from turning to spaghetti: **never poke the DOM to
change data.** Change the array → `save()` → `render()`. Always that order.

## Data shape

```js
{
  id: "uuid",
  name: "Valorg, Inc.",
  note: "One line so future-you remembers.",
  status: "idea" | "active" | "paused" | "done",
  createdAt: 1757433600000
}
```

Data lives in your browser's localStorage — it's per-browser and per-device.
Moving to a real shared database is the natural next step.

## Deploy to Vercel

```
vercel
```

Static site, zero config. Or connect the GitHub repo at
[vercel.com/new](https://vercel.com/new) and it deploys on every push.

## Next up

- [ ] Click a project to open a detail view
- [ ] Tasks nested inside each project
- [ ] Search and filter by status
- [ ] Real database so it syncs across devices
