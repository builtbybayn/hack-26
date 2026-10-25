`openalex.json` is an unmodified response recorded on October 24, 2026 from:

https://api.openalex.org/works?search=vector%20calculus&per_page=5&select=id,display_name,type,authorships,publication_year,doi,primary_location,best_oa_location,cited_by_count,abstract_inverted_index

This recorded response predates citation-reference support. The adapter test supplies a small
`referenced_works` response to cover normalization without changing the recorded provider data.

`openalex-book-review.json` is a recorded OpenAlex response for work `W2012107521`, a book review returned for a “vector calculus review” query. It covers filtering records whose work type is unsuitable for background reading.

It contains real bibliographic records. Tests mock `fetch`; they never contact OpenAlex.
The browser-safe recommendation mock copies two records from this fixture and is checked against it.
