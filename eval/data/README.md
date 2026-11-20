# eval/data

- `crosssource_citation_check.jsonl`: built by `eval/build_fixture.py` from CrossSource v0.3
  (https://github.com/zoeb-nomi/crosssource, commit 90f10be, `data/v0.3/citation_check.jsonl` and
  `data/v0.3/corpus/`). Labels are CrossSource's final adjudicated labels. Opinion text is from
  public US court opinions via CourtListener (Free Law Project). CrossSource's MIT license follows.
- `verify_claim_golden.jsonl`: 28 queries written for this repo before the matcher was run.

---

MIT License

Copyright (c) 2026 CrossSource contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
