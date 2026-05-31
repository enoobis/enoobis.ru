import { api } from "./http";

export type LeaderboardEntry = {
  rank: number;
  id: string;
  nickname: string;
  avatar_url: string;
  coins: number;
};

export function listLeaderboard(token: string, limit = 50) {
  return api<LeaderboardEntry[]>(`/api/leaderboard?limit=${limit}`, { token });
}
