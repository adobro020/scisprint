# SciSprint — Responsive Science Review Web App

A Duolingo-style science review app built from the provided study guide.

## What's included
- Mobile-first lesson path UI
- Desktop dashboard layout that activates at wider screen sizes
- Course progress, XP, hearts, streaks, mixed review, and mistake review
- Standalone local storage progress tracking

## How to run
Open `index.html` in a modern browser. No server or installation is required.

## Desktop behavior
At tablet/desktop widths, the app changes from a phone shell into a wider dashboard:
- Side navigation replaces the bottom tab bar
- Courses and lessons use multi-column cards
- Study cards and quiz answers expand into desktop grids
- Feedback appears as a desktop panel instead of a mobile bottom sheet


Update: Sound effects are built in with the Web Audio API. Use the 🔊/🔇 button in the top stats bar to mute or unmute. Sounds include tap, correct, incorrect, locked lesson, and lesson-complete effects.

## Combo pitch update
Correct-answer sounds now climb higher in pitch for each consecutive correct answer within a quiz session. A wrong answer resets the combo, and the quiz screen shows the current in-a-row count once it reaches 2.
