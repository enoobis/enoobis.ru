export type VoteValue = 1 | -1 | null;

export interface VoteState {
  my_vote: VoteValue;
  up_count: number;
  down_count: number;
}

/** повторный тап по тому же голосу снимает его — как в applyVote на бэкенде */
export function nextVoteState(state: VoteState, vote: 1 | -1): VoteState {
  const { my_vote, up_count, down_count } = state;

  if (my_vote === vote) {
    return {
      my_vote: null,
      up_count: vote === 1 ? Math.max(0, up_count - 1) : up_count,
      down_count: vote === -1 ? Math.max(0, down_count - 1) : down_count,
    };
  }

  return {
    my_vote: vote,
    up_count:
      vote === 1 ? up_count + 1 : my_vote === 1 ? Math.max(0, up_count - 1) : up_count,
    down_count:
      vote === -1 ? down_count + 1 : my_vote === -1 ? Math.max(0, down_count - 1) : down_count,
  };
}
