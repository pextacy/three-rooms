/**
 * Where the randomness enters THE BROKERS.
 *
 * One VRF word per price named — the house's opening price, and one for each
 * broker asked. The word for a broker's price is requested BY the action that
 * asks him, so it does not exist while the player is deciding whether to pay his
 * fee (claude.md I4). There is nothing else to hide: unlike THE SURVEY, no state
 * is concealed here at all. What a broker will say is simply not yet drawn.
 *
 * Draws are uniform on [0, WEIGHT_DENOM) by **rejection sampling** over 16-bit
 * windows, exactly as `shared/rng.ts` and both other games do it. `word % n` is
 * biased and is not used anywhere.
 */
import { HOUSE, priceForDraw, brokerById, type BrokerId } from './market';
import { draw, type Rehash, type Word } from '../../../shared/rng';

/** The house's man looks first, for nothing. His price opens the round. */
export function drawHousePrice(word: Word, cursor: number, rehash: Rehash): { priceBp: number; cursor: number; word: Word } {
  const result = draw(word, cursor, rehash);
  return { priceBp: priceForDraw(HOUSE, result.value), cursor: result.cursor, word: result.word };
}

/** What a broker names, from the word his fee bought. */
export function drawQuote(
  id: BrokerId,
  word: Word,
  cursor: number,
  rehash: Rehash,
): { priceBp: number; cursor: number; word: Word } {
  const result = draw(word, cursor, rehash);
  return { priceBp: priceForDraw(brokerById(id).quotes, result.value), cursor: result.cursor, word: result.word };
}
