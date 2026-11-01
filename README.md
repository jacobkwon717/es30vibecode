# Postcard MVP

**Research question:** After returning from a trip, will travelers voluntarily rank the places they visited, the way Beli users rank restaurants?

This is a single-page mobile web app that tests that question. It does one job: turn a trip someone just took into a ranked list they can send to friends.

## What a participant does

1. Create an account (first name, email, password). This is required before ranking; the example postcard and friends' links stay open to everyone.
2. Enter the city they visited. Suggestions appear as they type (plus an optional date).
3. Add each place: name, type (food & drink, sight, museum, activity, nightlife), an optional tip for a friend, and optional **photos or video**.
4. Sort it into **Loved it / It was fine / Wouldn't go back**.
5. Answer head-to-head prompts ("Which did you like more?"), just like Beli. A binary search places each new item in about log₂(n) questions.
6. Get a **postcard**: every place with a 1–10 score (Loved = 7–10, Fine = 4–6.9, Wouldn't go back = 1–3.9).
7. See the city **pinned on their travel map** alongside every other postcard they've made. The map also lives on the home screen, and tapping a pin opens that postcard.
8. Share it as a link. Friends who open it see the ranking, tap **Open in Maps**, or **☆ Save for my trip**.

There is also a hard-coded example (Maya's Lisbon postcard) at `#/example`, so people can see what they'll get before they start.

## What's faked or left out (on purpose)

- **Accounts are faked.** Sign-up and log-in work, but accounts are stored only in that phone's browser (the password is hashed, but there's no server). Logging in on a different device won't find your postcards.
- **Photos and videos stay on the device.** They're saved in the browser (IndexedDB). Photos are shrunk to 1600px, and videos must be under 100 MB. Friends who open a shared link see rankings and tips, but not media.
- **No backend.** The share link carries the entire trip (minus media) inside the URL.
- **City search uses [Photon](https://photon.komoot.io)**, a free OpenStreetMap geocoder with no API key. If someone types a city without picking a suggestion, the app looks it up once. If the service is down, the trip still works and gets pinned later.
- **The map uses [Leaflet](https://leafletjs.com)** (bundled in `vendor/leaflet/`) with free CARTO map tiles.
- **No autocomplete for individual places** (restaurants, sights). Those names are free text, and "Open in Maps" runs a Google Maps search for `name, city`.
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
| `signup_viewed` / `account_created` | sign-up funnel: how many drop off at the account step |
| `logged_in` / `logged_out` | returning use |
| `map_viewed` | travel map shown after finishing a postcard (detail: number of pins) |
| `media_added` | photos/videos added to an existing place (photos added while ranking are counted in `place_added`) |
| `example_viewed`, `place_removed`, `trip_deleted` | supporting context |

**Setup (about 5 min):**
1. Create a Google Sheet, then go to **Extensions → Apps Script** and paste in [`google-sheets/Code.gs`](google-sheets/Code.gs).
2. Run the `setup` function once. It creates an **Events** tab and a **Summary** tab that computes the success metrics live (% who ranked 5+ places, median time, % who shared, friend opens/saves).
3. **Deploy → New deployment → Web app**, Execute as *Me*, Access *Anyone*. Copy the `/exec` URL.
4. Paste it into `LOG_URL` in `config.js`.

If `LOG_URL` is empty, the app still works and prints events to the browser console.

## Analytics dashboard (`admin.html`)

Open `https://<user>.github.io/<repo>/admin.html` and enter your admin key. It shows:

- **Headline numbers:** accounts, postcards, shares, link visits, unique visitors, impressions, saves, and app visits.
- **Funnel:** from opening the app → sign-up → account → postcard → 5+ places → shared.
- **Every account:** name, email, join date, recruit tag, and their postcards' shares, visits, visitors and impressions. You can sort columns and download it as a CSV.
- **Every postcard:** with the same reach numbers.
- **Daily charts and a recent-activity feed.**

How the numbers are counted:
- **Link visit:** someone other than the owner opened a shared postcard. Repeat opens count.
- **Unique visitors:** distinct devices.
- **Impression:** any time a postcard was shown, including link visits, owners previewing their own link, and example views.

Rows tagged `?r=test` are hidden by default.

**Setup:** after pasting the latest `Code.gs`, run `setup` once. It adds the `account` column and prints your **admin key**; run `showAdminKey` to see it again. Then publish the update: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The key lives in the Apps Script's properties, not in this public repo. Without it, the dashboard can't read anything.

Preview with sample data: `admin.html?demo`.

**Privacy:** names and emails of people who sign up are sent to your Google Sheet. Tell participants this when you recruit them.

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
