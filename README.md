# Molin Shopping List

A family shopping list that works on any phone. The list is kept in a Google Sheet, so family members just need a link and a passcode, with no accounts.

**First time? Follow [SETUP.md](SETUP.md).**

## Features
- Add an item with **brand**, **quantity**, **price** and **store**: Costco, ShopRite, Food Universe, Stop & Shop, Amazon or Other
- **Estimated total** for the whole list and a subtotal for each store
- **"I'll pick it up"** lets a family member confirm they're getting an item, so nobody doubles up
- **My pickups** checklist for whoever is shopping: check items off as you grab them, and the family gets a status update when everything is picked up (or a note of what you couldn't find)
- **Quick add**: save family items like "Blues Food" once, then add them back to the list in one tap
- Tick items off as bought, then clear them in one tap

## Files
- `index.html`: the app (hosted on GitHub Pages)
- `apps-script/Code.gs`: the Google Sheets backend you paste into Apps Script
- `claude-artifact.html`: an earlier version that runs inside Claude, with automatic price estimates
