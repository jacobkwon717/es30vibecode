# Postcard MVP

**Research question:** After returning from a trip, will travelers voluntarily rank the places they visited, the way Beli users rank restaurants?

This is a single-page mobile web app that tests that question. It does one job: turn a trip someone just took into a ranked list they can send to friends.

## What a participant does

1. Enter the city they visited (plus an optional date and their first name).
2. Add each place: name, type (food & drink, sight, museum, activity, nightlife), and an optional tip for a friend.
3. Sort it into **Loved it / It was fine / Wouldn't go back**.
4. Answer head-to-head prompts ("Which did you like more?"), just like Beli. A binary search places each new item in about log₂(n) questions.
5. Get a **postcard**: every place with a 1–10 score (Loved = 7–10, Fine = 4–6.9, Wouldn't go back = 1–3.9).
6. Share it as a link. Friends who open it see the ranking, tap **Open in Maps**, or **☆ Save for my trip**.

There is also a hard-coded example (Maya's Lisbon postcard) at `#/example`, so people can see what they'll get before they start.

## What's faked or left out (on purpose)

- **No accounts or backend.** Trips live in the browser's localStorage, and the share link carries the entire trip inside the URL. That means no database and no login.
- **No place autocomplete.** Names are free text, and "Open in Maps" runs a Google Maps search for `name, city`.
- **No recommendations, leaderboards, streaks, lodging, history content, or scam alerts.** These are out of scope for the research question (see the scoping write-up).

## Measuring the test: Google Sheets logging

Each meaningful action sends one row to a Google Sheet:

| event | meaning |
|---|---|
| `app_open` | landing page loaded |
| `trip_started` | participant entered a city |
| `place_added` | one place ranked (detail: tier, type, # comparisons) |
| `ranking_finished` | participant tapped "I'm done" (numPlaces, seconds since start) |
| `list_shared` | share sheet completed or link copied |
| `friend_opened` | someone *other than the owner* opened a shared link |
| `friend_map_click` / `friend_saved` | friend engaged with a specific place |
| `friend_started_own` | friend tapped "Make my postcard" (viral-loop signal) |
| `example_viewed`, `place_removed`, `trip_deleted` | supporting context |

**Setup (about 5 min):**
1. Create a Google Sheet, then go to **Extensions → Apps Script** and paste in [`google-sheets/Code.gs`](google-sheets/Code.gs).
2. Run the `setup` function once. It creates an **Events** tab and a **Summary** tab that computes the success metrics live (% who ranked 5+ places, median time, % who shared, friend opens/saves).
3. **Deploy → New deployment → Web app**, Execute as *Me*, Access *Anyone*. Copy the `/exec` URL.
4. Paste it into `CONFIG.LOG_URL` near the top of the `<script>` in `index.html`.

If `LOG_URL` is empty, the app still works and prints events to the browser console.

## Putting it online (free)

**GitHub Pages:** repo **Settings → Pages → Deploy from a branch**, then select this branch and `/ (root)`. After a minute the app is live at `https://<user>.github.io/<repo>/`.

(Netlify Drop also works: drag the folder onto app.netlify.com/drop.)

## Running the test

- Send each recruit a personal link with a tag, e.g. `https://…/es30vibecode/?r=alex`. The tag appears in the `ref` column, so you know who did what without collecting names.
- One message plus at most one reminder, per the plan.
- Success thresholds (set before launch): **≥50%** of people who start rank **5+ places**, and **≥10%** share their postcard with a friend.

## Local preview

```
python3 -m http.server 8000   # then open http://localhost:8000
```
