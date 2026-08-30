export interface Quote {
  text: string;
  author: string;
}

/** Short, calm lines about writing and practice. Kept brief and attributed. */
export const QUOTES: Quote[] = [
  { text: 'A word after a word after a word is power.', author: 'Margaret Atwood' },
  { text: 'Fill your paper with the breathings of your heart.', author: 'William Wordsworth' },
  { text: 'The scariest moment is always just before you start.', author: 'Stephen King' },
  { text: 'Write it. Shoot it. Publish it. Crochet it. Whatever. Make.', author: 'Joss Whedon' },
  { text: 'Start writing, no matter what. The water does not flow until the faucet is turned on.', author: 'Louis L’Amour' },
  { text: 'I write to find out what I think.', author: 'Joan Didion' },
  { text: 'There is no greater agony than bearing an untold story inside you.', author: 'Maya Angelou' },
  { text: 'The first draft is just you telling yourself the story.', author: 'Terry Pratchett' },
  { text: 'You can always edit a bad page. You cannot edit a blank page.', author: 'Jodi Picoult' },
  { text: 'Ideas are like rabbits. You get a couple and learn how to handle them.', author: 'John Steinbeck' },
  { text: 'Writing is thinking on paper.', author: 'William Zinsser' },
  { text: 'Get it down. Take chances. It may be bad, but it is the only way you can do anything really good.', author: 'William Faulkner' },
  { text: 'How vain it is to sit down to write when you have not stood up to live.', author: 'Henry David Thoreau' },
  { text: 'The desire to write grows with writing.', author: 'Erasmus' },
  { text: 'Nothing you write, if you hope to be any good, will ever come out as you first hoped.', author: 'Lillian Hellman' },
  { text: 'A professional writer is an amateur who did not quit.', author: 'Richard Bach' },
  { text: 'What is written without effort is in general read without pleasure.', author: 'Samuel Johnson' },
  { text: 'Either write something worth reading or do something worth writing.', author: 'Benjamin Franklin' },
  { text: 'The pen is the tongue of the mind.', author: 'Miguel de Cervantes' },
  { text: 'Read a thousand books, and your words will flow like a river.', author: 'Virginia Woolf' },
  { text: 'We write to taste life twice, in the moment and in retrospect.', author: 'Anaïs Nin' },
  { text: 'Substitute “damn” every time you are inclined to write “very”.', author: 'Mark Twain' },
  { text: 'Tell me, what is it you plan to do with your one wild and precious life?', author: 'Mary Oliver' },
  { text: 'Do not tell me the moon is shining; show me the glint of light on broken glass.', author: 'Anton Chekhov' },
  { text: 'Keep a notebook. Travel with it, eat with it, sleep with it.', author: 'Jack London' },
  { text: 'The most valuable of all talents is that of never using two words when one will do.', author: 'Thomas Jefferson' },
  { text: 'Not that the story need be long, but it will take a long while to make it short.', author: 'Henry David Thoreau' },
  { text: 'Words are, of course, the most powerful drug used by mankind.', author: 'Rudyard Kipling' },
  { text: 'To produce a mighty book, you must choose a mighty theme.', author: 'Herman Melville' },
  { text: 'Let me live, love, and say it well in good sentences.', author: 'Sylvia Plath' },
  { text: 'Order and simplification are the first steps toward mastery of a subject.', author: 'Thomas Mann' },
];

/**
 * One quote per calendar day, chosen deterministically from the date so it stays
 * stable across reloads and across devices — a quote that reshuffled on every
 * render would read as noise rather than as a considered opening.
 */
export function quoteForDay(day: Date = new Date()): Quote {
  const key = day.getFullYear() * 10000 + (day.getMonth() + 1) * 100 + day.getDate();
  // Knuth multiplicative hash, so consecutive days are not adjacent entries.
  const index = Math.abs(Math.imul(key, 2654435761)) % QUOTES.length;
  return QUOTES[index];
}
