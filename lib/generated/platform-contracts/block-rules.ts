// From snoopy-backend packages/contracts/fixtures/block-rules/*.json, sha256 da76a1de59e33afb379f0fe2b4277faa4719e41b2ee23d223351081724920762.
// Regenerate with `npm run generate:platform-contracts`; never edit by hand.

/** The words of search, sort and pages (owner-words.md rows 1-16); `{…}` is filled in. */
export const BLOCK_WORDS = {
  "search": "Search",
  "searchItems": "Search {items}",
  "searchRuns": "Search runs",
  "clearSearch": "Clear search",
  "noMatch": "Nothing matches \"{query}\".",
  "sort": "Sort",
  "defaultOrder": "Default order",
  "aToZ": "A to Z",
  "newestFirst": "Newest first",
  "oldestFirst": "Oldest first",
  "highToLow": "{label}: high to low",
  "columnAToZ": "{column}: A to Z",
  "columnHighToLow": "{column}: high to low",
  "previous": "Previous",
  "next": "Next",
  "pageOf": "Page {n} of {total}",
  "previousPage": "Previous page",
  "nextPage": "Next page"
} as const;

/** The spacing table (the owner's Q8): names, read as points in the app. */
export const BLOCK_SPACING = {
  "edge": 20,
  "edgeWide": 24,
  "group": 16,
  "title": 8,
  "inner": 8,
  "rowY": 12,
  "rowX": 16,
  "rowMinHeight": 44,
  "card": 16,
  "cardWide": 24,
  "bottom": 24
} as const;

/** A list or table is long above `pageSize`; a query is at most `queryLength` characters. */
export const BLOCK_LIST_RULES = {
  "pageSize": 25,
  "queryLength": 80
} as const;

/** The search cases: a query, the rows' fields, and the rows it matches. */
export type BlockSearchCase = { name: string; query: string; rows: readonly (readonly string[])[]; matches: readonly number[] };

export const BLOCK_SEARCH_CASES: readonly BlockSearchCase[] = [
  {
    "name": "trimmed",
    "query": "  dana  ",
    "rows": [
      [
        "Dana Whitfield"
      ],
      [
        "Omar Reyes"
      ]
    ],
    "matches": [
      0
    ]
  },
  {
    "name": "case-free",
    "query": "OMAR",
    "rows": [
      [
        "Dana Whitfield"
      ],
      [
        "Omar Reyes"
      ]
    ],
    "matches": [
      1
    ]
  },
  {
    "name": "accents removed in the row",
    "query": "jose",
    "rows": [
      [
        "José Alvarez"
      ],
      [
        "Mara Quinn"
      ]
    ],
    "matches": [
      0
    ]
  },
  {
    "name": "accents removed in the query",
    "query": "Josè",
    "rows": [
      [
        "Jose Ortiz"
      ],
      [
        "Mara Quinn"
      ]
    ],
    "matches": [
      0
    ]
  },
  {
    "name": "contains, anywhere in a word",
    "query": "field",
    "rows": [
      [
        "Dana Whitfield"
      ],
      [
        "Omar Reyes"
      ],
      [
        "Fielding Lane"
      ]
    ],
    "matches": [
      0,
      2
    ]
  },
  {
    "name": "any of a row's fields",
    "query": "harbor",
    "rows": [
      [
        "Payroll Lead",
        "Fernwood Foods"
      ],
      [
        "Analyst",
        "Harbor Paper Co."
      ]
    ],
    "matches": [
      1
    ]
  },
  {
    "name": "an empty query matches all",
    "query": "",
    "rows": [
      [
        "Dana"
      ],
      [
        "Omar"
      ]
    ],
    "matches": [
      0,
      1
    ]
  },
  {
    "name": "a query of spaces matches all",
    "query": "   ",
    "rows": [
      [
        "Dana"
      ],
      [
        "Omar"
      ]
    ],
    "matches": [
      0,
      1
    ]
  },
  {
    "name": "a miss matches none",
    "query": "zzz",
    "rows": [
      [
        "Dana"
      ],
      [
        "Omar"
      ]
    ],
    "matches": []
  }
];

/** The sort cases: a list's rows or a table's cells, its choices, one choice and the order it gives. */
export type BlockSortCase = {
  name: string;
  kind: 'list' | 'table';
  columns?: readonly (string | null)[];
  rows: readonly ({ title: string; value?: string; valueLabel?: string } | readonly string[])[];
  choices: readonly string[];
  choice: string;
  order: readonly number[];
};

export const BLOCK_SORT_CASES: readonly BlockSortCase[] = [
  {
    "name": "the number rule: money, commas and spaces",
    "kind": "table",
    "columns": [
      "Vendor",
      "Total"
    ],
    "rows": [
      [
        "Harbor Paper Co.",
        "$1,204.50"
      ],
      [
        "Cedar Office Supply",
        "$980.00"
      ],
      [
        "Pine Street Print",
        "€ 2,010"
      ],
      [
        "Lark Labels",
        "£15"
      ]
    ],
    "choices": [
      "Default order",
      "Vendor: A to Z",
      "Total: high to low"
    ],
    "choice": "Total: high to low",
    "order": [
      2,
      0,
      1,
      3
    ]
  },
  {
    "name": "the number rule: one trailing percent",
    "kind": "table",
    "columns": [
      "Check",
      "Rate"
    ],
    "rows": [
      [
        "Totals",
        "12%"
      ],
      [
        "Dates",
        "7.5%"
      ],
      [
        "Names",
        "100%"
      ]
    ],
    "choices": [
      "Default order",
      "Check: A to Z",
      "Rate: high to low"
    ],
    "choice": "Rate: high to low",
    "order": [
      2,
      0,
      1
    ]
  },
  {
    "name": "negatives and decimals",
    "kind": "list",
    "rows": [
      {
        "title": "North",
        "value": "-3.5",
        "valueLabel": "Change"
      },
      {
        "title": "South",
        "value": "2",
        "valueLabel": "Change"
      },
      {
        "title": "East",
        "value": "-10",
        "valueLabel": "Change"
      },
      {
        "title": "West",
        "value": "0.25",
        "valueLabel": "Change"
      }
    ],
    "choices": [
      "Default order",
      "A to Z",
      "Change: high to low"
    ],
    "choice": "Change: high to low",
    "order": [
      1,
      3,
      0,
      2
    ]
  },
  {
    "name": "empty cells go last",
    "kind": "table",
    "columns": [
      "Name",
      "Score"
    ],
    "rows": [
      [
        "Avery",
        ""
      ],
      [
        "Blake",
        "40"
      ],
      [
        "Casey",
        "90"
      ],
      [
        "Devon",
        ""
      ]
    ],
    "choices": [
      "Default order",
      "Name: A to Z",
      "Score: high to low"
    ],
    "choice": "Score: high to low",
    "order": [
      2,
      1,
      0,
      3
    ]
  },
  {
    "name": "missing values go last",
    "kind": "list",
    "rows": [
      {
        "title": "Avery"
      },
      {
        "title": "Blake",
        "value": "40",
        "valueLabel": "Score"
      },
      {
        "title": "Casey",
        "value": "90",
        "valueLabel": "Score"
      }
    ],
    "choices": [
      "Default order",
      "A to Z",
      "Score: high to low"
    ],
    "choice": "Score: high to low",
    "order": [
      2,
      1,
      0
    ]
  },
  {
    "name": "ties keep the order sent",
    "kind": "list",
    "rows": [
      {
        "title": "First",
        "value": "50",
        "valueLabel": "Score"
      },
      {
        "title": "Second",
        "value": "70",
        "valueLabel": "Score"
      },
      {
        "title": "Third",
        "value": "50",
        "valueLabel": "Score"
      },
      {
        "title": "Fourth",
        "value": "70",
        "valueLabel": "Score"
      }
    ],
    "choices": [
      "Default order",
      "A to Z",
      "Score: high to low"
    ],
    "choice": "Score: high to low",
    "order": [
      1,
      3,
      0,
      2
    ]
  },
  {
    "name": "a mixed column gets A to Z only",
    "kind": "table",
    "columns": [
      "Item",
      "Amount"
    ],
    "rows": [
      [
        "Paper",
        "12"
      ],
      [
        "Toner",
        "n/a"
      ],
      [
        "Labels",
        "3"
      ]
    ],
    "choices": [
      "Default order",
      "Item: A to Z",
      "Amount: A to Z"
    ],
    "choice": "Amount: A to Z",
    "order": [
      0,
      2,
      1
    ]
  },
  {
    "name": "an untitled column gets no choice, and empty cells go last in A to Z",
    "kind": "table",
    "columns": [
      "Vendor",
      null,
      "City"
    ],
    "rows": [
      [
        "Harbor Paper Co.",
        "x",
        ""
      ],
      [
        "Cedar Office Supply",
        "y",
        "Salem"
      ],
      [
        "Pine Street Print",
        "z",
        "Albany"
      ]
    ],
    "choices": [
      "Default order",
      "Vendor: A to Z",
      "City: A to Z"
    ],
    "choice": "City: A to Z",
    "order": [
      2,
      1,
      0
    ]
  },
  {
    "name": "a list whose rows' value labels differ gets no high to low",
    "kind": "list",
    "rows": [
      {
        "title": "Blake",
        "value": "2",
        "valueLabel": "Points"
      },
      {
        "title": "Avery",
        "value": "1",
        "valueLabel": "Score"
      }
    ],
    "choices": [
      "Default order",
      "A to Z"
    ],
    "choice": "A to Z",
    "order": [
      1,
      0
    ]
  },
  {
    "name": "list values: Score: high to low",
    "kind": "list",
    "rows": [
      {
        "title": "Dana Whitfield",
        "value": "88",
        "valueLabel": "Score"
      },
      {
        "title": "Omar Reyes",
        "value": "41",
        "valueLabel": "Score"
      },
      {
        "title": "Mara Quinn",
        "value": "63",
        "valueLabel": "Score"
      }
    ],
    "choices": [
      "Default order",
      "A to Z",
      "Score: high to low"
    ],
    "choice": "Score: high to low",
    "order": [
      0,
      2,
      1
    ]
  },
  {
    "name": "A to Z ignores case and accents; ties keep the order sent",
    "kind": "list",
    "rows": [
      {
        "title": "beta"
      },
      {
        "title": "Alpha"
      },
      {
        "title": "alpha"
      },
      {
        "title": "Émile"
      },
      {
        "title": "eve"
      }
    ],
    "choices": [
      "Default order",
      "A to Z"
    ],
    "choice": "A to Z",
    "order": [
      1,
      2,
      0,
      3,
      4
    ]
  },
  {
    "name": "the default order is the order sent",
    "kind": "list",
    "rows": [
      {
        "title": "Casey",
        "value": "90",
        "valueLabel": "Score"
      },
      {
        "title": "Avery",
        "value": "95",
        "valueLabel": "Score"
      }
    ],
    "choices": [
      "Default order",
      "A to Z",
      "Score: high to low"
    ],
    "choice": "Default order",
    "order": [
      0,
      1
    ]
  }
];
