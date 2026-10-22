# Data files

All under `data/` (git-ignored) unless noted. Old records must stay readable without migration: add optional fields, never rename.
To look at real data, print keys or one record with a `node -e` one-liner; never cat a whole data file or folder.

## Jobs: `data/applications/<site>-<id>.json` (one per job)
- Core: `title company location url status statusReason createdAt submittedAt description field easyApply externalUrl postedAt postedText applicants logoUrl selection{reason}`.
- Scoring: `ats{best_score best_file summary resumes[{file ats_score matched_keywords missing_keywords reasoning}] recommendations github_projects}`.
- Tailoring: `tailored{used score baseScore file path baseFile basePath pass uploaded resume{changes not_added github_added}}`;
  `tailored.versions[{v by(claude|you) file path score at note changes resume confirmed}]` (oldest first, last = current; missing = v1 from `tailored{}`);
  `tailored.sent{v at company}` (missing on old applied records = v1 when `uploaded`). A re-upload moves `tailored.file/path/score` to the new version; the sent one never changes.
  Resume rules work adds (all optional): `tailored.displayName`; `tailored.sent.fileName` (the name it was sent under; derived from the sent version's file);
  `tailored.deleted{at}` (v1 deleted from the Resumes menu: hidden, job falls back to the original); versions gain `instruction` ("Ask Claude to change") and
  `resume.photo`; each change gains `rule` (the standing rule it applied). `tailoredBefore` exists only while `retailor.mjs` runs.
- Form: `steps[{fields[{label value source confidence reasoning}]}]` (source: prefilled | claude | approved), `warnings`, `usage{costUsd …}`, `archived{at reason}`.
- After Applied: `statusHistory[{status at source note date}]` (status: viewed | interview | offer | rejected | applied (back to applied) | listing_closed;
  source: linkedin | you; `date` = interview "YYYY-MM-DDTHH:MM"). `status` stays `applied`; the app shows the latest entry.
  "No reply" is computed (no news for `noReplyDays` since the last entry or submittedAt), never stored.
- Held jobs: `status: waiting_ok` with `statusReason`; approving sets `status: approved` + `approval{at answers[{label value}] skipped lastDryRun}`;
  sending moves the held `steps` to `heldSteps` and refills `steps`.
- Re-score: `rescore{at items[]}` ("Re-score on next run": set by ticking a to-do item that lifts the job, never on applied or archived jobs; cleared by
  `rescore.mjs`, up to `rescorePerRun` (max 5) per run) and `rescored{at from to items}`. A re-score that lifts a `resume_insufficient` job to the cutoff makes it `ready_to_apply`.
- Status words, tones and Jobs filter buckets: `ui/js/components/status-pill.js` (`STATUS`). The shown status is `shown(r)` in `screens/jobs/track.js`;
  the primary action per status is `PRIMARY` in `screens/jobs/detail.js`. Everything after Applied is in the Applied filter; waiting_ok and approved are in To apply.
- Sent jobs show the score of the version sent (`tailored.sent`), with "A newer version scores N"; downloads serve the newest version.

## Settings and profile
- `data/settings.json` (defaults in `config.mjs` `DEFAULT_SETTINGS`): `applyMode` (auto | ask_below_target | ask_all | analyze_only; unknown = analyze_only) `noReplyDays`
  `dailyJobs weeklyJobs dailyApplyLimit scheduleEnabled scheduleTime scheduleDays modelDaily modelWeekly minAtsScore tailorTarget postedWithin tailorMaxPasses
  maxRunMinutes rescorePerRun claudePath browserChannel notify{run needsYou replies errors} uploadTailored …`.
  `weeklyJobs` 0 = off (with `dailyJobs`: "Pause runs after about N jobs a day / M a week", counted across runs). `scheduleDays` all = daily trigger, else weekly on those days.
- `data/profile.json`: `name goalsText preferences locations workplace seniority targets[…] titleExclude companyExclude facts githubUser onboardedAt answers{…}`.
  - A target is a search profile: `{field searchTerms why on locations workplace resume tailorTarget minAtsScore dailyApplyLimit titleExclude}`; `on: false` = not searched;
    every other key is an optional override (missing = the global value); `resume` = Resumes id `o:<file>` or `r:<field slug>`; a profile's `titleExclude` adds to the global one;
    `workplace` other than all three adds LinkedIn's `f_WT` filter. Resolved by `profiles.mjs`.
  - `answers{salary military license notice travel relocation english: {tr en}}` (moved out of `facts` once by `config.mjs` `loadProfile()`; old text in `factsBeforeAnswers`).
    `config.profile` (what every prompt reads) = standard answers + remaining facts.
  `resumeRules[{id text at}]` (standing rules for every resume) and `resumeSettings{namePattern photoTr photoEn(null = ask) photo{at source} noRebuild[field]}`
  (`resume_prefs.mjs`; default pattern `{First}_{Last}_CV_{LANG}`). The photo itself: `data/photo/photo.jpg` (600×800 JPEG from the crop step).
- `data/onboarding.json`: onboarding progress (step, reached, answers, the plan) so setup resumes where it stopped.

## Resumes
- `resumes/` (project root, git-ignored): uploaded originals. `data/resumes.json`: per original `name language fields defaultFor uploadedAt read{resume roles skills languages new_skills} history[{v at path note}]`.
  `data/resumes.json` also gets `deleted{at}`, `currentBy currentNote` (a version Claude made from your instruction); history entries keep `read`.
  Deleted resumes: `data/trash.json` `[{at id kind label undo{…} undoneAt}]` (last 50) with files in `data/trash/<ts>/`; ready-resume `meta.json` gains `displayName`.
- Old files of originals: `data/resumes_history/<file>/v<N>-<file>`; same-name uploads archive first. Staged uploads wait in `data/staging/<token>/`.
- `data/library/<field>/`: ready resumes (`meta.json` + `versions[]`, older PDFs in `versions/`, your uploads in `v<N>/`).
- `data/tailored/<job>/`: tailored PDFs (`pass1`, `pass2`, re-uploads in `v<N>/`). Resumes are structured JSON rendered to PDF by `resume_pdf.mjs`.

## Runs and logs
- `data/runs/current.json` (live run: `phase detail counts events anomalies pid`); `data/runs/<id>.json` (finished: `outcome{summary stop stopKind stoppedAt resumeAt} selection
  usage{analyze|tailor|answers|select: {calls costUsd}}`), `*.log` task logs. A `current.json` left unfinished counts as a stopped run.
- `stopKind`: linkedin_login | linkedin_limit | claude_limit | claude_login | time_limit | browser_closed | repeated_errors | crash | stopped (old runs: none).
  The Jobs problem states read it (`screens/jobs/track.js` `runProblem()`).
- `costUsd` is Claude Code's API-price estimate: show it as an estimate, never a bill.
- `applications.csv` (project root): tab-separated activity log `date site status id title company url reason`. Filtered rows say which never-apply entry matched
  (`excluded company "X"` / `excluded title word "X"`). Read only its tail.

## Insights, market, to-do
- `data/market/review.json` (`review{headline verdict_points segments strengths gaps todo resume_fixes stop_doing}`, `stats`), `keyword_audit.json`.
- `todo_state.json` = `{v: 2, done{itemId: at}, added{itemId: at}, legacy{}, custom{"c:<hash>": {title why hours kind at}}}` (v1 was `title → doneAt`; `todo.mjs` moves titles to ids,
  unknown ones stay in `legacy`; `custom` = steps added from Guidance).
- `todo_groups.json` = `{at, groups[{id title keys[]}]}`: Claude's merges. Source keys: `m:<title hash>` (market todo) and `r:<site>-<id>:<action hash>` (a job's step,
  the same list the Jobs raise card shows). Item id = `t-<hash of its first step's text>`, so marks on an unmerged step keep their id; only steps no group has seen go to Claude.
- `snapshots.json`: one entry per run (`at run listings fields{} cities{} workplace{remote hybrid onsite unknown} easyApply companies{name: {n field}}`, last 200).

## GitHub, conversations, doctor, backups
- `data/github/repos.json` (`user fetchedAt repos`), `data/github/review.json` (`repo → review` with `relevance field fixes[] pin(pin|maybe|dont)`; a refresh re-reviews repos lacking `relevance`).
  `data/github/projects.json`: `{repo: {state(use|never) resumeName description suggested{state name description why at} at}}`; a repo without a state is
  "Not reviewed" and never reaches a prompt (`github.mjs` `githubBrief` passes only approved repos, by resume name; `{ all: true }` for everything).
- `data/conversations/` (`coach_store.mjs`): `<site>-<id>.json` per job (shared by the Jobs Ask panel and Guidance), `g-<id>.json` general, `weekly.json` check-ins; deleted ones move to `deleted/`.
  Format `{v: 2, cid kind(job|general|weekly) title titleByYou site id company createdAt updatedAt messages[{role(user|claude) text at kind? actions[]? stats? n?}]
  summary{text upto} context{goals resumes github jobs market off[]} interview{job lang plan[{q about}] i startedAt answers[]}|null interviews[] costUsd usage{calls input output promptChars} lastCall}`.
  Message kinds: checkin, iv-intro, iv-question, iv-answer, iv-feedback, iv-summary. Actions: add_todo (todo_id or title/why/hours, or items[]), update_goals (goals_text),
  resume_edit (resume_id t:|r:, find, replace: staged as .docx and checked by `reupload.mjs` `checkStaged`), draft_message (draft, recipient), mock_interview (job).
- `data/doctor/<id>.json` reports + `backups/`; `undoReport()` puts back a report's `changedFiles`. `backups/` (root): the ZIP written before Delete my data.
- `browser_profile/` (root): the LinkedIn sign-in. Never read or list it.
