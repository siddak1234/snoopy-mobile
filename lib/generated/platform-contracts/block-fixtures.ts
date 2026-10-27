// From snoopy-backend packages/contracts/fixtures/blocks/*.json, sha256 de7f73a833706bce6f78c7f748efd1e53cb592490ddd8e845e75568f88578a7f.
// Regenerate with `npm run generate:platform-contracts`; never edit by hand.
/** A page body and its visible words in reading order, closed sections left out. */
export type BlockFixture = {
  name: string;
  about: string;
  blockSetVersion: number;
  blocks: readonly unknown[];
  text: readonly string[];
};

export const BLOCK_FIXTURES: readonly BlockFixture[] = [
  {
    "name": "drawn-chart-bar",
    "about": "A bar chart of 3 bars, one text filled by the platform, and its alt",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "chart",
        "kind": "bar",
        "title": "Spend by vendor",
        "alt": "Spend by vendor. Bar chart. Harbor Paper Co.: $1,204.50; Cedar Office Supply: $980.00; Pine Street Print: 312.",
        "points": [
          {
            "label": "Harbor Paper Co.",
            "value": 1204.5,
            "text": "$1,204.50"
          },
          {
            "label": "Cedar Office Supply",
            "value": 980,
            "text": "$980.00"
          },
          {
            "label": "Pine Street Print",
            "value": 312,
            "text": "312"
          }
        ]
      }
    ],
    "text": [
      "Spend by vendor",
      "Harbor Paper Co.",
      "$1,204.50",
      "Cedar Office Supply",
      "$980.00",
      "Pine Street Print",
      "312"
    ]
  },
  {
    "name": "drawn-chart-line",
    "about": "A line chart of 6 points, and its alt",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "chart",
        "kind": "line",
        "title": "Invoices by week",
        "alt": "Invoices by week. Line chart. Sep 8: 12; Sep 15: 18; Sep 22: 9; Sep 29: 21; Oct 6: 21; Oct 13: 15.",
        "points": [
          {
            "label": "Sep 8",
            "value": 12,
            "text": "12"
          },
          {
            "label": "Sep 15",
            "value": 18,
            "text": "18"
          },
          {
            "label": "Sep 22",
            "value": 9,
            "text": "9"
          },
          {
            "label": "Sep 29",
            "value": 21,
            "text": "21"
          },
          {
            "label": "Oct 6",
            "value": 21,
            "text": "21"
          },
          {
            "label": "Oct 13",
            "value": 15,
            "text": "15"
          }
        ]
      }
    ],
    "text": [
      "Invoices by week",
      "21",
      "9",
      "Sep 8",
      "Oct 13"
    ]
  },
  {
    "name": "drawn-image-pdf",
    "about": "A measured PDF drawn as a picture: a scanned page",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "image",
        "alt": "The scanned delivery note",
        "open": {
          "target": "run-file",
          "runId": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a",
          "fileId": "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f"
        },
        "file": {
          "id": "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
          "filename": "scanned-page.pdf",
          "contentType": "application/pdf",
          "format": "PDF",
          "sizeBytes": 212480,
          "pages": 1,
          "measuredKind": "pdf"
        }
      }
    ],
    "text": []
  },
  {
    "name": "drawn-image-unavailable",
    "about": "A picture naming another job's file: the muted line that says so",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "text",
        "text": "This file isn't available.",
        "style": "muted"
      }
    ],
    "text": [
      "This file isn't available."
    ]
  },
  {
    "name": "drawn-image",
    "about": "A run's measured JPEG of 1 MiB, drawn as a picture that opens its file",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "image",
        "alt": "The receipt from Harbor Paper Co.",
        "open": {
          "target": "run-file",
          "runId": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a",
          "fileId": "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e"
        },
        "file": {
          "id": "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e",
          "filename": "receipt.jpg",
          "contentType": "image/jpeg",
          "format": "JPEG",
          "sizeBytes": 1048576,
          "pages": 1,
          "measuredKind": "jpeg"
        }
      }
    ],
    "text": []
  },
  {
    "name": "emitted-all-nine",
    "about": "A run that sent one of each of the nine sendable types",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "text",
        "text": "What this run found",
        "style": "label"
      },
      {
        "type": "text",
        "text": "Two of three checks passed.",
        "tone": "warning"
      },
      {
        "type": "metric",
        "items": [
          {
            "label": "Checked",
            "value": "3"
          },
          {
            "label": "Passed",
            "value": "2",
            "tone": "success"
          }
        ]
      },
      {
        "type": "badge",
        "text": "Needs a look",
        "tone": "warning"
      },
      {
        "type": "table",
        "columns": [
          {
            "title": "Check"
          },
          {
            "title": "Result",
            "align": "end"
          }
        ],
        "rows": [
          {
            "cells": [
              "Totals add up",
              "Yes"
            ]
          },
          {
            "cells": [
              "Date present",
              "No"
            ],
            "note": "Read from the header."
          }
        ]
      },
      {
        "type": "list",
        "items": [
          {
            "title": "Seller name",
            "subtitle": "Line 1",
            "badge": {
              "text": "Found",
              "tone": "success"
            }
          }
        ]
      },
      {
        "type": "section",
        "title": "How it was read",
        "blocks": [
          {
            "type": "text",
            "text": "Read page by page."
          }
        ]
      },
      {
        "type": "file",
        "title": "The upload",
        "open": {
          "target": "run-file",
          "runId": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a",
          "fileId": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c"
        },
        "file": {
          "id": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c",
          "filename": "upload.pdf",
          "contentType": "application/pdf",
          "format": "PDF",
          "sizeBytes": 48213,
          "pages": 3
        }
      },
      {
        "type": "link",
        "title": "Where the rules live",
        "url": "https://help.example.test/rules"
      },
      {
        "type": "timeline",
        "items": [
          {
            "title": "Read",
            "state": "done"
          },
          {
            "title": "Check",
            "sub": "One left",
            "state": "working"
          }
        ]
      }
    ],
    "text": [
      "What this run found",
      "Two of three checks passed.",
      "3",
      "Checked",
      "2",
      "Passed",
      "Needs a look",
      "Check",
      "Result",
      "Totals add up",
      "Yes",
      "Date present",
      "No",
      "Read from the header.",
      "Seller name",
      "Found",
      "Line 1",
      "How it was read",
      "The upload",
      "Where the rules live",
      "help.example.test",
      "Read",
      "Check",
      "One left"
    ]
  },
  {
    "name": "empty-item",
    "about": "An item with no runs yet",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "metric",
        "items": [
          {
            "label": "Total",
            "value": "0"
          },
          {
            "label": "Advance",
            "value": "0",
            "tone": "success"
          },
          {
            "label": "Decline",
            "value": "0",
            "tone": "error"
          }
        ]
      },
      {
        "type": "file",
        "title": "Job description",
        "open": {
          "target": "item-file",
          "itemId": "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b"
        },
        "file": {
          "id": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c",
          "filename": "payroll-analyst.pdf",
          "contentType": "application/pdf",
          "format": "PDF",
          "sizeBytes": 48213,
          "pages": 3
        }
      },
      {
        "type": "questions",
        "title": "Add candidate",
        "form": {
          "kind": "run",
          "itemId": "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b"
        }
      },
      {
        "type": "text",
        "text": "Candidates",
        "style": "label"
      },
      {
        "type": "list",
        "searchable": true,
        "items": [],
        "empty": "No candidates yet."
      }
    ],
    "text": [
      "0",
      "Total",
      "0",
      "Advance",
      "0",
      "Decline",
      "Job description",
      "Candidates",
      "No candidates yet."
    ]
  },
  {
    "name": "long-list",
    "about": "A sent list of 30 rows sharing one value label: sort and pages",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "list",
        "items": [
          {
            "title": "Applicant 01",
            "subtitle": "Harbor Paper Co.",
            "value": "40",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 02",
            "subtitle": "Cedar Office Supply",
            "value": "77",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 03",
            "subtitle": "Pine Street Print",
            "value": "54",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 04",
            "subtitle": "Lark Labels",
            "value": "91",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 05",
            "subtitle": "Juniper Freight",
            "value": "68",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 06",
            "subtitle": "Maple Desk Works",
            "value": "45",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 07",
            "subtitle": "Harbor Paper Co.",
            "value": "82",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 08",
            "subtitle": "Cedar Office Supply",
            "value": "59",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 09",
            "subtitle": "Pine Street Print",
            "value": "96",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 10",
            "subtitle": "Lark Labels",
            "value": "73",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 11",
            "subtitle": "Juniper Freight",
            "value": "50",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 12",
            "subtitle": "Maple Desk Works",
            "value": "87",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 13",
            "subtitle": "Harbor Paper Co.",
            "value": "64",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 14",
            "subtitle": "Cedar Office Supply",
            "value": "41",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 15",
            "subtitle": "Pine Street Print",
            "value": "78",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 16",
            "subtitle": "Lark Labels",
            "value": "55",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 17",
            "subtitle": "Juniper Freight",
            "value": "92",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 18",
            "subtitle": "Maple Desk Works",
            "value": "69",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 19",
            "subtitle": "Harbor Paper Co.",
            "value": "46",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 20",
            "subtitle": "Cedar Office Supply",
            "value": "83",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 21",
            "subtitle": "Pine Street Print",
            "value": "60",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 22",
            "subtitle": "Lark Labels",
            "value": "97",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 23",
            "subtitle": "Juniper Freight",
            "value": "74",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 24",
            "subtitle": "Maple Desk Works",
            "value": "51",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 25",
            "subtitle": "Harbor Paper Co.",
            "value": "88",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 26",
            "subtitle": "Cedar Office Supply",
            "value": "65",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 27",
            "subtitle": "Pine Street Print",
            "value": "42",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 28",
            "subtitle": "Lark Labels",
            "value": "79",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 29",
            "subtitle": "Juniper Freight",
            "value": "56",
            "valueLabel": "Score"
          },
          {
            "title": "Applicant 30",
            "subtitle": "Maple Desk Works",
            "value": "93",
            "valueLabel": "Score"
          }
        ]
      }
    ],
    "text": [
      "Default order",
      "Applicant 01",
      "40",
      "Harbor Paper Co.",
      "Applicant 02",
      "77",
      "Cedar Office Supply",
      "Applicant 03",
      "54",
      "Pine Street Print",
      "Applicant 04",
      "91",
      "Lark Labels",
      "Applicant 05",
      "68",
      "Juniper Freight",
      "Applicant 06",
      "45",
      "Maple Desk Works",
      "Applicant 07",
      "82",
      "Harbor Paper Co.",
      "Applicant 08",
      "59",
      "Cedar Office Supply",
      "Applicant 09",
      "96",
      "Pine Street Print",
      "Applicant 10",
      "73",
      "Lark Labels",
      "Applicant 11",
      "50",
      "Juniper Freight",
      "Applicant 12",
      "87",
      "Maple Desk Works",
      "Applicant 13",
      "64",
      "Harbor Paper Co.",
      "Applicant 14",
      "41",
      "Cedar Office Supply",
      "Applicant 15",
      "78",
      "Pine Street Print",
      "Applicant 16",
      "55",
      "Lark Labels",
      "Applicant 17",
      "92",
      "Juniper Freight",
      "Applicant 18",
      "69",
      "Maple Desk Works",
      "Applicant 19",
      "46",
      "Harbor Paper Co.",
      "Applicant 20",
      "83",
      "Cedar Office Supply",
      "Applicant 21",
      "60",
      "Pine Street Print",
      "Applicant 22",
      "97",
      "Lark Labels",
      "Applicant 23",
      "74",
      "Juniper Freight",
      "Applicant 24",
      "51",
      "Maple Desk Works",
      "Applicant 25",
      "88",
      "Harbor Paper Co.",
      "Previous",
      "Page 1 of 2",
      "Next"
    ]
  },
  {
    "name": "long-table",
    "about": "A sent table of 30 rows, one column of numbers: sort and pages",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "table",
        "columns": [
          {
            "title": "Vendor"
          },
          {
            "title": "Total",
            "align": "end"
          }
        ],
        "rows": [
          {
            "cells": [
              "Harbor Paper Co. #1",
              "$12.50"
            ]
          },
          {
            "cells": [
              "Cedar Office Supply #2",
              "$65.50"
            ]
          },
          {
            "cells": [
              "Pine Street Print #3",
              "$118.50"
            ]
          },
          {
            "cells": [
              "Lark Labels #4",
              "$171.50"
            ]
          },
          {
            "cells": [
              "Juniper Freight #5",
              "$224.50"
            ]
          },
          {
            "cells": [
              "Maple Desk Works #6",
              "$277.50"
            ]
          },
          {
            "cells": [
              "Harbor Paper Co. #7",
              "$330.50"
            ]
          },
          {
            "cells": [
              "Cedar Office Supply #8",
              "$383.50"
            ]
          },
          {
            "cells": [
              "Pine Street Print #9",
              "$36.50"
            ]
          },
          {
            "cells": [
              "Lark Labels #10",
              "$89.50"
            ]
          },
          {
            "cells": [
              "Juniper Freight #11",
              "$142.50"
            ]
          },
          {
            "cells": [
              "Maple Desk Works #12",
              "$195.50"
            ]
          },
          {
            "cells": [
              "Harbor Paper Co. #13",
              "$248.50"
            ]
          },
          {
            "cells": [
              "Cedar Office Supply #14",
              "$301.50"
            ]
          },
          {
            "cells": [
              "Pine Street Print #15",
              "$354.50"
            ]
          },
          {
            "cells": [
              "Lark Labels #16",
              "$407.50"
            ]
          },
          {
            "cells": [
              "Juniper Freight #17",
              "$60.50"
            ]
          },
          {
            "cells": [
              "Maple Desk Works #18",
              "$113.50"
            ]
          },
          {
            "cells": [
              "Harbor Paper Co. #19",
              "$166.50"
            ]
          },
          {
            "cells": [
              "Cedar Office Supply #20",
              "$219.50"
            ]
          },
          {
            "cells": [
              "Pine Street Print #21",
              "$272.50"
            ]
          },
          {
            "cells": [
              "Lark Labels #22",
              "$325.50"
            ]
          },
          {
            "cells": [
              "Juniper Freight #23",
              "$378.50"
            ]
          },
          {
            "cells": [
              "Maple Desk Works #24",
              "$31.50"
            ]
          },
          {
            "cells": [
              "Harbor Paper Co. #25",
              "$84.50"
            ]
          },
          {
            "cells": [
              "Cedar Office Supply #26",
              "$137.50"
            ]
          },
          {
            "cells": [
              "Pine Street Print #27",
              "$190.50"
            ]
          },
          {
            "cells": [
              "Lark Labels #28",
              "$243.50"
            ]
          },
          {
            "cells": [
              "Juniper Freight #29",
              "$296.50"
            ]
          },
          {
            "cells": [
              "Maple Desk Works #30",
              "$349.50"
            ]
          }
        ]
      }
    ],
    "text": [
      "Default order",
      "Vendor",
      "Total",
      "Harbor Paper Co. #1",
      "$12.50",
      "Cedar Office Supply #2",
      "$65.50",
      "Pine Street Print #3",
      "$118.50",
      "Lark Labels #4",
      "$171.50",
      "Juniper Freight #5",
      "$224.50",
      "Maple Desk Works #6",
      "$277.50",
      "Harbor Paper Co. #7",
      "$330.50",
      "Cedar Office Supply #8",
      "$383.50",
      "Pine Street Print #9",
      "$36.50",
      "Lark Labels #10",
      "$89.50",
      "Juniper Freight #11",
      "$142.50",
      "Maple Desk Works #12",
      "$195.50",
      "Harbor Paper Co. #13",
      "$248.50",
      "Cedar Office Supply #14",
      "$301.50",
      "Pine Street Print #15",
      "$354.50",
      "Lark Labels #16",
      "$407.50",
      "Juniper Freight #17",
      "$60.50",
      "Maple Desk Works #18",
      "$113.50",
      "Harbor Paper Co. #19",
      "$166.50",
      "Cedar Office Supply #20",
      "$219.50",
      "Pine Street Print #21",
      "$272.50",
      "Lark Labels #22",
      "$325.50",
      "Juniper Freight #23",
      "$378.50",
      "Maple Desk Works #24",
      "$31.50",
      "Harbor Paper Co. #25",
      "$84.50",
      "Previous",
      "Page 1 of 2",
      "Next"
    ]
  },
  {
    "name": "oversize-run",
    "about": "A run still too large once its lines are dropped",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "text",
        "text": "Recorded 230 invoices.",
        "tone": "success"
      },
      {
        "type": "text",
        "text": "This is too long to show here.",
        "style": "muted"
      }
    ],
    "text": [
      "Recorded 230 invoices.",
      "This is too long to show here."
    ]
  },
  {
    "name": "ranked-runs-searchable",
    "about": "An item's runs list, with its search box",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "list",
        "searchable": true,
        "items": [
          {
            "lead": "1",
            "title": "Dana Whitfield",
            "value": "88",
            "valueLabel": "Score",
            "open": {
              "target": "run",
              "runId": "r1"
            }
          },
          {
            "lead": "2",
            "title": "Omar Reyes",
            "value": "41",
            "valueLabel": "Score",
            "open": {
              "target": "run",
              "runId": "r2"
            }
          },
          {
            "lead": "3",
            "title": "Reading…",
            "open": {
              "target": "run",
              "runId": "r3"
            }
          },
          {
            "lead": "4",
            "title": "Failed",
            "muted": true,
            "open": {
              "target": "run",
              "runId": "r4"
            }
          }
        ],
        "empty": "No candidates yet."
      }
    ],
    "text": [
      "1",
      "Dana Whitfield",
      "88",
      "2",
      "Omar Reyes",
      "41",
      "3",
      "Reading…",
      "4",
      "Failed"
    ]
  },
  {
    "name": "reviewer-candidate-grouped",
    "about": "The same candidate with the group option on: one group \"Candidate details\", its first section open",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "file",
        "title": "View resume",
        "open": {
          "target": "run-file",
          "runId": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a",
          "fileId": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c"
        },
        "file": {
          "id": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c",
          "filename": "dana-whitfield.pdf",
          "contentType": "application/pdf",
          "format": "PDF",
          "sizeBytes": 48213,
          "pages": 3
        }
      },
      {
        "type": "group",
        "title": "Candidate details",
        "sections": [
          {
            "type": "section",
            "title": "Experience",
            "open": true,
            "blocks": [
              {
                "type": "list",
                "items": [
                  {
                    "title": "Payroll Lead",
                    "subtitle": "Fernwood Foods · 2019–2025",
                    "text": "Ran payroll for 400 people."
                  }
                ]
              }
            ]
          },
          {
            "type": "section",
            "title": "Education",
            "blocks": [
              {
                "type": "list",
                "items": [
                  {
                    "title": "B.S. Accounting",
                    "url": "https://school.example.test/accounting"
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    "text": [
      "View resume",
      "Candidate details",
      "Experience",
      "Payroll Lead",
      "Fernwood Foods · 2019–2025",
      "Ran payroll for 400 people.",
      "Education"
    ]
  },
  {
    "name": "reviewer-candidate",
    "about": "A Resume Screening (candidate-reviewer v2) candidate, the group option off",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "file",
        "title": "View resume",
        "open": {
          "target": "run-file",
          "runId": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a",
          "fileId": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c"
        },
        "file": {
          "id": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c",
          "filename": "dana-whitfield.pdf",
          "contentType": "application/pdf",
          "format": "PDF",
          "sizeBytes": 48213,
          "pages": 3
        }
      },
      {
        "type": "text",
        "text": "Candidate details",
        "style": "label"
      },
      {
        "type": "section",
        "title": "Experience",
        "open": true,
        "blocks": [
          {
            "type": "list",
            "items": [
              {
                "title": "Payroll Lead",
                "subtitle": "Fernwood Foods · 2019–2025",
                "text": "Ran payroll for 400 people."
              }
            ]
          }
        ]
      },
      {
        "type": "section",
        "title": "Education",
        "blocks": [
          {
            "type": "list",
            "items": [
              {
                "title": "B.S. Accounting",
                "url": "https://school.example.test/accounting"
              }
            ]
          }
        ]
      }
    ],
    "text": [
      "View resume",
      "Candidate details",
      "Experience",
      "Payroll Lead",
      "Fernwood Foods · 2019–2025",
      "Ran payroll for 400 people.",
      "Education"
    ]
  },
  {
    "name": "reviewer-item-reading",
    "about": "A candidate-reviewer v2 item's reading, every section closed",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "section",
        "title": "Must haves",
        "blocks": [
          {
            "type": "list",
            "items": [
              {
                "title": "Three years of payroll",
                "text": "Multi-state."
              }
            ]
          }
        ]
      },
      {
        "type": "section",
        "title": "Nice to haves",
        "blocks": [
          {
            "type": "list",
            "items": [
              {
                "title": "Spreadsheet macros"
              }
            ]
          }
        ]
      }
    ],
    "text": [
      "Must haves",
      "Nice to haves"
    ]
  },
  {
    "name": "reviewer-item-scores",
    "about": "An item whose page lists scores: 3 scored runs, 1 running and 1 failed, as one bar chart",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "metric",
        "items": [
          {
            "label": "Total",
            "value": "5"
          },
          {
            "label": "Advance",
            "value": "1",
            "tone": "success"
          },
          {
            "label": "Decline",
            "value": "1",
            "tone": "error"
          }
        ]
      },
      {
        "type": "file",
        "title": "Job description",
        "open": {
          "target": "item-file",
          "itemId": "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b"
        },
        "file": {
          "id": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c",
          "filename": "payroll-analyst.pdf",
          "contentType": "application/pdf",
          "format": "PDF",
          "sizeBytes": 48213,
          "pages": 3
        }
      },
      {
        "type": "questions",
        "title": "Add candidate",
        "form": {
          "kind": "run",
          "itemId": "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b"
        }
      },
      {
        "type": "text",
        "text": "Candidates",
        "style": "label"
      },
      {
        "type": "list",
        "searchable": true,
        "items": [
          {
            "lead": "1",
            "title": "Dana Whitfield",
            "badge": {
              "text": "Advance",
              "tone": "success"
            },
            "value": "88",
            "valueLabel": "Score",
            "valueTone": "success",
            "open": {
              "target": "run",
              "runId": "s1"
            }
          },
          {
            "lead": "2",
            "title": "Mara Quinn",
            "value": "63",
            "valueLabel": "Score",
            "open": {
              "target": "run",
              "runId": "s2"
            }
          },
          {
            "lead": "3",
            "title": "Omar Reyes",
            "badge": {
              "text": "Decline",
              "tone": "error"
            },
            "value": "41",
            "valueLabel": "Score",
            "valueTone": "error",
            "open": {
              "target": "run",
              "runId": "s3"
            }
          },
          {
            "lead": "4",
            "title": "Reading…",
            "open": {
              "target": "run",
              "runId": "s4"
            }
          },
          {
            "lead": "5",
            "title": "Failed",
            "muted": true,
            "open": {
              "target": "run",
              "runId": "s5"
            }
          }
        ],
        "empty": "No candidates yet."
      },
      {
        "type": "chart",
        "kind": "bar",
        "title": "Candidates by score",
        "alt": "Candidates by score. Bar chart. Dana Whitfield: 88; Mara Quinn: 63; Omar Reyes: 41.",
        "points": [
          {
            "label": "Dana Whitfield",
            "value": 88,
            "text": "88"
          },
          {
            "label": "Mara Quinn",
            "value": 63,
            "text": "63"
          },
          {
            "label": "Omar Reyes",
            "value": 41,
            "text": "41"
          }
        ]
      }
    ],
    "text": [
      "5",
      "Total",
      "1",
      "Advance",
      "1",
      "Decline",
      "Job description",
      "Candidates",
      "1",
      "Dana Whitfield",
      "Advance",
      "88",
      "2",
      "Mara Quinn",
      "63",
      "3",
      "Omar Reyes",
      "Decline",
      "41",
      "4",
      "Reading…",
      "5",
      "Failed",
      "Candidates by score",
      "Dana Whitfield",
      "88",
      "Mara Quinn",
      "63",
      "Omar Reyes",
      "41"
    ]
  },
  {
    "name": "reviewer-item-verdicts",
    "about": "A job's rows: Advance in green, Decline in red, and no verdict plain with no chip",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "list",
        "searchable": true,
        "items": [
          {
            "lead": "1",
            "title": "Dana Whitfield",
            "badge": {
              "text": "Advance",
              "tone": "success"
            },
            "value": "88",
            "valueLabel": "Score",
            "valueTone": "success",
            "open": {
              "target": "run",
              "runId": "v1"
            }
          },
          {
            "lead": "2",
            "title": "Mara Quinn",
            "value": "63",
            "valueLabel": "Score",
            "open": {
              "target": "run",
              "runId": "v2"
            }
          },
          {
            "lead": "3",
            "title": "Omar Reyes",
            "badge": {
              "text": "Decline",
              "tone": "error"
            },
            "value": "41",
            "valueLabel": "Score",
            "valueTone": "error",
            "open": {
              "target": "run",
              "runId": "v3"
            }
          }
        ],
        "empty": "No candidates yet."
      }
    ],
    "text": [
      "1",
      "Dana Whitfield",
      "Advance",
      "88",
      "2",
      "Mara Quinn",
      "63",
      "3",
      "Omar Reyes",
      "Decline",
      "41"
    ]
  },
  {
    "name": "reviewer-item",
    "about": "A candidate-reviewer v2 item: tiles, its file, Add, its ranked runs",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "metric",
        "items": [
          {
            "label": "Total",
            "value": "3"
          },
          {
            "label": "Advance",
            "value": "1",
            "tone": "success"
          },
          {
            "label": "Decline",
            "value": "1",
            "tone": "error"
          }
        ]
      },
      {
        "type": "file",
        "title": "Job description",
        "open": {
          "target": "item-file",
          "itemId": "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b"
        },
        "file": {
          "id": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c",
          "filename": "payroll-analyst.pdf",
          "contentType": "application/pdf",
          "format": "PDF",
          "sizeBytes": 48213,
          "pages": 3
        }
      },
      {
        "type": "questions",
        "title": "Add candidate",
        "form": {
          "kind": "run",
          "itemId": "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b"
        }
      },
      {
        "type": "text",
        "text": "Candidates",
        "style": "label"
      },
      {
        "type": "list",
        "searchable": true,
        "items": [
          {
            "lead": "1",
            "title": "Dana Whitfield",
            "badge": {
              "text": "Advance",
              "tone": "success"
            },
            "value": "88",
            "valueLabel": "Score",
            "valueTone": "success",
            "open": {
              "target": "run",
              "runId": "r1"
            }
          },
          {
            "lead": "2",
            "title": "Omar Reyes",
            "badge": {
              "text": "Decline",
              "tone": "error"
            },
            "value": "41",
            "valueLabel": "Score",
            "valueTone": "error",
            "open": {
              "target": "run",
              "runId": "r2"
            }
          },
          {
            "lead": "3",
            "title": "Reading…",
            "open": {
              "target": "run",
              "runId": "r3"
            }
          },
          {
            "lead": "4",
            "title": "Failed",
            "muted": true,
            "open": {
              "target": "run",
              "runId": "r4"
            }
          }
        ],
        "empty": "No candidates yet."
      }
    ],
    "text": [
      "3",
      "Total",
      "1",
      "Advance",
      "1",
      "Decline",
      "Job description",
      "Candidates",
      "1",
      "Dana Whitfield",
      "Advance",
      "88",
      "2",
      "Omar Reyes",
      "Decline",
      "41",
      "3",
      "Reading…",
      "4",
      "Failed"
    ]
  },
  {
    "name": "reviewer-v1-item",
    "about": "A candidate-reviewer v1 item: no tiles",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "file",
        "title": "Job description",
        "open": {
          "target": "item-file",
          "itemId": "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b"
        },
        "file": {
          "id": "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c",
          "filename": "payroll-analyst.pdf",
          "contentType": "application/pdf",
          "format": "PDF",
          "sizeBytes": 48213,
          "pages": 3
        }
      },
      {
        "type": "questions",
        "title": "Add candidate",
        "form": {
          "kind": "run",
          "itemId": "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b"
        }
      },
      {
        "type": "text",
        "text": "Candidates",
        "style": "label"
      },
      {
        "type": "list",
        "searchable": true,
        "items": [
          {
            "lead": "1",
            "title": "Dana Whitfield",
            "value": "88",
            "valueLabel": "Score",
            "open": {
              "target": "run",
              "runId": "r1"
            }
          },
          {
            "lead": "2",
            "title": "Omar Reyes",
            "value": "41",
            "valueLabel": "Score",
            "open": {
              "target": "run",
              "runId": "r2"
            }
          },
          {
            "lead": "3",
            "title": "Reading…",
            "open": {
              "target": "run",
              "runId": "r3"
            }
          },
          {
            "lead": "4",
            "title": "Failed",
            "muted": true,
            "open": {
              "target": "run",
              "runId": "r4"
            }
          }
        ],
        "empty": "No candidates yet."
      }
    ],
    "text": [
      "Job description",
      "Candidates",
      "1",
      "Dana Whitfield",
      "88",
      "2",
      "Omar Reyes",
      "41",
      "3",
      "Reading…",
      "4",
      "Failed"
    ]
  },
  {
    "name": "unknown-form",
    "about": "An unknown questions form",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "questions",
        "form": {
          "kind": "survey"
        }
      }
    ],
    "text": [
      "This part can't be shown here yet."
    ]
  },
  {
    "name": "unknown-target",
    "about": "A list row whose target this build does not know: drawn, no press",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "list",
        "items": [
          {
            "title": "Opens nothing here",
            "open": {
              "target": "invoice",
              "invoiceId": "x"
            }
          }
        ]
      }
    ],
    "text": [
      "Opens nothing here"
    ]
  },
  {
    "name": "unknown-type",
    "about": "An unknown type at the top level and inside an open section",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "text",
        "text": "Before"
      },
      {
        "type": "map",
        "points": [
          1,
          2
        ]
      },
      {
        "type": "section",
        "title": "Inside",
        "open": true,
        "blocks": [
          {
            "type": "gauge",
            "value": 3
          }
        ]
      }
    ],
    "text": [
      "Before",
      "This part can't be shown here yet.",
      "Inside",
      "This part can't be shown here yet."
    ]
  },
  {
    "name": "v2-details",
    "about": "An Invoice Processing v2 run with details only",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "text",
        "text": "Saved the bill.",
        "tone": "success"
      },
      {
        "type": "text",
        "text": "Details",
        "style": "label"
      },
      {
        "type": "table",
        "columns": [
          {
            "muted": true
          },
          {}
        ],
        "rows": [
          {
            "cells": [
              "Seller",
              "Harbor Paper Co."
            ]
          },
          {
            "cells": [
              "Total",
              "$102.60"
            ]
          }
        ]
      }
    ],
    "text": [
      "Saved the bill.",
      "Details",
      "Seller",
      "Harbor Paper Co.",
      "Total",
      "$102.60"
    ]
  },
  {
    "name": "v7-failed",
    "about": "v7 failed",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "text",
        "text": "The file could not be read.",
        "tone": "error"
      }
    ],
    "text": [
      "The file could not be read."
    ]
  },
  {
    "name": "v7-held-denied",
    "about": "v7 held and denied: the waiting invoice 'Not approved'",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "text",
        "text": "Denied",
        "tone": "warning"
      },
      {
        "type": "text",
        "text": "Documents",
        "style": "label"
      },
      {
        "type": "section",
        "title": "Invoice 1 of 2",
        "subtitle": "Harbor Paper Co. · $102.60",
        "badge": {
          "text": "Recorded",
          "tone": "success"
        },
        "blocks": [
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Document type",
                  "Bill"
                ]
              }
            ]
          },
          {
            "type": "text",
            "text": "Bill · Harbor Paper Co.",
            "style": "strong"
          },
          {
            "type": "text",
            "text": "18 Dock St, Salem, OR",
            "style": "muted"
          },
          {
            "type": "text",
            "text": "Oct 14, 2026 · 2:32 PM",
            "style": "muted"
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Invoice #",
                  "HP-101"
                ]
              },
              {
                "cells": [
                  "PO number",
                  "PO-771"
                ]
              }
            ]
          },
          {
            "type": "table",
            "columns": [
              {},
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Copy paper, case",
                  "$83.00"
                ],
                "note": "2 × $41.50"
              },
              {
                "cells": [
                  "Delivery",
                  "$12.00"
                ]
              }
            ],
            "divided": true
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Subtotal",
                  "$95.00"
                ]
              },
              {
                "cells": [
                  "Tax",
                  "$7.60"
                ]
              },
              {
                "cells": [
                  "Total",
                  "$102.60"
                ],
                "strong": true
              },
              {
                "cells": [
                  "Paid",
                  "Card ending 4417"
                ]
              },
              {
                "cells": [
                  "Result",
                  "Recorded in QuickBooks: bill"
                ]
              },
              {
                "cells": [
                  "Category",
                  "Office supplies"
                ]
              }
            ],
            "divided": true
          }
        ]
      },
      {
        "type": "section",
        "title": "Invoice 2 of 2",
        "subtitle": "Harbor Paper Co. · $102.60",
        "badge": {
          "text": "Not approved",
          "tone": "neutral"
        },
        "blocks": [
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Document type",
                  "Bill"
                ]
              }
            ]
          },
          {
            "type": "text",
            "text": "Bill · Harbor Paper Co.",
            "style": "strong"
          },
          {
            "type": "text",
            "text": "18 Dock St, Salem, OR",
            "style": "muted"
          },
          {
            "type": "text",
            "text": "Oct 14, 2026 · 2:32 PM",
            "style": "muted"
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Invoice #",
                  "HP-102"
                ]
              },
              {
                "cells": [
                  "PO number",
                  "PO-772"
                ]
              }
            ]
          },
          {
            "type": "table",
            "columns": [
              {},
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Copy paper, case",
                  "$83.00"
                ],
                "note": "2 × $41.50"
              },
              {
                "cells": [
                  "Delivery",
                  "$12.00"
                ]
              }
            ],
            "divided": true
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Subtotal",
                  "$95.00"
                ]
              },
              {
                "cells": [
                  "Tax",
                  "$7.60"
                ]
              },
              {
                "cells": [
                  "Total",
                  "$102.60"
                ],
                "strong": true
              },
              {
                "cells": [
                  "Paid",
                  "Card ending 4417"
                ]
              },
              {
                "cells": [
                  "Result",
                  "Waiting for approval"
                ]
              },
              {
                "cells": [
                  "Category",
                  "Office supplies"
                ]
              }
            ],
            "divided": true
          }
        ]
      }
    ],
    "text": [
      "Denied",
      "Documents",
      "Invoice 1 of 2",
      "Harbor Paper Co. · $102.60",
      "Recorded",
      "Invoice 2 of 2",
      "Harbor Paper Co. · $102.60",
      "Not approved"
    ]
  },
  {
    "name": "v7-held-waiting",
    "about": "v7 held, its approval waiting",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "text",
        "text": "Waiting for approval.",
        "tone": "warning"
      },
      {
        "type": "questions",
        "form": {
          "kind": "approval",
          "approvalId": "0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d",
          "eligibleRoles": [
            "owner",
            "admin"
          ]
        }
      },
      {
        "type": "text",
        "text": "Documents",
        "style": "label"
      },
      {
        "type": "section",
        "title": "Invoice 1 of 2",
        "subtitle": "Harbor Paper Co. · $102.60",
        "badge": {
          "text": "Recorded",
          "tone": "success"
        },
        "blocks": [
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Document type",
                  "Bill"
                ]
              }
            ]
          },
          {
            "type": "text",
            "text": "Bill · Harbor Paper Co.",
            "style": "strong"
          },
          {
            "type": "text",
            "text": "18 Dock St, Salem, OR",
            "style": "muted"
          },
          {
            "type": "text",
            "text": "Oct 14, 2026 · 2:32 PM",
            "style": "muted"
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Invoice #",
                  "HP-101"
                ]
              },
              {
                "cells": [
                  "PO number",
                  "PO-771"
                ]
              }
            ]
          },
          {
            "type": "table",
            "columns": [
              {},
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Copy paper, case",
                  "$83.00"
                ],
                "note": "2 × $41.50"
              },
              {
                "cells": [
                  "Delivery",
                  "$12.00"
                ]
              }
            ],
            "divided": true
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Subtotal",
                  "$95.00"
                ]
              },
              {
                "cells": [
                  "Tax",
                  "$7.60"
                ]
              },
              {
                "cells": [
                  "Total",
                  "$102.60"
                ],
                "strong": true
              },
              {
                "cells": [
                  "Paid",
                  "Card ending 4417"
                ]
              },
              {
                "cells": [
                  "Result",
                  "Recorded in QuickBooks: bill"
                ]
              },
              {
                "cells": [
                  "Category",
                  "Office supplies"
                ]
              }
            ],
            "divided": true
          }
        ]
      },
      {
        "type": "section",
        "title": "Invoice 2 of 2",
        "subtitle": "Harbor Paper Co. · $102.60",
        "badge": {
          "text": "Waiting",
          "tone": "warning"
        },
        "blocks": [
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Document type",
                  "Bill"
                ]
              }
            ]
          },
          {
            "type": "text",
            "text": "Bill · Harbor Paper Co.",
            "style": "strong"
          },
          {
            "type": "text",
            "text": "18 Dock St, Salem, OR",
            "style": "muted"
          },
          {
            "type": "text",
            "text": "Oct 14, 2026 · 2:32 PM",
            "style": "muted"
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Invoice #",
                  "HP-102"
                ]
              },
              {
                "cells": [
                  "PO number",
                  "PO-772"
                ]
              }
            ]
          },
          {
            "type": "table",
            "columns": [
              {},
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Copy paper, case",
                  "$83.00"
                ],
                "note": "2 × $41.50"
              },
              {
                "cells": [
                  "Delivery",
                  "$12.00"
                ]
              }
            ],
            "divided": true
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Subtotal",
                  "$95.00"
                ]
              },
              {
                "cells": [
                  "Tax",
                  "$7.60"
                ]
              },
              {
                "cells": [
                  "Total",
                  "$102.60"
                ],
                "strong": true
              },
              {
                "cells": [
                  "Paid",
                  "Card ending 4417"
                ]
              },
              {
                "cells": [
                  "Result",
                  "Waiting for approval"
                ]
              },
              {
                "cells": [
                  "Category",
                  "Office supplies"
                ]
              }
            ],
            "divided": true
          }
        ]
      }
    ],
    "text": [
      "Waiting for approval.",
      "Documents",
      "Invoice 1 of 2",
      "Harbor Paper Co. · $102.60",
      "Recorded",
      "Invoice 2 of 2",
      "Harbor Paper Co. · $102.60",
      "Waiting"
    ]
  },
  {
    "name": "v7-recorded",
    "about": "Invoice Processing v7: three invoices recorded",
    "blockSetVersion": 2,
    "blocks": [
      {
        "type": "text",
        "text": "Recorded 3 invoices in QuickBooks.",
        "tone": "success"
      },
      {
        "type": "text",
        "text": "Documents",
        "style": "label"
      },
      {
        "type": "section",
        "title": "Invoice 1 of 3",
        "subtitle": "Harbor Paper Co. · $102.60",
        "badge": {
          "text": "Recorded",
          "tone": "success"
        },
        "blocks": [
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Document type",
                  "Bill"
                ]
              },
              {
                "cells": [
                  "Format",
                  "PDF"
                ]
              }
            ]
          },
          {
            "type": "text",
            "text": "Bill · Harbor Paper Co.",
            "style": "strong"
          },
          {
            "type": "text",
            "text": "18 Dock St, Salem, OR",
            "style": "muted"
          },
          {
            "type": "text",
            "text": "Oct 14, 2026 · 2:32 PM",
            "style": "muted"
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Invoice #",
                  "HP-101"
                ]
              },
              {
                "cells": [
                  "PO number",
                  "PO-771"
                ]
              }
            ]
          },
          {
            "type": "table",
            "columns": [
              {},
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Copy paper, case",
                  "$83.00"
                ],
                "note": "2 × $41.50"
              },
              {
                "cells": [
                  "Delivery",
                  "$12.00"
                ]
              }
            ],
            "divided": true
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Subtotal",
                  "$95.00"
                ]
              },
              {
                "cells": [
                  "Tax",
                  "$7.60"
                ]
              },
              {
                "cells": [
                  "Total",
                  "$102.60"
                ],
                "strong": true
              },
              {
                "cells": [
                  "Paid",
                  "Card ending 4417"
                ]
              },
              {
                "cells": [
                  "Result",
                  "Recorded in QuickBooks: bill"
                ]
              },
              {
                "cells": [
                  "Category",
                  "Office supplies"
                ]
              }
            ],
            "divided": true
          }
        ]
      },
      {
        "type": "section",
        "title": "Invoice 2 of 3",
        "subtitle": "Harbor Paper Co. · $102.60",
        "badge": {
          "text": "Recorded",
          "tone": "success"
        },
        "blocks": [
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Document type",
                  "Bill"
                ]
              },
              {
                "cells": [
                  "Format",
                  "PDF"
                ]
              }
            ]
          },
          {
            "type": "text",
            "text": "Bill · Harbor Paper Co.",
            "style": "strong"
          },
          {
            "type": "text",
            "text": "18 Dock St, Salem, OR",
            "style": "muted"
          },
          {
            "type": "text",
            "text": "Oct 14, 2026 · 2:32 PM",
            "style": "muted"
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Invoice #",
                  "HP-102"
                ]
              },
              {
                "cells": [
                  "PO number",
                  "PO-772"
                ]
              }
            ]
          },
          {
            "type": "table",
            "columns": [
              {},
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Copy paper, case",
                  "$83.00"
                ],
                "note": "2 × $41.50"
              },
              {
                "cells": [
                  "Delivery",
                  "$12.00"
                ]
              }
            ],
            "divided": true
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Subtotal",
                  "$95.00"
                ]
              },
              {
                "cells": [
                  "Tax",
                  "$7.60"
                ]
              },
              {
                "cells": [
                  "Total",
                  "$102.60"
                ],
                "strong": true
              },
              {
                "cells": [
                  "Paid",
                  "Card ending 4417"
                ]
              },
              {
                "cells": [
                  "Result",
                  "Recorded in QuickBooks: bill"
                ]
              },
              {
                "cells": [
                  "Category",
                  "Office supplies"
                ]
              }
            ],
            "divided": true
          }
        ]
      },
      {
        "type": "section",
        "title": "Invoice 3 of 3",
        "subtitle": "Harbor Paper Co. · $102.60",
        "badge": {
          "text": "Recorded",
          "tone": "success"
        },
        "blocks": [
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Document type",
                  "Bill"
                ]
              },
              {
                "cells": [
                  "Format",
                  "PDF"
                ]
              }
            ]
          },
          {
            "type": "text",
            "text": "Bill · Harbor Paper Co.",
            "style": "strong"
          },
          {
            "type": "text",
            "text": "18 Dock St, Salem, OR",
            "style": "muted"
          },
          {
            "type": "text",
            "text": "Oct 14, 2026 · 2:32 PM",
            "style": "muted"
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Invoice #",
                  "HP-103"
                ]
              },
              {
                "cells": [
                  "PO number",
                  "PO-773"
                ]
              }
            ]
          },
          {
            "type": "table",
            "columns": [
              {},
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Copy paper, case",
                  "$83.00"
                ],
                "note": "2 × $41.50"
              },
              {
                "cells": [
                  "Delivery",
                  "$12.00"
                ]
              }
            ],
            "divided": true
          },
          {
            "type": "text",
            "text": "More lines on the document.",
            "style": "muted"
          },
          {
            "type": "table",
            "columns": [
              {
                "muted": true
              },
              {
                "align": "end"
              }
            ],
            "rows": [
              {
                "cells": [
                  "Subtotal",
                  "$95.00"
                ]
              },
              {
                "cells": [
                  "Tax",
                  "$7.60"
                ]
              },
              {
                "cells": [
                  "Total",
                  "$102.60"
                ],
                "strong": true
              },
              {
                "cells": [
                  "Paid",
                  "Card ending 4417"
                ]
              },
              {
                "cells": [
                  "Result",
                  "Recorded in QuickBooks: bill"
                ]
              },
              {
                "cells": [
                  "Category",
                  "Office supplies"
                ]
              }
            ],
            "divided": true
          }
        ]
      }
    ],
    "text": [
      "Recorded 3 invoices in QuickBooks.",
      "Documents",
      "Invoice 1 of 3",
      "Harbor Paper Co. · $102.60",
      "Recorded",
      "Invoice 2 of 3",
      "Harbor Paper Co. · $102.60",
      "Recorded",
      "Invoice 3 of 3",
      "Harbor Paper Co. · $102.60",
      "Recorded"
    ]
  }
];
