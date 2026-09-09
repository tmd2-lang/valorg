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
| `index.html` | Page structure — header, list view, detail view, add/edit dialog |
| `styles.css` | All styling. Colors and spacing live in the `:root` variables at the top |
| `app.js` | State, localStorage persistence, routing, and rendering |

## How it works

Four ideas, and they're worth internalizing because every UI framework is
a fancier version of the same loop:

1. **State** — `projects` is an array of objects. Single source of truth.
2. **Storage** — that array is JSON'd into `localStorage` on every change.
3. **Router** — the URL hash decides which view is on screen.
4. **Render** — `render()` redraws the screen from the array.

The rule that keeps it from turning to spaghetti: **never poke the DOM to
change data.** Change the array → `save()` → `render()`. Always that order.

## Routes

| URL | View |
|---|---|
| `#/` | All projects |
| `#/p/<id>` | One project and its tasks |

The hash is real navigation: deep links work, and so does the browser's
back button.

## Data shape

```js
{
  id: "uuid",
  name: "Valorg, Inc.",
  note: "One line so future-you remembers.",
  status: "idea" | "active" | "paused" | "done",
  createdAt: 1757433600000,
  tasks: [
    { id: "uuid", title: "Order fabric samples", done: false, createdAt: 1757433600000 }
  ]
}
```

When you add a field later, handle its absence in `load()` the way `tasks`
is handled — data already saved in the browser won't have it.

Data lives in your browser's localStorage — it's per-browser and per-device.
Moving to a real shared database is the natural next step.

## Deploy to Vercel

```
vercel
```

Static site, zero config. Or connect the GitHub repo at
[vercel.com/new](https://vercel.com/new) and it deploys on every push.

## Next up

- [x] Click a project to open a detail view
- [x] Tasks nested inside each project
- [ ] Search and filter by status
- [ ] Due dates on tasks
- [ ] Reorder projects by hand
- [ ] Real database so it syncs across devices
