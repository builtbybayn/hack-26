# Design

**Status: implemented.** The PDF intelligence workspace defines the initial product language.

Until then, no shared styles, tokens, or components exist. `src/app/globals.css` only imports
Tailwind.

## Goals agreed during planning

- A premium, intentional product feel, not a generic hackathon dashboard.
- Strong typography, consistent spacing, generous whitespace, refined neutrals, and one accent color.
- Accessible (keyboard, contrast, focus states) and responsive from mobile to desktop.
- Restrained motion.
- Avoid: heavy gradients, glassmorphism, random colored cards, excessive shadows or rounded panels,
  emoji decoration, icon overuse, and generic marketing copy.

## System

- Display typography: Georgia; interface typography: Arial/system sans-serif.
- Palette: warm paper (`#f4f1e9`), near-black green, forest accent, clay inference accent.
- Fine 1px borders, nearly square controls, restrained depth, and generous whitespace.
- Responsive layouts collapse to one column below 900px and remain usable at 360px.
- Keyboard focus uses a visible three-pixel ring; controls retain native semantics.

Record the main choices in [DECISIONS.md](DECISIONS.md) once made.
