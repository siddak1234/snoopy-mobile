import {
  BLOCK_REQUIRED,
  type BlockFieldRule,
  type BlockFieldRules,
} from '@/lib/generated/platform-contracts/block-required';

/** A value's basic type in the contract's words: `null` and an array are not objects. */
function basicType(value: unknown): BlockFieldRule['type'] | 'other' {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'other';
  const type = typeof value;
  return type === 'string' || type === 'number' || type === 'boolean' || type === 'object' ? type : 'other';
}

function firstMissing(value: Record<string, unknown>, rules: BlockFieldRules, at: string): string | null {
  for (const [name, rule] of Object.entries(rules)) {
    const path = at ? `${at}.${name}` : name;
    const field = value[name];
    if (basicType(field) !== rule.type) return path;
    if (rule.type === 'array' && rule.items) {
      const items = field as readonly unknown[];
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (basicType(item) !== 'object') return `${path}[${index}]`;
        const inner = firstMissing(item as Record<string, unknown>, rule.items, `${path}[${index}]`);
        if (inner) return inner;
      }
    }
  }
  return null;
}

/**
 * The check before a renderer runs (round 21, design D2.6): the first required
 * field a block of a known type lacks, or holds in the wrong basic type — its
 * name, `rows` or `rows[0].cells` — or null when it can be drawn. The fields
 * are the contract's (`block-required.ts`, generated from the `Block` schema),
 * none typed here. A section's own blocks are checked as each is drawn. No
 * hooks, so it answers the same anywhere it is called.
 */
export function missingField(block: { type: string }): string | null {
  const rules = Object.hasOwn(BLOCK_REQUIRED, block.type) ? BLOCK_REQUIRED[block.type] : undefined;
  return rules ? firstMissing(block as Record<string, unknown>, rules, '') : null;
}
