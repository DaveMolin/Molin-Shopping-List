# Molin Shopping List

A family shopping list that works on any phone. The list is kept in a Google Sheet, so family members just need a link and a passcode, with no accounts.

**First time? Follow [SETUP.md](SETUP.md).**

## Features
- **List**: add an item with **brand**, **quantity** and **store** (Costco, ShopRite, Food Universe, Stop & Shop, Amazon or Other), grouped by store
- **Blue's 🐾 Food** checkbox to put the dog's food on the list in one tap, plus **Quick add** for other regulars
- **"I'll pick it up"** lets a family member confirm they're getting an item, so nobody doubles up
- **My pickups → I'm at the store**: the family sees a live banner ("Dave is at the store · 2 of 5 picked up") as items are checked off, then "picked up all 5 items" (or what couldn't be found)
- **Meals**: type a meal and its ingredients; they go straight onto the list, and the meal is saved for next time
- **Clear & archive list**: empties the list and keeps it under **History**, where you can look back or put items back on the list

## Files
- `index.html`: the app (hosted on GitHub Pages)
- `apps-script/Code.gs`: the Google Sheets backend you paste into Apps Script
- `claude-artifact.html`: an earlier version that runs inside Claude, with automatic price estimates
