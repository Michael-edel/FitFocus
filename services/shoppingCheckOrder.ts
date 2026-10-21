import { ingredientKey } from '../shoppingIngredients';

type ShoppingCheckTarget = {
  accountId: string;
  familyId: string | null;
  weekStart: string;
  ingredientName: string;
};

const tails = new Map<string, Promise<void>>();

/** Keep writes to the same persisted checkmark in user-intent order within this browser. */
export function runShoppingCheckInOrder<T>(target: ShoppingCheckTarget, write: () => Promise<T>): Promise<T> {
  const key = JSON.stringify([target.accountId, target.familyId, target.weekStart, ingredientKey(target.ingredientName)]);
  const previous = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => {}).then(() => turn);
  tails.set(key, tail);

  return (async () => {
    await previous.catch(() => {});
    try {
      return await write();
    } finally {
      release();
      if (tails.get(key) === tail) tails.delete(key);
    }
  })();
}
