repo: siddak1234/snoopy
branch: main

## Last sync
date: 2026-08-04T00:00:00Z
### Updated in this project
- Explored README, globals.css (Nocturne token sheet), auth pages, marketing home, account dashboard via the mounted local folder
- Copied public/a8x-mark.png and public/favicon.svg into assets/
- Built the iOS app design (Screen.dc.html + Autom8x iOS App.dc.html) on those tokens

## Screen map
| Project screen | Repo files |
| --- | --- |
| Splash / Welcome / brand | components/branding/LogoMark.tsx, public/a8x-mark.png, app/globals.css |
| Login / Sign up | app/(auth)/login/page.tsx, app/(auth)/signup/page.tsx, app/(auth)/layout.tsx, components/auth/OAuthButtons.tsx |
| Onboarding tour copy | app/(marketing)/page.tsx (story phases) |
| Home dashboard | app/account/page.tsx, components/dashboard/SectionCard.tsx |
| Workflows / Builder | components/builder/*, components/workflows/WorkflowCardsClient.tsx |
| Tokens & theme (dark + light) | app/globals.css |
