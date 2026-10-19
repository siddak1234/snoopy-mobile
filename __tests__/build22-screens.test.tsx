import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import RunDetailScreen from '@/app/(tabs)/(home)/run';
import ActivityScreen from '@/app/(tabs)/activity/index';
import WorkflowDetailScreen from '@/app/(tabs)/flows/detail';
import FlowEmailScreen from '@/app/(tabs)/flows/email';
import FlowsScreen from '@/app/(tabs)/flows/index';
import type { Subscription } from '@/lib/platform/automations';
import type { Connection } from '@/lib/platform/catalog';
import { PlatformError } from '@/lib/platform/problem';
import { resetSnapshot } from '@/lib/platform/snapshot';
import { timeOfDay } from '@/lib/view/format';
import { resetPushForTests } from '@/hooks/use-push-registration';
import { fakePlatform, type Answer } from '@/test/fake-platform';
import {
  TEST_WORKSPACE,
  invoiceProcessingV4Entry,
  planSubscriptionsPayload,
  providersWithQuickBooks,
  recipientsPayload,
  routePlatform,
  runDetailPayload,
  sessionAs,
  signedInSession,
} from '@/test/platform';
import { mockRouter, renderWithProviders, setMockParams } from '@/test/render';

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn(() => 'key'),
}));

const { platformOperation } = jest.requireMock('@/lib/platform/client');

/**
 * Build 22 (Round 17, 2026-10-17), the app's screens — the owner's seven
 * TestFlight items on build 21 (14:30–14:39Z) and the session's D1–D6, which he
 * approved with "continue and complete. parallel if you can" (21:12Z):
 *
 * - F1–F3: Flows and Activity open on one title row — the title, Home's two
 *   scope circles beside it, then the page's own controls — at the same height
 *   on both ("Symmetry and standard"); Archived is its icon alone when the row
 *   has no room for its word (the session's S26).
 * - P1–P4: the flow page's five steps, titles only — "1 · Upload invoice", "2 ·
 *   Connect integration" with the integration, "3 · AI processing", "4 ·
 *   QuickBooks updated" or "Details saved", "5 · Email sent" with who gets it —
 *   no CONNECTIONS, no move.
 * - P5: Who gets the email — the owners and admins and the person who starts
 *   the run always (D1), and the addresses an owner or admin adds, each saved
 *   at once (S30).
 * - The run page's steps 2, 4 and 5 (S23, S24).
 *
 * Every address here is an example.com one: never a real person's in a public repository.
 */

const FLOWS = '/v1/workspaces/{workspaceId}/subscriptions';
const RECIPIENTS = '/v1/workspaces/{workspaceId}/subscriptions/{subscriptionId}/email-recipients';

beforeEach(() => {
  platformOperation.mockReset();
  resetSnapshot();
  resetPushForTests();
});

/** Invoice Processing v4, added and live, holding `vendor`. */
function added(vendor: string, overrides: Partial<Subscription> = {}): Subscription {
  return {
    ...planSubscriptionsPayload().subscriptions[0]!,
    id: 'ip-1',
    templateId: 'invoice-processing',
    templateVersion: 4,
    status: 'live',
    config: { vendor, holdAboveAmount: 500 },
    unmetConnections: [],
    setup: invoiceProcessingV4Entry().setup,
    runInput: [{ key: 'invoiceFile', title: 'Document', description: 'A PDF or photo of bills or receipts.', control: 'artifact', required: false }],
    projectId: null,
    ...overrides,
  };
}

const QUICKBOOKS: Connection = {
  id: 'c-qb',
  providerId: 'quickbooks',
  workspaceId: TEST_WORKSPACE,
  externalAccount: { id: 'realm-1', displayName: 'books@example.com' },
  status: 'connected',
  requiredScopes: [],
  grantedScopes: [],
  usedByCount: 1,
};

/** The flow page for `subscription`, every read answered; `recipients` answers step 5's (or refuses it). */
async function openFlow(
  subscription: Subscription,
  options: { recipients?: () => Answer<`GET ${typeof RECIPIENTS}`>; archived?: boolean } = {},
) {
  const fake = fakePlatform(platformOperation);
  fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [invoiceProcessingV4Entry()], categories: ['All', 'Accounting'] });
  fake.always(`GET ${FLOWS}`, (sent) =>
    sent.query?.status === 'archived'
      ? { subscriptions: options.archived ? [subscription] : [] }
      : { subscriptions: options.archived ? [] : [subscription] },
  );
  fake.always('GET /v1/workspaces/{workspaceId}/run-stats', { workspace: counts(), subscriptions: [{ subscriptionId: 'ip-1', ...counts() }] });
  fake.always('GET /v1/connections/providers', providersWithQuickBooks());
  fake.always('GET /v1/workspaces/{workspaceId}/projects', { projects: [] });
  fake.always('GET /v1/workspaces/{workspaceId}/connections', { connections: [QUICKBOOKS] });
  fake.always(`GET ${RECIPIENTS}`, options.recipients ?? recipientsPayload());
  setMockParams({ flow: subscription.id });
  const view = await renderWithProviders(<WorkflowDetailScreen />, signedInSession);
  return { fake, view };
}

function counts() {
  return { total: 2, pending: 0, running: 0, held: 0, succeeded: 2, failed: 0, cancelled: 0 };
}

/** The step titles on the flow page, in order. */
const stepTitles = () =>
  within(screen.getByTestId('flow-steps'))
    .getAllByText(/^\d · /u)
    .map((node) => node.props.children);

/* ───────────────────────────── F1–F3: the title rows ───────────────────────────── */

const layout = async (testID: string, width: number) =>
  fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 38 } } });

describe('Flows and Activity: one title row — the title left, the circles and the page\'s controls right (round 23, A1; Build 22, F1–F3)', () => {
  beforeEach(() => routePlatform(platformOperation));

  it('Flows: the title first, then on the right the two circles, Archived (a circle) and New — no pills above it', async () => {
    await renderWithProviders(<FlowsScreen />, signedInSession);
    const row = await screen.findByTestId('title-row');
    expect(within(row).getByText('Flows')).toBeTruthy();
    expect(row.children[0]).toBe(screen.getByTestId('title-row-title'));
    const right = within(screen.getByTestId('title-row-right'));
    // The circles are inside the right group, before the page's controls.
    const circles = within(screen.getByTestId('title-row-scope'));
    expect(right.getByTestId('title-row-scope')).toBeTruthy();
    expect(circles.getByLabelText('Workspace: Acme Operations').props.testID).toBe('title-scope-workspace');
    expect(circles.getByLabelText('Department: All departments').props.testID).toBe('title-scope-team');
    const order = right.getAllByTestId(/^(title-scope-workspace|title-scope-team|flows-archived|flows-new)$/u);
    expect(order.map((node) => node.props.testID)).toEqual(['title-scope-workspace', 'title-scope-team', 'flows-archived', 'flows-new']);
    expect(right.getByLabelText('Archived').props.testID).toBe('flows-archived');
    expect(right.queryByText('Archived')).toBeNull();
    expect(right.getByText('New')).toBeTruthy();
    expect(screen.queryByTestId('scope-control')).toBeNull();
    expect(screen.queryByText('All departments')).toBeNull();
  });

  it('Activity: the title first, then on the right the two circles and All time — no pills above it', async () => {
    await renderWithProviders(<ActivityScreen />, signedInSession);
    const row = await screen.findByTestId('title-row');
    expect(within(row).getByText('Activity')).toBeTruthy();
    expect(row.children[0]).toBe(screen.getByTestId('title-row-title'));
    const right = within(screen.getByTestId('title-row-right'));
    expect(within(screen.getByTestId('title-row-scope')).getByLabelText('Department: All departments')).toBeTruthy();
    const order = right.getAllByTestId(/^(title-scope-workspace|title-scope-team|activity-range)$/u);
    expect(order.map((node) => node.props.testID)).toEqual(['title-scope-workspace', 'title-scope-team', 'activity-range']);
    expect(right.getByLabelText('Time range: All time')).toBeTruthy();
    expect(screen.queryByTestId('scope-control')).toBeNull();
  });

  it('Archived is its circle at every width — no "Archived" word in the row at 420, 375 or 320 pt — and the circle opens the page', async () => {
    await renderWithProviders(<FlowsScreen />, signedInSession);
    await screen.findByTestId('title-row');
    await layout('title-row-title', 79);
    await layout('title-row-controls', 98);
    for (const width of [380, 335, 280]) {
      await layout('title-row', width);
      expect(within(screen.getByTestId('title-row')).queryByText('Archived')).toBeNull();
      const circle = screen.getByLabelText('Archived');
      expect(circle.props.accessibilityRole).toBe('button');
      expect(StyleSheet.flatten(circle.parent!.props.style)).toMatchObject({ width: 38, height: 38, borderRadius: 999, borderWidth: 1 });
    }
    await fireEvent.press(screen.getByLabelText('Archived'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/archived');
  });

  it('a 320-pt phone (280 inside the margins): the title, the two circles, Archived and New still on the one line — New its accent circle, the same press', async () => {
    await renderWithProviders(<FlowsScreen />, signedInSession);
    await screen.findByTestId('title-row');
    const accent = StyleSheet.flatten(screen.getByTestId('flows-new').props.style).borderColor;
    // Inter's widths: "Flows" 79; Archived's circle and New's pill 124 (38 + 8 + 78); both circles 84.
    await layout('title-row-title', 79);
    await layout('title-row-controls', 124);
    await layout('title-row', 335);
    expect(within(screen.getByTestId('title-row-right')).getByText('New')).toBeTruthy();
    await layout('title-row', 280);
    await layout('title-row-controls', 84);
    expect(screen.queryByText('New')).toBeNull();
    const right = within(screen.getByTestId('title-row-right'));
    const add = right.getByLabelText('New');
    expect(add.props.testID).toBe('flows-new');
    expect(add.props.accessibilityRole).toBe('button');
    // New's accent, as its pill: the ring around the circle, and the glyph in it.
    const ring = StyleSheet.flatten(add.parent!.props.style);
    expect(ring).toMatchObject({ width: 38, height: 38, borderRadius: 999, borderWidth: 1 });
    expect(ring.borderColor).toBe(accent);
    expect(ring.borderColor).not.toBe(StyleSheet.flatten(screen.getByTestId('title-scope-team').parent!.props.style).borderColor);
    // Everything fits: the title, 8, the circles (84), 8, Archived's circle, 8, New's circle.
    expect(79 + 8 + 84 + 8 + 38 + 8 + 38).toBeLessThanOrEqual(280);
    await fireEvent.press(add);
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/flows/add');

    // A 375-pt phone again: New its word.
    await layout('title-row', 335);
    expect(within(screen.getByTestId('title-row-right')).getByText('New')).toBeTruthy();
  });

  it('Activity on a 320-pt phone: the time range is its calendar alone in a circle, read aloud and opening the same drop-down', async () => {
    await renderWithProviders(<ActivityScreen />, signedInSession);
    await screen.findByTestId('title-row');
    // "Activity" 102; All time 118 — 102 + 8 + 84 + 8 + 118 = 320, over the 280 a 320-pt phone leaves.
    await layout('title-row-title', 102);
    await layout('title-row-controls', 118);
    await layout('title-row', 335);
    expect(within(screen.getByTestId('title-row-right')).getByText('All time')).toBeTruthy();
    await layout('title-row', 280);
    expect(screen.queryByText('All time')).toBeNull();
    const range = within(screen.getByTestId('title-row-right')).getByLabelText('Time range: All time');
    expect(range.props.testID).toBe('activity-range');
    expect(StyleSheet.flatten(range.parent!.props.style)).toMatchObject({ width: 38, height: 38, borderRadius: 999 });
    await fireEvent.press(range);
    expect(screen.getByTestId('activity-range-menu')).toBeTruthy();
  });

  it('the circles sit at the same height on both: the same row, 38 tall and centred, first under the same top padding', async () => {
    /** The first test id in reading order, and the top padding of what holds the row. */
    const firstTestID = (node: unknown): string | null => {
      if (!node || typeof node !== 'object') return null;
      if (Array.isArray(node)) {
        for (const child of node) {
          const found = firstTestID(child);
          if (found) return found;
        }
        return null;
      }
      const { props, children } = node as { props?: { testID?: unknown }; children?: unknown[] | null };
      if (typeof props?.testID === 'string') return props.testID;
      return firstTestID(children ?? null);
    };
    const place = async (Screen: React.ComponentType) => {
      const view = await renderWithProviders(<Screen />, signedInSession);
      const row = await screen.findByTestId('title-row');
      // The scroll view's content container: its own style, or the scroll view's `contentContainerStyle`.
      const topOf = (node: { props: { style?: unknown; contentContainerStyle?: unknown } }) =>
        StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)?.paddingTop ??
        StyleSheet.flatten(node.props.contentContainerStyle as StyleProp<ViewStyle>)?.paddingTop;
      let holder = row.parent;
      while (holder && topOf(holder) === undefined) holder = holder.parent;
      const found = {
        row: StyleSheet.flatten(row.props.style),
        top: holder ? topOf(holder) : null,
        first: firstTestID(view.toJSON()) === 'title-row',
      };
      await view.unmount();
      return found;
    };
    const flows = await place(FlowsScreen);
    const activity = await place(ActivityScreen);
    expect(flows.row).toMatchObject({ height: 38, flexDirection: 'row', alignItems: 'center' });
    expect(activity.row).toEqual(flows.row);
    expect(flows.top).toEqual(expect.any(Number));
    expect(activity.top).toBe(flows.top);
    expect([flows.first, activity.first]).toEqual([true, true]);
  });
});

/* ───────────────────────────── P1–P4: the flow page ───────────────────────────── */

describe('the flow page: five steps, titles only (P1–P4)', () => {
  it('QuickBooks: 1 · Upload invoice, 2 · Connect integration, 3 · AI processing, 4 · QuickBooks updated, 5 · Email sent', async () => {
    await openFlow(added('quickbooks'));
    expect(await screen.findByTestId('flow-email')).toBeTruthy();
    expect(stepTitles()).toEqual([
      '1 · Upload invoice',
      '2 · Connect integration',
      '3 · AI processing',
      '4 · QuickBooks updated',
      '5 · Email sent',
    ]);
    // Step 2 holds the integration: its name and its state; it opens the choices.
    const integration = within(screen.getByTestId('flow-step-connect'));
    expect(integration.getByText('QuickBooks Online')).toBeTruthy();
    expect(integration.getByText('Connected')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('flow-vendor-vendor'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/flows/vendor', params: { flow: 'ip-1', field: 'vendor' } });
  });

  it('None: step 4 is Details saved, and step 2 says None', async () => {
    await openFlow(added('none'));
    expect(await screen.findByTestId('flow-email')).toBeTruthy();
    expect(stepTitles()[3]).toBe('4 · Details saved');
    const integration = within(screen.getByTestId('flow-step-connect'));
    expect(integration.getByText('None')).toBeTruthy();
    expect(integration.getByText('Save the details only.')).toBeTruthy();
  });

  it('nothing between step 4\'s title and step 5 — no QuickBooks row, no line — and step 3 holds nothing either', async () => {
    await openFlow(added('quickbooks'));
    await screen.findByTestId('flow-email');
    for (const [id, title] of [
      ['record', '4 · QuickBooks updated'],
      ['process', '3 · AI processing'],
    ] as const) {
      const step = within(screen.getByTestId(`flow-step-${id}`));
      expect(step.getAllByText(/./u).map((node) => node.props.children)).toEqual([title]);
      expect(step.queryByTestId('flow-vendor-vendor')).toBeNull();
    }
  });

  it('no CONNECTIONS and no move anywhere on the page', async () => {
    await openFlow(added('quickbooks'));
    await screen.findByTestId('flow-email');
    for (const gone of ['CONNECTIONS', 'Connections', 'Disconnect']) expect([gone, screen.queryByText(gone) !== null]).toEqual([gone, false]);
    expect(screen.queryByText(/Move to v/u)).toBeNull();
    expect(screen.queryByText(/is available/u)).toBeNull();
  });

  it('step 5: the first address and "and 2 more"; it opens Who gets the email for this flow', async () => {
    const { fake } = await openFlow(added('quickbooks'));
    const row = await screen.findByTestId('flow-email');
    expect(within(row).getByText('owner@example.com')).toBeTruthy();
    expect(within(row).getByText('and 2 more')).toBeTruthy();
    expect(within(row).getByTestId(/^phosphor-react-native-envelope-simple-/u).props.width).toBe(24);
    expect(fake.to(`GET ${RECIPIENTS}`)[0]!.values).toEqual({ workspaceId: TEST_WORKSPACE, subscriptionId: 'ip-1' });
    await fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/flows/email', params: { flow: 'ip-1' } });
  });

  it('step 5 unread says Unavailable — the page still shows — and still opens the screen', async () => {
    await openFlow(added('none'), {
      recipients: () => {
        throw new PlatformError('Service Unavailable', 503);
      },
    });
    const row = await screen.findByTestId('flow-email');
    await waitFor(() => expect(within(row).getByText('Unavailable')).toBeTruthy());
    expect(stepTitles()).toHaveLength(5);
    await fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/(tabs)/flows/email', params: { flow: 'ip-1' } });
  });

  it('an archived flow: step 2\'s row and step 5\'s title, neither a button — and no addresses read', async () => {
    const { fake } = await openFlow(added('quickbooks', { status: 'archived', updatedAt: '2026-10-16T12:00:00Z' }), { archived: true });
    expect(await screen.findByText('Archived')).toBeTruthy();
    expect(stepTitles()).toContain('5 · Email sent');
    expect(screen.queryByTestId('flow-email')).toBeNull();
    const integration = screen.getByTestId('flow-vendor-vendor');
    expect(integration.props.accessibilityRole).toBeUndefined();
    expect(within(integration).queryByTestId(/^phosphor-react-native-caret-right-/u)).toBeNull();
    expect(fake.to(`GET ${RECIPIENTS}`)).toEqual([]);
  });

  it('an archived flow from before v4: no steps — never the catalog\'s internal steps by title (S34)', async () => {
    await openFlow(added('quickbooks', { status: 'archived', templateVersion: 3, updatedAt: '2026-10-16T12:00:00Z' }), { archived: true });
    expect(await screen.findByText('Archived')).toBeTruthy();
    expect(screen.queryByTestId('flow-steps')).toBeNull();
    expect(screen.queryByText('Documents read')).toBeNull();
  });

  it('the integration row is read aloud as the integration, the word step 2 uses (S21)', async () => {
    await openFlow(added('quickbooks'));
    expect(await screen.findByLabelText('QuickBooks Online: change the integration')).toBeTruthy();
  });
});

/* ───────────────────────────── P5: who gets the email ───────────────────────────── */

describe('Who gets the email (P5; D1, S30)', () => {
  /** The screen for `ip-1`; PUT answers with what it was sent, or as `put` says. */
  async function openEmail(
    options: { recipients?: Answer<`GET ${typeof RECIPIENTS}`>; role?: 'owner' | 'admin' | 'member'; put?: (extra: string[]) => unknown } = {},
  ) {
    const fake = fakePlatform(platformOperation);
    const recipients = options.recipients ?? recipientsPayload();
    fake.always(`GET ${RECIPIENTS}`, recipients);
    fake.always(`GET ${FLOWS}`, { subscriptions: [added('none')] });
    fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [invoiceProcessingV4Entry()], categories: ['All'] });
    fake.always(`PUT ${RECIPIENTS}`, (sent) => {
      const extra = (sent.body as { extra: string[] }).extra;
      return (options.put ? options.put(extra) : { ...recipients, extra }) as Answer<`PUT ${typeof RECIPIENTS}`>;
    });
    setMockParams({ flow: 'ip-1' });
    const view = await renderWithProviders(<FlowEmailScreen />, sessionAs(options.role ?? 'owner'));
    return { fake, view };
  }
  const puts = (fake: ReturnType<typeof fakePlatform>) => fake.to(`PUT ${RECIPIENTS}`).map((sent) => sent.body);
  const lines = (testID: string) =>
    within(screen.getByTestId(testID))
      .getAllByText(/./u)
      .map((node) => node.props.children);

  it('says who always gets it — the owners and admins, then the person who starts the run — and the extra addresses, for this flow', async () => {
    await openEmail();
    expect(await screen.findByText('Who gets the email')).toBeTruthy();
    expect(screen.getByText('For Invoice Processing')).toBeTruthy();
    expect(lines('email-always')).toEqual([
      'ALWAYS',
      'owner@example.com',
      'Owner',
      'admin@example.com',
      'Admin',
      'The person who starts the run',
    ]);
    expect(lines('email-also')).toEqual(['ALSO SEND TO', 'ap@example.com', 'Add']);
    expect(screen.getByLabelText('Remove ap@example.com')).toBeTruthy();
    expect(screen.getByPlaceholderText('Email address').props.keyboardType).toBe('email-address');
    expect(screen.getByPlaceholderText('Email address').props.autoCapitalize).toBe('none');
  });

  it('a member sees the list and no way to change it: no X, no field — "Ask an owner or admin to change this."', async () => {
    await openEmail({ role: 'member', recipients: recipientsPayload({ canEdit: false }) });
    expect(await screen.findByText('Ask an owner or admin to change this.')).toBeTruthy();
    expect(screen.getByText('ap@example.com')).toBeTruthy();
    expect(screen.queryByLabelText('Remove ap@example.com')).toBeNull();
    expect(screen.queryByPlaceholderText('Email address')).toBeNull();
    expect(screen.queryByText('Add')).toBeNull();
  });

  it('the field is seen when the keyboard opens, and said aloud once it holds an address (the Build 22 review)', async () => {
    await openEmail();
    const field = await screen.findByPlaceholderText('Email address');
    // The page makes room for the keyboard and brings the focused field into view (iOS).
    expect(screen.getByTestId('email-screen').props.automaticallyAdjustKeyboardInsets).toBe(true);
    await fireEvent.changeText(field, 'bookkeeper@example.com');
    expect(screen.getByLabelText('Email address').props.value).toBe('bookkeeper@example.com');
  });

  it('no extra address: a None row', async () => {
    await openEmail({ recipients: recipientsPayload({ extra: [] }) });
    expect(await screen.findByTestId('email-extra-none')).toBeTruthy();
    expect(lines('email-extra-none')).toEqual(['None']);
  });

  it('Add sends the whole list once and shows the answer', async () => {
    const { fake } = await openEmail();
    await fireEvent.changeText(await screen.findByPlaceholderText('Email address'), '  bookkeeper@example.com ');
    await fireEvent.press(screen.getByText('Add'));
    expect(await screen.findByText('bookkeeper@example.com')).toBeTruthy();
    expect(puts(fake)).toEqual([{ extra: ['ap@example.com', 'bookkeeper@example.com'] }]);
    expect(fake.to(`PUT ${RECIPIENTS}`)[0]!.key).toBeUndefined();
    expect(screen.getByPlaceholderText('Email address').props.value).toBe('');
  });

  it.each([
    ['Owner@Example.com', 'Already on the list.'],
    ['AP@example.com', 'Already on the list.'],
    ['bookkeeper', 'Enter an email address.'],
    ['', 'Enter an email address.'],
  ])('Add %j says "%s" and sends nothing', async (address, words) => {
    const { fake } = await openEmail();
    await fireEvent.changeText(await screen.findByPlaceholderText('Email address'), address);
    await fireEvent.press(screen.getByText('Add'));
    expect(screen.getByTestId('email-error').props.children).toBe(words);
    expect(puts(fake)).toEqual([]);
  });

  it('at ten the field gives way to "You can add up to 10."', async () => {
    const ten = Array.from({ length: 10 }, (_, n) => `ap${n}@example.com`);
    await openEmail({ recipients: recipientsPayload({ extra: ten }) });
    expect(await screen.findByText('You can add up to 10.')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Email address')).toBeNull();
    expect(screen.getAllByLabelText(/^Remove /u)).toHaveLength(10);
  });

  it('X removes the address at once — one PUT without it, "Removing…" meanwhile, no question', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const { fake } = await openEmail({
      recipients: recipientsPayload({ extra: ['ap@example.com', 'tax@example.com'] }),
      put: (extra) => new Promise((resolve) => (answer = () => resolve({ ...recipientsPayload(), extra }))),
    });
    await fireEvent.press(await screen.findByLabelText('Remove ap@example.com'));
    expect(within(screen.getByTestId('email-extra-ap@example.com')).getByText('Removing…')).toBeTruthy();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    answer(undefined);
    await waitFor(() => expect(screen.queryByText('ap@example.com')).toBeNull());
    expect(screen.getByText('tax@example.com')).toBeTruthy();
    expect(puts(fake)).toEqual([{ extra: ['tax@example.com'] }]);
  });

  it('a refusal or a failure says "Could not save. Try again." and keeps the list as it was', async () => {
    const { fake } = await openEmail({
      put: () => {
        throw new PlatformError('Forbidden', 403, 'FORBIDDEN', { requiredRole: 'admin' });
      },
    });
    await fireEvent.press(await screen.findByLabelText('Remove ap@example.com'));
    expect(await screen.findByText('Could not save. Try again.')).toBeTruthy();
    expect(screen.getByText('ap@example.com')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'bookkeeper@example.com');
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() => expect(puts(fake)).toHaveLength(2));
    expect(await screen.findByText('Could not save. Try again.')).toBeTruthy();
    expect(screen.queryByText('bookkeeper@example.com')).toBeNull();
  });

  it('Back goes back', async () => {
    await openEmail();
    await screen.findByText('Who gets the email');
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

/* ───────────────────────────── the run page ───────────────────────────── */

describe("a v4 run's page: steps 2, 4 and 5 (S23–S25)", () => {
  type Detail = Answer<'GET /v1/workspaces/{workspaceId}/runs/{runId}'>;
  const RUN = '0b9b7c4e-1d2a-4f3b-9c8d-7e6f5a4b3c2d';
  const SENT = '2026-10-17T21:34:00.000Z';

  function openRun(status: Detail['run']['status'], stepIds: string[], email: Detail['email'], vendor = 'quickbooks', version = 4) {
    const base = runDetailPayload('run-1');
    const detail: Detail = {
      ...base,
      run: { ...base.run, id: RUN, subscriptionId: 'ip-1', templateId: 'invoice-processing', templateVersion: version, status },
      steps: stepIds.map((stepId, n) => ({
        id: `s${n}`,
        runId: RUN,
        workspaceId: TEST_WORKSPACE,
        stepId,
        outcome: 'ok' as const,
        summary: stepId,
        occurredAt: new Date(Date.UTC(2026, 9, 17, 21, n)).toISOString(),
      })),
      ...(email ? { email } : {}),
    };
    const fake = fakePlatform(platformOperation);
    fake.always('GET /v1/workspaces/{workspaceId}/runs/{runId}', detail);
    fake.always('GET /v1/workspaces/{workspaceId}/automations', { automations: [invoiceProcessingV4Entry()], categories: ['All'] });
    fake.always('GET /v1/workspaces/{workspaceId}/approvals', { approvals: [] });
    fake.always(`GET ${FLOWS}`, (sent) => ({ subscriptions: sent.query?.status === 'archived' ? [] : [added(vendor)] }));
    setMockParams({ runId: RUN });
    return renderWithProviders(<RunDetailScreen />, signedInSession);
  }
  const step = (id: string) =>
    within(screen.getByTestId(`run-step-group:${id}`))
      .getAllByText(/./u)
      .map((node) => node.props.children);
  const stepsDone = () => within(screen.getByText('Steps done').parent!).getAllByText(/\//u)[0]!.props.children;

  it('succeeded and emailed: step 2 the integration, 4 QuickBooks updated, 5 "Email sent · {time}" — 5 / 5', async () => {
    const all = invoiceProcessingV4Entry().pipeline.map((declared) => declared.id);
    await openRun('succeeded', all, { status: 'sent', sentAt: SENT });
    expect(await screen.findByTestId('run-step-group:email')).toBeTruthy();
    expect(step('connect')).toEqual(['2 · Connect integration', 'QuickBooks Online']);
    expect(step('record')[0]).toBe('4 · QuickBooks updated');
    expect(step('email')).toEqual(['5 · Email sent', `Email sent · ${timeOfDay(SENT)}`]);
    expect(stepsDone()).toBe('5 / 5');
  });

  it('succeeded, its email owed: "Sending email…" — the run completed, 5 / 5 (round 23, A7); None says None and Details saved', async () => {
    const all = invoiceProcessingV4Entry().pipeline.map((declared) => declared.id);
    await openRun('succeeded', all, { status: 'waiting', sentAt: null }, 'none');
    expect(await screen.findByTestId('run-step-group:email')).toBeTruthy();
    expect(step('connect')).toEqual(['2 · Connect integration', 'None']);
    expect(step('record')[0]).toBe('4 · Details saved');
    expect(step('email')).toEqual(['5 · Email sent', 'Sending email…']);
    expect(stepsDone()).toBe('5 / 5');
  });

  it('running: 5 Waiting; cancelled: 5 Stopped', async () => {
    const running = await openRun('running', ['receive'], { status: 'waiting', sentAt: null });
    expect(await screen.findByTestId('run-step-group:email')).toBeTruthy();
    expect(step('email')).toEqual(['5 · Email sent', 'Waiting']);
    expect(step('process')).toEqual(['3 · AI processing', 'Working…']);
    await running.unmount();
    resetSnapshot();
    await openRun('cancelled', ['receive'], { status: 'not_sent', sentAt: null });
    expect(await screen.findByTestId('run-step-group:email')).toBeTruthy();
    expect(step('email')).toEqual(['5 · Email sent', 'Stopped']);
  });

  it('a v3 run (all its steps still declared) is drawn by the five steps — the version gate gone (S25)', async () => {
    await openRun('running', ['receive', 'extract'], undefined, 'none', 3);
    expect(await screen.findByTestId('run-step-group:upload')).toBeTruthy();
    expect(screen.getAllByTestId(/^run-step-group:/u).map((node) => node.props.testID)).toEqual([
      'run-step-group:upload',
      'run-step-group:connect',
      'run-step-group:process',
      'run-step-group:record',
      'run-step-group:email',
    ]);
  });
});
