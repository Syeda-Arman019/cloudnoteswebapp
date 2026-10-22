/**
 * Demo-mode seed data.
 *
 * This module is ONLY used when VITE_API_URL is unset (demo mode). It gives the
 * interface realistic content to preview before the Flask API exists in Part 2.
 * Nothing here is real user data.
 */

import { DEMO_USER, DEFAULT_CATEGORIES } from '@/utils/constants';

const DAY = 24 * 60 * 60 * 1000;

function iso(offsetDays, hourOffset = 0) {
  return new Date(Date.now() - offsetDays * DAY + hourOffset * 60 * 60 * 1000).toISOString();
}

export const SEED_USER = {
  ...DEMO_USER,
  role: 'Student',
  bio: 'Exploring ideas, one note at a time.',
};

export const SEED_CATEGORIES = DEFAULT_CATEGORIES.map((category) => ({ ...category }));

export const SEED_NOTES = [
  {
    id: 'note-1',
    title: 'CloudNotes — Project Roadmap',
    content: `## Goals

Build a production-ready notes platform with a **Flask REST API**, MySQL storage and a modern React frontend.

### Milestones

- Part 1: React frontend, responsive UI, reusable components
- Part 2: Flask API, MySQL, authentication, document exports
- Part 3: Testing, hardening and cloud deployment

### Architecture notes

- Keep all note operations behind service functions
- Base URL configured with \`VITE_API_URL\`
- Demo mode falls back to an isolated browser store

> Ship the interface first, wire the backend second, polish everything last.`,
    categoryId: 'cat-projects',
    tags: ['roadmap', 'react', 'flask'],
    isPinned: true,
    createdAt: iso(9),
    updatedAt: iso(1, -3),
  },
  {
    id: 'note-2',
    title: 'Weekly Team Standup — Highlights',
    content: `## This week

- Shipped the onboarding flow review
- Collected feedback from three pilot users
- Documented the API contract for notes and categories

## Blockers

Waiting on the final brand colour palette from the design sync.

## Next up

1. Draft the export service contract
2. Sketch the PDF layout
3. Book the demo session`,
    categoryId: 'cat-work',
    tags: ['standup', 'team'],
    isPinned: true,
    createdAt: iso(6),
    updatedAt: iso(0, -5),
  },
  {
    id: 'note-3',
    title: 'Database Systems — Lecture 7 Notes',
    content: `## Normalization

**1NF** — atomic values, no repeating groups.
**2NF** — 1NF plus no partial dependency on a composite key.
**3NF** — 2NF plus no transitive dependency on the primary key.

## Indexing

- B-tree indexes suit range and equality queries
- Hash indexes are fast for equality only
- Every index speeds reads and slows writes

> Exam tip: be ready to justify each normal form with an example relation.`,
    categoryId: 'cat-study',
    tags: ['databases', 'exam'],
    isPinned: false,
    createdAt: iso(5),
    updatedAt: iso(2),
  },
  {
    id: 'note-4',
    title: 'Product Ideas Backlog',
    content: `## Features worth exploring

- Focus mode with a typewriter effect
- Shared read-only note links
- Smart suggestions based on tags
- A daily review digest email

## Rough thoughts

The export menu should feel like a first-class feature, not an afterthought.
Consider offering *templates* for meeting notes and study cards.`,
    categoryId: 'cat-ideas',
    tags: ['brainstorm', 'product'],
    isPinned: false,
    createdAt: iso(12),
    updatedAt: iso(3),
  },
  {
    id: 'note-5',
    title: 'Frontend Revision Checklist',
    content: `## Concepts to review

- Component composition and props
- Context versus component state
- Accessible forms and keyboard navigation
- Responsive layout patterns

## Practice

- Rebuild the notes grid with CSS grid only
- Explain the virtual DOM in two sentences
- List three rules for good color contrast`,
    categoryId: 'cat-study',
    tags: ['react', 'revision'],
    isPinned: false,
    createdAt: iso(8),
    updatedAt: iso(4),
  },
  {
    id: 'note-6',
    title: 'Morning Routine Experiments',
    content: `## Current routine

1. Wake at 6:30, no phone for the first 30 minutes
2. Short stretch and a glass of water
3. Review the day's notes before opening email

## Observations

Starting with *deep work* before meetings keeps the day calmer.
Trying a weekly review every Sunday evening — see if it sticks.`,
    categoryId: 'cat-personal',
    tags: ['habits', 'journal'],
    isPinned: false,
    createdAt: iso(15),
    updatedAt: iso(6),
  },
  {
    id: 'note-7',
    title: 'Client Workshop — Meeting Notes',
    content: `## Agenda

- Current pain points with paper notes
- Interest in exportable documents (PDF, Word)
- Requirements for shared categories

## Action items

- Send the prototype link
- Confirm the export formats they need
- Follow up about the pilot timeline`,
    categoryId: 'cat-work',
    tags: ['meeting', 'client'],
    isPinned: false,
    createdAt: iso(4),
    updatedAt: iso(1, -8),
  },
  {
    id: 'note-8',
    title: 'Deployment Checklist',
    content: `## Before going live

- Environment variables documented in \`.env.example\`
- API base URL pointing at production
- Error states reviewed on every route

## After deployment

- Smoke-test login and note creation
- Check dark mode on a real device
- Update the portfolio case study`,
    categoryId: 'cat-projects',
    tags: ['devops', 'checklist'],
    isPinned: false,
    createdAt: iso(3),
    updatedAt: iso(2, -4),
  },
];
