import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyJudgeReply, checkCitations, claimCitationPairs } from '../src/citations.ts';

const sources = [
  { id: 'smith:0', text: 'The court held that the search of the car without a warrant violated the Fourth Amendment.' },
  { id: 'smith:1', text: 'The defendant was sentenced to five years in prison after the jury verdict on fraud counts.' },
  { id: 'jones:0', text: 'Contracts signed under duress are voidable at the option of the party who was coerced.' },
];

test('pairs claims with citations the CrossSource way, including consecutive citations', () => {
  const pairs = claimCitationPairs('The search violated the Fourth Amendment [smith:0], [smith:1]. Duress makes a contract voidable [jones:0].');
  assert.deepEqual(
    pairs.map((p) => p[1]),
    ['smith:0', 'smith:1', 'jones:0'],
  );
  // the continuation citation reuses the previous claim, never a punctuation-only span
  assert.equal(pairs[1][0], pairs[0][0]);
  assert.match(pairs[2][0], /Duress/);
});

test('markdown links are not citations', () => {
  assert.equal(claimCitationPairs('See [the site](https://example.com) for more.').length, 0);
});

test('a cited id that is not in the sources is unsupported_claim, decided without a judge', () => {
  const r = checkCitations('The search violated the Fourth Amendment [smith:9].', sources);
  assert.equal(r.citations[0].verdict, 'unsupported_claim');
  assert.equal(r.citations[0].rule, 'cited_id_not_in_sources');
});

test('another passage in the same document covering the claim => right_doc_wrong_passage', () => {
  const r = checkCitations('The defendant was sentenced to five years in prison after the jury verdict on fraud counts [smith:0].', sources);
  assert.equal(r.citations[0].verdict, 'right_doc_wrong_passage');
  assert.equal(r.citations[0].supported, false);
});

test('a passage in a different document covering the claim => wrong_document', () => {
  const r = checkCitations('Contracts signed under duress are voidable by the coerced party [smith:1].', sources);
  assert.equal(r.citations[0].verdict, 'wrong_document');
});

test('a faithful citation is never auto-supported: it needs a judgment, with the CrossSource prompt', () => {
  const r = checkCitations('The warrantless car search violated the Fourth Amendment [smith:0].', sources);
  const c = r.citations[0];
  assert.equal(c.verdict, 'needs_judgment');
  assert.equal(c.supported, null);
  assert.match(c.judge_prompt!.user, /Does the CITED passage genuinely support the claim/);
  assert.match(c.judge_prompt!.user, /\[smith:0\]/);
});

test('a reversed outcome also needs a judgment (overlap cannot see negation)', () => {
  const r = checkCitations('The court held that the warrantless car search did not violate the Fourth Amendment [smith:0].', sources);
  assert.equal(r.citations[0].verdict, 'needs_judgment');
});

test('numbers in the claim that the cited passage lacks are flagged', () => {
  const r = checkCitations('The defendant was sentenced to 7 years after the jury verdict on fraud counts [smith:1].', sources);
  assert.deepEqual(r.citations[0].scores.numbers_missing_from_cited, ['7']);
});

test('summary counts and uncited trailing text', () => {
  const r = checkCitations('The search violated the Fourth Amendment [smith:0]. And this sentence has no citation.', sources);
  assert.equal(r.summary.citations, 1);
  assert.equal(r.summary.uncited_text, true);
});

test('judge replies are applied only when they match the schema', () => {
  const base = checkCitations('The warrantless car search violated the Fourth Amendment [smith:0].', sources).citations[0];
  assert.equal(applyJudgeReply(base, '{"supported": true, "failure_label": "none", "reason": "ok"}', 'm').verdict, 'supported');
  assert.equal(applyJudgeReply(base, '{"supported": false, "failure_label": "unsupported_claim", "reason": "x"}', 'm').verdict, 'unsupported_claim');
  assert.equal(applyJudgeReply(base, 'I think it is fine', 'm').verdict, 'needs_judgment');
  assert.equal(applyJudgeReply(base, '{"supported": false, "failure_label": "bogus"}', 'm').verdict, 'needs_judgment');
});
