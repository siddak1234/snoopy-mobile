import { Sparkle, Tray, UsersThree, type Icon } from 'phosphor-react-native';

/**
 * The onboarding walkthrough's copy.
 *
 * This is product copy, not prototype stand-in data: no endpoint serves it, and
 * none is planned — the platform has no notion of a marketing walkthrough. It
 * lived in `lib/fixtures.ts` only because that is where the design import put
 * every string, which conflated "data the API will replace" with "words the app
 * ships". Round 6 replaces the former; this is the latter.
 *
 * Strings stay byte-identical to the design (`Screen.dc.html`).
 */
export type OnboardingPhase = {
  icon: Icon;
  kicker: string;
  title: string;
  sub: string;
};

export const onboardingPhases: OnboardingPhase[] = [
  {
    icon: Tray,
    kicker: 'THE MANUAL GRIND',
    title: 'Inboxes, invoices, intake forms. All day. Every day.',
    sub: "Document work eats whole teams. It doesn't have to.",
  },
  {
    icon: Sparkle,
    kicker: 'AUTOMATION × AI',
    title: 'Every repetitive task, done by an agent.',
    sub: 'Extraction, classification, routing, posting. On their own.',
  },
  {
    icon: UsersThree,
    kicker: 'YOUR TEAM, UNBURDENED',
    title: 'Your team reviews. The agents run.',
    sub: 'Review points where judgment matters. Everything else just happens.',
  },
];
