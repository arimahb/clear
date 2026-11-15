# CLEAR privacy

This page says what CLEAR does with your information. It describes the design all features
must follow. Features marked *not built yet* are not in the extension yet.

## The short version

- CLEAR does its page work **on your device**. It does not send the pages you visit, their
  addresses or their content to anyone.
- The only thing CLEAR can send is text **you choose** to have explained, and only after you
  agree. Even then it sends only that text and your language. Nothing else.
- CLEAR has no accounts, no tracking, no analytics and no user ID. The people who build CLEAR
  cannot see which pages you visit or what you do on them.

## What happens on your device only

| What | Where it stays |
|---|---|
| Calming a page (stopping video, animation, flashing; softening colours) | In the page, on your device |
| The Page Forecast (counting videos, popups, words and so on) | On your device |
| Hiding popups and cookie banners | In the page, on your device. CLEAR never clicks a site's buttons, so it never accepts or refuses cookies for you. Cookie banner hiding is off unless you turn it on. |
| Your settings | Chrome's local storage on your device. Not synced. |
| Which sites you made "always on" | Chrome's own permission list on your device |

Code that runs inside web pages is checked automatically on every change to make sure it
cannot send anything over the network.

## "Explain text" *(not built yet)*

When you ask CLEAR to explain some text:

1. If Chrome has built-in on-device AI, CLEAR uses it. **Nothing is sent.**
2. Otherwise, CLEAR can use its server, **only if you have turned that on**. Before
   sending, CLEAR shows you exactly what will be sent.
3. Before sending, CLEAR replaces email addresses, phone numbers, web addresses and long
   numbers with placeholders such as `[email]`. The real values stay on your device and are
   put back into the answer you see.

**What is sent:** the selected text (after the replacements) and the language you want the
answer in.

**What is never sent:** the page address, the site name, the page title, other text on the
page, an ID for you or your browser, or the time.

**On the server:**
- Nothing is stored. There is no database.
- Logs record only that a request happened, whether it worked and how long it took. They
  never record the text, the answer or your IP address.
- To stop overuse, the server counts requests for a few minutes in memory. The counts are
  never saved.
- The text is passed to an AI provider under an agreement that it is not kept. The README
  names the provider.

**One limit to know about:** like any website, the server can see your IP address while it
handles a request, even though it does not log it. We plan to fix this by sending requests
through a relay (Oblivious HTTP). The relay would see your IP address but not your text, and
the server would see your text but not your IP address.

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Lets CLEAR work on the current tab, only after you click CLEAR, use its shortcut or use its menu |
| `scripting` | Lets CLEAR add its calming code to that tab |
| `storage` | Saves your settings on your device |
| `sidePanel` | Shows CLEAR's panel |
| `contextMenus` | Adds "Explain this with CLEAR" when you right-click selected text |
| Access to a site you choose *(optional, not built yet)* | Lets CLEAR calm that site as it loads, before you click anything. You approve each site, and you can remove it in the side panel. |
| Access to all sites *(optional, not built yet)* | Only if you choose it. The rules above still apply: page content never leaves your device. |
