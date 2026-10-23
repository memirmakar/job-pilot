# Job Pilot

Job Pilot finds jobs that fit you on LinkedIn every day and tailors your resume for each one. It applies where it can and explains every decision in a local app.
It runs on Windows and uses **your own Claude Code** subscription for all the thinking.

## Install (no terminal needed)
1. Install the **Claude Code CLI** from https://claude.com/claude-code.
2. Double-click **`Install.cmd`**. It installs Node.js if needed, sets up the app, and creates a **Job Pilot** shortcut on your Desktop and in the Start menu.
3. Job Pilot opens in your browser and walks you through setup:
   1. **Claude:** checks the CLI and helps you sign in.
   2. **Resumes:** upload one or more (PDF works best). They're the only source of facts, and Claude never invents experience.
   3. **Goals:** what you want to work on, where (cities, countries or remote), your seniority, your GitHub username, and anything employers may ask.
   4. **Your plan:** Claude turns that into target fields and LinkedIn searches, including local-language job titles. You can edit everything.
   5. **LinkedIn:** sign in once, in Job Pilot's own Edge profile.
   6. **Schedule:** the daily time, how many jobs a day, and whether to submit Easy Apply jobs automatically.

If setup fails, the installer offers to let Claude diagnose and fix the problem.

## What happens every day
1. **Search:** every target field × search × location, covering both Easy Apply and external listings.
2. **Pick:** Claude chooses up to **20** (configurable) of the best new matches for your goals and seniority.
3. **Analyze each one:** it reads the posting, including **when it was published**, and scores your resumes against it.
4. **Tailor:** Claude rewrites the best resume for the posting, truthfully. It renders a PDF, re-scores it, and does a second pass if needed.
5. **Apply:**
   - **Easy Apply jobs** are submitted with the tailored resume, and Claude answers the form questions.
   - **External jobs** are marked "Apply externally", with the tailored resume ready to download.
6. **Archive:** listings that have closed are archived. Nothing is deleted: the analysis and tailored resume stay.
7. **Upkeep:** the GitHub review refreshes every 4 days, the market review and to-do list every 3 days, and the **ready resumes** weekly.
   New "How to raise this score" steps are merged into your to-do list (Insights → To-do). When you tick a step done, the next runs re-score the jobs it lifts, a few per run.

## Ready resumes
Job Pilot keeps **one ready resume per target field** under Resumes, so you have the right one for external applications.
Claude rebuilds them weekly, or sooner when you upload a resume, change your fields, or your GitHub changes.

## The doctor
When something goes wrong, Claude can diagnose it and fix settings or the app's own code. Examples: a run finds no listings, LinkedIn changes its layout, or errors repeat.
Every file is backed up first. Any change that breaks the app is undone automatically, and you can undo any fix from the **Doctor** page.
It runs by itself at most once a day per problem. You can also ask it from the Doctor page.

## Use it from your phone
Job Pilot stays on this PC. Tailscale, a free private network for your own devices, lets your phone reach it from anywhere, even on mobile data.
Nothing is opened to the public internet.

1. Install Tailscale on this PC (tailscale.com/download) and sign in.
2. Install the Tailscale app on your phone and sign in with **the same account**. Turn it on.
3. In the Tailscale admin console (login.tailscale.com/admin), open **DNS**. Make sure **MagicDNS** is on, then turn on **HTTPS Certificates**.
4. On this PC, open a terminal and run `tailscale serve --bg 4510`. It prints an address like `https://your-pc.tailXXXX.ts.net`. It keeps working after a restart.
5. In Job Pilot, open **Settings > Phone access** and turn it on. Job Pilot then starts when you sign in to Windows, and this PC stays awake while it runs (the screen can still turn off). The same page shows your phone address.
6. Open that address on your phone. In Chrome's menu, choose **Add to Home screen** (or **Install app**) to get a Job Pilot icon that opens like an app.

Good to know:
- **This PC must be on and signed in to Windows** for the phone to reach Job Pilot. If you quit Job Pilot, the phone can't reach it until you open it again.
- **There is no passcode**, so every device signed in to your Tailscale account can use Job Pilot, including sending applications. Only add your own devices.
- **Never use `tailscale funnel`.** It puts Job Pilot on the public internet.
- To turn phone access off, run `tailscale serve reset`.

## Where things are
| | |
|---|---|
| `resumes/` | your uploaded resumes |
| `data/library/` | ready resumes per field |
| `data/tailored/` | the tailored resume for each job |
| `data/applications/` | everything about each job: scores, answers, reasoning, archive status |
| `data/profile.json`, `data/settings.json` | your setup (edit them from Settings) |
| `data/doctor/` | doctor reports and backups |
| `browser_profile/` | Job Pilot's Edge profile with your LinkedIn sign-in |

To give Job Pilot to someone else, copy the folder **without** `data/`, `resumes/`, `browser_profile/`, `node_modules/` and `applications.csv`. They then run `Install.cmd`.

## Good to know
- **LinkedIn's terms don't allow automated applying,** and accounts that apply too much too fast can be restricted. Keep the daily numbers modest.
- **The daily run needs your PC on and you logged in to Windows.** If the PC was asleep, the run starts as soon as it wakes.
- **Plan usage:** every job uses a few Claude calls. Balanced mode (Sonnet daily, Opus weekly) keeps that manageable. When your plan's limit is reached, the run stops cleanly and continues next time.
- **Advanced:** `node apply.mjs run --dry-run --limit 2` runs a test from a terminal. `node apply.mjs selftest` checks LinkedIn can be read.
