// From snoopy-backend packages/contracts/fixtures/blocks/*.json, sha256 63b316782e438803a2ea5a3bf52f3fd2f8a50189d40b70294b3893b27b7e3b7d.
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
    "name": "emitted-all-nine",
    "about": "A run that sent one of each of the nine sendable types",
    "blockSetVersion": 1,
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
    "blockSetVersion": 1,
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
    "name": "oversize-run",
    "about": "A run still too large once its lines are dropped",
    "blockSetVersion": 1,
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
    "name": "reviewer-candidate",
    "about": "A Resume Screening (candidate-reviewer v2) candidate",
    "blockSetVersion": 1,
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
    "blockSetVersion": 1,
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
    "name": "reviewer-item",
    "about": "A candidate-reviewer v2 item: tiles, its file, Add, its ranked runs",
    "blockSetVersion": 1,
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
    "name": "reviewer-v1-item",
    "about": "A candidate-reviewer v1 item: no tiles",
    "blockSetVersion": 1,
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
    "blockSetVersion": 1,
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
    "blockSetVersion": 1,
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
    "blockSetVersion": 1,
    "blocks": [
      {
        "type": "text",
        "text": "Before"
      },
      {
        "type": "chart",
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
    "blockSetVersion": 1,
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
    "blockSetVersion": 1,
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
    "blockSetVersion": 1,
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
    "blockSetVersion": 1,
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
    "blockSetVersion": 1,
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
