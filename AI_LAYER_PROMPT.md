# Task: Seniority filter fix + AI analysis layer

Two changes. Do them in order — the filter fix is small, the AI layer is the
main work. Update `BUILD_PROMPT.md` to reflect both so the spec stays the
source of truth.

Build both fully, test them yourself, and fix what breaks. Do not stop between
them to ask permission.

---

## Part 1 — Seniority filtering

Right now every seniority signal is a soft warning. Some levels are far enough
from my experience that they are pure noise and should be rejected outright.

### Hard reject (title only)

```
staff engineer, staff software, principal, architect, head of,
director, vp of engineering, engineering manager, cto,
7+ years, 8+ years, 10+ years
```

### Soft warning — keep sending, keep the ⚠️ marker

```
senior, lead, tech lead, 3+ years, 4+ years, 5+ years
```

`senior` and `lead` stay soft on purpose: many listings say "senior" while
actually accepting mid-level, and "Tech Lead" at a small company can mean a
team of three. Those are opportunities, not walls.

### Critical implementation detail

**Apply the hard reject to the job title only — the first line — not to the
full message body.** Job descriptions routinely contain phrases like "you will
report to a Principal Engineer" or "mentored by our Staff Engineer" inside
listings that are themselves junior roles. Matching the whole body would
silently discard good jobs.

### Logging

When a message is rejected for seniority, log one clear line:

```
[SKIP:LEVEL] "<title>" — matched "<the keyword that triggered it>"
```

I need to be able to scan these and confirm nothing good is being thrown away.
Silent rejection is the failure mode I care most about.

---

## Part 2 — AI analysis layer

### Where it sits

The AI runs **after** the keyword filter, never before it. The keyword filter
exists to throw away the ~90% of channel traffic that is ads, courses, and
irrelevant stacks. The AI only ever sees what survived that. This keeps the
free-tier quota comfortable and the run fast.

Pipeline:

```
raw messages
  → dedup (skip anything already sent)
  → keyword filter (cheap, local, no network)
  → age cutoff
  → AI analysis          ← new
  → format and send
```

Run the AI **after** dedup, not before — never spend quota analysing a job we
have already sent.

### Model

Google Gemini Flash, free tier, via `GEMINI_API_KEY` in the environment.

Do not hardcode rate limit numbers. The free tier has per-minute and per-day
caps that change; read the limit from the API's error response and back off
accordingly rather than assuming specific values. Add a small concurrency limit
(2–3 parallel calls) so a large batch does not trip the per-minute cap.

### What the AI replaces

The current title/company/location parsing is regex and emoji heuristics, and
it breaks on channels that write in unusual formats. The AI should now own
that extraction. Keep the regex parser in the code as the fallback path — do
not delete it.

### Expected output

Ask the model to return **only** JSON, no prose and no markdown fences:

```json
{
  "is_job": true,
  "matches_me": true,
  "confidence": 0.85,
  "title": "Full Stack Developer",
  "company": "Solo Clash",
  "location": "Dubai, UAE",
  "work_mode": "onsite",
  "seniority": "mid",
  "stack": ["React", "Node.js", "MongoDB"],
  "summary": "سطرين بالعربي عن الوظيفة",
  "reason": "why this does or does not fit me",
  "apply_link": "https://...",
  "apply_email": null
}
```

Field notes:

- `work_mode`: one of `remote`, `hybrid`, `onsite`, `unknown`
- `seniority`: one of `junior`, `mid`, `senior`, `staff+`, `unknown`
- `summary`: Arabic, max two lines
- `reason`: short, and shown in the sent message so I can see the AI's thinking
- `confidence`: the model's own certainty that this is a real, relevant job

### The system prompt

Include my profile so the model can judge fit:

> Full Stack JavaScript / MERN developer. CS graduate, Menoufia University,
> 2025. Six months production experience on a live CRM platform. Published an
> npm library.
>
> - Frontend: React.js, Next.js, Redux Toolkit, Tailwind, Material UI, Vite
> - Backend: Node.js, Express.js, REST APIs, JWT, MVC
> - Databases: MongoDB, Mongoose
> - Languages: JavaScript (ES6+), TypeScript; familiar with C#, Python, C++
> - Also: Solidity, Web3.js, IPFS, Jest, Git, CI/CD
>
> Open to relocation anywhere, including outside Egypt with visa sponsorship.
> Remote, hybrid, and onsite are all acceptable.

And these judgement rules:

1. Anything built on JavaScript or TypeScript counts as a match — including
   React Native, Expo, Ionic, and Electron. Do not reject a role because it is
   mobile or desktop if the language is JS/TS.
2. Do not require the full stack to be present. React-only, Node-only, or
   generic "Software Engineer" roles are matches.
3. Blockchain, Web3, and Solidity roles are a strong match — that was my
   graduation project and it is a rare skill locally.
4. Be lenient about seniority. Only reject on level if the role clearly needs
   many years of experience I do not have. When it is ambiguous, say it
   matches and note the concern in `reason`.
5. Reject: non-engineering roles, courses, training ads, internship *ads*
   selling a paid program, recruiter spam with no actual job, and roles whose
   core language is not JS/TS (Flutter, PHP, .NET, Java, Swift, Kotlin).
6. If the post is not a job at all, set `is_job` to false and stop — the other
   fields can be null.

### Robustness — this is the part that will actually break

- Strip markdown code fences before parsing. The model wraps JSON in them
  regularly despite instructions not to.
- Validate the parsed object against the expected shape. Missing or
  wrong-typed fields must not crash the run.
- **On any AI failure — bad JSON, timeout, quota exhausted, network error —
  fall back to the existing keyword result and the regex parser, and send the
  job anyway.** A broken AI layer must degrade to the previous behaviour, never
  to silence. Losing a real job because an API call failed is the worst
  outcome here.
- Log every fallback with the reason, and include an AI-failure count in the
  run summary.
- Cache AI results in MongoDB keyed by the message text hash, so a repost
  across channels is never analysed twice.
- Put the whole layer behind an `AI_ENABLED` environment flag, default on, so
  I can switch it off instantly if it misbehaves.

### Message format

Add the AI's reasoning to the sent message, as its own line:

```
🤖 {reason}
```

Only include it when the AI actually ran. If it fell back, omit the line
silently — do not print an error in my channel.

Keep the ⚠️ seniority marker from Part 1. The two systems are independent: the
keyword-level check runs regardless of whether the AI ran.

### Dry run

`npm run dry` must print, for every message, both verdicts side by side:

```
KEYWORD: match (score 7)  |  AI: match (0.85) — "Strong React/Node fit, mid-level"
```

I need to compare them directly to see where the AI is helping and where it is
overriding the keyword filter wrongly. Include counts in the run summary of:
messages where the two agreed, where the AI rescued something keywords would
have dropped, and where the AI rejected something keywords accepted.

---

## Testing

Extend the existing fixtures with cases that specifically exercise the AI path,
using a mocked model response so the tests need no API key:

- valid JSON response
- JSON wrapped in markdown fences
- truncated / malformed JSON
- response with missing fields
- simulated quota-exceeded error

Every one of these must end with the job still being sent, via fallback where
needed. Assert that explicitly — that behaviour is the whole point of the
layer being safe to add.
