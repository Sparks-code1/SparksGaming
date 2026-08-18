# Checking that spice is actually hidden

Two checks, run in the browser. Written **before** the client was wired to
`dune-action`, so the first one is known to be capable of failing — a privacy
check that has only ever passed has not been shown to catch anything.

---

## Check 1 — is another seat's spice reachable from this client?

Switch the viewed seat and count network activity. If another seat's number
renders without a request, it was already here.

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const sel = document.querySelector('select');
  const setSeat = v => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(sel, v);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };
  let requests = 0;
  const origFetch = window.fetch;
  window.fetch = (...a) => { requests++; return origFetch(...a); };

  setSeat('p5'); await sleep(200);
  const p5 = document.body.innerText.match(/holds (\d+) spice/)?.[1];
  setSeat('p1'); await sleep(200);
  window.fetch = origFetch;

  return JSON.stringify({ p5RendersAs: p5, networkRequestsDuringSwitch: requests });
})()
```

**Result before wiring (recorded 2026-08-18):**

```
{"p5RendersAs":"7","networkRequestsDuringSwitch":0}
```

FAIL, as intended. p5's spice rendered with no request, so it was already in the
client — present and merely unrendered, which is the thing being fixed.

**After wiring this must show** `p5RendersAs: null` (or the control absent), and
any switch that shows another seat's number is a regression regardless of how it
got there.

---

## Check 2 — is it on the wire?

Check 1 catches spice held locally. It does **not** catch spice that arrives over
the socket and is simply not displayed — for that, read the frames.

Install before subscribing, because a changefeed only reports what happens after
you are listening:

```js
window.__frames = [];
const OrigWS = window.WebSocket;
window.WebSocket = function (...a) {
  const ws = new OrigWS(...a);
  ws.addEventListener('message', e => window.__frames.push(String(e.data)));
  return ws;
};
window.WebSocket.prototype = OrigWS.prototype;
```

Then, after seeding p1 at 0 and p5 at 7 and subscribing as p1:

```js
window.__frames.filter(f => /"spice"/.test(f)).map(f => f.slice(0, 400))
```

Every frame containing spice must belong to p1. A frame carrying p5 means RLS is
not filtering the changefeed, and no amount of client-side handling fixes it.

**Not yet runnable.** Nothing subscribes to `match_secrets`, so there are no
frames to inspect — `secretsSync` exists but has no caller. This check cannot
fail today for the same reason it cannot pass: there is no wire. It becomes
meaningful at the same moment the wiring does.

---

## Why both

They fail differently, and passing one proves nothing about the other.

Check 1 catches the current design, where the browser simulates the boundary and
holds every seat's spice. Check 2 catches the design that replaces it, where the
server holds the secrets and the only question is what crosses the socket.

The trap is running check 1 after wiring, watching it pass, and concluding spice
is private — when all that shows is that this client no longer keeps a local
copy. What reaches it is a separate question, and only the frames answer it.
