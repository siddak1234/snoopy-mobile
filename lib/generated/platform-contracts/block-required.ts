// From snoopy-backend docs/openapi/automations.yaml, sha256 175dd22d6a8e8482872bd594f3ffdec46fbc4fcfdae35e2e889eecf008399bf8.
// Regenerate with `npm run generate:platform-contracts`; never edit by hand.

/** A required field's basic type; its one value, where the schema gives a `const`; for an array of objects, its items' required fields. */
export type BlockFieldRule = {
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  readonly value?: string | number | boolean;
  readonly items?: BlockFieldRules;
};
export type BlockFieldRules = { readonly [field: string]: BlockFieldRule };

/** Each block type's required fields but `type`, from the contract's `Block` schema (the check before drawing). */
export const BLOCK_REQUIRED: { readonly [type: string]: BlockFieldRules } = {
  "text": {
    "text": {
      "type": "string"
    }
  },
  "metric": {
    "items": {
      "type": "array",
      "items": {
        "label": {
          "type": "string"
        },
        "value": {
          "type": "string"
        }
      }
    }
  },
  "badge": {
    "text": {
      "type": "string"
    }
  },
  "table": {
    "columns": {
      "type": "array",
      "items": {}
    },
    "rows": {
      "type": "array",
      "items": {
        "cells": {
          "type": "array"
        }
      }
    }
  },
  "list": {
    "items": {
      "type": "array",
      "items": {
        "title": {
          "type": "string"
        }
      }
    }
  },
  "section": {
    "title": {
      "type": "string"
    },
    "blocks": {
      "type": "array"
    }
  },
  "file": {
    "title": {
      "type": "string"
    },
    "open": {
      "type": "object"
    }
  },
  "link": {
    "title": {
      "type": "string"
    },
    "url": {
      "type": "string"
    }
  },
  "timeline": {
    "items": {
      "type": "array",
      "items": {
        "title": {
          "type": "string"
        },
        "state": {
          "type": "string"
        }
      }
    }
  },
  "questions": {
    "form": {
      "type": "object"
    }
  },
  "image": {
    "alt": {
      "type": "string"
    },
    "open": {
      "type": "object"
    },
    "file": {
      "type": "object"
    }
  },
  "chart": {
    "kind": {
      "type": "string"
    },
    "title": {
      "type": "string"
    },
    "alt": {
      "type": "string"
    },
    "points": {
      "type": "array",
      "items": {
        "label": {
          "type": "string"
        },
        "value": {
          "type": "number"
        },
        "text": {
          "type": "string"
        }
      }
    }
  },
  "group": {
    "title": {
      "type": "string"
    },
    "sections": {
      "type": "array",
      "items": {
        "type": {
          "type": "string",
          "value": "section"
        },
        "title": {
          "type": "string"
        },
        "blocks": {
          "type": "array"
        }
      }
    }
  }
};
