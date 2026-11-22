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
