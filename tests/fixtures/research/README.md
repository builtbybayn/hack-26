`openalex.json` is an unmodified response recorded on October 24, 2026 from:

https://api.openalex.org/works?search=vector%20calculus&per_page=5&select=id,display_name,authorships,publication_year,doi,primary_location,best_oa_location,cited_by_count,abstract_inverted_index

It contains real bibliographic records. Tests mock `fetch`; they never contact OpenAlex.
The browser-safe recommendation mock copies two records from this fixture and is checked against it.
