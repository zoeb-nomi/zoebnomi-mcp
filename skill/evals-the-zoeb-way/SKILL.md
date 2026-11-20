---
name: evals-the-zoeb-way
description: Build or review an LLM evaluation the way Zoeb Nomi runs his public eval harnesses (CrossSource, mirror-eval, screener-eval) - a golden dataset with provenance and a written labelling protocol, a judge that is checked against blind human labels before its numbers are trusted, citation checks that separate retrieval failures from generation failures, and results reported with n and limits. Use when someone asks to design an eval, build a golden set, validate an LLM-as-judge, check citations in a RAG answer, or sanity-check eval numbers before publishing them.
license: MIT
---

# Evals the Zoeb way

LLM products fail quietly. An eval is the check that catches it, and an unchecked eval fails quietly too. Every step below exists because skipping it produced a wrong number in one of these public harnesses. Links point to the evidence on zoebnomi.com.

## 1. Start from the failure, not the metric

- Name the failure the product cannot afford (for legal RAG: a citation that does not support the sentence it is attached to). Then pick metrics that isolate it.
- Use a failure taxonomy, not a bare score. CrossSource labels each bad citation `right_doc_wrong_passage`, `wrong_document` or `unsupported_claim`, and logs `missing_authority` for ground truth the answer never cited.
- Separate the layers. Citation precision is the generator's job; citation recall is capped by retrieval. In CrossSource v0.1 a strict prompt lifted precision 0.981 to 0.994 while recall stayed at 0.760, because retrieval never surfaced the passage. Knowing which layer owns the failure is the point. (https://www.zoebnomi.com/crosssource/)

## 2. Build the golden set like evidence

- Every item carries provenance: source id, URL, the exact passage, and what it cites. A validator rejects an item whose passage is not an exact substring of the stored source.
- Write the labelling protocol before labelling: label definitions, decision steps in order, edge cases, and a changelog. Items labelled under an older version are re-labelled, not grandfathered. (CrossSource LABELING_PROTOCOL.md v1.1: https://github.com/zoeb-nomi/crosssource)
- Balance the labels on purpose. CrossSource v0.3 added 75 `citation_check` items with a fixed mix (30 supported, 15 of each failure) because answerable-by-construction questions never exercise the failure labels.
- Say who labelled what. If items are model-drafted and model-checked, say so in the README, next to the agreement numbers.
- Fix the dev/test split before any tuning, and report the test split.

## 3. Check the judge before trusting it

- Hand-label a blind, stratified sample of the judge's verdicts: every "fail" plus a random set of "pass". Report agreement with n and an interval, not a percentage alone. CrossSource v0.1: 15 of 15 agreed. (https://www.zoebnomi.com/notes/same-model-generates-and-judges/)
- The blind check also finds harness bugs. In CrossSource it exposed consecutive citations ("[a:1], [a:2]") producing punctuation-only claim spans that the judge scored as failures. Fixing it changed the metrics. (https://www.zoebnomi.com/writing/the-judge-caught-a-bug/)
- When agreement is low, downgrade the claim. In mirror-eval two judges matched blind labels on 3 of 40 and 12 of 40, so the taxonomy is reported as bands only. (https://www.zoebnomi.com/mirror-eval/)
- Same model family writing and judging is a known bias. Use a second judge family when you can; when you cannot, say so.

## 4. Check citations deterministically first

- Pair each citation with the claim span it is attached to; treat citations separated only by punctuation as continuations of the previous claim.
- A citation to an id the system never retrieved is a failure. No judge needed.
- A cheap lexical pass catches pointing errors: if another available passage covers the claim far better than the cited one, flag wrong passage or wrong document.
- Never call a citation supported on word overlap. The hardest failures (a reversed outcome, a swapped standard, an overstated scope) share almost every word with the passage they misstate. Send those to a judge with the passage and the alternatives in view.
- If the `zoebnomi` MCP server is connected, `check_citations` does exactly this and returns the CrossSource judge prompt for anything it will not decide. Apply that prompt yourself, or set `use_client_model` where sampling is supported.

## 5. Count the misses

- Wrong answers get caught; missed items do not. Count false passes explicitly, per kind of work. (https://www.zoebnomi.com/writing/nobody-reports-the-misses/)
- Do not trust a confidence threshold you have not measured. In the Decisions API quiz, 47 of 377 answers at 0.9 confidence were wrong, and no threshold reached 95%. (https://www.zoebnomi.com/notes/the-0-9-threshold/)
- Silence is information: a run that "succeeded" in 59 ms is a run to inspect. (https://www.zoebnomi.com/notes/silence-is-information/)

## 6. Repeat, pair, pre-register

- One probe cannot tell "the fix worked" from "we resampled". Repeat each cell and report run-to-run noise. In screener-eval, 5 reps per cell over 21 postings; the gap between screeners (22.3 points) dwarfed any edit to the résumé. (https://www.zoebnomi.com/screener-eval/)
- Pair conditions on the same input in the same run window; the per-item delta is the unit.
- Write predictions before the run and score them after. Report the misses. (https://www.zoebnomi.com/notes/eleven-predictions/)

## 7. Report like someone will check

- Every number carries n, the date, and the dataset version. Small n means directional, and the README says so.
- A limitations section says what the numbers cannot support.
- Keep the run reproducible: one command, cached raw outputs, cost stated, and a re-score path that needs no new API calls.
- Before publishing a number about a person or a product, verify it against the source. With the `zoebnomi` server connected, `verify_claim` checks a claim against zoebnomi.com and returns the site's own wording.

## Output when asked to design or review an eval

1. The failure being measured, in one sentence.
2. Metrics, each mapped to the layer that owns it.
3. Dataset plan: provenance fields, protocol outline, label mix, dev/test split.
4. Judge plan: model family, blind human sample size, agreement threshold below which results become bands.
5. Gates: the numbers that must hold before anything is published.
6. What this eval will not be able to say.
