import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Sparkle } from 'phosphor-react-native';
import React from 'react';
import { Linking, Platform } from 'react-native';

import SolutionsScreen from '@/app/(tabs)/flows/add';
import { unknownContact } from '@/components/blocks/contact-text';
import { contactValue, dialable } from '@/lib/view/contact-value';
import { ALL_DEPARTMENTS, homeDepartmentChoices, homeFlowsShown, newestReadyItem, type HomeFlow } from '@/lib/view/home';
import { iconFor } from '@/lib/view/icon-registry';
import { runFace, startedRunState } from '@/lib/view/runs';
import { renderBlocks } from '@/test/blocks';
import { catalogPayload, routePlatform, signedInSession } from '@/test/platform';
import { renderWithProviders } from '@/test/render';

/**
 * The owner's TestFlight items of builds 37 and 39 (2026-11-06), the parts no
 * screen suite holds: a phone number or email in a list row (item 11), the
 * run page's two faces and where a started run opens (item 10), Home's
 * department, search and newest-ready rules (items 5 and 8), Add a flow's card
 * (items 1 and 4), and the catalog's "Sparkles" (plan 1).
 */

jest.mock('@/lib/platform/client', () => ({
  platformOperation: jest.fn(),
  newIdempotencyKey: jest.fn((prefix: string) => `${prefix}-key`),
}));
const { platformOperation } = jest.requireMock('@/lib/platform/client');
const Contacts = jest.requireMock('expo-contacts/legacy') as { presentFormAsync: jest.Mock };
const Clipboard = jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock };

describe('contactValue: a row text that is one email or one phone number, whole (item 11)', () => {
  it.each([
    ['dana@northwind.example', 'email'],
    ['  dana.whitfield+jobs@mail.example.co  ', 'email'],
    ['+1 (415) 555-0134', 'phone'],
    ['415-555-0134', 'phone'],
    ['415.555.0134', 'phone'],
    ['+44 20 7946 0958', 'phone'],
    ['(415) 555 0134', 'phone'],
    ['+14155550134', 'phone'],
  ])('%s is one %s', (text, kind) => {
    expect(contactValue(text)).toEqual({ kind, value: text.trim() });
  });

  it.each([
    'Email dana@northwind.example',
    'dana@northwind.example, omar@northwind.example',
    'Call 415-555-0134 after 5',
    '2019 - 2021',
    '2019-2021',
    '20192021',
    '123456',
    '1234567890123456',
    '4155550134',
    '1234567890',
    '2026-11-06',
    '2021.01.15',
    '15/01/2021',
    '1 000 000',
    '1.000.000',
    'Fernwood Foods · 2019–2025',
    '',
    '   ',
  ])('%j is not one', (text) => {
    expect(contactValue(text)).toBeNull();
  });

  it('dials the digits, a leading "+" kept', () => {
    expect(dialable('+1 (415) 555-0134')).toBe('+14155550134');
    expect(dialable('415.555.0134')).toBe('4155550134');
  });

  it("Apple's unknown-contact card gets the value alone, under the native default label", () => {
    expect(unknownContact({ kind: 'phone', value: '+1 415 555 0134' })).toEqual({
      contactType: 'person',
      name: '',
      phoneNumbers: [{ label: '', number: '+1 415 555 0134' }],
    });
    expect(unknownContact({ kind: 'email', value: 'dana@northwind.example' })).toEqual({
      contactType: 'person',
      name: '',
      emails: [{ label: '', email: 'dana@northwind.example' }],
    });
  });
});

describe("a list row's phone number or email opens Apple's card; where it cannot, the sheet (item 11)", () => {
  const rows = [
    {
      type: 'list',
      items: [
        { title: 'Phone', text: '+1 415 555 0134' },
        { title: 'Email', text: 'dana@northwind.example' },
        { title: 'Location', text: 'Call 415-555-0134 after 5' },
      ],
    },
  ];
  let open: jest.SpyInstance;
  beforeEach(() => {
    open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });
  afterEach(() => open.mockRestore());

  it('the phone and the email are links; mixed text is plain', async () => {
    await renderBlocks(rows);
    expect(screen.getByTestId('b-0-row-0-contact').props.accessibilityRole).toBe('link');
    expect(screen.getByTestId('b-0-row-1-contact').props.accessibilityRole).toBe('link');
    expect(screen.queryByTestId('b-0-row-2-contact')).toBeNull();
    expect(screen.getByText('Call 415-555-0134 after 5')).toBeTruthy();
  });

  it("on iOS a tap opens Apple's unknown-contact card with the value, its actions on", async () => {
    const ios = jest.replaceProperty(Platform, 'OS', 'ios');
    try {
      await renderBlocks(rows);
      await fireEvent.press(screen.getByTestId('b-0-row-0-contact'));
      await waitFor(() => expect(Contacts.presentFormAsync).toHaveBeenCalledTimes(1));
      expect(Contacts.presentFormAsync).toHaveBeenCalledWith(
        null,
        { contactType: 'person', name: '', phoneNumbers: [{ label: '', number: '+1 415 555 0134' }] },
        { allowsActions: true },
      );
      expect(screen.queryByTestId('b-0-row-0-contact-sheet')).toBeNull();
    } finally {
      ios.restore();
    }
  });

  it('the card failing, a phone number gets Call, Message, Copy and Cancel — each doing what it says', async () => {
    const ios = jest.replaceProperty(Platform, 'OS', 'ios');
    Contacts.presentFormAsync.mockRejectedValue(new Error('no card'));
    try {
      await renderBlocks(rows);
      const press = async (id: string) => {
        await fireEvent.press(screen.getByTestId('b-0-row-0-contact'));
        const sheet = within(await screen.findByTestId('b-0-row-0-contact-sheet'));
        expect(sheet.getByText('+1 415 555 0134')).toBeTruthy();
        expect(sheet.queryByText('Email')).toBeNull();
        await act(async () => fireEvent.press(sheet.getByTestId(`b-0-row-0-contact-${id}`)));
      };
      await press('call');
      expect(open).toHaveBeenLastCalledWith('tel:+14155550134');
      await press('message');
      expect(open).toHaveBeenLastCalledWith('sms:+14155550134');
      await press('copy');
      expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith('+1 415 555 0134');
      await press('cancel');
      expect(open).toHaveBeenCalledTimes(2);
      expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByTestId('b-0-row-0-contact-call')).toBeNull());
    } finally {
      Contacts.presentFormAsync.mockReset();
      ios.restore();
    }
  });

  it('on Android an email opens the sheet at once: Email (mailto:), Copy, Cancel — no card asked for', async () => {
    const android = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await renderBlocks(rows);
      await fireEvent.press(screen.getByTestId('b-0-row-1-contact'));
      const sheet = within(await screen.findByTestId('b-0-row-1-contact-sheet'));
      expect(sheet.queryByText('Call')).toBeNull();
      expect(sheet.queryByText('Message')).toBeNull();
      await act(async () => fireEvent.press(sheet.getByTestId('b-0-row-1-contact-email')));
      expect(open).toHaveBeenLastCalledWith('mailto:dana@northwind.example');
      await fireEvent.press(screen.getByTestId('b-0-row-1-contact'));
      await act(async () => fireEvent.press(within(await screen.findByTestId('b-0-row-1-contact-sheet')).getByTestId('b-0-row-1-contact-copy')));
      expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith('dana@northwind.example');
      expect(Contacts.presentFormAsync).not.toHaveBeenCalled();
    } finally {
      android.restore();
    }
  });
});

describe("a run's page: its face, and where a run started on Home opens (item 10)", () => {
  it.each([
    ['pending', 'steps'],
    ['running', 'steps'],
    ['held', 'steps'],
    ['failed', 'steps'],
    ['cancelled', 'steps'],
    ['succeeded', 'result'],
  ] as const)('%s: its %s face', (status, face) => {
    expect(runFace(status)).toBe(face);
  });

  it("a run for a job: the Flows list, the flow's page, the job's page, the run; without one, no job's page", () => {
    expect(startedRunState({ runId: 'r', subscriptionId: 's', itemId: 'i' }).routes).toEqual([
      { name: 'index' },
      { name: 'detail', params: { flow: 's' } },
      { name: 'item', params: { item: 'i' } },
      { name: 'run', params: { runId: 'r' } },
    ]);
    expect(startedRunState({ runId: 'r', subscriptionId: 's' }).routes.map((route) => route.name)).toEqual(['index', 'detail', 'run']);
  });
});

describe("Home's YOUR FLOWS rules (items 5 and 8)", () => {
  const flow = (id: string, name: string): HomeFlow => ({ subscription: { id, name } as HomeFlow['subscription'], entry: undefined });
  const sections = [
    { department: 'Operations', flows: [flow('a', 'Invoice Processing')] },
    { department: 'Accounting', flows: [flow('b', 'Resume Screening'), flow('c', 'ICD-10 Code Check')] },
    { department: null, flows: [flow('d', 'Unread flow')] },
  ];

  it('"All departments" first, then the departments A–Z', () => {
    expect(homeDepartmentChoices(sections)).toEqual([
      { value: ALL_DEPARTMENTS, label: 'All departments' },
      { value: 'Accounting', label: 'Accounting' },
      { value: 'Operations', label: 'Operations' },
    ]);
  });

  it('a department chosen shows its section alone; a search narrows by name, any case, and drops an emptied section', () => {
    expect(homeFlowsShown(sections, 'Accounting', '').map((section) => section.department)).toEqual(['Accounting']);
    expect(homeFlowsShown(sections, ALL_DEPARTMENTS, 'icd').map((section) => section.flows.map((f) => f.subscription.id))).toEqual([['c']]);
    expect(homeFlowsShown(sections, 'Operations', 'resume')).toEqual([]);
  });

  it('the newest ready job, archived and unread ones passed over; none, null', () => {
    const job = (id: string, status: string, archivedAt: string | null = null) => ({ id, status, archivedAt });
    expect(newestReadyItem([job('new', 'reading'), job('gone', 'ready', '2026-11-01'), job('next', 'ready'), job('old', 'ready')])!.id).toBe('next');
    expect(newestReadyItem([job('x', 'failed')])).toBeNull();
  });
});

describe('the one flow card on Add a flow (items 1 and 4) and the catalog\'s "Sparkles" (plan 1)', () => {
  it('a card is the icon, the name, the description and its Add', async () => {
    routePlatform(platformOperation);
    await renderWithProviders(<SolutionsScreen />, signedInSession);
    const entry = catalogPayload().automations[0]!;
    const card = within(await screen.findByTestId(`add-card-${entry.templateId}`));
    expect(card.getByTestId(`add-card-${entry.templateId}-icon`)).toBeTruthy();
    expect(card.getByTestId(`add-card-${entry.templateId}-name`).props.children).toBe(entry.name);
    expect(card.getByTestId(`add-card-${entry.templateId}-description`).props.children).toBe(entry.description);
    expect(card.queryByTestId(`add-${entry.templateId}`) ?? card.queryByTestId(`added-${entry.templateId}`)).toBeTruthy();
    expect(screen.queryByText(/ runs · /u)).toBeNull();
  });

  it('"Sparkles", as ICD-10 Code Check\'s manifest names it, draws Phosphor\'s Sparkle — not the fallback', () => {
    expect(iconFor('Sparkles')).toBe(Sparkle);
  });
});
