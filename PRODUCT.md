# Product

## Register

product

## Users

QA engineers, developers, and technical product managers who need to verify
features work before shipping. Primary context: seated at a desktop browser,
mid-sprint, wanting confidence that a feature behaves as described. Secondary:
a demo audience watching an AI drive a real browser. Users are technical; they
read tracebacks, approve structured test cases, and care whether the sandbox
agent found actual edge cases.

## Product Purpose

QALoop turns a one-line feature description into reproducible browser tests
without manual scripting. Four AI agents collaborate: one drafts a structured
brief, one explores the live product in a sandboxed Chromium, one generates
test cases from the findings, and one writes a runnable pytest bundle. The user
reviews at two gates and gets a pass/fail report with screenshots. Success
looks like a QA engineer who trusts the output enough to block a deploy on it.

## Brand Personality

Precise. Trustworthy. Unhurried.

The tone is a good senior engineer reviewing your PR: direct, not cold;
thorough, not verbose; confident without being loud. The UI should feel like
a tool that has thought through every edge case, not a tool that's excited to
tell you about itself.

## Anti-references

- Generic SaaS cream: white-on-white, blue CTA, rounded cards everywhere.
- Neon AI aesthetic: glowing gradients, animated meshes, "powered by AI" callouts.
- Cluttered dev dashboards: Jenkins, classic Jenkins-style density with no visual hierarchy.
- Over-branded: any interface where the branding competes with the data for attention.

## Design Principles

1. **The tool disappears into the task.** At any moment the user should be
   focused on the run outcome, not navigating the UI. Navigation, chrome,
   and decoration exist to serve that focus, not to announce themselves.

2. **Status is always visible, never inferred.** The user should never have
   to wonder what phase the run is in, what an agent did, or whether an
   action succeeded. Status lives in the UI permanently, not in toasts that
   disappear.

3. **Data density earns itself.** Show detail only when the user needs it.
   Event logs collapse until expanded; test cases group by category; the
   timeline shows phases, not raw events. Progressive disclosure is the
   operating model, not a nice-to-have.

4. **Human review is a first-class moment.** The two review gates are the
   only times the user is in full control. The UI should acknowledge this
   shift: the world pauses, the artifact under review is foregrounded, and
   the approval action feels like a deliberate decision, not a dismissal.

5. **Earned familiarity over novelty.** QALoop's users know Linear, Figma,
   and Vercel. The interface should match that level of craft: predictable
   layouts, consistent vocabulary, no invented affordances. Surprise is
   saved for results, not chrome.

## Accessibility & Inclusion

Target WCAG 2.1 AA. Primary surface is desktop (≥1024px), hard-blocked below
that with an overlay. Reduced motion respected globally. Dark and light themes
both first-class. All interactive elements keyboard-navigable.
