# Design

**Status: not started.** The UI developer owns this document and will define the design system
(typography, color, spacing, components) before the main UI is built.

Until then, no shared styles, tokens, or components exist. `src/app/globals.css` only imports
Tailwind.

## Goals agreed during planning

- A premium, intentional product feel, not a generic hackathon dashboard.
- Strong typography, consistent spacing, generous whitespace, refined neutrals, and one accent color.
- Accessible (keyboard, contrast, focus states) and responsive from mobile to desktop.
- Restrained motion.
- Avoid: heavy gradients, glassmorphism, random colored cards, excessive shadows or rounded panels,
  emoji decoration, icon overuse, and generic marketing copy.

## To be defined

- [ ] Fonts and type scale
- [ ] Color tokens (light/dark)
- [ ] Spacing, radius, shadow, and motion tokens (in `src/app/globals.css`)
- [ ] Core components (in `src/components`)
- [ ] Layout and responsive conventions

Record the main choices in [DECISIONS.md](DECISIONS.md) once made.
