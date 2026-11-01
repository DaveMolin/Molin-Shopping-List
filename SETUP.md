# Setting up the Molin Shopping List

This takes about 15 minutes, once. After that, family members only need a link and the family passcode. They don't need a Google or Claude account.

How it works: the list lives in a Google Sheet in your Google account. A small script attached to that sheet lets the app read and update it. The app itself is a web page hosted free by GitHub Pages.

---

## Part 1: Create the Google Sheet (about 8 minutes)

1. Go to **https://sheets.new** while signed in to your Google account. Name the sheet **Molin Shopping List**.
2. In the menu, choose **Extensions → Apps Script**. A code editor opens in a new tab.
3. Delete the sample code in the editor. Open [`apps-script/Code.gs`](apps-script/Code.gs) from this repo, click the copy button, and paste everything into the editor.
4. Near the top, change `"change-me"` to your family passcode, for example `const FAMILY_PASSCODE = "BlueDog2026";`. Click the **Save** icon.
5. In the toolbar's function dropdown, pick **setup**, then click **Run**.
   - Google asks for permission. Click **Review permissions** and choose your account.
   - You'll see "Google hasn't verified this app." That's expected for your own script. Click **Advanced**, then **Go to … (unsafe)**, then **Allow**.
   - Switch back to the sheet tab. It now has **Items**, **Saved** and **Updates** tabs.
6. Back in Apps Script, click **Deploy → New deployment**.
   - Click the gear next to "Select type" and choose **Web app**.
   - **Execute as:** Me
   - **Who has access:** Anyone
   - Click **Deploy**, then copy the **Web app URL**. It ends in `/exec`.

## Part 2: Put the app online (about 5 minutes)

7. Merge the `add-shopping-list-app` branch into `main` on GitHub (open the pull request and click **Merge**).
8. On GitHub, open `index.html` on `main` and click the pencil icon to edit. Find this line:
   ```js
   const SHEET_API_URL = "";
   ```
   Paste your Web app URL between the quotes, then click **Commit changes**.
9. Go to the repo's **Settings → Pages**. Under "Build and deployment", set **Source** to **Deploy from a branch**, choose **main** and **/ (root)**, then click **Save**.
10. After a minute or two, the app is live at:
    **https://davemolin.github.io/Molin-Shopping-List/**

## Part 3: Get the family on it

11. Send everyone the link and the passcode.
12. On each phone: open the link, enter the passcode, then tap **Who are you?** and enter a name.
13. Add it to the home screen so it opens like an app:
    - **iPhone (Safari):** Share button → **Add to Home Screen**
    - **Android (Chrome):** ⋮ menu → **Add to Home screen**

---

## Good to know

- **Changes show up within about 15 seconds** on other phones, and right away when someone reopens the app.
- **You can look at or fix the list in the Google Sheet.** If you type in a store, use one of: Costco, ShopRite, Food Universe, Stop & Shop, Amazon, Other.
- **Changing the passcode:** edit it in Apps Script, save, then do **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. Everyone will be asked for the new passcode.
- **If you ever change `Code.gs`**, redeploy the same way (Manage deployments → New version). The Web app URL stays the same.
- **Privacy:** anyone with both the link and the passcode can see and change the list. Without the passcode, the app shows nothing.
- **GitHub Pages needs the repo to be public** on a free GitHub plan. The list itself stays in your Google Sheet, not on GitHub.
