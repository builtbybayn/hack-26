# Design

**Status: migrated.** The main research workspace (`/`) now uses the supplied Research Core UI:
dark charcoal surfaces, restrained gold accents, serif display text, a project explorer, tabbed
split views, and an expandable assistant. Its stylesheet is scoped under `.research-workspace`.
Reused research tools retain the Obsidian controls from decision 19; `/classic`,
`/brief`, and `/sprite` retain isolated classic styles. See decision 24.

The workspace assistant uses the supplied UI's glass/liquid blob effects in
`src/features/agent/glass-sprite`, shared with the extension. Its idle, researching, and error forms respond to
the canonical API activity store. Keep this renderer's reflective material and pointer fluid
interaction; the separate silk-loop renderer remains available in `/sprite`.

The sections below describe the retained Obsidian components and extension conventions.

Notes open as documents with an editable title, Markdown body, automatic browser saves, and a
reading-view toggle. New note is available directly in the explorer and through Alt+N (also
Ctrl/Cmd+N where the browser allows it); Ctrl/Cmd+E toggles reading view and Ctrl/Cmd+S saves.
Roadmaps open in reading view with a highlighted goal, stage dividers, spaced concept checklists,
and underlined paper links. Long roadmap notes occupy the full note grid width.

The document reader fills its workspace pane edge to edge, beneath the existing tabs. Keep one
compact PDF toolbar, with source details and reading status in the optional context sidebar.
Do not add an outer reader card, fixed viewport height, or a repeated document heading.

## Goals

Explorer items support right-click Open and Delete actions. Notes and sources move directly to
Trash; projects and folders ask for confirmation before moving their contents. The status bar
offers Undo delete, and explorer Trash supports restoration after a reload. Errors stay visible
inside dialogs; menus support keyboard navigation and Escape.

- Look and behave like Obsidian, so the vault feels familiar: restrained, dense, dark by default.
- Our features fit Obsidian's patterns rather than adding new chrome: papers, notes, and chats
  are files in the tree; analysis lives in the right sidebar; AI chats are tabs.
- Accessible (keyboard, contrast, focus states) and usable from desktop down to a phone.
- Avoid: gradients, glassmorphism, colored cards, heavy shadows, emoji, marketing copy.

## Layout

| Region        | Obsidian equivalent   | Contents                                                      |
| ------------- | --------------------- | ------------------------------------------------------------- |
| Ribbon        | Left ribbon           | Sidebar toggle, quick switcher, import, new note, chat, map   |
| Left sidebar  | File explorer, search | Files / Search / Bookmarks tabs; vault name, help, settings   |
| Work area     | Tabs and splits       | Up to two panes of tabs: papers, notes, chats                 |
| Right sidebar | Backlinks, outline    | Paper insights: overview, prerequisites, highlights, related… |
| Status bar    | Status bar            | Word count, agent status (placeholder for the sprite)         |

The paper reader matches the mockup: thumbnails on the left, page toolbar (page, zoom, fit, rotate,
highlighter, undo/redo), comments in the right margin beside their highlights.

## Extension panel

Same Research Core visual conventions, one column: the name and quick note/workspace actions on top, the fluid assistant sprite, the
current tab, then either the analyze flow (on a PDF) or a chat (anywhere else). The sprite shrinks
once a conversation starts.

The sprite is a deliberate material exception to the flat interface: one continuous,
mathematically rendered liquid surface with broad pearlescent reflections. Its idle animation
is the silk loop: a threefold current folding through a continuous loop in zero gravity.
Activity forms use rounded symmetry,
flowing loops, and soft points, retaining subtle flow instead of becoming rigid objects.
Avoid hard facets, grain, particle clouds, flashing highlights, and a ground shadow.
All forms share one material and motion clock; interrupted morphs continue from the visible
surface. Reduced motion renders a still form. Review all states and sizes at `/sprite`.

## Tokens

All colors are CSS variables on `.theme-obsidian` in `src/components/theme/obsidian-theme.css`
(shared by the vault and the extension panel), named after Obsidian's
(`--background-primary`, `--text-muted`, `--interactive-accent`, …). The light theme redefines the
same variables. Never hard-code a color in a component; add or reuse a token.

- Type: the system UI font stack at 14px for the interface, 16px for notes and replies.
- Accent: Obsidian purple (`#7f6df2`). Highlight colors: yellow, green, blue, pink.
- Radii 4px (controls) and 8px (menus, cards); 1px borders; shadows only on floating elements.
- Icons: Lucide, 18px in toolbars and the ribbon, 14px in the tree and tabs.
- Focus: a 2px accent outline on every interactive element.

## Small screens

Below 768px the sidebars become drawers over the work area (one at a time), split panes stack,
and the page thumbnails hide. Margin comments float over the page edge when the margin doesn't fit.
