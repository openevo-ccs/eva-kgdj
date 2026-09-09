# Governance of the canonical graph

| | |
|---|---|
| **Applies to** | `kgdj.nodes` and `kgdj.edges` with `status = 'canonical'` — the shared, institute-facing graph |
| **Does not apply to** | Personal portfolios, Commons spaces, and proposals. Those are governed by their owners, their stewards, and the submitter respectively. |
| **Status** | **Draft for editor ratification.** The thresholds in §3 are a policy choice, not a technical fact. Editors should agree them before the WiSe 2026/27 pilot and amend this file. |
| **Written** | 2026-09-09 |

## 1. What "canonical" means

A canonical node or edge is a claim the institute is willing to show a newcomer
as **reviewed** — not merely true, and not merely present. Everything else lives
at `status = 'proposed'` and renders dashed in the explorer, which is an honest
signal rather than a defect.

Promotion is therefore a statement about **process**: that identified people
with relevant competence looked at this, disagreed where they disagreed, and
the record of that is attached. A canonical node with no visible review history
is a failure of this document even if the claim it carries is correct.

## 2. Who may do what

| Role | May |
|---|---|
| `msc_student`, `researcher` | Propose changes; review anything they did not author; build portfolios and Commons items |
| `editor` | All of the above, plus decide proposals and promote or archive canonical records |
| `admin` | All of the above, plus assign roles |

Enforced in the database by Row-Level Security (`0002_rls.sql`): only
`is_editor()` may insert an editorial decision, and only as themselves.
Membership itself is gated by domain allowlist at sign-up.

## 3. What "enough review" means

For a proposal or a proposed record to be promoted, the standard is:

1. **At least two reviews from identified reviewers.** Anonymous-to-peers
   reviews still count — "identified" means the editor can see who wrote it, not
   that the author is public.
2. **Mean rating of at least `accept`.** Ratings map
   `strongly_reject = -2`, `reject = -1`, `neutral = 0`, `accept = +1`,
   `strongly_accept = +2`; the mean must be `>= +1`.
3. **No `strongly_reject` outstanding.** A single strong objection blocks
   promotion until it is withdrawn, answered, or explicitly overridden under §5.
4. **No unresolved review-integrity flag** on the record.

Reviewers are expected to have relevant competence. A review that only says
"looks good" does not discharge the reviewer's part of this.

## 4. What the system enforces, and what it does not

This distinction matters more than the thresholds themselves. Do not assume the
application is checking on your behalf.

**Enforced by the database, and cannot be bypassed from the app:**

- **Conflict of interest.** A proposer cannot review their own proposal; an
  author cannot review their own node or edge; an owner cannot review their own
  portfolio. The `review_coi` trigger raises an exception.
- **Status legality.** A proposal can only be reviewed while `pending` or
  `under_review`, and only decided from `pending`, `under_review` or
  `revision_requested`.
- **Authority.** Only editors and admins can decide or promote.
- **Provenance and audit.** Every promotion stamps `approved_by`, `approved_at`
  and `decision_id` into the record's `provenance`, and writes an `audit_log`
  row. Promotions are attributable after the fact, always.

**Not enforced — human policy only:**

- **Every threshold in §3.** The database will let an editor promote a node with
  zero reviews, or over a `strongly_reject`. `apply_editorial_decision()`
  performs no count and no arithmetic on ratings. This is deliberate: encoding a
  quorum before the pilot has taught us what review actually looks like here
  would harden a guess into a constraint. It also means **§3 holds only as long
  as editors choose to hold it**, and the audit log is what makes that
  checkable.

If the pilot shows editors want the thresholds enforced rather than observed,
that becomes a migration and this section should be rewritten, not quietly
contradicted.

## 5. Editor override

An editor may promote or archive against §3 — for an obvious correction, a
time-critical teaching need, or a reviewer acting in bad faith. When they do:

- The decision's `rationale` must say **why the standard was not met and why
  promotion is still right**. "Approved" is not a rationale.
- The override is visible in the record's provenance and the audit log. It is
  not a private act.
- Overrides against a `strongly_reject` should be raised with the other editors
  before, not after.

## 6. The imported ccp_module batch

154 nodes and 416 edges imported from `ccp_module` on 2026-09-09 carry
`status = 'proposed'` with `provenance.imported_from = 'ccp_module'` and an
`import_batch` marker. These are **already-published departmental teaching
material**, reviewed upstream in their own repository — not fresh student
proposals.

Editors may promote this batch **in bulk on the strength of its upstream
review**, which is the reason it is tagged as a batch rather than merged
invisibly into the seed. Two carve-outs:

- The 26 unmatched generic seed nodes and 5 skipped `scientist`-type records are
  **not** part of the batch and need individual judgement.
- Bulk promotion still records a decision per record, so provenance stays
  per-node. Cite the upstream review in the rationale once; it applies to all.

## 7. Archiving and disputes

Records are **archived, never deleted** — archiving a node also archives its
edges. A canonical record that turns out to be wrong is archived with a
rationale, not silently edited, so the history of what the institute once
asserted stays legible.

Disagreement with a canonical record is expressed by proposing a change or
opening a review on it, not by editing around it.

## 8. Amending this document

This file is part of the app and ships publicly with it. Changes are proposed
the way code changes are, and should be agreed by the editors as a group.
Record the date and the reason at the top of the change.

**Open before the pilot:** editors ratify or adjust §3's numbers; decide whether
a single `strongly_reject` should block or merely require a second editor; and
name who holds the editor role for the WiSe 2026/27 cohort.
