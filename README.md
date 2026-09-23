# Tahleem Academy

Full-stack Quran/Islamic learning platform — live classes, Hifdh tracking, registration, and admin tools.

## ⚠️ Supabase Edge Functions

The code under `supabase/functions/` in this repo is **not the source of truth** — it can be, and often is, out of date. Edge functions (e.g. `tahleem-ai`) are edited and deployed **directly on Supabase**, not synced back into this repo.

**Before touching any edge function:** always pull the live version from the Supabase project (`zqniborlnbpkjdmyssnl`) first — don't assume the copy in this repo reflects what's deployed. Deploy changes back to Supabase directly rather than committing them here and hoping they sync.

## Getting started

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

\`\`\`sh
# Step 1: Clone the repository.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd tahleemacademy

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
\`\`\`

**Use GitHub Codespaces**

- Navigate to the main page of the repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Supabase
