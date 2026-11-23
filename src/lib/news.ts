export interface NewsPost {
  id: string;
  date: string;
  displayDate: string;
  badge: string;
  title: string;
  paragraphs: string[];
  feedbackHandle: string;
}

export const NEWS_POSTS: NewsPost[] = [
  {
    id: "make-new-things-is-live",
    date: "2026-11-22",
    displayDate: "November 22, 2026",
    badge: "ALPHA UPDATE #2",
    title: "MAKE NEW THINGS IS LIVE!",
    paragraphs: [
      "The workshop doors are officially open! Every player can now head over to MAKE NEW THINGS to build custom collections of at least five completely unique, delightfully pointless things.",
      "Our step-by-step maker guides you through naming your collection, writing funny descriptions, flavor quotes, and pointless RPG stats, and adding artwork—either by uploading your own 512×512px PNG sticker cutouts and pixel art, or by painting a sprite right in Give a Thing's standard 16-bit style.",
      "Every thing you create has its genesis record stored directly in your own ATmosphere Personal Data Server (PDS), so your creator mark travels with it forever and you can revoke a thing you made at any time. Once published, your collection appears on your profile as a Mystery Box: keep it free for other players to unwrap once a day, or connect payouts with Stripe to charge whatever price per pull you choose!",
    ],
    feedbackHandle: "giveathing.com",
  },
  {
    id: "a-thing-is-born",
    date: "2026-11-22",
    displayDate: "November 22, 2026",
    badge: "ALPHA UPDATE #1",
    title: "A THING IS BORN",
    paragraphs: [
      "Welcome to Give a Thing! Right now the game is barely put together—we just turned the lights on, stacked the mystery parcels, and opened the doors so everyone can start pulling weird daily things and tossing them at friends for no reason at all.",
      "We are wide open to ideas on how to make Give a Thing more fun, funnier, cuter, and better! If you spot a rough edge, dream up a feature, or think of a hilarious category of things we should add, send us a message or mention @giveathing.com on Bluesky with your thoughts and ideas.",
    ],
    feedbackHandle: "giveathing.com",
  },
];
