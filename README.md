[![Quality Gates](https://github.com/OWNER/REPO/actions/workflows/quality-gates.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/quality-gates.yml)  
_(Replace `OWNER/REPO` in the badge URL with your GitHub org/repo.)_

# ClearQueue

A personal project and task management system built with Next.js 14, TypeScript, Tailwind CSS, and Supabase.

## Features

- **Kanban Board**: Drag and drop tasks between status columns (Backlog, Next, In Progress, Blocked, Done)
- **Project Management**: Organize tasks by projects with custom colors and categories
- **Project Categories**: Organize projects into categories (Business, Clients, Development, Internal Tools, Operations, Personal, Research, Archived)
- **Project Editing**: Full CRUD operations for projects - rename, change category, archive/unarchive, delete
- **Archived Projects**: Hide archived projects by default with a toggle to show them
- **Task Management**: Create, edit, and delete tasks with priorities, due dates, and notes
- **Filtering**: Filter tasks by project, category, priority, and search
- **Today & Next Up**: Quick view of tasks due today and high-priority next tasks
- **Analytics Dashboard**: View project health, KPIs, blocked tasks, and upcoming deadlines
- **Authentication**: Secure admin-only access via Supabase Auth

## Documentaci�n

- **[docs/README.md](docs/README.md)** ? �ndice de documentaci�n (reportes, audits, patrones, reglas ESLint).
- **Calidad:** reglas custom en `docs/eslint-rules-README.md`; estado de implementaci�n en `docs/reports/IMPLEMENTATION_STATUS_REPORT.md`.

## Tech Stack

- **Next.js 14+** (App Router with TypeScript)
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components
- **Supabase** (PostgreSQL + Auth)
- **@dnd-kit** for drag and drop functionality

## Prerequisites

- Node.js 18+ and npm
- A Supabase account and project
- Git (optional)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings** > **API** to get your project URL and anon key
3. Go to **SQL Editor** and run the migration files **in order**:
   - First, run `supabase/migrations/001_initial_schema.sql` (creates tables and initial schema)
   - Then, run `supabase/migrations/20260118190000_add_project_categories_and_editing.sql` (adds categories and editing features)
   - Copy the contents of each file and paste/run them in the Supabase SQL Editor

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
ADMIN_EMAIL=your-admin-email@example.com
```

**Important**: Replace `your_supabase_project_url`, `your_supabase_anon_key`, and `your-admin-email@example.com` with your actual values.

### 4. Create Your Admin User

1. In Supabase Dashboard, go to **Authentication** > **Users**
2. Click **Add User** > **Create new user**
3. Enter your admin email and set a password
4. Make sure the email matches the `ADMIN_EMAIL` in your `.env.local` file

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Sign In

Use the email and password you created in Supabase to sign in.

## Database Schema

### Projects Table

- `id` (UUID, Primary Key)
- `name` (Text, Not Null)
- `color` (Text, Nullable)
- `category` (Text, Not Null, Default: 'business')
  - Valid values: business, clients, development, internal_tools, operations, personal, research, archived
- `created_at` (Timestamp)
- `updated_at` (Timestamp, Auto-updated on changes)

### Tasks Table

- `id` (UUID, Primary Key)
- `project_id` (UUID, Foreign Key → projects.id)
- `title` (Text, Not Null)
- `status` (Enum: backlog, next, in_progress, blocked, done)
- `priority` (Integer, 1-5)
- `due_date` (Date, Nullable)
- `notes` (Text, Nullable)
- `order_index` (Integer, for sorting within status)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

## Deployment to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin your-repo-url
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **Add New Project**
3. Import your GitHub repository
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ADMIN_EMAIL`
5. Click **Deploy**

### 3. Update Supabase RLS (if needed)

After deployment, ensure your Supabase project allows connections from your Vercel domain. The RLS policies in the migration should work, but verify in Supabase Dashboard under **Authentication** > **Policies**.

## Project Structure

```
clear-queue/
├── app/
│   ├── actions/          # Server actions for database operations
│   ├── dashboard/        # Dashboard page
│   ├── globals.css       # Global styles
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home/login page
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── AddProjectModal.tsx
│   ├── AddTaskModal.tsx
│   ├── Column.tsx
│   ├── DashboardClient.tsx
│   ├── EditTaskModal.tsx
│   ├── KanbanBoard.tsx
│   ├── LoginForm.tsx
│   ├── RightPanel.tsx
│   ├── Sidebar.tsx
│   ├── TaskCard.tsx
│   └── TopBar.tsx
├── lib/
│   ├── supabase/         # Supabase client utilities
│   ├── auth.ts           # Authentication helpers
│   └── utils.ts          # Utility functions
└── supabase/
    └── migrations/       # Database migration files
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Security Notes

- Only users with the email matching `ADMIN_EMAIL` can access the application
- Row Level Security (RLS) is enabled on all tables
- All database operations are performed through server actions
- Authentication is handled by Supabase Auth

## Project Categories

Projects can be organized into the following categories:

- **Business**: General business projects
- **Clients**: Client-facing projects
- **Development**: Software development projects
- **Internal Tools**: Internal tooling and infrastructure
- **Operations**: Operational and administrative projects
- **Personal**: Personal projects
- **Research**: Research and experimentation
- **Archived**: Archived projects (hidden by default)

### Archiving Projects

- Projects can be archived to hide them from the main view
- Use the "Show Archived" toggle in the sidebar to view archived projects
- Archiving a project does NOT delete its tasks - they remain in the database
- You can unarchive projects to restore them to active status

## Troubleshooting

### "Not authorized" error on login

- Verify that the email you're using matches `ADMIN_EMAIL` in `.env.local`
- Check that the user exists in Supabase Authentication

### Database connection errors

- Verify your Supabase URL and anon key in `.env.local`
- Ensure **both** migration files have been run in Supabase SQL Editor (in order)
- Check that the `category` column exists in the `projects` table

### Category-related errors

- Ensure the second migration (`20260118190000_add_project_categories_and_editing.sql`) has been run
- Verify that existing projects have a valid category (defaults to 'business')

### Drag and drop not working

- Check browser console for errors
- Ensure all dependencies are installed (`npm install`)

## License

MIT
