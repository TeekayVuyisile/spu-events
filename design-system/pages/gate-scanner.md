# Gate Scanner: overrides

- Always dark, whatever the user's theme setting, so the screen doesn't glare at night gates.
- Full-bleed camera with a centred square frame. The only chrome is the event name, the live count and an exit button.
- The result takes over the whole screen with a colour fill, a 96px icon and a 2rem label:
  - **Valid:** `--success`, CircleCheck icon, "Admit", student name and avatar.
  - **Already used:** `--warning`, TriangleAlert icon, "Already scanned at 19:42 by Gate B".
  - **Invalid or wrong event:** `--destructive`, CircleX icon, and the reason.
- Results use `aria-live="assertive"` and vibrate (valid `[60]`, otherwise `[80,60,80]`). Tapping dismisses the result, or it dismisses itself after 2.5s.
- Buttons are at least 56px tall because staff may be wearing gloves.
