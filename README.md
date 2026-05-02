## Card Flow

Business card capture, multi-contact extraction, follow-up drafting, and XLSX export in a Next.js app that works on desktop and phone.

## Shared Database

- Local development uses the JSON fallback at `./data/business-cards.json`.
- Production uses the Cloudflare D1 binding configured in `wrangler.jsonc`.
- Also set `OPENAI_API_KEY` for extraction and follow-up generation.
- Copy `.env.example` to `.env.local` for local development and `.dev.vars.example` to `.dev.vars` for Worker preview.

## Cloudflare Workers

- This app is now configured for Cloudflare Workers using `@opennextjs/cloudflare`.
- Worker config lives in `wrangler.jsonc`.
- The deployed Worker name is set to `business-card-app`, which matches the target `workers.dev` URL.
- Shared contacts currently persist in the `business-cards-contacts` D1 database binding.

### Required Cloudflare secrets

Add these in the Cloudflare Worker settings or with `wrangler secret put`:

- `OPENAI_API_KEY`
- `EMAIL_FROM`

Example:

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put EMAIL_FROM
```

### Email notifications

- New contacts can trigger an email notification with:
  - a summary of only the newly added contacts
  - the latest XLSX contacts database attached
- The shared contacts screen also includes a manual `Email Shared Contacts` action.
- Manual send uses the same latest XLSX attachment, but summarizes the current shared contacts set.
- Duplicates or updates do not trigger the notification email.
- `EMAIL_NOTIFICATION_TO`, `EMAIL_REPLY_TO`, and `EMAIL_FROM_NAME` are already wired as Worker vars.
- `EMAIL_FROM` must be a verified sender address on a Cloudflare Email Service domain.
- `joshdwamena@gmail.com` can be used as `EMAIL_REPLY_TO`, but Cloudflare Email Service cannot send mail directly *from* a Gmail address.

### Local Worker preview

```bash
cp .dev.vars.example .dev.vars
npm run preview
```

### Deploy

```bash
npm run deploy
```

If Cloudflare Git integration is connected to this repo and branch, pushing to GitHub can then trigger automatic rebuilds of the Worker.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
