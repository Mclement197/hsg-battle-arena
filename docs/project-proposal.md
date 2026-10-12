# Project proposal: HSG Battle Arena

Source: the group-supplied “Project description PDF.pdf”. This Markdown version preserves the proposal’s scope and content, with formatting and minor typographical cleanup.

## General idea

We want to build a combat game similar to Pokémon, where one part of the class plays one character, and the other part plays the other. Each character takes turns to act, and the class votes on each action as it happens.

The game is HSG-themed: the two fighters and their moves draw on student life in St. Gallen, such as exam season, group projects, coffee, and the Assessment. The game runs in the browser, so it works in a live classroom presentation with no installation.

## Main features

### Deploy the app

The game is hosted online and reachable through a public link and a QR code on the projector. Students join on their own phones without installing anything.

### Class interaction

The audience is split into two teams, and each team controls one character. On its turn, a team votes on the next move (for example, attack, defend, heal, or special) within a time limit. The most-voted move is executed, and ties are broken randomly.

### Visual effects

Animated attacks, health bars that drain in real time, floating damage numbers, screen shake on heavy hits, a victory screen, etc.

### Sound effects

Distinct sounds for attacks, healing, special moves, turn changes, and the final win, with a mute option for the presenter.

### HSG theme

Two original characters with their own moves, humor, and design based on university life.

## What the software does

### Presenter

Opens the host page on the projector, which shows the battle arena and a QR code. Once enough students have joined, the presenter starts the battle. During the game, the presenter sees the characters, health bars, the live vote count, and the animated results.

### Student

Scans the QR code, enters a nickname, and is automatically placed on one of the two teams. When it is their team’s turn, their phone shows the available moves (for example, attack, defend, heal, special) and a countdown. They tap one move and can change their vote until time runs out. When it is the other team’s turn, they watch the projector.

### Each turn

The timer ends, the most-voted move wins (ties are broken randomly), and the move plays out on the projector with animation and sound. The health bars update and the turn passes to the other team. When one character reaches zero HP, the winning team is announced.

## The group

- Mathis Clement
- Lara Mileto
- Noam Méndez
- Nolan Naeser
- Kay Wullschleger
- Philippe Verdeja
