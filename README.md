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
| `index.html` | Page structure — sign-in, list view, detail view, add/edit dialog |
| `styles.css` | All styling. Colors and spacing live in the `:root` variables at the top |
| `app.js` | State, database calls, routing, and rendering |
| `config.js` | Supabase project URL and public key |
| `supabase-setup.sql` | Run once in Supabase to create the table |
| `supabase-add-goal.sql` | Migration: adds the goal column to an existing table |
| `supabase-add-ideas.sql` | Migration: creates the ideas table |

## How it works

Four ideas, and they're worth internalizing because every UI framework is
a fancier version of the same loop:

1. **State** — `projects` is an array of objects. Single source of truth.
2. **Storage** — a Postgres table on Supabase, reached straight from the page.
3. **Router** — the URL hash decides which view is on screen.
4. **Render** — `render()` redraws the screen from the array.

The rule that keeps it from turning to spaghetti: **never poke the DOM to
change data.** Change the array → `save()` → `render()`. Always that order.

## Routes

| URL | View |
|---|---|
| `#/` | Home — everything open, and the goals |
| `#/projects` | All projects |
| `#/ideas` | The idea box |
| `#/p/<id>` | One project and its tasks |

The hash is real navigation: deep links work, and so does the browser's
back button.

## Data shape

```js
{
  id: "uuid",
  name: "Valorg, Inc.",
  goal: "Make this a $10M ARR company.",
  note: "One line so future-you remembers.",
  status: "idea" | "active" | "paused" | "done",
  createdAt: 1757433600000,
  tasks: [
    {
      id: "uuid",
      title: "Order fabric samples",
      done: false,
      createdAt: 1757433600000,
      completedAt: null,          // when it was last ticked off
      due: "2026-09-14",          // a calendar day, or null
      notes: "",
      events: [                   // the full history, appended to
        { type: "created",   at: 1757433600000 },
        { type: "completed", at: 1757440000000 },
        { type: "reopened",  at: 1757450000000 }
      ]
    }
  ]
}
```

When you add a field later, handle its absence in `load()` the way `tasks`
is handled — data already saved in the browser won't have it.

Data lives in a Supabase table, so it follows your account rather than your
browser. Sign in on another machine and it's all there.

Because the data is on another computer now, saving takes time. The pattern
used everywhere: change the array, redraw immediately, then tell the server.
If a save fails, the app says so and pulls the real data back down — the
screen never keeps showing a change that didn't save.

## Setup

1. In Supabase: **SQL Editor → New query**, paste `supabase-setup.sql`, Run.
2. In Supabase: **Authentication → URL Configuration**, add your site URLs to
   *Redirect URLs* (`http://localhost:4321` for local, plus your Vercel URL).
3. Open the site, enter your email, click the link it sends you.

### Why the key in `config.js` is safe

The `anon` key identifies the project; it is not a password, and it is meant
to ship in the page. What protects the data is the row-security rule in
`supabase-setup.sql`: every query is silently filtered to rows whose `user_id`
matches whoever is signed in. Without that rule the table would be wide open —
it is the load-bearing part of this setup.

The key that must never appear here is `service_role`, which ignores those
rules entirely.

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
- [x] Due dates on tasks
- [x] Home: what's open across every project, and the goals
- [x] Idea box
- [ ] A note captured at the moment you tick something off
- [ ] "This week" summary on the dashboard
- [ ] Reorder projects by hand
- [ ] Real database so it syncs across devices
